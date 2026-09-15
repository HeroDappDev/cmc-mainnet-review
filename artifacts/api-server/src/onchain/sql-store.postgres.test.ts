import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";
import { SqlSolanaStore } from "./store";
import type { AccountSnapshot, FinalizedTransaction, SolanaChunk, SolanaNamespace } from "./types";

const { Pool } = pg;
const databaseUrl = process.env.ONCHAIN_REAL_PG_TEST_URL;

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
    evidence_hash text not null, created_at timestamptz not null default now(),
    primary key (cluster, program_id, signature)
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
    created_at timestamptz not null default now(),
    primary key (cluster, program_id, pubkey, slot)
  );
  create table solana_launch_states (
    cluster text not null, program_id text not null, launch_state text not null,
    base_mint text, quote_mint text, creator text, platform text, base_vault text, quote_vault text,
    status text not null default 'unknown', virtual_base text, virtual_quote text,
    real_base text, real_quote text, raw_state jsonb not null default '{}',
    observed_slot integer not null, observed_signature text, account_hash text not null,
    updated_at timestamptz not null default now(),
    primary key (cluster, program_id, launch_state)
  );
  create table solana_instruction_journal (
    cluster text not null, program_id text not null, signature text not null,
    instruction_index integer not null, inner_instruction_index integer not null default -1,
    slot integer not null, blockhash text not null, instruction_program text not null,
    kind text not null, accounts text[] not null, data text not null, payload jsonb not null,
    created_at timestamptz not null default now(),
    primary key (cluster, program_id, signature, instruction_index, inner_instruction_index)
  );
`;

const namespace: SolanaNamespace = {
  cluster: "devnet",
  programId: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
};

async function fixture() {
  assert.ok(databaseUrl);
  const schemaName = `solana_store_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema "${schemaName}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schemaName}`,
    max: 4,
  });
  // A backend terminated by the dropped-connection test can emit an
  // asynchronous pool error in addition to rejecting the query promise.
  // Capture it on the pool so Node's EventEmitter does not treat the
  // intentionally induced disconnect as an uncaught exception.
  const poolErrors: Error[] = [];
  const capturePoolError = (error: Error) => { poolErrors.push(error); };
  pool.on("error", capturePoolError);
  const connect = pool.connect.bind(pool);
  (pool as any).connect = (...args: any[]) => {
    const callback = args[0];
    if (typeof callback === "function") {
      return connect((error: Error | undefined, client: any, release: () => void) => {
        if (client) client.on("error", capturePoolError);
        callback(error, client, release);
      });
    }
    return connect().then((client: any) => {
      client.on("error", capturePoolError);
      return client;
    });
  };
  await pool.query(DDL);
  const store = new SqlSolanaStore(drizzle(pool, { schema }) as any, pool);
  return {
    pool,
    store,
    poolErrors,
    async cleanup() {
      pool.off("error", capturePoolError);
      await pool.end();
      await admin.query(`drop schema "${schemaName}" cascade`);
      await admin.end();
    },
  };
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
          accountKeys: [{
            pubkey: "Account111111111111111111111111111111111",
            writable: true,
            signer: false,
          }],
        },
      },
      meta: {
        err: null,
        preBalances: [10],
        postBalances: [9],
        preTokenBalances: [],
        postTokenBalances: [],
      },
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
    role: "launchState",
    decoded: { status: "trading" },
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

test("real PostgreSQL rolls back journal, projections, and checkpoint on a mid-chunk SQL fault", {
  skip: databaseUrl ? false : "ONCHAIN_REAL_PG_TEST_URL is required for PostgreSQL integration tests",
}, async () => {
  const { pool, store, cleanup } = await fixture();
  try {
    const tx = transaction("faulted-signature", 101);
    tx.instructions = [{
      programId: namespace.programId,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [snapshot(101).pubkey],
      data: "launch",
      kind: "launch",
      payload: {},
    }];
    await pool.query(`
      create function reject_instruction() returns trigger language plpgsql as $$
      begin raise exception 'injected instruction failure'; end
      $$;
      create trigger reject_instruction before insert on solana_instruction_journal
      for each row execute function reject_instruction();
    `);

    await assert.rejects(
      store.atomicChunk(namespace, chunk(tx, [snapshot(101)])),
      (error: Error & { cause?: Error }) => {
        assert.match(error.message, /insert into "solana_instruction_journal"/);
        assert.match(error.cause?.message ?? "", /injected instruction failure/);
        return true;
      },
    );

    for (const table of [
      "solana_transactions",
      "solana_account_transitions",
      "solana_account_snapshots",
      "solana_launch_states",
      "solana_instruction_journal",
      "solana_checkpoints",
    ]) {
      const result = await pool.query(`select count(*)::int as count from ${table}`);
      assert.equal(result.rows[0].count, 0, `${table} must roll back`);
    }
  } finally {
    await cleanup();
  }
});

test("real PostgreSQL rolls back every namespace when the atomic pass connection drops", {
  skip: databaseUrl ? false : "ONCHAIN_REAL_PG_TEST_URL is required for PostgreSQL integration tests",
}, async () => {
  const { pool, store, poolErrors, cleanup } = await fixture();
  try {
    await pool.query(`
      create function terminate_atomic_pass_connection() returns trigger language plpgsql as $$
      begin
        perform pg_terminate_backend(pg_backend_pid());
        return new;
      end
      $$;
      create trigger terminate_atomic_pass_connection
      before insert on solana_instruction_journal
      for each row execute function terminate_atomic_pass_connection();
    `);
    const firstTransaction = transaction("dropped-first", 301);
    firstTransaction.instructions = [{
      programId: namespace.programId,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [snapshot(301).pubkey],
      data: "first",
      kind: "launch",
      payload: {},
    }];
    const secondNamespace: SolanaNamespace = { cluster: "mainnet-beta", programId: namespace.programId };
    const secondTransaction = transaction("dropped-second", 302);
    secondTransaction.instructions = [{
      programId: secondNamespace.programId,
      instructionIndex: 0,
      innerInstructionIndex: -1,
      accounts: [snapshot(302).pubkey],
      data: "second",
      kind: "launch",
      payload: {},
    }];

    await assert.rejects(store.atomicPass([
      { namespace, chunk: chunk(firstTransaction, [snapshot(301)]) },
      { namespace: secondNamespace, chunk: chunk(secondTransaction, [snapshot(302)]) },
    ]));
    // pg can report the terminated backend through the pool on a later turn,
    // after atomicPass has rejected. Let that event settle before assertions.
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(
      poolErrors.some((error) => /Connection terminated unexpectedly|terminating connection/i.test(error.message)),
      `expected the intentional backend termination to be captured; got ${poolErrors.map((error) => error.message).join("; ")}`,
    );

    // The pool discards the terminated session and reconnects for these
    // assertions. No first-namespace history, second-namespace history, or
    // checkpoint may survive the failed transaction.
    for (const table of [
      "solana_transactions",
      "solana_account_transitions",
      "solana_account_snapshots",
      "solana_launch_states",
      "solana_instruction_journal",
      "solana_checkpoints",
    ]) {
      const result = await pool.query(`select count(*)::int as count from ${table}`);
      assert.equal(result.rows[0].count, 0, `${table} must roll back after connection loss`);
    }
  } finally {
    await cleanup();
  }
});

test("real PostgreSQL accepts exact replay and rejects conflicting finalized metadata", {
  skip: databaseUrl ? false : "ONCHAIN_REAL_PG_TEST_URL is required for PostgreSQL integration tests",
}, async () => {
  const { pool, store, cleanup } = await fixture();
  try {
    const original = chunk(transaction("duplicate-signature", 200));
    await store.atomicChunk(namespace, original);
    await store.atomicChunk(namespace, original);

    assert.equal((await pool.query("select count(*)::int as count from solana_transactions")).rows[0].count, 1);
    assert.equal((await pool.query("select count(*)::int as count from solana_account_transitions")).rows[0].count, 1);

    await assert.rejects(
      store.atomicChunk(namespace, chunk(transaction("duplicate-signature", 201, "conflicting-blockhash"))),
      /Conflicting finalized transaction.*slot, blockhash, evidenceHash/,
    );
    assert.equal((await store.getCheckpoint(namespace))?.lastFinalizedSlot, 200);
  } finally {
    await cleanup();
  }
});

test("real PostgreSQL advisory lock serializes workers for the same namespace", {
  skip: databaseUrl ? false : "ONCHAIN_REAL_PG_TEST_URL is required for PostgreSQL integration tests",
}, async () => {
  const { store, cleanup } = await fixture();
  let releaseFirst!: () => void;
  let firstEntered!: () => void;
  const entered = new Promise<void>((resolve) => { firstEntered = resolve; });
  const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let secondEntered = false;

  try {
    const first = store.withNamespaceLock(namespace, async () => {
      firstEntered();
      await release;
    });
    await entered;
    const second = store.withNamespaceLock(namespace, async () => {
      secondEntered = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(secondEntered, false);
    releaseFirst();
    await Promise.all([first, second]);
    assert.equal(secondEntered, true);
  } finally {
    releaseFirst?.();
    await cleanup();
  }
});