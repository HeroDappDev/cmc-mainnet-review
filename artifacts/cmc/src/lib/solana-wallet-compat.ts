/**
 * Provider-contract compatibility checks for browser-injected Solana wallets.
 *
 * These checks deliberately stop at the wallet boundary. They never submit a
 * transaction and therefore cannot prove that a browser extension displayed a
 * prompt; that part of the evidence remains a manual, real-wallet check.
 */
import { PublicKey, Transaction } from "@solana/web3.js";

export const SOLANA_BROWSER_WALLET_IDS = [
  "phantom",
  "solflare",
  "backpack",
  "glow",
] as const;

export type SolanaBrowserWalletId = (typeof SOLANA_BROWSER_WALLET_IDS)[number];

export type SolanaBrowserWalletContract = Readonly<{
  id: SolanaBrowserWalletId;
  displayName: string;
  injection: string;
}>;

/**
 * This is the complete set of named wallets the UI currently detects.
 * Detection is not a certification: a wallet is only supportable after both
 * the provider-contract checks and the manual checklist have evidence.
 */
export const SOLANA_BROWSER_WALLET_CONTRACTS: readonly SolanaBrowserWalletContract[] = [
  { id: "phantom", displayName: "Phantom", injection: "window.phantom.solana" },
  { id: "solflare", displayName: "Solflare", injection: "window.solflare" },
  { id: "backpack", displayName: "Backpack", injection: "window.backpack" },
  { id: "glow", displayName: "Glow", injection: "window.glow" },
];

export type WalletContractProvider = {
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect?: () => Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
};

export type WalletCompatibilityCheck = {
  status: "pass" | "fail" | "not-run";
  detail: string;
};

export type WalletCompatibilityEvidence = {
  schema: "cmc.solana.wallet-compatibility.v1";
  wallet: SolanaBrowserWalletContract;
  mode: "provider-contract" | "manual";
  noFundsSent: true;
  checks: {
    prompt: WalletCompatibilityCheck;
    publicKeyContinuity: WalletCompatibilityCheck;
    signedMessageImmutability: WalletCompatibilityCheck;
    rejection: WalletCompatibilityCheck;
    disconnect: WalletCompatibilityCheck;
    recovery: WalletCompatibilityCheck;
  };
};

export type WalletCompatibilityRecord = WalletCompatibilityEvidence & {
  /** Human-supplied fields are required for manual extension evidence. */
  capturedAtUtc?: string;
  browser?: string;
  operatingSystem?: string;
  extensionVersion?: string;
  appCommit?: string;
  cluster?: "devnet";
  publicKeyHint?: string;
  attachments?: string[];
};

export type ProviderContractOptions = {
  wallet: SolanaBrowserWalletId;
  provider: WalletContractProvider;
  transaction: Transaction;
  expectedPublicKey: PublicKey;
  /** A second fixture provider that deterministically rejects signing. */
  rejectionProvider?: WalletContractProvider;
  /** A no-RPC recovery probe supplied by the contract test. */
  recoveryProbe?: () => Promise<boolean>;
};

function walletContract(wallet: SolanaBrowserWalletId): SolanaBrowserWalletContract {
  const contract = SOLANA_BROWSER_WALLET_CONTRACTS.find((item) => item.id === wallet);
  if (!contract) throw new Error(`Unknown Solana browser wallet contract: ${wallet}`);
  return contract;
}

function publicKeyOf(provider: WalletContractProvider): string | null {
  const value = provider.publicKey?.toString();
  return value || null;
}

function hex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

function failed(detail: string): WalletCompatibilityCheck {
  return { status: "fail", detail };
}

/**
 * Exercise the provider contract without calling sendRawTransaction.
 *
 * `prompt` means the provider's signing method was reached. Browser UI
 * approval itself is intentionally not represented as an automated pass.
 */
export async function runWalletProviderContract(
  options: ProviderContractOptions,
): Promise<WalletCompatibilityEvidence> {
  const wallet = walletContract(options.wallet);
  const checks: WalletCompatibilityEvidence["checks"] = {
    prompt: { status: "not-run", detail: "signTransaction was not reached." },
    publicKeyContinuity: { status: "not-run", detail: "Signing was not completed." },
    signedMessageImmutability: { status: "not-run", detail: "Signing was not completed." },
    rejection: { status: "not-run", detail: "No rejection fixture was supplied." },
    disconnect: { status: "not-run", detail: "disconnect was not reached." },
    recovery: { status: "not-run", detail: "No recovery probe was supplied." },
  };
  const expected = options.expectedPublicKey.toBase58();
  const beforeMessage = hex(options.transaction.serializeMessage());
  let signed: Transaction | undefined;

  try {
    const connected = await options.provider.connect({ onlyIfTrusted: false });
    const connectedKey = connected?.publicKey?.toString() ?? publicKeyOf(options.provider);
    const connectedMatches = connectedKey === expected;
    const beforeSigningKey = publicKeyOf(options.provider);
    signed = await options.provider.signTransaction(options.transaction);
    checks.prompt = {
      status: "pass",
      detail: "Provider signTransaction was invoked once; browser approval UI still requires manual evidence.",
    };
    const afterSigningKey = publicKeyOf(options.provider);
    checks.publicKeyContinuity = connectedMatches && beforeSigningKey === expected && afterSigningKey === expected
      ? { status: "pass", detail: "Public key stayed unchanged across the signing request." }
      : failed(`Public key continuity failed: connected ${connectedKey ?? "none"}, before ${beforeSigningKey ?? "none"}, after ${afterSigningKey ?? "none"}; expected ${expected}.`);
    const afterMessage = signed instanceof Transaction ? hex(signed.serializeMessage()) : "";
    checks.signedMessageImmutability = afterMessage === beforeMessage
      ? { status: "pass", detail: "Signed transaction message bytes exactly match the requested bytes." }
      : failed("Signed transaction message bytes differ from the requested bytes.");
  } catch (error) {
    checks.prompt = checks.prompt.status === "not-run"
      ? failed(error instanceof Error ? error.message : "Provider signing failed.")
      : checks.prompt;
    checks.publicKeyContinuity = checks.publicKeyContinuity.status === "not-run"
      ? failed("Provider did not complete signing.")
      : checks.publicKeyContinuity;
    checks.signedMessageImmutability = checks.signedMessageImmutability.status === "not-run"
      ? failed("Provider did not return a signed transaction.")
      : checks.signedMessageImmutability;
  }

  if (options.rejectionProvider) {
    try {
      await options.rejectionProvider.signTransaction(options.transaction);
      checks.rejection = failed("Rejection fixture unexpectedly resolved.");
    } catch {
      checks.rejection = {
        status: "pass",
        detail: "Provider rejection propagated without a transaction submission.",
      };
    }
  }

  if (!options.provider.disconnect) {
    checks.disconnect = failed("Provider does not expose disconnect().");
  } else {
    try {
      await options.provider.disconnect();
      checks.disconnect = publicKeyOf(options.provider) === null
        ? { status: "pass", detail: "disconnect resolved and provider publicKey cleared." }
        : failed("disconnect resolved but provider publicKey remained set.");
    } catch (error) {
      checks.disconnect = failed(error instanceof Error ? error.message : "Provider disconnect failed.");
    }
  }

  if (options.recoveryProbe) {
    try {
      checks.recovery = (await options.recoveryProbe())
        ? { status: "pass", detail: "Pending record survived the simulated interruption and was recovered." }
        : failed("Recovery probe did not recover its pending record.");
    } catch (error) {
      checks.recovery = failed(error instanceof Error ? error.message : "Recovery probe failed.");
    }
  }

  return {
    schema: "cmc.solana.wallet-compatibility.v1",
    wallet,
    mode: "provider-contract",
    noFundsSent: true,
    checks,
  };
}

export function compatibilityEvidenceJson(evidence: WalletCompatibilityRecord): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}
