import { NextRequest, NextResponse } from "next/server";
import {
  getSolanaConfig,
  toPublicSolanaConfig,
  verifySolanaReadiness,
  type SolanaCluster,
} from "@/lib/solana-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRpcResponse = {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

function safeRpcError(body: JsonRpcResponse, id: number): never | unknown {
  if (body.error || body.id !== id) throw new Error("Invalid Solana RPC response.");
  return body.result;
}

async function checkNetwork(cluster: SolanaCluster) {
  const config = getSolanaConfig(process.env, cluster);
  const publicConfig = toPublicSolanaConfig(config);
  const publicRpc = async (method: string, params: unknown[]) => {
    // config.rpcUrl is deliberately scoped to this server-side closure and is
    // never copied into either response or an error message.
    if (!config.rpcUrl) throw new Error("RPC is not configured.");
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method === "getGenesisHash" ? 1 : 2, method, params }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Solana RPC unavailable.");
    const body = await response.json() as JsonRpcResponse;
    return safeRpcError(body, method === "getGenesisHash" ? 1 : 2);
  };

  try {
    const readiness = await verifySolanaReadiness(config, publicRpc);
    return { config: publicConfig, readiness };
  } catch {
    return {
      config: publicConfig,
      readiness: {
        cluster,
        connected: false,
        genesisVerified: false,
        programs: {
          launchLab: { id: config.launchLabProgramId ?? "", validIdentifier: false, accountFound: false, executable: false, ownerVerified: false },
          cpmm: { id: config.cpmmProgramId ?? "", validIdentifier: false, accountFound: false, executable: false, ownerVerified: false },
        },
        platform: {
          id: config.platformPda ?? "",
          validIdentifier: false,
          accountFound: false,
          derivationVerified: false,
          ownerVerified: false,
          treasuryAuthorityVerified: false,
          lpAuthorityVerified: false,
          feeDestinationVerified: false,
          discriminatorVerified: false,
          dataLengthVerified: false,
        },
        authorities: {
          treasury: { id: config.treasuryAuthority ?? "", validIdentifier: false, accountFound: false },
          lp: { id: config.lpAuthority ?? "", validIdentifier: false, accountFound: false },
          feeDestination: { id: config.platformFeeDestination ?? "", validIdentifier: false, accountFound: false },
        },
        releaseRecord: {
          present: false,
          signaturesValid: false,
          configMatch: false,
          valid: false,
          blockers: ["The Solana readiness check failed closed."],
        },
        networkReady: false,
        activationEligible: false,
        activation: "not-eligible" as const,
        blockers: ["The Solana readiness check failed closed."],
        quoteAsset: {
          symbol: "SOL",
          native: "SOL",
          wrapped: "WSOL",
          description: "Native SOL, represented as WSOL where an SPL token account is required.",
        },
        checkedAt: new Date().toISOString(),
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("cluster") ?? process.env.SOLANA_CLUSTER ?? "devnet";
  if (requested !== "devnet" && requested !== "mainnet-beta") {
    return NextResponse.json(
      { error: "Solana cluster must be devnet or mainnet-beta." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await checkNetwork(requested);
  // HTTP status reports whether the selected network and pinned program
  // accounts were verified. Mainnet activation is a separate, explicit field.
  const status = result.readiness.networkReady ? 200 : 503;
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}