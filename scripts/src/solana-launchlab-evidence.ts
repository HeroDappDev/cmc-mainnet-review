import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * This module is deliberately a read-only collector.  It has no Solana
 * client/wallet dependency and the only RPC method it uses is a finalized
 * account/transaction read.  A lifecycle must have been authorized and
 * submitted by another, separately reviewed process before this collector is
 * run.
 */

export const EVIDENCE_SCHEMA = "solana-launchlab-graduation-evidence/v2";
export const FINALIZED_COMMITMENT = "finalized";
export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DEVNET_LAUNCHLAB_PROGRAM =
  "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6";
export const DEVNET_CPMM_PROGRAM =
  "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb";
export const SPL_TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const DEVNET_CONFIG_ID =
  "7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt";
export const DEVNET_CPMM_CONFIG_ID =
  "5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy";

type JsonRecord = Record<string, unknown>;
type CanonicalPinned = Required<NonNullable<EvidenceInput["pinned"]>>;

export type EvidenceInput = {
  cluster: "devnet";
  authorizationReference: string;
  pinned: {
    launchLabProgram?: string;
    cpmmProgram?: string;
    tokenProgram?: string;
    associatedTokenProgram?: string;
    systemProgram?: string;
    config: {
      id: string;
      values: JsonRecord;
    };
  };
  lifecycle: {
    signatures: Array<{
      role: "launch" | "buy" | "sell" | "migration" | "other";
      signature: string;
    }>;
    mint: string;
    launchState: string;
    platform: string;
    vaults: {
      base: string;
      quote: string;
    };
    cpmm: {
      pool: string;
      baseVault: string;
      quoteVault: string;
      lpMint: string;
      config: string;
    };
  };
};

export type Rpc = {
  call(method: string, params: unknown[]): Promise<unknown>;
};

export type AccountEvidence = Readonly<{
  address: string;
  owner: string;
  executable: boolean;
  lamports: number;
  slot: number;
  data: Readonly<{
    encoding: "base64";
    bytes: number;
    base64Sha256: string;
    base64: string;
  }>;
}>;

type DecodedStateRelationships = Readonly<{
  launchState: Readonly<{
    platform: string;
    baseMint: string;
    quoteMint: string;
    baseVault: string;
    quoteVault: string;
    configId: string;
  }>;
  cpmmPool: Readonly<{
    config: string;
    authority: string;
    baseMint: string;
    quoteMint: string;
    baseVault: string;
    quoteVault: string;
    lpMint: string;
  }>;
  vaults: Readonly<{
    launchBaseMint: string;
    launchQuoteMint: string;
    cpmmBaseMint: string;
    cpmmQuoteMint: string;
  }>;
  platform: Readonly<{
    cpmmConfigId: string;
  }>;
}>;

export type TransactionEvidence = Readonly<{
  role: EvidenceInput["lifecycle"]["signatures"][number]["role"];
  signature: string;
  finalized: true;
  slot: number;
  blockTime: string | null;
  verifiedAt: string;
  error: null;
  mentionedAccounts: readonly string[];
  mentionedPrograms: readonly string[];
  semantics: readonly Readonly<{
    kind: "launch" | "buy" | "sell" | "migration" | "cpmm-initialization";
    programId: string;
    discriminatorHex: string;
    instructionIndex: number;
    accounts: readonly string[];
    accountRoles: Readonly<Record<string, number>>;
    decodedAmounts: Readonly<Record<string, string>>;
  }>[];
}>;

export type GraduationEvidence = Readonly<{
  schema: typeof EVIDENCE_SCHEMA;
  evidenceKind: "finalized-devnet-launchlab-cpmm-graduation";
  status: "verified";
  capturedAt: string;
  verification: Readonly<{
    startedAt: string;
    completedAt: string;
    commitment: typeof FINALIZED_COMMITMENT;
    collector: "read-only-rpc";
    collectorSubmittedTransactions: false;
    walletLoaded: false;
    activationEligible: false;
  }>;
  network: Readonly<{
    cluster: "devnet";
    genesisHash: typeof DEVNET_GENESIS_HASH;
    authorizationReference: string;
  }>;
  pinned: Readonly<{
    programs: Readonly<{
      launchLab: AccountEvidence;
      cpmm: AccountEvidence;
    }>;
    tokenProgram: string;
    associatedTokenProgram: typeof ASSOCIATED_TOKEN_PROGRAM;
    systemProgram: typeof SYSTEM_PROGRAM;
    config: Readonly<{
      id: string;
      values: JsonRecord;
      canonicalSha256: string;
    }>;
  }>;
  lifecycle: Readonly<{
    transactions: readonly TransactionEvidence[];
    mint: AccountEvidence;
    launchState: AccountEvidence;
    platform: AccountEvidence;
    vaults: Readonly<{
      base: AccountEvidence;
      quote: AccountEvidence;
    }>;
    migration: Readonly<{
      signature: string;
      slot: number;
    }>;
    attestation: Readonly<{
      status: "unauthenticated";
      activationEligible: false;
      reason: string;
    }>;
    cpmm: Readonly<{
      pool: AccountEvidence;
      baseVault: AccountEvidence;
      quoteVault: AccountEvidence;
      lpMint: AccountEvidence;
      config: string | null;
    }>;
    stateRelationships: DecodedStateRelationships;
  }>;
  evidenceSha256: string;
}>;

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function rejectUrls(value: unknown, label: string): void {
  if (typeof value === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    throw new Error(`${label} must not contain a persisted URL`);
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as JsonRecord)) {
      if (/url|endpoint|credential|password|secret|privateKey|rpc/i.test(key)) {
        throw new Error(`${label}.${key} is not permitted in evidence`);
      }
      rejectUrls(child, `${label}.${key}`);
    }
  }
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

function iso(value: unknown, label: string): string {
  const input = nonEmpty(value, label);
  if (Number.isNaN(Date.parse(input))) throw new Error(`${label} is not an ISO timestamp`);
  return new Date(input).toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SEMANTIC_DISCRIMINATORS = new Map<
  string,
  "launch" | "buy" | "sell" | "migration"
>([
  ["faea0d7bd59c13ec", "buy"],
  ["18d3742869039938", "buy"],
  ["9527de9bd37c981a", "sell"],
  ["5fc8472208090ba6", "sell"],
  ["885cc8671cda908c", "migration"],
  ["cf52c091fecf91df", "migration"],
]);
const CPMM_INITIALIZATION_DISCRIMINATORS = new Set<string>();

// The LaunchLab create instruction has had several names across reviewed
// alpha IDLs.  These are Anchor global discriminators, not caller-provided
// labels.  Unknown launch instructions fail closed.
for (const name of [
  "create",
  "createLaunch",
  "createLaunchpad",
  "createLaunchpadV2",
  "createV2",
  "initialize",
  "initializeLaunch",
  "initializeLaunchpad",
]) {
  SEMANTIC_DISCRIMINATORS.set(
    sha256(`global:${name}`).slice(0, 16),
    "launch",
  );
}
for (const name of [
  "initialize",
  "initialize2",
  "initializePool",
  "initializePool2",
  "createPool",
]) {
  CPMM_INITIALIZATION_DISCRIMINATORS.add(sha256(`global:${name}`).slice(0, 16));
}

function fromBase58(value: string): Uint8Array | null {
  if (!value) return new Uint8Array();
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return null;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index]! * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leading = 0;
  while (leading < value.length && value[leading] === "1") leading += 1;
  return Uint8Array.from([
    ...new Array(Math.max(0, leading - 1)).fill(0),
    ...bytes.reverse(),
  ]);
}

function u64(bytes: Uint8Array, offset: number): string | null {
  if (offset < 0 || offset + 8 > bytes.length) return null;
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[offset + index]!);
  }
  return value.toString();
}

function toBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let result = "";
  while (value > 0n) {
    result = BASE58[Number(value % 58n)]! + result;
    value /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) leading += 1;
  return `${"1".repeat(leading)}${result || (leading === 0 ? "1" : "")}`;
}

function pubkeyAt(bytes: Uint8Array, offset: number, label: string): string {
  if (offset < 0 || offset + 32 > bytes.length) {
    throw new Error(`${label} state field is truncated`);
  }
  return toBase58(bytes.subarray(offset, offset + 32));
}

const POOL_STATE_DISCRIMINATOR = "f7ede3f5d7c3de46";
const PLATFORM_CONFIG_DISCRIMINATOR = "a04e8000f853e6a0";
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

function decodeStateRelationships(
  launchState: AccountEvidence,
  cpmmPool: AccountEvidence,
  mintAccount: AccountEvidence,
  lpMintAccount: AccountEvidence,
  baseVault: AccountEvidence,
  quoteVault: AccountEvidence,
  cpmmBaseVault: AccountEvidence,
  cpmmQuoteVault: AccountEvidence,
  platformAccount: AccountEvidence,
  expected: {
    launchLabProgram: string;
    cpmmProgram: string;
    tokenProgram: string;
    mint: string;
    platform: string;
    launchBaseVault: string;
    launchQuoteVault: string;
    cpmmPool: string;
    cpmmBaseVault: string;
    cpmmQuoteVault: string;
    lpMint: string;
    configId: string;
    cpmmConfigId: string;
  },
): DecodedStateRelationships {
  const launchBytes = Buffer.from(launchState.data.base64, "base64");
  if (
    launchState.owner !== expected.launchLabProgram ||
    launchBytes.length !== 429 ||
    Buffer.from(launchBytes.subarray(0, 8)).toString("hex") !== POOL_STATE_DISCRIMINATOR
  ) {
    throw new Error("LaunchState is not the reviewed 429-byte LaunchLab PoolState");
  }
  const platformBytes = Buffer.from(platformAccount.data.base64, "base64");
  if (
    platformAccount.owner !== expected.launchLabProgram ||
    platformBytes.length < 760 ||
    Buffer.from(platformBytes.subarray(0, 8)).toString("hex") !==
      PLATFORM_CONFIG_DISCRIMINATOR
  ) {
    throw new Error("Platform is not the reviewed PlatformConfig account");
  }
  // PlatformConfig is an Anchor layout; cpConfigId follows name, fee/epoch/
  // creator-fee, two wallet keys, three scales, web, and image fields.
  const platformCpmmConfig = pubkeyAt(platformBytes, 728, "Platform CPMM config");
  if (platformCpmmConfig !== expected.cpmmConfigId) {
    throw new Error("Platform CPMM config does not match the reviewed CPMM pool");
  }
  const launch = {
    configId: pubkeyAt(launchBytes, 141, "LaunchState config"),
    platform: pubkeyAt(launchBytes, 173, "LaunchState platform"),
    baseMint: pubkeyAt(launchBytes, 205, "LaunchState base mint"),
    quoteMint: pubkeyAt(launchBytes, 237, "LaunchState quote mint"),
    baseVault: pubkeyAt(launchBytes, 269, "LaunchState base vault"),
    quoteVault: pubkeyAt(launchBytes, 301, "LaunchState quote vault"),
  };
  if (
    launch.configId !== expected.configId ||
    launch.platform !== expected.platform ||
    launch.baseMint !== expected.mint ||
    launch.quoteMint !== NATIVE_SOL_MINT ||
    launch.baseVault !== expected.launchBaseVault ||
    launch.quoteVault !== expected.launchQuoteVault
  ) {
    throw new Error("LaunchState relationships do not match the reviewed lifecycle");
  }
  const cpmmBytes = Buffer.from(cpmmPool.data.base64, "base64");
  if (
    cpmmPool.owner !== expected.cpmmProgram ||
    cpmmBytes.length !== 637 ||
    Buffer.from(cpmmBytes.subarray(0, 8)).toString("hex") !== POOL_STATE_DISCRIMINATOR
  ) {
    throw new Error("CPMM pool is not the reviewed 637-byte PoolState");
  }
  const cpmm = {
    config: pubkeyAt(cpmmBytes, 8, "CPMM config"),
    authority: pubkeyAt(cpmmBytes, 40, "CPMM authority"),
    baseVault: pubkeyAt(cpmmBytes, 72, "CPMM base vault"),
    quoteVault: pubkeyAt(cpmmBytes, 104, "CPMM quote vault"),
    lpMint: pubkeyAt(cpmmBytes, 136, "CPMM LP mint"),
    baseMint: pubkeyAt(cpmmBytes, 168, "CPMM base mint"),
    quoteMint: pubkeyAt(cpmmBytes, 200, "CPMM quote mint"),
  };
  if (
    cpmm.config !== expected.cpmmConfigId ||
    cpmm.baseVault !== expected.cpmmBaseVault ||
    cpmm.quoteVault !== expected.cpmmQuoteVault ||
    cpmm.lpMint !== expected.lpMint ||
    cpmm.baseMint !== expected.mint ||
    cpmm.quoteMint !== NATIVE_SOL_MINT
  ) {
    throw new Error("CPMM pool relationships do not match the reviewed lifecycle");
  }
  const decodeVaultMint = (account: AccountEvidence, label: string): string => {
    const bytes = Buffer.from(account.data.base64, "base64");
    if (account.owner !== expected.tokenProgram || bytes.length !== 165) {
      throw new Error(`${label} is not a reviewed SPL token account`);
    }
    return pubkeyAt(bytes, 0, `${label} mint`);
  };
  for (const [account, label] of [
    [mintAccount, "launch mint"],
    [lpMintAccount, "CPMM LP mint"],
  ] as const) {
    const bytes = Buffer.from(account.data.base64, "base64");
    if (account.owner !== expected.tokenProgram || bytes.length !== 82) {
      throw new Error(`${label} is not a reviewed SPL mint account`);
    }
  }
  const launchBaseMint = decodeVaultMint(baseVault, "LaunchLab base vault");
  const launchQuoteMint = decodeVaultMint(quoteVault, "LaunchLab quote vault");
  const cpmmBaseMint = decodeVaultMint(cpmmBaseVault, "CPMM base vault");
  const cpmmQuoteMint = decodeVaultMint(cpmmQuoteVault, "CPMM quote vault");
  if (
    launchBaseMint !== expected.mint ||
    launchQuoteMint !== NATIVE_SOL_MINT ||
    cpmmBaseMint !== expected.mint ||
    cpmmQuoteMint !== NATIVE_SOL_MINT
  ) {
    throw new Error("vault mint relationships do not match LaunchState and CPMM pool");
  }
  return { launchState: launch, cpmmPool: cpmm, vaults: {
    launchBaseMint,
    launchQuoteMint,
    cpmmBaseMint,
    cpmmQuoteMint,
  }, platform: { cpmmConfigId: platformCpmmConfig } };
}

/**
 * Stable JSON is used for the evidence digest.  JSON.stringify's insertion
 * order is not a suitable integrity boundary when manifests are assembled by
 * different tools.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as JsonRecord).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as object)) deepFreeze(child);
  return value;
}

function accountData(value: unknown, label: string): Readonly<AccountEvidence> {
  if (value === null) {
    throw new Error(`${label} does not exist at finalized commitment`);
  }
  const root = object(value, `${label} RPC result`);
  const context = object(root.context, `${label} context`);
  const account = root.value;
  if (account === null) throw new Error(`${label} does not exist at finalized commitment`);
  const info = object(account, `${label} account`);
  const data = info.data;
  if (!Array.isArray(data) || data.length < 2 || typeof data[0] !== "string") {
    throw new Error(`${label} does not contain base64 account data`);
  }
  const base64 = data[0];
  if (data[1] !== "base64") throw new Error(`${label} account encoding is not base64`);
  if (
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    (base64.includes("=") && !base64.endsWith("="))
  ) {
    throw new Error(`${label} base64 data is malformed`);
  }
  const slot = safeInteger(context.slot, `${label} context slot`);
  const lamports = safeInteger(info.lamports, `${label} lamports`);
  const owner = nonEmpty(info.owner, `${label} owner`);
  const executable = info.executable;
  if (typeof executable !== "boolean") throw new Error(`${label} executable is invalid`);
  return {
    address: "",
    owner,
    executable,
    lamports,
    slot,
    data: {
      encoding: "base64",
      bytes: Buffer.from(base64, "base64").length,
      base64Sha256: sha256(base64),
      base64,
    },
  };
}

async function readAccount(rpc: Rpc, address: string, label: string): Promise<AccountEvidence> {
  const response = accountData(
    await rpc.call("getAccountInfo", [
      address,
      { encoding: "base64", commitment: FINALIZED_COMMITMENT },
    ]),
    label,
  );
  return { ...response, address };
}

function messageAccountKeys(transaction: JsonRecord): string[] {
  const root = object(transaction.transaction, "transaction payload");
  const message = object(root.message, "transaction message");
  const keys = Array.isArray(message.accountKeys) ? message.accountKeys : [];
  const result: string[] = [];
  for (const key of keys) {
    if (typeof key === "string") result.push(key);
    else if (key && typeof key === "object") {
      const record = key as JsonRecord;
      if (typeof record.pubkey === "string") result.push(record.pubkey);
    }
  }
  const meta = transaction.meta;
  if (meta && typeof meta === "object") {
    const loaded = (meta as JsonRecord).loadedAddresses;
    if (loaded && typeof loaded === "object") {
      for (const side of ["writable", "readonly"]) {
        const values = (loaded as JsonRecord)[side];
        if (Array.isArray(values)) {
          for (const value of values) if (typeof value === "string") result.push(value);
        }
      }
    }
  }
  return result;
}

function transactionAccounts(transaction: JsonRecord): string[] {
  return [...new Set(messageAccountKeys(transaction))];
}

type DecodedInstruction = {
  kind: "launch" | "buy" | "sell" | "migration" | "cpmm-initialization";
  programId: string;
  discriminatorHex: string;
  instructionIndex: number;
  accounts: string[];
  accountRoles: Readonly<Record<string, number>>;
  decodedAmounts: Record<string, string>;
};

/**
 * Reviewed account order for the evidence decoder.  These positions are
 * intentionally not inferred from a caller manifest: an account permutation
 * must make verification fail.  The migration instruction is followed by
 * the CPMM initialize instruction, whose pool accounts use their own order.
 */
const REVIEWED_ACCOUNT_POSITIONS: Record<
  DecodedInstruction["kind"],
  Readonly<Record<string, number>>
> = {
  // initializeV2 account order from the pinned LaunchLab SDK/IDL.
  launch: { platform: 3, launchState: 5, mint: 6, baseVault: 8, quoteVault: 9 },
  // buyExactIn/sellExactIn account order from the same pinned interface.
  buy: { platform: 3, launchState: 4, baseVault: 7, quoteVault: 8, mint: 9 },
  sell: { platform: 3, launchState: 4, baseVault: 7, quoteVault: 8, mint: 9 },
  migration: {
    mint: 0,
    launchState: 1,
    platform: 2,
    baseVault: 3,
    quoteVault: 4,
  },
  "cpmm-initialization": {
    // makeCreateCpmmPoolInInstruction (pinned SDK): creator, config,
    // authority, pool, mintA, mintB, lpMint, ..., vaultA, vaultB.
    cpmmCreator: 0,
    cpmmConfig: 1,
    cpmmAuthority: 2,
    cpmmPool: 3,
    cpmmBaseMint: 4,
    cpmmQuoteMint: 5,
    cpmmLpMint: 6,
    cpmmBaseVault: 10,
    cpmmQuoteVault: 11,
  },
};

function transactionInstructions(
  transaction: JsonRecord,
  pinned: CanonicalPinned,
): DecodedInstruction[] {
  const root = object(transaction.transaction, "transaction payload");
  const message = object(root.message, "transaction message");
  const keys = messageAccountKeys(transaction);
  const all: Array<{ value: JsonRecord; index: number }> = [];
  const top = Array.isArray(message.instructions) ? message.instructions : [];
  top.forEach((value, index) => {
    if (value && typeof value === "object") all.push({ value: value as JsonRecord, index });
  });
  const meta = object(transaction.meta, "transaction meta");
  if (Array.isArray(meta.innerInstructions)) {
    for (const group of meta.innerInstructions) {
      if (!group || typeof group !== "object") continue;
      const groupRecord = group as JsonRecord;
      const groupIndex = safeInteger(groupRecord.index, "inner instruction index");
      const instructions = Array.isArray(groupRecord.instructions)
        ? groupRecord.instructions
        : [];
      instructions.forEach((value, innerIndex) => {
        if (value && typeof value === "object") {
          all.push({
            value: value as JsonRecord,
            index: groupIndex * 1000 + innerIndex,
          });
        }
      });
    }
  }
  return all.flatMap(({ value, index }) => {
    const programId =
      typeof value.programId === "string"
        ? value.programId
        : typeof value.programIdIndex === "number"
          ? keys[value.programIdIndex]
          : undefined;
    if (!programId) return [];
    const rawData = typeof value.data === "string" ? value.data : "";
    const bytes = fromBase58(rawData);
    if (!bytes || bytes.length < 8) return [];
    const discriminatorHex = Buffer.from(bytes.subarray(0, 8)).toString("hex");
    const known = SEMANTIC_DISCRIMINATORS.get(discriminatorHex);
    const isLaunchLab = programId === pinned.launchLabProgram;
    const isCpmm = programId === pinned.cpmmProgram;
    if (!isLaunchLab && !isCpmm) return [];
    let kind: DecodedInstruction["kind"] | undefined =
      isLaunchLab ? known : undefined;
    if (isCpmm && CPMM_INITIALIZATION_DISCRIMINATORS.has(discriminatorHex)) {
      kind = "cpmm-initialization";
    }
    if (!kind) return [];
    const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
    const accounts = rawAccounts.flatMap((account) => {
      if (typeof account === "string") return [account];
      if (typeof account === "number" && keys[account]) return [keys[account]!];
      return [];
    });
    const decodedAmounts: Record<string, string> = {};
    if ((kind === "buy" || kind === "sell") && bytes.length >= 32) {
      const first = u64(bytes, 8);
      const second = u64(bytes, 16);
      const shareFeeRate = u64(bytes, 24);
      if (first === null || second === null || shareFeeRate === null) return [];
      decodedAmounts.amountA = first;
      decodedAmounts.amountB = second;
      decodedAmounts.shareFeeRate = shareFeeRate;
    }
    return [
      {
        kind,
        programId,
        discriminatorHex,
        instructionIndex: index,
        accounts,
        accountRoles: REVIEWED_ACCOUNT_POSITIONS[kind],
        decodedAmounts,
      },
    ];
  });
}

function transactionPrograms(transaction: JsonRecord): string[] {
  const meta = transaction.meta;
  const logs =
    meta && typeof meta === "object" && Array.isArray((meta as JsonRecord).logMessages)
      ? ((meta as JsonRecord).logMessages as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  return logs;
}

async function readTransaction(
  rpc: Rpc,
  item: EvidenceInput["lifecycle"]["signatures"][number],
  pinned: CanonicalPinned,
  related: {
    mint: string;
    launchState: string;
    platform: string;
    baseVault: string;
    quoteVault: string;
    cpmmPool: string;
    cpmmBaseVault: string;
    cpmmQuoteVault: string;
    cpmmLpMint: string;
    cpmmConfig: string;
    cpmmBaseMint: string;
    cpmmQuoteMint: string;
  },
  verifiedAt: string,
): Promise<TransactionEvidence> {
  const response = await rpc.call("getTransaction", [
    item.signature,
    { commitment: FINALIZED_COMMITMENT, maxSupportedTransactionVersion: 0 },
  ]);
  if (response === null) {
    throw new Error(`transaction ${item.signature} is not available at finalized commitment`);
  }
  const transaction = object(response, `transaction ${item.signature}`);
  const meta = object(transaction.meta, `transaction ${item.signature} meta`);
  if (meta.err !== null) throw new Error(`transaction ${item.signature} finalized with an error`);
  const slot = safeInteger(transaction.slot, `transaction ${item.signature} slot`);
  const accounts = transactionAccounts(transaction);
  const logs = transactionPrograms(transaction);
  const semantics = transactionInstructions(transaction, pinned);
  const mentionedPrograms = [
    ...(accounts.filter((account) =>
      [pinned.launchLabProgram, pinned.cpmmProgram].includes(account),
    )),
    ...(logs.filter((log) =>
      [pinned.launchLabProgram, pinned.cpmmProgram].some((program) =>
        log.includes(program),
      ),
    )),
  ];
  const relatedValues: Record<string, string> = {
    mint: related.mint,
    launchState: related.launchState,
    platform: related.platform,
    baseVault: related.baseVault,
    quoteVault: related.quoteVault,
    cpmmPool: related.cpmmPool,
    cpmmBaseVault: related.cpmmBaseVault,
    cpmmQuoteVault: related.cpmmQuoteVault,
    cpmmLpMint: related.cpmmLpMint,
    cpmmConfig: related.cpmmConfig,
    cpmmBaseMint: related.cpmmBaseMint,
    cpmmQuoteMint: related.cpmmQuoteMint,
  };
  const expectedKind =
    item.role === "launch" || item.role === "buy" || item.role === "sell" || item.role === "migration"
      ? item.role
      : undefined;
  if (expectedKind && !semantics.some((instruction) => instruction.kind === expectedKind)) {
    throw new Error(
      `${item.role} transaction does not contain a decoded ${item.role} instruction`,
    );
  }
  for (const instruction of semantics) {
    if (expectedKind === instruction.kind || item.role === "migration") {
      for (const [role, index] of Object.entries(instruction.accountRoles)) {
        const expectedAddress = relatedValues[role];
        if (
          (role === "cpmmCreator" || role === "cpmmAuthority") &&
          expectedAddress === undefined
        ) {
          continue;
        }
        if (
          expectedAddress === undefined ||
          instruction.accounts[index] !== expectedAddress
        ) {
          throw new Error(
            `${item.role} instruction account role ${role} at index ${index} does not match the reviewed lifecycle account`,
          );
        }
      }
    }
  }
  if (item.role === "migration") {
    if (!semantics.some((instruction) => instruction.kind === "cpmm-initialization")) {
      throw new Error("migration transaction does not contain a CPMM initialization instruction");
    }
    if (!mentionedPrograms.includes(pinned.cpmmProgram)) {
      throw new Error("migration transaction does not mention the pinned CPMM program");
    }
  }
  const blockTime =
    transaction.blockTime === null || transaction.blockTime === undefined
      ? null
      : new Date(safeInteger(transaction.blockTime, "transaction blockTime") * 1000).toISOString();
  return {
    role: item.role,
    signature: item.signature,
    finalized: true,
    slot,
    blockTime,
    verifiedAt,
    error: null,
    mentionedAccounts: accounts,
    mentionedPrograms: [...new Set(mentionedPrograms)],
    semantics: semantics.map((instruction) => ({
      kind: instruction.kind,
      programId: instruction.programId,
      discriminatorHex: instruction.discriminatorHex,
      instructionIndex: instruction.instructionIndex,
      accounts: instruction.accounts,
      accountRoles: instruction.accountRoles,
      decodedAmounts: instruction.decodedAmounts,
    })),
  };
}

function validateInput(input: unknown): EvidenceInput {
  const root = object(input, "evidence input");
  if (root.schema === EVIDENCE_SCHEMA || root.proofKind === "read-only-devnet-verification-and-deterministic-dry-run") {
    throw new Error("deterministic dry-run output cannot be used as graduation evidence");
  }
  if (root.cluster !== "devnet") throw new Error("graduation evidence is restricted to devnet");
  const authorizationReference = nonEmpty(
    root.authorizationReference,
    "authorizationReference",
  );
  rejectUrls(authorizationReference, "authorizationReference");
  const pinned = root.pinned === undefined ? {} : object(root.pinned, "pinned");
  const lifecycle = object(root.lifecycle, "lifecycle");
  const exact = (
    name: string,
    expected: string,
  ): string => {
    if (pinned[name] !== undefined && pinned[name] !== expected) {
      throw new Error(`pinned.${name} is not the canonical devnet value`);
    }
    return expected;
  };
  const config = object(pinned.config, "pinned.config");
  const configValues = object(config.values, "pinned.config.values");
  rejectUrls(configValues, "pinned.config.values");
  if (config.id !== DEVNET_CONFIG_ID) {
    throw new Error("pinned.config.id is not the canonical devnet LaunchLab config");
  }
  if (
    configValues.curveType !== 0 ||
    configValues.mintB !== "So11111111111111111111111111111111111111112" ||
    configValues.migrateFee !== "0"
  ) {
    throw new Error("pinned config is not the canonical constant-product native-SOL config");
  }
  const signaturesValue = lifecycle.signatures;
  if (!Array.isArray(signaturesValue) || signaturesValue.length === 0) {
    throw new Error("lifecycle.signatures must not be empty");
  }
  const signatures = signaturesValue.map((value, index) => {
    const item = object(value, `lifecycle.signatures[${index}]`);
    const role = item.role;
    if (!["launch", "buy", "sell", "migration", "other"].includes(String(role))) {
      throw new Error(`invalid signature role at index ${index}`);
    }
    return { role: role as EvidenceInput["lifecycle"]["signatures"][number]["role"], signature: nonEmpty(item.signature, `signature ${index}`) };
  });
  if (!signatures.some((item) => item.role === "launch")) {
    throw new Error("a finalized launch signature is required");
  }
  if (!signatures.some((item) => item.role === "migration")) {
    throw new Error("a finalized migration signature is required");
  }
  if (!signatures.some((item) => item.role === "buy")) {
    throw new Error("a finalized buy signature is required");
  }
  const launchSignature = signatures.find((item) => item.role === "launch");
  const migrationSignature = signatures.find((item) => item.role === "migration");
  if (launchSignature?.signature === migrationSignature?.signature) {
    throw new Error("launch and migration must be distinct finalized transactions");
  }
  const vaults = object(lifecycle.vaults, "lifecycle.vaults");
  const cpmm = object(lifecycle.cpmm, "lifecycle.cpmm");
  return {
    cluster: "devnet",
    authorizationReference,
    pinned: {
      launchLabProgram: exact("launchLabProgram", DEVNET_LAUNCHLAB_PROGRAM),
      cpmmProgram: exact("cpmmProgram", DEVNET_CPMM_PROGRAM),
      tokenProgram: exact("tokenProgram", SPL_TOKEN_PROGRAM),
      associatedTokenProgram: exact(
        "associatedTokenProgram",
        ASSOCIATED_TOKEN_PROGRAM,
      ),
      systemProgram: exact("systemProgram", SYSTEM_PROGRAM),
      config: {
        id: nonEmpty(config.id, "pinned.config.id"),
        values: configValues,
      },
    },
    lifecycle: {
      signatures,
      mint: nonEmpty(lifecycle.mint, "lifecycle.mint"),
      launchState: nonEmpty(lifecycle.launchState, "lifecycle.launchState"),
      platform: nonEmpty(lifecycle.platform, "lifecycle.platform"),
      vaults: {
        base: nonEmpty(vaults.base, "lifecycle.vaults.base"),
        quote: nonEmpty(vaults.quote, "lifecycle.vaults.quote"),
      },
      cpmm: {
        pool: nonEmpty(cpmm.pool, "lifecycle.cpmm.pool"),
        baseVault: nonEmpty(cpmm.baseVault, "lifecycle.cpmm.baseVault"),
        quoteVault: nonEmpty(cpmm.quoteVault, "lifecycle.cpmm.quoteVault"),
        lpMint: nonEmpty(cpmm.lpMint, "lifecycle.cpmm.lpMint"),
        config: (() => {
          const value = nonEmpty(cpmm.config, "lifecycle.cpmm.config");
          if (value !== DEVNET_CPMM_CONFIG_ID) {
            throw new Error("lifecycle.cpmm.config is not the canonical devnet CPMM config");
          }
          return value;
        })(),
      },
    },
  };
}

export async function captureGraduationEvidence(
  untrustedInput: unknown,
  rpc: Rpc,
  now = new Date(),
): Promise<GraduationEvidence> {
  const input = validateInput(untrustedInput);
  const pinned = input.pinned as CanonicalPinned;
  const startedAt = now.toISOString();
  const genesisHash = await rpc.call("getGenesisHash", []);
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(
      `RPC genesis hash is not canonical Solana devnet: ${String(genesisHash)}`,
    );
  }
  const related = {
    mint: input.lifecycle.mint,
    launchState: input.lifecycle.launchState,
    platform: input.lifecycle.platform,
    baseVault: input.lifecycle.vaults.base,
    quoteVault: input.lifecycle.vaults.quote,
    cpmmPool: input.lifecycle.cpmm.pool,
    cpmmBaseVault: input.lifecycle.cpmm.baseVault,
    cpmmQuoteVault: input.lifecycle.cpmm.quoteVault,
    cpmmLpMint: input.lifecycle.cpmm.lpMint,
    cpmmConfig: input.lifecycle.cpmm.config,
    cpmmBaseMint: input.lifecycle.mint,
    cpmmQuoteMint: NATIVE_SOL_MINT,
  };
  const transactionEvidence = await Promise.all(
    input.lifecycle.signatures.map((signature) =>
      readTransaction(
        rpc,
        signature,
        pinned,
        related,
        startedAt,
      ),
    ),
  );
  const launch = transactionEvidence.find((item) => item.role === "launch");
  const buy = transactionEvidence.find((item) => item.role === "buy");
  const migration = transactionEvidence.find((item) => item.role === "migration");
  if (!launch || !buy || !migration) {
    throw new Error("launch, buy, and migration evidence are all required");
  }
  if (!(launch.slot < buy.slot && buy.slot < migration.slot)) {
    throw new Error("finalized launch, buy, and migration slots are not strictly ordered");
  }
  const addressMap = {
    mint: input.lifecycle.mint,
    launchState: input.lifecycle.launchState,
    platform: input.lifecycle.platform,
    baseVault: input.lifecycle.vaults.base,
    quoteVault: input.lifecycle.vaults.quote,
    cpmmPool: input.lifecycle.cpmm.pool,
    cpmmBaseVault: input.lifecycle.cpmm.baseVault,
    cpmmQuoteVault: input.lifecycle.cpmm.quoteVault,
    cpmmLpMint: input.lifecycle.cpmm.lpMint,
    launchLabProgram: pinned.launchLabProgram,
    cpmmProgram: pinned.cpmmProgram,
  };
  const [mint, launchState, platform, baseVault, quoteVault, cpmmPool, cpmmBaseVault, cpmmQuoteVault, cpmmLpMint, launchLabProgram, cpmmProgram] =
    await Promise.all(
      Object.entries(addressMap).map(([name, address]) =>
        readAccount(rpc, address, name),
      ),
    );
  for (const [name, account] of Object.entries({
    mint,
    launchState,
    platform,
    baseVault,
    quoteVault,
    cpmmPool,
    cpmmBaseVault,
    cpmmQuoteVault,
    cpmmLpMint,
    launchLabProgram,
    cpmmProgram,
  })) {
    if (account.slot < migration.slot) {
      throw new Error(
        `${name} snapshot slot ${account.slot} predates migration slot ${migration.slot}`,
      );
    }
  }
  if (!launchLabProgram.executable || !cpmmProgram.executable) {
    throw new Error("pinned LaunchLab and CPMM accounts must both be executable");
  }
  if (launchState.owner !== pinned.launchLabProgram) {
    throw new Error("LaunchState owner does not equal the pinned LaunchLab program");
  }
  if (platform.owner !== pinned.launchLabProgram) {
    throw new Error("Platform owner does not equal the pinned LaunchLab program");
  }
  for (const [name, account] of Object.entries({ mint, baseVault, quoteVault, cpmmBaseVault, cpmmQuoteVault, cpmmLpMint })) {
    if (account.owner !== pinned.tokenProgram) {
      throw new Error(`${name} owner does not equal the pinned token program`);
    }
  }
  if (cpmmPool.owner !== pinned.cpmmProgram) {
    throw new Error("CPMM pool owner does not equal the pinned CPMM program");
  }
  const stateRelationships = decodeStateRelationships(
    launchState,
    cpmmPool,
    mint,
    cpmmLpMint,
    baseVault,
    quoteVault,
    cpmmBaseVault,
    cpmmQuoteVault,
    platform,
    {
      launchLabProgram: pinned.launchLabProgram,
      cpmmProgram: pinned.cpmmProgram,
      tokenProgram: pinned.tokenProgram,
      mint: input.lifecycle.mint,
      platform: input.lifecycle.platform,
      launchBaseVault: input.lifecycle.vaults.base,
      launchQuoteVault: input.lifecycle.vaults.quote,
      cpmmPool: input.lifecycle.cpmm.pool,
      cpmmBaseVault: input.lifecycle.cpmm.baseVault,
      cpmmQuoteVault: input.lifecycle.cpmm.quoteVault,
      lpMint: input.lifecycle.cpmm.lpMint,
      configId: pinned.config.id,
      cpmmConfigId: input.lifecycle.cpmm.config,
    },
  );
  const cpmmInitialization = migration.semantics.find(
    (instruction) => instruction.kind === "cpmm-initialization",
  );
  if (
    !cpmmInitialization ||
    cpmmInitialization.accounts[REVIEWED_ACCOUNT_POSITIONS["cpmm-initialization"].cpmmAuthority] !==
      stateRelationships.cpmmPool.authority
  ) {
    throw new Error("CPMM initialization authority does not match CPMM PoolState");
  }
  const completedAt = new Date().toISOString();
  const unsigned = {
    schema: EVIDENCE_SCHEMA as typeof EVIDENCE_SCHEMA,
    evidenceKind: "finalized-devnet-launchlab-cpmm-graduation" as const,
    status: "verified" as const,
    capturedAt: completedAt,
    verification: {
      startedAt,
      completedAt,
      commitment: "finalized" as const,
      collector: "read-only-rpc" as const,
      collectorSubmittedTransactions: false as const,
      walletLoaded: false as const,
      activationEligible: false as const,
    },
    network: {
      cluster: input.cluster,
      genesisHash: DEVNET_GENESIS_HASH as typeof DEVNET_GENESIS_HASH,
      authorizationReference: input.authorizationReference,
    },
    pinned: {
      programs: { launchLab: launchLabProgram, cpmm: cpmmProgram },
      tokenProgram: pinned.tokenProgram,
      associatedTokenProgram:
        pinned.associatedTokenProgram as typeof ASSOCIATED_TOKEN_PROGRAM,
      systemProgram: pinned.systemProgram as typeof SYSTEM_PROGRAM,
      config: {
        ...pinned.config,
        canonicalSha256: sha256(canonicalJson(pinned.config.values)),
      },
    },
    lifecycle: {
      transactions: transactionEvidence,
      mint,
      launchState,
      platform,
      vaults: { base: baseVault, quote: quoteVault },
      migration: { signature: migration.signature, slot: migration.slot },
      attestation: {
        status: "unauthenticated" as const,
        activationEligible: false as const,
        reason:
          "No detached signer attestation was supplied or verified; chain evidence alone cannot authorize activation.",
      },
      cpmm: {
        pool: cpmmPool,
        baseVault: cpmmBaseVault,
        quoteVault: cpmmQuoteVault,
        lpMint: cpmmLpMint,
        config: input.lifecycle.cpmm.config,
      },
      stateRelationships,
    },
  };
  const evidenceSha256 = sha256(canonicalJson(unsigned));
  return deepFreeze({ ...unsigned, evidenceSha256 });
}

export function verifyEvidenceHash(evidence: unknown): boolean {
  const root = object(evidence, "evidence");
  const supplied = root.evidenceSha256;
  if (typeof supplied !== "string" || supplied.length !== 64) return false;
  const { evidenceSha256: _ignored, ...unsigned } = root;
  return sha256(canonicalJson(unsigned)) === supplied;
}

class HttpRpc implements Rpc {
  public constructor(private readonly endpoint: string) {}

  public async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
    const payload = object(await response.json(), "RPC response");
    if (payload.error) throw new Error(`RPC ${method} error: ${JSON.stringify(payload.error)}`);
    return payload.result;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");
  if (inputIndex < 0 || outputIndex < 0 || !args[inputIndex + 1] || !args[outputIndex + 1]) {
    throw new Error(
      "usage: tsx src/solana-launchlab-evidence.ts --input lifecycle.json --output evidence.json [--rpc-url URL]",
    );
  }
  const inputPath = resolve(process.cwd(), args[inputIndex + 1]);
  const outputPath = resolve(process.cwd(), args[outputIndex + 1]);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  // Constructing HttpRpc is the only network side effect.  No wallet or
  // transaction builder is imported, and no submit method exists in this tool.
  const rpcIndex = args.indexOf("--rpc-url");
  const rpcUrl =
    rpcIndex >= 0 && args[rpcIndex + 1]
      ? args[rpcIndex + 1]!
      : process.env.SOLANA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
  const evidence = await captureGraduationEvidence(input, new HttpRpc(rpcUrl));
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`Finalized graduation evidence written to ${outputPath}\n`);
}

if (process.argv[1]?.endsWith("solana-launchlab-evidence.ts")) {
  await main();
}