import type {
  ChainConfig,
  ChainMarket,
  ChainMarketsResponse,
  ChainStatus,
} from "@workspace/api-client-react";

export type { ChainConfig, ChainMarket as IndexedMarket, ChainMarketsResponse as MarketsResponse, ChainStatus };

const PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function publicKey(value: unknown, field: string): string {
  if (typeof value !== "string" || !PUBLIC_KEY.test(value)) {
    throw new Error(`Solana API returned an invalid ${field}.`);
  }
  return value;
}

function optionalPublicKey(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  return publicKey(value, field);
}

function parseConfig(value: unknown): ChainConfig {
  if (!isRecord(value) || typeof value.enabled !== "boolean") throw new Error("Solana config response is malformed.");
  if (value.cluster !== undefined && value.cluster !== "devnet" && value.cluster !== "mainnet-beta") {
    throw new Error("Solana config returned an invalid cluster.");
  }
  if (value.programId !== undefined) publicKey(value.programId, "LaunchLab program");
  if (value.cpmmProgramId !== undefined) publicKey(value.cpmmProgramId, "CPMM program");
  if (value.platformPda !== undefined) publicKey(value.platformPda, "Platform PDA");
  return value as unknown as ChainConfig;
}

function parseMarket(value: unknown): ChainMarket {
  if (!isRecord(value)) throw new Error("Solana launches response contains an invalid projection.");
  for (const field of ["programId", "launchState"] as const) publicKey(value[field], field);
  for (const field of [
    "baseMint", "quoteMint", "creator", "platform", "baseVault", "quoteVault",
    "mintAuthority", "freezeAuthority", "cpmmPool",
  ] as const) optionalPublicKey(value[field], field);
  if (
    (value.cluster !== "devnet" && value.cluster !== "mainnet-beta") ||
    typeof value.status !== "string" ||
    typeof value.observedSlot !== "number" ||
    (value.observedSignature !== null && value.observedSignature !== undefined && typeof value.observedSignature !== "string") ||
    typeof value.accountHash !== "string" ||
    typeof value.decoded !== "boolean"
  ) throw new Error(`Solana API returned malformed launch ${String(value.launchState)}.`);
  return value as unknown as ChainMarket;
}

async function fetchJson<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store" });
  } catch {
    throw new Error(`Unable to reach ${path}. The Solana indexer API is unavailable.`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && typeof body.error === "string"
      ? body.error
      : `Request failed with HTTP ${response.status}.`;
    throw new Error(error);
  }
  return parse(body);
}

export function fetchChainConfig(): Promise<ChainConfig> {
  return fetchJson("/api/chain/config", parseConfig);
}

export function fetchChainMarkets(): Promise<ChainMarketsResponse> {
  return fetchJson("/api/chain/markets", (value) => {
    if (!isRecord(value) || !Array.isArray(value.markets)) throw new Error("Solana launches response is malformed.");
    if (value.programId !== undefined) publicKey(value.programId, "response program");
    return { ...value, markets: value.markets.map(parseMarket) } as ChainMarketsResponse;
  });
}

export function fetchChainStatus(): Promise<ChainStatus> {
  return fetchJson("/api/chain/status", (value) => {
    if (!isRecord(value) || typeof value.enabled !== "boolean") throw new Error("Solana status response is malformed.");
    if (value.programId !== undefined) publicKey(value.programId, "status program");
    if (value.cpmmProgramId !== undefined) publicKey(value.cpmmProgramId, "status CPMM program");
    return value as unknown as ChainStatus;
  });
}