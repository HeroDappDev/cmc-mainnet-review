import { NextResponse } from "next/server";
import {
  buildMainnetReleaseDraft,
  type MainnetReleaseDraftResult,
} from "@/lib/mainnet-release";
import {
  getSolanaConfig,
  verifySolanaReadiness,
  type SolanaChainStateBaseline,
  type SolanaReadiness,
  type SolanaRpc,
} from "@/lib/solana-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRpcResponse = {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

function rpcResult(body: JsonRpcResponse, id: number): unknown {
  if (body.error || body.id !== id) throw new Error("Invalid Solana RPC response.");
  return body.result;
}

async function verifyMainnetReadiness(
  config: ReturnType<typeof getSolanaConfig>,
  now: Date,
): Promise<SolanaReadiness> {
  // config.rpcUrl remains inside this server-only closure. It is never put in
  // the response or interpolated into an error.
  const rpc: SolanaRpc = async (method, params) => {
    if (!config.rpcUrl) throw new Error("RPC is not configured.");
    const id = method === "getGenesisHash" ? 1 : 2;
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Solana RPC unavailable.");
    return rpcResult(await response.json() as JsonRpcResponse, id);
  };
  return verifySolanaReadiness(config, rpc, now);
}

export async function GET() {
  const now = new Date();
  const config = getSolanaConfig(process.env, "mainnet-beta");
  let readiness: SolanaReadiness | undefined;
  let readinessBlockers: string[] = [];

  try {
    readiness = await verifyMainnetReadiness(config, now);
    // The absent signed record is expected while constructing this draft.
    // Every other readiness blocker, including a live chain-baseline drift,
    // must prevent a signable payload.
    readinessBlockers = readiness.blockers.filter(
      (blocker) => blocker !== "A signed mainnet release record is not configured.",
    );
  } catch {
    readinessBlockers = ["The Solana mainnet readiness check failed closed."];
  }

  const liveBaseline: SolanaChainStateBaseline | undefined = readiness?.chainStateFingerprint
    && readiness.programs.launchLab.programDataAddress
    && readiness.programs.launchLab.codeHash
    && readiness.programs.launchLab.programDataSlot !== undefined
    && readiness.programs.launchLab.upgradeAuthority
    && readiness.programs.cpmm.programDataAddress
    && readiness.programs.cpmm.codeHash
    && readiness.programs.cpmm.programDataSlot !== undefined
    && readiness.programs.cpmm.upgradeAuthority
    ? {
        chainStateFingerprint: readiness.chainStateFingerprint,
        launchLab: {
          programDataAddress: readiness.programs.launchLab.programDataAddress,
          codeFingerprint: readiness.programs.launchLab.codeHash,
          deployedSlot: readiness.programs.launchLab.programDataSlot,
          upgradeAuthority: readiness.programs.launchLab.upgradeAuthority,
        },
        cpmm: {
          programDataAddress: readiness.programs.cpmm.programDataAddress,
          codeFingerprint: readiness.programs.cpmm.codeHash,
          deployedSlot: readiness.programs.cpmm.programDataSlot,
          upgradeAuthority: readiness.programs.cpmm.upgradeAuthority,
        },
      }
    : undefined;
  const draftResult: MainnetReleaseDraftResult = buildMainnetReleaseDraft({
    ...config,
    chainStateBaseline: liveBaseline ?? config.chainStateBaseline,
  }, now);
  const allowedDraftBlockers = new Set([
    "An explicit mainnet release flag is not enabled.",
    "Explicit mainnet real-funds release authorization is not recorded.",
    "A signed mainnet release record is not configured.",
    "The reviewed mainnet chain-state baseline is not configured.",
  ]);
  const blockers = [...new Set([
    ...draftResult.blockers,
    ...readinessBlockers.filter((blocker) => !allowedDraftBlockers.has(blocker)),
  ])];
  if (blockers.length > 0 || !readiness?.networkReady) {
    return NextResponse.json(
      {
        draft: null,
        canonicalMessage: null,
        messageFingerprintSha256: null,
        blockers: blockers.length > 0 ? blockers : ["Finalized Solana/Raydium read verification is incomplete."],
        ...(readiness ? { readiness } : {}),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      draft: draftResult.draft,
      canonicalMessage: draftResult.canonicalMessage,
      messageFingerprintSha256: draftResult.messageFingerprintSha256,
      blockers: [],
      readiness,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}