import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import * as schema from "@workspace/db/schema";
import { SqlSolanaStore } from "./store";
import type { AccountSnapshot, FinalizedTransaction, IndexerAlert, SolanaChunk, SolanaNamespace } from "./types";

const namespace: SolanaNamespace = {
  cluster: "devnet",
  programId: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
};

const DDL = `
  create table solana_checkpoints (
    cluster text not null, program_id text not null, last_finalized_slot integer not null,
    scanned_through_slot integer, oldest_signature text, newest_signature text,
    backfill_complete boolean not null default false,
    updated_at timestamptz not null default now(), primary key (cluster, program_id)
  );
  create table solana_operational_alerts (
    cluster text not null, program_id text not null, code text not null, severity text not null,
    message text not null, action text not null, observed_value integer not null, threshold integer not null,
    first_observed_at timestamptz not null, last_observed_at timestamptz not null, recovered_at timestamptz,
    active boolean not null default true, updated_at timestamptz not null default now(),
    primary key (cluster, program_id, code)
  );
  create table solana_alert_outbox (
    cluster text not null, program_id text not null, code text not null, delivery_key text not null,
    event text not null, notification jsonb not null, attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(), delivered_at timestamptz, last_error text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    primary key (cluster, program_id, code, delivery_key)
  );
  create table solana_transactions (
    cluster text not null, program_id text not null, signature text not null, slot integer not null,
    blockhash text not null, block_time integer, success boolean not null, transaction jsonb not null,
    evidence_hash text not null,
    created_at timestamptz not null default now(), primary key (cluster, program_id, signature)
  );
  create table solana_instruction_journal (
    cluster text not null, program_id text not null, signature text not null,
    instruction_index integer not null, inner_instruction_index integer not null default -1,
    slot integer not null, blockhash text not null, instruction_program text not null,
    kind text not null, accounts text[] not null, data text not null, payload jsonb not null,
    created_at timestamptz not null default now(),
    primary key (cluster, program_id, signature, instruction_index, inner_instruction_index)
  );
  create table solana_account_transitions (
    cluster text not null, program_id text not null, signature text not null, slot integer not null,
    pubkey text not null, account_index integer not null, writable boolean not null,
    pre_lamports text, post_lamports text, pre_token_balance jsonb, post_token_balance jsonb,
    created_at timestamptz not null default now(),
    primary key (cluster, program_id, signature, account_index)
  );
  create table solana_account_snapshots (
    cluster text not null, program_id text not null, pubkey text not null, slot integer not null,
    signature text, owner text not null, lamports text not null, executable boolean not null,
    data_base64 text not null, data_hash text not null, role text not null,
    decoder_version integer not null default 1, decoded jsonb,
    created_at timestamptz not null default now(), primary key (cluster, program_id, pubkey, slot)
  );
  create table solana_launch_states (
    cluster text not null, program_id text not null, launch_state text not null,
    base_mint text, quote_mint text, creator text, platform text, base_vault text, quote_vault text,
    status text not null default 'unknown', virtual_base text, virtual_quote text, real_base text, real_quote text,
    raw_state jsonb not null default '{}', observed_slot integer not null, observed_signature text,
    account_hash text not null, updated_at timestamptz not null default now(),
    primary key (cluster, program_id, launch_state)
  );
  create table solana_trades (
    cluster text not null, program_id text not null, signature text not null,
    instruction_index integer not null, inner_instruction_index integer not null default -1,
    slot integer not null, launch_state text, trader text, side text not null default 'unknown',
    base_amount text, quote_amount text, fee_amount text, raw_instruction jsonb not null,
    created_at timestamptz not null default now(),
    primary key (cluster, program_id, signature, instruction_index, inner_instruction_index)
  );
  create table solana_vaults (
    cluster text not null, program_id text not null, vault text not null, launch_state text, pool text,
    mint text, authority text, amount text, token_program text not null, raw_state jsonb not null default '{}',
    observed_slot integer not null, observed_signature text, account_hash text not null,
    updated_at timestamptz not null default now(), primary key (cluster, program_id, vault)
  );
  create table solana_mints (
    cluster text not null, mint text not null, token_program text not null, decimals integer, supply text,
    mint_authority text, freeze_authority text, initialized boolean, raw_state jsonb not null default '{}',
    observed_slot integer not null, observed_signature text, account_hash text not null,
    updated_at timestamptz not null default now(), primary key (cluster, mint)
  );
  create table solana_cpmm_pools (
    cluster text not null, cpmm_program text not null, pool text not null, launch_state text, config text,
    authority text, base_mint text, quote_mint text, base_vault text, quote_vault text, lp_mint text,
    base_reserve text, quote_reserve text, lp_supply text, status text not null default 'unknown',
    raw_state jsonb not null default '{}',
    observed_slot integer not null, observed_signature text, account_hash text not null,
    updated_at timestamptz not null default now(), primary key (cluster, cpmm_program, pool)
  );
  create table solana_mint_authority_history (
    cluster text not null, mint text not null, slot integer not null, signature text,
    mint_authority text, freeze_authority text, supply text, account_hash text not null,
    authority_type text, raw_instruction jsonb, created_at timestamptz not null default now(),
    primary key (cluster, mint, slot, account_hash)
  );
`;

async function fixture() {
  const memory = newDb();
  memory.public.none(DDL);
  const adapter = memory.adapters.createPg();
  for (const Constructor of [adapter.Pool, adapter.Client]) {
    const originalQuery = Constructor.prototype.query;
    Constructor.prototype.query = async function query(this: any, config: any, ...args: any[]) {
      if (config && typeof config === "object" && ("types" in config || "rowMode" in config)) {
        const arrayRows = config.rowMode === "array";
        const compatible = { ...config };
        delete compatible.types;
        delete compatible.rowMode;
        const result = await originalQuery.call(this, compatible, ...args);
        if (arrayRows && result.rows.length > 0 && !Array.isArray(result.rows[0])) {
          result.rows = result.rows.map((row: Record<string, unknown>) => Object.values(row));
        }
        return result;
      }
      return originalQuery.call(this, config, ...args);
    } as any;
  }
  const pool = new adapter.Pool();
  const database = drizzle(pool as any, { schema });
  return { pool, store: new SqlSolanaStore(database as any) };
}

function transaction(signature: string, slot: number, blockhash = `block-${slot}`): FinalizedTransaction {
  return {
    signature,
    slot,
    blockhash,
    blockTime: null,
    success: true,
    instructions: [],
    raw: {
      slot,
      transaction: {
        message: {
          recentBlockhash: blockhash,
          accountKeys: [{ pubkey: "Account111111111111111111111111111111111", writable: true, signer: false }],
        },
      },
      meta: { err: null, preBalances: [10], postBalances: [9], preTokenBalances: [], postTokenBalances: [] },
    },
  };
}

function snapshot(slot: number): AccountSnapshot {
  return {
    pubkey: "Account111111111111111111111111111111111",
    slot,
    signature: null,
    owner: "11111111111111111111111111111111",
    lamports: String(slot),
    executable: false,
    dataBase64: "",
    dataHash: slot.toString(16).padStart(64, "0"),
    role: "unknown",
  };
}

function chunk(tx: FinalizedTransaction, accounts: AccountSnapshot[] = []): SolanaChunk {
  return {
    transactions: [tx],
    accounts,
    checkpoint: {
      lastFinalizedSlot: tx.slot,
      oldestSignature: tx.signature,
      newestSignature: tx.signature,
      backfillComplete: true,
    },
  };
}

test("SQL store replays exact chunks and retains causal transitions", async () => {
  const { pool, store } = await fixture();
  const value = chunk(transaction("signature-1", 100));
  await store.atomicChunk(namespace, value);
  await store.atomicChunk(namespace, value);
  assert.equal(Number((await pool.query("select count(*) from solana_transactions")).rows[0].count), 1);
  assert.equal(Number((await pool.query("select count(*) from solana_account_transitions")).rows[0].count), 1);
  assert.equal((await pool.query("select last_finalized_slot from solana_checkpoints")).rows[0].last_finalized_slot, 100);
  await pool.end();
});

test("SQL store rolls back observations and checkpoint changes on a conflicting replay", async () => {
  const { pool, store } = await fixture();
  await store.atomicChunk(namespace, chunk(transaction("signature-1", 100)));
  const conflicting = chunk(transaction("signature-1", 101, "conflicting-block"), [snapshot(101)]);
  await assert.rejects(store.atomicChunk(namespace, conflicting), /Conflicting finalized transaction/);
  assert.equal(Number((await pool.query("select count(*) from solana_account_snapshots")).rows[0].count), 0);
  assert.equal((await pool.query("select last_finalized_slot from solana_checkpoints")).rows[0].last_finalized_slot, 100);
  await pool.end();
});

test("SQL store retains separate finalized observations for the same account", async () => {
  const { pool, store } = await fixture();
  await store.atomicChunk(namespace, chunk(transaction("signature-1", 100), [snapshot(100)]));
  await store.atomicChunk(namespace, chunk(transaction("signature-2", 101), [snapshot(101)]));
  const rows = await pool.query("select slot from solana_account_snapshots order by slot");
  assert.deepEqual(rows.rows.map((row: any) => row.slot), [100, 101]);
  await pool.end();
});

test("SQL store retains and replays standalone mint-authority evidence exactly once", async () => {
  const { pool, store } = await fixture();
  const mint = "Mint111111111111111111111111111111111111";
  const tx = transaction("authority-signature", 120);
  tx.instructions = [{
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    instructionIndex: 0,
    innerInstructionIndex: -1,
    accounts: [mint],
    data: "",
    kind: "token",
    payload: {
      type: "setAuthority",
      info: { account: mint, authorityType: "mintTokens", newAuthority: null },
    },
  }];
  const value = chunk(tx);
  const mintNamespace: SolanaNamespace = { cluster: "devnet", programId: `mint:${mint}` };
  await store.atomicChunk(mintNamespace, value);
  await store.atomicChunk(mintNamespace, value);
  assert.equal(Number((await pool.query("select count(*) from solana_instruction_journal")).rows[0].count), 1);
  assert.equal(Number((await pool.query("select count(*) from solana_mint_authority_history")).rows[0].count), 1);
  await pool.end();
});

test("SQL store rolls back every namespace when one chunk in an atomic pass conflicts", async () => {
  const { pool, store } = await fixture();
  const mintNamespace: SolanaNamespace = {
    cluster: "devnet",
    programId: "mint:Mint111111111111111111111111111111111111",
  };
  await store.atomicChunk(namespace, chunk(transaction("main-seed", 100)));
  await store.atomicChunk(mintNamespace, chunk(transaction("mint-seed", 100)));

  await assert.rejects(store.atomicPass([
    { namespace, chunk: chunk(transaction("main-next", 101)) },
    { namespace: mintNamespace, chunk: chunk(transaction("mint-seed", 101, "conflicting-mint-block")) },
  ]), /Conflicting finalized transaction/);

  assert.equal(Number((await pool.query("select count(*) from solana_transactions where signature = 'main-next'")).rows[0].count), 0);
  const mainCheckpoint = await pool.query(
    "select last_finalized_slot from solana_checkpoints where program_id = $1",
    [namespace.programId],
  );
  assert.equal(mainCheckpoint.rows[0].last_finalized_slot, 100);
  await pool.end();
});

test("SQL store projects a decoded LaunchLab state and tracks both mints and vaults", async () => {
  const { pool, store } = await fixture();
  const launchState = "Launch1111111111111111111111111111111111";
  const baseMint = "Base111111111111111111111111111111111111";
  const quoteMint = "Quote11111111111111111111111111111111111";
  const baseVault = "VaultA1111111111111111111111111111111111";
  const quoteVault = "VaultB1111111111111111111111111111111111";
  const launchSnapshot: AccountSnapshot = {
    pubkey: launchState,
    slot: 120,
    signature: null,
    owner: namespace.programId,
    lamports: "1",
    executable: false,
    dataBase64: "canonical-429-byte-fixture",
    dataHash: "e".repeat(64),
    role: "launchState",
    decoded: {
      status: "0",
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      creator: "Creator111111111111111111111111111111111",
      platform: "Platform11111111111111111111111111111111",
      mintProgramFlag: 0,
    },
  };
  await store.atomicChunk(namespace, {
    transactions: [],
    accounts: [launchSnapshot],
    checkpoint: {
      lastFinalizedSlot: 120,
      oldestSignature: null,
      newestSignature: null,
      backfillComplete: true,
    },
  });
  assert.equal((await store.listLaunches(namespace))[0]?.launchState, launchState);
  const tracked = await store.listTrackedAccounts(namespace);
  for (const [pubkey, expectedRole] of [
    [baseMint, "mint"],
    [quoteMint, "mint"],
    [baseVault, "vault"],
    [quoteVault, "vault"],
  ] as const) {
    assert.ok(tracked.some((account) => account.pubkey === pubkey && account.expectedRole === expectedRole));
  }
  await pool.end();
});

test("SQL store projects finalized LaunchLab trades and returns market history oldest first", async () => {
  const { pool, store } = await fixture();
  const launchState = "Launch1111111111111111111111111111111111";
  const first = transaction("trade-1", 121);
  first.instructions = [{
    programId: namespace.programId,
    instructionIndex: 0,
    innerInstructionIndex: -1,
    accounts: [launchState],
    data: "trade-data-1",
    kind: "trade",
    payload: { side: "buy", baseAmount: "10", quoteAmount: "20" },
  }];
  const second = transaction("trade-2", 122);
  second.instructions = [{
    programId: namespace.programId,
    instructionIndex: 1,
    innerInstructionIndex: -1,
    accounts: [launchState],
    data: "trade-data-2",
    kind: "trade",
    payload: { side: "sell", baseAmount: "4", quoteAmount: "8", feeAmount: "1" },
  }];
  const launchSnapshot: AccountSnapshot = {
    pubkey: launchState,
    slot: 120,
    signature: null,
    owner: namespace.programId,
    lamports: "1",
    executable: false,
    dataBase64: "launch",
    dataHash: "f".repeat(64),
    role: "launchState",
    decoded: { status: "0" },
  };
  await store.atomicChunk(namespace, chunk(first, [launchSnapshot]));
  await store.atomicChunk(namespace, chunk(second));

  const history = await store.listTrades(namespace, launchState);
  assert.deepEqual(history.map((trade) => [trade.signature, trade.side, trade.baseAmount]), [
    ["trade-1", "buy", "10"],
    ["trade-2", "sell", "4"],
  ]);
  assert.equal(history[1]?.feeAmount, "1");
  await pool.end();
});

test("SQL store keeps alert state and pending delivery isolated by namespace", async () => {
  const { pool, store } = await fixture();
  const alert: IndexerAlert = {
    code: "RECONCILIATION_FAILURE",
    severity: "critical",
    message: "reconciliation failed",
    action: "inspect evidence",
    observedValue: 1,
    threshold: 1,
    firstObservedAt: "2026-09-14T10:00:00.000Z",
    lastObservedAt: "2026-09-14T10:01:00.000Z",
  };
  const notification = {
    event: "active" as const,
    alert,
    cluster: namespace.cluster,
    programId: namespace.programId,
  };
  await store.recordOperationalAlerts(namespace, [alert], [{
    deliveryKey: "active:incident-1",
    event: "active",
    notification,
  }]);
  const otherNamespace: SolanaNamespace = { cluster: "mainnet-beta", programId: namespace.programId };
  await store.recordOperationalAlerts(otherNamespace, [alert], [{
    deliveryKey: "active:incident-1",
    event: "active",
    notification: { ...notification, cluster: otherNamespace.cluster },
  }]);

  assert.equal((await store.listActiveOperationalAlerts(namespace)).length, 1);
  assert.equal((await store.listActiveOperationalAlerts(otherNamespace)).length, 1);
  assert.equal((await store.listPendingOperationalAlertDeliveries(namespace)).length, 1);
  assert.equal((await store.listPendingOperationalAlertDeliveries(otherNamespace)).length, 1);
  const pending = (await store.listPendingOperationalAlertDeliveries(namespace))[0]!;
  await store.markOperationalAlertDelivery(pending, true);
  assert.equal((await store.listPendingOperationalAlertDeliveries(namespace)).length, 0);
  assert.equal(Number((await pool.query(
    "select count(*) from solana_operational_alerts where cluster = 'devnet' and active = true",
  )).rows[0].count), 1);
  assert.equal(Number((await pool.query(
    "select count(*) from solana_operational_alerts where cluster = 'mainnet-beta' and active = true",
  )).rows[0].count), 1);

  const recovered = {
    event: "recovered" as const,
    code: alert.code,
    cluster: namespace.cluster,
    programId: namespace.programId,
    recoveredAt: "2026-09-14T10:02:00.000Z",
  };
  await store.recordOperationalAlerts(namespace, [], [{
    deliveryKey: "recovered:RECONCILIATION_FAILURE:2026-09-14T10:00:00.000Z",
    event: "recovered",
    notification: recovered,
  }]);
  await store.recordOperationalAlerts(namespace, [], [{
    deliveryKey: "recovered:RECONCILIATION_FAILURE:2026-09-14T10:00:00.000Z",
    event: "recovered",
    notification: recovered,
  }]);
  assert.equal((await store.listActiveOperationalAlerts(namespace)).length, 0);
  const recoveryDeliveries = await store.listPendingOperationalAlertDeliveries(namespace);
  assert.equal(recoveryDeliveries.length, 1);
  assert.equal((recoveryDeliveries[0]?.notification as { event?: string }).event, "recovered");
  await pool.end();
});