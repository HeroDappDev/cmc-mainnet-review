/**
 * Deterministic, unsigned Squads v4 proof package for the CMC Raydium Platform.
 *
 * This module intentionally exposes no proposal, signing, send, confirmation,
 * or execution function. It only constructs immutable serialized evidence and
 * simulates an unsigned, atomic lifecycle that is rolled back by Solana.
 */
import { createHash } from "node:crypto";
import { PlatformConfig } from "@raydium-io/raydium-sdk-v2";
import * as multisig from "@sqds/multisig";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
} from "@solana/web3.js";
import {
  CMC_MAINNET_CPMM_CONFIG_ID,
  CMC_MAINNET_CPMM_PROGRAM_ID,
  CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
  CMC_MAINNET_PLATFORM_ID,
  CMC_MAINNET_SQUADS_MULTISIG,
  CMC_MAINNET_SQUADS_VAULT,
  assertReviewedMainnetCpmmConfig,
  buildMainnetPlatformDeploymentPackage,
} from "./solana-mainnet-platform-deployment.ts";

export const CMC_MAINNET_SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
export const CMC_MAINNET_SQUADS_VAULT_INDEX = 0;
export const CMC_MAINNET_SQUADS_VAULT_BUMP = 255;
export const CMC_MAINNET_SQUADS_TRANSACTION_INDEX = 2n;
export const CMC_MAINNET_SQUADS_CREATOR = new PublicKey(
  "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
);
export const CMC_MAINNET_SQUADS_MEMBERS = Object.freeze([
  new PublicKey("5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf"),
  CMC_MAINNET_SQUADS_CREATOR,
]);
export const CMC_MAINNET_SQUADS_THRESHOLD = 2;
export const CMC_MAINNET_SQUADS_PERMISSION_MASK = 7;
export const CMC_MAINNET_SQUADS_MEMO = "CMC Raydium Platform deployment";
export const CMC_MAINNET_SQUADS_SDK_VERSION = "2.1.4";
export const CMC_MAINNET_RAYDIUM_PACKAGE_SHA256 =
  "b0bdff5cd774c353ef3b06a28595515f09264cbba1e912f78d03754636238b8a";
export const CMC_MAINNET_SQUADS_PACKAGE_SHA256 =
  "faf482baedd7c819ede1aa1690c78c59f7cb02e20b153b905870bf8178d796a3";

const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const PLACEHOLDER_BLOCKHASH = "11111111111111111111111111111111";
const UPGRADEABLE_LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

type ProgramBaseline = Readonly<{
  programDataAddress: string;
  deployedSlot: number;
  upgradeAuthority: string | null;
  codeSha256: string;
}>;

const REVIEWED_PROGRAM_BASELINES = Object.freeze({
  squads: Object.freeze({
    programDataAddress: "Fy3YMJCvwbAXUgUM5b91ucUVA3jYzwWLHL3MwBqKsh8n",
    deployedSlot: 302_582_236,
    upgradeAuthority: null,
    codeSha256: "00f38dd273a3809bba580b3feacd2cf35e0ce174d424852ab9a32a888eaf640e",
  }),
  launchLab: Object.freeze({
    programDataAddress: "D2QX47Tv2uhNNwFcnLCyJtLMZ4WGmc7eXxvyEmD6zNUh",
    deployedSlot: 446_221_802,
    upgradeAuthority: "FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK",
    codeSha256: "4c87da8e9fdeda6daf9d141e409577733d6248ae78f694557176fe2709a09657",
  }),
  cpmm: Object.freeze({
    programDataAddress: "DMawCQzbgNTmbzaESc7o6pvL1KAeetY8zA7jNpzntHhU",
    deployedSlot: 445_763_504,
    upgradeAuthority: "FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK",
    codeSha256: "36537be95ba356056fa38b2847d928078c68bf6cd79b875c140e157e6452cc71",
  }),
});

type SquadsAccountInfo = {
  owner: PublicKey;
  data: Uint8Array | Buffer;
  lamports: number;
  executable?: boolean;
};

export type MainnetSquadsProofConnection = {
  getGenesisHash(): Promise<string>;
  getMultipleAccountsInfoAndContext(
    addresses: PublicKey[],
    config: { commitment: "finalized"; minContextSlot?: number },
  ): Promise<{ context: { slot: number }; value: Array<SquadsAccountInfo | null> }>;
  getMinimumBalanceForRentExemption(
    size: number,
    commitment?: "finalized",
  ): Promise<number>;
  getLatestBlockhashAndContext(config: {
    commitment: "finalized";
    minContextSlot: number;
  }): Promise<{
    context: { slot: number };
    value: { blockhash: string; lastValidBlockHeight: number };
  }>;
  simulateTransaction(
    transaction: VersionedTransaction,
    config: {
      sigVerify: false;
      replaceRecentBlockhash: false;
      commitment: "finalized";
      minContextSlot: number;
    },
  ): Promise<{
    context: { slot: number };
    value: {
      err: unknown;
      logs?: string[] | null;
      unitsConsumed?: number;
    };
  }>;
};

type SerializedInstruction = Readonly<{
  programId: string;
  accounts: ReadonlyArray<Readonly<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>>;
  dataBase64: string;
}>;

type SquadsTransactionMessage = {
  numSigners: number;
  numWritableSigners: number;
  numWritableNonSigners: number;
  accountKeys: PublicKey[];
  instructions: Array<{
    programIdIndex: number;
    accountIndexes: Uint8Array;
    data: Uint8Array;
  }>;
  addressTableLookups: Array<{
    accountKey: PublicKey;
    writableIndexes: Uint8Array;
    readonlyIndexes: Uint8Array;
  }>;
};

export type MainnetSquadsPlatformTransactionPackage = Readonly<{
  manifest: Readonly<{
    version: 1;
    cluster: "mainnet-beta";
    executionBoundary: "unsigned-squads-v4-vault-transaction-proof";
    squadsSdkVersion: string;
    squadsProgramId: string;
    multisig: string;
    vault: string;
    vaultIndex: number;
    vaultBump: number;
    threshold: number;
    members: readonly string[];
    creator: string;
    transactionIndex: string;
    transactionPda: string;
    proposalPda: string;
    memo: string;
    raydiumInstructionPackageSha256: string;
    programBaselines: Readonly<{
      squads: ProgramBaseline;
      launchLab: ProgramBaseline;
      cpmm: ProgramBaseline;
    }>;
  }>;
  vaultTransactionMessageBase64: string;
  vaultTransactionCreateInstruction: SerializedInstruction;
  proposalCreateInstruction: SerializedInstruction;
  executionInstruction: SerializedInstruction;
  canonicalPackageJson: string;
  canonicalPackageSha256: string;
}>;

export type MainnetSquadsPlatformPreflightResult = Readonly<{
  package: MainnetSquadsPlatformTransactionPackage;
  governance: Readonly<{
    threshold: number;
    timeLock: number;
    transactionIndex: string;
    staleTransactionIndex: string;
    configAuthority: string;
    members: ReadonlyArray<Readonly<{ key: string; permissionsMask: number }>>;
  }>;
  creatorBalanceLamports: number;
  vaultBalanceLamports: number;
  platformRentLamports: number;
  snapshotSlot: number;
  blockhashSlot: number;
  simulationSlot: number;
  lastValidBlockHeight: number;
  lifecycleTransactionBytes: number;
  simulation: Readonly<{
    err: unknown;
    logs?: readonly string[] | null;
    unitsConsumed?: number;
  }>;
  simulationReachedSquadsExecution: boolean;
  simulationReachedRaydiumCreatePlatform: boolean;
  blockers: readonly string[];
  squadsExecutionSimulationPassed: boolean;
  safeToPropose: false;
}>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializeInstruction(instruction: TransactionInstruction): SerializedInstruction {
  return Object.freeze({
    programId: instruction.programId.toBase58(),
    accounts: Object.freeze(instruction.keys.map((key) => Object.freeze({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }))),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  });
}

function raydiumInstructions(): TransactionInstruction[] {
  return buildMainnetPlatformDeploymentPackage().instructionPayloads.map((payload) =>
    new TransactionInstruction({
      programId: new PublicKey(payload.programId),
      keys: payload.accounts.map((account) => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(payload.dataBase64, "base64"),
    }));
}

function decodeSquadsTransactionMessage(input: Uint8Array): SquadsTransactionMessage {
  const data = Buffer.from(input);
  let offset = 0;
  const takeU8 = (): number => {
    if (offset >= data.length) throw new Error("The Squads transaction message is truncated.");
    return data[offset++];
  };
  const takeU16 = (): number => {
    if (offset + 2 > data.length) throw new Error("The Squads transaction message is truncated.");
    const value = data.readUInt16LE(offset);
    offset += 2;
    return value;
  };
  const takeBytes = (length: number): Uint8Array => {
    if (offset + length > data.length) throw new Error("The Squads transaction message is truncated.");
    const value = Uint8Array.from(data.subarray(offset, offset + length));
    offset += length;
    return value;
  };
  const takePublicKey = (): PublicKey => new PublicKey(Uint8Array.from(takeBytes(32)));

  const message: SquadsTransactionMessage = {
    numSigners: takeU8(),
    numWritableSigners: takeU8(),
    numWritableNonSigners: takeU8(),
    accountKeys: Array.from({ length: takeU8() }, takePublicKey),
    instructions: [],
    addressTableLookups: [],
  };
  for (let index = 0, count = takeU8(); index < count; index += 1) {
    message.instructions.push({
      programIdIndex: takeU8(),
      accountIndexes: takeBytes(takeU8()),
      data: takeBytes(takeU16()),
    });
  }
  for (let index = 0, count = takeU8(); index < count; index += 1) {
    message.addressTableLookups.push({
      accountKey: takePublicKey(),
      writableIndexes: takeBytes(takeU8()),
      readonlyIndexes: takeBytes(takeU8()),
    });
  }
  if (offset !== data.length) throw new Error("The Squads transaction message has trailing bytes.");
  return message;
}

function buildInternalPackage(): {
  package: MainnetSquadsPlatformTransactionPackage;
  transactionMessage: TransactionMessage;
  createInstruction: TransactionInstruction;
  proposalInstruction: TransactionInstruction;
  executeInstruction: TransactionInstruction;
} {
  if (!multisig.PROGRAM_ID.equals(CMC_MAINNET_SQUADS_PROGRAM_ID)) {
    throw new Error("The pinned Squads SDK program ID does not match the reviewed v4 program.");
  }
  const raydiumPackage = buildMainnetPlatformDeploymentPackage();
  if (sha256(raydiumPackage.canonicalPackageJson) !== CMC_MAINNET_RAYDIUM_PACKAGE_SHA256) {
    throw new Error("The reviewed Raydium instruction package fingerprint has changed.");
  }
  const [vault, vaultBump] = multisig.getVaultPda({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    index: CMC_MAINNET_SQUADS_VAULT_INDEX,
  });
  if (!vault.equals(CMC_MAINNET_SQUADS_VAULT)
    || vaultBump !== CMC_MAINNET_SQUADS_VAULT_BUMP) {
    throw new Error("The reviewed Squads vault derivation has changed.");
  }
  const [transactionPda] = multisig.getTransactionPda({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    index: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
  });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
  });
  const transactionMessage = new TransactionMessage({
    payerKey: CMC_MAINNET_SQUADS_VAULT,
    recentBlockhash: PLACEHOLDER_BLOCKHASH,
    instructions: raydiumInstructions(),
  });
  const transactionMessageBytes =
    multisig.utils.transactionMessageToMultisigTransactionMessageBytes({
      message: transactionMessage,
      vaultPda: CMC_MAINNET_SQUADS_VAULT,
    });
  const wrappedMessage = decodeSquadsTransactionMessage(transactionMessageBytes);
  if (wrappedMessage.addressTableLookups.length !== 0) {
    throw new Error("The reviewed Squads transaction unexpectedly uses address lookup tables.");
  }
  const remainingAccounts = wrappedMessage.accountKeys.map((pubkey, index) => ({
    pubkey,
    isWritable: multisig.utils.isStaticWritableIndex(wrappedMessage, index),
    isSigner: multisig.utils.isSignerIndex(wrappedMessage, index)
      && !pubkey.equals(CMC_MAINNET_SQUADS_VAULT),
  }));
  const createInstruction = multisig.instructions.vaultTransactionCreate({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
    creator: CMC_MAINNET_SQUADS_CREATOR,
    rentPayer: CMC_MAINNET_SQUADS_CREATOR,
    vaultIndex: CMC_MAINNET_SQUADS_VAULT_INDEX,
    ephemeralSigners: 0,
    transactionMessage,
    memo: CMC_MAINNET_SQUADS_MEMO,
  });
  const proposalInstruction = multisig.instructions.proposalCreate({
    multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
    transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
    creator: CMC_MAINNET_SQUADS_CREATOR,
    rentPayer: CMC_MAINNET_SQUADS_CREATOR,
    isDraft: false,
  });
  const executeInstruction =
    multisig.generated.createVaultTransactionExecuteInstruction({
      multisig: CMC_MAINNET_SQUADS_MULTISIG,
      member: CMC_MAINNET_SQUADS_CREATOR,
      proposal: proposalPda,
      transaction: transactionPda,
      anchorRemainingAccounts: remainingAccounts,
    }, CMC_MAINNET_SQUADS_PROGRAM_ID);
  const manifest = Object.freeze({
    version: 1 as const,
    cluster: "mainnet-beta" as const,
    executionBoundary: "unsigned-squads-v4-vault-transaction-proof" as const,
    squadsSdkVersion: CMC_MAINNET_SQUADS_SDK_VERSION,
    squadsProgramId: CMC_MAINNET_SQUADS_PROGRAM_ID.toBase58(),
    multisig: CMC_MAINNET_SQUADS_MULTISIG.toBase58(),
    vault: CMC_MAINNET_SQUADS_VAULT.toBase58(),
    vaultIndex: CMC_MAINNET_SQUADS_VAULT_INDEX,
    vaultBump: CMC_MAINNET_SQUADS_VAULT_BUMP,
    threshold: CMC_MAINNET_SQUADS_THRESHOLD,
    members: Object.freeze(CMC_MAINNET_SQUADS_MEMBERS.map((member) => member.toBase58())),
    creator: CMC_MAINNET_SQUADS_CREATOR.toBase58(),
    transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX.toString(),
    transactionPda: transactionPda.toBase58(),
    proposalPda: proposalPda.toBase58(),
    memo: CMC_MAINNET_SQUADS_MEMO,
    raydiumInstructionPackageSha256: CMC_MAINNET_RAYDIUM_PACKAGE_SHA256,
    programBaselines: REVIEWED_PROGRAM_BASELINES,
  });
  const evidence = {
    manifest,
    vaultTransactionMessageBase64: Buffer.from(transactionMessageBytes).toString("base64"),
    vaultTransactionCreateInstruction: serializeInstruction(createInstruction),
    proposalCreateInstruction: serializeInstruction(proposalInstruction),
    executionInstruction: serializeInstruction(executeInstruction),
  };
  const canonicalPackageJson = JSON.stringify(evidence);
  const proofPackage = Object.freeze({
    ...evidence,
    canonicalPackageJson,
    canonicalPackageSha256: sha256(canonicalPackageJson),
  });
  if (proofPackage.canonicalPackageSha256 !== CMC_MAINNET_SQUADS_PACKAGE_SHA256) {
    throw new Error("The reviewed Squads transaction package fingerprint has changed.");
  }
  return {
    package: proofPackage,
    transactionMessage,
    createInstruction,
    proposalInstruction,
    executeInstruction,
  };
}

export function buildMainnetSquadsPlatformTransactionPackage():
MainnetSquadsPlatformTransactionPackage {
  return buildInternalPackage().package;
}

function asWeb3AccountInfo(account: SquadsAccountInfo): AccountInfo<Buffer> {
  return {
    executable: account.executable ?? false,
    owner: account.owner,
    lamports: account.lamports,
    rentEpoch: 0,
    data: Buffer.from(account.data),
  };
}

function bignumString(value: number | bigint | { toString(): string }): string {
  return value.toString();
}

function littleEndianU32(data: Buffer, offset: number): number | undefined {
  return offset >= 0 && offset + 4 <= data.length ? data.readUInt32LE(offset) : undefined;
}

function littleEndianU64(data: Buffer, offset: number): number | undefined {
  if (offset < 0 || offset + 8 > data.length) return undefined;
  const value = data.readBigUInt64LE(offset);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

function verifyProgramEvidence(
  label: string,
  programId: PublicKey,
  program: SquadsAccountInfo | null,
  programData: SquadsAccountInfo | null,
  baseline: ProgramBaseline,
  blockers: string[],
): void {
  if (!program
    || program.executable !== true
    || !program.owner.equals(UPGRADEABLE_LOADER_ID)) {
    blockers.push(`${label} program failed finalized executable-owner verification.`);
    return;
  }
  const programBytes = Buffer.from(program.data);
  const observedProgramData = littleEndianU32(programBytes, 0) === 2
    && programBytes.length >= 36
    ? new PublicKey(programBytes.subarray(4, 36)).toBase58()
    : undefined;
  if (observedProgramData !== baseline.programDataAddress) {
    blockers.push(`${label} ProgramData address does not match the reviewed baseline.`);
  }
  if (!programData
    || programData.executable === true
    || !programData.owner.equals(UPGRADEABLE_LOADER_ID)) {
    blockers.push(`${label} ProgramData failed finalized owner/executable verification.`);
    return;
  }
  const data = Buffer.from(programData.data);
  if (littleEndianU32(data, 0) !== 3) {
    blockers.push(`${label} ProgramData layout is invalid.`);
    return;
  }
  if (littleEndianU64(data, 4) !== baseline.deployedSlot) {
    blockers.push(`${label} deployed slot does not match the reviewed baseline.`);
  }
  const authorityOption = data[12];
  const codeOffset = authorityOption === 1 ? 45 : authorityOption === 0 ? 13 : undefined;
  const upgradeAuthority = authorityOption === 1 && data.length >= 45
    ? new PublicKey(data.subarray(13, 45)).toBase58()
    : authorityOption === 0 ? null : undefined;
  if (upgradeAuthority !== baseline.upgradeAuthority) {
    blockers.push(`${label} upgrade authority does not match the reviewed baseline.`);
  }
  if (codeOffset === undefined || codeOffset > data.length
    || sha256(data.subarray(codeOffset)) !== baseline.codeSha256) {
    blockers.push(`${label} deployed code hash does not match the reviewed baseline.`);
  }
  if (!programId.equals(CMC_MAINNET_SQUADS_PROGRAM_ID)
    && !programId.equals(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID)
    && !programId.equals(CMC_MAINNET_CPMM_PROGRAM_ID)) {
    blockers.push(`${label} program ID is not a pinned program.`);
  }
}

function immutableSimulation(value: {
  err: unknown;
  logs?: string[] | null;
  unitsConsumed?: number;
}): Readonly<{
  err: unknown;
  logs?: readonly string[] | null;
  unitsConsumed?: number;
}> {
  const deepFreeze = (input: unknown): unknown => {
    if (!input || typeof input !== "object" || Object.isFrozen(input)) return input;
    for (const child of Object.values(input)) deepFreeze(child);
    return Object.freeze(input);
  };
  const err = value.err === null || value.err === undefined
    ? value.err
    : JSON.parse(JSON.stringify(value.err)) as unknown;
  deepFreeze(err);
  return Object.freeze({
    err,
    ...(value.logs ? { logs: Object.freeze([...value.logs]) } : { logs: value.logs }),
    ...(value.unitsConsumed !== undefined ? { unitsConsumed: value.unitsConsumed } : {}),
  });
}

export async function preflightMainnetSquadsPlatformTransaction(
  connection: MainnetSquadsProofConnection,
): Promise<MainnetSquadsPlatformPreflightResult> {
  const internal = buildInternalPackage();
  const transactionPda = new PublicKey(internal.package.manifest.transactionPda);
  const proposalPda = new PublicKey(internal.package.manifest.proposalPda);
  const accountAddresses = [
    CMC_MAINNET_SQUADS_PROGRAM_ID,
    new PublicKey(REVIEWED_PROGRAM_BASELINES.squads.programDataAddress),
    CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
    new PublicKey(REVIEWED_PROGRAM_BASELINES.launchLab.programDataAddress),
    CMC_MAINNET_CPMM_PROGRAM_ID,
    new PublicKey(REVIEWED_PROGRAM_BASELINES.cpmm.programDataAddress),
    CMC_MAINNET_SQUADS_MULTISIG,
    transactionPda,
    proposalPda,
    CMC_MAINNET_CPMM_CONFIG_ID,
    CMC_MAINNET_PLATFORM_ID,
    CMC_MAINNET_SQUADS_CREATOR,
    CMC_MAINNET_SQUADS_VAULT,
  ];
  const [genesisHash, snapshot, platformRent] = await Promise.all([
    connection.getGenesisHash(),
    connection.getMultipleAccountsInfoAndContext(accountAddresses, {
      commitment: "finalized",
    }),
    connection.getMinimumBalanceForRentExemption(PlatformConfig.span, "finalized"),
  ]);
  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error("The Squads proof preflight is not connected to Solana mainnet-beta.");
  }
  if (!Number.isSafeInteger(snapshot.context.slot) || snapshot.context.slot < 0
    || snapshot.value.length !== accountAddresses.length) {
    throw new Error("The finalized Squads account snapshot is malformed.");
  }
  const snapshotSlot = snapshot.context.slot;
  const [
    squadsProgram,
    squadsProgramData,
    launchLabProgram,
    launchLabProgramData,
    cpmmProgram,
    cpmmProgramData,
    multisigAccount,
    existingTransaction,
    existingProposal,
    cpmmConfig,
    existingPlatform,
    creatorAccount,
    vaultAccount,
  ] = snapshot.value;
  const blockers: string[] = [];
  verifyProgramEvidence(
    "Squads v4",
    CMC_MAINNET_SQUADS_PROGRAM_ID,
    squadsProgram,
    squadsProgramData,
    REVIEWED_PROGRAM_BASELINES.squads,
    blockers,
  );
  verifyProgramEvidence(
    "LaunchLab",
    CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
    launchLabProgram,
    launchLabProgramData,
    REVIEWED_PROGRAM_BASELINES.launchLab,
    blockers,
  );
  verifyProgramEvidence(
    "CPMM",
    CMC_MAINNET_CPMM_PROGRAM_ID,
    cpmmProgram,
    cpmmProgramData,
    REVIEWED_PROGRAM_BASELINES.cpmm,
    blockers,
  );
  if (!cpmmConfig || !cpmmConfig.owner.equals(CMC_MAINNET_CPMM_PROGRAM_ID)) {
    throw new Error("The reviewed mainnet CPMM config is missing or has the wrong owner.");
  }
  assertReviewedMainnetCpmmConfig(cpmmConfig.data);
  if (existingPlatform) blockers.push("The reviewed Platform PDA already exists.");
  if (!multisigAccount || !multisigAccount.owner.equals(CMC_MAINNET_SQUADS_PROGRAM_ID)) {
    throw new Error("The reviewed Squads multisig is missing or has the wrong owner.");
  }
  const [governance] = multisig.accounts.Multisig.fromAccountInfo(
    asWeb3AccountInfo(multisigAccount),
  );
  const governanceMembers = governance.members.map((member) => Object.freeze({
    key: member.key.toBase58(),
    permissionsMask: member.permissions.mask,
  }));
  if (governance.threshold !== CMC_MAINNET_SQUADS_THRESHOLD) {
    blockers.push("The finalized Squads threshold is not the reviewed 2-of-2 threshold.");
  }
  if (governance.timeLock !== 0) {
    blockers.push("The finalized Squads time lock has changed from the reviewed value.");
  }
  if (!governance.configAuthority.equals(SystemProgram.programId)) {
    blockers.push("The finalized Squads config authority is not disabled.");
  }
  const expectedMembers = CMC_MAINNET_SQUADS_MEMBERS.map((member) => member.toBase58()).sort();
  const actualMembers = governanceMembers.map((member) => member.key).sort();
  if (actualMembers.length !== expectedMembers.length
    || actualMembers.some((member, index) => member !== expectedMembers[index])) {
    blockers.push("The finalized Squads member set does not match the reviewed members.");
  }
  if (governanceMembers.some(({ permissionsMask }) =>
    permissionsMask !== CMC_MAINNET_SQUADS_PERMISSION_MASK)) {
    blockers.push("One or more finalized Squads members lack the reviewed full permissions.");
  }
  if (bignumString(governance.transactionIndex) !== "1"
    || CMC_MAINNET_SQUADS_TRANSACTION_INDEX !== 2n) {
    blockers.push("Squads transaction index 2 is no longer the next available transaction.");
  }
  if (bignumString(governance.staleTransactionIndex) !== "1") {
    blockers.push("The finalized Squads stale transaction index has changed from the reviewed value.");
  }
  if (existingTransaction) blockers.push("Squads transaction index 2 already exists.");
  if (existingProposal) blockers.push("The proposal for Squads transaction index 2 already exists.");
  if (!creatorAccount) blockers.push("The reviewed Squads proposal creator account does not exist.");
  if (!vaultAccount) blockers.push("The reviewed Squads vault account does not exist.");
  const creatorBalance = creatorAccount?.lamports ?? 0;
  const vaultBalance = vaultAccount?.lamports ?? 0;
  if (vaultBalance < platformRent) {
    blockers.push(
      `The Squads vault needs ${platformRent} lamports for Platform rent; it currently has ${vaultBalance}.`,
    );
  }

  const secondMember = CMC_MAINNET_SQUADS_MEMBERS.find((member) =>
    !member.equals(CMC_MAINNET_SQUADS_CREATOR));
  if (!secondMember) throw new Error("The reviewed second Squads member is missing.");
  const lifecycleInstructions = [
    internal.createInstruction,
    internal.proposalInstruction,
    multisig.instructions.proposalApprove({
      multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
      transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
      member: CMC_MAINNET_SQUADS_CREATOR,
    }),
    multisig.instructions.proposalApprove({
      multisigPda: CMC_MAINNET_SQUADS_MULTISIG,
      transactionIndex: CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
      member: secondMember,
    }),
    internal.executeInstruction,
  ];
  const recent = await connection.getLatestBlockhashAndContext({
    commitment: "finalized",
    minContextSlot: snapshotSlot,
  });
  if (!Number.isSafeInteger(recent.context.slot) || recent.context.slot < snapshotSlot) {
    throw new Error("The finalized blockhash context predates the reviewed account snapshot.");
  }
  const message = new TransactionMessage({
    payerKey: CMC_MAINNET_SQUADS_CREATOR,
    recentBlockhash: recent.value.blockhash,
    instructions: lifecycleInstructions,
  }).compileToV0Message();
  if (message.header.numRequiredSignatures !== 2) {
    throw new Error("The unsigned Squads lifecycle no longer requires exactly both reviewed members.");
  }
  const transaction = new VersionedTransaction(message);
  const lifecycleTransactionBytes = transaction.serialize().length;
  if (lifecycleTransactionBytes > 1_232) {
    blockers.push("The unsigned atomic Squads lifecycle exceeds Solana's transaction size limit.");
  }
  const simulationResponse = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "finalized",
    minContextSlot: recent.context.slot,
  });
  if (!Number.isSafeInteger(simulationResponse.context.slot)
    || simulationResponse.context.slot < recent.context.slot) {
    throw new Error("The simulation context predates the finalized blockhash context.");
  }
  const simulation = simulationResponse.value;
  const logs = simulation.logs ?? [];
  const simulationReachedSquadsExecution = logs.some((log) =>
    log.includes("Instruction: VaultTransactionExecute"));
  const simulationReachedRaydiumCreatePlatform = logs.some((log) =>
    log.includes("Instruction: CreatePlatformConfig"));
  if (!simulationReachedSquadsExecution) {
    blockers.push("Unsigned lifecycle simulation did not reach Squads vault execution.");
  }
  if (!simulationReachedRaydiumCreatePlatform) {
    blockers.push("Unsigned lifecycle simulation did not reach Raydium Platform creation.");
  }
  if (simulation.err) {
    blockers.push(`Unsigned atomic Squads lifecycle simulation failed: ${JSON.stringify(simulation.err)}.`);
  }

  const frozenSimulation = immutableSimulation(simulation);
  return Object.freeze({
    package: internal.package,
    governance: Object.freeze({
      threshold: governance.threshold,
      timeLock: governance.timeLock,
      transactionIndex: bignumString(governance.transactionIndex),
      staleTransactionIndex: bignumString(governance.staleTransactionIndex),
      configAuthority: governance.configAuthority.toBase58(),
      members: Object.freeze(governanceMembers),
    }),
    creatorBalanceLamports: creatorBalance,
    vaultBalanceLamports: vaultBalance,
    platformRentLamports: platformRent,
    snapshotSlot,
    blockhashSlot: recent.context.slot,
    simulationSlot: simulationResponse.context.slot,
    lastValidBlockHeight: recent.value.lastValidBlockHeight,
    lifecycleTransactionBytes,
    simulation: frozenSimulation,
    simulationReachedSquadsExecution,
    simulationReachedRaydiumCreatePlatform,
    blockers: Object.freeze(blockers),
    squadsExecutionSimulationPassed: blockers.length === 0,
    safeToPropose: false,
  });
}