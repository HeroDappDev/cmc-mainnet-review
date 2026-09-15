import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySlippageDown,
  createPendingTransaction,
  formatIntegerUnits,
  assertWalletIntent,
  observePendingTransaction,
  parseIntegerUnits,
  persistPendingTransaction,
  quoteBuyFromReserves,
  readPendingTransactions,
  resolveCreateQuoteToken,
} from "../src/lib/onchain-helpers.ts";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const LAUNCHPAD = "0x2222222222222222222222222222222222222222";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REPLACEMENT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

function pending(kind = "buy", hash = HASH) {
  return createPendingTransaction(kind, hash, ACCOUNT, "Buy TGLD", LAUNCHPAD, 123, 1);
}

test("integer helpers never use floating point for quotes or minOut", () => {
  assert.equal(parseIntegerUnits("1.000000000000000001"), 1_000_000_000_000_000_001n);
  assert.equal(formatIntegerUnits(1_000_000_000_000_000_001n), "1");
  assert.equal(applySlippageDown(1_000n, 100n), 990n);
  const quote = quoteBuyFromReserves(
    1_000_000n,
    1_000n,
    900_000n,
    200n,
    100n,
  );
  assert.equal(quote.fee, 2n);
  assert.equal(quote.tokenOut, 89_253n);
});

test("zero slippage is valid but invalid values cannot be silently defaulted", () => {
  assert.equal(applySlippageDown(123n, 0n), 123n);
  assert.throws(() => applySlippageDown(123n, 10_000n), /Slippage/);
  assert.throws(() => applySlippageDown(123n, -1n), /Slippage/);
});

test("account switch during approval aborts the original follow-on intent", () => {
  assert.doesNotThrow(() => assertWalletIntent(ACCOUNT, ACCOUNT, 97));
  assert.throws(
    () => assertWalletIntent(ACCOUNT, "0x3333333333333333333333333333333333333333", 97),
    /account changed/,
  );
  assert.throws(
    () => assertWalletIntent(ACCOUNT, ACCOUNT, 56),
    /network changed/,
  );
});

test("mocked approval lifecycle does not sign a trade for a switched account", () => {
  const switched = "0x3333333333333333333333333333333333333333";
  const writes = [];
  let liveAccount = ACCOUNT;
  assertWalletIntent(ACCOUNT, liveAccount, 97);
  writes.push({ kind: "approval", account: ACCOUNT });
  // Simulate the wallet account event arriving while approval receipt polling
  // is still in flight. The second signature must not be attempted.
  liveAccount = switched;
  assert.throws(() => assertWalletIntent(ACCOUNT, liveAccount, 97), /account changed/);
  assert.deepEqual(writes, [{ kind: "approval", account: ACCOUNT }]);
});

test("account switch immediately after an approval hash cannot rewrite its confirmed receipt", async () => {
  let liveAccount = ACCOUNT;
  assertWalletIntent(ACCOUNT, liveAccount, 97);
  const hash = HASH;
  // The signer returned a hash: this approval is already submitted and must
  // be observed even if the wallet emits an account change immediately after.
  liveAccount = "0x3333333333333333333333333333333333333333";
  const result = await observePendingTransaction(
    pending("approval", hash),
    async () => ({ status: "success", transactionHash: hash }),
    storage(),
  );
  assert.equal(result.lifecycle, "confirmed");
  assert.equal(result.hash, hash);
  assert.equal(liveAccount !== ACCOUNT, true);
});

test("account switch after a trade hash still reports the exact mined receipt", async () => {
  let liveAccount = ACCOUNT;
  assertWalletIntent(ACCOUNT, liveAccount, 97);
  const hash = REPLACEMENT;
  liveAccount = "0x3333333333333333333333333333333333333333";
  const result = await observePendingTransaction(
    pending("buy", hash),
    async () => ({ status: "success", transactionHash: hash }),
    storage(),
  );
  assert.equal(result.lifecycle, "confirmed");
  assert.equal(result.hash, hash);
  assert.equal(liveAccount !== ACCOUNT, true);
});

test("market creation uses the configured quote even when selected market has another quote", () => {
  const configuredQuote = "0x4444444444444444444444444444444444444444";
  const selectedMarketQuote = "0x5555555555555555555555555555555555555555";
  assert.equal(resolveCreateQuoteToken(configuredQuote), configuredQuote);
  assert.notEqual(resolveCreateQuoteToken(configuredQuote), selectedMarketQuote);
});

test("wallet rejection is surfaced as cancelled and is not left pending", async () => {
  const target = storage();
  const result = await observePendingTransaction(
    pending(),
    async () => {
      const error = new Error("User rejected the request");
      error.code = 4001;
      throw error;
    },
    target,
  );
  assert.equal(result.lifecycle, "cancelled");
  assert.deepEqual(readPendingTransactions(target), []);
});

test("mined revert is distinct from wallet cancellation", async () => {
  const target = storage();
  const result = await observePendingTransaction(
    pending(),
    async () => ({ status: "reverted", transactionHash: HASH }),
    target,
  );
  assert.equal(result.lifecycle, "reverted");
  assert.deepEqual(readPendingTransactions(target), []);
});

test("repriced replacement follows the new transaction hash and reports a confirmed replacement", async () => {
  const target = storage();
  const result = await observePendingTransaction(
    pending(),
    async (_hash, options) => {
      options.onReplaced({
        reason: "repriced",
        // viem puts the new transaction in `transaction`; the old hash is
        // intentionally also present to catch following the wrong field.
        transaction: { hash: REPLACEMENT },
        replacedTransaction: { hash: HASH },
        transactionReceipt: { status: "success", transactionHash: REPLACEMENT },
      });
      return { status: "success", transactionHash: REPLACEMENT };
    },
    target,
  );
  assert.equal(result.lifecycle, "replaced");
  assert.equal(result.hash, REPLACEMENT);
  assert.deepEqual(readPendingTransactions(target), []);
});

test("arbitrary replacement is superseded and is not reported as a successful trade", async () => {
  const target = storage();
  const result = await observePendingTransaction(
    pending("sell"),
    async (_hash, options) => {
      options.onReplaced({
        reason: "replaced",
        transaction: { hash: REPLACEMENT },
        replacedTransaction: { hash: HASH },
        transactionReceipt: { status: "success", transactionHash: REPLACEMENT },
      });
      return { status: "success", transactionHash: REPLACEMENT };
    },
    target,
  );
  assert.equal(result.lifecycle, "superseded");
  assert.deepEqual(readPendingTransactions(target), []);
});

test("wallet cancellation replacement is not reported as a successful trade", async () => {
  const target = storage();
  const result = await observePendingTransaction(
    pending("approval"),
    async (_hash, options) => {
      options.onReplaced({
        reason: "cancelled",
        transaction: { hash: REPLACEMENT },
        replacedTransaction: { hash: HASH },
        transactionReceipt: { status: "success", transactionHash: REPLACEMENT },
      });
      return { status: "success", transactionHash: REPLACEMENT };
    },
    target,
  );
  assert.equal(result.lifecycle, "cancelled");
  assert.deepEqual(readPendingTransactions(target), []);
});

test("an unresolved transaction survives reload and can later be recovered", async () => {
  const target = storage();
  const item = pending("approval");
  persistPendingTransaction(item, target);
  assert.equal(readPendingTransactions(target)[0].hash, HASH);

  const stillPending = await observePendingTransaction(
    item,
    async () => {
      throw new Error("RPC timeout while waiting for receipt");
    },
    target,
  );
  assert.equal(stillPending.lifecycle, "submitted");
  assert.equal(readPendingTransactions(target)[0].id, item.id);

  const recovered = await observePendingTransaction(
    readPendingTransactions(target)[0],
    async () => ({ status: "success", transactionHash: HASH }),
    target,
  );
  assert.equal(recovered.lifecycle, "confirmed");
  assert.deepEqual(readPendingTransactions(target), []);
});