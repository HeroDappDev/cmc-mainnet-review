import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadIndexerConfig, type IndexerConfig } from "./config";
import { SolanaRpcReader } from "./chain-reader";
import { OnchainIndexer } from "./indexer";
import type {
  AccountSnapshot,
  FinalizedTransaction,
  IndexerAlert,
  OperationalAlertEvent,
  IndexerHealth,
  LockedSolanaStore,
  ProjectedLaunch,
  ProjectedTrade,
  Reconciliation,
  SolanaCheckpoint,
  SolanaChunk,
  SolanaNamespace,
  SolanaReader,
  SolanaStore,
  TrackedAccount,
} from "./types";

const PROGRAM = "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6";
const CPMM = "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb";
const LAUNCH = "8YkR8h8fPVQ9dNPxSRzVTQkt4VCCpTCrr68rhnXtPq6N";
const SIGNATURE = "4".repeat(64);
const FINALIZED_DEVNET_LAUNCHLAB_FIXTURE = {
  pubkey: "124G11951t1qkyQyg8D9P8NDjf7rLgxuWJ3fjwQhF6n",
  slot: 497892812,
  dataBase64: "9+3j9dfD3kZKBAAAAAAAAP8ABgkBAIDGpH6NAwAAeMX7UdECAN50Dj7pzwMA168w/AYAAADHXJDqOwMAABIP8gUAAAAAABJlyhMAAACK0QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYXPsC2Fbv85DLyjlLwIHiWRM57T8QJhRfPGpwQwcBn0BSAYAOjClGGzIF+DDZvsaA3fNFbnVonD1/427h9t4B2KyxgTYBV0B0YqOcYrHdUVjdriLE6SFC0jeyW2Ag0S4BpuIV/6rgYT7aH9jRhjANdrEOdwa6ztVmKDwAAAAAAHauf0kLM3h2+8ntpuk889vyjUtHfrk0Oxr6LLyhKlcFftspV7Aa8CpG4IO3k+79aDZ4y4FQp/AddUC8d8kjD34HJ10q0ZcCa14bGVsg6wAVqTAt/LoKOV9X44Fhx1EsssAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  baseMint: "7eH4dXBT9uFz1NkZDXSNyh2jgtHBNKZ1gpujeC5Wpk8o",
  quoteMint: "So11111111111111111111111111111111111111112",
  baseVault: "FipNKY4KahDXzoMZ2EUAcDqmvkpPD3gKTm3vDbdanK7S",
  quoteVault: "HvTRKABbX1cxSjTkPLo45p6gCE1kPxVYy3HPTDk1CuYB",
} as const;

function encodeBase58(bytes: Buffer): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let output = "";
  while (value > 0n) {
    output = alphabet[Number(value % 58n)]! + output;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output || "1";
}

function canonicalLaunchLabFixture() {
  const data = Buffer.alloc(429);
  createHash("sha256").update("account:PoolState").digest().copy(data, 0, 0, 8);
  data.writeBigUInt64LE(7n, 8);
  data[16] = 1;
  data[17] = 0;
  data[18] = 6;
  data[19] = 9;
  data[20] = 1;
  for (const [offset, value] of [
    [21, 1_000_000n],
    [29, 800_000n],
    [37, 1_000_000n],
    [45, 5_000n],
    [53, 100n],
    [61, 10n],
    [69, 80_000n],
  ] as const) data.writeBigUInt64LE(value, offset);
  const pubkeys = Array.from({ length: 7 }, (_, index) => {
    const bytes = Buffer.alloc(32, index + 1);
    bytes.copy(data, 141 + index * 32);
    return encodeBase58(bytes);
  });
  data[365] = 0;
  data[366] = 1;
  data.writeBigUInt64LE(50n, 367);
  return {
    data,
    configId: pubkeys[0]!,
    platform: pubkeys[1]!,
    baseMint: pubkeys[2]!,
    quoteMint: pubkeys[3]!,
    baseVault: pubkeys[4]!,
    quoteVault: pubkeys[5]!,
    creator: pubkeys[6]!,
  };
}

const config: IndexerConfig = {
  enabled: true,
  cluster: "devnet",
  expectedGenesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  programId: PROGRAM,
  cpmmProgramId: CPMM,
  startSlot: 100,
  rpcUrl: "https://rpc.invalid/private",
  batchSize: 100,
};

class FakeReader implements SolanaReader {
  genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  finalizedSlot = 120;
  transactions: FinalizedTransaction[] = [{
    signature: SIGNATURE,
    slot: 110,
    blockhash: "9".repeat(44),
    blockTime: 1_700_000_000,
    success: true,
    instructions: [{
      programId: PROGRAM,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [LAUNCH],
      data: "raw-launch-instruction",
      kind: "launch",
      payload: {},
    }],
    raw: { source: "finalized-rpc" },
  }];
  snapshots: AccountSnapshot[] = [{
    pubkey: LAUNCH,
    slot: 110,
    signature: SIGNATURE,
    owner: PROGRAM,
    lamports: "1000000",
    executable: false,
    dataBase64: "AQID",
    dataHash: "a".repeat(64),
    role: "launchState",
  }];

  async verifyCluster(expectedGenesisHash: string) {
    if (this.genesisHash !== expectedGenesisHash) {
      throw new Error(`Solana RPC genesis hash mismatch: expected ${expectedGenesisHash}, observed ${this.genesisHash}`);
    }
  }
  async getFinalizedSlot() { return this.finalizedSlot; }
  backfillComplete = true;
  cpmmBackfillComplete = true;
  cpmmTransactions: FinalizedTransaction[] = [];
  mintTransactions = new Map<string, FinalizedTransaction[]>();
  checkpoints: SolanaCheckpoint[] = [];
  trackedAccounts: TrackedAccount[] = [];
  async getTransactions(program: string, checkpoint: SolanaCheckpoint) {
    this.checkpoints.push({ ...checkpoint });
    if (program === CPMM) {
      return { transactions: this.cpmmTransactions, backfillComplete: this.cpmmBackfillComplete };
    }
    if (program !== PROGRAM) {
      return { transactions: this.mintTransactions.get(program) ?? [], backfillComplete: true };
    }
    return { transactions: this.transactions, backfillComplete: this.backfillComplete };
  }
  async getAccountSnapshots(
    _transactions: FinalizedTransaction[],
    _config: { programId: string; cpmmProgramId: string; platformPda?: string },
    trackedAccounts: TrackedAccount[] = [],
  ) {
    this.trackedAccounts = trackedAccounts;
    return this.snapshots;
  }
}

class FakeStore implements SolanaStore {
  checkpoint: SolanaCheckpoint | null = null;
  cpmmCheckpoint: SolanaCheckpoint = {
    lastFinalizedSlot: 99,
    oldestSignature: null,
    newestSignature: null,
    backfillComplete: true,
  };
  launches: ProjectedLaunch[] = [];
  reconciliations: Reconciliation[] = [];
  chunks: SolanaChunk[] = [];
  trackedAccounts: TrackedAccount[] = [];
  auxiliaryCheckpoints = new Map<string, SolanaCheckpoint>();
  auxiliaryChunks = new Map<string, SolanaChunk[]>();

  async withNamespaceLock(_namespace: SolanaNamespace, callback: (store: LockedSolanaStore) => Promise<void>) {
    await callback(this);
  }
  async getCheckpoint(namespace: SolanaNamespace) {
    if (namespace.programId === CPMM) return this.cpmmCheckpoint;
    if (namespace.programId.startsWith("mint:")) {
      return this.auxiliaryCheckpoints.get(namespace.programId) ?? null;
    }
    return this.checkpoint;
  }
  async atomicChunk(namespace: SolanaNamespace, chunk: SolanaChunk) {
    if (namespace.programId === CPMM) {
      this.cpmmCheckpoint = chunk.checkpoint;
      return;
    }
    if (namespace.programId.startsWith("mint:")) {
      this.auxiliaryCheckpoints.set(namespace.programId, chunk.checkpoint);
      const chunks = this.auxiliaryChunks.get(namespace.programId) ?? [];
      chunks.push(chunk);
      this.auxiliaryChunks.set(namespace.programId, chunks);
      return;
    }
    this.chunks.push(chunk);
    this.checkpoint = chunk.checkpoint;
    for (const account of chunk.accounts.filter((item) => item.role === "launchState")) {
      const baseMint = typeof account.decoded?.baseMint === "string" ? account.decoded.baseMint : null;
      if (baseMint && !this.trackedAccounts.some((tracked) => tracked.pubkey === baseMint)) {
        this.trackedAccounts.push({ pubkey: baseMint, expectedRole: "mint" });
      }
      this.launches = [{
        cluster: namespace.cluster,
        programId: namespace.programId,
        launchState: account.pubkey,
        status: "unknown",
        observedSlot: account.slot,
        observedSignature: account.signature,
        accountHash: account.dataHash,
        decoded: false,
      }];
    }
  }
  async atomicPass(chunks: Array<{ namespace: SolanaNamespace; chunk: SolanaChunk }>) {
    for (const { namespace, chunk } of chunks) await this.atomicChunk(namespace, chunk);
  }
  async listLaunches() { return this.launches; }
  async getLaunch(_namespace: SolanaNamespace, launchState: string) {
    return this.launches.find((launch) => launch.launchState === launchState) ?? null;
  }
  async listTrades(_namespace: SolanaNamespace, _launchState: string): Promise<ProjectedTrade[]> { return []; }
  async listTrackedAccounts() { return this.trackedAccounts; }
  async recordReconciliation(_namespace: SolanaNamespace, reconciliation: Reconciliation) {
    this.reconciliations.push(reconciliation);
  }
  async markScanComplete(namespaces: SolanaNamespace[], scannedThroughSlot: number) {
    for (const namespace of namespaces) {
      if (namespace.programId === CPMM) {
        this.cpmmCheckpoint.scannedThroughSlot = scannedThroughSlot;
      } else if (namespace.programId.startsWith("mint:")) {
        const checkpoint = this.auxiliaryCheckpoints.get(namespace.programId);
        if (checkpoint) checkpoint.scannedThroughSlot = scannedThroughSlot;
      } else if (this.checkpoint) {
        this.checkpoint.scannedThroughSlot = scannedThroughSlot;
      }
    }
  }
}

class AlertStateFakeStore extends FakeStore {
  readonly activeAlerts = new Map<IndexerAlert["code"], IndexerAlert>();
  readonly outbox = new Map<string, OperationalAlertEvent>();

  async listActiveOperationalAlerts(_namespace: SolanaNamespace): Promise<IndexerAlert[]> {
    return [...this.activeAlerts.values()].map((alert) => ({ ...alert }));
  }

  async recordOperationalAlerts(
    _namespace: SolanaNamespace,
    activeAlerts: IndexerAlert[],
    events: OperationalAlertEvent[],
  ): Promise<void> {
    for (const alert of activeAlerts) this.activeAlerts.set(alert.code, { ...alert });
    for (const event of events) {
      this.outbox.set(event.deliveryKey, event);
      if (event.event === "recovered") this.activeAlerts.delete(event.notification["code"] as IndexerAlert["code"]);
    }
  }
}

test("indexes only finalized Solana signatures and retains raw account audit evidence", async () => {
  const reader = new FakeReader();
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  indexer.stop();

  assert.equal(store.chunks.length, 1);
  assert.equal(store.chunks[0]?.transactions[0]?.signature, SIGNATURE);
  assert.equal(store.chunks[0]?.accounts[0]?.dataBase64, "AQID");
  assert.equal(store.checkpoint?.lastFinalizedSlot, 110);
  assert.equal((await indexer.getMarkets())[0]?.launchState, LAUNCH);
  assert.equal(indexer.getHealth().lastFinalizedSlot, 120);
  assert.equal(store.reconciliations[0]?.checkType, "finalized-account-snapshot");
});

test("refuses a transaction above the finalized head", async () => {
  const reader = new FakeReader();
  reader.finalizedSlot = 105;
  const indexer = new OnchainIndexer({ config, reader, store: new FakeStore() });
  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, false);
  assert.match(indexer.getHealth().error ?? "", /non-finalized slot 110/);
});

test("configuration rejects legacy or unpinned network identity", () => {
  const parsed = loadIndexerConfig({
    SOLANA_INDEXER_ENABLED: "true",
    SOLANA_CLUSTER: "devnet",
    SOLANA_LAUNCHLAB_PROGRAM_ID: "11111111111111111111111111111111",
    SOLANA_CPMM_PROGRAM_ID: CPMM,
    SOLANA_DEPLOYMENT_SLOT: "1",
    SOLANA_RPC_URL: "https://example.invalid",
  });
  assert.equal(parsed.enabled, false);
  assert.match(parsed.reason ?? "", /pinned Raydium devnet/);
});

test("enabled devnet configuration uses the canonical full genesis hash", () => {
  const parsed = loadIndexerConfig({
    SOLANA_INDEXER_ENABLED: "true",
    SOLANA_CLUSTER: "devnet",
    SOLANA_DEPLOYMENT_SLOT: "1",
    SOLANA_RPC_URL: "https://example.invalid",
  });
  assert.equal(parsed.enabled, true);
  assert.equal(
    parsed.expectedGenesisHash,
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  );
});

test("enabled devnet configuration prefers its dedicated RPC endpoint", () => {
  const parsed = loadIndexerConfig({
    SOLANA_INDEXER_ENABLED: "true",
    SOLANA_CLUSTER: "devnet",
    SOLANA_DEPLOYMENT_SLOT: "1",
    SOLANA_DEVNET_RPC_URL: "https://dedicated.example.invalid",
    SOLANA_RPC_URL: "https://legacy.example.invalid",
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.rpcUrl, "https://dedicated.example.invalid");
});

test("mainnet configuration remains a disabled release gate", () => {
  const parsed = loadIndexerConfig({
    SOLANA_INDEXER_ENABLED: "true",
    SOLANA_CLUSTER: "mainnet-beta",
    SOLANA_DEPLOYMENT_SLOT: "1",
    SOLANA_RPC_URL: "https://example.invalid",
  });
  assert.equal(parsed.enabled, false);
  assert.match(parsed.reason ?? "", /Mainnet Solana indexing is not enabled/);
});

test("wrong-cluster RPC identity fails before an empty history can advance checkpoints", async () => {
  const reader = new FakeReader();
  reader.genesisHash = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
  reader.transactions = [];
  reader.snapshots = [];
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(store.chunks.length, 0);
  assert.equal(store.checkpoint, null);
  assert.equal(indexer.getHealth().healthy, false);
  assert.match(indexer.getHealth().error ?? "", /genesis hash mismatch/);
});

test("a configured platform PDA is required even when no instruction mentions it", async () => {
  const platformPda = "Plat111111111111111111111111111111111111";
  const reader = new FakeReader();
  reader.transactions = [];
  reader.snapshots = [];
  const store = new FakeStore();
  const indexer = new OnchainIndexer({
    config: { ...config, platformPda },
    reader,
    store,
  });
  await indexer.runOnce();
  assert.deepEqual(reader.trackedAccounts, [{
    pubkey: platformPda,
    expectedRole: "platform",
    expectedOwner: PROGRAM,
  }]);
  assert.equal(store.chunks.length, 0);
  assert.equal(indexer.getHealth().healthy, false);
  assert.match(indexer.getHealth().error ?? "", /was not refreshed/);
});

test("health stays red until historical backfill is complete and persists empty-page completion", async () => {
  const reader = new FakeReader();
  reader.transactions = [];
  reader.backfillComplete = false;
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, false);
  assert.equal(store.checkpoint?.backfillComplete, false);

  reader.backfillComplete = true;
  await indexer.runOnce();
  assert.equal(store.checkpoint?.backfillComplete, true);
  assert.equal(indexer.getHealth().healthy, false);

  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, true);
});

test("incremental polling advances the newest signature cursor", async () => {
  const reader = new FakeReader();
  const store = new FakeStore();
  store.checkpoint = {
    lastFinalizedSlot: 109,
    oldestSignature: "2".repeat(64),
    newestSignature: "3".repeat(64),
    backfillComplete: true,
  };
  store.cpmmCheckpoint.scannedThroughSlot = 120;
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(store.checkpoint.newestSignature, SIGNATURE);
  assert.equal(reader.checkpoints[0]?.newestSignature, "3".repeat(64));
});

test("forward polling drains every page before advancing the head", async () => {
  const reader = new SolanaRpcReader(config);
  const rows = Array.from({ length: 205 }, (_, index) => ({
    signature: `sig-${204 - index}`,
    slot: 305 - index,
    err: null,
    blockTime: null,
  }));
  let signatureCalls = 0;
  (reader as any).rpc = async (method: string, params: any[]) => {
    if (method === "getSignaturesForAddress") {
      signatureCalls += 1;
      const options = params[1] as { before?: string; limit: number };
      const start = options.before
        ? rows.findIndex((row) => row.signature === options.before) + 1
        : 0;
      return rows.slice(start, start + options.limit);
    }
    if (method === "getTransaction") {
      const signature = params[0] as string;
      const row = rows.find((candidate) => candidate.signature === signature)!;
      return {
        slot: row.slot,
        blockTime: null,
        transaction: {
          message: { accountKeys: [], instructions: [], recentBlockhash: `block-${row.slot}` },
        },
        meta: { err: null, innerInstructions: [] },
      };
    }
    throw new Error(`Unexpected RPC method ${method}`);
  };
  const result = await reader.getTransactions(PROGRAM, {
    lastFinalizedSlot: 100,
    oldestSignature: "oldest",
    newestSignature: "committed-head",
    backfillComplete: true,
  }, 100, 100);
  assert.equal(result.transactions.length, 205);
  assert.equal(signatureCalls, 3);
  assert.equal(result.transactions[0]?.signature, "sig-0");
  assert.equal(result.transactions[204]?.signature, "sig-204");
});

test("polls tracked CPMM vaults and LP mints without a new LaunchLab transaction", async () => {
  const reader = new FakeReader();
  reader.transactions = [];
  reader.snapshots = [];
  const store = new FakeStore();
  store.checkpoint = {
    lastFinalizedSlot: 110,
    oldestSignature: "oldest",
    newestSignature: "head",
    backfillComplete: true,
  };
  store.trackedAccounts = [
    { pubkey: "7CpmPool111111111111111111111111111111111", expectedRole: "cpmmPool", expectedOwner: CPMM },
    { pubkey: "7BaseVault1111111111111111111111111111111", expectedRole: "vault", expectedOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { pubkey: "7QuoteVault111111111111111111111111111111", expectedRole: "vault", expectedOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { pubkey: "7LpMint1111111111111111111111111111111111", expectedRole: "mint", expectedOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
  ];
  reader.snapshots = store.trackedAccounts.map((tracked) => ({
    pubkey: tracked.pubkey,
    slot: 120,
    signature: null,
    owner: tracked.expectedOwner!,
    lamports: "1",
    executable: false,
    dataBase64: "",
    dataHash: "b".repeat(64),
    role: tracked.expectedRole,
  }));
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.deepEqual(reader.trackedAccounts, store.trackedAccounts);
  assert.equal(indexer.getHealth().healthy, false);
  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, true);
});

test("fails closed when a tracked CPMM pool no longer matches its discriminator", async () => {
  const reader = new SolanaRpcReader(config);
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: CPMM,
      lamports: 1,
      executable: false,
      data: [Buffer.alloc(637).toString("base64"), "base64"],
    }],
  });
  await assert.rejects(
    reader.getAccountSnapshots([], {
      programId: PROGRAM,
      cpmmProgramId: CPMM,
    }, [{ pubkey: LAUNCH, expectedRole: "cpmmPool", expectedOwner: CPMM }]),
    /expected cpmmPool.*observed unknown/,
  );
});

test("fails closed when a tracked mint changes owner", async () => {
  const reader = new SolanaRpcReader(config);
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: PROGRAM,
      lamports: 1,
      executable: false,
      data: [Buffer.alloc(82).toString("base64"), "base64"],
    }],
  });
  await assert.rejects(
    reader.getAccountSnapshots([], {
      programId: PROGRAM,
      cpmmProgramId: CPMM,
    }, [{
      pubkey: LAUNCH,
      expectedRole: "mint",
      expectedOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    }]),
    /expected mint.*observed unknown/,
  );
});

test("accepts first-pass discovery only when a referenced account decodes to its expected token role", async () => {
  const reader = new SolanaRpcReader(config);
  const mint = Buffer.alloc(82);
  mint[45] = 6;
  mint[46] = 1;
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 1,
      executable: false,
      data: [mint.toString("base64"), "base64"],
    }],
  });
  const snapshots = await reader.getAccountSnapshots([], {
    programId: PROGRAM,
    cpmmProgramId: CPMM,
  }, [{ pubkey: LAUNCH, expectedRole: "mint" }]);
  assert.equal(snapshots[0]?.role, "mint");
  assert.equal(snapshots[0]?.owner, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
});

test("decodes a Token-2022 extension mint using the canonical padded account-type offset", async () => {
  const reader = new SolanaRpcReader(config);
  const mint = Buffer.alloc(170);
  mint[44] = 9;
  mint[45] = 1;
  mint[165] = 1;
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      lamports: 1,
      executable: false,
      data: [mint.toString("base64"), "base64"],
    }],
  });
  const snapshots = await reader.getAccountSnapshots([], {
    programId: PROGRAM,
    cpmmProgramId: CPMM,
  }, [{ pubkey: LAUNCH, expectedRole: "mint" }], 120);
  assert.equal(snapshots[0]?.role, "mint");
  assert.equal(snapshots[0]?.decoded?.decimals, 9);
});

test("decodes the canonical 429-byte LaunchLab PoolState and all tracked references", async () => {
  const reader = new SolanaRpcReader(config);
  const fixture = canonicalLaunchLabFixture();
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: PROGRAM,
      lamports: 1,
      executable: false,
      data: [fixture.data.toString("base64"), "base64"],
    }],
  });
  const snapshots = await reader.getAccountSnapshots(
    [],
    { programId: PROGRAM, cpmmProgramId: CPMM },
    [{ pubkey: LAUNCH, expectedRole: "launchState", expectedOwner: PROGRAM }],
    120,
  );
  assert.equal(snapshots[0]?.role, "launchState");
  assert.equal(snapshots[0]?.decoded?.baseMint, fixture.baseMint);
  assert.equal(snapshots[0]?.decoded?.quoteMint, fixture.quoteMint);
  assert.equal(snapshots[0]?.decoded?.baseVault, fixture.baseVault);
  assert.equal(snapshots[0]?.decoded?.quoteVault, fixture.quoteVault);
  assert.equal(snapshots[0]?.decoded?.creator, fixture.creator);
});

test("decodes a finalized 429-byte PoolState captured from the pinned Raydium devnet program", async () => {
  const reader = new SolanaRpcReader(config);
  (reader as any).rpc = async () => ({
    context: { slot: FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.slot },
    value: [{
      owner: PROGRAM,
      lamports: 2_984_160,
      executable: false,
      data: [FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.dataBase64, "base64"],
    }],
  });
  const snapshots = await reader.getAccountSnapshots(
    [],
    { programId: PROGRAM, cpmmProgramId: CPMM },
    [{
      pubkey: FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.pubkey,
      expectedRole: "launchState",
      expectedOwner: PROGRAM,
    }],
    FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.slot,
  );
  assert.equal(snapshots[0]?.role, "launchState");
  assert.equal(snapshots[0]?.decoded?.baseMint, FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.baseMint);
  assert.equal(snapshots[0]?.decoded?.quoteMint, FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.quoteMint);
  assert.equal(snapshots[0]?.decoded?.baseVault, FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.baseVault);
  assert.equal(snapshots[0]?.decoded?.quoteVault, FINALIZED_DEVNET_LAUNCHLAB_FIXTURE.quoteVault);
});

test("cannot complete a known LaunchLab account as healthy when its layout is unknown", async () => {
  const reader = new SolanaRpcReader(config);
  const invalid = Buffer.alloc(461);
  createHash("sha256").update("account:PoolState").digest().copy(invalid, 0, 0, 8);
  (reader as any).rpc = async () => ({
    context: { slot: 120 },
    value: [{
      owner: PROGRAM,
      lamports: 1,
      executable: false,
      data: [invalid.toString("base64"), "base64"],
    }],
  });
  await assert.rejects(
    reader.getAccountSnapshots(
      [],
      { programId: PROGRAM, cpmmProgramId: CPMM },
      [{ pubkey: LAUNCH, expectedRole: "launchState", expectedOwner: PROGRAM }],
      120,
    ),
    /expected launchState.*observed unknown/,
  );
});

test("records the actual finalized account context when finality advances during the pass", async () => {
  const reader = new SolanaRpcReader(config);
  const mint = Buffer.alloc(82);
  mint[45] = 1;
  (reader as any).rpc = async () => ({
    context: { slot: 121 },
    value: [{
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 1,
      executable: false,
      data: [mint.toString("base64"), "base64"],
    }],
  });
  const snapshots = await reader.getAccountSnapshots(
    [],
    { programId: PROGRAM, cpmmProgramId: CPMM },
    [{
      pubkey: LAUNCH,
      expectedRole: "mint",
    }],
    120,
  );
  assert.equal(snapshots[0]?.slot, 121);
});

test("advances an independent finalized CPMM transaction cursor", async () => {
  const reader = new FakeReader();
  reader.transactions = [];
  reader.cpmmTransactions = [{
    signature: "cpmm-signature",
    slot: 115,
    blockhash: "8".repeat(44),
    blockTime: null,
    success: true,
    instructions: [{
      programId: CPMM,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [],
      data: "cpmm-data",
      kind: "cpmm",
      payload: {},
    }],
    raw: { source: "finalized-cpmm-rpc" },
  }];
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(store.cpmmCheckpoint.newestSignature, "cpmm-signature");
  assert.equal(store.cpmmCheckpoint.lastFinalizedSlot, 115);
});

test("discovers a standalone mint-authority transaction through the mint cursor", async () => {
  const mint = "Mint111111111111111111111111111111111111";
  const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const reader = new FakeReader();
  reader.transactions = [];
  reader.mintTransactions.set(mint, [{
    signature: "authority-signature",
    slot: 116,
    blockhash: "7".repeat(44),
    blockTime: null,
    success: true,
    instructions: [{
      programId: tokenProgram,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [mint],
      data: "",
      kind: "token",
      payload: {
        type: "setAuthority",
        info: { account: mint, authorityType: "mintTokens", newAuthority: null },
      },
    }],
    raw: { source: "standalone-token-program-transaction" },
  }]);
  const store = new FakeStore();
  store.trackedAccounts = [{ pubkey: mint, expectedRole: "mint", expectedOwner: tokenProgram }];
  reader.snapshots = [{
    pubkey: mint,
    slot: 120,
    signature: null,
    owner: tokenProgram,
    lamports: "1",
    executable: false,
    dataBase64: "",
    dataHash: "c".repeat(64),
    role: "mint",
  }];
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  const mintNamespace = `mint:${mint}`;
  assert.equal(store.auxiliaryCheckpoints.get(mintNamespace)?.newestSignature, "authority-signature");
  assert.equal(store.auxiliaryChunks.get(mintNamespace)?.[0]?.transactions[0]?.instructions[0]?.kind, "token");
});

test("newly discovered mints keep health red until their cursor is backfilled", async () => {
  const mint = "Mint111111111111111111111111111111111111";
  const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const reader = new FakeReader();
  reader.snapshots = [
    { ...reader.snapshots[0]!, decoded: { baseMint: mint } },
    {
      pubkey: mint,
      slot: 120,
      signature: null,
      owner: tokenProgram,
      lamports: "1",
      executable: false,
      dataBase64: "",
      dataHash: "d".repeat(64),
      role: "mint",
    },
  ];
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, false);
  assert.match(indexer.getHealth().error ?? "", /backfill is still in progress/);

  await indexer.runOnce();
  assert.equal(store.auxiliaryCheckpoints.get(`mint:${mint}`)?.backfillComplete, true);
  assert.equal(indexer.getHealth().healthy, false);

  await indexer.runOnce();
  assert.equal(indexer.getHealth().healthy, true);
});

test("backfill completion requires a restart-safe forward catch-up before coverage advances", async () => {
  const reader = new FakeReader();
  reader.backfillComplete = false;
  reader.cpmmBackfillComplete = false;
  const store = new FakeStore();
  const first = new OnchainIndexer({ config, reader, store });
  await first.runOnce();
  assert.equal(first.getHealth().backfillInProgress, true);
  assert.equal(store.checkpoint?.scannedThroughSlot, undefined);

  reader.finalizedSlot = 125;
  reader.backfillComplete = true;
  reader.cpmmBackfillComplete = true;
  await first.runOnce();
  assert.equal(store.checkpoint?.backfillComplete, true);
  assert.equal(store.checkpoint?.scannedThroughSlot, undefined);
  assert.equal(first.getHealth().healthy, false);

  const catchupReader = new FakeReader();
  catchupReader.finalizedSlot = 130;
  catchupReader.transactions = [{
    ...catchupReader.transactions[0]!,
    signature: "5".repeat(64),
    slot: 125,
  }];
  const restarted = new OnchainIndexer({ config, reader: catchupReader, store });
  await restarted.runOnce();
  assert.equal(store.checkpoint?.newestSignature, "5".repeat(64));
  assert.equal(store.checkpoint?.scannedThroughSlot, 130);
  assert.equal(restarted.getHealth().indexedThroughSlot, 130);
  assert.equal(restarted.getHealth().healthy, true);
});

test("a quiet fully scanned program is caught up while backfill remains explicitly identified", async () => {
  const reader = new FakeReader();
  reader.finalizedSlot = 1_000;
  reader.backfillComplete = false;
  reader.transactions = [];
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config: { ...config, lagWarningSlots: 100, lagCriticalSlots: 500 }, reader, store });
  await indexer.runOnce();
  assert.equal(indexer.getHealth().backfillInProgress, true);
  assert.equal(indexer.getHealth().activeAlerts.some((alert) => alert.code === "FINALIZED_SLOT_LAG"), false);

  reader.backfillComplete = true;
  await indexer.runOnce();
  assert.equal(indexer.getHealth().backfillInProgress, true);
  await indexer.runOnce();
  const health = indexer.getHealth();
  assert.equal(health.backfillInProgress, false);
  assert.equal(health.indexedThroughSlot, 1_000);
  assert.equal(health.finalizedSlotLag, 0);
  assert.equal(health.alertStatus, "ok");
  assert.match(indexer.getMetrics(), /solana_indexer_finalized_slot_lag\{cluster="devnet"\} 0/);
});

test("alerts after repeated RPC gaps and immediately on tracked account mismatch", async () => {
  const gapReader = new FakeReader();
  gapReader.getFinalizedSlot = async () => { throw new Error("RPC gap: signature unavailable"); };
  const gapIndexer = new OnchainIndexer({ config: { ...config, rpcGapAlertCount: 2 }, reader: gapReader, store: new FakeStore() });
  await gapIndexer.runOnce();
  await gapIndexer.runOnce();
  assert.equal(gapIndexer.getHealth().activeAlerts[0]?.code, "REPEATED_RPC_GAPS");

  const mismatchReader = new FakeReader();
  const mismatchStore = new FakeStore();
  mismatchStore.trackedAccounts = [{ pubkey: LAUNCH, expectedRole: "mint", expectedOwner: CPMM }];
  const mismatchIndexer = new OnchainIndexer({ config, reader: mismatchReader, store: mismatchStore });
  await mismatchIndexer.runOnce();
  assert.equal(mismatchIndexer.getHealth().activeAlerts[0]?.code, "TRACKED_ACCOUNT_MISMATCH");
});

test("delivers activation, escalation, and recovery transitions without duplicate pages", async () => {
  const delivered: import("./alert-delivery").IndexerAlertNotification[] = [];
  const reader = new FakeReader();
  const indexer = new OnchainIndexer({
    config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader,
    store: new FakeStore(),
    alertDestination: { deliver: async (notification) => { delivered.push(notification); } },
  });
  await indexer.runOnce();
  delivered.length = 0;

  (indexer as any).health.backfillInProgress = false;
  (indexer as any).health.finalizedSlotLag = 20;
  (indexer as any).updateAlerts();
  (indexer as any).updateAlerts();
  assert.deepEqual(delivered.map((item) => item.event === "active" ? `${item.alert.code}:${item.alert.severity}` : item.event), [
    "FINALIZED_SLOT_LAG:warning",
  ]);

  (indexer as any).health.finalizedSlotLag = 60;
  (indexer as any).updateAlerts();
  (indexer as any).updateAlerts();
  assert.equal(delivered.filter((item) => item.event === "active").length, 2);
  assert.equal(delivered[1]?.event === "active" && delivered[1].alert.severity, "critical");

  (indexer as any).health.finalizedSlotLag = 0;
  (indexer as any).updateAlerts();
  (indexer as any).updateAlerts();
  assert.equal(delivered.filter((item) => item.event === "recovered").length, 1);
});

test("hydrates namespaced active alerts on restart and durably recovers incidents observed while down", async () => {
  const store = new AlertStateFakeStore();
  const first = new OnchainIndexer({
    config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader: new FakeReader(),
    store,
  });
  const firstControlled = first as unknown as {
    health: IndexerHealth;
    updateAlerts(): Promise<void>;
  };
  firstControlled.health.backfillInProgress = false;
  firstControlled.health.finalizedSlotLag = 20;
  await firstControlled.updateAlerts();
  const firstObservedAt = store.activeAlerts.get("FINALIZED_SLOT_LAG")?.firstObservedAt;
  assert.ok(firstObservedAt);

  const restarted = new OnchainIndexer({
    config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader: new FakeReader(),
    store,
  });
  const restartedControlled = restarted as unknown as {
    health: IndexerHealth;
    updateAlerts(): Promise<void>;
  };
  restartedControlled.health.backfillInProgress = false;
  restartedControlled.health.finalizedSlotLag = 20;
  await restartedControlled.updateAlerts();
  assert.equal(restarted.getHealth().activeAlerts[0]?.firstObservedAt, firstObservedAt);
  assert.equal([...store.outbox.values()].filter((event) => event.event === "active").length, 1);

  restartedControlled.health.finalizedSlotLag = 0;
  await restartedControlled.updateAlerts();
  assert.equal(store.activeAlerts.size, 0);
  assert.equal([...store.outbox.values()].filter((event) => event.event === "recovered").length, 1);
  await restartedControlled.updateAlerts();
  assert.equal([...store.outbox.values()].filter((event) => event.event === "recovered").length, 1);
});

test("does not recover an alert when the indexer namespace changes", async () => {
  const delivered: import("./alert-delivery").IndexerAlertNotification[] = [];
  const indexer = new OnchainIndexer({
    config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader: new FakeReader(),
    store: new FakeStore(),
    alertDestination: { deliver: async (notification) => { delivered.push(notification); } },
  });
  const controlled = indexer as unknown as {
    health: IndexerHealth;
    updateAlerts(): void;
  };
  controlled.health.backfillInProgress = false;
  controlled.health.finalizedSlotLag = 20;
  controlled.updateAlerts();
  assert.equal(delivered[0]?.event, "active");

  controlled.health.cluster = "mainnet-beta";
  controlled.health.finalizedSlotLag = 0;
  controlled.updateAlerts();
  assert.equal(delivered.some((notification) => notification.event === "recovered"), false);
});

test("lag grows from the last completed scan when database processing fails", async () => {
  const reader = new FakeReader();
  const store = new FakeStore();
  const indexer = new OnchainIndexer({ config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 }, reader, store });
  await indexer.runOnce();
  await indexer.runOnce();
  assert.equal(indexer.getHealth().indexedThroughSlot, 120);

  reader.finalizedSlot = 180;
  store.withNamespaceLock = async () => { throw new Error("database unavailable"); };
  await indexer.runOnce();
  const health = indexer.getHealth();
  assert.equal(health.lastFinalizedSlot, 180);
  assert.equal(health.indexedThroughSlot, 120);
  assert.equal(health.finalizedSlotLag, 60);
  assert.equal(health.activeAlerts[0]?.code, "FINALIZED_SLOT_LAG");
  assert.equal(health.rpcGapCount, 0);
});

test("restores the durable scan watermark after restart and alerts if storage then fails", async () => {
  const reader = new FakeReader();
  reader.finalizedSlot = 180;
  const store = new FakeStore();
  store.checkpoint = {
    lastFinalizedSlot: 110,
    scannedThroughSlot: 120,
    oldestSignature: "oldest",
    newestSignature: "head",
    backfillComplete: true,
  };
  store.cpmmCheckpoint.scannedThroughSlot = 120;
  store.withNamespaceLock = async (_namespace, callback) => {
    await callback(Object.assign(Object.create(store), {
      atomicPass: async () => { throw new Error("database unavailable"); },
    }));
  };
  const restarted = new OnchainIndexer({
    config: { ...config, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader,
    store,
  });
  await restarted.runOnce();
  assert.equal(restarted.getHealth().indexedThroughSlot, 120);
  assert.equal(restarted.getHealth().finalizedSlotLag, 60);
  assert.equal(restarted.getHealth().activeAlerts[0]?.code, "FINALIZED_SLOT_LAG");
});

test("keeps a tracked-account mismatch latched until a successful validation", async () => {
  const reader = new FakeReader();
  const store = new FakeStore();
  store.trackedAccounts = [{ pubkey: LAUNCH, expectedRole: "mint", expectedOwner: CPMM }];
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  const firstObservedAt = indexer.getHealth().activeAlerts[0]?.firstObservedAt;
  reader.finalizedSlot += 1;
  await new Promise((resolve) => setTimeout(resolve, 2));
  await indexer.runOnce();
  const alert = indexer.getHealth().activeAlerts[0];
  assert.equal(alert?.code, "TRACKED_ACCOUNT_MISMATCH");
  assert.equal(alert?.firstObservedAt, firstObservedAt);
});

test("does not advance durable scan coverage when reconciliation fails after history commits", async () => {
  const reader = new FakeReader();
  reader.finalizedSlot = 180;
  const store = new FakeStore();
  store.checkpoint = {
    lastFinalizedSlot: 110,
    scannedThroughSlot: 120,
    oldestSignature: "oldest",
    newestSignature: "head",
    backfillComplete: true,
  };
  store.cpmmCheckpoint.scannedThroughSlot = 120;
  store.listLaunches = async () => { throw new Error("reconciliation storage unavailable"); };
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(store.checkpoint.scannedThroughSlot, 120);
  assert.equal(indexer.getHealth().indexedThroughSlot, 120);
});

test("restores coverage and backfill conservatively across CPMM and tracked mint checkpoints", async () => {
  const mint = "Mint111111111111111111111111111111111111";
  const reader = new FakeReader();
  reader.transactions = [];
  const store = new FakeStore();
  store.checkpoint = {
    lastFinalizedSlot: 110,
    scannedThroughSlot: 180,
    oldestSignature: "oldest",
    newestSignature: "head",
    backfillComplete: true,
  };
  store.cpmmCheckpoint = {
    lastFinalizedSlot: 105,
    scannedThroughSlot: 120,
    oldestSignature: "oldest-cpmm",
    newestSignature: "head-cpmm",
    backfillComplete: false,
  };
  store.trackedAccounts = [{ pubkey: mint, expectedRole: "mint" }];
  store.auxiliaryCheckpoints.set(`mint:${mint}`, {
    lastFinalizedSlot: 100,
    scannedThroughSlot: 150,
    oldestSignature: "oldest-mint",
    newestSignature: "head-mint",
    backfillComplete: true,
  });
  reader.cpmmBackfillComplete = false;
  reader.snapshots = [{
    pubkey: mint,
    slot: 180,
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    lamports: "1",
    executable: false,
    dataBase64: "",
    dataHash: "e".repeat(64),
    role: "mint",
  }];
  const indexer = new OnchainIndexer({ config, reader, store });
  await indexer.runOnce();
  assert.equal(indexer.getHealth().backfillInProgress, true);
  assert.equal(indexer.getHealth().activeAlerts.some((alert) => alert.code === "FINALIZED_SLOT_LAG"), false);
});

test("independent liveness sampling alerts while the main worker is stalled", async () => {
  const reader = new FakeReader();
  reader.finalizedSlot = 180;
  const indexer = new OnchainIndexer({
    config: { ...config, pollIntervalMs: 250, stallAlertMs: 500, lagWarningSlots: 10, lagCriticalSlots: 50 },
    reader,
    store: new FakeStore(),
  });
  (indexer as any).running = true;
  (indexer as any).successfullyScannedThroughSlot = 120;
  (indexer as any).health.lastRunAt = new Date(Date.now() - 1_000).toISOString();
  await (indexer as any).sampleLiveness();
  const codes = indexer.getHealth().activeAlerts.map((alert) => alert.code);
  assert.ok(codes.includes("FINALIZED_SLOT_LAG"));
  assert.ok(codes.includes("WORKER_STALLED"));
});

test("liveness RPC outages increment gap metrics without relying on error wording", async () => {
  const reader = new FakeReader();
  reader.getFinalizedSlot = async () => { throw new Error("network unavailable"); };
  const indexer = new OnchainIndexer({
    config: { ...config, rpcGapAlertCount: 1 },
    reader,
    store: new FakeStore(),
  });
  (indexer as any).running = true;
  await (indexer as any).sampleLiveness();
  assert.equal(indexer.getHealth().rpcGapCount, 1);
  assert.equal(indexer.getHealth().activeAlerts[0]?.code, "REPEATED_RPC_GAPS");
});

test("production RPC HTTP outages trigger repeated-gap alerts and a successful poll clears them", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
    const rpcReader = new SolanaRpcReader(config);
    const indexer = new OnchainIndexer({
      config: { ...config, rpcGapAlertCount: 2 },
      reader: rpcReader,
      store: new FakeStore(),
    });
    await indexer.runOnce();
    await indexer.runOnce();
    assert.equal(indexer.getHealth().rpcGapCount, 2);
    assert.equal(indexer.getHealth().activeAlerts[0]?.code, "REPEATED_RPC_GAPS");

    (indexer as any).reader = new FakeReader();
    await indexer.runOnce();
    assert.equal(indexer.getHealth().activeAlerts.some((alert) => alert.code === "REPEATED_RPC_GAPS"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});