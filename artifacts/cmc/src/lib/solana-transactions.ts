/**
 * The deliberately small transaction boundary for Raydium LaunchLab.
 *
 * This file is devnet-only.  In particular, it does not use the SDK's
 * mainnet defaults: every instruction is given the reviewed devnet program
 * and the devnet Platform PDA explicitly.
 */
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  CpmmPoolInfoLayout,
  CurveCalculator,
  CpmmCreatorFeeOn,
  CpmmConfigInfoLayout,
  DEVNET_PROGRAM_ID,
  LaunchpadPool,
  buyExactInInstruction,
  getPdaCreatorVault,
  getPdaLaunchpadAuth,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaMetadataKey,
  getPdaPlatformVault,
  getCreatePoolKeys,
  createPlatformConfig,
  initializeV2,
  LaunchpadConfig,
  PlatformConfig,
  sellExactInInstruction,
  makeSwapCpmmBaseInInstruction,
  toBN,
  updatePlatformConfig,
} from "@raydium-io/raydium-sdk-v2";

type BN = ReturnType<typeof toBN>;

export const DEVNET_CLUSTER = "devnet" as const;
export const DEVNET_LAUNCHLAB_PROGRAM_ID = DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM;
export const DEVNET_PLATFORM_ID = DEVNET_PROGRAM_ID.LAUNCHPAD_PLATFORM;
/** Reviewed CMC governance identities and protocol configuration. */
export const CMC_DEVNET_ADMIN = new PublicKey("Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9");
export const CMC_DEVNET_TREASURY = CMC_DEVNET_ADMIN;
export const CMC_DEVNET_PLATFORM_ID = new PublicKey("ENPQU6GScAyfBTsPQrQwhbQVwH2HFW7WAhhhZgBEYyx8");
export const CMC_DEVNET_LAUNCHLAB_CONFIG_ID = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
export const CMC_DEVNET_CPMM_CONFIG_ID = new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");
export const CMC_DEVNET_PLATFORM_FEE_RATE = toBN(5_000);
export const CMC_DEVNET_LAUNCH_TRADE_FEE_RATE = toBN(2_500);
export const CMC_DEVNET_CREATOR_FEE_RATE = toBN(0);
export const CMC_DEVNET_CPMM_PROTOCOL_FEE_RATE = toBN(120_000);
export const CMC_DEVNET_CPMM_FUND_FEE_RATE = toBN(40_000);
export const CMC_DEVNET_CPMM_CREATE_POOL_FEE = toBN(150_000_000);
export const CMC_DEVNET_CPMM_CREATOR_FEE_RATE = toBN(2_500);
export const CMC_DEVNET_CPMM_CREATOR_FEE_SHARE_RATE = toBN(0);
export const CMC_DEVNET_CPMM_PROTOCOL_OWNER = new PublicKey("DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK");
export const LAUNCHLAB_CONFIG_DISCRIMINATOR = Uint8Array.from([0x95, 0x08, 0x9c, 0xca, 0xa0, 0xfc, 0xb0, 0xd9]);
export const CPMM_AMM_CONFIG_DISCRIMINATOR = Uint8Array.from([0xda, 0xf4, 0x21, 0x68, 0xcb, 0xcb, 0x2b, 0x6f]);
// Raydium's Anchor account discriminator for the SDK PlatformConfig layout.
export const PLATFORM_CONFIG_DISCRIMINATOR = Uint8Array.from([0xa0, 0x4e, 0x80, 0x00, 0xf8, 0x53, 0xe6, 0xa0]);
/** Anchor discriminator for PoolState, represented by the SDK's LaunchpadPool layout. */
export const LAUNCHLAB_POOL_DISCRIMINATOR = Uint8Array.from([0xf7, 0xed, 0xe3, 0xf5, 0xd7, 0xc3, 0xde, 0x46]);
export const DEVNET_CMC_ADMIN = CMC_DEVNET_ADMIN;
export const DEVNET_CMC_TREASURY = CMC_DEVNET_TREASURY;
export const DEVNET_CMC_PLATFORM_ID = CMC_DEVNET_PLATFORM_ID;
export const DEVNET_LAUNCHLAB_CONFIG_ID = CMC_DEVNET_LAUNCHLAB_CONFIG_ID;
export const DEVNET_CPMM_CONFIG_ID = CMC_DEVNET_CPMM_CONFIG_ID;
export const DEVNET_LAUNCHLAB_CONFIG = CMC_DEVNET_LAUNCHLAB_CONFIG_ID;
export const DEVNET_CPMM_CONFIG = CMC_DEVNET_CPMM_CONFIG_ID;
export const DEVNET_PLATFORM_FEE_RATE = CMC_DEVNET_PLATFORM_FEE_RATE;
export const DEVNET_CREATOR_FEE_RATE = CMC_DEVNET_CREATOR_FEE_RATE;
export const CMC_DEVNET_PLATFORM_SCALE = toBN(1_000_000);
export const CMC_DEVNET_CREATOR_SCALE = toBN(0);
export const CMC_DEVNET_BURN_SCALE = toBN(0);
export const CMC_DEVNET_PLATFORM_VESTING_SCALE = toBN(0);
export const CMC_DEVNET_RESTRICT_GLOBAL_CONFIG = 0;
export const CMC_DEVNET_RESTRICT_CURVE_PARAM = 0;
/** Reviewed test-only launch template economics (6 decimals, 1B supply, 16 SOL). */
export const CMC_DEVNET_LAUNCH_DECIMALS = 6;
export const CMC_DEVNET_LAUNCH_SUPPLY = toBN("1000000000000000");
export const CMC_DEVNET_LAUNCH_TOTAL_SELL_A = toBN("800000000000000");
export const CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B = toBN("16000000000");
export const CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT = toBN(0);
export const CMC_DEVNET_LAUNCH_CLIFF_PERIOD = toBN(0);
export const CMC_DEVNET_LAUNCH_UNLOCK_PERIOD = toBN(0);
/** CMC owns priority-fee instructions so injected wallets cannot silently add them. */
export const CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000_000;
export const CMC_DEVNET_COMPUTE_UNIT_LIMIT = 600_000;
export const CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS = Math.ceil(
  CMC_DEVNET_COMPUTE_UNIT_LIMIT * CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS / 1_000_000,
);
export const WSOL_MINT = NATIVE_MINT;
export const BPS = 10_000n;

type ConnectionLike = {
  getLatestBlockhash(commitment?: unknown): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }>;
  getBlockHeight(commitment?: unknown): Promise<number>;
  getAccountInfo?(
    address: PublicKey,
    commitment?: unknown,
  ): Promise<{ owner: PublicKey; data: Uint8Array | Buffer } | null>;
  getTokenAccountBalance?(
    address: PublicKey,
    commitment?: unknown,
  ): Promise<{ value: { amount: string } }>;
  simulateTransaction(
    transaction: Transaction,
    config?: { sigVerify?: boolean; replaceRecentBlockhash?: boolean; commitment?: unknown },
  ): Promise<{ value: { err: unknown; logs?: string[] | null } }>;
  getFeeForMessage?(
    message: ReturnType<Transaction["compileMessage"]>,
    commitment?: unknown,
  ): Promise<{ value: number | null } | null>;
  sendRawTransaction(raw: Buffer | Uint8Array, options?: unknown): Promise<string>;
  confirmTransaction(
    strategy: {
      signature: string;
      blockhash: string;
      lastValidBlockHeight: number;
    },
    commitment?: unknown,
  ): Promise<{ value: { err: unknown } }>;
};

export type WalletSigner = {
  publicKey: PublicKey | null;
  signTransaction(transaction: Transaction): Promise<Transaction>;
};

export type LiveWalletProvider = {
  publicKey?: { toString(): string } | null;
  signTransaction(transaction: Transaction): Promise<unknown>;
};

const SIGNED_TRANSACTION_WRAPPER_KEYS = [
  "transaction",
  "signedTransaction",
  "serializedTransaction",
  "rawTransaction",
  "result",
] as const;

function unsupportedSignedTransaction(value: unknown): Error {
  const tag = Object.prototype.toString.call(value);
  let constructorName = "unknown";
  let keys: string[] = [];
  try {
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      const constructorValue = (value as { constructor?: unknown }).constructor;
      constructorName = typeof constructorValue === "function"
        ? (typeof constructorValue.name === "string" ? constructorValue.name : "anonymous")
        : "unknown";
      keys = Object.keys(value).sort();
    }
  } catch {
    // Diagnostics must never invoke an untrusted getter or proxy twice.
  }
  return new Error(`Injected wallet returned an unsupported signed transaction format: ${JSON.stringify({
    objectTag: tag,
    constructorName,
    enumerableKeys: keys,
  })}`);
}

function parseSerializedTransaction(value: unknown, context: string): Transaction {
  try {
    if (value instanceof Uint8Array) return Transaction.from(value);
    if (value instanceof ArrayBuffer) return Transaction.from(new Uint8Array(value));
  } catch (error) {
    throw new Error(`Injected wallet returned an invalid ${context}: ${error instanceof Error ? error.message : "decode failed"}`);
  }
  throw new Error(`Injected wallet ${context} did not return serialized bytes.`);
}

function normalizeSignedTransaction(
  value: unknown,
  depth = 0,
  seen = new Set<object>(),
): Transaction {
  if (value instanceof Transaction) return value;
  if (depth > 4) throw unsupportedSignedTransaction(value);
  if (typeof value === "string") {
    try {
      return Transaction.from(Buffer.from(value, "base64"));
    } catch (error) {
      throw new Error(`Injected wallet returned an invalid serialized transaction: ${error instanceof Error ? error.message : "decode failed"}`);
    }
  }
  if (value instanceof Uint8Array) {
    try {
      return Transaction.from(value);
    } catch (error) {
      throw new Error(`Injected wallet returned an invalid serialized transaction: ${error instanceof Error ? error.message : "decode failed"}`);
    }
  }
  if (value instanceof ArrayBuffer) {
    try {
      return Transaction.from(new Uint8Array(value));
    } catch (error) {
      throw new Error(`Injected wallet returned an invalid serialized transaction: ${error instanceof Error ? error.message : "decode failed"}`);
    }
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value as Record<string, unknown>;
    try {
      if (typeof candidate.serialize === "function"
        && typeof candidate.serializeMessage === "function"
        && typeof candidate.recentBlockhash === "string"
        && Array.isArray(candidate.signatures)
        && Array.isArray(candidate.instructions)) {
        const serialized = candidate.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        return parseSerializedTransaction(serialized, "cross-bundle transaction serialization");
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Injected wallet returned an invalid cross-bundle")) {
        throw error;
      }
      throw new Error("Injected wallet cross-bundle transaction serialization failed.");
    }
  }
  if (Array.isArray(value)) {
    if (!value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      throw unsupportedSignedTransaction(value);
    }
    try {
      return Transaction.from(Uint8Array.from(value));
    } catch (error) {
      throw new Error(`Injected wallet returned an invalid serialized transaction: ${error instanceof Error ? error.message : "decode failed"}`);
    }
  }
  if (!value || typeof value !== "object") throw unsupportedSignedTransaction(value);
  if (seen.has(value)) throw unsupportedSignedTransaction(value);
  seen.add(value);
  try {
    const candidate = value as Record<string, unknown>;
    if (candidate.type === "Buffer" && Array.isArray(candidate.data)) {
      return normalizeSignedTransaction(candidate.data, depth + 1, seen);
    }
    for (const key of SIGNED_TRANSACTION_WRAPPER_KEYS) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        return normalizeSignedTransaction(candidate[key], depth + 1, seen);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Injected wallet returned")) throw error;
    throw unsupportedSignedTransaction(value);
  }
  throw unsupportedSignedTransaction(value);
}

/** Keep identity reads live across the wallet approval prompt. */
export function createLiveWalletSigner(provider: LiveWalletProvider): WalletSigner {
  return {
    get publicKey() {
      const value = provider.publicKey?.toString();
      return value ? new PublicKey(value) : null;
    },
    async signTransaction(transaction) {
      const result = await provider.signTransaction(transaction);
      return normalizeSignedTransaction(result);
    },
  };
}

export type PendingLaunchLabTransaction = {
  id: string;
  signature: string;
  operation: LaunchLabOperation;
  wallet: string;
  blockhash: string;
  lastValidBlockHeight: number;
  submittedAt: number;
};

export type RecoveryStore = {
  get(id: string): PendingLaunchLabTransaction | undefined;
  set(value: PendingLaunchLabTransaction): void;
  delete(id: string): void;
};

export const LAUNCHLAB_RECOVERY_STORAGE_KEY = "cmc.solana.launchlab.pending.v1";

function pendingTransaction(value: unknown): value is PendingLaunchLabTransaction {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.signature === "string"
    && typeof item.operation === "string"
    && ["create", "buy", "sell", "createPlatform", "configurePlatform"].includes(item.operation)
    && typeof item.wallet === "string"
    && typeof item.blockhash === "string"
    && Number.isSafeInteger(item.lastValidBlockHeight)
    && Number.isFinite(item.submittedAt);
}

/** Durable recovery for browser reloads; malformed entries are ignored. */
export class BrowserRecoveryStore implements RecoveryStore {
  private readonly storage: Storage;
  private readonly key: string;

  constructor(storage: Storage, key = LAUNCHLAB_RECOVERY_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  private read(): PendingLaunchLabTransaction[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.key) ?? "[]");
      return Array.isArray(value) ? value.filter(pendingTransaction) : [];
    } catch {
      return [];
    }
  }

  private write(values: PendingLaunchLabTransaction[]): void {
    this.storage.setItem(this.key, JSON.stringify(values));
  }

  get(id: string): PendingLaunchLabTransaction | undefined {
    return this.read().find((value) => value.id === id);
  }

  set(value: PendingLaunchLabTransaction): void {
    this.write([value, ...this.read().filter((item) => item.id !== value.id)]);
  }

  delete(id: string): void {
    this.write(this.read().filter((item) => item.id !== id));
  }
}

export function createBrowserRecoveryStore(
  storage?: Storage,
): BrowserRecoveryStore {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!target) throw new Error("Browser localStorage is unavailable; inject a RecoveryStore in non-browser code.");
  return new BrowserRecoveryStore(target);
}

export type LaunchLabOperation = "create" | "buy" | "sell" | "createPlatform" | "configurePlatform";

export type LaunchLabAccounts = {
  poolId?: PublicKey;
  auth?: PublicKey;
  vaultA?: PublicKey;
  vaultB?: PublicKey;
  userTokenAccountA?: PublicKey;
  userTokenAccountB?: PublicKey;
  platformClaimFeeVault?: PublicKey;
  creatorClaimFeeVault?: PublicKey;
  metadata?: PublicKey;
};

export type LaunchLabBase = {
  cluster: "devnet" | "mainnet-beta";
  wallet: PublicKey;
  programId?: PublicKey;
  /** Reviewed CMC Platform PDA. Required at runtime. */
  platformId?: PublicKey;
  platformAdmin?: PublicKey;
  platformAccountDiscriminator?: Uint8Array;
  configId: PublicKey;
  mintA: PublicKey;
  /** Native SOL and WSOL are accepted and canonicalized to WSOL. */
  mintB?: PublicKey;
  creator?: PublicKey;
  accounts?: LaunchLabAccounts;
  shareFeeRate?: BN;
  shareFeeReceiver?: PublicKey;
};

export type CreateLaunchLab = LaunchLabBase & {
  operation: "create";
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  decimals?: number;
  supply: BN;
  totalSellA: BN;
  totalFundRaisingB: BN;
  totalLockedAmount?: BN;
  cliffPeriod?: BN;
  unlockPeriod?: BN;
};

export type TradeLaunchLab = LaunchLabBase & {
  operation: "buy" | "sell";
  amount: BN;
  /** Buy: minimum token A; sell: minimum quote B. */
  minAmount: BN;
};

export type LaunchLabRequest = CreateLaunchLab | TradeLaunchLab;

export type CreatePlatformRequest = {
  operation: "createPlatform";
  cluster: "devnet" | "mainnet-beta";
  /** The stable reviewed CMC admin must authorize Platform creation. */
  wallet: PublicKey;
  platformAdmin: PublicKey;
  platformId?: PublicKey;
  cpConfigId: PublicKey;
  platformClaimFeeWallet: PublicKey;
  platformLockNftWallet: PublicKey;
  platformVestingWallet: PublicKey;
  transferFeeExtensionAuth: PublicKey;
  migrateCpLockNftScale: { platformScale: BN; creatorScale: BN; burnScale: BN };
  feeRate: BN;
  creatorFeeRate: BN;
  platformVestingScale?: BN;
  name: string;
  web: string;
  img: string;
};

export type ConfigurePlatformRequest = {
  operation: "configurePlatform";
  cluster: "devnet" | "mainnet-beta";
  wallet: PublicKey;
  platformId?: PublicKey;
};

export type AnyLaunchLabRequest = LaunchLabRequest | CreatePlatformRequest | ConfigurePlatformRequest;

export type PreparedLaunchLabTransaction = {
  transaction: Transaction;
  /** The only retained ephemeral signer is the create mint signer needed for blockhash refresh. */
  ephemeralSigner?: Keypair;
  /** Immutable canonical message captured immediately after simulation. */
  preparedMessageHex: string;
  operation: LaunchLabOperation;
  wallet: PublicKey;
  blockhash: string;
  lastValidBlockHeight: number;
  feeLamports: number | null;
  simulation: { err: unknown; logs?: string[] | null };
  accounts?: Required<Pick<LaunchLabAccounts, "poolId" | "auth" | "vaultA" | "vaultB">>;
  platform?: { platformId: PublicKey; cpConfigId: PublicKey };
  intentSnapshot: IntentSnapshot;
  verification: {
    config?: { address: PublicKey; state: ReviewedLaunchpadConfig };
    platform?: { address: PublicKey; state: ReviewedPlatformConfig };
    cpmmConfig?: { address: PublicKey; state: ReviewedCpmmConfig };
  };
};

export type CpmmSwapQuote = Readonly<{
  poolId: PublicKey;
  amountIn: BN;
  amountOut: BN;
  minimumAmountOut: BN;
}>;

type FinalizedCpmmState = Readonly<{
  poolId: PublicKey;
  authority: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
  reserveA: BN;
  reserveB: BN;
  feeOn: number;
}>;

export type IntentSnapshot = Readonly<{
  operation: LaunchLabOperation;
  accounts: Readonly<Record<string, string | null>>;
  parameters: Readonly<Record<string, string | null>>;
}>;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function keyString(value: PublicKey | undefined): string | null {
  return value?.toBase58() ?? null;
}

function amountString(value: BN | undefined): string | null {
  return value?.toString() ?? null;
}

function launchIntent(request: LaunchLabRequest, accounts: ReturnType<typeof deriveAccounts>): IntentSnapshot {
  const snapshot: IntentSnapshot = {
    operation: request.operation,
    accounts: {
      wallet: keyString(request.wallet),
      programId: keyString(accounts.programId),
      platformAdmin: keyString(request.platformAdmin),
      platformId: keyString(accounts.platformId),
      configId: keyString(request.configId),
      creator: keyString(request.creator ?? request.wallet),
      mintA: keyString(request.mintA),
      quoteMint: keyString(accounts.quote),
      auth: keyString(accounts.auth),
      poolId: keyString(accounts.poolId),
      vaultA: keyString(accounts.vaultA),
      vaultB: keyString(accounts.vaultB),
      metadata: keyString(accounts.metadata),
      userTokenAccountA: keyString(accounts.userTokenAccountA),
      userTokenAccountB: keyString(accounts.userTokenAccountB),
      platformClaimFeeVault: keyString(accounts.platformClaimFeeVault),
      creatorClaimFeeVault: keyString(accounts.creatorClaimFeeVault),
      shareFeeReceiver: keyString(request.shareFeeReceiver),
      treasury: keyString(CMC_DEVNET_TREASURY),
    },
    parameters: {
      amount: request.operation === "create" ? null : amountString(request.amount),
      minAmount: request.operation === "create" ? null : amountString(request.minAmount),
      shareFeeRate: amountString(request.shareFeeRate ?? toBN(0)),
      platformFeeRate: amountString(CMC_DEVNET_PLATFORM_FEE_RATE),
      protocolFeeRate: null,
      creatorFeeRate: amountString(CMC_DEVNET_CREATOR_FEE_RATE),
      supply: request.operation === "create" ? amountString(request.supply) : null,
      totalSellA: request.operation === "create" ? amountString(request.totalSellA) : null,
      totalFundRaisingB: request.operation === "create" ? amountString(request.totalFundRaisingB) : null,
      totalLockedAmount: request.operation === "create" ? amountString(request.totalLockedAmount ?? toBN(0)) : null,
      cliffPeriod: request.operation === "create" ? amountString(request.cliffPeriod ?? toBN(0)) : null,
      unlockPeriod: request.operation === "create" ? amountString(request.unlockPeriod ?? toBN(0)) : null,
      curveType: request.operation === "create" ? "ConstantCurve" : null,
      migrateType: request.operation === "create" ? "cpmm" : null,
      decimals: request.operation === "create" ? String(request.decimals ?? 6) : null,
      name: request.operation === "create" ? request.name : null,
      symbol: request.operation === "create" ? request.symbol : null,
      uri: request.operation === "create" ? request.uri : null,
      launchLabConfigDiscriminator: Array.from(LAUNCHLAB_CONFIG_DISCRIMINATOR, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      platformAccountDiscriminator: Array.from(PLATFORM_CONFIG_DISCRIMINATOR, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      computeUnitLimit: String(CMC_DEVNET_COMPUTE_UNIT_LIMIT),
      computeUnitPriceMicroLamports: String(CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS),
      maxPriorityFeeLamports: String(CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS),
    },
  };
  return freezeDeep(snapshot);
}

function platformIntent(request: CreatePlatformRequest, platformId: PublicKey): IntentSnapshot {
  return freezeDeep({
    operation: request.operation,
    accounts: {
      wallet: keyString(request.wallet),
      programId: keyString(DEVNET_LAUNCHLAB_PROGRAM_ID),
      platformAdmin: keyString(request.platformAdmin),
      platformId: keyString(platformId),
      configId: null,
      creator: null,
      mintA: null,
      quoteMint: keyString(WSOL_MINT),
      auth: null,
      poolId: null,
      vaultA: null,
      vaultB: null,
      metadata: null,
      userTokenAccountA: null,
      userTokenAccountB: null,
      platformClaimFeeVault: keyString(request.platformClaimFeeWallet),
      creatorClaimFeeVault: null,
      shareFeeReceiver: null,
      cpConfigId: keyString(request.cpConfigId),
      platformLockNftWallet: keyString(request.platformLockNftWallet),
      platformVestingWallet: keyString(request.platformVestingWallet),
      transferFeeExtensionAuth: keyString(request.transferFeeExtensionAuth),
      treasury: keyString(CMC_DEVNET_TREASURY),
    },
    parameters: {
      amount: null,
      minAmount: null,
      shareFeeRate: null,
      platformFeeRate: amountString(request.feeRate),
      protocolFeeRate: null,
      creatorFeeRate: amountString(request.creatorFeeRate),
      platformScale: amountString(request.migrateCpLockNftScale.platformScale),
      creatorScale: amountString(request.migrateCpLockNftScale.creatorScale),
      burnScale: amountString(request.migrateCpLockNftScale.burnScale),
      platformVestingScale: amountString(request.platformVestingScale ?? toBN(0)),
      cpmmConfigDiscriminator: Array.from(CPMM_AMM_CONFIG_DISCRIMINATOR, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      computeUnitLimit: String(CMC_DEVNET_COMPUTE_UNIT_LIMIT),
      computeUnitPriceMicroLamports: String(CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS),
      maxPriorityFeeLamports: String(CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS),
      name: request.name,
      web: request.web,
      img: request.img,
    },
  });
}

function configurePlatformIntent(wallet: PublicKey, platformId: PublicKey): IntentSnapshot {
  return freezeDeep({
    operation: "configurePlatform",
    accounts: {
      wallet: wallet.toBase58(),
      programId: DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58(),
      platformAdmin: CMC_DEVNET_ADMIN.toBase58(),
      platformId: platformId.toBase58(),
      creator: null,
      treasury: CMC_DEVNET_TREASURY.toBase58(),
    },
    parameters: {
      updatePlatformCpCreator: CMC_DEVNET_ADMIN.toBase58(),
      updateCurveRuleManager: CMC_DEVNET_ADMIN.toBase58(),
      computeUnitLimit: String(CMC_DEVNET_COMPUTE_UNIT_LIMIT),
      computeUnitPriceMicroLamports: String(CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS),
      maxPriorityFeeLamports: String(CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS),
    },
  });
}

function asPublicKey(value: PublicKey | string, field: string): PublicKey {
  try {
    return value instanceof PublicKey ? value : new PublicKey(value);
  } catch {
    throw new Error(`${field} is not a valid Solana public key.`);
  }
}

function same(a: PublicKey, b: PublicKey): boolean {
  return a.equals(b);
}

function assertExpected(label: string, actual: PublicKey | undefined, expected: PublicKey): void {
  if (actual && !same(asPublicKey(actual, label), expected)) {
    throw new Error(`${label} does not match the expected LaunchLab account.`);
  }
}

function canonicalQuote(mintB: PublicKey | undefined): PublicKey {
  if (!mintB || mintB.equals(NATIVE_MINT) || mintB.equals(WSOL_MINT)) return WSOL_MINT;
  throw new Error("LaunchLab only supports SOL; quote mint must be native SOL or WSOL.");
}

export function assertDevnetLaunchLab(request: LaunchLabRequest): void {
  asPublicKey(request.wallet, "wallet");
  asPublicKey(request.configId, "config");
  asPublicKey(request.mintA, "mint");
  if (!request.platformId) throw new Error("An explicit CMC Platform PDA is required.");
  if (!request.platformAdmin) throw new Error("An explicit Platform admin is required.");
  asPublicKey(request.platformId, "Platform PDA");
  asPublicKey(request.platformAdmin, "Platform admin");
  if (request.programId) asPublicKey(request.programId, "LaunchLab program");
  if (request.platformId) asPublicKey(request.platformId, "LaunchLab platform");
  if (request.mintB) asPublicKey(request.mintB, "quote mint");
  if (request.creator) asPublicKey(request.creator, "creator");
  if (request.cluster !== DEVNET_CLUSTER) {
    throw new Error("LaunchLab transaction construction is disabled outside Solana devnet.");
  }
  const programId = request.programId ?? DEVNET_LAUNCHLAB_PROGRAM_ID;
  const platformId = request.platformId;
  if (!programId.equals(DEVNET_LAUNCHLAB_PROGRAM_ID)) {
    throw new Error("Unexpected Raydium LaunchLab program ID for devnet.");
  }
  if (!request.platformAdmin.equals(CMC_DEVNET_ADMIN)) {
    throw new Error("Platform admin does not match the reviewed CMC devnet admin.");
  }
  if (!platformId.equals(CMC_DEVNET_PLATFORM_ID)) {
    throw new Error("Platform PDA does not match the reviewed CMC Platform PDA.");
  }
  if (request.mintA.equals(NATIVE_MINT) || request.mintA.equals(WSOL_MINT)) {
    throw new Error("The LaunchLab base mint must be a distinct SPL token mint.");
  }
  if (request.operation === "create" && !request.mint.publicKey.equals(request.mintA)) {
    throw new Error("Create mintA must match the supplied mint signer.");
  }
  if (request.operation === "create") {
    if ((request.decimals ?? CMC_DEVNET_LAUNCH_DECIMALS) !== CMC_DEVNET_LAUNCH_DECIMALS) {
      throw new Error("Launch decimals do not match the reviewed test template.");
    }
    if (!request.supply.eq(CMC_DEVNET_LAUNCH_SUPPLY)) {
      throw new Error("Launch supply does not match the reviewed test template.");
    }
    if (!request.totalSellA.eq(CMC_DEVNET_LAUNCH_TOTAL_SELL_A)) {
      throw new Error("Launch totalSellA does not match the reviewed test template.");
    }
    if (!request.totalFundRaisingB.eq(CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B)) {
      throw new Error("Launch fundraising amount does not match the reviewed test template.");
    }
    if (!(request.totalLockedAmount ?? toBN(0)).eq(CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT)
      || !(request.cliffPeriod ?? toBN(0)).eq(CMC_DEVNET_LAUNCH_CLIFF_PERIOD)
      || !(request.unlockPeriod ?? toBN(0)).eq(CMC_DEVNET_LAUNCH_UNLOCK_PERIOD)) {
      throw new Error("Launch vesting economics do not match the reviewed test template.");
    }
  }
  canonicalQuote(request.mintB);
  if (request.operation !== "create" && !request.creator) {
    throw new Error("The pool creator is required to validate the creator fee vault.");
  }
  if (!request.configId.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)) {
    throw new Error("LaunchLab config does not match the reviewed devnet config.");
  }
  if (request.platformAccountDiscriminator
    && (request.platformAccountDiscriminator.length !== PLATFORM_CONFIG_DISCRIMINATOR.length
      || request.platformAccountDiscriminator.some((byte, index) => byte !== PLATFORM_CONFIG_DISCRIMINATOR[index]))) {
    throw new Error("Platform account discriminator does not match the reviewed PlatformConfig layout.");
  }
}

function assertNonZero(value: PublicKey, field: string): void {
  if (value.equals(new PublicKey(new Uint8Array(32)))) throw new Error(`${field} must not be the default public key.`);
}

export type VerifiedLaunchLabAccount = {
  address: PublicKey;
  exists: boolean;
  ownerMatches: boolean;
  discriminatorMatches: boolean | null;
  valid: boolean;
};

/**
 * Read-only account check used before preparing platform transactions.  The
 * caller supplies the expected owner because CPMM config accounts are owned by
 * the CPMM program, while LaunchLab config/platform/pool accounts are owned
 * by LaunchLab.  Anchor account discriminators are checked when supplied.
 */
export async function verifyLaunchLabAccount(
  connection: Pick<ConnectionLike, "getAccountInfo">,
  address: PublicKey,
  expectedOwner: PublicKey = DEVNET_LAUNCHLAB_PROGRAM_ID,
  discriminator?: Uint8Array,
): Promise<VerifiedLaunchLabAccount> {
  const account = await connection.getAccountInfo?.(address, "finalized");
  const ownerMatches = Boolean(account?.owner.equals(expectedOwner));
  const discriminatorMatches = discriminator
    ? Boolean(account && account.data.length >= discriminator.length
      && discriminator.every((byte, index) => account.data[index] === byte))
    : null;
  return {
    address,
    exists: Boolean(account),
    ownerMatches,
    discriminatorMatches,
    valid: Boolean(account) && ownerMatches && discriminatorMatches !== false,
  };
}

export type ReviewedLaunchpadConfig = Readonly<Record<string, string | number>>;
export type ReviewedPlatformConfig = Readonly<Record<string, string | number>>;
export type ReviewedCpmmConfig = Readonly<Record<string, string | number | boolean>>;

const REVIEWED_PROTOCOL_FEE_OWNER = new PublicKey("DRaySeEaQ4oFFFZNFfM8vZTZdj6ve6bqBByBg4DuLGdi");
const REVIEWED_MIGRATE_FEE_OWNER = new PublicKey("DRays1SduYDUsRmtsRoEshsFMD1N93LW9GLjpUGu7TLW");
const REVIEWED_MIGRATE_AMM_WALLET = new PublicKey("DRay9TLEqeJsXr9je9yKopK137gRLXNhtNXgpAmGDTdh");
const REVIEWED_MIGRATE_CPMM_WALLET = new PublicKey("DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF");

function decodedKey(value: PublicKey): string {
  return value.toBase58();
}

function decodedBN(value: { toString(): string }): string {
  return value.toString();
}

function assertField(actual: unknown, expected: unknown, field: string): void {
  if (actual !== expected) throw new Error(`Reviewed account ${field} does not match.`);
}

function decodeReviewedLaunchpadConfig(data: Uint8Array): ReviewedLaunchpadConfig {
  if (data.length < LaunchpadConfig.span) throw new Error("LaunchLab config account data is truncated.");
  if (!LAUNCHLAB_CONFIG_DISCRIMINATOR.every((byte, index) => data[index] === byte)) {
    throw new Error("LaunchLab config account discriminator does not match.");
  }
  let decoded: ReturnType<typeof LaunchpadConfig.decode>;
  try {
    decoded = LaunchpadConfig.decode(Buffer.from(data));
  } catch {
    throw new Error("LaunchLab config account could not be decoded.");
  }
  const expected: ReviewedLaunchpadConfig = {
    curveType: 0,
    index: 0,
    migrateFee: "0",
    tradeFeeRate: "2500",
    maxShareFeeRate: "10000",
    minSupplyA: "10000000",
    maxLockRate: "999999",
    minSellRateA: "1",
    minMigrateRateA: "1",
    minFundRaisingB: "1",
    mintB: WSOL_MINT.toBase58(),
    protocolFeeOwner: REVIEWED_PROTOCOL_FEE_OWNER.toBase58(),
    migrateFeeOwner: REVIEWED_MIGRATE_FEE_OWNER.toBase58(),
    migrateToAmmWallet: REVIEWED_MIGRATE_AMM_WALLET.toBase58(),
    migrateToCpmmWallet: REVIEWED_MIGRATE_CPMM_WALLET.toBase58(),
  };
  const actual: ReviewedLaunchpadConfig = {
    curveType: decoded.curveType,
    index: decoded.index,
    migrateFee: decodedBN(decoded.migrateFee),
    tradeFeeRate: decodedBN(decoded.tradeFeeRate),
    maxShareFeeRate: decodedBN(decoded.maxShareFeeRate),
    minSupplyA: decodedBN(decoded.minSupplyA),
    maxLockRate: decodedBN(decoded.maxLockRate),
    minSellRateA: decodedBN(decoded.minSellRateA),
    minMigrateRateA: decodedBN(decoded.minMigrateRateA),
    minFundRaisingB: decodedBN(decoded.minFundRaisingB),
    mintB: decodedKey(decoded.mintB),
    protocolFeeOwner: decodedKey(decoded.protocolFeeOwner),
    migrateFeeOwner: decodedKey(decoded.migrateFeeOwner),
    migrateToAmmWallet: decodedKey(decoded.migrateToAmmWallet),
    migrateToCpmmWallet: decodedKey(decoded.migrateToCpmmWallet),
  };
  for (const [field, value] of Object.entries(expected)) assertField(actual[field], value, `LaunchLab config ${field}`);
  return Object.freeze(actual);
}

function decodePlatformConfigState(data: Uint8Array): ReviewedPlatformConfig {
  if (data.length < PlatformConfig.span) throw new Error("Platform account data is truncated.");
  if (!PLATFORM_CONFIG_DISCRIMINATOR.every((byte, index) => data[index] === byte)) {
    throw new Error("Platform account discriminator does not match.");
  }
  let decoded: ReturnType<typeof PlatformConfig.decode>;
  try {
    decoded = PlatformConfig.decode(Buffer.from(data));
  } catch {
    throw new Error("Platform account could not be decoded.");
  }
  return Object.freeze({
    platformClaimFeeWallet: decodedKey(decoded.platformClaimFeeWallet),
    platformLockNftWallet: decodedKey(decoded.platformLockNftWallet),
    platformScale: decodedBN(decoded.platformScale),
    creatorScale: decodedBN(decoded.creatorScale),
    burnScale: decodedBN(decoded.burnScale),
    feeRate: decodedBN(decoded.feeRate),
    cpConfigId: decodedKey(decoded.cpConfigId),
    creatorFeeRate: decodedBN(decoded.creatorFeeRate),
    transferFeeExtensionAuth: decodedKey(decoded.transferFeeExtensionAuth),
    platformVestingWallet: decodedKey(decoded.platformVestingWallet),
    platformVestingScale: decodedBN(decoded.platformVestingScale),
    platformCpCreator: decodedKey(decoded.platformCpCreator),
    restrictGlobalConfig: decoded.restrictGlobalConfig,
    restrictCurveParam: decoded.restrictCurveParam,
    curveRuleManager: decodedKey(decoded.curveRuleManager),
  });
}

function reviewedPlatformExpected(): ReviewedPlatformConfig {
  return {
    platformClaimFeeWallet: CMC_DEVNET_TREASURY.toBase58(),
    platformLockNftWallet: CMC_DEVNET_TREASURY.toBase58(),
    platformScale: CMC_DEVNET_PLATFORM_SCALE.toString(),
    creatorScale: CMC_DEVNET_CREATOR_SCALE.toString(),
    burnScale: CMC_DEVNET_BURN_SCALE.toString(),
    feeRate: CMC_DEVNET_PLATFORM_FEE_RATE.toString(),
    cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID.toBase58(),
    creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE.toString(),
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY.toBase58(),
    platformVestingWallet: CMC_DEVNET_TREASURY.toBase58(),
    platformVestingScale: CMC_DEVNET_PLATFORM_VESTING_SCALE.toString(),
    platformCpCreator: CMC_DEVNET_ADMIN.toBase58(),
    restrictGlobalConfig: CMC_DEVNET_RESTRICT_GLOBAL_CONFIG,
    restrictCurveParam: CMC_DEVNET_RESTRICT_CURVE_PARAM,
    curveRuleManager: CMC_DEVNET_ADMIN.toBase58(),
  };
}

function decodeReviewedPlatformConfig(data: Uint8Array): ReviewedPlatformConfig {
  const actual = decodePlatformConfigState(data);
  const expected = reviewedPlatformExpected();
  for (const [field, value] of Object.entries(expected)) assertField(actual[field], value, `Platform ${field}`);
  return actual;
}

function decodeGovernancePlatformConfig(data: Uint8Array): ReviewedPlatformConfig {
  const actual = decodePlatformConfigState(data);
  const expected = reviewedPlatformExpected();
  for (const [field, value] of Object.entries(expected)) {
    if (field === "platformCpCreator" || field === "curveRuleManager") {
      const allowed = new Set([PublicKey.default.toBase58(), CMC_DEVNET_ADMIN.toBase58()]);
      if (!allowed.has(String(actual[field]))) {
        throw new Error(`Platform ${field} does not match the reviewed admin/default policy.`);
      }
    } else {
      assertField(actual[field], value, `Platform ${field}`);
    }
  }
  return actual;
}

function decodeReviewedCpmmConfig(data: Uint8Array): ReviewedCpmmConfig {
  if (data.length < CpmmConfigInfoLayout.span) throw new Error("CPMM config account data is truncated.");
  if (!CPMM_AMM_CONFIG_DISCRIMINATOR.every((byte, index) => data[index] === byte)) {
    throw new Error("CPMM config account discriminator does not match.");
  }
  let decoded: ReturnType<typeof CpmmConfigInfoLayout.decode>;
  try {
    decoded = CpmmConfigInfoLayout.decode(Buffer.from(data));
  } catch {
    throw new Error("CPMM config account could not be decoded.");
  }
  const actual: ReviewedCpmmConfig = {
    bump: decoded.bump,
    disableCreatePool: decoded.disableCreatePool,
    index: decoded.index,
    tradeFeeRate: decodedBN(decoded.tradeFeeRate),
    protocolFeeRate: decodedBN(decoded.protocolFeeRate),
    fundFeeRate: decodedBN(decoded.fundFeeRate),
    createPoolFee: decodedBN(decoded.createPoolFee),
    protocolOwner: decodedKey(decoded.protocolOwner),
    fundOwner: decodedKey(decoded.fundOwner),
    creatorFeeRate: decodedBN(decoded.creatorFeeRate),
    creatorFeeShareRate: decodedBN(decoded.creatorFeeShareRate),
  };
  const expected: ReviewedCpmmConfig = {
    bump: 253,
    disableCreatePool: false,
    index: 0,
    tradeFeeRate: "2500",
    protocolFeeRate: CMC_DEVNET_CPMM_PROTOCOL_FEE_RATE.toString(),
    fundFeeRate: CMC_DEVNET_CPMM_FUND_FEE_RATE.toString(),
    createPoolFee: CMC_DEVNET_CPMM_CREATE_POOL_FEE.toString(),
    protocolOwner: CMC_DEVNET_CPMM_PROTOCOL_OWNER.toBase58(),
    fundOwner: CMC_DEVNET_CPMM_PROTOCOL_OWNER.toBase58(),
    creatorFeeRate: CMC_DEVNET_CPMM_CREATOR_FEE_RATE.toString(),
    creatorFeeShareRate: CMC_DEVNET_CPMM_CREATOR_FEE_SHARE_RATE.toString(),
  };
  for (const [field, value] of Object.entries(expected)) assertField(actual[field], value, `CPMM config ${field}`);
  return Object.freeze(actual);
}

async function fetchReviewedAccount(
  connection: Pick<ConnectionLike, "getAccountInfo">,
  address: PublicKey,
  owner: PublicKey,
  discriminator: Uint8Array,
): Promise<Uint8Array> {
  const account = await connection.getAccountInfo?.(address, "finalized");
  if (!account) throw new Error("Reviewed account is missing.");
  if (!account.owner.equals(owner)) throw new Error("Reviewed account has the wrong owner.");
  if (account.data.length < discriminator.length
    || !discriminator.every((byte, index) => account.data[index] === byte)) {
    throw new Error("Reviewed account has the wrong discriminator.");
  }
  return account.data;
}

async function verifyReviewedLaunchAccounts(
  connection: Pick<ConnectionLike, "getAccountInfo">,
): Promise<{ config: ReviewedLaunchpadConfig; platform: ReviewedPlatformConfig; cpmm: ReviewedCpmmConfig }> {
  const configData = await fetchReviewedAccount(
    connection,
    CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
    DEVNET_LAUNCHLAB_PROGRAM_ID,
    LAUNCHLAB_CONFIG_DISCRIMINATOR,
  );
  const platformData = await fetchReviewedAccount(
    connection,
    CMC_DEVNET_PLATFORM_ID,
    DEVNET_LAUNCHLAB_PROGRAM_ID,
    PLATFORM_CONFIG_DISCRIMINATOR,
  );
  const cpmmData = await fetchReviewedAccount(
    connection,
    CMC_DEVNET_CPMM_CONFIG_ID,
    DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    CPMM_AMM_CONFIG_DISCRIMINATOR,
  );
  return {
    config: decodeReviewedLaunchpadConfig(configData),
    platform: decodeReviewedPlatformConfig(platformData),
    cpmm: decodeReviewedCpmmConfig(cpmmData),
  };
}

export async function verifyReviewedPlatformAccount(
  connection: Pick<ConnectionLike, "getAccountInfo">,
): Promise<{ valid: boolean; state?: ReviewedPlatformConfig }> {
  try {
    const data = await fetchReviewedAccount(
      connection,
      CMC_DEVNET_PLATFORM_ID,
      DEVNET_LAUNCHLAB_PROGRAM_ID,
      PLATFORM_CONFIG_DISCRIMINATOR,
    );
    const cpmmData = await fetchReviewedAccount(
      connection,
      CMC_DEVNET_CPMM_CONFIG_ID,
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      CPMM_AMM_CONFIG_DISCRIMINATOR,
    );
    decodeReviewedCpmmConfig(cpmmData);
    return { valid: true, state: decodeReviewedPlatformConfig(data) };
  } catch {
    return { valid: false };
  }
}

/** Verify the only two post-creation governance fields eligible for completion. */
export async function verifyPlatformGovernanceCompletion(
  connection: Pick<ConnectionLike, "getAccountInfo">,
): Promise<{ valid: boolean; needsCompletion: boolean; alreadyConfigured: boolean; state?: ReviewedPlatformConfig; error?: string }> {
  if (!connection.getAccountInfo) return { valid: false, needsCompletion: false, alreadyConfigured: false, error: "Finalized Platform account verification is unavailable." };
  try {
    const data = await fetchReviewedAccount(
      connection,
      CMC_DEVNET_PLATFORM_ID,
      DEVNET_LAUNCHLAB_PROGRAM_ID,
      PLATFORM_CONFIG_DISCRIMINATOR,
    );
    const state = decodeGovernancePlatformConfig(data);
    const alreadyConfigured = state.platformCpCreator === CMC_DEVNET_ADMIN.toBase58()
      && state.curveRuleManager === CMC_DEVNET_ADMIN.toBase58();
    return { valid: true, needsCompletion: !alreadyConfigured, alreadyConfigured, state };
  } catch (error) {
    return {
      valid: false,
      needsCompletion: false,
      alreadyConfigured: false,
      error: error instanceof Error ? error.message : "Finalized Platform governance verification failed.",
    };
  }
}

export function slippageBound(
  amount: BN | bigint | number,
  slippageBps: bigint | number = 0n,
  direction: "minimum" | "maximum" = "minimum",
): BN {
  if (typeof amount === "number" && (!Number.isSafeInteger(amount) || !Number.isFinite(amount))) {
    throw new Error("Amount must be a safe integer.");
  }
  if (typeof slippageBps === "number" && (!Number.isSafeInteger(slippageBps) || !Number.isFinite(slippageBps))) {
    throw new Error("Slippage must be an integer.");
  }
  if (direction !== "minimum" && direction !== "maximum") throw new Error("Slippage direction is invalid.");
  const source = typeof amount === "number" ? BigInt(amount) : typeof amount === "bigint" ? amount : BigInt(amount.toString());
  const bps = typeof slippageBps === "number" ? BigInt(slippageBps) : slippageBps;
  if (source < 0n || bps < 0n || bps >= BPS) throw new Error("Slippage must be between 0 and 99.99%.");
  const result = direction === "minimum"
    ? source * (BPS - bps) / BPS
    : (source * (BPS + bps) + BPS - 1n) / BPS;
  return toBN(result.toString());
}

/**
 * This is deliberately decoded with the exact LaunchpadPool layout shipped by
 * the pinned SDK.  Do not hand-maintain offsets here: a pool account is an
 * Anchor discriminator followed by the layout in launchpad/layout.ts.
 */
export type LaunchLabPoolState = ReturnType<typeof LaunchpadPool.decode>;

export const LAUNCHLAB_POOL_STATUS_TRADING = 0;

export function decodeLaunchLabPoolState(data: Uint8Array): LaunchLabPoolState {
  if (data.length < LaunchpadPool.span) throw new Error("LaunchLab pool account data is truncated.");
  if (!LAUNCHLAB_POOL_DISCRIMINATOR.every((byte, index) => data[index] === byte)) {
    throw new Error("LaunchLab pool account discriminator does not match.");
  }
  try {
    return LaunchpadPool.decode(Buffer.from(data));
  } catch {
    throw new Error("LaunchLab pool account could not be decoded.");
  }
}

/** Read and decode a pool at finalized commitment; processed state is unsafe for quotes. */
export async function fetchFinalizedLaunchLabPoolState(
  connection: Pick<ConnectionLike, "getAccountInfo">,
  address: PublicKey,
): Promise<LaunchLabPoolState> {
  const account = await connection.getAccountInfo?.(address, "finalized");
  if (!account) throw new Error("Finalized LaunchLab pool account is missing.");
  if (!account.owner.equals(DEVNET_LAUNCHLAB_PROGRAM_ID)) {
    throw new Error("Finalized LaunchLab pool account has the wrong owner.");
  }
  return decodeLaunchLabPoolState(account.data);
}

// Short aliases are kept for callers that already use the SDK's pool terminology.
export const decodeLaunchLabPool = decodeLaunchLabPoolState;
export const getFinalizedLaunchLabPoolState = fetchFinalizedLaunchLabPoolState;
export const decodeFinalizedLaunchLabPoolState = fetchFinalizedLaunchLabPoolState;
export const readFinalizedLaunchLabPoolState = fetchFinalizedLaunchLabPoolState;

type QuoteAmount = BN | bigint | number;

export type LaunchLabQuoteOptions = {
  protocolFeeRate?: QuoteAmount;
  platformFeeRate?: QuoteAmount;
  shareFeeRate?: QuoteAmount;
  creatorFeeRate?: QuoteAmount;
  /** Slippage in integer basis points, never a decimal percentage. */
  slippageBps?: bigint | number;
};

export type LaunchLabQuote = {
  /** Requested exact-in amount. */
  amountIn: BN;
  /** Amount actually consumed; this is lower than amountIn at graduation. */
  amountInUsed: BN;
  /** Unspent exact-in amount when a buy is capped at graduation. */
  refund: BN;
  /** Alias matching the LaunchLab SDK's gross-consumed terminology. */
  grossConsumed: BN;
  /** Integer amount after the input fee, before curve math. */
  amountInAfterFees: BN;
  amountOut: BN;
  minimumAmountOut: BN;
  /** The fee charged on amountInUsed, rounded up as on-chain. */
  fee: BN;
  remainingSolToGraduation: BN;
  cappedAtGraduation: boolean;
};

function quoteBN(value: QuoteAmount, field: string): BN {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || !Number.isFinite(value))) {
    throw new Error(`${field} must be a safe integer.`);
  }
  try {
    const result = toBN(typeof value === "bigint" ? value.toString() : typeof value === "number" ? String(value) : value.toString());
    if (result.lt(toBN(0))) throw new Error();
    return result;
  } catch {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function ceilDivQuote(numerator: BN, denominator: BN): BN {
  if (denominator.lte(toBN(0))) throw new Error("LaunchLab quote denominator must be positive.");
  return numerator.add(denominator).sub(toBN(1)).div(denominator);
}

function quoteFeeRate(options: LaunchLabQuoteOptions): BN {
  const rate = quoteBN(options.protocolFeeRate ?? CMC_DEVNET_LAUNCH_TRADE_FEE_RATE, "protocolFeeRate")
    .add(quoteBN(options.platformFeeRate ?? CMC_DEVNET_PLATFORM_FEE_RATE, "platformFeeRate"))
    .add(quoteBN(options.shareFeeRate ?? toBN(0), "shareFeeRate"))
    .add(quoteBN(options.creatorFeeRate ?? toBN(0), "creatorFeeRate"));
  // The SDK uses a 1,000,000 denominator for LaunchLab fees.
  if (rate.gte(toBN(1_000_000))) throw new Error("LaunchLab fee rate must be below 1,000,000.");
  return rate;
}

function quoteOptions(value: LaunchLabQuoteOptions | bigint | number | undefined): LaunchLabQuoteOptions {
  if (typeof value === "bigint" || typeof value === "number") return { slippageBps: value };
  return value ?? {};
}

function assertQuotePool(pool: LaunchLabPoolState): void {
  if (pool.status !== LAUNCHLAB_POOL_STATUS_TRADING) {
    throw new Error(`LaunchLab pool is not trading (status ${pool.status}).`);
  }
  if (pool.virtualA.lte(toBN(0)) || pool.virtualB.lte(toBN(0))) {
    throw new Error("LaunchLab pool has invalid virtual reserves.");
  }
  if (pool.realA.lt(toBN(0)) || pool.realA.gt(pool.totalSellA)) {
    throw new Error("LaunchLab pool has invalid base-token reserves.");
  }
  if (pool.realB.lt(toBN(0)) || pool.realB.gt(pool.totalFundRaisingB)) {
    throw new Error("LaunchLab pool has invalid quote reserves.");
  }
}

function slippageForQuote(amount: BN, options: LaunchLabQuoteOptions): BN {
  return slippageBound(amount, options.slippageBps ?? 0n, "minimum");
}

/**
 * Gross SOL still accepted by the curve before its fundraising cap.  This is
 * the state-derived value, rather than a UI estimate: realB and
 * totalFundRaisingB are u64s in the finalized pool account.
 */
export function remainingSolToGraduation(pool: LaunchLabPoolState): BN {
  assertQuotePool(pool);
  return pool.totalFundRaisingB.gt(pool.realB)
    ? pool.totalFundRaisingB.sub(pool.realB)
    : toBN(0);
}

export const remainingQuoteToGraduation = remainingSolToGraduation;

function buyQuote(
  pool: LaunchLabPoolState,
  requested: QuoteAmount,
  suppliedOptions?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote {
  assertQuotePool(pool);
  const options = quoteOptions(suppliedOptions);
  const amountIn = quoteBN(requested, "buy amount");
  if (amountIn.lte(toBN(0))) throw new Error("Buy amount must be positive.");
  const feeRate = quoteFeeRate(options);
  const denominator = toBN(1_000_000);
  const inputReserve = pool.virtualB.add(pool.realB);
  const outputReserve = pool.virtualA.sub(pool.realA);
  const remainingA = pool.totalSellA.sub(pool.realA);
  if (remainingA.lte(toBN(0))) throw new Error("LaunchLab pool has graduated; no base tokens remain.");
  if (remainingA.gte(outputReserve)) throw new Error("LaunchLab pool has invalid base-token liquidity.");

  // Invert the integer constant-product formula to find the exact-in
  // boundary.  Fees are inverted separately, using the SDK's ceil division.
  const netAtBoundary = ceilDivQuote(inputReserve.mul(remainingA), outputReserve.sub(remainingA));
  const grossAtBoundary = ceilDivQuote(netAtBoundary.mul(denominator), denominator.sub(feeRate));
  const remainingSOL = remainingSolToGraduation(pool);
  // realB tracks the post-fee quote reserve. Gross-up the remaining net raise
  // before capping, otherwise every final buy leaves its fee amount unfilled.
  const grossForFundraisingCap = ceilDivQuote(remainingSOL.mul(denominator), denominator.sub(feeRate));
  const maxAccepted = grossAtBoundary.lt(grossForFundraisingCap) ? grossAtBoundary : grossForFundraisingCap;
  const amountInUsed = amountIn.lt(maxAccepted) ? amountIn : maxAccepted;
  if (amountInUsed.lte(toBN(0))) throw new Error("LaunchLab pool has reached its fundraising cap.");

  const fee = ceilDivQuote(amountInUsed.mul(feeRate), denominator);
  const amountInAfterFees = amountInUsed.sub(fee);
  const rawOut = amountInAfterFees.lte(toBN(0))
    ? toBN(0)
    : amountInAfterFees.mul(outputReserve).div(inputReserve.add(amountInAfterFees));
  const amountOut = rawOut.gt(remainingA) ? remainingA : rawOut;
  return {
    amountIn,
    amountInUsed,
    refund: amountIn.sub(amountInUsed),
    grossConsumed: amountInUsed,
    amountInAfterFees,
    amountOut,
    minimumAmountOut: slippageForQuote(amountOut, options),
    fee,
    remainingSolToGraduation: remainingSOL,
    cappedAtGraduation: amountIn.gt(amountInUsed),
  };
}

function sellQuote(
  pool: LaunchLabPoolState,
  requested: QuoteAmount,
  suppliedOptions?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote {
  assertQuotePool(pool);
  const options = quoteOptions(suppliedOptions);
  const amountIn = quoteBN(requested, "sell amount");
  if (amountIn.lte(toBN(0))) throw new Error("Sell amount must be positive.");
  if (amountIn.gt(pool.realA)) throw new Error("Sell amount exceeds the pool's available base-token reserve.");
  const feeRate = quoteFeeRate(options);
  const inputReserve = pool.virtualA.sub(pool.realA);
  const outputReserve = pool.virtualB.add(pool.realB);
  if (inputReserve.lte(toBN(0)) || outputReserve.lte(toBN(0))) throw new Error("LaunchLab pool has invalid reserves.");
  const grossOut = amountIn.mul(outputReserve).div(inputReserve.add(amountIn));
  const fee = ceilDivQuote(grossOut.mul(feeRate), toBN(1_000_000));
  const amountOut = grossOut.sub(fee);
  return {
    amountIn,
    amountInUsed: amountIn,
    refund: toBN(0),
    grossConsumed: amountIn,
    amountInAfterFees: amountIn,
    amountOut,
    minimumAmountOut: slippageForQuote(amountOut, options),
    fee,
    remainingSolToGraduation: remainingSolToGraduation(pool),
    cappedAtGraduation: false,
  };
}

export function quoteLaunchLabBuyExactIn(
  pool: LaunchLabPoolState,
  amountIn: QuoteAmount,
  options?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote;
export function quoteLaunchLabBuyExactIn(request: {
  pool: LaunchLabPoolState;
  amountIn: QuoteAmount;
  options?: LaunchLabQuoteOptions | bigint | number;
} & LaunchLabQuoteOptions): LaunchLabQuote;
export function quoteLaunchLabBuyExactIn(
  poolOrRequest: LaunchLabPoolState | ({ pool: LaunchLabPoolState; amountIn: QuoteAmount; options?: LaunchLabQuoteOptions | bigint | number } & LaunchLabQuoteOptions),
  amountIn?: QuoteAmount,
  options?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote {
  if ("pool" in poolOrRequest) {
    const nested = poolOrRequest.options;
    const merged = typeof nested === "object" || nested === undefined
      ? { ...poolOrRequest, ...(nested ?? {}) }
      : nested;
    return buyQuote(poolOrRequest.pool, poolOrRequest.amountIn, merged);
  }
  if (amountIn === undefined) throw new Error("Buy amount is required.");
  return buyQuote(poolOrRequest, amountIn, options);
}

export function quoteLaunchLabSellExactIn(
  pool: LaunchLabPoolState,
  amountIn: QuoteAmount,
  options?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote;
export function quoteLaunchLabSellExactIn(request: {
  pool: LaunchLabPoolState;
  amountIn: QuoteAmount;
  options?: LaunchLabQuoteOptions | bigint | number;
} & LaunchLabQuoteOptions): LaunchLabQuote;
export function quoteLaunchLabSellExactIn(
  poolOrRequest: LaunchLabPoolState | ({ pool: LaunchLabPoolState; amountIn: QuoteAmount; options?: LaunchLabQuoteOptions | bigint | number } & LaunchLabQuoteOptions),
  amountIn?: QuoteAmount,
  options?: LaunchLabQuoteOptions | bigint | number,
): LaunchLabQuote {
  if ("pool" in poolOrRequest) {
    const nested = poolOrRequest.options;
    const merged = typeof nested === "object" || nested === undefined
      ? { ...poolOrRequest, ...(nested ?? {}) }
      : nested;
    return sellQuote(poolOrRequest.pool, poolOrRequest.amountIn, merged);
  }
  if (amountIn === undefined) throw new Error("Sell amount is required.");
  return sellQuote(poolOrRequest, amountIn, options);
}

export const quoteLaunchLabBuy = quoteLaunchLabBuyExactIn;
export const quoteLaunchLabSell = quoteLaunchLabSellExactIn;

export function previewFee(
  feeLamports: number | null,
  amountLamports: BN,
): { feeLamports: number | null; totalLamports: BN | null } {
  if (feeLamports === null) return { feeLamports: null, totalLamports: null };
  if (!Number.isSafeInteger(feeLamports) || feeLamports < 0) throw new Error("RPC returned an invalid fee preview.");
  return {
    feeLamports,
    totalLamports: amountLamports.add(toBN(feeLamports)),
  };
}

function deriveAccounts(request: LaunchLabRequest): {
  programId: PublicKey;
  platformId: PublicKey;
  quote: PublicKey;
  auth: PublicKey;
  poolId: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  metadata: PublicKey;
  platformClaimFeeVault: PublicKey;
  creatorClaimFeeVault: PublicKey;
  userTokenAccountA: PublicKey;
  userTokenAccountB: PublicKey;
} {
  const programId = request.programId ?? DEVNET_LAUNCHLAB_PROGRAM_ID;
  const platformId = request.platformId;
  if (!platformId) throw new Error("An explicit CMC Platform PDA is required.");
  const quote = canonicalQuote(request.mintB);
  const auth = getPdaLaunchpadAuth(programId).publicKey;
  const poolId = getPdaLaunchpadPoolId(programId, request.mintA, quote).publicKey;
  const vaultA = getPdaLaunchpadVaultId(programId, poolId, request.mintA).publicKey;
  const vaultB = getPdaLaunchpadVaultId(programId, poolId, quote).publicKey;
  const metadata = getPdaMetadataKey(request.mintA).publicKey;
  const creator = request.creator ?? request.wallet;
  const userTokenAccountA = getAssociatedTokenAddressSync(request.mintA, request.wallet);
  const userTokenAccountB = getAssociatedTokenAddressSync(quote, request.wallet);
  const accounts = request.accounts;
  assertExpected("pool", accounts?.poolId, poolId);
  assertExpected("auth", accounts?.auth, auth);
  assertExpected("vault A", accounts?.vaultA, vaultA);
  assertExpected("vault B", accounts?.vaultB, vaultB);
  assertExpected("metadata", accounts?.metadata, metadata);
  assertExpected("user token A", accounts?.userTokenAccountA, userTokenAccountA);
  assertExpected("user token B", accounts?.userTokenAccountB, userTokenAccountB);
  assertExpected("platform fee vault", accounts?.platformClaimFeeVault, getPdaPlatformVault(programId, platformId, quote).publicKey);
  assertExpected("creator fee vault", accounts?.creatorClaimFeeVault, getPdaCreatorVault(programId, creator, quote).publicKey);
  return {
    programId,
    platformId,
    quote,
    auth,
    poolId,
    vaultA,
    vaultB,
    metadata,
    platformClaimFeeVault: getPdaPlatformVault(programId, platformId, quote).publicKey,
    creatorClaimFeeVault: getPdaCreatorVault(programId, creator, quote).publicKey,
    userTokenAccountA,
    userTokenAccountB,
  };
}

function instructionsFor(
  request: LaunchLabRequest,
  accounts: ReturnType<typeof deriveAccounts>,
  temporaryWsolAccount = false,
): TransactionInstruction[] {
  if (request.operation === "create") {
    const decimals = request.decimals ?? 6;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw new Error("Invalid token decimals.");
    if (!request.name || !request.symbol || !request.uri) throw new Error("Create metadata fields are required.");
    return [
      initializeV2(
        accounts.programId,
        request.wallet,
        request.creator ?? request.wallet,
        request.configId,
        accounts.platformId,
        accounts.auth,
        accounts.poolId,
        request.mint.publicKey,
        accounts.quote,
        accounts.vaultA,
        accounts.vaultB,
        accounts.metadata,
        TOKEN_PROGRAM_ID,
        decimals,
        request.name,
        request.symbol,
        request.uri,
        {
          type: "ConstantCurve",
          totalSellA: request.totalSellA,
          migrateType: "cpmm",
          supply: request.supply,
          totalFundRaisingB: request.totalFundRaisingB,
        },
        request.totalLockedAmount ?? toBN(0),
        request.cliffPeriod ?? toBN(0),
        request.unlockPeriod ?? toBN(0),
        CpmmCreatorFeeOn.OnlyTokenB,
      ),
    ];
  }
  const tradeAmount = request.amount;
  if (tradeAmount.lte(toBN(0)) || request.minAmount.lte(toBN(0))) throw new Error("Trade amounts and minimum output must be positive.");
  const common = [
    accounts.programId,
    request.wallet,
    accounts.auth,
    request.configId,
    accounts.platformId,
    accounts.poolId,
    accounts.userTokenAccountA,
    accounts.userTokenAccountB,
    accounts.vaultA,
    accounts.vaultB,
    request.mintA,
    accounts.quote,
    TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    accounts.platformClaimFeeVault,
    accounts.creatorClaimFeeVault,
    tradeAmount,
    request.minAmount,
    request.shareFeeRate ?? toBN(0),
    request.shareFeeReceiver,
  ] as const;
  return [
    createAssociatedTokenAccountIdempotentInstruction(request.wallet, accounts.userTokenAccountA, request.wallet, request.mintA),
    ...(temporaryWsolAccount
      ? [createAssociatedTokenAccountInstruction(request.wallet, accounts.userTokenAccountB, request.wallet, accounts.quote)]
      : [createAssociatedTokenAccountIdempotentInstruction(request.wallet, accounts.userTokenAccountB, request.wallet, accounts.quote)]),
    ...(request.operation === "buy"
      ? [
          SystemProgram.transfer({ fromPubkey: request.wallet, toPubkey: accounts.userTokenAccountB, lamports: BigInt(tradeAmount.toString()) }),
          createSyncNativeInstruction(accounts.userTokenAccountB),
          buyExactInInstruction(...common),
        ]
      : [sellExactInInstruction(...common)]),
    ...(temporaryWsolAccount
      ? [createCloseAccountInstruction(accounts.userTokenAccountB, request.wallet, request.wallet, [], TOKEN_PROGRAM_ID)]
      : []),
  ];
}

function assertPlatformRequest(request: CreatePlatformRequest): PublicKey {
  if (request.cluster !== DEVNET_CLUSTER) {
    throw new Error("LaunchLab Platform construction is disabled outside Solana devnet.");
  }
  const keys: Array<[string, PublicKey]> = [
    ["wallet", request.wallet],
    ["platform admin", request.platformAdmin],
    ["CPMM config", request.cpConfigId],
    ["platform claim fee wallet", request.platformClaimFeeWallet],
    ["platform lock NFT wallet", request.platformLockNftWallet],
    ["platform vesting wallet", request.platformVestingWallet],
    ["transfer fee extension authority", request.transferFeeExtensionAuth],
  ];
  for (const [field, value] of keys) {
    asPublicKey(value, field);
    assertNonZero(value, field);
  }
  if (!request.wallet.equals(CMC_DEVNET_ADMIN) || !request.platformAdmin.equals(CMC_DEVNET_ADMIN)) {
    throw new Error("The wallet and Platform admin must equal the reviewed CMC devnet admin.");
  }
  const programId = DEVNET_LAUNCHLAB_PROGRAM_ID;
  const platformId = CMC_DEVNET_PLATFORM_ID;
  if (request.platformId && !request.platformId.equals(platformId)) {
    throw new Error("Platform PDA does not match the reviewed CMC Platform PDA.");
  }
  if (!request.cpConfigId.equals(CMC_DEVNET_CPMM_CONFIG_ID)) {
    throw new Error("CPMM config does not match the reviewed devnet config.");
  }
  if (!request.platformClaimFeeWallet.equals(CMC_DEVNET_TREASURY)
    || !request.platformLockNftWallet.equals(CMC_DEVNET_TREASURY)
    || !request.platformVestingWallet.equals(CMC_DEVNET_TREASURY)
    || !request.transferFeeExtensionAuth.equals(CMC_DEVNET_TREASURY)) {
    throw new Error("All Platform destinations and authorities must equal the reviewed CMC treasury.");
  }
  if (!request.feeRate.eq(CMC_DEVNET_PLATFORM_FEE_RATE)) {
    throw new Error("Platform fee rate is pinned to 5000 base units (0.50%).");
  }
  if (!request.creatorFeeRate.eq(CMC_DEVNET_CREATOR_FEE_RATE)) {
    throw new Error("Creator fee rate is pinned to zero.");
  }
  if (!request.migrateCpLockNftScale.platformScale.eq(CMC_DEVNET_PLATFORM_SCALE)
    || !request.migrateCpLockNftScale.creatorScale.eq(CMC_DEVNET_CREATOR_SCALE)
    || !request.migrateCpLockNftScale.burnScale.eq(CMC_DEVNET_BURN_SCALE)
    || !(request.platformVestingScale ?? toBN(0)).eq(CMC_DEVNET_PLATFORM_VESTING_SCALE)) {
    throw new Error("Platform migration and vesting scales do not match the reviewed policy.");
  }
  if (!request.name || !request.web || !request.img) throw new Error("Platform metadata fields are required.");
  return platformId;
}

async function finishPreparation(
  transaction: Transaction,
  operation: LaunchLabOperation,
  wallet: PublicKey,
  connection: ConnectionLike,
  intentSnapshot: IntentSnapshot,
  verification: PreparedLaunchLabTransaction["verification"],
  accounts?: Required<Pick<LaunchLabAccounts, "poolId" | "auth" | "vaultA" | "vaultB">>,
  platform?: { platformId: PublicKey; cpConfigId: PublicKey },
  recentOverride?: { blockhash: string; lastValidBlockHeight: number },
  ephemeralSigner?: Keypair,
): Promise<PreparedLaunchLabTransaction> {
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    }),
    ComputeBudgetProgram.setComputeUnitLimit({
      units: CMC_DEVNET_COMPUTE_UNIT_LIMIT,
    }),
  );
  transaction.feePayer = wallet;
  const recent = recentOverride ?? await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = recent.blockhash;
  transaction.lastValidBlockHeight = recent.lastValidBlockHeight;
  if (ephemeralSigner) transaction.partialSign(ephemeralSigner);
  // web3.js legacy Transaction uses the (transaction, signers?, includeAccounts?)
  // overload. Passing the VersionedTransaction config object here throws
  // "Invalid arguments" before RPC submission.
  const simulation = (await connection.simulateTransaction(transaction)).value;
  if (simulation.err) {
    const programLogs = simulation.logs?.length ? ` Program logs: ${simulation.logs.join(" | ")}` : "";
    throw new Error(`LaunchLab simulation failed: ${JSON.stringify(simulation.err)}.${programLogs}`);
  }
  const feeResponse = connection.getFeeForMessage
    ? await connection.getFeeForMessage(transaction.compileMessage(), "confirmed")
    : null;
  const preparedMessageHex = Buffer.from(transaction.serializeMessage()).toString("hex");
  return {
    transaction,
    ...(ephemeralSigner ? { ephemeralSigner } : {}),
    preparedMessageHex,
    operation,
    wallet,
    blockhash: recent.blockhash,
    lastValidBlockHeight: recent.lastValidBlockHeight,
    feeLamports: feeResponse?.value ?? null,
    simulation,
    ...(accounts ? { accounts } : {}),
    ...(platform ? { platform } : {}),
    intentSnapshot,
    verification,
  };
}

export async function prepareLaunchLabTransaction(
  request: LaunchLabRequest,
  connection: ConnectionLike,
): Promise<PreparedLaunchLabTransaction> {
  assertDevnetLaunchLab(request);
  if (!request.platformId) throw new Error("An explicit CMC Platform PDA is required.");
  if (!connection.getAccountInfo) {
    throw new Error("LaunchLab config and Platform verification requires an account-info RPC.");
  }
  let reviewed: { config: ReviewedLaunchpadConfig; platform: ReviewedPlatformConfig; cpmm: ReviewedCpmmConfig };
  try {
    reviewed = await verifyReviewedLaunchAccounts(connection);
  } catch (error) {
    throw new Error(`The CMC Platform account or LaunchLab config account is not reviewed: ${error instanceof Error ? error.message : "verification failed"}`);
  }
  const accounts = deriveAccounts(request);
  // Only use a close instruction when the finalized read proves this ATA is
  // absent. A non-idempotent create makes a concurrent account creation fail
  // rather than allowing us to close an account that pre-dated this flow.
  const temporaryWsolAccount = request.operation !== "create"
    && (await connection.getAccountInfo(accounts.userTokenAccountB, "finalized")) === null;
  const transaction = new Transaction();
  transaction.add(...instructionsFor(request, accounts, temporaryWsolAccount));
  return finishPreparation(
    transaction,
    request.operation,
    request.wallet,
    connection,
    launchIntent(request, accounts),
    {
      config: { address: CMC_DEVNET_LAUNCHLAB_CONFIG_ID, state: reviewed.config },
      platform: { address: CMC_DEVNET_PLATFORM_ID, state: reviewed.platform },
      cpmmConfig: { address: CMC_DEVNET_CPMM_CONFIG_ID, state: reviewed.cpmm },
    },
    { poolId: accounts.poolId, auth: accounts.auth, vaultA: accounts.vaultA, vaultB: accounts.vaultB },
    undefined,
    undefined,
    request.operation === "create" ? request.mint : undefined,
  );
}

async function fetchFinalizedCpmmState(
  connection: ConnectionLike,
  mint: PublicKey,
): Promise<FinalizedCpmmState> {
  if (!connection.getAccountInfo || !connection.getTokenAccountBalance) {
    throw new Error("Finalized CPMM account and reserve RPCs are required.");
  }
  const programId = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
  const keys = getCreatePoolKeys({
    programId,
    configId: CMC_DEVNET_CPMM_CONFIG_ID,
    mintA: WSOL_MINT,
    mintB: mint,
  });
  const account = await connection.getAccountInfo(keys.poolId, "finalized");
  if (!account || !account.owner.equals(programId)) {
    throw new Error("The derived CPMM pool is missing or has the wrong owner.");
  }
  if (account.data.length < CpmmPoolInfoLayout.span
    || !LAUNCHLAB_POOL_DISCRIMINATOR.every((byte, index) => account.data[index] === byte)) {
    throw new Error("The derived CPMM pool layout or discriminator does not match.");
  }
  let decoded: ReturnType<typeof CpmmPoolInfoLayout.decode>;
  try {
    decoded = CpmmPoolInfoLayout.decode(Buffer.from(account.data));
  } catch {
    throw new Error("The derived CPMM pool could not be decoded.");
  }
  const exactKeys: Array<[string, PublicKey, PublicKey]> = [
    ["config", decoded.configId, CMC_DEVNET_CPMM_CONFIG_ID],
    ["mint A", decoded.mintA, WSOL_MINT],
    ["mint B", decoded.mintB, mint],
    ["vault A", decoded.vaultA, keys.vaultA],
    ["vault B", decoded.vaultB, keys.vaultB],
    ["LP mint", decoded.mintLp, keys.lpMint],
    ["observation", decoded.observationId, keys.observationId],
    ["creator", decoded.poolCreator, CMC_DEVNET_ADMIN],
  ];
  for (const [field, actual, expected] of exactKeys) {
    if (!actual.equals(expected)) throw new Error(`The CPMM pool ${field} does not match its reviewed derivation.`);
  }
  if (decoded.status !== 0) throw new Error("The CPMM pool is not open for swaps.");
  const [balanceA, balanceB] = await Promise.all([
    connection.getTokenAccountBalance(keys.vaultA, "finalized"),
    connection.getTokenAccountBalance(keys.vaultB, "finalized"),
  ]);
  const reserveA = toBN(balanceA.value.amount);
  const reserveB = toBN(balanceB.value.amount);
  if (reserveA.lte(toBN(0)) || reserveB.lte(toBN(0))) throw new Error("The CPMM pool has no finalized liquidity.");
  return Object.freeze({
    poolId: keys.poolId,
    authority: keys.authority,
    vaultA: keys.vaultA,
    vaultB: keys.vaultB,
    observationId: keys.observationId,
    reserveA,
    reserveB,
    feeOn: decoded.feeOn,
  });
}

function cpmmQuote(state: FinalizedCpmmState, side: "buy" | "sell", amountIn: BN): CpmmSwapQuote {
  if (amountIn.lte(toBN(0))) throw new Error("CPMM swap input must be positive.");
  const result = CurveCalculator.swapBaseInput(
    amountIn,
    side === "buy" ? state.reserveA : state.reserveB,
    side === "buy" ? state.reserveB : state.reserveA,
    toBN("2500"),
    CMC_DEVNET_CPMM_CREATOR_FEE_RATE,
    CMC_DEVNET_CPMM_PROTOCOL_FEE_RATE,
    CMC_DEVNET_CPMM_FUND_FEE_RATE,
    state.feeOn === CpmmCreatorFeeOn.OnlyTokenB ? side === "sell" : side === "buy",
  );
  const minimumAmountOut = result.outputAmount.mul(toBN(9_900)).div(toBN(10_000));
  if (result.outputAmount.lte(toBN(0)) || minimumAmountOut.lte(toBN(0))) {
    throw new Error("The finalized CPMM quote has no usable output.");
  }
  return Object.freeze({
    poolId: state.poolId,
    amountIn,
    amountOut: result.outputAmount,
    minimumAmountOut,
  });
}

export async function quoteFinalizedCpmmSwap(
  connection: ConnectionLike,
  mint: PublicKey,
  side: "buy" | "sell",
  amountIn: BN,
): Promise<CpmmSwapQuote> {
  return cpmmQuote(await fetchFinalizedCpmmState(connection, mint), side, amountIn);
}

export async function prepareCpmmSwapTransaction(
  request: {
    cluster: "devnet" | "mainnet-beta";
    wallet: PublicKey;
    mint: PublicKey;
    side: "buy" | "sell";
    amountIn: BN;
  },
  connection: ConnectionLike,
): Promise<{ prepared: PreparedLaunchLabTransaction; quote: CpmmSwapQuote }> {
  if (request.cluster !== DEVNET_CLUSTER) throw new Error("CPMM swap construction is disabled outside Solana devnet.");
  if (!connection.getAccountInfo) throw new Error("Reviewed CPMM config verification requires an account-info RPC.");
  const configData = await fetchReviewedAccount(
    connection,
    CMC_DEVNET_CPMM_CONFIG_ID,
    DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    CPMM_AMM_CONFIG_DISCRIMINATOR,
  );
  const cpmmConfig = decodeReviewedCpmmConfig(configData);
  const state = await fetchFinalizedCpmmState(connection, request.mint);
  const quote = cpmmQuote(state, request.side, request.amountIn);
  const userWsol = getAssociatedTokenAddressSync(WSOL_MINT, request.wallet);
  const userToken = getAssociatedTokenAddressSync(request.mint, request.wallet);
  const inputAccount = request.side === "buy" ? userWsol : userToken;
  const outputAccount = request.side === "buy" ? userToken : userWsol;
  const temporaryWsolAccount = (await connection.getAccountInfo(userWsol, "finalized")) === null;
  const transaction = new Transaction().add(
    ...(temporaryWsolAccount
      ? [createAssociatedTokenAccountInstruction(request.wallet, userWsol, request.wallet, WSOL_MINT)]
      : [createAssociatedTokenAccountIdempotentInstruction(request.wallet, userWsol, request.wallet, WSOL_MINT)]),
    createAssociatedTokenAccountIdempotentInstruction(request.wallet, userToken, request.wallet, request.mint),
    ...(request.side === "buy"
      ? [
          SystemProgram.transfer({
            fromPubkey: request.wallet,
            toPubkey: userWsol,
            lamports: BigInt(quote.amountIn.toString()),
          }),
          createSyncNativeInstruction(userWsol),
        ]
      : []),
    makeSwapCpmmBaseInInstruction(
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      request.wallet,
      state.authority,
      CMC_DEVNET_CPMM_CONFIG_ID,
      state.poolId,
      inputAccount,
      outputAccount,
      request.side === "buy" ? state.vaultA : state.vaultB,
      request.side === "buy" ? state.vaultB : state.vaultA,
      TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      request.side === "buy" ? WSOL_MINT : request.mint,
      request.side === "buy" ? request.mint : WSOL_MINT,
      state.observationId,
      quote.amountIn,
      quote.minimumAmountOut,
    ),
    ...(temporaryWsolAccount
      ? [createCloseAccountInstruction(userWsol, request.wallet, request.wallet, [], TOKEN_PROGRAM_ID)]
      : []),
  );
  const intentSnapshot = freezeDeep({
    operation: request.side,
    accounts: {
      wallet: request.wallet.toBase58(),
      mint: request.mint.toBase58(),
      poolId: state.poolId.toBase58(),
      configId: CMC_DEVNET_CPMM_CONFIG_ID.toBase58(),
      inputAccount: inputAccount.toBase58(),
      outputAccount: outputAccount.toBase58(),
    },
    parameters: {
      venue: "cpmm",
      amountIn: quote.amountIn.toString(),
      minimumAmountOut: quote.minimumAmountOut.toString(),
    },
  });
  const prepared = await finishPreparation(
    transaction,
    request.side,
    request.wallet,
    connection,
    intentSnapshot,
    { cpmmConfig: { address: CMC_DEVNET_CPMM_CONFIG_ID, state: cpmmConfig } },
  );
  return { prepared, quote };
}

/**
 * Prepare (but never claim to have submitted) the one instruction that
 * creates the reviewed CMC Platform PDA and never accepts arbitrary
 * governance, fee, or destination values.
 */
export async function preparePlatformTransaction(
  request: CreatePlatformRequest,
  connection: ConnectionLike,
): Promise<PreparedLaunchLabTransaction> {
  const platformId = assertPlatformRequest(request);
  if (!connection.getAccountInfo) throw new Error("CPMM config verification requires an account-info RPC.");
  let cpmmState: ReviewedCpmmConfig;
  try {
    const cpmmData = await fetchReviewedAccount(
      connection,
      CMC_DEVNET_CPMM_CONFIG_ID,
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      CPMM_AMM_CONFIG_DISCRIMINATOR,
    );
    cpmmState = decodeReviewedCpmmConfig(cpmmData);
  } catch (error) {
    throw new Error(`The reviewed CPMM config account is missing, has the wrong owner/discriminator, or failed decoded policy verification: ${error instanceof Error ? error.message : "verification failed"}`);
  }
  const instruction = createPlatformConfig(
    DEVNET_LAUNCHLAB_PROGRAM_ID,
    request.platformAdmin,
    request.platformClaimFeeWallet,
    request.platformLockNftWallet,
    request.platformVestingWallet,
    platformId,
    request.cpConfigId,
    request.transferFeeExtensionAuth,
    request.migrateCpLockNftScale,
    request.feeRate,
    request.creatorFeeRate,
    request.name,
    request.web,
    request.img,
    request.platformVestingScale ?? toBN(0),
  );
  const transaction = new Transaction().add(instruction);
  return finishPreparation(
    transaction,
    "createPlatform",
    request.wallet,
    connection,
    platformIntent(request, platformId),
    { cpmmConfig: { address: CMC_DEVNET_CPMM_CONFIG_ID, state: cpmmState! } },
    undefined,
    { platformId, cpConfigId: request.cpConfigId },
    undefined,
  );
}

function assertConfigurePlatformRequest(request: ConfigurePlatformRequest): PublicKey {
  if (request.cluster !== DEVNET_CLUSTER) throw new Error("Only devnet Platform governance completion is enabled.");
  if (!request.wallet.equals(CMC_DEVNET_ADMIN)) throw new Error("The pinned CMC devnet admin wallet is required.");
  const platformId = request.platformId ?? CMC_DEVNET_PLATFORM_ID;
  if (!platformId.equals(CMC_DEVNET_PLATFORM_ID)) throw new Error("The reviewed CMC Platform PDA is required.");
  return platformId;
}

export async function prepareConfigurePlatformTransaction(
  request: ConfigurePlatformRequest,
  connection: ConnectionLike,
): Promise<PreparedLaunchLabTransaction> {
  const platformId = assertConfigurePlatformRequest(request);
  if (!connection.getAccountInfo) throw new Error("Finalized Platform verification requires an account-info RPC.");
  let state: ReviewedPlatformConfig;
  try {
    const data = await fetchReviewedAccount(
      connection,
      platformId,
      DEVNET_LAUNCHLAB_PROGRAM_ID,
      PLATFORM_CONFIG_DISCRIMINATOR,
    );
    state = decodeGovernancePlatformConfig(data);
  } catch (error) {
    throw new Error(`The Platform is not eligible for governance completion: ${error instanceof Error ? error.message : "verification failed"}`);
  }
  if (state.platformCpCreator === CMC_DEVNET_ADMIN.toBase58()
    && state.curveRuleManager === CMC_DEVNET_ADMIN.toBase58()) {
    throw new Error("The reviewed CMC Platform is already configured; no governance completion transaction is needed.");
  }
  const transaction = new Transaction().add(
    updatePlatformConfig(DEVNET_LAUNCHLAB_PROGRAM_ID, CMC_DEVNET_ADMIN, platformId, {
      type: "updatePlatformCpCreator",
      value: CMC_DEVNET_ADMIN,
    }),
    updatePlatformConfig(DEVNET_LAUNCHLAB_PROGRAM_ID, CMC_DEVNET_ADMIN, platformId, {
      type: "updateCurveRuleManager",
      value: CMC_DEVNET_ADMIN,
    }),
  );
  return finishPreparation(
    transaction,
    "configurePlatform",
    request.wallet,
    connection,
    configurePlatformIntent(request.wallet, platformId),
    { platform: { address: platformId, state } },
    undefined,
    { platformId, cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID },
  );
}

function assertWallet(wallet: WalletSigner, expected: PublicKey): void {
  if (!wallet.publicKey || !wallet.publicKey.equals(expected)) {
    throw new Error("Wallet identity changed before the next LaunchLab signature.");
  }
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1;
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return "1".repeat(zeroes) + digits.reverse().map((digit) => BASE58[digit]).join("");
}

/** The transaction signature is the first signature in the signed message. */
export function signatureFromSignedTransaction(transaction: Transaction): string {
  const raw = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const signatureCount = raw[0] ?? 0;
  const signature = signatureCount > 0 ? raw.slice(1, 65) : new Uint8Array();
  if (signature.length !== 64 || signature.every((byte) => byte === 0)) {
    throw new Error("Wallet returned a transaction without a valid signature.");
  }
  return encodeBase58(signature);
}

function isExpiredError(error: unknown): boolean {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const text = `${candidate?.name ?? ""} ${candidate?.message ?? error ?? ""}`.toLowerCase();
  return text.includes("transactionexpiredblockheightexceeded")
    || text.includes("block height exceeded")
    || text.includes("transaction expired");
}

type TransactionStructure = {
  recentBlockhash: string | null;
  feePayer: string | null;
  instructionCount: number;
  instructionProgramIds: string[];
  accountKeyCount: number | null;
};

function transactionStructure(transaction: Transaction): TransactionStructure {
  let accountKeyCount: number | null = null;
  try {
    accountKeyCount = transaction.compileMessage().accountKeys.length;
  } catch {
    // Keep diagnostics safe and useful even if a provider returned an
    // incomplete Transaction object.
  }
  return {
    recentBlockhash: transaction.recentBlockhash ?? null,
    feePayer: transaction.feePayer?.toBase58() ?? null,
    instructionCount: transaction.instructions.length,
    instructionProgramIds: transaction.instructions.map((instruction) => instruction.programId.toBase58()),
    accountKeyCount,
  };
}

function walletMessageMismatchError(expected: TransactionStructure, actual: Transaction): Error {
  return new Error(
    `Wallet changed the transaction message after approval. Structural diff: ${JSON.stringify({
      expected,
      actual: transactionStructure(actual),
    })}`,
  );
}

async function recheckPreparedVerification(
  prepared: PreparedLaunchLabTransaction,
  connection: ConnectionLike,
): Promise<void> {
  if (!connection.getAccountInfo) throw new Error("Finalized account verification is unavailable before signing.");
  const verification = prepared.verification;
  if (prepared.operation === "configurePlatform" && verification.platform) {
    try {
      const data = await fetchReviewedAccount(
        connection,
        verification.platform.address,
        DEVNET_LAUNCHLAB_PROGRAM_ID,
        PLATFORM_CONFIG_DISCRIMINATOR,
      );
      const current = decodeGovernancePlatformConfig(data);
      for (const [field, value] of Object.entries(current)) {
        if (field !== "platformCpCreator" && field !== "curveRuleManager"
          && value !== verification.platform.state[field]) {
          throw new Error(`Platform ${field} changed`);
        }
      }
    } catch {
      throw new Error("Reviewed Platform governance state changed or is no longer eligible; prepare again.");
    }
    return;
  }
  if (verification.config && verification.platform) {
    const reviewed = await verifyReviewedLaunchAccounts(connection);
    if (JSON.stringify(reviewed.config) !== JSON.stringify(verification.config.state)
      || JSON.stringify(reviewed.platform) !== JSON.stringify(verification.platform.state)
      || JSON.stringify(reviewed.cpmm) !== JSON.stringify(verification.cpmmConfig?.state)) {
      throw new Error("Reviewed LaunchLab or Platform account state changed; prepare again.");
    }
  }
  if (verification.cpmmConfig) {
    try {
      const cpmmData = await fetchReviewedAccount(
        connection,
        verification.cpmmConfig.address,
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        CPMM_AMM_CONFIG_DISCRIMINATOR,
      );
      const current = decodeReviewedCpmmConfig(cpmmData);
      if (JSON.stringify(current) !== JSON.stringify(verification.cpmmConfig.state)) {
        throw new Error("decoded CPMM config state changed");
      }
    } catch {
      throw new Error("Reviewed CPMM config state changed; prepare again.");
    }
  }
}

async function refreshExpiredPreparedTransaction(
  prepared: PreparedLaunchLabTransaction,
  connection: ConnectionLike,
  currentBlockHeight: number,
): Promise<void> {
  const recent = await connection.getLatestBlockhash("confirmed");
  if (!Number.isSafeInteger(recent.lastValidBlockHeight)
    || recent.lastValidBlockHeight <= currentBlockHeight) {
    throw new Error("RPC returned an already-expired replacement blockhash; prepare again.");
  }
  prepared.transaction.recentBlockhash = recent.blockhash;
  prepared.transaction.lastValidBlockHeight = recent.lastValidBlockHeight;
  // A recent-blockhash change invalidates every old signature. Re-sign only
  // the locally retained non-wallet signer; the wallet must approve fresh
  // bytes below.
  prepared.transaction.signatures = prepared.transaction.signatures.map(({ publicKey }) => ({
    publicKey,
    signature: null,
  }));
  if (prepared.operation === "create") {
    if (!prepared.ephemeralSigner) {
      throw new Error("Create transaction lost its ephemeral mint signer; prepare again.");
    }
    prepared.transaction.partialSign(prepared.ephemeralSigner);
  }
  // Legacy web3.js Transaction simulation takes the transaction as its
  // single argument. Do not pass a VersionedTransaction config object.
  const simulation = (await connection.simulateTransaction(prepared.transaction)).value;
  if (simulation.err) {
    const programLogs = simulation.logs?.length ? ` Program logs: ${simulation.logs.join(" | ")}` : "";
    throw new Error(`Refreshed LaunchLab simulation failed: ${JSON.stringify(simulation.err)}.${programLogs}`);
  }
  const feeResponse = connection.getFeeForMessage
    ? await connection.getFeeForMessage(prepared.transaction.compileMessage(), "confirmed")
    : null;
  prepared.blockhash = recent.blockhash;
  prepared.lastValidBlockHeight = recent.lastValidBlockHeight;
  prepared.feeLamports = feeResponse?.value ?? null;
  prepared.simulation = simulation;
  prepared.preparedMessageHex = Buffer.from(prepared.transaction.serializeMessage()).toString("hex");
}

export async function signAndSubmitLaunchLab(
  prepared: PreparedLaunchLabTransaction,
  wallet: WalletSigner,
  connection: ConnectionLike,
  store: RecoveryStore,
  now = Date.now(),
): Promise<{
  signature: string;
  confirmation?: { value: { err: unknown } };
  status: "finalized" | "reverted" | "expired";
}> {
  const currentMessageHex = Buffer.from(prepared.transaction.serializeMessage()).toString("hex");
  if (currentMessageHex !== prepared.preparedMessageHex) {
    throw new Error("Prepared transaction changed after simulation; prepare and review a new transaction.");
  }
  assertWallet(wallet, prepared.wallet);
  const currentBlockHeight = await connection.getBlockHeight("confirmed");
  if (!Number.isSafeInteger(currentBlockHeight)) throw new Error("RPC returned an invalid block height.");
  assertWallet(wallet, prepared.wallet);
  await recheckPreparedVerification(prepared, connection);
  assertWallet(wallet, prepared.wallet);
  if (currentBlockHeight >= prepared.lastValidBlockHeight) {
    await refreshExpiredPreparedTransaction(prepared, connection, currentBlockHeight);
    assertWallet(wallet, prepared.wallet);
  }
  const expectedStructure = transactionStructure(prepared.transaction);
  const signed = await wallet.signTransaction(prepared.transaction);
  const returnedMessage = signed.serializeMessage();
  if (Buffer.from(returnedMessage).toString("hex") !== prepared.preparedMessageHex) {
    throw walletMessageMismatchError(expectedStructure, signed);
  }
  // A wallet account change during the approval prompt invalidates this
  // signature, even though the transaction message itself was unchanged.
  assertWallet(wallet, prepared.wallet);
  const signature = signatureFromSignedTransaction(signed);
  const pending: PendingLaunchLabTransaction = {
    id: `${prepared.operation}:${signature}:${now}`,
    signature,
    operation: prepared.operation,
    wallet: prepared.wallet.toBase58(),
    blockhash: prepared.blockhash,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    submittedAt: now,
  };
  // Persist before handing bytes to the RPC. A timeout or browser shutdown
  // after signing must leave a recoverable record.
  store.set(pending);
  const rpcSignature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
  if (rpcSignature !== signature) {
    throw new Error("RPC returned a signature different from the signed transaction.");
  }
  let confirmation: { value: { err: unknown } };
  try {
    confirmation = await connection.confirmTransaction({
      signature,
      blockhash: prepared.blockhash,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    }, "finalized");
  } catch (error) {
    if (isExpiredError(error)) {
      store.delete(pending.id);
      return { signature, status: "expired" };
    }
    throw error;
  }
  if (confirmation.value.err) {
    store.delete(pending.id);
    return { signature, confirmation, status: "reverted" };
  }
  store.delete(pending.id);
  return { signature, confirmation, status: "finalized" };
}

export async function recoverLaunchLabTransaction(
  pending: PendingLaunchLabTransaction,
  connection: ConnectionLike,
  store: RecoveryStore,
): Promise<{ signature: string; finalized: boolean; status: "finalized" | "reverted" | "expired" }> {
  try {
    const confirmation = await connection.confirmTransaction({
      signature: pending.signature,
      blockhash: pending.blockhash,
      lastValidBlockHeight: pending.lastValidBlockHeight,
    }, "finalized");
    if (confirmation.value.err) {
      store.delete(pending.id);
      return { signature: pending.signature, finalized: false, status: "reverted" };
    }
    store.delete(pending.id);
    return { signature: pending.signature, finalized: true, status: "finalized" };
  } catch (error) {
    if (isExpiredError(error)) {
      store.delete(pending.id);
      return { signature: pending.signature, finalized: false, status: "expired" };
    }
    // Unknown RPC failures are intentionally left pending for later recovery.
    throw error;
  }
}
