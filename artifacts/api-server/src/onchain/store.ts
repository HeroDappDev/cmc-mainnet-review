import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  db,
  pool,
  solanaAlertOutbox,
  solanaAccountSnapshots,
  solanaAccountTransitions,
  solanaCheckpoints,
  solanaCpmmPools,
  solanaInstructionJournal,
  solanaLaunchStates,
  solanaMigrations,
  solanaMintAuthorityHistory,
  solanaMints,
  solanaOperationalAlerts,
  solanaReconciliations,
  solanaTrades,
  solanaTransactions,
  solanaVaults,
} from "@workspace/db";
import * as schema from "@workspace/db/schema";
import type {
  AccountSnapshot,
  FinalizedInstruction,
  FinalizedTransaction,
  IndexerAlert,
  LockedSolanaStore,
  OperationalAlertDelivery,
  OperationalAlertEvent,
  ProjectedLaunch,
  ProjectedTrade,
  Reconciliation,
  SolanaCheckpoint,
  SolanaChunk,
  SolanaNamespace,
  SolanaStore,
  TrackedAccount,
} from "./types";

type Database = NonNullable<typeof db>;

type LockPool = Pick<NonNullable<typeof pool>, "connect">;
function requireDatabase(database: Database | undefined): Database {
  if (!database) throw new Error("DATABASE_URL is required for durable Solana indexing");
  return database;
}

function decodedString(snapshot: AccountSnapshot, key: string): string | null {
  const value = snapshot.decoded?.[key];
  return value === undefined || value === null ? null : String(value);
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

async function projectInstruction(
  transaction: any,
  namespace: SolanaNamespace,
  tx: FinalizedTransaction,
  instruction: FinalizedInstruction,
  cpmmProgramId: string,
): Promise<void> {
  const common = {
    cluster: namespace.cluster,
    programId: namespace.programId,
    signature: tx.signature,
    instructionIndex: instruction.instructionIndex,
    innerInstructionIndex: instruction.innerInstructionIndex,
    slot: tx.slot,
  };
  const instructionValue = {
    ...common,
    blockhash: tx.blockhash,
    instructionProgram: instruction.programId,
    kind: instruction.kind,
    accounts: instruction.accounts,
    data: instruction.data,
    payload: instruction.payload,
  };
  const existingInstructions = await transaction.select().from(solanaInstructionJournal).where(and(
    eq(solanaInstructionJournal.cluster, namespace.cluster),
    eq(solanaInstructionJournal.programId, namespace.programId),
    eq(solanaInstructionJournal.signature, tx.signature),
    eq(solanaInstructionJournal.instructionIndex, instruction.instructionIndex),
    eq(solanaInstructionJournal.innerInstructionIndex, instruction.innerInstructionIndex),
  )).limit(1);
  if (existingInstructions[0]) {
    const existing = existingInstructions[0];
    if (
      existing.blockhash !== tx.blockhash ||
      existing.instructionProgram !== instruction.programId ||
      existing.kind !== instruction.kind ||
      stableJson(existing.accounts) !== stableJson(instruction.accounts) ||
      existing.data !== instruction.data ||
      stableJson(existing.payload) !== stableJson(instruction.payload)
    ) throw new Error(`Conflicting finalized instruction ${tx.signature}:${instruction.instructionIndex}:${instruction.innerInstructionIndex}`);
  } else {
    await transaction.insert(solanaInstructionJournal).values(instructionValue);
  }

  if (!tx.success) return;
  if (instruction.kind === "token") {
    const type = instruction.payload["type"];
    const info = instruction.payload["info"];
    if (type === "setAuthority" && info && typeof info === "object") {
      const values = info as Record<string, unknown>;
      const account = typeof values["account"] === "string" ? values["account"] : null;
      const authorityType = typeof values["authorityType"] === "string" ? values["authorityType"] : "unknown";
      const newAuthority = typeof values["newAuthority"] === "string" ? values["newAuthority"] : null;
      if (account) {
        const evidence = { accounts: instruction.accounts, data: instruction.data, payload: instruction.payload };
        await transaction.insert(solanaMintAuthorityHistory).values({
          cluster: namespace.cluster,
          mint: account,
          slot: tx.slot,
          signature: tx.signature,
          mintAuthority: authorityType.toLowerCase().includes("mint") ? newAuthority : null,
          freezeAuthority: authorityType.toLowerCase().includes("freeze") ? newAuthority : null,
          supply: null,
          accountHash: createHash("sha256").update(stableJson(evidence)).digest("hex"),
          authorityType,
          rawInstruction: evidence,
        }).onConflictDoNothing();
      }
    }
    return;
  }
  const launchRows = instruction.accounts.length === 0 ? [] : await transaction
    .select({ launchState: solanaLaunchStates.launchState })
    .from(solanaLaunchStates)
    .where(and(
      eq(solanaLaunchStates.cluster, namespace.cluster),
      eq(solanaLaunchStates.programId, namespace.programId),
      inArray(solanaLaunchStates.launchState, instruction.accounts),
    ));
  const launchState = launchRows[0]?.launchState ?? null;
  if (instruction.kind === "trade") {
    await transaction.insert(solanaTrades).values({
      ...common,
      launchState,
      trader: null,
      side: decodedString({ decoded: instruction.payload } as AccountSnapshot, "side") ?? "unknown",
      baseAmount: decodedString({ decoded: instruction.payload } as AccountSnapshot, "baseAmount"),
      quoteAmount: decodedString({ decoded: instruction.payload } as AccountSnapshot, "quoteAmount"),
      feeAmount: decodedString({ decoded: instruction.payload } as AccountSnapshot, "feeAmount"),
      rawInstruction: { accounts: instruction.accounts, data: instruction.data, payload: instruction.payload },
    }).onConflictDoNothing();
  }
  if (instruction.kind === "migration") {
    if (!launchState) return;
    const poolRows = instruction.accounts.length === 0 ? [] : await transaction
      .select({ pool: solanaCpmmPools.pool })
      .from(solanaCpmmPools)
      .where(and(
        eq(solanaCpmmPools.cluster, namespace.cluster),
        eq(solanaCpmmPools.cpmmProgram, cpmmProgramId),
        inArray(solanaCpmmPools.pool, instruction.accounts),
      ));
    const pool = poolRows[0]?.pool ?? null;
    await transaction.insert(solanaMigrations).values({
      cluster: namespace.cluster,
      launchState,
      signature: tx.signature,
      instructionIndex: instruction.instructionIndex,
      slot: tx.slot,
      cpmmProgram: cpmmProgramId,
      pool,
      status: "finalized",
      rawInstruction: { accounts: instruction.accounts, data: instruction.data, payload: instruction.payload },
    }).onConflictDoNothing();
    if (pool) {
      await transaction.update(solanaCpmmPools)
        .set({ launchState, updatedAt: new Date() })
        .where(and(
          eq(solanaCpmmPools.cluster, namespace.cluster),
          eq(solanaCpmmPools.cpmmProgram, cpmmProgramId),
          eq(solanaCpmmPools.pool, pool),
        ));
    }
  }
}

async function projectSnapshot(
  transaction: any,
  namespace: SolanaNamespace,
  snapshot: AccountSnapshot,
  cpmmProgramId: string,
): Promise<void> {
  const snapshotValue = {
    cluster: namespace.cluster,
    programId: namespace.programId,
    pubkey: snapshot.pubkey,
    slot: snapshot.slot,
    signature: snapshot.signature,
    owner: snapshot.owner,
    lamports: snapshot.lamports,
    executable: snapshot.executable,
    dataBase64: snapshot.dataBase64,
    dataHash: snapshot.dataHash,
    role: snapshot.role,
    decoded: snapshot.decoded ?? null,
  };
  const existingSnapshots = await transaction.select().from(solanaAccountSnapshots).where(and(
    eq(solanaAccountSnapshots.cluster, namespace.cluster),
    eq(solanaAccountSnapshots.programId, namespace.programId),
    eq(solanaAccountSnapshots.pubkey, snapshot.pubkey),
    eq(solanaAccountSnapshots.slot, snapshot.slot),
  )).limit(1);
  if (existingSnapshots[0]) {
    const existing = existingSnapshots[0];
    if (
      existing.owner !== snapshot.owner ||
      existing.dataHash !== snapshot.dataHash ||
      existing.lamports !== snapshot.lamports ||
      existing.role !== snapshot.role
    ) throw new Error(`Conflicting finalized account snapshot ${snapshot.pubkey}@${snapshot.slot}`);
  } else {
    await transaction.insert(solanaAccountSnapshots).values(snapshotValue);
  }

  const observed = {
    observedSlot: snapshot.slot,
    observedSignature: snapshot.signature,
    accountHash: snapshot.dataHash,
    updatedAt: new Date(),
  };
  if (snapshot.role === "launchState" || snapshot.role === "platform") {
    await transaction.insert(solanaLaunchStates).values({
      cluster: namespace.cluster,
      programId: namespace.programId,
      launchState: snapshot.pubkey,
      status: snapshot.role === "platform" ? "platform" : decodedString(snapshot, "status") ?? "unknown",
      baseMint: decodedString(snapshot, "baseMint"),
      quoteMint: decodedString(snapshot, "quoteMint"),
      creator: decodedString(snapshot, "creator"),
      platform: decodedString(snapshot, "platform"),
      baseVault: decodedString(snapshot, "baseVault"),
      quoteVault: decodedString(snapshot, "quoteVault"),
      virtualBase: decodedString(snapshot, "virtualBase"),
      virtualQuote: decodedString(snapshot, "virtualQuote"),
      realBase: decodedString(snapshot, "realBase"),
      realQuote: decodedString(snapshot, "realQuote"),
      rawState: snapshot.decoded ?? {},
      ...observed,
    }).onConflictDoUpdate({
      target: [solanaLaunchStates.cluster, solanaLaunchStates.programId, solanaLaunchStates.launchState],
      set: {
        status: snapshot.role === "platform" ? "platform" : decodedString(snapshot, "status") ?? "unknown",
        baseMint: decodedString(snapshot, "baseMint"),
        quoteMint: decodedString(snapshot, "quoteMint"),
        creator: decodedString(snapshot, "creator"),
        platform: decodedString(snapshot, "platform"),
        baseVault: decodedString(snapshot, "baseVault"),
        quoteVault: decodedString(snapshot, "quoteVault"),
        virtualBase: decodedString(snapshot, "virtualBase"),
        virtualQuote: decodedString(snapshot, "virtualQuote"),
        realBase: decodedString(snapshot, "realBase"),
        realQuote: decodedString(snapshot, "realQuote"),
        rawState: snapshot.decoded ?? {},
        ...observed,
      },
    });
  } else if (snapshot.role === "mint") {
    const mint = {
      tokenProgram: snapshot.owner,
      decimals: snapshot.decoded?.decimals == null ? null : Number(snapshot.decoded.decimals),
      supply: decodedString(snapshot, "supply"),
      mintAuthority: decodedString(snapshot, "mintAuthority"),
      freezeAuthority: decodedString(snapshot, "freezeAuthority"),
      initialized: snapshot.decoded?.initialized == null ? null : Boolean(snapshot.decoded.initialized),
      rawState: snapshot.decoded ?? {},
      ...observed,
    };
    await transaction.insert(solanaMints).values({
      cluster: namespace.cluster,
      mint: snapshot.pubkey,
      ...mint,
    }).onConflictDoUpdate({
      target: [solanaMints.cluster, solanaMints.mint],
      set: mint,
    });
    await transaction.insert(solanaMintAuthorityHistory).values({
      cluster: namespace.cluster,
      mint: snapshot.pubkey,
      slot: snapshot.slot,
      signature: snapshot.signature,
      mintAuthority: mint.mintAuthority,
      freezeAuthority: mint.freezeAuthority,
      supply: mint.supply,
      accountHash: snapshot.dataHash,
    }).onConflictDoNothing();
  } else if (snapshot.role === "vault") {
    const launches = await transaction.select({
      launchState: solanaLaunchStates.launchState,
      baseVault: solanaLaunchStates.baseVault,
      quoteVault: solanaLaunchStates.quoteVault,
    }).from(solanaLaunchStates).where(and(
      eq(solanaLaunchStates.cluster, namespace.cluster),
      eq(solanaLaunchStates.programId, namespace.programId),
    ));
    const pools = await transaction.select({
      pool: solanaCpmmPools.pool,
      baseVault: solanaCpmmPools.baseVault,
      quoteVault: solanaCpmmPools.quoteVault,
    }).from(solanaCpmmPools).where(eq(solanaCpmmPools.cluster, namespace.cluster));
    const launch = launches.find((row: any) => row.baseVault === snapshot.pubkey || row.quoteVault === snapshot.pubkey);
    const pool = pools.find((row: any) => row.baseVault === snapshot.pubkey || row.quoteVault === snapshot.pubkey);
    const vault = {
      launchState: launch?.launchState ?? null,
      pool: pool?.pool ?? null,
      mint: decodedString(snapshot, "mint"),
      authority: decodedString(snapshot, "authority"),
      amount: decodedString(snapshot, "amount"),
      tokenProgram: snapshot.owner,
      rawState: snapshot.decoded ?? {},
      ...observed,
    };
    await transaction.insert(solanaVaults).values({
      cluster: namespace.cluster,
      programId: namespace.programId,
      vault: snapshot.pubkey,
      ...vault,
    }).onConflictDoUpdate({
      target: [solanaVaults.cluster, solanaVaults.programId, solanaVaults.vault],
      set: vault,
    });
    if (pool) {
      await transaction.update(solanaCpmmPools).set({
        ...(pool.baseVault === snapshot.pubkey ? { baseReserve: vault.amount } : {}),
        ...(pool.quoteVault === snapshot.pubkey ? { quoteReserve: vault.amount } : {}),
        updatedAt: new Date(),
      }).where(and(
        eq(solanaCpmmPools.cluster, namespace.cluster),
        eq(solanaCpmmPools.pool, pool.pool),
      ));
    }
  } else if (snapshot.role === "cpmmPool") {
    const cpmm = {
      config: decodedString(snapshot, "config"),
      authority: null,
      baseMint: decodedString(snapshot, "baseMint"),
      quoteMint: decodedString(snapshot, "quoteMint"),
      baseVault: decodedString(snapshot, "baseVault"),
      quoteVault: decodedString(snapshot, "quoteVault"),
      lpMint: decodedString(snapshot, "lpMint"),
      lpSupply: decodedString(snapshot, "lpSupply"),
      status: decodedString(snapshot, "status") ?? "unknown",
      rawState: snapshot.decoded ?? {},
      ...observed,
    };
    await transaction.insert(solanaCpmmPools).values({
      cluster: namespace.cluster,
      cpmmProgram: cpmmProgramId,
      pool: snapshot.pubkey,
      ...cpmm,
    }).onConflictDoUpdate({
      target: [solanaCpmmPools.cluster, solanaCpmmPools.cpmmProgram, solanaCpmmPools.pool],
      set: cpmm,
    });
  }
}

export class SqlSolanaStore implements SolanaStore {
  private readonly database: Database;
  private readonly lockPool: LockPool | undefined;
  constructor(
    database: Database = requireDatabase(db),
    lockPool: LockPool | undefined = pool,
  ) {
    this.database = database;
    this.lockPool = lockPool;
  }

  async withNamespaceLock(
    namespace: SolanaNamespace,
    callback: (store: LockedSolanaStore) => Promise<void>,
  ): Promise<void> {
    if (!this.lockPool) throw new Error("DATABASE_URL is required for the Solana indexer advisory lock");
    const client = await this.lockPool.connect();
    const lockKey = `${namespace.cluster}:${namespace.programId}`;
    const configuredTimeout = process.env.SOLANA_INDEXER_OPERATION_TIMEOUT_MS;
    const timeoutMs = configuredTimeout && /^\d+$/.test(configuredTimeout)
      ? Math.max(250, Number(configuredTimeout))
      : 10_000;
    try {
      await client.query("select set_config('statement_timeout', $1, false)", [`${timeoutMs}ms`]);
      await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
      await callback(new SqlSolanaStore(
        drizzle(client, { schema }) as unknown as Database,
        this.lockPool,
      ));
    } finally {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
      } finally {
        client.release();
      }
    }
  }

  async getCheckpoint(namespace: SolanaNamespace): Promise<SolanaCheckpoint | null> {
    const rows = await this.database.select().from(solanaCheckpoints).where(and(
      eq(solanaCheckpoints.cluster, namespace.cluster),
      eq(solanaCheckpoints.programId, namespace.programId),
    )).limit(1);
    const row = rows[0];
    return row ? {
      lastFinalizedSlot: row.lastFinalizedSlot,
      scannedThroughSlot: row.scannedThroughSlot,
      oldestSignature: row.oldestSignature,
      newestSignature: row.newestSignature,
      backfillComplete: row.backfillComplete,
    } : null;
  }

  async markScanComplete(namespaces: SolanaNamespace[], scannedThroughSlot: number): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const namespace of namespaces) {
        await transaction.update(solanaCheckpoints)
          .set({ scannedThroughSlot, updatedAt: new Date() })
          .where(and(
            eq(solanaCheckpoints.cluster, namespace.cluster),
            eq(solanaCheckpoints.programId, namespace.programId),
          ));
      }
    });
  }

  private async validateChunkTransactions(
    transaction: any,
    namespace: SolanaNamespace,
    chunk: SolanaChunk,
  ): Promise<void> {
    for (const tx of chunk.transactions) {
      const evidenceHash = createHash("sha256").update(stableJson(tx.raw)).digest("hex");
      const rows = await transaction.select({
        slot: solanaTransactions.slot,
        blockhash: solanaTransactions.blockhash,
        success: solanaTransactions.success,
        evidenceHash: solanaTransactions.evidenceHash,
      }).from(solanaTransactions).where(and(
        eq(solanaTransactions.cluster, namespace.cluster),
        eq(solanaTransactions.programId, namespace.programId),
        eq(solanaTransactions.signature, tx.signature),
      )).limit(1);
      const existing = rows[0];
      if (!existing) continue;
      const conflicts = [
        existing.slot !== tx.slot ? "slot" : null,
        existing.blockhash !== tx.blockhash ? "blockhash" : null,
        existing.success !== tx.success ? "success" : null,
        existing.evidenceHash !== evidenceHash ? "evidenceHash" : null,
      ].filter(Boolean);
      if (conflicts.length > 0) {
        throw new Error(`Conflicting finalized transaction ${tx.signature} (${conflicts.join(", ")})`);
      }
    }
  }

  private async persistChunk(transaction: any, namespace: SolanaNamespace, chunk: SolanaChunk): Promise<void> {
      const cpmmProgramId =
        chunk.transactions.flatMap((tx) => tx.instructions).find((ix) => ix.kind === "cpmm")?.programId ??
        chunk.accounts.find((account) => account.role === "cpmmPool")?.owner ??
        "";
      const roleOrder = { launchState: 0, platform: 0, cpmmPool: 1, mint: 2, vault: 3, unknown: 4 };
      for (const tx of chunk.transactions) {
        const evidenceHash = createHash("sha256").update(stableJson(tx.raw)).digest("hex");
        const transactionValue = {
          cluster: namespace.cluster,
          programId: namespace.programId,
          signature: tx.signature,
          slot: tx.slot,
          blockhash: tx.blockhash,
          blockTime: tx.blockTime,
          success: tx.success,
          transaction: tx.raw,
          evidenceHash,
        };
        const existingTransactions = await transaction.select({
          slot: solanaTransactions.slot,
          blockhash: solanaTransactions.blockhash,
          success: solanaTransactions.success,
          evidenceHash: solanaTransactions.evidenceHash,
        }).from(solanaTransactions).where(and(
          eq(solanaTransactions.cluster, namespace.cluster),
          eq(solanaTransactions.programId, namespace.programId),
          eq(solanaTransactions.signature, tx.signature),
        )).limit(1);
        if (existingTransactions[0]) {
          const existing = existingTransactions[0];
          const conflicts = [
            existing.slot !== tx.slot ? "slot" : null,
            existing.blockhash !== tx.blockhash ? "blockhash" : null,
            existing.success !== tx.success ? "success" : null,
            existing.evidenceHash !== evidenceHash ? "evidenceHash" : null,
          ].filter(Boolean);
          if (conflicts.length > 0) {
            throw new Error(`Conflicting finalized transaction ${tx.signature} (${conflicts.join(", ")})`);
          }
        } else {
          await transaction.insert(solanaTransactions).values(transactionValue);
        }
        const raw = tx.raw as any;
        const rawKeys = raw.transaction?.message?.accountKeys ?? [];
        const preBalances = raw.meta?.preBalances ?? [];
        const postBalances = raw.meta?.postBalances ?? [];
        const preTokens = new Map<number, Record<string, unknown>>(
          (raw.meta?.preTokenBalances ?? []).map((balance: any) => [Number(balance.accountIndex), balance]),
        );
        const postTokens = new Map<number, Record<string, unknown>>(
          (raw.meta?.postTokenBalances ?? []).map((balance: any) => [Number(balance.accountIndex), balance]),
        );
        const transitions = rawKeys.flatMap((key: any, accountIndex: number) => {
          const pubkey = typeof key === "string" ? key : String(key.pubkey);
          const preLamports = preBalances[accountIndex] == null ? null : String(preBalances[accountIndex]);
          const postLamports = postBalances[accountIndex] == null ? null : String(postBalances[accountIndex]);
          const preTokenBalance = preTokens.get(accountIndex) ?? null;
          const postTokenBalance = postTokens.get(accountIndex) ?? null;
          const writable = typeof key === "object" && Boolean(key.writable);
          if (
            !writable &&
            preLamports === postLamports &&
            stableJson(preTokenBalance) === stableJson(postTokenBalance)
          ) return [];
          return [{
            cluster: namespace.cluster,
            programId: namespace.programId,
            signature: tx.signature,
            slot: tx.slot,
            pubkey,
            accountIndex,
            writable,
            preLamports,
            postLamports,
            preTokenBalance,
            postTokenBalance,
          }];
        });
        if (transitions.length > 0) {
          await transaction.insert(solanaAccountTransitions).values(transitions).onConflictDoNothing();
        }
      }
      for (const snapshot of [...chunk.accounts].sort((left, right) => roleOrder[left.role] - roleOrder[right.role])) {
        await projectSnapshot(transaction, namespace, snapshot, cpmmProgramId);
      }
      for (const tx of chunk.transactions) {
        for (const instruction of tx.instructions) {
          await projectInstruction(transaction, namespace, tx, instruction, cpmmProgramId);
        }
      }
      await transaction.insert(solanaCheckpoints).values({
        cluster: namespace.cluster,
        programId: namespace.programId,
        ...chunk.checkpoint,
      }).onConflictDoUpdate({
        target: [solanaCheckpoints.cluster, solanaCheckpoints.programId],
        set: { ...chunk.checkpoint, updatedAt: new Date() },
      });
  }

  async atomicChunk(namespace: SolanaNamespace, chunk: SolanaChunk): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await this.persistChunk(transaction, namespace, chunk);
    });
  }

  async atomicPass(chunks: Array<{ namespace: SolanaNamespace; chunk: SolanaChunk }>): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const { namespace, chunk } of chunks) {
        await this.validateChunkTransactions(transaction, namespace, chunk);
      }
      for (const { namespace, chunk } of chunks) {
        await this.persistChunk(transaction, namespace, chunk);
      }
    });
  }

  async listLaunches(namespace: SolanaNamespace): Promise<ProjectedLaunch[]> {
    const launches = await this.database.select().from(solanaLaunchStates).where(and(
      eq(solanaLaunchStates.cluster, namespace.cluster),
      eq(solanaLaunchStates.programId, namespace.programId),
    )).orderBy(asc(solanaLaunchStates.observedSlot));
    const mints = await this.database.select().from(solanaMints).where(eq(solanaMints.cluster, namespace.cluster));
    const pools = await this.database.select().from(solanaCpmmPools).where(eq(solanaCpmmPools.cluster, namespace.cluster));
    const mintByAddress = new Map(mints.map((mint) => [mint.mint, mint]));
    return launches.filter((row) => row.status !== "platform").map((row) => {
      const mint = row.baseMint ? mintByAddress.get(row.baseMint) : undefined;
      const pool = pools.find((candidate) => candidate.launchState === row.launchState);
      return {
        cluster: namespace.cluster,
        programId: namespace.programId,
        launchState: row.launchState,
        baseMint: row.baseMint,
        quoteMint: row.quoteMint,
        creator: row.creator,
        platform: row.platform,
        baseVault: row.baseVault,
        quoteVault: row.quoteVault,
        status: row.status,
        virtualBase: row.virtualBase,
        virtualQuote: row.virtualQuote,
        realBase: row.realBase,
        realQuote: row.realQuote,
        mintAuthority: mint?.mintAuthority,
        freezeAuthority: mint?.freezeAuthority,
        mintSupply: mint?.supply,
        cpmmPool: pool?.pool,
        observedSlot: row.observedSlot,
        observedSignature: row.observedSignature,
        accountHash: row.accountHash,
        decoded: Object.keys(row.rawState).length > 0,
      };
    });
  }

  async getLaunch(namespace: SolanaNamespace, launchState: string): Promise<ProjectedLaunch | null> {
    const launches = await this.listLaunches(namespace);
    return launches.find((launch) => launch.launchState === launchState) ?? null;
  }

  async listTrades(
    namespace: SolanaNamespace,
    launchState: string,
    limit = 100,
  ): Promise<ProjectedTrade[]> {
    const rows = await this.database.select({
      cluster: solanaTrades.cluster,
      programId: solanaTrades.programId,
      signature: solanaTrades.signature,
      instructionIndex: solanaTrades.instructionIndex,
      innerInstructionIndex: solanaTrades.innerInstructionIndex,
      slot: solanaTrades.slot,
      launchState: solanaTrades.launchState,
      trader: solanaTrades.trader,
      side: solanaTrades.side,
      baseAmount: solanaTrades.baseAmount,
      quoteAmount: solanaTrades.quoteAmount,
      feeAmount: solanaTrades.feeAmount,
    }).from(solanaTrades).where(and(
      eq(solanaTrades.cluster, namespace.cluster),
      eq(solanaTrades.programId, namespace.programId),
      eq(solanaTrades.launchState, launchState),
    )).orderBy(asc(solanaTrades.slot), asc(solanaTrades.instructionIndex), asc(solanaTrades.innerInstructionIndex))
      .limit(Math.max(1, Math.min(500, limit)));
    return rows.map((row) => {
      if (!row.signature) throw new Error("Projected finalized trade omitted its signature");
      return {
        ...row,
        cluster: namespace.cluster,
        programId: namespace.programId,
        signature: row.signature,
      };
    });
  }

  async listTrackedAccounts(namespace: SolanaNamespace): Promise<TrackedAccount[]> {
    const [launches, pools, vaults, mints] = await Promise.all([
      this.database.select({
        launchState: solanaLaunchStates.launchState,
        baseMint: solanaLaunchStates.baseMint,
        quoteMint: solanaLaunchStates.quoteMint,
        baseVault: solanaLaunchStates.baseVault,
        quoteVault: solanaLaunchStates.quoteVault,
        status: solanaLaunchStates.status,
      }).from(solanaLaunchStates).where(and(
        eq(solanaLaunchStates.cluster, namespace.cluster),
        eq(solanaLaunchStates.programId, namespace.programId),
      )),
      this.database.select({
        pool: solanaCpmmPools.pool,
        cpmmProgram: solanaCpmmPools.cpmmProgram,
        baseMint: solanaCpmmPools.baseMint,
        quoteMint: solanaCpmmPools.quoteMint,
        baseVault: solanaCpmmPools.baseVault,
        quoteVault: solanaCpmmPools.quoteVault,
        lpMint: solanaCpmmPools.lpMint,
      }).from(solanaCpmmPools).where(eq(solanaCpmmPools.cluster, namespace.cluster)),
      this.database.select({
        vault: solanaVaults.vault,
        tokenProgram: solanaVaults.tokenProgram,
      }).from(solanaVaults).where(and(
        eq(solanaVaults.cluster, namespace.cluster),
        eq(solanaVaults.programId, namespace.programId),
      )),
      this.database.select({
        mint: solanaMints.mint,
        tokenProgram: solanaMints.tokenProgram,
      }).from(solanaMints).where(eq(solanaMints.cluster, namespace.cluster)),
    ]);
    const tracked: TrackedAccount[] = [];
    const knownMintOwners = new Map(mints.map((row) => [row.mint, row.tokenProgram]));
    const knownVaultOwners = new Map(vaults.map((row) => [row.vault, row.tokenProgram]));
    const add = (
      pubkey: string | null | undefined,
      expectedRole: TrackedAccount["expectedRole"],
      expectedOwner?: string,
    ) => {
      if (pubkey) tracked.push({ pubkey, expectedRole, expectedOwner });
    };
    for (const row of launches) {
      add(row.launchState, row.status === "platform" ? "platform" : "launchState", namespace.programId);
      add(row.baseMint, "mint", row.baseMint ? knownMintOwners.get(row.baseMint) : undefined);
      add(row.quoteMint, "mint", row.quoteMint ? knownMintOwners.get(row.quoteMint) : undefined);
      add(row.baseVault, "vault", row.baseVault ? knownVaultOwners.get(row.baseVault) : undefined);
      add(row.quoteVault, "vault", row.quoteVault ? knownVaultOwners.get(row.quoteVault) : undefined);
    }
    for (const row of pools) {
      add(row.pool, "cpmmPool", row.cpmmProgram);
      add(row.baseMint, "mint", row.baseMint ? knownMintOwners.get(row.baseMint) : undefined);
      add(row.quoteMint, "mint", row.quoteMint ? knownMintOwners.get(row.quoteMint) : undefined);
      add(row.baseVault, "vault", row.baseVault ? knownVaultOwners.get(row.baseVault) : undefined);
      add(row.quoteVault, "vault", row.quoteVault ? knownVaultOwners.get(row.quoteVault) : undefined);
      add(row.lpMint, "mint", row.lpMint ? knownMintOwners.get(row.lpMint) : undefined);
    }
    for (const row of vaults) add(row.vault, "vault", row.tokenProgram);
    for (const row of mints) add(row.mint, "mint", row.tokenProgram);
    const unique = new Map<string, TrackedAccount>();
    for (const account of tracked) {
      const existing = unique.get(account.pubkey);
      if (existing && existing.expectedRole !== account.expectedRole) {
        throw new Error(`Conflicting tracked-account expectations for ${account.pubkey}`);
      }
      if (
        existing?.expectedOwner &&
        account.expectedOwner &&
        existing.expectedOwner !== account.expectedOwner
      ) throw new Error(`Conflicting tracked-account owners for ${account.pubkey}`);
      unique.set(account.pubkey, {
        ...account,
        expectedOwner: existing?.expectedOwner ?? account.expectedOwner,
      });
    }
    return [...unique.values()];
  }

  async recordReconciliation(namespace: SolanaNamespace, check: Reconciliation): Promise<void> {
    await this.database.insert(solanaReconciliations).values({
      cluster: namespace.cluster,
      programId: namespace.programId,
      ...check,
      signature: check.signature ?? null,
      delta: check.delta ?? null,
      details: check.details ?? "",
    }).onConflictDoUpdate({
      target: [
        solanaReconciliations.cluster,
        solanaReconciliations.programId,
        solanaReconciliations.entity,
        solanaReconciliations.account,
        solanaReconciliations.checkType,
      ],
      set: {
        slot: check.slot,
        signature: check.signature ?? null,
        actual: check.actual,
        expected: check.expected,
        delta: check.delta ?? null,
        healthy: check.healthy,
        details: check.details ?? "",
        checkedAt: new Date(),
      },
    });
  }

  async recordOperationalAlerts(
    namespace: SolanaNamespace,
    activeAlerts: IndexerAlert[],
    events: OperationalAlertEvent[],
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const alert of activeAlerts) {
        await transaction.insert(solanaOperationalAlerts).values({
          cluster: namespace.cluster,
          programId: namespace.programId,
          code: alert.code,
          severity: alert.severity,
          message: alert.message,
          action: alert.action,
          observedValue: alert.observedValue,
          threshold: alert.threshold,
          firstObservedAt: new Date(alert.firstObservedAt),
          lastObservedAt: new Date(alert.lastObservedAt),
          recoveredAt: null,
          active: true,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [
            solanaOperationalAlerts.cluster,
            solanaOperationalAlerts.programId,
            solanaOperationalAlerts.code,
          ],
          set: {
            severity: alert.severity,
            message: alert.message,
            action: alert.action,
            observedValue: alert.observedValue,
            threshold: alert.threshold,
            firstObservedAt: new Date(alert.firstObservedAt),
            lastObservedAt: new Date(alert.lastObservedAt),
            recoveredAt: null,
            active: true,
            updatedAt: new Date(),
          },
        });
      }
      for (const event of events) {
        const code = event.event === "active"
          ? String((event.notification["alert"] as Record<string, unknown>)?.["code"] ?? "")
          : String(event.notification["code"] ?? "");
        if (!code) throw new Error("Operational alert outbox event omitted its code");
        await transaction.insert(solanaAlertOutbox).values({
          cluster: namespace.cluster,
          programId: namespace.programId,
          code,
          deliveryKey: event.deliveryKey,
          event: event.event,
          notification: event.notification,
          nextAttemptAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        if (event.event === "recovered") {
          await transaction.update(solanaOperationalAlerts).set({
            active: false,
            recoveredAt: new Date(String(event.notification["recoveredAt"])),
            updatedAt: new Date(),
          }).where(and(
            eq(solanaOperationalAlerts.cluster, namespace.cluster),
            eq(solanaOperationalAlerts.programId, namespace.programId),
            eq(solanaOperationalAlerts.code, code),
          ));
        }
      }
    });
  }

  async listActiveOperationalAlerts(namespace: SolanaNamespace): Promise<IndexerAlert[]> {
    const rows = await this.database.select({
      code: solanaOperationalAlerts.code,
      severity: solanaOperationalAlerts.severity,
      message: solanaOperationalAlerts.message,
      action: solanaOperationalAlerts.action,
      observedValue: solanaOperationalAlerts.observedValue,
      threshold: solanaOperationalAlerts.threshold,
      firstObservedAt: solanaOperationalAlerts.firstObservedAt,
      lastObservedAt: solanaOperationalAlerts.lastObservedAt,
    }).from(solanaOperationalAlerts).where(and(
      eq(solanaOperationalAlerts.cluster, namespace.cluster),
      eq(solanaOperationalAlerts.programId, namespace.programId),
      eq(solanaOperationalAlerts.active, true),
    )).orderBy(asc(solanaOperationalAlerts.firstObservedAt));
    return rows.map((row) => ({
      code: row.code as IndexerAlert["code"],
      severity: row.severity as IndexerAlert["severity"],
      message: row.message,
      action: row.action,
      observedValue: row.observedValue,
      threshold: row.threshold,
      firstObservedAt: row.firstObservedAt.toISOString(),
      lastObservedAt: row.lastObservedAt.toISOString(),
    }));
  }

  async listPendingOperationalAlertDeliveries(
    namespace: SolanaNamespace,
    limit = 25,
  ): Promise<OperationalAlertDelivery[]> {
    const rows = await this.database.select({
      cluster: solanaAlertOutbox.cluster,
      programId: solanaAlertOutbox.programId,
      code: solanaAlertOutbox.code,
      deliveryKey: solanaAlertOutbox.deliveryKey,
      notification: solanaAlertOutbox.notification,
      attempts: solanaAlertOutbox.attempts,
    }).from(solanaAlertOutbox).where(and(
      eq(solanaAlertOutbox.cluster, namespace.cluster),
      eq(solanaAlertOutbox.programId, namespace.programId),
      isNull(solanaAlertOutbox.deliveredAt),
      lte(solanaAlertOutbox.nextAttemptAt, new Date()),
    )).orderBy(asc(solanaAlertOutbox.nextAttemptAt)).limit(Math.max(1, Math.min(100, limit)));
    return rows.map((row) => ({
      ...row,
      cluster: namespace.cluster,
      programId: namespace.programId,
      code: row.code as OperationalAlertDelivery["code"],
    }));
  }

  async markOperationalAlertDelivery(
    delivery: OperationalAlertDelivery,
    delivered: boolean,
    error?: string,
  ): Promise<void> {
    const nextAttemptAt = new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** Math.min(delivery.attempts, 6)));
    await this.database.update(solanaAlertOutbox).set(
      delivered
        ? { deliveredAt: new Date(), lastError: null, updatedAt: new Date() }
        : {
            attempts: sql`${solanaAlertOutbox.attempts} + 1`,
            nextAttemptAt,
            lastError: error?.slice(0, 1_000) ?? "alert delivery failed",
            updatedAt: new Date(),
          },
    ).where(and(
      eq(solanaAlertOutbox.cluster, delivery.cluster),
      eq(solanaAlertOutbox.programId, delivery.programId),
      eq(solanaAlertOutbox.code, delivery.code),
      eq(solanaAlertOutbox.deliveryKey, delivery.deliveryKey),
      isNull(solanaAlertOutbox.deliveredAt),
    ));
  }
}
