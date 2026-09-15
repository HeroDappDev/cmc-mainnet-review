/**
 * Read-only proof package for the CMC mainnet Platform deployment.
 *
 * This file deliberately has no signing, send, confirm, propose, or execute
 * operation.  A proof contains the exact Squads transaction which a separate
 * (and independently governed) client may eventually submit for review.
 */
import { createHash } from "node:crypto";
import {
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  type AccountMeta,
  type Message,
} from "@solana/web3.js";
import {
  PROGRAM_ID as SQUADS_PROGRAM_ID,
  accounts as squadsAccounts,
  generated as squadsGenerated,
  getProposalPda,
  getTransactionPda,
  getVaultPda,
  instructions as squadsInstructions,
  utils as squadsUtils,
} from "@sqds/multisig";
import {
  CpmmConfigInfoLayout,
  PlatformConfig,
  createPlatformConfig,
  getPdaPlatformId,
  toBN,
  updatePlatformConfig,
} from "@raydium-io/raydium-sdk-v2";

export const CMC_MAINNET_LAUNCHLAB_PROGRAM_ID = new PublicKey(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
);
export const CMC_MAINNET_CPMM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
);
export const CMC_MAINNET_CPMM_CONFIG_ID = new PublicKey(
  "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2",
);
export const CMC_MAINNET_SQUADS_MULTISIG = new PublicKey(
  "54BBLCExgxDZZdMVa5CYFdoHAMJSyeZFUppXiBo91uJN",
);
export const CMC_MAINNET_SQUADS_PROGRAM_ID = SQUADS_PROGRAM_ID;
export const CMC_MAINNET_SQUADS_VAULT = new PublicKey(
  "F2YSJfgpX76bCWqhAANfbp2gEhzUeTLvLHWxqZZAL5bG",
);
export const CMC_MAINNET_PLATFORM_ID = new PublicKey(
  "87PieZueSrA3VmuqJGQAF3KL8J56xy6etT3sQzA5CW5h",
);
export const CMC_MAINNET_PLATFORM_PDA_BUMP = 254;
export const CMC_MAINNET_PLATFORM_PDA_SEED = "platform_config";
export const CMC_MAINNET_PLATFORM_NAME = "Commodity Markets Capital";
export const CMC_MAINNET_PLATFORM_WEB = "https://commoditymarketscapital.app/";
export const CMC_MAINNET_PLATFORM_IMG =
  "https://commoditymarketscapital.app/images/cmc-logo.png";
export const CMC_MAINNET_PLATFORM_FEE_RATE = toBN(5_000);
export const CMC_MAINNET_CREATOR_FEE_RATE = toBN(0);
export const CMC_MAINNET_PLATFORM_SCALE = toBN(1_000_000);
export const CMC_MAINNET_CREATOR_SCALE = toBN(0);
export const CMC_MAINNET_BURN_SCALE = toBN(0);
export const CMC_MAINNET_PLATFORM_VESTING_SCALE = toBN(0);
export const SOLANA_MAINNET_GENESIS_HASH =
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES = 1232;
const UPGRADEABLE_LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const CPMM_AMM_CONFIG_DISCRIMINATOR = Uint8Array.from([
  0xda, 0xf4, 0x21, 0x68, 0xcb, 0xcb, 0x2b, 0x6f,
]);
const REVIEWED_CPMM_CONFIG = Object.freeze({
  bump: 255,
  disableCreatePool: false,
  index: 0,
  tradeFeeRate: "2500",
  protocolFeeRate: "120000",
  fundFeeRate: "40000",
  createPoolFee: "150000000",
  protocolOwner: "ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u",
  fundOwner: "FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU",
  creatorFeeRate: "500",
  creatorFeeShareRate: "0",
});

export type MainnetAccountInfo = {
  owner: PublicKey;
  data: Uint8Array | Buffer;
  executable?: boolean;
  lamports?: number;
};

export type MainnetProgramBaseline = Readonly<{
  /** The program address is bound as well as its ProgramData address. */
  programAddress: string;
  programDataAddress: string;
  /** SHA-256 of the deployed ELF bytes, lowercase hexadecimal. */
  codeFingerprint: string;
  deployedSlot: number;
  upgradeAuthority: string | null;
}>;

export type MainnetProgramBaselines = Readonly<{
  launchLab: MainnetProgramBaseline;
  cpmm: MainnetProgramBaseline;
}>;

export type MainnetFinalizedProgramObservation = Readonly<{
  address: string;
  owner: string;
  executable: boolean;
  baseline: MainnetProgramBaseline;
  programDataAddress: string;
  programDataOwner: string;
  programDataExecutable: boolean;
  deployedSlot: number;
  codeFingerprint: string;
  upgradeAuthority: string | null;
}>;

export type MainnetFinalizedState = Readonly<{
  genesisHash: string;
  launchLab: MainnetFinalizedProgramObservation;
  cpmm: MainnetFinalizedProgramObservation;
  squadsProgram: Readonly<{ address: string; owner: string; executable: boolean }>;
  multisig: Readonly<{
    address: string;
    owner: string;
    threshold: number;
    members: readonly Readonly<{ key: string; permissionsMask: number }>[];
    transactionIndex: string;
  }>;
  vault: Readonly<{ address: string; index: 0 }>;
}>;

export type MainnetPlatformPreflightConnection = {
  getGenesisHash(): Promise<string>;
  getAccountInfo(
    address: PublicKey,
    commitment?: "finalized",
  ): Promise<MainnetAccountInfo | null>;
  getBalance(address: PublicKey, commitment?: "finalized"): Promise<number>;
  getLatestBlockhash(commitment?: "finalized"): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }>;
  getBlockHeight(commitment?: "finalized"): Promise<number>;
  getMinimumBalanceForRentExemption(
    size: number,
    commitment?: "finalized",
  ): Promise<number>;
  getFeeForMessage?(
    message: Message | ReturnType<TransactionMessage["compileToV0Message"]>,
    commitment?: "finalized",
  ): Promise<{ value: number | null } | null>;
  simulateTransaction(
    transaction: VersionedTransaction,
    config: {
      sigVerify: false;
      replaceRecentBlockhash: false;
      commitment: "finalized";
    },
  ): Promise<{ value: { err: unknown; logs?: string[] | null; unitsConsumed?: number } }>;
};

export type MainnetPlatformInstructionPayload = Readonly<{
  index: number;
  purpose: "createPlatform" | "setPlatformCpCreator" | "setCurveRuleManager";
  programId: string;
  accounts: ReadonlyArray<Readonly<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>>;
  dataBase64: string;
}>;

export type MainnetPlatformDeploymentPackage = Readonly<{
  manifest: Readonly<{
    version: 1;
    cluster: "mainnet-beta";
    executionBoundary: "unsigned-raydium-instruction-payloads-for-squads-review";
    launchLabProgramId: string;
    cpmmProgramId: string;
    cpmmConfigId: string;
    squadsMultisig: string;
    squadsVault: string;
    platformId: string;
    platformPdaSeed: string;
    platformPdaBump: number;
    threshold: 2;
    memberCount: 2;
    metadata: Readonly<{ name: string; web: string; img: string }>;
    authorities: Readonly<Record<string, string>>;
    economics: Readonly<Record<string, string>>;
  }>;
  instructionPayloads: readonly MainnetPlatformInstructionPayload[];
  canonicalPackageJson: string;
}>;

type Simulation = Readonly<{
  err: unknown;
  logs?: string[] | null;
  unitsConsumed?: number;
}>;

export type MainnetSquadsProof = Readonly<{
  package: MainnetPlatformDeploymentPackage;
  expectedMembers: readonly string[];
  nextTransactionIndex: string;
  transactionPda: string;
  proposalPda: string;
  vaultPda: string;
  vaultIndex: 0;
  wrappedMessage: Readonly<{
    numSigners: number;
    numWritableSigners: number;
    numWritableNonSigners: number;
    accountKeys: readonly string[];
    instructions: readonly Readonly<{
      programIdIndex: number;
      accountIndexes: readonly number[];
      dataBase64: string;
    }>[];
    addressTableLookups: readonly unknown[];
    serializedBase64: string;
  }>;
  creationInstruction: MainnetPlatformInstructionPayload;
  executeInstruction: MainnetPlatformInstructionPayload;
  lifecycleInstructionSequence: readonly MainnetPlatformInstructionPayload[];
  lifecycleTransactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  canonicalProofJson: string;
  proofFingerprintSha256: string;
  creationRentLamports: number;
  proposalRentLamports: number;
  platformRentLamports: number;
  lifecycleFeeLamports: number | null;
  vaultBalanceLamports: number;
  rentPayerBalanceLamports: number;
  executionPayerBalanceLamports: number;
  executionMember: string;
  executionPayer: string;
  rentPayer: string;
  finalizedState: MainnetFinalizedState;
  obligations: readonly Readonly<{ address: string; lamports: number }>[];
  balances: readonly Readonly<{ address: string; lamports: number }>[];
}>;

export type MainnetFundingEvidence = Readonly<{
  evidenceVersion: 1;
  cluster: "mainnet-beta";
  observedAt: string;
  proofFingerprintSha256: string;
  finalizedState: MainnetFinalizedState;
  payerFunding: readonly Readonly<{
    address: string;
    balanceLamports: number;
    obligationLamports: number;
    exactMinimumFundingLamports: number;
    safetyMarginLamports: number;
    recommendedFundingLamports: number;
    components: readonly Readonly<{
      kind: "squadsTransactionRent" | "squadsProposalRent" | "platformRent" | "lifecycleFee";
      lamports: number;
    }>[];
  }>[];
  exactMinimumFundingLamports: number;
  safetyMargin: Readonly<{
    lamports: number;
    rationale: string;
  }>;
  recommendedFundingLamports: number;
  authorizationBoundary: "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement";
  canonicalEvidenceJson: string;
  evidenceFingerprintSha256: string;
}>;

export type MainnetSquadsReadonlySimulator = Readonly<{
  simulateLifecycle(): Promise<Simulation>;
}>;

/**
 * The only proposal-writing capability accepted by this module. The reviewed
 * proof is supplied by the boundary after it has been revalidated; callers
 * cannot provide serialized proof bytes directly to the writer.
 */
export type MainnetSquadsProposalWriter<Result> = Readonly<{
  createProposalFromFreshProof(proof: MainnetSquadsProof): Promise<Result>;
}>;

export type MainnetPlatformPreflightOptions = Readonly<{
  baseline: MainnetProgramBaselines;
  expectedMembers: readonly (string | PublicKey)[];
  nextTransactionIndex: bigint | number | string;
  creator: string | PublicKey;
  rentPayer: string | PublicKey;
  executionPayer?: string | PublicKey;
  executionMember?: string | PublicKey;
  lifecycleComputeUnitCeiling?: number;
}>;

export type MainnetPlatformPreflightResult = Readonly<{
  package: MainnetPlatformDeploymentPackage;
  proof: MainnetSquadsProof | null;
  squadsSimulation: MainnetSquadsReadonlySimulator | null;
  lifecycleSimulation: Simulation | null;
  blockers: readonly string[];
  /** Always false: this read-only operation never grants proposal readiness. */
  readyToPropose: false;
  directInstructionSimulationPassed: boolean;
  squadsExecutionPackageRequired: true;
  vaultBalanceLamports: number | null;
  rentPayerBalanceLamports: number | null;
  platformRentLamports: number | null;
}>;

/**
 * Checks proof-local invariants before a proof is handed to another review
 * system. This does not read or write the chain and cannot authorize a
 * proposal.
 */
export function assertCanonicalMainnetSquadsProof(proof: MainnetSquadsProof): void {
  if (sha256(Buffer.from(proof.canonicalProofJson)) !== proof.proofFingerprintSha256) {
    throw new Error("Squads proof fingerprint does not match its canonical evidence.");
  }
  const {
    canonicalProofJson: _canonicalProofJson,
    proofFingerprintSha256: _proofFingerprintSha256,
    ...proofEvidence
  } = proof;
  if (canonicalJson(proofEvidence) !== proof.canonicalProofJson) {
    throw new Error("Squads proof fields differ from its canonical evidence.");
  }
  const index = normalizeIndex(proof.nextTransactionIndex);
  const [vault] = getVaultPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, index: 0 });
  const [transaction] = getTransactionPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, index });
  const [proposal] = getProposalPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, transactionIndex: index });
  if (proof.vaultIndex !== 0 || proof.vaultPda !== vault.toBase58()) {
    throw new Error("Squads proof does not contain the pinned vault index-0 PDA.");
  }
  if (proof.transactionPda !== transaction.toBase58() || proof.proposalPda !== proposal.toBase58()) {
    throw new Error("Squads proof transaction or proposal PDA does not match its supplied index.");
  }
  if (proof.finalizedState.genesisHash !== SOLANA_MAINNET_GENESIS_HASH
    || proof.finalizedState.squadsProgram.address !== SQUADS_PROGRAM_ID.toBase58()
    || proof.finalizedState.squadsProgram.executable !== true
    || proof.finalizedState.squadsProgram.owner !== UPGRADEABLE_LOADER_ID.toBase58()
    || proof.finalizedState.multisig.address !== CMC_MAINNET_SQUADS_MULTISIG.toBase58()
    || proof.finalizedState.multisig.owner !== SQUADS_PROGRAM_ID.toBase58()
    || proof.finalizedState.multisig.threshold !== 2
    || proof.finalizedState.multisig.members.length !== 2
    || proof.finalizedState.multisig.transactionIndex !== (index - 1n).toString()
    || proof.finalizedState.vault.address !== vault.toBase58()
    || proof.finalizedState.vault.index !== 0) {
    throw new Error("Squads proof finalized state is not bound to the verified accounts.");
  }
  const stateMembers = proof.finalizedState.multisig.members;
  const expectedMembers = new Set(proof.expectedMembers);
  if (new Set(stateMembers.map((member) => member.key)).size !== 2
    || stateMembers.some((member) => !expectedMembers.has(member.key))
    || expectedMembers.size !== 2
    || stateMembers.some((member) => !Number.isInteger(member.permissionsMask)
      || member.permissionsMask < 0 || member.permissionsMask > 7)) {
    throw new Error("Squads proof finalized member keys or permissions are not bound to the exact set.");
  }
  for (const observation of [proof.finalizedState.launchLab, proof.finalizedState.cpmm]) {
    const expectedProgram = observation === proof.finalizedState.launchLab
      ? CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()
      : CMC_MAINNET_CPMM_PROGRAM_ID.toBase58();
    if (observation.address !== expectedProgram
      || observation.baseline.programAddress !== expectedProgram
      || observation.owner !== UPGRADEABLE_LOADER_ID.toBase58()
      || observation.executable !== true
      || observation.programDataOwner !== UPGRADEABLE_LOADER_ID.toBase58()
      || observation.programDataExecutable !== false
      || observation.programDataAddress !== observation.baseline.programDataAddress
      || observation.deployedSlot !== observation.baseline.deployedSlot
      || observation.codeFingerprint !== observation.baseline.codeFingerprint.replace(/^0x/, "").toLowerCase()
      || observation.upgradeAuthority !== observation.baseline.upgradeAuthority) {
      throw new Error("Squads proof finalized Program/ProgramData observation is not bound to its baseline.");
    }
  }
  if (proof.expectedMembers.length !== 2
    || new Set(proof.expectedMembers).size !== 2) {
    throw new Error("Squads proof does not contain an exact two-member set.");
  }
  if (proof.wrappedMessage.addressTableLookups.length !== 0
    || Buffer.from(proof.wrappedMessage.serializedBase64, "base64").length === 0) {
    throw new Error("Squads proof wrapped message is not canonical.");
  }
  if (Buffer.from(proof.lifecycleTransactionBase64, "base64").length > SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES) {
    throw new Error(`Squads serialized transaction exceeds ${SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES} bytes.`);
  }
  if (!proof.recentBlockhash || !Number.isSafeInteger(proof.lastValidBlockHeight)
    || proof.lastValidBlockHeight < 0) {
    throw new Error("Squads proof blockhash lifetime is malformed.");
  }
}

/**
 * Revalidates a reviewed proof against current finalized chain state at the
 * proposal boundary. Call this immediately before handing the proof bytes to
 * proposal creation; a prior successful proof is never sufficient.
 */
export async function assertMainnetSquadsProofFreshForProposal(
  connection: MainnetPlatformPreflightConnection,
  proof: MainnetSquadsProof,
): Promise<void> {
  assertCanonicalMainnetSquadsProof(proof);
  const expectedMembers = normalizeMembers(proof.expectedMembers);
  const [genesis, squadsProgram, multisigAccount, cpmmConfig, existingPlatform, blockHeight] =
    await Promise.all([
      connection.getGenesisHash(),
      connection.getAccountInfo(SQUADS_PROGRAM_ID, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_SQUADS_MULTISIG, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_CPMM_CONFIG_ID, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_PLATFORM_ID, "finalized"),
      connection.getBlockHeight("finalized"),
    ]);
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0) {
    throw new Error("Finalized block height is malformed at the Squads proposal boundary.");
  }
  if (blockHeight > proof.lastValidBlockHeight) {
    throw new Error("Reviewed Squads proof blockhash has expired.");
  }
  if (genesis !== SOLANA_MAINNET_GENESIS_HASH) {
    throw new Error("Squads proposal handoff is not connected to Solana mainnet-beta.");
  }
  const [launchLab, cpmm] = await Promise.all([
    verifyProgramBaseline(
      connection,
      CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
      proof.finalizedState.launchLab.baseline,
      "LaunchLab",
    ),
    verifyProgramBaseline(
      connection,
      CMC_MAINNET_CPMM_PROGRAM_ID,
      proof.finalizedState.cpmm.baseline,
      "CPMM",
    ),
  ]);
  const squadsState = assertSquadsState(squadsProgram, multisigAccount, expectedMembers);
  if (!cpmmConfig || !cpmmConfig.owner.equals(CMC_MAINNET_CPMM_PROGRAM_ID)) {
    throw new Error("The reviewed mainnet CPMM config is missing or has the wrong owner.");
  }
  assertReviewedMainnetCpmmConfig(accountBytes(cpmmConfig, "CPMM config"));
  if (existingPlatform) throw new Error("The reviewed Platform PDA already exists.");
  const freshState: MainnetFinalizedState = {
    genesisHash: genesis,
    launchLab,
    cpmm,
    squadsProgram: {
      address: SQUADS_PROGRAM_ID.toBase58(),
      owner: squadsProgram?.owner.toBase58() ?? "",
      executable: squadsProgram?.executable === true,
    },
    multisig: squadsState.observation,
    vault: proof.finalizedState.vault,
  };
  if (canonicalJson(freshState) !== canonicalJson(proof.finalizedState)) {
    throw new Error("Reviewed Squads proof fingerprint no longer matches current finalized governance and program state.");
  }
  if ((BigInt(squadsState.observation.transactionIndex) + 1n).toString()
    !== proof.nextTransactionIndex) {
    throw new Error("Reviewed Squads transaction index is no longer available.");
  }
}

/**
 * Fail-closed proposal creation boundary.
 *
 * Future Squads integrations must expose proposal creation through this
 * function rather than accepting proof bytes themselves. Validation is awaited
 * immediately before the writer is invoked, and the writer is never called
 * when canonical evidence, blockhash lifetime, or finalized chain state has
 * changed.
 */
export async function createMainnetSquadsProposal<Result>(
  connection: MainnetPlatformPreflightConnection,
  reviewedProof: MainnetSquadsProof,
  writer: MainnetSquadsProposalWriter<Result>,
): Promise<Result> {
  await assertMainnetSquadsProofFreshForProposal(connection, reviewedProof);
  return writer.createProposalFromFreshProof(reviewedProof);
}

function assertMetadataField(value: string, label: string, maximumBytes: number): void {
  const length = Buffer.byteLength(value, "utf8");
  if (length === 0 || length > maximumBytes) {
    throw new Error(`${label} must contain 1-${maximumBytes} UTF-8 bytes.`);
  }
}

function publicKey(value: string | PublicKey, label: string): PublicKey {
  try {
    return value instanceof PublicKey ? value : new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key.`);
  }
}

function instructionPayload(
  instruction: TransactionInstruction,
  index: number,
  purpose: MainnetPlatformInstructionPayload["purpose"],
): MainnetPlatformInstructionPayload {
  return Object.freeze({
    index,
    purpose,
    programId: instruction.programId.toBase58(),
    accounts: Object.freeze(instruction.keys.map((key) => Object.freeze({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }))),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  });
}

function assertReviewedPda(): void {
  const derived = getPdaPlatformId(
    CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
    CMC_MAINNET_SQUADS_VAULT,
  );
  if (!derived.publicKey.equals(CMC_MAINNET_PLATFORM_ID)
    || derived.nonce !== CMC_MAINNET_PLATFORM_PDA_BUMP) {
    throw new Error("The reviewed mainnet Platform PDA no longer matches the pinned SDK derivation.");
  }
}

export function assertReviewedMainnetCpmmConfig(data: Uint8Array): void {
  if (data.length !== CpmmConfigInfoLayout.span) {
    throw new Error("The mainnet CPMM config account data length does not match.");
  }
  if (!CPMM_AMM_CONFIG_DISCRIMINATOR.every((byte, index) => data[index] === byte)) {
    throw new Error("The mainnet CPMM config discriminator does not match.");
  }
  const decoded = CpmmConfigInfoLayout.decode(Buffer.from(data));
  const actual = {
    bump: decoded.bump,
    disableCreatePool: decoded.disableCreatePool,
    index: decoded.index,
    tradeFeeRate: decoded.tradeFeeRate.toString(),
    protocolFeeRate: decoded.protocolFeeRate.toString(),
    fundFeeRate: decoded.fundFeeRate.toString(),
    createPoolFee: decoded.createPoolFee.toString(),
    protocolOwner: decoded.protocolOwner.toBase58(),
    fundOwner: decoded.fundOwner.toBase58(),
    creatorFeeRate: decoded.creatorFeeRate.toString(),
    creatorFeeShareRate: decoded.creatorFeeShareRate.toString(),
  };
  for (const [field, expected] of Object.entries(REVIEWED_CPMM_CONFIG)) {
    if (actual[field as keyof typeof actual] !== expected) {
      throw new Error(`The reviewed mainnet CPMM config field ${field} does not match.`);
    }
  }
}

function buildMainnetPlatformInstructions(): readonly TransactionInstruction[] {
  const vault = CMC_MAINNET_SQUADS_VAULT;
  return [
    createPlatformConfig(
      CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, vault, vault, vault, vault,
      CMC_MAINNET_PLATFORM_ID, CMC_MAINNET_CPMM_CONFIG_ID, vault,
      { platformScale: CMC_MAINNET_PLATFORM_SCALE, creatorScale: CMC_MAINNET_CREATOR_SCALE, burnScale: CMC_MAINNET_BURN_SCALE },
      CMC_MAINNET_PLATFORM_FEE_RATE, CMC_MAINNET_CREATOR_FEE_RATE,
      CMC_MAINNET_PLATFORM_NAME, CMC_MAINNET_PLATFORM_WEB, CMC_MAINNET_PLATFORM_IMG,
      CMC_MAINNET_PLATFORM_VESTING_SCALE,
    ),
    updatePlatformConfig(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, vault, CMC_MAINNET_PLATFORM_ID,
      { type: "updatePlatformCpCreator", value: vault }),
    updatePlatformConfig(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, vault, CMC_MAINNET_PLATFORM_ID,
      { type: "updateCurveRuleManager", value: vault }),
  ];
}

function sameInstruction(actual: TransactionInstruction, expected: MainnetPlatformInstructionPayload): void {
  if (actual.programId.toBase58() !== expected.programId
    || Buffer.from(actual.data).toString("base64") !== expected.dataBase64
    || actual.keys.length !== expected.accounts.length) {
    throw new Error(`Immutable instruction ${expected.index} bytes or account count changed.`);
  }
  actual.keys.forEach((key, index) => {
    const expectedKey = expected.accounts[index];
    if (key.pubkey.toBase58() !== expectedKey.pubkey
      || key.isSigner !== expectedKey.isSigner
      || key.isWritable !== expectedKey.isWritable) {
      throw new Error(`Immutable instruction ${expected.index} account meta ${index} changed.`);
    }
  });
}

/**
 * Reconstructs, and byte-for-byte checks, the three immutable payloads.  This
 * is intentionally exported so an importer cannot silently substitute an
 * instruction while retaining the package fingerprint.
 */
export function reconstructMainnetPlatformInstructions(
  payloads: readonly MainnetPlatformInstructionPayload[],
): readonly TransactionInstruction[] {
  const expectedPurposes: MainnetPlatformInstructionPayload["purpose"][] = [
    "createPlatform", "setPlatformCpCreator", "setCurveRuleManager",
  ];
  if (payloads.length !== 3) throw new Error("Exactly three immutable Platform payloads are required.");
  const expected = buildMainnetPlatformInstructions();
  return payloads.map((payload, index) => {
    if (payload.index !== index || payload.purpose !== expectedPurposes[index]) {
      throw new Error("Platform payload order or purpose changed.");
    }
    const ix = new TransactionInstruction({
      programId: publicKey(payload.programId, `payload ${index} program`),
      keys: payload.accounts.map((account) => ({
        pubkey: publicKey(account.pubkey, `payload ${index} account`),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(payload.dataBase64, "base64"),
    });
    sameInstruction(ix, payload);
    sameInstruction(expected[index], payload);
    return ix;
  });
}

export function buildMainnetPlatformDeploymentPackage(): MainnetPlatformDeploymentPackage {
  assertReviewedPda();
  assertMetadataField(CMC_MAINNET_PLATFORM_NAME, "Platform name", 64);
  assertMetadataField(CMC_MAINNET_PLATFORM_WEB, "Platform website", 256);
  assertMetadataField(CMC_MAINNET_PLATFORM_IMG, "Platform image", 256);
  const vaultAddress = CMC_MAINNET_SQUADS_VAULT.toBase58();
  const instructions = buildMainnetPlatformInstructions();
  const manifest = Object.freeze({
    version: 1 as const,
    cluster: "mainnet-beta" as const,
    executionBoundary: "unsigned-raydium-instruction-payloads-for-squads-review" as const,
    launchLabProgramId: CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58(),
    cpmmProgramId: CMC_MAINNET_CPMM_PROGRAM_ID.toBase58(),
    cpmmConfigId: CMC_MAINNET_CPMM_CONFIG_ID.toBase58(),
    squadsMultisig: CMC_MAINNET_SQUADS_MULTISIG.toBase58(),
    squadsVault: vaultAddress,
    platformId: CMC_MAINNET_PLATFORM_ID.toBase58(),
    platformPdaSeed: CMC_MAINNET_PLATFORM_PDA_SEED,
    platformPdaBump: CMC_MAINNET_PLATFORM_PDA_BUMP,
    threshold: 2 as const,
    memberCount: 2 as const,
    metadata: Object.freeze({
      name: CMC_MAINNET_PLATFORM_NAME,
      web: CMC_MAINNET_PLATFORM_WEB,
      img: CMC_MAINNET_PLATFORM_IMG,
    }),
    authorities: Object.freeze({
      platformAdmin: vaultAddress, platformClaimFeeWallet: vaultAddress,
      platformLockNftWallet: vaultAddress, platformVestingWallet: vaultAddress,
      transferFeeExtensionAuth: vaultAddress, platformCpCreator: vaultAddress,
      curveRuleManager: vaultAddress,
    }),
    economics: Object.freeze({
      platformScale: CMC_MAINNET_PLATFORM_SCALE.toString(),
      creatorScale: CMC_MAINNET_CREATOR_SCALE.toString(),
      burnScale: CMC_MAINNET_BURN_SCALE.toString(),
      platformFeeRate: CMC_MAINNET_PLATFORM_FEE_RATE.toString(),
      creatorFeeRate: CMC_MAINNET_CREATOR_FEE_RATE.toString(),
      platformVestingScale: CMC_MAINNET_PLATFORM_VESTING_SCALE.toString(),
    }),
  });
  const instructionPayloads = Object.freeze([
    instructionPayload(instructions[0], 0, "createPlatform"),
    instructionPayload(instructions[1], 1, "setPlatformCpCreator"),
    instructionPayload(instructions[2], 2, "setCurveRuleManager"),
  ]);
  return Object.freeze({
    manifest,
    instructionPayloads,
    canonicalPackageJson: JSON.stringify({ manifest, instructionPayloads }),
  });
}

function accountBytes(account: MainnetAccountInfo | null, label: string): Uint8Array {
  if (!account) throw new Error(`${label} account was not found at finalized commitment.`);
  return account.data instanceof Uint8Array ? account.data : new Uint8Array(account.data);
}

function littleU32(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8)
    | ((data[offset + 2] ?? 0) << 16) | ((data[offset + 3] ?? 0) << 24);
}

function littleU64(data: Uint8Array, offset: number): number {
  const value = new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ProgramData deployed slot exceeds safe integer range.");
  return Number(value);
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

async function verifyProgramBaseline(
  connection: MainnetPlatformPreflightConnection,
  address: PublicKey,
  baseline: MainnetProgramBaseline,
  label: string,
): Promise<MainnetFinalizedProgramObservation> {
  if (baseline.programAddress !== address.toBase58()) {
    throw new Error(`${label} baseline program address is not the pinned address.`);
  }
  const program = await connection.getAccountInfo(address, "finalized");
  if (!program || program.executable !== true || !program.owner.equals(UPGRADEABLE_LOADER_ID)) {
    throw new Error(`${label} program failed finalized executable-owner verification.`);
  }
  const programDataBytes = accountBytes(program, label);
  if (programDataBytes.length < 36 || littleU32(programDataBytes, 0) !== 2) {
    throw new Error(`${label} Program account has no valid finalized ProgramData address.`);
  }
  const programDataAddress = new PublicKey(programDataBytes.slice(4, 36));
  if (programDataAddress.toBase58() !== baseline.programDataAddress) {
    throw new Error(`${label} ProgramData address does not match the independently supplied baseline.`);
  }
  const programData = await connection.getAccountInfo(programDataAddress, "finalized");
  if (!programData || programData.executable === true || !programData.owner.equals(UPGRADEABLE_LOADER_ID)) {
    throw new Error(`${label} ProgramData failed finalized owner/executable verification.`);
  }
  const data = accountBytes(programData, `${label} ProgramData`);
  if (data.length < 45 || littleU32(data, 0) !== 3) {
    throw new Error(`${label} ProgramData layout is invalid.`);
  }
  const deployedSlot = littleU64(data, 4);
  if (deployedSlot !== baseline.deployedSlot) {
    throw new Error(`${label} deployed slot does not match the independently supplied baseline.`);
  }
  const authorityOption = data[12];
  let authority: string | null;
  let codeOffset: number;
  if (authorityOption === 0) {
    authority = null;
    codeOffset = 13;
  } else if (authorityOption === 1 && data.length >= 45) {
    authority = new PublicKey(data.slice(13, 45)).toBase58();
    codeOffset = 45;
  } else {
    throw new Error(`${label} ProgramData authority option is malformed.`);
  }
  if (authority !== baseline.upgradeAuthority) {
    throw new Error(`${label} upgrade authority does not match the independently supplied baseline.`);
  }
  if (sha256(data.slice(45)).toLowerCase() !== baseline.codeFingerprint.toLowerCase().replace(/^0x/, "")) {
    throw new Error(`${label} deployed code fingerprint does not match the independently supplied baseline.`);
  }
  return Object.freeze({
    address: address.toBase58(),
    owner: program.owner.toBase58(),
    executable: program.executable === true,
    baseline,
    programDataAddress: programDataAddress.toBase58(),
    programDataOwner: programData.owner.toBase58(),
    programDataExecutable: Boolean(programData.executable),
    deployedSlot,
    codeFingerprint: sha256(data.slice(45)),
    upgradeAuthority: authority,
  });
}

function normalizeIndex(value: bigint | number | string): bigint {
  let index: bigint;
  try {
    index = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new Error("nextTransactionIndex must be an unsigned integer.");
  }
  if (index < 0n || index > 0xffffffffffffffffn) {
    throw new Error("nextTransactionIndex is outside the Squads u64 range.");
  }
  return index;
}

function normalizeMembers(members: readonly (string | PublicKey)[]): PublicKey[] {
  if (members.length !== 2) throw new Error("Exactly two independently supplied Squads members are required.");
  const normalized = members.map((member) => publicKey(member, "expected member"));
  if (new Set(normalized.map((member) => member.toBase58())).size !== 2) {
    throw new Error("The independently supplied Squads member set contains duplicates.");
  }
  return normalized;
}

function assertSquadsState(
  program: MainnetAccountInfo | null,
  multisig: MainnetAccountInfo | null,
  expectedMembers: readonly PublicKey[],
): {
  decoded: ReturnType<typeof squadsGenerated.Multisig.fromArgs>;
  observation: MainnetFinalizedState["multisig"];
} {
  if (!program || program.executable !== true || !program.owner.equals(UPGRADEABLE_LOADER_ID)) {
    throw new Error("Squads PROGRAM_ID failed finalized executable-owner verification.");
  }
  if (!multisig || !multisig.owner.equals(SQUADS_PROGRAM_ID) || multisig.executable === true) {
    throw new Error("The pinned Squads multisig is not a finalized Squads-owned account.");
  }
  let decoded: ReturnType<typeof squadsGenerated.Multisig.fromArgs>;
  try {
    decoded = squadsGenerated.Multisig.fromAccountInfo({
      data: Buffer.from(multisig.data),
      owner: multisig.owner,
      executable: false,
      lamports: multisig.lamports ?? 0,
    } as never)[0];
  } catch {
    throw new Error("The pinned Squads multisig could not be decoded as Multisig.");
  }
  if (decoded.threshold !== 2 || decoded.members.length !== 2) {
    throw new Error("The pinned Squads multisig is not exactly a 2-of-2 multisig.");
  }
  const actual = decoded.members.map((member) => member.key.toBase58());
  const expected = expectedMembers.map((member) => member.toBase58());
  if (new Set(actual).size !== 2 || actual.some((member) => !expected.includes(member))
    || expected.some((member) => !actual.includes(member))) {
    throw new Error("The finalized Squads members do not equal the independently supplied exact set.");
  }
  return {
    decoded,
    observation: Object.freeze({
      address: CMC_MAINNET_SQUADS_MULTISIG.toBase58(),
      owner: multisig.owner.toBase58(),
      threshold: decoded.threshold,
      members: Object.freeze(decoded.members.map((member) => Object.freeze({
        key: member.key.toBase58(),
        permissionsMask: member.permissions.mask,
      }))),
      transactionIndex: decoded.transactionIndex.toString(),
    }),
  };
}

function wrappedMessageFromCompiled(compiled: ReturnType<TransactionMessage["compileToV0Message"]>): squadsGenerated.VaultTransactionMessage {
  if (compiled.addressTableLookups.length !== 0) {
    throw new Error("Address lookup tables are not accepted in the canonical Platform proof.");
  }
  return {
    numSigners: compiled.header.numRequiredSignatures,
    numWritableSigners: compiled.header.numRequiredSignatures - compiled.header.numReadonlySignedAccounts,
    numWritableNonSigners: compiled.staticAccountKeys.length
      - compiled.header.numRequiredSignatures - compiled.header.numReadonlyUnsignedAccounts,
    accountKeys: compiled.staticAccountKeys,
    instructions: compiled.compiledInstructions.map((instruction) => ({
      programIdIndex: instruction.programIdIndex,
      accountIndexes: Uint8Array.from(instruction.accountKeyIndexes),
      data: Uint8Array.from(instruction.data),
    })),
    addressTableLookups: [],
  };
}

function accountMetasForWrappedMessage(message: squadsGenerated.VaultTransactionMessage, vault: PublicKey): AccountMeta[] {
  return message.accountKeys.map((key, index) => ({
    pubkey: key,
    isWritable: index < message.numWritableSigners
      || (index >= message.numSigners
        && index < message.numSigners + message.numWritableNonSigners),
    // Vault is a PDA and must never be presented as a transaction signer.
    isSigner: index < message.numSigners && !key.equals(vault),
  }));
}

function payloadForInstruction(ix: TransactionInstruction, index: number, purpose: "createPlatform" | "setPlatformCpCreator" | "setCurveRuleManager"): MainnetPlatformInstructionPayload {
  return instructionPayload(ix, index, purpose);
}

async function feeFor(
  connection: MainnetPlatformPreflightConnection,
  tx: VersionedTransaction,
): Promise<number | null> {
  if (!connection.getFeeForMessage) return null;
  const result = await connection.getFeeForMessage(tx.message, "finalized");
  return result?.value ?? null;
}

function canonicalJson(value: unknown): string {
  // Every object in this proof is assembled in a fixed order.  Replacing this
  // with JSON.stringify also prevents a caller-controlled property order.
  return JSON.stringify(value);
}

/**
 * Converts a fresh canonical proof into a funding-only evidence record.
 * The margin is reviewer-supplied and remains visibly separate from the exact
 * minimum. This function has no RPC, signing, proposal, or transfer capability.
 */
export function buildMainnetFundingEvidence(
  proof: MainnetSquadsProof,
  input: Readonly<{
    observedAt: string;
    safetyMarginLamports: number;
    safetyMarginRationale: string;
    safetyMarginPayer: string | PublicKey;
  }>,
): MainnetFundingEvidence {
  assertCanonicalMainnetSquadsProof(proof);
  if (proof.lifecycleFeeLamports === null) {
    throw new Error("Funding evidence requires an exact finalized lifecycle fee.");
  }
  const observedAt = new Date(input.observedAt);
  if (!input.observedAt || Number.isNaN(observedAt.getTime())
    || observedAt.toISOString() !== input.observedAt) {
    throw new Error("Funding evidence observedAt must be an exact ISO-8601 UTC timestamp.");
  }
  if (!Number.isSafeInteger(input.safetyMarginLamports) || input.safetyMarginLamports < 0) {
    throw new Error("Funding evidence safety margin must be a non-negative safe integer.");
  }
  const rationale = input.safetyMarginRationale.trim();
  if (!rationale) throw new Error("Funding evidence safety margin requires a review rationale.");
  const marginPayer = publicKey(input.safetyMarginPayer, "safetyMarginPayer").toBase58();
  const componentTotals = new Map<string, Array<{
    kind: "squadsTransactionRent" | "squadsProposalRent" | "platformRent" | "lifecycleFee";
    lamports: number;
  }>>();
  const addComponent = (
    address: string,
    kind: "squadsTransactionRent" | "squadsProposalRent" | "platformRent" | "lifecycleFee",
    lamports: number,
  ) => {
    if (!Number.isSafeInteger(lamports) || lamports < 0) {
      throw new Error(`Funding component ${kind} is not a non-negative safe integer.`);
    }
    componentTotals.set(address, [...(componentTotals.get(address) ?? []), { kind, lamports }]);
  };
  addComponent(proof.rentPayer, "squadsTransactionRent", proof.creationRentLamports);
  addComponent(proof.rentPayer, "squadsProposalRent", proof.proposalRentLamports);
  addComponent(proof.vaultPda, "platformRent", proof.platformRentLamports);
  addComponent(proof.executionPayer, "lifecycleFee", proof.lifecycleFeeLamports);
  if (!componentTotals.has(marginPayer)) {
    throw new Error("Safety-margin payer must be one of the proof's actual obligation payers.");
  }
  const payerFunding = [...componentTotals.entries()].map(([address, rawComponents]) => {
    const components = Object.freeze(rawComponents.map((component) => Object.freeze(component)));
    const obligationLamports = components.reduce((total, component) => total + component.lamports, 0);
    const proofObligation = proof.obligations.find((entry) => entry.address === address)?.lamports;
    if (proofObligation !== obligationLamports) {
      throw new Error(`Funding components do not match the canonical obligation for ${address}.`);
    }
    const balanceLamports = proof.balances.find((entry) => entry.address === address)?.lamports;
    if (balanceLamports === undefined) {
      throw new Error(`Canonical proof has no finalized balance for ${address}.`);
    }
    const exactMinimumFundingLamports = Math.max(0, obligationLamports - balanceLamports);
    const safetyMarginLamports = address === marginPayer ? input.safetyMarginLamports : 0;
    return Object.freeze({
      address,
      balanceLamports,
      obligationLamports,
      exactMinimumFundingLamports,
      safetyMarginLamports,
      recommendedFundingLamports: exactMinimumFundingLamports + safetyMarginLamports,
      components,
    });
  });
  const exactMinimumFundingLamports = payerFunding.reduce(
    (total, payer) => total + payer.exactMinimumFundingLamports, 0,
  );
  const evidenceWithoutFingerprint = {
    evidenceVersion: 1 as const,
    cluster: "mainnet-beta" as const,
    observedAt: input.observedAt,
    proofFingerprintSha256: proof.proofFingerprintSha256,
    finalizedState: proof.finalizedState,
    payerFunding: Object.freeze(payerFunding),
    exactMinimumFundingLamports,
    safetyMargin: Object.freeze({
      lamports: input.safetyMarginLamports,
      rationale,
    }),
    recommendedFundingLamports: exactMinimumFundingLamports + input.safetyMarginLamports,
    authorizationBoundary:
      "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement" as const,
  };
  const canonicalEvidenceJson = canonicalJson(evidenceWithoutFingerprint);
  return Object.freeze({
    ...evidenceWithoutFingerprint,
    canonicalEvidenceJson,
    evidenceFingerprintSha256: sha256(Buffer.from(canonicalEvidenceJson)),
  });
}

export function assertCanonicalMainnetFundingEvidence(evidence: MainnetFundingEvidence): void {
  const {
    canonicalEvidenceJson: _canonicalEvidenceJson,
    evidenceFingerprintSha256: _evidenceFingerprintSha256,
    ...withoutFingerprint
  } = evidence;
  if (canonicalJson(withoutFingerprint) !== evidence.canonicalEvidenceJson
    || sha256(Buffer.from(evidence.canonicalEvidenceJson)) !== evidence.evidenceFingerprintSha256) {
    throw new Error("Funding evidence fields or fingerprint do not match canonical evidence.");
  }
  if (evidence.authorizationBoundary
    !== "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement") {
    throw new Error("Funding evidence authorization boundary is missing.");
  }
}

/**
 * Builds the complete Squads proof and performs all finalized state checks.
 * It only reads RPC state and creates unsigned byte arrays.
 */
export async function proveMainnetPlatformDeployment(
  connection: MainnetPlatformPreflightConnection,
  options: MainnetPlatformPreflightOptions,
): Promise<MainnetSquadsProof> {
  const members = normalizeMembers(options.expectedMembers);
  const nextIndex = normalizeIndex(options.nextTransactionIndex);
  const creator = publicKey(options.creator, "creator");
  const rentPayer = publicKey(options.rentPayer, "rentPayer");
  const executionPayer = publicKey(options.executionPayer ?? options.rentPayer, "executionPayer");
  const executionMember = publicKey(options.executionMember ?? members[0], "executionMember");
  if (!members.some((member) => member.equals(creator))
    || !members.some((member) => member.equals(executionMember))) {
    throw new Error("Creator and execution member must be members of the independently supplied set.");
  }
  const deploymentPackage = buildMainnetPlatformDeploymentPackage();
  const [genesis, squadsProgram, multisigAccount, cpmmConfig, existingPlatform, recent] =
    await Promise.all([
      connection.getGenesisHash(),
      connection.getAccountInfo(SQUADS_PROGRAM_ID, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_SQUADS_MULTISIG, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_CPMM_CONFIG_ID, "finalized"),
      connection.getAccountInfo(CMC_MAINNET_PLATFORM_ID, "finalized"),
      connection.getLatestBlockhash("finalized"),
    ]);
  if (genesis !== SOLANA_MAINNET_GENESIS_HASH) throw new Error("The proof is not connected to Solana mainnet-beta.");
  const [launchLabObservation, cpmmObservation] = await Promise.all([
    verifyProgramBaseline(connection, CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, options.baseline.launchLab, "LaunchLab"),
    verifyProgramBaseline(connection, CMC_MAINNET_CPMM_PROGRAM_ID, options.baseline.cpmm, "CPMM"),
  ]);
  const squadsState = assertSquadsState(squadsProgram, multisigAccount, members);
  const multisig = squadsState.decoded;
  const decodedIndex = BigInt(multisig.transactionIndex.toString());
  if (nextIndex !== decodedIndex + 1n) {
    throw new Error("nextTransactionIndex must equal finalized multisig.transactionIndex + 1.");
  }
  if (!cpmmConfig || !cpmmConfig.owner.equals(CMC_MAINNET_CPMM_PROGRAM_ID)) {
    throw new Error("The reviewed mainnet CPMM config is missing or has the wrong owner.");
  }
  assertReviewedMainnetCpmmConfig(accountBytes(cpmmConfig, "CPMM config"));
  if (existingPlatform) throw new Error("The reviewed Platform PDA already exists.");
  const [vaultPda, vaultBump] = getVaultPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, index: 0 });
  if (!vaultPda.equals(CMC_MAINNET_SQUADS_VAULT)) throw new Error("Derived Squads vault index 0 is not the pinned vault.");
  const finalizedState: MainnetFinalizedState = Object.freeze({
    genesisHash: genesis,
    launchLab: launchLabObservation,
    cpmm: cpmmObservation,
    squadsProgram: Object.freeze({
      address: SQUADS_PROGRAM_ID.toBase58(),
      owner: squadsProgram?.owner.toBase58() ?? "",
      executable: squadsProgram?.executable === true,
    }),
    multisig: squadsState.observation,
    vault: Object.freeze({ address: vaultPda.toBase58(), index: 0 as const }),
  });
  const [transactionPda] = getTransactionPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, index: nextIndex });
  const [proposalPda] = getProposalPda({ multisigPda: CMC_MAINNET_SQUADS_MULTISIG, transactionIndex: nextIndex });
  const raydiumInstructions = reconstructMainnetPlatformInstructions(deploymentPackage.instructionPayloads);
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: recent.blockhash,
    instructions: [...raydiumInstructions],
  });
  const compiled = message.compileToV0Message();
  const wrapped = wrappedMessageFromCompiled(compiled);
  const wrappedBytes = squadsUtils.transactionMessageToMultisigTransactionMessageBytes({
    message,
    vaultPda,
  });
  const creationIx = squadsInstructions.vaultTransactionCreate({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    creator,
    rentPayer,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
  });
  const executeIx = squadsGenerated.createVaultTransactionExecuteInstruction({
    multisig: CMC_MAINNET_SQUADS_MULTISIG,
    proposal: proposalPda,
    transaction: transactionPda,
    member: executionMember,
    anchorRemainingAccounts: accountMetasForWrappedMessage(wrapped, vaultPda),
  });
  // Creation and execution must be simulated atomically: execute cannot find
  // transaction/proposal accounts created by a separate simulation.
  const proposalCreateIx = squadsInstructions.proposalCreate({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    creator,
    rentPayer,
    isDraft: true,
  });
  const proposalActivateIx = squadsInstructions.proposalActivate({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    member: members[0],
  });
  const proposalApproveA = squadsInstructions.proposalApprove({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    member: members[0],
  });
  const proposalApproveB = squadsInstructions.proposalApprove({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    member: members[1],
  });
  const lifecycleInstructions = [
    creationIx, proposalCreateIx, proposalActivateIx,
    proposalApproveA, proposalApproveB, executeIx,
  ];
  const lifecycleTx = new VersionedTransaction(new TransactionMessage({
    payerKey: executionPayer,
    recentBlockhash: recent.blockhash,
    instructions: lifecycleInstructions,
  }).compileToV0Message());
  const lifecycleSerialized = lifecycleTx.serialize();
  const lifecycleMessageSerialized = lifecycleTx.message.serialize();
  if (lifecycleSerialized.length > SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES
    || lifecycleMessageSerialized.length > SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES) {
    throw new Error(`Squads lifecycle serialized transaction exceeds ${SQUADS_MAX_SERIALIZED_TRANSACTION_BYTES} bytes.`);
  }
  const vaultTransactionMessage = {
    multisig: CMC_MAINNET_SQUADS_MULTISIG,
    creator,
    index: nextIndex,
    bump: 0,
    vaultIndex: 0,
    vaultBump,
    ephemeralSignerBumps: new Uint8Array(),
    message: wrapped,
  };
  const proposal = {
    multisig: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: nextIndex,
    status: { __kind: "Draft", timestamp: 0n } as const,
    bump: 0,
    // Proposal account allocation reserves the maximum exact-member vector
    // capacity for each vote state, not merely the initial empty lengths.
    approved: [...members],
    rejected: [...members],
    cancelled: [...members],
  };
  const [creationRentLamports, proposalRentLamports, platformRentLamports, lifecycleFeeLamports] =
    await Promise.all([
    connection.getMinimumBalanceForRentExemption(squadsGenerated.VaultTransaction.byteSize(vaultTransactionMessage as never), "finalized"),
    connection.getMinimumBalanceForRentExemption(squadsGenerated.Proposal.byteSize(proposal as never), "finalized"),
    connection.getMinimumBalanceForRentExemption(PlatformConfig.span, "finalized"),
    feeFor(connection, lifecycleTx),
  ]);
  const obligationTotals = new Map<string, number>();
  const addObligation = (address: PublicKey, lamports: number) => {
    const key = address.toBase58();
    obligationTotals.set(key, (obligationTotals.get(key) ?? 0) + lamports);
  };
  addObligation(rentPayer, creationRentLamports + proposalRentLamports);
  addObligation(executionPayer, lifecycleFeeLamports ?? Number.MAX_SAFE_INTEGER);
  addObligation(CMC_MAINNET_SQUADS_VAULT, platformRentLamports);
  const obligationAddresses = [...obligationTotals.keys()];
  const balanceValues = await Promise.all(obligationAddresses.map((address) =>
    connection.getBalance(new PublicKey(address), "finalized")));
  const balances = obligationAddresses.map((address, index) => Object.freeze({
    address,
    lamports: balanceValues[index],
  }));
  const balanceFor = (address: PublicKey): number =>
    balances.find((entry) => entry.address === address.toBase58())?.lamports ?? 0;
  const obligations = obligationAddresses.map((address) => Object.freeze({
    address,
    lamports: obligationTotals.get(address) ?? 0,
  }));
  const vaultBalanceLamports = balanceFor(CMC_MAINNET_SQUADS_VAULT);
  const rentPayerBalanceLamports = balanceFor(rentPayer);
  const executionPayerBalanceLamports = balanceFor(executionPayer);
  const proofWithoutFingerprint = {
    package: deploymentPackage,
    expectedMembers: members.map((member) => member.toBase58()),
    nextTransactionIndex: nextIndex.toString(),
    transactionPda: transactionPda.toBase58(),
    proposalPda: proposalPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    vaultIndex: 0 as const,
    wrappedMessage: {
      numSigners: wrapped.numSigners,
      numWritableSigners: wrapped.numWritableSigners,
      numWritableNonSigners: wrapped.numWritableNonSigners,
      accountKeys: wrapped.accountKeys.map((key) => key.toBase58()),
      instructions: wrapped.instructions.map((instruction) => ({
        programIdIndex: instruction.programIdIndex,
        accountIndexes: [...instruction.accountIndexes],
        dataBase64: Buffer.from(instruction.data).toString("base64"),
      })),
      addressTableLookups: [],
      serializedBase64: Buffer.from(wrappedBytes).toString("base64"),
    },
    creationInstruction: payloadForInstruction(creationIx, 0, "createPlatform"),
    executeInstruction: payloadForInstruction(executeIx, 0, "createPlatform"),
    lifecycleInstructionSequence: Object.freeze(lifecycleInstructions.map((instruction, index) =>
      payloadForInstruction(instruction, index, "createPlatform"))),
    lifecycleTransactionBase64: Buffer.from(lifecycleSerialized).toString("base64"),
    recentBlockhash: recent.blockhash,
    lastValidBlockHeight: recent.lastValidBlockHeight,
    creationRentLamports,
    proposalRentLamports,
    platformRentLamports,
    lifecycleFeeLamports,
    vaultBalanceLamports,
    rentPayerBalanceLamports,
    executionPayerBalanceLamports,
    executionMember: executionMember.toBase58(),
    executionPayer: executionPayer.toBase58(),
    rentPayer: rentPayer.toBase58(),
    finalizedState,
    obligations: Object.freeze(obligations),
    balances: Object.freeze(balances),
  };
  const canonicalProofJson = canonicalJson(proofWithoutFingerprint);
  const proof = Object.freeze({
    ...proofWithoutFingerprint,
    canonicalProofJson,
    proofFingerprintSha256: sha256(Buffer.from(canonicalProofJson)),
  });
  assertCanonicalMainnetSquadsProof(proof);
  return proof;
}

export function createMainnetSquadsReadonlySimulator(
  connection: MainnetPlatformPreflightConnection,
  proof: MainnetSquadsProof,
): MainnetSquadsReadonlySimulator {
  const lifecycle = VersionedTransaction.deserialize(Buffer.from(proof.lifecycleTransactionBase64, "base64"));
  return Object.freeze({
    simulateLifecycle: async () => (await connection.simulateTransaction(lifecycle, {
      sigVerify: false, replaceRecentBlockhash: false, commitment: "finalized",
    })).value,
  });
}

/**
 * Full preflight is intentionally not a readiness gate.  Even a successful
 * Squads-path simulation returns readyToPropose=false and exposes only a
 * read-only simulator.
 */
export async function preflightMainnetPlatformDeployment(
  connection: MainnetPlatformPreflightConnection,
  options: MainnetPlatformPreflightOptions,
): Promise<MainnetPlatformPreflightResult> {
  const deploymentPackage = buildMainnetPlatformDeploymentPackage();
  const blockers: string[] = [];
  let proof: MainnetSquadsProof | null = null;
  let simulator: MainnetSquadsReadonlySimulator | null = null;
  let lifecycleSimulation: Simulation | null = null;
  try {
    proof = await proveMainnetPlatformDeployment(connection, options);
    if (proof.lifecycleFeeLamports === null) {
      blockers.push("Finalized lifecycle fee could not be estimated.");
    }
    const lifecycleCeiling = options.lifecycleComputeUnitCeiling ?? 1_400_000;
    if (!Number.isSafeInteger(lifecycleCeiling) || lifecycleCeiling < 1) {
      blockers.push("Squads lifecycle compute-unit ceiling must be a positive safe integer.");
    }
    simulator = createMainnetSquadsReadonlySimulator(connection, proof);
    lifecycleSimulation = await simulator.simulateLifecycle();
    if (lifecycleSimulation.err) blockers.push(`Squads lifecycle simulation failed: ${JSON.stringify(lifecycleSimulation.err)}.`);
    if (!Number.isSafeInteger(lifecycleSimulation.unitsConsumed)
      || lifecycleSimulation.unitsConsumed! < 0) {
      blockers.push("Squads lifecycle simulation did not return a valid compute-unit measurement.");
    } else if (lifecycleSimulation.unitsConsumed! > lifecycleCeiling) {
      blockers.push("Squads lifecycle compute units exceed the configured ceiling.");
    }
    for (const obligation of proof.obligations) {
      const balance = proof.balances.find((entry) => entry.address === obligation.address)?.lamports ?? 0;
      if (balance < obligation.lamports) {
        blockers.push(`Balance for ${obligation.address} is insufficient for its aggregate ${obligation.lamports} lamport obligation (balance ${balance}).`);
      }
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
  return Object.freeze({
    package: deploymentPackage,
    proof,
    squadsSimulation: simulator,
    lifecycleSimulation,
    blockers: Object.freeze(blockers),
    readyToPropose: false,
    directInstructionSimulationPassed: lifecycleSimulation?.err === null,
    squadsExecutionPackageRequired: true,
    vaultBalanceLamports: proof?.vaultBalanceLamports ?? null,
    rentPayerBalanceLamports: proof?.rentPayerBalanceLamports ?? null,
    platformRentLamports: proof?.platformRentLamports ?? null,
  });
}