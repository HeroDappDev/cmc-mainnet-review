export type DevnetLaunchReceipt = {
  version: 1;
  cluster: "devnet";
  mint: string;
  signature: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  imageURL?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  pairSymbol: string;
  pairComponents?: string[];
  decimals: number;
  supply: string;
  confirmedAt: string;
};

const RECEIPTS_KEY = "cmc_devnet_launch_receipts_v1";

function isReceipt(value: unknown): value is DevnetLaunchReceipt {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DevnetLaunchReceipt>;
  return item.version === 1
    && item.cluster === "devnet"
    && typeof item.mint === "string"
    && typeof item.signature === "string"
    && typeof item.name === "string"
    && typeof item.symbol === "string"
    && typeof item.confirmedAt === "string";
}

export function readDevnetLaunchReceipts(): DevnetLaunchReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECEIPTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isReceipt) : [];
  } catch {
    return [];
  }
}

/**
 * This is deliberately a receipt store, not a market or trade store. The
 * signature and mint are the source of truth; it only keeps launch metadata
 * available while the finalized indexer catches up.
 */
export function persistDevnetLaunchReceipt(receipt: DevnetLaunchReceipt) {
  if (typeof window === "undefined") throw new Error("Launch receipts require browser storage.");
  const receipts = readDevnetLaunchReceipts().filter((item) => item.mint !== receipt.mint);
  window.localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt, ...receipts]));
}

export function findDevnetLaunchReceipt(mint: string) {
  return readDevnetLaunchReceipts().find((receipt) => receipt.mint === mint);
}