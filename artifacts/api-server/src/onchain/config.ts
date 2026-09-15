import type { SolanaCluster } from "./types";

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_LAG_WARNING_SLOTS = 150;
const DEFAULT_LAG_CRITICAL_SLOTS = 600;
const DEFAULT_RPC_GAP_ALERT_COUNT = 3;
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;

const PROGRAMS = {
  devnet: {
    genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    launchLab: "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6",
    cpmm: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  },
  "mainnet-beta": {
    genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    launchLab: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    cpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  },
} as const;

export interface IndexerConfig {
  enabled: boolean;
  reason?: string;
  cluster?: SolanaCluster;
  expectedGenesisHash?: string;
  programId?: string;
  cpmmProgramId?: string;
  platformPda?: string;
  startSlot?: number;
  rpcUrl?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  lagWarningSlots?: number;
  lagCriticalSlots?: number;
  rpcGapAlertCount?: number;
  operationTimeoutMs?: number;
  stallAlertMs?: number;
}

function integer(value: string | undefined, name: string, fallback?: number): number | undefined {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return Number(value);
}

function pubkey(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    throw new Error(`${name} must be a Solana base58 public key`);
  }
  return value;
}

export function loadIndexerConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  if (env.SOLANA_INDEXER_ENABLED !== "true") {
    return {
      enabled: false,
      reason: "Solana indexing is disabled. Set SOLANA_INDEXER_ENABLED=true only with reviewed finalized RPC and deployment settings.",
    };
  }
  try {
    const cluster = (env.SOLANA_CLUSTER ?? "devnet") as SolanaCluster;
    if (cluster !== "devnet" && cluster !== "mainnet-beta") throw new Error("SOLANA_CLUSTER must be devnet or mainnet-beta");
    if (cluster !== "devnet") throw new Error("Mainnet Solana indexing is not enabled");
    const expected = PROGRAMS[cluster];
    const programId = pubkey(env.SOLANA_LAUNCHLAB_PROGRAM_ID ?? expected.launchLab, "SOLANA_LAUNCHLAB_PROGRAM_ID")!;
    const cpmmProgramId = pubkey(env.SOLANA_CPMM_PROGRAM_ID ?? expected.cpmm, "SOLANA_CPMM_PROGRAM_ID")!;
    if (programId !== expected.launchLab || cpmmProgramId !== expected.cpmm) {
      throw new Error(`Program IDs do not match the pinned Raydium ${cluster} deployment`);
    }
    const startSlot = integer(env.SOLANA_DEPLOYMENT_SLOT, "SOLANA_DEPLOYMENT_SLOT");
    if (startSlot === undefined) throw new Error("SOLANA_DEPLOYMENT_SLOT is required");
    const pollIntervalMs = integer(env.SOLANA_POLL_INTERVAL_MS, "SOLANA_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS)!;
    const batchSize = integer(env.SOLANA_BATCH_SIZE, "SOLANA_BATCH_SIZE", DEFAULT_BATCH_SIZE)!;
    const lagWarningSlots = integer(env.SOLANA_INDEXER_LAG_WARNING_SLOTS, "SOLANA_INDEXER_LAG_WARNING_SLOTS", DEFAULT_LAG_WARNING_SLOTS)!;
    const lagCriticalSlots = integer(env.SOLANA_INDEXER_LAG_CRITICAL_SLOTS, "SOLANA_INDEXER_LAG_CRITICAL_SLOTS", DEFAULT_LAG_CRITICAL_SLOTS)!;
    const rpcGapAlertCount = integer(env.SOLANA_INDEXER_RPC_GAP_ALERT_COUNT, "SOLANA_INDEXER_RPC_GAP_ALERT_COUNT", DEFAULT_RPC_GAP_ALERT_COUNT)!;
    const operationTimeoutMs = integer(env.SOLANA_INDEXER_OPERATION_TIMEOUT_MS, "SOLANA_INDEXER_OPERATION_TIMEOUT_MS", DEFAULT_OPERATION_TIMEOUT_MS)!;
    const stallAlertMs = integer(env.SOLANA_INDEXER_STALL_ALERT_MS, "SOLANA_INDEXER_STALL_ALERT_MS", Math.max(30_000, pollIntervalMs * 3))!;
    if (pollIntervalMs < 250) throw new Error("SOLANA_POLL_INTERVAL_MS must be at least 250ms");
    if (batchSize < 1 || batchSize > 1_000) throw new Error("SOLANA_BATCH_SIZE must be between 1 and 1000");
    if (lagWarningSlots < 1 || lagCriticalSlots <= lagWarningSlots) {
      throw new Error("SOLANA indexer critical lag threshold must be greater than the positive warning threshold");
    }
    if (rpcGapAlertCount < 1) throw new Error("SOLANA_INDEXER_RPC_GAP_ALERT_COUNT must be at least 1");
    if (operationTimeoutMs < 250) throw new Error("SOLANA_INDEXER_OPERATION_TIMEOUT_MS must be at least 250ms");
    if (stallAlertMs < pollIntervalMs) throw new Error("SOLANA_INDEXER_STALL_ALERT_MS must be at least the poll interval");
    const rpcUrl = cluster === "devnet"
      ? env.SOLANA_DEVNET_RPC_URL ?? env.SOLANA_RPC_URL
      : env.SOLANA_MAINNET_RPC_URL ?? env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error(
        `${cluster === "devnet" ? "SOLANA_DEVNET_RPC_URL" : "SOLANA_MAINNET_RPC_URL"} is required`,
      );
    }
    return {
      enabled: true,
      cluster,
      expectedGenesisHash: expected.genesisHash,
      programId,
      cpmmProgramId,
      platformPda: pubkey(env.SOLANA_PLATFORM_PDA, "SOLANA_PLATFORM_PDA"),
      startSlot,
      rpcUrl,
      pollIntervalMs,
      batchSize,
      lagWarningSlots,
      lagCriticalSlots,
      rpcGapAlertCount,
      operationTimeoutMs,
      stallAlertMs,
    };
  } catch (error) {
    return { enabled: false, reason: error instanceof Error ? error.message : "Invalid Solana indexer configuration" };
  }
}

export function publicIndexerConfig(
  config: IndexerConfig,
): Omit<IndexerConfig, "rpcUrl" | "pollIntervalMs" | "batchSize" | "expectedGenesisHash" | "lagWarningSlots" | "lagCriticalSlots" | "rpcGapAlertCount" | "operationTimeoutMs" | "stallAlertMs"> {
  const {
    rpcUrl: _rpc,
    pollIntervalMs: _poll,
    batchSize: _batch,
    expectedGenesisHash: _genesis,
    lagWarningSlots: _lagWarning,
    lagCriticalSlots: _lagCritical,
    rpcGapAlertCount: _rpcGaps,
    operationTimeoutMs: _timeout,
    stallAlertMs: _stall,
    ...result
  } = config;
  return result;
}