export type SolanaCluster = "devnet" | "mainnet-beta";
export type AccountRole = "launchState" | "platform" | "vault" | "mint" | "cpmmPool" | "unknown";
export type InstructionKind = "launch" | "trade" | "migration" | "cpmm" | "token";

export interface TrackedAccount {
  pubkey: string;
  expectedRole: Exclude<AccountRole, "unknown">;
  expectedOwner?: string;
}

export interface SolanaNamespace {
  cluster: SolanaCluster;
  programId: string;
}

export interface FinalizedInstruction {
  programId: string;
  instructionIndex: number;
  innerInstructionIndex: number;
  accounts: string[];
  data: string;
  kind: InstructionKind;
  payload: Record<string, unknown>;
}

export interface FinalizedTransaction {
  signature: string;
  slot: number;
  blockhash: string;
  blockTime: number | null;
  success: boolean;
  instructions: FinalizedInstruction[];
  raw: Record<string, unknown>;
}

export interface AccountSnapshot {
  pubkey: string;
  slot: number;
  signature?: string | null;
  owner: string;
  lamports: string;
  executable: boolean;
  dataBase64: string;
  dataHash: string;
  role: AccountRole;
  decoded?: Record<string, unknown>;
}

export interface SolanaCheckpoint {
  lastFinalizedSlot: number;
  scannedThroughSlot?: number | null;
  oldestSignature?: string | null;
  newestSignature?: string | null;
  backfillComplete: boolean;
}

export interface SolanaChunk {
  transactions: FinalizedTransaction[];
  accounts: AccountSnapshot[];
  checkpoint: SolanaCheckpoint;
}

export interface ProjectedLaunch {
  cluster: SolanaCluster;
  programId: string;
  launchState: string;
  baseMint?: string | null;
  quoteMint?: string | null;
  creator?: string | null;
  platform?: string | null;
  baseVault?: string | null;
  quoteVault?: string | null;
  status: string;
  virtualBase?: string | null;
  virtualQuote?: string | null;
  realBase?: string | null;
  realQuote?: string | null;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  mintSupply?: string | null;
  cpmmPool?: string | null;
  observedSlot: number;
  observedSignature?: string | null;
  accountHash: string;
  decoded: boolean;
}

export interface ProjectedTrade {
  cluster: SolanaCluster;
  programId: string;
  signature: string;
  instructionIndex: number;
  innerInstructionIndex: number;
  slot: number;
  launchState?: string | null;
  trader?: string | null;
  side: string;
  baseAmount?: string | null;
  quoteAmount?: string | null;
  feeAmount?: string | null;
}

export interface Reconciliation {
  entity: string;
  account: string;
  checkType: string;
  slot: number;
  signature?: string | null;
  actual: string;
  expected: string;
  delta?: string;
  healthy: boolean;
  details?: string;
}

export interface OperationalAlertEvent {
  deliveryKey: string;
  event: "active" | "recovered";
  notification: Record<string, unknown>;
}

export interface OperationalAlertDelivery {
  cluster: SolanaCluster;
  programId: string;
  code: IndexerAlert["code"];
  deliveryKey: string;
  notification: Record<string, unknown>;
  attempts: number;
}

export interface LockedSolanaStore {
  getCheckpoint(namespace: SolanaNamespace): Promise<SolanaCheckpoint | null>;
  atomicChunk(namespace: SolanaNamespace, chunk: SolanaChunk): Promise<void>;
  atomicPass(chunks: Array<{ namespace: SolanaNamespace; chunk: SolanaChunk }>): Promise<void>;
  listLaunches(namespace: SolanaNamespace): Promise<ProjectedLaunch[]>;
  getLaunch(namespace: SolanaNamespace, launchState: string): Promise<ProjectedLaunch | null>;
  listTrades(namespace: SolanaNamespace, launchState: string, limit?: number): Promise<ProjectedTrade[]>;
  listTrackedAccounts(namespace: SolanaNamespace): Promise<TrackedAccount[]>;
  recordReconciliation(namespace: SolanaNamespace, reconciliation: Reconciliation): Promise<void>;
  markScanComplete(namespaces: SolanaNamespace[], scannedThroughSlot: number): Promise<void>;
}

export interface SolanaStore extends LockedSolanaStore {
  withNamespaceLock(
    namespace: SolanaNamespace,
    callback: (store: LockedSolanaStore) => Promise<void>,
  ): Promise<void>;
  recordOperationalAlerts?(
    namespace: SolanaNamespace,
    activeAlerts: IndexerAlert[],
    events: OperationalAlertEvent[],
  ): Promise<void>;
  listActiveOperationalAlerts?(
    namespace: SolanaNamespace,
  ): Promise<IndexerAlert[]>;
  listPendingOperationalAlertDeliveries?(
    namespace: SolanaNamespace,
    limit?: number,
  ): Promise<OperationalAlertDelivery[]>;
  markOperationalAlertDelivery?(
    delivery: OperationalAlertDelivery,
    delivered: boolean,
    error?: string,
  ): Promise<void>;
}

export interface SolanaReader {
  verifyCluster(expectedGenesisHash: string): Promise<void>;
  getFinalizedSlot(): Promise<number>;
  getTransactions(
    programId: string,
    checkpoint: SolanaCheckpoint,
    limit: number,
    startSlot: number,
    finalizedThroughSlot?: number,
  ): Promise<{ transactions: FinalizedTransaction[]; backfillComplete: boolean }>;
  getAccountSnapshots(
    transactions: FinalizedTransaction[],
    config: { programId: string; cpmmProgramId: string; platformPda?: string },
    trackedAccounts?: TrackedAccount[],
    finalizedThroughSlot?: number,
  ): Promise<AccountSnapshot[]>;
}

export interface IndexerHealth {
  enabled: boolean;
  healthy: boolean;
  workerRunning: boolean;
  cluster?: SolanaCluster;
  programId?: string;
  cpmmProgramId?: string;
  platformPda?: string;
  lastFinalizedSlot?: number;
  indexedThroughSlot?: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  error?: string;
  rpcGapCount: number;
  reconciliationIssues: number;
  backfillInProgress: boolean;
  finalizedSlotLag: number;
  alertStatus: "ok" | "warning" | "critical";
  activeAlerts: IndexerAlert[];
}

export interface IndexerAlert {
  code: "FINALIZED_SLOT_LAG" | "REPEATED_RPC_GAPS" | "RECONCILIATION_FAILURE" | "TRACKED_ACCOUNT_MISMATCH" | "WORKER_STALLED";
  severity: "warning" | "critical";
  message: string;
  action: string;
  observedValue: number;
  threshold: number;
  firstObservedAt: string;
  lastObservedAt: string;
}