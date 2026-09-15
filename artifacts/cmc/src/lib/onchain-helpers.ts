import type { Address, Hex } from "viem";

export const BSC_TESTNET_CHAIN_ID = 97;
export const ERC20_DECIMALS = 18;
export const BPS = 10_000n;
export const DEFAULT_DEADLINE_SECONDS = 20 * 60;
export const DEFAULT_SLIPPAGE_BPS = 100n;
export const PENDING_TRANSACTIONS_KEY = "cmc.onchain.pending.v1";

export type PendingTransactionKind = "approval" | "create" | "buy" | "sell";

export type PendingTransaction = {
  id: string;
  hash: Hex;
  chainId: number;
  launchpad: Address;
  deploymentBlock: number;
  account: Address;
  kind: PendingTransactionKind;
  submittedAt: number;
  label: string;
};

export type TransactionLifecycle =
  | "submitted"
  | "confirmed"
  | "reverted"
  | "replaced"
  | "superseded"
  | "cancelled";

export function parseIntegerUnits(value: string, decimals = ERC20_DECIMALS): bigint {
  const normalized = value.trim();
  if (!normalized || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a positive decimal amount without commas or exponent notation.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places.`);
  }
  const units = `${whole}${fraction.padEnd(decimals, "0")}`;
  const parsed = BigInt(units);
  if (parsed <= 0n) throw new Error("Amount must be greater than zero.");
  return parsed;
}

export function formatIntegerUnits(value: bigint, decimals = ERC20_DECIMALS, maxFraction = 6): string {
  if (value < 0n) throw new Error("Cannot format a negative token amount.");
  if (decimals === 0) return value.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const remainder = value % scale;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function applySlippageDown(amount: bigint, slippageBps = DEFAULT_SLIPPAGE_BPS): bigint {
  if (amount < 0n || slippageBps < 0n || slippageBps >= BPS) {
    throw new Error("Slippage must be between 0 and 99.99%.");
  }
  return (amount * (BPS - slippageBps)) / BPS;
}

/**
 * Mirrors Launchpad._buyAmounts using integer arithmetic. It is used only for
 * the first-buy quote because that market does not exist until createMarket
 * returns. Buy and sell flows read quoteBuy/quoteSell directly from the chain.
 */
export function quoteBuyFromReserves(
  virtualToken: bigint,
  virtualQuote: bigint,
  curveTokensLeft: bigint,
  feeBps: bigint,
  grossQuoteIn: bigint,
) {
  if (grossQuoteIn <= 0n) throw new Error("Gross quote input must be greater than zero.");
  const fee = (grossQuoteIn * feeBps) / BPS;
  const netQuote = grossQuoteIn - fee;
  let tokenOut = (netQuote * virtualToken) / (virtualQuote + netQuote);
  let grossConsumed = grossQuoteIn;
  let refund = 0n;

  if (tokenOut >= curveTokensLeft) {
    const denominator = virtualToken - curveTokensLeft;
    const requiredNet = (curveTokensLeft * virtualQuote + denominator - 1n) / denominator;
    grossConsumed = (requiredNet * BPS + (BPS - feeBps) - 1n) / (BPS - feeBps);
    if (grossConsumed <= grossQuoteIn) {
      const consumedFee = (grossConsumed * feeBps) / BPS;
      tokenOut = curveTokensLeft;
      refund = grossQuoteIn - grossConsumed;
      return { tokenOut, grossConsumed, fee: consumedFee, refund };
    }
    grossConsumed = grossQuoteIn;
    tokenOut = ((grossConsumed - (grossConsumed * feeBps) / BPS) * virtualToken)
      / (virtualQuote + grossConsumed - (grossConsumed * feeBps) / BPS);
  }

  return { tokenOut, grossConsumed, fee: (grossConsumed * feeBps) / BPS, refund };
}

export function makeDeadline(nowSeconds = Math.floor(Date.now() / 1000), seconds = DEFAULT_DEADLINE_SECONDS): bigint {
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error("Invalid transaction deadline.");
  }
  return BigInt(nowSeconds + seconds);
}

export function assertWalletIntent(
  expectedAccount: Address,
  liveAccount: Address | undefined,
  liveChainId: number | undefined,
): void {
  if (!liveAccount || liveAccount.toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new Error("Wallet intent account changed while the transaction was awaiting confirmation.");
  }
  if (liveChainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error("Wallet intent network changed while the transaction was awaiting confirmation.");
  }
}

export function resolveCreateQuoteToken(configuredQuoteToken: Address | undefined): Address {
  if (!configuredQuoteToken || !/^0x[0-9a-f]{40}$/i.test(configuredQuoteToken)) {
    throw new Error("On-chain creation requires the configured quote token address.");
  }
  return configuredQuoteToken;
}

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== "undefined") return window.localStorage;
  return null;
}

export function readPendingTransactions(storage?: Storage): PendingTransaction[] {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(PENDING_TRANSACTIONS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingTransaction =>
      item &&
      typeof item.id === "string" &&
      typeof item.hash === "string" &&
      /^0x[0-9a-f]+$/i.test(item.hash) &&
      Number.isSafeInteger(item.chainId) &&
      typeof item.launchpad === "string" &&
      /^0x[0-9a-f]{40}$/i.test(item.launchpad) &&
      Number.isSafeInteger(item.deploymentBlock) &&
      typeof item.account === "string" &&
      typeof item.kind === "string" &&
      Number.isFinite(item.submittedAt) &&
      typeof item.label === "string",
    );
  } catch {
    return [];
  }
}

export function writePendingTransactions(transactions: PendingTransaction[], storage?: Storage): void {
  const target = storageOrNull(storage);
  if (!target) return;
  target.setItem(PENDING_TRANSACTIONS_KEY, JSON.stringify(transactions));
}

export function persistPendingTransaction(transaction: PendingTransaction, storage?: Storage): void {
  const transactions = readPendingTransactions(storage).filter((item) => item.id !== transaction.id);
  writePendingTransactions([transaction, ...transactions], storage);
}

export function removePendingTransaction(id: string, storage?: Storage): void {
  writePendingTransactions(readPendingTransactions(storage).filter((item) => item.id !== id), storage);
}

export function replacePendingHash(id: string, hash: Hex, storage?: Storage): void {
  writePendingTransactions(
    readPendingTransactions(storage).map((item) => item.id === id ? { ...item, hash } : item),
    storage,
  );
}

export function classifyWalletError(error: unknown): TransactionLifecycle {
  const candidate = error as { code?: number | string; name?: string; message?: string } | null;
  const code = String(candidate?.code ?? "");
  const name = String(candidate?.name ?? "").toLowerCase();
  const message = String(candidate?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("account changed") ||
    message.includes("network changed") ||
    message.includes("wallet intent")
  ) {
    return "superseded";
  }
  if (
    code === "4001" ||
    name.includes("userrejected") ||
    name.includes("rejectedrequest") ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("request rejected") ||
    message.includes("cancelled") ||
    message.includes("canceled")
  ) {
    return "cancelled";
  }
  // A replacement error without a receipt is never a successful replacement.
  // The observer may return "replaced" only after viem supplied a successful
  // replacement receipt through onReplaced.
  if (name.includes("replaced") || message.includes("transaction was replaced")) return "superseded";
  if (name.includes("reverted") || message.includes("execution reverted") || message.includes("revert")) {
    return "reverted";
  }
  return "submitted";
}

export type ReceiptLike = { status?: "success" | "reverted"; transactionHash?: Hex };
export type ReplacementLike = {
  reason?: "cancelled" | "replaced" | "repriced";
  transaction?: { hash?: Hex };
  replacedTransaction?: { hash?: Hex };
  transactionReceipt?: ReceiptLike;
};

/**
 * Observe one submitted transaction. The callback shape matches viem's
 * waitForTransactionReceipt onReplaced hook, while keeping this helper easy to
 * exercise with deterministic mocked wallet lifecycles.
 */
export async function observePendingTransaction(
  transaction: PendingTransaction,
  waitForReceipt: (
    hash: Hex,
    options: { onReplaced: (replacement: ReplacementLike) => void },
  ) => Promise<ReceiptLike>,
  storage?: Storage,
): Promise<{ lifecycle: TransactionLifecycle; hash: Hex; receipt?: ReceiptLike }> {
  persistPendingTransaction(transaction, storage);
  let currentHash = transaction.hash;
  let replacementSeen = false;
  let replacementCancelled = false;
  let replacementSuperseded = false;
  let replacementReason: ReplacementLike["reason"];
  let replacementReceiptSuccessful = false;
  try {
    const receipt = await waitForReceipt(currentHash, {
      onReplaced: (replacement) => {
        replacementSeen = true;
        replacementReason = replacement.reason;
        replacementCancelled = replacement.reason === "cancelled";
        replacementSuperseded = replacement.reason === "replaced";
        replacementReceiptSuccessful = replacement.transactionReceipt?.status === "success";
        // viem's `transaction` is the new transaction. `replacedTransaction`
        // is the stale hash and must never be followed.
        const replacementHash = replacement.transaction?.hash;
        if (replacementHash) {
          currentHash = replacementHash;
          replacePendingHash(transaction.id, replacementHash, storage);
        }
      },
    });
    const receiptHash = receipt.transactionHash ?? currentHash;
    currentHash = receiptHash;
    removePendingTransaction(transaction.id, storage);
    if (replacementCancelled) {
      return { lifecycle: "cancelled", hash: currentHash, receipt };
    }
    if (replacementSuperseded) {
      return { lifecycle: "superseded", hash: currentHash, receipt };
    }
    if (receipt.status === "reverted") {
      return { lifecycle: "reverted", hash: currentHash, receipt };
    }
    if (receipt.status !== "success") {
      persistPendingTransaction(transaction, storage);
      return { lifecycle: "submitted", hash: currentHash, receipt };
    }
    return {
      lifecycle: replacementSeen ? "replaced" : "confirmed",
      hash: currentHash,
      receipt,
    };
  } catch (error) {
    if (replacementCancelled) {
      removePendingTransaction(transaction.id, storage);
      return { lifecycle: "cancelled", hash: currentHash };
    }
    if (replacementSuperseded) {
      removePendingTransaction(transaction.id, storage);
      return { lifecycle: "superseded", hash: currentHash };
    }
    if (replacementReason === "repriced" && replacementReceiptSuccessful) {
      removePendingTransaction(transaction.id, storage);
      return { lifecycle: "replaced", hash: currentHash };
    }
    const lifecycle = classifyWalletError(error);
    if (lifecycle === "cancelled" || lifecycle === "reverted" || lifecycle === "superseded") {
      removePendingTransaction(transaction.id, storage);
    }
    return { lifecycle, hash: currentHash };
  }
}

export function createPendingTransaction(
  kind: PendingTransactionKind,
  hash: Hex,
  account: Address,
  label: string,
  launchpad: Address,
  deploymentBlock: number,
  now = Date.now(),
): PendingTransaction {
  return {
    id: `${kind}:${hash}:${now}`,
    hash,
    chainId: BSC_TESTNET_CHAIN_ID,
    launchpad,
    deploymentBlock,
    account,
    kind,
    submittedAt: now,
    label,
  };
}