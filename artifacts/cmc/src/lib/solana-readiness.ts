/**
 * Read-only Solana/Raydium release-gate primitives.
 *
 * This module intentionally has no Solana SDK dependency.  It validates
 * public keys locally and leaves all signing and transaction construction out
 * of the readiness path.
 */

export type SolanaCluster = "devnet" | "mainnet-beta";

export const SOLANA_GENESIS_HASHES: Record<SolanaCluster, string> = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
};

export const RAYDIUM_PROGRAM_IDS: Record<SolanaCluster, {
  launchLab: string;
  cpmm: string;
}> = {
  // These are the official IDs used by the bounded read-only devnet proof.
  devnet: {
    launchLab: "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6",
    cpmm: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  },
  "mainnet-beta": {
    launchLab: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    cpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  },
};

/** The owner used by Solana's upgradeable executable program accounts. */
export const SOLANA_UPGRADEABLE_LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";

export const SOLANA_QUOTE_ASSET = {
  symbol: "SOL",
  native: "SOL",
  wrapped: "WSOL",
  description: "Native SOL, represented as WSOL where an SPL token account is required.",
} as const;

/** Exact alpha release reviewed for the devnet transaction boundary. */
export const REVIEWED_RAYDIUM_SDK_VERSION = "0.2.69-alpha";

type Environment = Record<string, string | undefined>;

export type SolanaConfig = {
  cluster: SolanaCluster;
  rpcUrl?: string;
  rpcExplicitlyConfigured: boolean;
  mainnetConfigurationDedicated: boolean;
  launchLabProgramId?: string;
  cpmmProgramId?: string;
  launchLabProgramDataAddress?: string;
  launchLabProgramDataHash?: string;
  launchLabProgramDataSlot?: number;
  launchLabUpgradeAuthority?: string;
  cpmmProgramDataAddress?: string;
  cpmmProgramDataHash?: string;
  cpmmProgramDataSlot?: number;
  cpmmUpgradeAuthority?: string;
  releaseEnabled: boolean;
  reviewedProgramIds: boolean;
  platformPda?: string;
  platformFeeDestination?: string;
  platformFeeDestinationReviewed: boolean;
  platformFeeDestinationOwner?: string;
  treasuryAuthority?: string;
  treasuryAuthorityOwner?: string;
  treasuryAuthorityPolicy?: string;
  treasuryAuthorityPolicyReviewed: boolean;
  lpAuthority?: string;
  lpAuthorityOwner?: string;
  lpAuthorityPolicy?: string;
  lpAuthorityPolicyReviewed: boolean;
  platformPdaSeeds?: string;
  platformPdaBump?: number;
  platformAccountDiscriminatorHex?: string;
  platformAccountDataLength?: number;
  platformTreasuryAuthorityOffset?: number;
  platformLpAuthorityOffset?: number;
  platformFeeDestinationOffset?: number;
  deploymentStartSlot?: number;
  platformPdaReviewed: boolean;
  independentSecurityReviewComplete: boolean;
  legalReviewComplete: boolean;
  releaseAuthorizationRecorded: boolean;
  sdkBuilderReviewed: boolean;
  sdkVersion?: string;
  artifactId?: string;
  buildId?: string;
  releaseRecord?: SolanaReleaseRecord;
  releaseRecordError?: string;
  releaseApproverKeys?: string[];
  releaseApprovalThreshold?: number;
  releaseApproverRoles?: Record<string, string>;
  releaseRequiredApproverRoles?: string[];
  chainStateBaseline?: SolanaChainStateBaseline;
};

export type PublicSolanaConfig = Omit<SolanaConfig, "rpcUrl"> & {
  quoteAsset: typeof SOLANA_QUOTE_ASSET;
};

/**
 * A release record is the signed, immutable description of the exact build and
 * on-chain controls that were approved for mainnet.  `signatures` is excluded
 * from the signed payload; every other field is canonicalized and signed.
 */
export type SolanaReleaseRecordPayload = {
  schemaVersion: 1;
  cluster: SolanaCluster;
  genesisHash: string;
  launchLabProgramId: string;
  cpmmProgramId: string;
  launchLabProgramDataAddress: string;
  launchLabProgramDataHash: string;
  launchLabProgramDataSlot: number;
  launchLabUpgradeAuthority: string;
  cpmmProgramDataAddress: string;
  cpmmProgramDataHash: string;
  cpmmProgramDataSlot: number;
  cpmmUpgradeAuthority: string;
  platformPda: string;
  platformFeeDestination: string;
  platformFeeDestinationOwner: string;
  treasuryAuthority: string;
  treasuryAuthorityOwner: string;
  treasuryAuthorityPolicy: string;
  lpAuthority: string;
  lpAuthorityOwner: string;
  lpAuthorityPolicy: string;
  platformPdaSeeds: string;
  platformPdaBump: number;
  platformAccountDiscriminatorHex: string;
  platformAccountDataLength: number;
  platformTreasuryAuthorityOffset: number;
  platformLpAuthorityOffset: number;
  platformFeeDestinationOffset: number;
  deploymentStartSlot: number;
  sdkVersion: string;
  artifactId: string;
  buildId: string;
  reviewedProgramIds: boolean;
  platformFeeDestinationReviewed: boolean;
  treasuryAuthorityPolicyReviewed: boolean;
  lpAuthorityPolicyReviewed: boolean;
  platformPdaReviewed: boolean;
  independentSecurityReviewComplete: boolean;
  legalReviewComplete: boolean;
  releaseAuthorizationRecorded: boolean;
  sdkBuilderReviewed: boolean;
  chainStateBaseline: SolanaChainStateBaseline;
  approvers: string[];
  issuedAt: string;
  expiresAt: string;
};

export type SolanaProgramBaseline = {
  programDataAddress: string;
  codeFingerprint: string;
  deployedSlot: number;
  upgradeAuthority: string | null;
};

export type SolanaChainStateBaseline = {
  chainStateFingerprint: string;
  launchLab: SolanaProgramBaseline;
  cpmm: SolanaProgramBaseline;
};

export type ReleaseApproverPolicy = {
  trustedKeys: string[];
  threshold?: number;
  roles?: Record<string, string>;
  requiredRoles?: string[];
};

export type SolanaReleaseRecord = SolanaReleaseRecordPayload & {
  signatures: Array<{ approver: string; signature: string }>;
};

export type ReleaseRecordVerification = {
  present: boolean;
  signaturesValid: boolean;
  configMatch: boolean;
  valid: boolean;
  artifactId?: string;
  buildId?: string;
  blockers: string[];
};

export type ProgramVerification = {
  id: string;
  validIdentifier: boolean;
  accountFound: boolean;
  executable: boolean;
  ownerVerified: boolean;
  owner?: string;
  slot?: number;
  programDataAddress?: string;
  programDataAddressVerified: boolean;
  programDataAccountFound: boolean;
  programDataExecutableVerified: boolean;
  programDataOwner?: string;
  programDataOwnerVerified: boolean;
  programDataSlot?: number;
  programDataReadSlot?: number;
  programDataSlotVerified: boolean;
  codeHash?: string;
  codeHashVerified: boolean;
  upgradeAuthority?: string;
  upgradeAuthorityVerified: boolean;
  error?: string;
};

export type AccountVerification = {
  id: string;
  validIdentifier: boolean;
  accountFound: boolean;
  owner?: string;
  slot?: number;
  error?: string;
};

export type PlatformVerification = AccountVerification & {
  derivedAddress?: string;
  derivationVerified: boolean;
  ownerVerified: boolean;
  treasuryAuthority?: string;
  treasuryAuthorityVerified: boolean;
  lpAuthority?: string;
  lpAuthorityVerified: boolean;
  feeDestination?: string;
  feeDestinationVerified: boolean;
  discriminatorVerified: boolean;
  dataLengthVerified: boolean;
};

export type SolanaReadiness = {
  cluster: SolanaCluster;
  connected: boolean;
  genesisVerified: boolean;
  genesisHash?: string;
  programs: {
    launchLab: ProgramVerification;
    cpmm: ProgramVerification;
  };
  platform: PlatformVerification;
  authorities: {
    treasury: AccountVerification;
    lp: AccountVerification;
    feeDestination: AccountVerification;
  };
  releaseRecord: ReleaseRecordVerification;
  networkReady: boolean;
  activationEligible: boolean;
  activation: "not-eligible" | "eligible";
  blockers: string[];
  /**
   * A stable representation of the finalized account state that was compared
   * with the reviewed configuration. Slots are intentionally excluded: they
   * advance between checks even when the governed state has not changed.
   */
  chainStateFingerprint?: string;
  quoteAsset: typeof SOLANA_QUOTE_ASSET;
  checkedAt: string;
};

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Validate a Solana public-key identifier without pulling in @solana/web3.js.
 * A base58 public key must decode to exactly 32 bytes.
 */
export function isValidSolanaPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  if (![...value].every((character) => BASE58_ALPHABET.includes(character))) return false;
  const scratch: number[] = [];
  let bytes = 0;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    let carry = digit;
    for (let index = 0; index < bytes; index += 1) {
      carry += 58 * scratch[index];
      scratch[index] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    while (carry > 0) {
      scratch[bytes] = carry % 256;
      bytes += 1;
      carry = Math.floor(carry / 256);
    }
  }
  // Leading base58 zeroes represent leading zero bytes.
  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0;
  return bytes + leadingZeroes === 32;
}

export function validateSolanaPublicKey(value: unknown, field = "public key"): string {
  if (!isValidSolanaPublicKey(value)) throw new Error(`${field} is not a valid Solana public key.`);
  return value as string;
}

function releasePayload(record: SolanaReleaseRecord): SolanaReleaseRecordPayload {
  const {
    signatures: _signatures,
    ...payload
  } = record;
  return payload;
}

function canonicalizeValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalizeValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  if (value === undefined) throw new Error("Release record contains an undefined value.");
  return JSON.stringify(value);
}

/** Deterministic JSON representation used as the Ed25519 signing message. */
export function canonicalizeReleaseRecord(record: SolanaReleaseRecord): string {
  return canonicalizeValue(releasePayload(record));
}

function requiredRecordString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Release record ${field} is required.`);
  return value;
}

function requiredRecordNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Release record ${field} must be a non-negative safe integer.`);
  }
  return value;
}

function requiredRecordBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Release record ${field} must be boolean.`);
  return value;
}

export function parseSolanaChainStateBaseline(value: unknown): SolanaChainStateBaseline {
  const input = record(value);
  const fingerprint = input?.chainStateFingerprint;
  if (!input || typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error("Chain-state baseline fingerprint must be a SHA-256 hex value.");
  }
  const parseProgram = (value: unknown, label: string): SolanaProgramBaseline => {
    const program = record(value);
    if (!program || !isValidSolanaPublicKey(program.programDataAddress)
      || typeof program.codeFingerprint !== "string"
      || !/^[0-9a-f]{64}$/.test(program.codeFingerprint)
      || typeof program.deployedSlot !== "number"
      || !Number.isSafeInteger(program.deployedSlot)
      || program.deployedSlot < 0
      || (program.upgradeAuthority !== null && !isValidSolanaPublicKey(program.upgradeAuthority))) {
      throw new Error(`Chain-state baseline ${label} program fingerprint is malformed.`);
    }
    return {
      programDataAddress: program.programDataAddress,
      codeFingerprint: program.codeFingerprint,
      deployedSlot: program.deployedSlot,
      upgradeAuthority: program.upgradeAuthority as string | null,
    };
  };
  return {
    chainStateFingerprint: fingerprint,
    launchLab: parseProgram(input.launchLab, "LaunchLab"),
    cpmm: parseProgram(input.cpmm, "CPMM"),
  };
}

/** Parse and structurally validate the JSON release manifest from the server environment. */
export function parseSolanaReleaseRecord(value: unknown): SolanaReleaseRecord {
  const input = record(value);
  if (!input || input.schemaVersion !== 1) throw new Error("Release record schemaVersion must be 1.");
  if (input.cluster !== "mainnet-beta") throw new Error("Release record cluster must be mainnet-beta.");
  const strings = [
    "genesisHash", "launchLabProgramId", "cpmmProgramId", "platformPda",
    "launchLabProgramDataAddress", "launchLabProgramDataHash", "launchLabUpgradeAuthority",
    "cpmmProgramDataAddress", "cpmmProgramDataHash", "cpmmUpgradeAuthority",
    "platformFeeDestination", "platformFeeDestinationOwner", "treasuryAuthority",
    "treasuryAuthorityOwner", "treasuryAuthorityPolicy", "lpAuthority",
    "lpAuthorityOwner", "lpAuthorityPolicy", "platformPdaSeeds",
    "platformAccountDiscriminatorHex", "sdkVersion", "artifactId", "buildId",
    "issuedAt", "expiresAt",
  ] as const;
  for (const field of strings) requiredRecordString(input[field], field);
  const numbers = [
    "launchLabProgramDataSlot", "cpmmProgramDataSlot",
    "platformPdaBump", "platformAccountDataLength", "platformTreasuryAuthorityOffset",
    "platformLpAuthorityOffset", "platformFeeDestinationOffset", "deploymentStartSlot",
  ] as const;
  for (const field of numbers) requiredRecordNumber(input[field], field);
  const booleans = [
    "reviewedProgramIds", "platformFeeDestinationReviewed",
    "treasuryAuthorityPolicyReviewed", "lpAuthorityPolicyReviewed",
    "platformPdaReviewed", "independentSecurityReviewComplete",
    "legalReviewComplete", "releaseAuthorizationRecorded", "sdkBuilderReviewed",
  ] as const;
  for (const field of booleans) requiredRecordBoolean(input[field], field);
  parseSolanaChainStateBaseline(input.chainStateBaseline);
  if (!Array.isArray(input.approvers) || input.approvers.length === 0
    || input.approvers.some((approver) => typeof approver !== "string" || !approver)) {
    throw new Error("Release record approvers are required.");
  }
  const signatures = input.signatures;
  if (!Array.isArray(signatures)) throw new Error("Release record signatures are required.");
  if (signatures.some((item) => {
    const signature = record(item);
    return !signature || typeof signature.approver !== "string" || typeof signature.signature !== "string";
  })) throw new Error("Release record signatures are malformed.");
  return input as unknown as SolanaReleaseRecord;
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Invalid base64.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error("Invalid base64.");
  return Uint8Array.from(decoded);
}

/**
 * Verify all approver signatures and the record's validity window.  The
 * trusted approver list is supplied independently of the signed JSON so an
 * attacker cannot authorize a record by adding their own key to it.
 */
export async function verifySignedReleaseRecord(
  recordValue: SolanaReleaseRecord | undefined,
  trustedApproverKeys: string[] | ReleaseApproverPolicy,
  now = new Date(),
): Promise<ReleaseRecordVerification> {
  const result: ReleaseRecordVerification = {
    present: Boolean(recordValue),
    signaturesValid: false,
    configMatch: false,
    valid: false,
    blockers: [],
  };
  if (!recordValue) {
    result.blockers.push("A signed mainnet release record is not configured.");
    return result;
  }
  try {
    const release = parseSolanaReleaseRecord(recordValue);
    const policy: ReleaseApproverPolicy = Array.isArray(trustedApproverKeys)
      ? { trustedKeys: trustedApproverKeys }
      : trustedApproverKeys;
    const trustedApproverList = policy.trustedKeys;
    result.artifactId = release.artifactId;
    result.buildId = release.buildId;
    const issuedAt = Date.parse(release.issuedAt);
    const expiresAt = Date.parse(release.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now.getTime()) {
      throw new Error("Release record timestamp is invalid or is in the future.");
    }
    if (expiresAt <= now.getTime() || expiresAt <= issuedAt) {
      throw new Error("Release record is expired or has an invalid expiry.");
    }
    const approvers = new Set(release.approvers);
    if (approvers.size !== release.approvers.length) throw new Error("Release record approvers must be unique.");
    const trusted = new Set(trustedApproverList);
    if (trusted.size !== trustedApproverList.length || trustedApproverList.some((key) => !isValidSolanaPublicKey(key))) {
      throw new Error("Trusted release approver keys are malformed.");
    }
    if (release.approvers.some((key) => !isValidSolanaPublicKey(key) || !trusted.has(key))) {
      throw new Error("Release record contains an untrusted approver.");
    }
    const requiredRoles = policy.requiredRoles ?? [];
    const roles = policy.roles ?? {};
    if (requiredRoles.some((role) => typeof role !== "string" || !role)
      || new Set(requiredRoles).size !== requiredRoles.length
      || Object.keys(roles).some((key) => !trusted.has(key)
        || typeof roles[key] !== "string" || !roles[key])) {
      throw new Error("Release approver role policy is malformed.");
    }
    if ((requiredRoles.length > 0 || Object.keys(roles).length > 0)
      && trustedApproverList.some((key) => !roles[key])) {
      throw new Error("Every trusted release approver must have a configured role.");
    }
    const threshold = policy.threshold ?? (
      requiredRoles.length > 0 ? requiredRoles.length : trustedApproverList.length
    );
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > trustedApproverList.length) {
      throw new Error("Release approver threshold is outside the trusted signer set.");
    }
    const exactSignerSet = policy.threshold === undefined && requiredRoles.length === 0 && Object.keys(roles).length === 0;
    if (exactSignerSet && (release.approvers.length !== trusted.size
      || [...trusted].some((key) => !release.approvers.includes(key)))) {
      throw new Error("Release record signer set must exactly match trusted release approvers.");
    }
    if (release.approvers.length < threshold) {
      throw new Error(`Release record requires at least ${threshold} trusted approver signatures.`);
    }
    if (requiredRoles.length > 0 && requiredRoles.some((role) =>
      !release.approvers.some((key) => roles[key] === role))) {
      throw new Error("Release record does not satisfy the required approver roles.");
    }
    if (release.signatures.length !== release.approvers.length) {
      throw new Error("Release record must contain exactly one signature per approver.");
    }
    const payload = new TextEncoder().encode(canonicalizeReleaseRecord(release));
    const signedApprovers = new Set<string>();
    for (const signature of release.signatures) {
      if (signedApprovers.has(signature.approver) || !approvers.has(signature.approver)) {
        throw new Error("Release record signature approvers do not match the approver list.");
      }
      const publicKey = await crypto.subtle.importKey(
        "raw",
        decodeBase58(signature.approver) as unknown as BufferSource,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const verified = await crypto.subtle.verify(
        { name: "Ed25519" },
        publicKey,
        decodeBase64(signature.signature) as unknown as BufferSource,
        payload as unknown as BufferSource,
      );
      if (!verified) throw new Error("Release record contains an invalid signature.");
      signedApprovers.add(signature.approver);
    }
    result.signaturesValid = signedApprovers.size === approvers.size;
  } catch (error) {
    result.blockers.push(error instanceof Error ? error.message : "Release record signature verification failed.");
  }
  if (!result.signaturesValid && result.blockers.length === 0) {
    result.blockers.push("Release record signatures could not be verified.");
  }
  result.valid = result.signaturesValid;
  return result;
}

function envBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function envString(environment: Environment, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function envInteger(environment: Environment, ...keys: string[]): number | undefined {
  const value = envString(environment, ...keys);
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function envOffset(environment: Environment, ...keys: string[]): number | undefined {
  const value = envInteger(environment, ...keys);
  return value !== undefined && value >= 0 ? value : undefined;
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseSolanaCluster(value: unknown): SolanaCluster {
  if (value === "devnet" || value === "mainnet-beta") return value;
  throw new Error("Solana cluster must be devnet or mainnet-beta.");
}

export function getSolanaConfig(
  environment: Environment = process.env,
  clusterInput?: unknown,
): SolanaConfig {
  const cluster = parseSolanaCluster(
    clusterInput ?? environment.SOLANA_CLUSTER ?? "devnet",
  );
  const prefix = cluster === "devnet" ? "SOLANA_DEVNET" : "SOLANA_MAINNET";
  const defaults = RAYDIUM_PROGRAM_IDS[cluster];
  const configuredRpcUrl = envString(
    environment,
    `${prefix}_RPC_URL`,
    "SOLANA_RPC_URL",
  );
  const dedicatedMainnetKeys = [
    "SOLANA_MAINNET_RPC_URL",
    "SOLANA_MAINNET_LAUNCHLAB_PROGRAM_ID",
    "SOLANA_MAINNET_CPMM_PROGRAM_ID",
    "SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_ADDRESS",
    "SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_HASH",
    "SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_SLOT",
    "SOLANA_MAINNET_LAUNCHLAB_UPGRADE_AUTHORITY",
    "SOLANA_MAINNET_CPMM_PROGRAM_DATA_ADDRESS",
    "SOLANA_MAINNET_CPMM_PROGRAM_DATA_HASH",
    "SOLANA_MAINNET_CPMM_PROGRAM_DATA_SLOT",
    "SOLANA_MAINNET_CPMM_UPGRADE_AUTHORITY",
    "SOLANA_MAINNET_RELEASE_ENABLED",
    "SOLANA_MAINNET_REVIEWED_PROGRAM_IDS",
    "SOLANA_MAINNET_PLATFORM_PDA",
    "SOLANA_MAINNET_PLATFORM_FEE_DESTINATION",
    "SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OWNER",
    "SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED",
    "SOLANA_MAINNET_TREASURY_AUTHORITY",
    "SOLANA_MAINNET_TREASURY_AUTHORITY_OWNER",
    "SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY",
    "SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY_REVIEWED",
    "SOLANA_MAINNET_LP_AUTHORITY",
    "SOLANA_MAINNET_LP_AUTHORITY_OWNER",
    "SOLANA_MAINNET_LP_AUTHORITY_POLICY",
    "SOLANA_MAINNET_LP_AUTHORITY_POLICY_REVIEWED",
    "SOLANA_MAINNET_PLATFORM_PDA_SEEDS_JSON",
    "SOLANA_MAINNET_PLATFORM_PDA_BUMP",
    "SOLANA_MAINNET_PLATFORM_ACCOUNT_DISCRIMINATOR_HEX",
    "SOLANA_MAINNET_PLATFORM_ACCOUNT_DATA_LENGTH",
    "SOLANA_MAINNET_PLATFORM_TREASURY_AUTHORITY_OFFSET",
    "SOLANA_MAINNET_PLATFORM_LP_AUTHORITY_OFFSET",
    "SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OFFSET",
    "SOLANA_MAINNET_DEPLOYMENT_START_SLOT",
    "SOLANA_MAINNET_PLATFORM_PDA_REVIEWED",
    "SOLANA_MAINNET_PLATFORM_PDA_VERIFIED",
    "SOLANA_MAINNET_INDEPENDENT_SECURITY_REVIEW_COMPLETE",
    "SOLANA_MAINNET_LEGAL_REVIEW_COMPLETE",
    "SOLANA_MAINNET_RELEASE_AUTHORIZATION_RECORDED",
    "SOLANA_MAINNET_RELEASE_APPROVER_KEYS_JSON",
    "SOLANA_MAINNET_ARTIFACT_ID",
    "SOLANA_MAINNET_BUILD_ID",
    "SOLANA_MAINNET_CHAIN_STATE_BASELINE_JSON",
  ];
  const rpcUrl = configuredRpcUrl ?? (
    cluster === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com"
  );
  const launchLabProgramId = envString(
    environment,
    `${prefix}_LAUNCHLAB_PROGRAM_ID`,
    "SOLANA_LAUNCHLAB_PROGRAM_ID",
  ) ?? defaults?.launchLab;
  const cpmmProgramId = envString(
    environment,
    `${prefix}_CPMM_PROGRAM_ID`,
    "SOLANA_CPMM_PROGRAM_ID",
  ) ?? defaults?.cpmm;
  let releaseRecord: SolanaReleaseRecord | undefined;
  let releaseRecordError: string | undefined;
  const releaseRecordJson = envString(environment, "SOLANA_MAINNET_RELEASE_RECORD_JSON");
  if (releaseRecordJson) {
    try {
      releaseRecord = parseSolanaReleaseRecord(JSON.parse(releaseRecordJson));
    } catch (error) {
      releaseRecordError = error instanceof Error ? error.message : "Release record JSON is malformed.";
    }
  }
  let releaseApproverKeys: string[] | undefined;
  const releaseApproverKeysJson = envString(environment, "SOLANA_MAINNET_RELEASE_APPROVER_KEYS_JSON");
  if (releaseApproverKeysJson) {
    try {
      const parsed: unknown = JSON.parse(releaseApproverKeysJson);
      if (!Array.isArray(parsed) || parsed.some((key) => typeof key !== "string")) {
        throw new Error("Release approver keys must be a JSON array of strings.");
      }
      releaseApproverKeys = parsed;
    } catch (error) {
      releaseRecordError = error instanceof Error ? error.message : "Release approver keys are malformed.";
    }
  }
  let releaseApprovalThreshold: number | undefined;
  const releaseApprovalThresholdValue = envString(environment, "SOLANA_MAINNET_RELEASE_APPROVAL_THRESHOLD");
  if (releaseApprovalThresholdValue) {
    releaseApprovalThreshold = envInteger(environment, "SOLANA_MAINNET_RELEASE_APPROVAL_THRESHOLD");
    if (releaseApprovalThreshold === undefined) releaseRecordError = "Release approver threshold is malformed.";
  }
  let releaseApproverRoles: Record<string, string> | undefined;
  const rolesJson = envString(environment, "SOLANA_MAINNET_RELEASE_APPROVER_ROLES_JSON");
  if (rolesJson) {
    try {
      const parsed: unknown = JSON.parse(rolesJson);
      const roleMap = record(parsed);
      if (!roleMap || Object.entries(roleMap).some(([key, role]) =>
        !isValidSolanaPublicKey(key) || typeof role !== "string" || !role)) {
        throw new Error("Release approver roles must map valid public keys to non-empty roles.");
      }
      releaseApproverRoles = roleMap as Record<string, string>;
    } catch (error) {
      releaseRecordError = error instanceof Error ? error.message : "Release approver roles are malformed.";
    }
  }
  let releaseRequiredApproverRoles: string[] | undefined;
  const requiredRolesJson = envString(environment, "SOLANA_MAINNET_RELEASE_REQUIRED_APPROVER_ROLES_JSON");
  if (requiredRolesJson) {
    try {
      const parsed: unknown = JSON.parse(requiredRolesJson);
      if (!Array.isArray(parsed) || parsed.some((role) => typeof role !== "string" || !role)) {
        throw new Error("Required release approver roles must be a JSON array of strings.");
      }
      releaseRequiredApproverRoles = parsed;
    } catch (error) {
      releaseRecordError = error instanceof Error ? error.message : "Required release approver roles are malformed.";
    }
  }
  let chainStateBaseline: SolanaChainStateBaseline | undefined;
  const chainStateBaselineJson = envString(environment, "SOLANA_MAINNET_CHAIN_STATE_BASELINE_JSON");
  if (chainStateBaselineJson) {
    try {
      chainStateBaseline = parseSolanaChainStateBaseline(JSON.parse(chainStateBaselineJson));
    } catch (error) {
      releaseRecordError = error instanceof Error ? error.message : "Chain-state baseline is malformed.";
    }
  }

  return {
    cluster,
    rpcUrl,
    rpcExplicitlyConfigured: Boolean(configuredRpcUrl),
    mainnetConfigurationDedicated: cluster === "devnet"
      ? true
      : dedicatedMainnetKeys.every((key) => Boolean(environment[key]?.trim())),
    launchLabProgramId,
    cpmmProgramId,
    launchLabProgramDataAddress: envString(
      environment,
      `${prefix}_LAUNCHLAB_PROGRAM_DATA_ADDRESS`,
      `${prefix}_LAUNCHLAB_PROGRAMDATA_ADDRESS`,
    ),
    launchLabProgramDataHash: envString(
      environment,
      `${prefix}_LAUNCHLAB_PROGRAM_DATA_HASH`,
      `${prefix}_LAUNCHLAB_CODE_HASH`,
      `${prefix}_LAUNCHLAB_DEPLOYED_CODE_HASH`,
      `${prefix}_LAUNCHLAB_CODE_FINGERPRINT`,
    ),
    launchLabProgramDataSlot: envInteger(
      environment,
      `${prefix}_LAUNCHLAB_PROGRAM_DATA_SLOT`,
      `${prefix}_LAUNCHLAB_DEPLOYMENT_SLOT`,
    ),
    launchLabUpgradeAuthority: envString(
      environment,
      `${prefix}_LAUNCHLAB_UPGRADE_AUTHORITY`,
    ),
    cpmmProgramDataAddress: envString(
      environment,
      `${prefix}_CPMM_PROGRAM_DATA_ADDRESS`,
      `${prefix}_CPMM_PROGRAMDATA_ADDRESS`,
    ),
    cpmmProgramDataHash: envString(
      environment,
      `${prefix}_CPMM_PROGRAM_DATA_HASH`,
      `${prefix}_CPMM_CODE_HASH`,
      `${prefix}_CPMM_DEPLOYED_CODE_HASH`,
      `${prefix}_CPMM_CODE_FINGERPRINT`,
    ),
    cpmmProgramDataSlot: envInteger(
      environment,
      `${prefix}_CPMM_PROGRAM_DATA_SLOT`,
      `${prefix}_CPMM_DEPLOYMENT_SLOT`,
    ),
    cpmmUpgradeAuthority: envString(
      environment,
      `${prefix}_CPMM_UPGRADE_AUTHORITY`,
    ),
    releaseEnabled: envBoolean(
      environment.SOLANA_MAINNET_RELEASE_ENABLED
      ?? environment.SOLANA_MAINNET_RELEASE_FLAG
      ?? environment.SOLANA_RELEASE_ENABLED
      ?? environment.SOLANA_RELEASE_FLAG,
    ),
    reviewedProgramIds: cluster === "devnet"
      ? true
      : envBoolean(
        environment.SOLANA_MAINNET_REVIEWED_PROGRAM_IDS
        ?? environment.SOLANA_MAINNET_PROGRAM_IDS_REVIEWED
        ?? environment.SOLANA_REVIEWED_PROGRAM_IDS,
      ),
    platformPda: envString(environment, `${prefix}_PLATFORM_PDA`, "SOLANA_PLATFORM_PDA"),
    platformFeeDestination: envString(
      environment,
      `${prefix}_PLATFORM_FEE_DESTINATION`,
      "SOLANA_PLATFORM_FEE_DESTINATION",
    ),
    platformFeeDestinationReviewed: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED),
    platformFeeDestinationOwner: envString(environment, `${prefix}_PLATFORM_FEE_DESTINATION_OWNER`),
    treasuryAuthority: envString(
      environment,
      `${prefix}_TREASURY_AUTHORITY`,
      "SOLANA_TREASURY_AUTHORITY",
    ),
    treasuryAuthorityOwner: envString(environment, `${prefix}_TREASURY_AUTHORITY_OWNER`),
    treasuryAuthorityPolicy: envString(
      environment,
      `${prefix}_TREASURY_AUTHORITY_POLICY`,
      "SOLANA_TREASURY_AUTHORITY_POLICY",
    ),
    treasuryAuthorityPolicyReviewed: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY_REVIEWED),
    lpAuthority: envString(
      environment,
      `${prefix}_LP_AUTHORITY`,
      "SOLANA_LP_AUTHORITY",
    ),
    lpAuthorityOwner: envString(environment, `${prefix}_LP_AUTHORITY_OWNER`),
    lpAuthorityPolicy: envString(
      environment,
      `${prefix}_LP_AUTHORITY_POLICY`,
      "SOLANA_LP_AUTHORITY_POLICY",
    ),
    lpAuthorityPolicyReviewed: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_LP_AUTHORITY_POLICY_REVIEWED),
    platformPdaSeeds: envString(
      environment,
      `${prefix}_PLATFORM_PDA_SEEDS_JSON`,
      "SOLANA_PLATFORM_PDA_SEEDS_JSON",
    ),
    platformPdaBump: envInteger(
      environment,
      `${prefix}_PLATFORM_PDA_BUMP`,
      "SOLANA_PLATFORM_PDA_BUMP",
    ),
    platformAccountDiscriminatorHex: envString(environment, `${prefix}_PLATFORM_ACCOUNT_DISCRIMINATOR_HEX`),
    platformAccountDataLength: envInteger(environment, `${prefix}_PLATFORM_ACCOUNT_DATA_LENGTH`),
    platformTreasuryAuthorityOffset: envOffset(
      environment,
      `${prefix}_PLATFORM_TREASURY_AUTHORITY_OFFSET`,
      "SOLANA_PLATFORM_TREASURY_AUTHORITY_OFFSET",
    ),
    platformLpAuthorityOffset: envOffset(
      environment,
      `${prefix}_PLATFORM_LP_AUTHORITY_OFFSET`,
      "SOLANA_PLATFORM_LP_AUTHORITY_OFFSET",
    ),
    platformFeeDestinationOffset: envOffset(
      environment,
      `${prefix}_PLATFORM_FEE_DESTINATION_OFFSET`,
      "SOLANA_PLATFORM_FEE_DESTINATION_OFFSET",
    ),
    deploymentStartSlot: envInteger(
      environment,
      `${prefix}_DEPLOYMENT_START_SLOT`,
      `${prefix}_START_SLOT`,
      "SOLANA_DEPLOYMENT_START_SLOT",
    ),
    platformPdaReviewed: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_PLATFORM_PDA_REVIEWED)
        && envBoolean(environment.SOLANA_MAINNET_PLATFORM_PDA_VERIFIED),
    independentSecurityReviewComplete: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_INDEPENDENT_SECURITY_REVIEW_COMPLETE),
    legalReviewComplete: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_LEGAL_REVIEW_COMPLETE),
    releaseAuthorizationRecorded: cluster === "devnet"
      ? false
      : envBoolean(environment.SOLANA_MAINNET_RELEASE_AUTHORIZATION_RECORDED),
    sdkBuilderReviewed: cluster === "devnet"
      ? true
      : envBoolean(environment.SOLANA_RAYDIUM_SDK_BUILDER_REVIEWED),
    sdkVersion: cluster === "devnet"
      ? REVIEWED_RAYDIUM_SDK_VERSION
      : envString(environment, "SOLANA_RAYDIUM_SDK_VERSION"),
    artifactId: envString(environment, `${prefix}_ARTIFACT_ID`, "SOLANA_ARTIFACT_ID"),
    buildId: envString(environment, `${prefix}_BUILD_ID`, "SOLANA_BUILD_ID"),
    releaseRecord,
    releaseRecordError,
    releaseApproverKeys,
    releaseApprovalThreshold,
    releaseApproverRoles,
    releaseRequiredApproverRoles,
    chainStateBaseline,
  };
}

export function toPublicSolanaConfig(config: SolanaConfig): PublicSolanaConfig {
  // Construct the object field-by-field: spreading a private config here
  // would make it too easy to accidentally expose rpcUrl in a future change.
  return {
    cluster: config.cluster,
    rpcExplicitlyConfigured: config.rpcExplicitlyConfigured,
    mainnetConfigurationDedicated: config.mainnetConfigurationDedicated,
    launchLabProgramId: config.launchLabProgramId,
    cpmmProgramId: config.cpmmProgramId,
    launchLabProgramDataAddress: config.launchLabProgramDataAddress,
    launchLabProgramDataHash: config.launchLabProgramDataHash,
    launchLabProgramDataSlot: config.launchLabProgramDataSlot,
    launchLabUpgradeAuthority: config.launchLabUpgradeAuthority,
    cpmmProgramDataAddress: config.cpmmProgramDataAddress,
    cpmmProgramDataHash: config.cpmmProgramDataHash,
    cpmmProgramDataSlot: config.cpmmProgramDataSlot,
    cpmmUpgradeAuthority: config.cpmmUpgradeAuthority,
    releaseEnabled: config.releaseEnabled,
    reviewedProgramIds: config.reviewedProgramIds,
    platformPda: config.platformPda,
    platformFeeDestination: config.platformFeeDestination,
    platformFeeDestinationReviewed: config.platformFeeDestinationReviewed,
    platformFeeDestinationOwner: config.platformFeeDestinationOwner,
    treasuryAuthority: config.treasuryAuthority,
    treasuryAuthorityOwner: config.treasuryAuthorityOwner,
    treasuryAuthorityPolicy: config.treasuryAuthorityPolicy,
    treasuryAuthorityPolicyReviewed: config.treasuryAuthorityPolicyReviewed,
    lpAuthority: config.lpAuthority,
    lpAuthorityOwner: config.lpAuthorityOwner,
    lpAuthorityPolicy: config.lpAuthorityPolicy,
    lpAuthorityPolicyReviewed: config.lpAuthorityPolicyReviewed,
    platformPdaSeeds: config.platformPdaSeeds,
    platformPdaBump: config.platformPdaBump,
    platformAccountDiscriminatorHex: config.platformAccountDiscriminatorHex,
    platformAccountDataLength: config.platformAccountDataLength,
    platformTreasuryAuthorityOffset: config.platformTreasuryAuthorityOffset,
    platformLpAuthorityOffset: config.platformLpAuthorityOffset,
    platformFeeDestinationOffset: config.platformFeeDestinationOffset,
    deploymentStartSlot: config.deploymentStartSlot,
    platformPdaReviewed: config.platformPdaReviewed,
    independentSecurityReviewComplete: config.independentSecurityReviewComplete,
    legalReviewComplete: config.legalReviewComplete,
    releaseAuthorizationRecorded: config.releaseAuthorizationRecorded,
    sdkBuilderReviewed: config.sdkBuilderReviewed,
    sdkVersion: config.sdkVersion,
    artifactId: config.artifactId,
    buildId: config.buildId,
    quoteAsset: SOLANA_QUOTE_ASSET,
  };
}

export function releaseRecordConfigMismatches(
  release: SolanaReleaseRecord,
  config: SolanaConfig,
): string[] {
  const mismatches: string[] = [];
  const compare = (field: string, expected: unknown, actual: unknown) => {
    if (expected !== actual) mismatches.push(`Signed release record ${field} does not match current configuration.`);
  };
  compare("cluster", config.cluster, release.cluster);
  compare("genesis hash", SOLANA_GENESIS_HASHES[config.cluster], release.genesisHash);
  compare("LaunchLab program ID", config.launchLabProgramId, release.launchLabProgramId);
  compare("CPMM program ID", config.cpmmProgramId, release.cpmmProgramId);
  compare("LaunchLab ProgramData address", config.launchLabProgramDataAddress, release.launchLabProgramDataAddress);
  compare("LaunchLab ProgramData hash", config.launchLabProgramDataHash, release.launchLabProgramDataHash);
  compare("LaunchLab ProgramData slot", config.launchLabProgramDataSlot, release.launchLabProgramDataSlot);
  compare("LaunchLab upgrade authority", config.launchLabUpgradeAuthority, release.launchLabUpgradeAuthority);
  compare("CPMM ProgramData address", config.cpmmProgramDataAddress, release.cpmmProgramDataAddress);
  compare("CPMM ProgramData hash", config.cpmmProgramDataHash, release.cpmmProgramDataHash);
  compare("CPMM ProgramData slot", config.cpmmProgramDataSlot, release.cpmmProgramDataSlot);
  compare("CPMM upgrade authority", config.cpmmUpgradeAuthority, release.cpmmUpgradeAuthority);
  compare("Platform PDA", config.platformPda, release.platformPda);
  compare("platform fee destination", config.platformFeeDestination, release.platformFeeDestination);
  compare("platform fee destination owner", config.platformFeeDestinationOwner, release.platformFeeDestinationOwner);
  compare("treasury authority", config.treasuryAuthority, release.treasuryAuthority);
  compare("treasury authority owner", config.treasuryAuthorityOwner, release.treasuryAuthorityOwner);
  compare("treasury authority policy", config.treasuryAuthorityPolicy, release.treasuryAuthorityPolicy);
  compare("LP authority", config.lpAuthority, release.lpAuthority);
  compare("LP authority owner", config.lpAuthorityOwner, release.lpAuthorityOwner);
  compare("LP authority policy", config.lpAuthorityPolicy, release.lpAuthorityPolicy);
  compare("Platform PDA seeds", config.platformPdaSeeds, release.platformPdaSeeds);
  compare("Platform PDA bump", config.platformPdaBump, release.platformPdaBump);
  compare("Platform account discriminator", config.platformAccountDiscriminatorHex, release.platformAccountDiscriminatorHex);
  compare("Platform account data length", config.platformAccountDataLength, release.platformAccountDataLength);
  compare("Platform treasury authority offset", config.platformTreasuryAuthorityOffset, release.platformTreasuryAuthorityOffset);
  compare("Platform LP authority offset", config.platformLpAuthorityOffset, release.platformLpAuthorityOffset);
  compare("Platform fee destination offset", config.platformFeeDestinationOffset, release.platformFeeDestinationOffset);
  compare("deployment start slot", config.deploymentStartSlot, release.deploymentStartSlot);
  compare("SDK version", config.sdkVersion, release.sdkVersion);
  compare("artifact identifier", config.artifactId, release.artifactId);
  compare("build identifier", config.buildId, release.buildId);
  compare("reviewed program IDs", config.reviewedProgramIds, release.reviewedProgramIds);
  compare("fee destination review", config.platformFeeDestinationReviewed, release.platformFeeDestinationReviewed);
  compare("treasury policy review", config.treasuryAuthorityPolicyReviewed, release.treasuryAuthorityPolicyReviewed);
  compare("LP policy review", config.lpAuthorityPolicyReviewed, release.lpAuthorityPolicyReviewed);
  compare("Platform PDA review", config.platformPdaReviewed, release.platformPdaReviewed);
  compare("security review", config.independentSecurityReviewComplete, release.independentSecurityReviewComplete);
  compare("legal review", config.legalReviewComplete, release.legalReviewComplete);
  compare("release authorization", config.releaseAuthorizationRecorded, release.releaseAuthorizationRecorded);
  compare("SDK builder review", config.sdkBuilderReviewed, release.sdkBuilderReviewed);
  compare(
    "reviewed chain-state baseline",
    config.chainStateBaseline ? canonicalizeValue(config.chainStateBaseline) : undefined,
    canonicalizeValue(release.chainStateBaseline),
  );
  return mismatches;
}

export function productionBlockers(config: SolanaConfig): string[] {
  const blockers: string[] = [];
  if (!config.releaseEnabled) blockers.push("An explicit mainnet release flag is not enabled.");
  if (!config.mainnetConfigurationDedicated) blockers.push("Mainnet controls must use dedicated SOLANA_MAINNET configuration values.");
  if (config.cluster !== "mainnet-beta") blockers.push("Activation requires the exact mainnet-beta cluster.");
  if (!config.reviewedProgramIds) blockers.push("Raydium program IDs are not marked as reviewed.");
  if (config.launchLabProgramId !== RAYDIUM_PROGRAM_IDS["mainnet-beta"].launchLab) blockers.push("The LaunchLab program ID does not match the pinned Raydium mainnet ID.");
  if (config.cpmmProgramId !== RAYDIUM_PROGRAM_IDS["mainnet-beta"].cpmm) blockers.push("The CPMM program ID does not match the pinned Raydium mainnet ID.");
  for (const [label, address, hash, slot, authority] of [
    ["LaunchLab", config.launchLabProgramDataAddress, config.launchLabProgramDataHash, config.launchLabProgramDataSlot, config.launchLabUpgradeAuthority],
    ["CPMM", config.cpmmProgramDataAddress, config.cpmmProgramDataHash, config.cpmmProgramDataSlot, config.cpmmUpgradeAuthority],
  ] as const) {
    if (!address || !isValidSolanaPublicKey(address)) blockers.push(`The reviewed ${label} ProgramData address is not configured.`);
    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) blockers.push(`The reviewed ${label} deployed code hash is not a valid SHA-256 value.`);
    if (slot === undefined || !Number.isSafeInteger(slot) || slot < 0) blockers.push(`The reviewed ${label} ProgramData deployment slot is not configured.`);
    if (!authority || !isValidSolanaPublicKey(authority)) blockers.push(`The reviewed ${label} upgrade authority is not configured.`);
  }
  if (!config.platformPda || !isValidSolanaPublicKey(config.platformPda)) blockers.push("A reviewed Platform PDA is not configured.");
  if (!config.platformFeeDestination || !isValidSolanaPublicKey(config.platformFeeDestination)) blockers.push("The platform fee destination is not configured.");
  if (!config.platformFeeDestinationReviewed) blockers.push("The platform fee destination has not been independently reviewed.");
  if (!config.platformFeeDestinationOwner || !isValidSolanaPublicKey(config.platformFeeDestinationOwner)) blockers.push("The reviewed platform fee destination owner is not configured.");
  if (!config.treasuryAuthority || !isValidSolanaPublicKey(config.treasuryAuthority)) blockers.push("A governed treasury authority is not configured.");
  if (!config.treasuryAuthorityPolicy) blockers.push("The governed treasury authority policy is not configured.");
  if (!config.treasuryAuthorityOwner || !isValidSolanaPublicKey(config.treasuryAuthorityOwner)) blockers.push("The governed treasury authority account owner is not configured.");
  if (!config.treasuryAuthorityPolicyReviewed) blockers.push("The governed treasury authority policy is not approved.");
  if (!config.lpAuthority || !isValidSolanaPublicKey(config.lpAuthority)) blockers.push("The LP authority is not configured.");
  if (!config.lpAuthorityPolicy) blockers.push("The LP authority policy is not configured.");
  if (!config.lpAuthorityOwner || !isValidSolanaPublicKey(config.lpAuthorityOwner)) blockers.push("The LP authority account owner is not configured.");
  if (!config.lpAuthorityPolicyReviewed) blockers.push("The LP authority policy is not approved.");
  if (!config.platformPdaSeeds || config.platformPdaBump === undefined) blockers.push("The reviewed Platform PDA derivation seeds and bump are not configured.");
  if (!config.platformAccountDiscriminatorHex || config.platformAccountDataLength === undefined) blockers.push("The reviewed Platform account discriminator and data length are not configured.");
  if (config.platformAccountDiscriminatorHex
    && (!/^(?:[0-9a-fA-F]{2})+$/.test(config.platformAccountDiscriminatorHex)
      || config.platformAccountDiscriminatorHex.length !== 16)) {
    blockers.push("The reviewed Platform account discriminator is malformed.");
  }
  if (config.platformTreasuryAuthorityOffset === undefined || config.platformLpAuthorityOffset === undefined || config.platformFeeDestinationOffset === undefined) blockers.push("The reviewed Platform authority and fee field offsets are not configured.");
  else if (!reviewedPlatformLayoutIsWellFormed(config)) blockers.push("The reviewed Platform authority and fee field offsets do not describe a non-overlapping account layout.");
  if (config.deploymentStartSlot === undefined) blockers.push("The deployment/start slot is not configured.");
  if (!config.rpcExplicitlyConfigured) blockers.push("A dedicated mainnet RPC URL is not configured.");
  if (!config.sdkVersion || !config.sdkBuilderReviewed) blockers.push("The pinned Raydium SDK transaction builder is not reviewed.");
  if (!config.platformPdaReviewed) blockers.push("The Platform PDA has not been verified against the reviewed deployment.");
  if (!config.independentSecurityReviewComplete) blockers.push("The independent security review is not complete.");
  if (!config.legalReviewComplete) blockers.push("The legal review is not complete.");
  if (!config.releaseAuthorizationRecorded) blockers.push("Explicit mainnet real-funds release authorization is not recorded.");
  if (config.releaseRecordError) blockers.push(`The signed mainnet release record is invalid: ${config.releaseRecordError}`);
  if (!config.releaseRecord) blockers.push("A signed mainnet release record is not configured.");
  if (!config.releaseApproverKeys?.length) blockers.push("No trusted mainnet release approver keys are configured.");
  if (!config.chainStateBaseline) blockers.push("The reviewed mainnet chain-state baseline is not configured.");
  return blockers;
}

export type SolanaRpc = (
  method: string,
  params: unknown[],
) => Promise<unknown>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function decodeBase58(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    let carry = BASE58_ALPHABET.indexOf(character);
    if (carry < 0) throw new Error("Invalid base58.");
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === "1"; index += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

function encodeBase58(value: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (const byte of value) {
    if (byte !== 0) break;
    result += "1";
  }
  return result + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

function powMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let current = mod(base, modulus);
  for (let power = exponent; power > 0n; power >>= 1n) {
    if (power & 1n) result = mod(result * current, modulus);
    current = mod(current * current, modulus);
  }
  return result;
}

function isEd25519Point(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const copy = Uint8Array.from(bytes);
  copy[31] &= 0x7f;
  let y = 0n;
  for (let index = 31; index >= 0; index -= 1) y = (y << 8n) + BigInt(copy[index]);
  const p = (1n << 255n) - 19n;
  if (y >= p) return false;
  const d = mod(-121665n * powMod(121666n, p - 2n, p), p);
  const y2 = mod(y * y, p);
  const x2 = mod((y2 - 1n) * powMod(d * y2 + 1n, p - 2n, p), p);
  return powMod(x2, (p - 1n) / 2n, p) === 1n || x2 === 0n;
}

type PdaSeed = { type: "utf8" | "hex" | "pubkey"; value: string };

function parsePdaSeeds(value: string): Uint8Array[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 15) throw new Error("Invalid PDA seeds.");
  return parsed.map((item) => {
    const seed = record(item) as PdaSeed | undefined;
    if (!seed || typeof seed.value !== "string") throw new Error("Invalid PDA seed.");
    let bytes: Uint8Array;
    if (seed.type === "utf8") bytes = new TextEncoder().encode(seed.value);
    else if (seed.type === "hex" && /^(?:[0-9a-fA-F]{2})+$/.test(seed.value)) bytes = Uint8Array.from(Buffer.from(seed.value, "hex"));
    else if (seed.type === "pubkey" && isValidSolanaPublicKey(seed.value)) bytes = decodeBase58(seed.value);
    else throw new Error("Invalid PDA seed.");
    if (bytes.length > 32) throw new Error("PDA seed exceeds 32 bytes.");
    return bytes;
  });
}

export async function deriveProgramAddress(seedsJson: string, bump: number, programId: string): Promise<string> {
  if (bump < 0 || bump > 255 || !isValidSolanaPublicKey(programId)) throw new Error("Invalid PDA derivation inputs.");
  const seeds = parsePdaSeeds(seedsJson);
  const input = Buffer.concat([
    ...seeds.map((seed) => Buffer.from(seed)),
    Buffer.from([bump]),
    Buffer.from(decodeBase58(programId)),
    Buffer.from("ProgramDerivedAddress"),
  ]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  if (isEd25519Point(digest)) throw new Error("Configured PDA bump derives an on-curve address.");
  return encodeBase58(digest);
}

function accountData(value: Record<string, unknown>): Uint8Array | undefined {
  if (!Array.isArray(value.data) || typeof value.data[0] !== "string" || value.data[1] !== "base64") return undefined;
  return Uint8Array.from(Buffer.from(value.data[0], "base64"));
}

function publicKeyAt(data: Uint8Array, offset: number | undefined): string | undefined {
  if (offset === undefined || offset + 32 > data.length) return undefined;
  return encodeBase58(data.slice(offset, offset + 32));
}

function littleEndianU32(data: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > data.length) return undefined;
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

function littleEndianU64(data: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 8 > data.length) return undefined;
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) value = (value << 8n) + BigInt(data[offset + index]);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

async function verifyProgramData(
  label: "LaunchLab" | "CPMM",
  result: ProgramVerification,
  expected: {
    address?: string;
    hash?: string;
    slot?: number;
    upgradeAuthority?: string;
  },
  rpc: SolanaRpc,
  blockers: string[],
): Promise<void> {
  const programData = result.programDataAddress
    ? result.programDataAddress
    : undefined;
  if (!programData) {
    blockers.push(`${label} program account does not expose a finalized upgradeable ProgramData address.`);
    return;
  }
  result.programDataAddressVerified = programData === expected.address;
  if (!result.programDataAddressVerified) {
    blockers.push(`${label} ProgramData address does not match the independently reviewed address.`);
  }
  try {
    const response = record(await rpc("getAccountInfo", [
      programData,
      { encoding: "base64", commitment: "finalized" },
    ]));
    const value = record(response?.value);
    if (!value) {
      result.error = `${label} ProgramData account was not found at finalized commitment.`;
      blockers.push(`${label} ProgramData account was not found at finalized commitment.`);
      return;
    }
    result.programDataAccountFound = true;
    result.programDataExecutableVerified = value.executable !== true;
    if (typeof value.owner === "string") result.programDataOwner = value.owner;
    result.programDataOwnerVerified = value.owner === SOLANA_UPGRADEABLE_LOADER_ID;
    if (value.executable === true) {
      blockers.push(`${label} ProgramData account must not be executable.`);
    }
    if (!result.programDataOwnerVerified) {
      blockers.push(`${label} ProgramData account owner does not match the canonical upgradeable BPF loader.`);
    }
    const context = record(response?.context);
    if (Number.isSafeInteger(context?.slot) && (context?.slot as number) >= 0) {
      result.programDataReadSlot = context?.slot as number;
    }
    const data = accountData(value);
    if (!data || littleEndianU32(data, 0) !== 3) {
      blockers.push(`${label} ProgramData account has an invalid finalized ProgramData layout.`);
      return;
    }
    const deployedSlot = littleEndianU64(data, 4);
    if (deployedSlot === undefined) {
      blockers.push(`${label} ProgramData deployed slot is invalid or exceeds safe integer range.`);
    } else {
      result.programDataSlot = deployedSlot;
      result.programDataSlotVerified = deployedSlot === expected.slot;
      if (!result.programDataSlotVerified) {
        blockers.push(`${label} deployed code slot does not match the independently reviewed slot.`);
      }
    }
    const authorityOption = data.length > 12 ? data[12] : undefined;
    const codeOffset = authorityOption === 1 ? 45 : authorityOption === 0 ? 13 : undefined;
    if (authorityOption === 1) result.upgradeAuthority = publicKeyAt(data, 13);
    else if (authorityOption === 0) result.upgradeAuthority = undefined;
    if (codeOffset === undefined || (authorityOption === 1 && !result.upgradeAuthority)) {
      blockers.push(`${label} ProgramData upgrade-authority option is malformed.`);
    } else {
      result.upgradeAuthorityVerified = result.upgradeAuthority === expected.upgradeAuthority;
      if (!result.upgradeAuthorityVerified) {
        blockers.push(`${label} upgrade authority does not match the independently reviewed authority.`);
    }
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data.slice(codeOffset)));
      result.codeHash = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      result.codeHashVerified = result.codeHash === expected.hash?.toLowerCase();
      if (!result.codeHashVerified) {
        blockers.push(`${label} deployed code hash does not match the independently reviewed hash.`);
      }
    }
  } catch {
    result.error = `Unable to verify ${label} ProgramData state at finalized commitment.`;
    blockers.push(`Unable to verify ${label} ProgramData state at finalized commitment.`);
  }
}

function reviewedPlatformLayoutIsWellFormed(config: SolanaConfig): boolean {
  const length = config.platformAccountDataLength;
  const offsets = [
    config.platformTreasuryAuthorityOffset,
    config.platformLpAuthorityOffset,
    config.platformFeeDestinationOffset,
  ];
  if (length === undefined || !Number.isSafeInteger(length) || length < 32) return false;
  if (offsets.some((offset) => offset === undefined
    || !Number.isSafeInteger(offset)
    || offset < 0
    || offset + 32 > length)) return false;
  // A duplicated offset would make a malformed review appear to validate
  // merely because two fields happen to contain the same key.
  return new Set(offsets).size === offsets.length;
}

async function finalizedStateFingerprint(value: unknown): Promise<string | undefined> {
  const serialized = JSON.stringify(value);
  if (!serialized) return undefined;
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  ));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySolanaReadiness(
  config: SolanaConfig,
  rpc: SolanaRpc,
  now = new Date(),
): Promise<SolanaReadiness> {
  const blockers = config.cluster === "mainnet-beta"
    ? productionBlockers(config)
    : ["Devnet verification is read-only; activation requires mainnet-beta."];
  const releaseRecord = config.cluster === "mainnet-beta"
    ? await verifySignedReleaseRecord(config.releaseRecord, {
      trustedKeys: config.releaseApproverKeys ?? [],
      threshold: config.releaseApprovalThreshold,
      roles: config.releaseApproverRoles,
      requiredRoles: config.releaseRequiredApproverRoles,
    }, now)
    : {
      present: false,
      signaturesValid: false,
      configMatch: false,
      valid: false,
      blockers: [],
    };
  if (config.cluster === "mainnet-beta" && releaseRecord.signaturesValid && config.releaseRecord) {
    const mismatches = releaseRecordConfigMismatches(config.releaseRecord, config);
    releaseRecord.configMatch = mismatches.length === 0;
    if (mismatches.length > 0) releaseRecord.blockers.push(...mismatches);
  }
  releaseRecord.valid = releaseRecord.signaturesValid && releaseRecord.configMatch;
  blockers.push(...releaseRecord.blockers);
  if (!isHttpsUrl(config.rpcUrl)) blockers.push("The selected RPC URL is not a valid HTTPS endpoint.");
  const emptyProgram = (id: string | undefined): ProgramVerification => ({
    id: id ?? "",
    validIdentifier: Boolean(id && isValidSolanaPublicKey(id)),
    accountFound: false,
    executable: false,
    ownerVerified: false,
    programDataAddressVerified: false,
    programDataAccountFound: false,
    programDataExecutableVerified: false,
    programDataOwnerVerified: false,
    programDataSlotVerified: false,
    codeHashVerified: false,
    upgradeAuthorityVerified: false,
  });
  const programs = {
    launchLab: emptyProgram(config.launchLabProgramId),
    cpmm: emptyProgram(config.cpmmProgramId),
  };
  const emptyAccount = (id: string | undefined): AccountVerification => ({
    id: id ?? "",
    validIdentifier: Boolean(id && isValidSolanaPublicKey(id)),
    accountFound: false,
  });
  const platform: PlatformVerification = {
    ...emptyAccount(config.platformPda),
    derivationVerified: false,
    ownerVerified: false,
    treasuryAuthorityVerified: false,
    lpAuthorityVerified: false,
    feeDestinationVerified: false,
    discriminatorVerified: false,
    dataLengthVerified: false,
  };
  const authorities = {
    treasury: emptyAccount(config.treasuryAuthority),
    lp: emptyAccount(config.lpAuthority),
    feeDestination: emptyAccount(config.platformFeeDestination),
  };
  if (!config.rpcUrl || !isHttpsUrl(config.rpcUrl)) {
    blockers.push(config.rpcUrl
      ? "The selected RPC URL is not a valid HTTPS endpoint."
      : "The selected cluster has no RPC configured.");
    return {
      cluster: config.cluster,
      connected: false,
      genesisVerified: false,
      programs,
      platform,
      authorities,
      releaseRecord,
      networkReady: false,
      activationEligible: false,
      activation: "not-eligible",
      blockers: [...new Set(blockers)],
      quoteAsset: SOLANA_QUOTE_ASSET,
      checkedAt: now.toISOString(),
    };
  }
  if (!programs.launchLab.validIdentifier || !programs.cpmm.validIdentifier) {
    blockers.push("One or more configured Raydium program IDs are malformed.");
    return {
      cluster: config.cluster,
      connected: false,
      genesisVerified: false,
      programs,
      platform,
      authorities,
      releaseRecord,
      networkReady: false,
      activationEligible: false,
      activation: "not-eligible",
      blockers: [...new Set(blockers)],
      quoteAsset: SOLANA_QUOTE_ASSET,
      checkedAt: now.toISOString(),
    };
  }

  let connected = false;
  let genesisVerified = false;
  let genesisHash: string | undefined;
  try {
    const genesis = await rpc("getGenesisHash", []);
    if (typeof genesis !== "string") throw new Error("Invalid genesis response");
    genesisHash = genesis;
    genesisVerified = genesis === SOLANA_GENESIS_HASHES[config.cluster];
    connected = true;
    if (!genesisVerified) blockers.push("RPC genesis hash does not match the selected Solana cluster.");
  } catch {
    blockers.push("Unable to verify the selected Solana cluster through RPC.");
  }

  for (const [name, id] of [["launchLab", config.launchLabProgramId], ["cpmm", config.cpmmProgramId]] as const) {
    try {
      const response = record(await rpc("getAccountInfo", [
        id,
        { encoding: "base64", commitment: "finalized" },
      ]));
      const value = record(response?.value);
      const result = programs[name];
      if (!value) {
        result.error = "Program account was not found at finalized commitment.";
        blockers.push(`${name === "launchLab" ? "LaunchLab" : "CPMM"} program account was not found.`);
        continue;
      }
      result.accountFound = true;
      result.executable = value.executable === true;
      if (typeof value.owner === "string") result.owner = value.owner;
      result.ownerVerified = value.owner === SOLANA_UPGRADEABLE_LOADER_ID;
      if (typeof response?.context === "object" && response?.context
        && Number.isSafeInteger((response.context as Record<string, unknown>).slot)
        && (response.context as Record<string, number>).slot >= 0) {
        result.slot = (response.context as Record<string, number>).slot;
      }
      if (!result.executable) {
        result.error = "Program account is not executable.";
        blockers.push(`${name === "launchLab" ? "LaunchLab" : "CPMM"} program account is not executable.`);
      }
      if (!result.ownerVerified) {
        blockers.push(`${name === "launchLab" ? "LaunchLab" : "CPMM"} program account owner does not match the canonical upgradeable BPF loader.`);
      }
      if (config.cluster === "mainnet-beta") {
        const label = name === "launchLab" ? "LaunchLab" : "CPMM";
        const data = accountData(value);
        if (!data || littleEndianU32(data, 0) !== 2 || !publicKeyAt(data, 4)) {
          blockers.push(`${label} program account does not expose a finalized upgradeable ProgramData address.`);
        } else {
          result.programDataAddress = publicKeyAt(data, 4);
          await verifyProgramData(label, result, name === "launchLab"
            ? {
              address: config.launchLabProgramDataAddress,
              hash: config.launchLabProgramDataHash,
              slot: config.launchLabProgramDataSlot,
              upgradeAuthority: config.launchLabUpgradeAuthority,
            }
            : {
              address: config.cpmmProgramDataAddress,
              hash: config.cpmmProgramDataHash,
              slot: config.cpmmProgramDataSlot,
              upgradeAuthority: config.cpmmUpgradeAuthority,
            }, rpc, blockers);
        }
      }
    } catch {
      programs[name].error = "Unable to verify program account at finalized commitment.";
      blockers.push(`Unable to verify the ${name === "launchLab" ? "LaunchLab" : "CPMM"} program account.`);
    }
  }

  if (config.platformPda && config.launchLabProgramId && config.platformPdaSeeds && config.platformPdaBump !== undefined) {
    try {
      platform.derivedAddress = await deriveProgramAddress(config.platformPdaSeeds, config.platformPdaBump, config.launchLabProgramId);
      platform.derivationVerified = platform.derivedAddress === config.platformPda;
      if (!platform.derivationVerified) blockers.push("The configured Platform PDA does not match its reviewed LaunchLab derivation.");
    } catch {
      blockers.push("The configured Platform PDA derivation could not be verified.");
    }
  } else if (config.cluster === "mainnet-beta") {
    blockers.push("The configured Platform PDA derivation could not be verified.");
  }

  if (platform.validIdentifier) {
    try {
      const response = record(await rpc("getAccountInfo", [
        platform.id,
        { encoding: "base64", commitment: "finalized" },
      ]));
      const value = record(response?.value);
      if (!value) {
        platform.error = "Platform account was not found at finalized commitment.";
        blockers.push("The Platform account was not found.");
      } else {
        platform.accountFound = true;
        if (typeof value.owner === "string") platform.owner = value.owner;
        platform.ownerVerified = value.owner === config.launchLabProgramId;
        const context = record(response?.context);
        if (typeof context?.slot === "number" && Number.isSafeInteger(context.slot) && context.slot >= 0) platform.slot = context.slot;
        if (!platform.ownerVerified) blockers.push("The Platform account is not owned by the pinned LaunchLab program.");
        const data = accountData(value);
        if (!data) {
          blockers.push("The Platform account data could not be decoded.");
        } else {
          const discriminator = config.platformAccountDiscriminatorHex && /^(?:[0-9a-fA-F]{2})+$/.test(config.platformAccountDiscriminatorHex)
            ? Uint8Array.from(Buffer.from(config.platformAccountDiscriminatorHex, "hex"))
            : undefined;
          platform.discriminatorVerified = Boolean(discriminator
            && data.length >= discriminator.length
            && discriminator.every((byte, index) => data[index] === byte));
          platform.dataLengthVerified = data.length === config.platformAccountDataLength;
          if (!platform.discriminatorVerified) blockers.push("The Platform account discriminator does not match the reviewed account type.");
          if (!platform.dataLengthVerified) blockers.push("The Platform account data length does not match the reviewed layout.");
          platform.treasuryAuthority = publicKeyAt(data, config.platformTreasuryAuthorityOffset);
          platform.lpAuthority = publicKeyAt(data, config.platformLpAuthorityOffset);
          platform.feeDestination = publicKeyAt(data, config.platformFeeDestinationOffset);
          platform.treasuryAuthorityVerified = platform.treasuryAuthority === config.treasuryAuthority;
          platform.lpAuthorityVerified = platform.lpAuthority === config.lpAuthority;
          platform.feeDestinationVerified = platform.feeDestination === config.platformFeeDestination;
          if (!platform.treasuryAuthorityVerified) blockers.push("The Platform treasury authority does not match the governed treasury authority.");
          if (!platform.lpAuthorityVerified) blockers.push("The Platform LP authority does not match the approved LP authority.");
          if (!platform.feeDestinationVerified) blockers.push("The Platform fee destination does not match the reviewed fee destination.");
        }
      }
    } catch {
      platform.error = "Unable to verify Platform state at finalized commitment.";
      blockers.push("Unable to verify the Platform account at finalized commitment.");
    }
  }

  for (const [label, result] of Object.entries(authorities) as Array<[keyof typeof authorities, AccountVerification]>) {
    if (!result.validIdentifier) continue;
    try {
      const response = record(await rpc("getAccountInfo", [
        result.id,
        { encoding: "base64", commitment: "finalized" },
      ]));
      const value = record(response?.value);
      if (!value) {
        result.error = "Authority account was not found at finalized commitment.";
        blockers.push(`The ${label === "feeDestination" ? "platform fee destination" : `${label} authority`} account was not found.`);
      } else {
        result.accountFound = true;
        if (typeof value.owner === "string") result.owner = value.owner;
        const context = record(response?.context);
        if (typeof context?.slot === "number" && Number.isSafeInteger(context.slot) && context.slot >= 0) result.slot = context.slot;
        const expectedOwner = label === "treasury"
          ? config.treasuryAuthorityOwner
          : label === "lp"
            ? config.lpAuthorityOwner
            : config.platformFeeDestinationOwner;
        if (result.owner !== expectedOwner) blockers.push(`The ${label === "feeDestination" ? "platform fee destination" : `${label} authority`} account owner does not match the reviewed owner.`);
      }
    } catch {
      result.error = "Unable to verify account at finalized commitment.";
      blockers.push(`Unable to verify the ${label === "feeDestination" ? "platform fee destination" : `${label} authority`} account.`);
    }
  }

  const finalizedSlots = [
    programs.launchLab.slot,
    programs.cpmm.slot,
    programs.launchLab.programDataReadSlot,
    programs.cpmm.programDataReadSlot,
    platform.slot,
    authorities.treasury.slot,
    authorities.lp.slot,
    authorities.feeDestination.slot,
  ];
  if (config.cluster === "mainnet-beta" && config.deploymentStartSlot !== undefined
    && finalizedSlots.some((slot) => slot === undefined || slot < config.deploymentStartSlot!)) {
    blockers.push("One or more finalized account reads predate the configured deployment start slot.");
  }
  const finalizedStateIsFresh = config.cluster !== "mainnet-beta"
    || (config.deploymentStartSlot !== undefined
      && finalizedSlots.every((slot) => slot !== undefined && slot >= config.deploymentStartSlot!));
  const pinnedProgramIdsMatch = config.launchLabProgramId === RAYDIUM_PROGRAM_IDS["mainnet-beta"].launchLab
    && config.cpmmProgramId === RAYDIUM_PROGRAM_IDS["mainnet-beta"].cpmm;

  const chainReady = connected
    && genesisVerified
    && programs.launchLab.accountFound
    && programs.launchLab.executable
    && programs.launchLab.ownerVerified
    && programs.cpmm.accountFound
    && programs.cpmm.executable
    && programs.cpmm.ownerVerified
    && (config.cluster !== "mainnet-beta" || (
      pinnedProgramIdsMatch
      && programs.launchLab.programDataAddressVerified
      && programs.launchLab.programDataAccountFound
      && programs.launchLab.programDataExecutableVerified
      && programs.launchLab.programDataOwnerVerified
      && programs.launchLab.programDataSlotVerified
      && programs.launchLab.codeHashVerified
      && programs.launchLab.upgradeAuthorityVerified
      && programs.cpmm.programDataAddressVerified
      && programs.cpmm.programDataAccountFound
      && programs.cpmm.programDataExecutableVerified
      && programs.cpmm.programDataOwnerVerified
      && programs.cpmm.programDataSlotVerified
      && programs.cpmm.codeHashVerified
      && programs.cpmm.upgradeAuthorityVerified
      && platform.accountFound
      && platform.derivationVerified
      && platform.ownerVerified
      && platform.discriminatorVerified
      && platform.dataLengthVerified
      && reviewedPlatformLayoutIsWellFormed(config)
      && platform.treasuryAuthorityVerified
      && platform.lpAuthorityVerified
      && platform.feeDestinationVerified
      && authorities.treasury.accountFound
      && authorities.treasury.owner === config.treasuryAuthorityOwner
      && authorities.lp.accountFound
      && authorities.lp.owner === config.lpAuthorityOwner
      && authorities.feeDestination.accountFound
      && authorities.feeDestination.owner === config.platformFeeDestinationOwner
      && finalizedStateIsFresh
    ));
  if (!chainReady) blockers.push("Finalized Solana/Raydium read verification is incomplete.");
  const observedChainState = {
    cluster: config.cluster,
    genesisHash,
    programs: {
      launchLab: {
        id: programs.launchLab.id,
        executable: programs.launchLab.executable,
        owner: programs.launchLab.owner ?? null,
        programDataAddress: programs.launchLab.programDataAddress ?? null,
          programDataExecutable: programs.launchLab.programDataExecutableVerified,
          programDataOwner: programs.launchLab.programDataOwner ?? null,
        programDataSlot: programs.launchLab.programDataSlot ?? null,
        codeHash: programs.launchLab.codeHash ?? null,
        upgradeAuthority: programs.launchLab.upgradeAuthority ?? null,
      },
      cpmm: {
        id: programs.cpmm.id,
        executable: programs.cpmm.executable,
        owner: programs.cpmm.owner ?? null,
        programDataAddress: programs.cpmm.programDataAddress ?? null,
          programDataExecutable: programs.cpmm.programDataExecutableVerified,
          programDataOwner: programs.cpmm.programDataOwner ?? null,
        programDataSlot: programs.cpmm.programDataSlot ?? null,
        codeHash: programs.cpmm.codeHash ?? null,
        upgradeAuthority: programs.cpmm.upgradeAuthority ?? null,
      },
    },
    platform: {
      id: platform.id,
      owner: platform.owner ?? null,
      discriminator: platform.discriminatorVerified,
      dataLength: platform.dataLengthVerified,
      treasuryAuthority: platform.treasuryAuthority ?? null,
      lpAuthority: platform.lpAuthority ?? null,
      feeDestination: platform.feeDestination ?? null,
    },
    authorities: {
      treasury: { id: authorities.treasury.id, owner: authorities.treasury.owner ?? null },
      lp: { id: authorities.lp.id, owner: authorities.lp.owner ?? null },
      feeDestination: { id: authorities.feeDestination.id, owner: authorities.feeDestination.owner ?? null },
    },
  };
  const observedChainStateFingerprint = await finalizedStateFingerprint(observedChainState);
  if (config.cluster === "mainnet-beta") {
    const baseline = config.chainStateBaseline;
    const baselineMismatch = !baseline
      || baseline.chainStateFingerprint !== observedChainStateFingerprint
      || baseline.launchLab.programDataAddress !== programs.launchLab.programDataAddress
      || baseline.launchLab.codeFingerprint !== programs.launchLab.codeHash
      || baseline.launchLab.deployedSlot !== programs.launchLab.programDataSlot
      || baseline.launchLab.upgradeAuthority !== (programs.launchLab.upgradeAuthority ?? null)
      || baseline.cpmm.programDataAddress !== programs.cpmm.programDataAddress
      || baseline.cpmm.codeFingerprint !== programs.cpmm.codeHash
      || baseline.cpmm.deployedSlot !== programs.cpmm.programDataSlot
      || baseline.cpmm.upgradeAuthority !== (programs.cpmm.upgradeAuthority ?? null);
    if (baselineMismatch) {
      const message = "Finalized chain state does not match the signed reviewed baseline (ProgramData, code, or upgrade authority drift).";
      blockers.push(message);
      releaseRecord.blockers.push(message);
      releaseRecord.valid = false;
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  const activationEligible = config.cluster === "mainnet-beta"
    && chainReady
    && releaseRecord.valid
    && uniqueBlockers.length === 0;
  return {
    cluster: config.cluster,
    connected,
    genesisVerified,
    ...(genesisHash ? { genesisHash } : {}),
    programs,
    platform,
    authorities,
    releaseRecord,
    networkReady: chainReady,
    activationEligible,
    activation: activationEligible ? "eligible" : "not-eligible",
    blockers: uniqueBlockers,
    chainStateFingerprint: observedChainStateFingerprint,
    quoteAsset: SOLANA_QUOTE_ASSET,
    checkedAt: now.toISOString(),
  };
}