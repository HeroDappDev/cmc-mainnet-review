import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  CpmmConfigInfoLayout,
  getPdaPlatformId,
  toBN,
} from "@raydium-io/raydium-sdk-v2";
import {
  PROGRAM_ID as SQUADS_PROGRAM_ID,
  generated as squadsGenerated,
} from "@sqds/multisig";
import {
  CMC_MAINNET_CPMM_CONFIG_ID,
  CMC_MAINNET_CPMM_PROGRAM_ID,
  CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
  CMC_MAINNET_PLATFORM_ID,
  CMC_MAINNET_PLATFORM_PDA_BUMP,
  CMC_MAINNET_PLATFORM_PDA_SEED,
  CMC_MAINNET_SQUADS_MULTISIG,
  CMC_MAINNET_SQUADS_VAULT,
  assertReviewedMainnetCpmmConfig,
  assertCanonicalMainnetFundingEvidence,
  assertMainnetSquadsProofFreshForProposal,
  assertCanonicalMainnetSquadsProof,
  buildMainnetPlatformDeploymentPackage,
  buildMainnetFundingEvidence,
  createMainnetSquadsProposal,
  preflightMainnetPlatformDeployment,
  proveMainnetPlatformDeployment,
  reconstructMainnetPlatformInstructions,
} from "../src/lib/solana-mainnet-platform-deployment.ts";
import {
  CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
  createControlledSquadsValidator,
} from "./fixtures/solana-validator/controlled-validator.mjs";

const UPGRADEABLE_LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const CPMM_DISCRIMINATOR = Uint8Array.from([
  0xda, 0xf4, 0x21, 0x68, 0xcb, 0xcb, 0x2b, 0x6f,
]);
const MEMBER_A = new PublicKey("5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf");
const MEMBER_B = new PublicKey("Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9");
const CREATOR = MEMBER_A;
const PROGRAM_DATA_LAUNCHLAB = new PublicKey(
  "Vote111111111111111111111111111111111111111",
);
const PROGRAM_DATA_CPMM = new PublicKey(
  "Stake11111111111111111111111111111111111111",
);
const MULTISIG_CREATE_KEY = new PublicKey(
  "CgyCegugwSzpNWv7hHH6Um1hfsVG48V3Q7hSeSCtf76R",
);
const CODE = Buffer.from("reviewed-deployed-code");
const DEPLOYED_SLOT = 987654;

function reviewedCpmmData() {
  const data = Buffer.alloc(CpmmConfigInfoLayout.span);
  CpmmConfigInfoLayout.encode({
    bump: 255,
    disableCreatePool: false,
    index: 0,
    tradeFeeRate: toBN(2_500),
    protocolFeeRate: toBN(120_000),
    fundFeeRate: toBN(40_000),
    createPoolFee: toBN(150_000_000),
    protocolOwner: new PublicKey("ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u"),
    fundOwner: new PublicKey("FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU"),
    creatorFeeRate: toBN(500),
    creatorFeeShareRate: toBN(0),
  }, data);
  data.set(CPMM_DISCRIMINATOR);
  return data;
}

function programData(address, authorityOption = 1, length = 45 + CODE.length) {
  const data = Buffer.alloc(length);
  data.writeUInt32LE(3, 0);
  data.writeBigUInt64LE(BigInt(DEPLOYED_SLOT), 4);
  data[12] = authorityOption;
  if (authorityOption === 1) data.set(MEMBER_B.toBytes(), 13);
  if (length >= 45 + CODE.length) data.set(CODE, 45);
  return { owner: UPGRADEABLE_LOADER_ID, executable: false, data };
}

function programAccount(programDataAddress) {
  const data = Buffer.alloc(36);
  data.writeUInt32LE(2, 0);
  data.set(programDataAddress.toBytes(), 4);
  return { owner: UPGRADEABLE_LOADER_ID, executable: true, data };
}

function multisigAccount(memberA = MEMBER_A, memberB = MEMBER_B, transactionIndex = 1n) {
  const [data] = squadsGenerated.Multisig.fromArgs({
    createKey: MULTISIG_CREATE_KEY,
    configAuthority: PublicKey.default,
    threshold: 2,
    timeLock: 0,
    transactionIndex,
    staleTransactionIndex: 0n,
    rentCollector: null,
    bump: 255,
    members: [
      { key: memberA, permissions: { mask: 7 } },
      { key: memberB, permissions: { mask: 7 } },
    ],
  }).serialize();
  return { owner: SQUADS_PROGRAM_ID, executable: false, data };
}

function baseline(programAddress, programDataAddress, upgradeAuthority = MEMBER_B.toBase58()) {
  return {
    programAddress: programAddress.toBase58(),
    programDataAddress: programDataAddress.toBase58(),
    codeFingerprint: createHash("sha256").update(CODE).digest("hex"),
    deployedSlot: DEPLOYED_SLOT,
    upgradeAuthority,
  };
}

function preflightConnection({
  multisig = multisigAccount(),
  platformExists = false,
  simulationError = null,
  unitsConsumed = 20_000,
  balances = 10_000_000,
  blockHeight = 100,
} = {}) {
  const commitments = [];
  return {
    commitments,
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getAccountInfo: async (address, commitment) => {
      commitments.push(commitment);
      if (address.equals(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID)) return programAccount(PROGRAM_DATA_LAUNCHLAB);
      if (address.equals(PROGRAM_DATA_LAUNCHLAB)) return programData(PROGRAM_DATA_LAUNCHLAB);
      if (address.equals(CMC_MAINNET_CPMM_PROGRAM_ID)) return programAccount(PROGRAM_DATA_CPMM);
      if (address.equals(PROGRAM_DATA_CPMM)) return programData(PROGRAM_DATA_CPMM);
      if (address.equals(CMC_MAINNET_CPMM_CONFIG_ID)) {
        return { owner: CMC_MAINNET_CPMM_PROGRAM_ID, data: reviewedCpmmData() };
      }
      if (address.equals(SQUADS_PROGRAM_ID)) return {
        owner: UPGRADEABLE_LOADER_ID,
        executable: true,
        data: new Uint8Array(),
      };
      if (address.equals(CMC_MAINNET_SQUADS_MULTISIG)) return multisig;
      if (address.equals(CMC_MAINNET_PLATFORM_ID) && platformExists) {
        return { owner: CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, data: new Uint8Array() };
      }
      return null;
    },
    getBalance: async (address) => balances instanceof Map
      ? (balances.get(address.toBase58()) ?? 0)
      : balances,
    getLatestBlockhash: async () => ({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 123,
    }),
    getBlockHeight: async () => blockHeight,
    getMinimumBalanceForRentExemption: async () => 500_000,
    getFeeForMessage: async () => ({ value: 5_000 }),
    simulateTransaction: async (_transaction, config) => {
      assert.deepEqual(config, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "finalized",
      });
      return { value: { err: simulationError, logs: [], unitsConsumed } };
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function controlledProposalHandoff(connection) {
  const validationStarted = deferred();
  const continueValidation = deferred();
  const originalGenesisHash = connection.getGenesisHash;
  let paused = false;
  connection.getGenesisHash = async () => {
    if (!paused) {
      paused = true;
      validationStarted.resolve();
      await continueValidation.promise;
    }
    return originalGenesisHash();
  };
  return { validationStarted, continueValidation };
}

async function attemptProposalHandoff(connection, proof, createdAccounts) {
  await assertMainnetSquadsProofFreshForProposal(connection, proof);
  createdAccounts.add(proof.transactionPda);
  createdAccounts.add(proof.proposalPda);
}

const options = {
  baseline: {
    launchLab: baseline(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, PROGRAM_DATA_LAUNCHLAB),
    cpmm: baseline(CMC_MAINNET_CPMM_PROGRAM_ID, PROGRAM_DATA_CPMM),
  },
  expectedMembers: [MEMBER_A, MEMBER_B],
  nextTransactionIndex: 2n,
  creator: CREATOR,
  rentPayer: CREATOR,
};

test("pins the live Platform PDA derivation", () => {
  const derived = getPdaPlatformId(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, CMC_MAINNET_SQUADS_VAULT);
  assert.equal(CMC_MAINNET_PLATFORM_PDA_SEED, "platform_config");
  assert.equal(derived.publicKey.toBase58(), CMC_MAINNET_PLATFORM_ID.toBase58());
  assert.equal(derived.nonce, CMC_MAINNET_PLATFORM_PDA_BUMP);
});

test("builds immutable payloads and canonical Squads proof", async () => {
  const deploymentPackage = buildMainnetPlatformDeploymentPackage();
  assert.equal(deploymentPackage.instructionPayloads.length, 3);
  assert.deepEqual(
    deploymentPackage.instructionPayloads.map(({ purpose }) => purpose),
    ["createPlatform", "setPlatformCpCreator", "setCurveRuleManager"],
  );
  assert.doesNotThrow(() => reconstructMainnetPlatformInstructions(deploymentPackage.instructionPayloads));
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  assert.equal(proof.nextTransactionIndex, "2");
  assert.equal(proof.vaultPda, CMC_MAINNET_SQUADS_VAULT.toBase58());
  assert.equal(proof.transactionPda.length, 44);
  assert.equal(proof.proofFingerprintSha256.length, 64);
  assert.equal(proof.lifecycleInstructionSequence.length, 6);
  assert.equal(proof.lifecycleFeeLamports, 5_000);
  assert.equal(proof.rentPayer, CREATOR.toBase58());
  assert.deepEqual(
    proof.lifecycleInstructionSequence.map((instruction) => instruction.programId),
    [
      SQUADS_PROGRAM_ID.toBase58(), SQUADS_PROGRAM_ID.toBase58(),
      SQUADS_PROGRAM_ID.toBase58(), SQUADS_PROGRAM_ID.toBase58(),
      SQUADS_PROGRAM_ID.toBase58(), SQUADS_PROGRAM_ID.toBase58(),
    ],
  );
  assert.ok(proof.lifecycleInstructionSequence[0].accounts.some(
    ({ pubkey, isSigner }) => pubkey === CREATOR.toBase58() && isSigner,
  ));
  assert.deepEqual(
    proof.lifecycleInstructionSequence.map(({ index }) => index),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(proof.lifecycleInstructionSequence[0].accounts.some(
    ({ pubkey }) => pubkey === proof.transactionPda,
  ));
  assert.ok(proof.lifecycleInstructionSequence[1].accounts.some(
    ({ pubkey }) => pubkey === proof.proposalPda,
  ));
  assert.ok(proof.lifecycleInstructionSequence[3].accounts.some(
    ({ pubkey, isSigner }) => pubkey === MEMBER_A.toBase58() && isSigner,
  ));
  assert.ok(proof.lifecycleInstructionSequence[4].accounts.some(
    ({ pubkey, isSigner }) => pubkey === MEMBER_B.toBase58() && isSigner,
  ));
  assert.ok(proof.lifecycleInstructionSequence[5].accounts.some(
    ({ pubkey }) => pubkey === proof.vaultPda,
  ));
  assert.equal(proof.finalizedState.launchLab.programDataAddress, PROGRAM_DATA_LAUNCHLAB.toBase58());
  assert.equal(proof.finalizedState.multisig.transactionIndex, "1");
  assert.ok(Buffer.from(proof.wrappedMessage.serializedBase64, "base64").length > 0);
});

test("rejects instruction bytes, metas, and ordering drift", () => {
  const payloads = buildMainnetPlatformDeploymentPackage().instructionPayloads;
  const changedBytes = structuredClone(payloads);
  changedBytes[0].dataBase64 = Buffer.from("changed").toString("base64");
  assert.throws(() => reconstructMainnetPlatformInstructions(changedBytes), /bytes/);
  const changedMeta = structuredClone(payloads);
  changedMeta[1].accounts[0].isWritable = !changedMeta[1].accounts[0].isWritable;
  assert.throws(() => reconstructMainnetPlatformInstructions(changedMeta), /meta/);
  const changedOrder = structuredClone(payloads).reverse();
  assert.throws(() => reconstructMainnetPlatformInstructions(changedOrder), /order/);
});

test("rejects member-set, vault, and transaction-index changes", async () => {
  await assert.rejects(
    proveMainnetPlatformDeployment(preflightConnection(), {
      ...options,
      expectedMembers: [MEMBER_A, new PublicKey("11111111111111111111111111111112")],
    }),
    /members/,
  );
  await assert.rejects(
    proveMainnetPlatformDeployment(preflightConnection(), {
      ...options,
      nextTransactionIndex: 3n,
    }),
    /transactionIndex/,
  );
  // The vault is derived inside the proof and is not accepted as caller input.
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  assert.equal(proof.vaultPda, CMC_MAINNET_SQUADS_VAULT.toBase58());
  assert.doesNotThrow(() => assertCanonicalMainnetSquadsProof(proof));
  const changedVault = { ...proof, vaultPda: MEMBER_B.toBase58() };
  assert.throws(() => assertCanonicalMainnetSquadsProof(changedVault), /(fields|vault)/);
});

test("baseline is independently checked at finalized commitment", async () => {
  const connection = preflightConnection();
  const result = await preflightMainnetPlatformDeployment(connection, options);
  assert.equal(result.readyToPropose, false);
  assert.equal(result.directInstructionSimulationPassed, true);
  assert.equal(result.lifecycleSimulation.err, null);
  assert.deepEqual(result.blockers, []);
  assert.ok(connection.commitments.length >= 4);
  assert.ok(connection.commitments.every((commitment) => commitment === "finalized"));
  await assert.rejects(
    proveMainnetPlatformDeployment(preflightConnection(), {
      ...options,
      baseline: {
        ...options.baseline,
        launchLab: { ...options.baseline.launchLab, codeFingerprint: "00".repeat(32) },
      },
    }),
    /fingerprint/,
  );
});

test("simulation failure, compute ceiling, and existing Platform remain blocked", async () => {
  const failed = await preflightMainnetPlatformDeployment(
    preflightConnection({ simulationError: { InstructionError: [0, { Custom: 1 }] } }),
    options,
  );
  assert.equal(failed.readyToPropose, false);
  assert.ok(failed.blockers.some((blocker) => blocker.includes("simulation failed")));
  const overCompute = await preflightMainnetPlatformDeployment(
    preflightConnection({ unitsConsumed: 99_999 }),
    { ...options, lifecycleComputeUnitCeiling: 1 },
  );
  assert.ok(overCompute.blockers.some((blocker) => blocker.includes("compute units")));
  const missingCompute = await preflightMainnetPlatformDeployment(
    preflightConnection({ unitsConsumed: null }),
    options,
  );
  assert.ok(missingCompute.blockers.some((blocker) => blocker.includes("compute-unit measurement")));
  const invalidCeiling = await preflightMainnetPlatformDeployment(
    preflightConnection(),
    { ...options, lifecycleComputeUnitCeiling: 0 },
  );
  assert.ok(invalidCeiling.blockers.some((blocker) => blocker.includes("positive safe integer")));
  const existing = await preflightMainnetPlatformDeployment(
    preflightConnection({ platformExists: true }),
    options,
  );
  assert.ok(existing.blockers.some((blocker) => blocker.includes("already exists")));
});

test("CPMM layout drift remains fail closed", () => {
  const valid = reviewedCpmmData();
  assert.doesNotThrow(() => assertReviewedMainnetCpmmConfig(valid));
  valid[11] = 1;
  assert.throws(() => assertReviewedMainnetCpmmConfig(valid), /reviewed mainnet CPMM config field/);
});

test("ProgramData None authority still hashes from fixed offset 45", async () => {
  const connection = preflightConnection();
  const original = connection.getAccountInfo;
  connection.getAccountInfo = async (address, commitment) => {
    const account = await original(address, commitment);
    if (address.equals(PROGRAM_DATA_LAUNCHLAB)) return programData(address, 0);
    return account;
  };
  const noneOptions = {
    ...options,
    baseline: {
      ...options.baseline,
      launchLab: baseline(CMC_MAINNET_LAUNCHLAB_PROGRAM_ID, PROGRAM_DATA_LAUNCHLAB, null),
    },
  };
  const proof = await proveMainnetPlatformDeployment(connection, noneOptions);
  assert.equal(proof.finalizedState.launchLab.upgradeAuthority, null);
});

test("ProgramData malformed option and short layout fail closed", async () => {
  for (const malformed of [2, 3]) {
    const connection = preflightConnection();
    const original = connection.getAccountInfo;
    connection.getAccountInfo = async (address, commitment) => {
      const account = await original(address, commitment);
      if (address.equals(PROGRAM_DATA_LAUNCHLAB)) return programData(address, malformed);
      return account;
    };
    await assert.rejects(
      proveMainnetPlatformDeployment(connection, options),
      /authority option|fingerprint/,
    );
  }
  const connection = preflightConnection();
  const original = connection.getAccountInfo;
  connection.getAccountInfo = async (address, commitment) => {
    const account = await original(address, commitment);
    if (address.equals(PROGRAM_DATA_LAUNCHLAB)) return programData(address, 0, 44);
    return account;
  };
  await assert.rejects(
    proveMainnetPlatformDeployment(connection, options),
    /ProgramData layout/,
  );
});

test("fingerprint binds finalized state and lifecycle sequence", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const tamperedState = {
    ...proof,
    finalizedState: {
      ...proof.finalizedState,
      multisig: { ...proof.finalizedState.multisig, threshold: 1 },
    },
  };
  assert.throws(() => assertCanonicalMainnetSquadsProof(tamperedState), /fields|finalized state/);
  const tamperedSequence = {
    ...proof,
    lifecycleInstructionSequence: proof.lifecycleInstructionSequence.slice().reverse(),
  };
  assert.throws(() => assertCanonicalMainnetSquadsProof(tamperedSequence), /fields/);
});

test("proposal handoff re-reads finalized state and accepts only a fresh proof", async () => {
  const connection = preflightConnection();
  const proof = await proveMainnetPlatformDeployment(connection, options);
  await assert.doesNotReject(
    assertMainnetSquadsProofFreshForProposal(connection, proof),
  );
  assert.ok(connection.commitments.every((commitment) => commitment === "finalized"));
});

test("proposal handoff rejects expired blockhash and advanced transaction index", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(
      preflightConnection({ blockHeight: proof.lastValidBlockHeight + 1 }),
      proof,
    ),
    /expired/,
  );
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(
      preflightConnection({ multisig: multisigAccount(MEMBER_A, MEMBER_B, 5n) }),
      proof,
    ),
    /fingerprint|transaction index/,
  );
});

test("proposal handoff races cannot create transaction or proposal accounts", async (t) => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);

  await t.test("finalized transaction index advances during validation", async () => {
    let transactionIndex = 4n;
    const connection = preflightConnection();
    const originalAccountInfo = connection.getAccountInfo;
    connection.getAccountInfo = async (address, commitment) => {
      if (address.equals(CMC_MAINNET_SQUADS_MULTISIG)) {
        await handoff.continueValidation.promise;
        return multisigAccount(MEMBER_A, MEMBER_B, transactionIndex);
      }
      return originalAccountInfo(address, commitment);
    };
    const handoff = controlledProposalHandoff(connection);
    const createdAccounts = new Set();
    const attempt = attemptProposalHandoff(connection, proof, createdAccounts);

    await handoff.validationStarted.promise;
    transactionIndex = 5n;
    handoff.continueValidation.resolve();

    await assert.rejects(attempt, /fingerprint|transaction index/);
    assert.deepEqual([...createdAccounts], []);
  });

  await t.test("reviewed blockhash expires during validation", async () => {
    let blockHeight = proof.lastValidBlockHeight;
    const connection = preflightConnection();
    const handoff = controlledProposalHandoff(connection);
    connection.getBlockHeight = async () => {
      await handoff.continueValidation.promise;
      return blockHeight;
    };
    const createdAccounts = new Set();
    const attempt = attemptProposalHandoff(connection, proof, createdAccounts);

    await handoff.validationStarted.promise;
    blockHeight = proof.lastValidBlockHeight + 1;
    handoff.continueValidation.resolve();

    await assert.rejects(attempt, /expired/);
    assert.deepEqual([...createdAccounts], []);
  });
});

test("proposal handoff rejects member, threshold, program, and proof fingerprint drift", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const changedMember = new PublicKey("11111111111111111111111111111112");
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(
      preflightConnection({ multisig: multisigAccount(MEMBER_A, changedMember) }),
      proof,
    ),
    /members/,
  );
  const thresholdDrift = multisigAccount();
  thresholdDrift.data[72] = 1;
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(
      preflightConnection({ multisig: thresholdDrift }),
      proof,
    ),
    /2-of-2|fingerprint/,
  );
  const programDrift = preflightConnection();
  const original = programDrift.getAccountInfo;
  programDrift.getAccountInfo = async (address, commitment) => {
    const account = await original(address, commitment);
    if (address.equals(PROGRAM_DATA_LAUNCHLAB)) {
      const drifted = programData(address);
      drifted.data[drifted.data.length - 1] ^= 1;
      return drifted;
    }
    return account;
  };
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(programDrift, proof),
    /fingerprint/,
  );
  await assert.rejects(
    assertMainnetSquadsProofFreshForProposal(
      preflightConnection(),
      { ...proof, proofFingerprintSha256: "00".repeat(32) },
    ),
    /fingerprint/,
  );
});

test("proposal creation can only reach its writer after an immediate fresh-proof check", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const submissions = [];
  const writer = {
    createProposalFromFreshProof: async (freshProof) => {
      submissions.push(freshProof);
      return freshProof.proposalPda;
    },
  };

  const proposalPda = await createMainnetSquadsProposal(
    preflightConnection(),
    proof,
    writer,
  );
  assert.equal(proposalPda, proof.proposalPda);
  assert.deepEqual(submissions, [proof]);

  await assert.rejects(
    createMainnetSquadsProposal(
      preflightConnection({ multisig: multisigAccount(MEMBER_A, MEMBER_B, 5n) }),
      proof,
      writer,
    ),
    /fingerprint|transaction index/,
  );
  assert.deepEqual(submissions, [proof]);
});

test("aggregates obligations when payer addresses overlap", async () => {
  const sameAddress = MEMBER_A.toBase58();
  const blocked = await preflightMainnetPlatformDeployment(
    preflightConnection({ balances: new Map([[sameAddress, 1_000_000]]) }),
    { ...options, executionPayer: MEMBER_A },
  );
  assert.ok(blocked.blockers.some((blocker) => blocker.includes("aggregate")));
});

test("produces fingerprinted funding evidence with exact shortfall and separate margin", async () => {
  const proof = await proveMainnetPlatformDeployment(
    preflightConnection({
      balances: new Map([
        [MEMBER_A.toBase58(), 2_000_000],
        [CMC_MAINNET_SQUADS_VAULT.toBase58(), 100_000],
      ]),
    }),
    { ...options, executionPayer: MEMBER_A },
  );
  const evidence = buildMainnetFundingEvidence(proof, {
    observedAt: "2026-09-15T12:00:00.000Z",
    safetyMarginLamports: 250_000,
    safetyMarginRationale: "Reviewed reserve for fee and rent drift between evidence and authorized execution.",
    safetyMarginPayer: CMC_MAINNET_SQUADS_VAULT,
  });
  assert.doesNotThrow(() => assertCanonicalMainnetFundingEvidence(evidence));
  assert.equal(evidence.exactMinimumFundingLamports, 400_000);
  assert.equal(evidence.recommendedFundingLamports, 650_000);
  assert.equal(evidence.safetyMargin.lamports, 250_000);
  assert.equal(evidence.authorizationBoundary,
    "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement");
  const creator = evidence.payerFunding.find(({ address }) => address === MEMBER_A.toBase58());
  assert.deepEqual(creator.components.map(({ kind }) => kind), [
    "squadsTransactionRent", "squadsProposalRent", "lifecycleFee",
  ]);
  const vault = evidence.payerFunding.find(
    ({ address }) => address === CMC_MAINNET_SQUADS_VAULT.toBase58(),
  );
  assert.equal(vault.exactMinimumFundingLamports, 400_000);
  assert.equal(vault.safetyMarginLamports, 250_000);
  assert.throws(
    () => assertCanonicalMainnetFundingEvidence({ ...evidence, recommendedFundingLamports: 1 }),
    /fingerprint/,
  );
});

test("funding evidence fails closed without exact fees or a justified margin", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  assert.throws(
    () => buildMainnetFundingEvidence(
      { ...proof, lifecycleFeeLamports: null },
      {
        observedAt: "2026-09-15T12:00:00.000Z",
        safetyMarginLamports: 0,
        safetyMarginRationale: "No margin.",
        safetyMarginPayer: CMC_MAINNET_SQUADS_VAULT,
      },
    ),
    /canonical evidence|exact finalized lifecycle fee/,
  );
  assert.throws(
    () => buildMainnetFundingEvidence(proof, {
      observedAt: "2026-09-15T12:00:00.000Z",
      safetyMarginLamports: 1,
      safetyMarginRationale: " ",
      safetyMarginPayer: CMC_MAINNET_SQUADS_VAULT,
    }),
    /rationale/,
  );
});

test("keeps distinct rent and execution payer obligations separate", async () => {
  const connection = preflightConnection({
    balances: new Map([
      [MEMBER_A.toBase58(), 1_000_000],
      [MEMBER_B.toBase58(), 5_000],
      [CMC_MAINNET_SQUADS_VAULT.toBase58(), 500_000],
    ]),
  });
  const result = await preflightMainnetPlatformDeployment(connection, {
    ...options,
    executionPayer: MEMBER_B,
  });
  assert.deepEqual(result.blockers, []);
});

test("funding evidence binds a distinct rent payer without signer-order inference", async () => {
  const rentPayer = new PublicKey("11111111111111111111111111111112");
  const proof = await proveMainnetPlatformDeployment(
    preflightConnection({
      balances: new Map([
        [rentPayer.toBase58(), 0],
        [MEMBER_B.toBase58(), 5_000],
        [CMC_MAINNET_SQUADS_VAULT.toBase58(), 500_000],
      ]),
    }),
    { ...options, rentPayer, executionPayer: MEMBER_B },
  );
  const evidence = buildMainnetFundingEvidence(proof, {
    observedAt: "2026-09-15T12:00:00.000Z",
    safetyMarginLamports: 0,
    safetyMarginRationale: "No additional margin in this payer-binding unit test.",
    safetyMarginPayer: rentPayer,
  });
  const payer = evidence.payerFunding.find(({ address }) => address === rentPayer.toBase58());
  assert.equal(proof.rentPayer, rentPayer.toBase58());
  assert.deepEqual(payer.components.map(({ kind }) => kind), [
    "squadsTransactionRent", "squadsProposalRent",
  ]);
  assert.equal(payer.obligationLamports, 1_000_000);
});

test("controlled validator executes the atomic Squads lifecycle through Raydium CPI", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const validator = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
  });

  assert.equal(
    CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
    "9b731506a0c6eca458ef3ada683465cccba2d30a5b07ec2354ab731870f646e2",
  );
  assert.equal(validator.snapshotSha256, CONTROLLED_VALIDATOR_SNAPSHOT_SHA256);
  assert.equal(validator.fixture.schemaVersion, 2);
  assert.deepEqual(validator.fixture.coverage.loadedPrograms, ["squads", "launchLab"]);
  assert.equal(
    validator.fixture.reviewedProgramBaselines.cpmm.codeSha256,
    "36537be95ba356056fa38b2847d928078c68bf6cd79b875c140e157e6452cc71",
  );
  assert.equal(validator.getAccount(new PublicKey(proof.transactionPda)), null);
  assert.equal(validator.getAccount(new PublicKey(proof.proposalPda)), null);
  const simulation = validator.simulateSerializedTransaction(proof.lifecycleTransactionBase64);
  assert.equal(simulation.err, null, simulation.logs.join("\n"));
  assert.ok(simulation.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} invoke`)));
  assert.ok(simulation.postAccounts.includes(proof.transactionPda));
  assert.ok(simulation.postAccounts.includes(proof.proposalPda));
  assert.equal(validator.getAccount(new PublicKey(proof.transactionPda)), null);
  assert.equal(validator.getAccount(new PublicKey(proof.proposalPda)), null);
});

test("controlled validator rejects lifecycle reordering and wrong execute metas", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const validator = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
  });

  const reordered = VersionedTransaction.deserialize(
    Buffer.from(proof.lifecycleTransactionBase64, "base64"),
  );
  [
    reordered.message.compiledInstructions[0],
    reordered.message.compiledInstructions[1],
  ] = [
    reordered.message.compiledInstructions[1],
    reordered.message.compiledInstructions[0],
  ];
  const reorderedResult = validator.simulateTransaction(reordered);
  assert.notEqual(reorderedResult.err, null);
  assert.ok(reorderedResult.logs.some((line) => line.includes("ProposalCreate")));
  assert.ok(!reorderedResult.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} invoke`)));

  const wrongMetas = VersionedTransaction.deserialize(
    Buffer.from(proof.lifecycleTransactionBase64, "base64"),
  );
  const execute = wrongMetas.message.compiledInstructions.at(-1);
  execute.accountKeyIndexes = execute.accountKeyIndexes.slice(0, -1);
  const wrongMetasResult = validator.simulateTransaction(wrongMetas);
  assert.notEqual(wrongMetasResult.err, null);
  assert.ok(wrongMetasResult.logs.some((line) => line.includes("VaultTransactionExecute")));
  assert.ok(!wrongMetasResult.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} success`)));
});

test("failed late Squads execution rolls back all temporary governance and payer state", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const successfulValidator = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
  });
  assert.equal(successfulValidator.getAccount(CMC_MAINNET_PLATFORM_ID), null);
  const committed = successfulValidator.sendSerializedTransaction(
    proof.lifecycleTransactionBase64,
  );
  assert.equal(committed.err, null, committed.logs.join("\n"));
  assert.notEqual(
    successfulValidator.getAccount(CMC_MAINNET_PLATFORM_ID),
    null,
    "stateful controlled-validator execution did not commit its successful Platform creation",
  );

  const validator = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
  });
  const transactionPda = new PublicKey(proof.transactionPda);
  const proposalPda = new PublicKey(proof.proposalPda);
  const observedAddresses = [
    CMC_MAINNET_SQUADS_MULTISIG,
    CMC_MAINNET_SQUADS_VAULT,
    MEMBER_A,
    MEMBER_B,
    CMC_MAINNET_CPMM_CONFIG_ID,
    CMC_MAINNET_PLATFORM_ID,
    transactionPda,
    proposalPda,
  ];
  const before = validator.snapshotAccounts(observedAddresses);
  assert.equal(before[proof.transactionPda], null);
  assert.equal(before[proof.proposalPda], null);
  assert.equal(before[CMC_MAINNET_PLATFORM_ID.toBase58()], null);

  const lateFailure = VersionedTransaction.deserialize(
    Buffer.from(proof.lifecycleTransactionBase64, "base64"),
  );
  const execute = lateFailure.message.compiledInstructions.at(-1);
  execute.accountKeyIndexes = execute.accountKeyIndexes.slice(0, -1);
  const result = validator.sendTransaction(lateFailure);

  assert.notEqual(result.err, null);
  assert.ok(result.logs.some((line) => line.includes("ProposalApprove")));
  assert.ok(result.logs.some((line) => line.includes("VaultTransactionExecute")));
  assert.ok(!result.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} success`)));
  const after = validator.snapshotAccounts(observedAddresses);
  const feePayer = MEMBER_A.toBase58();
  assert.equal(
    BigInt(before[feePayer].lamports) - BigInt(after[feePayer].lamports),
    10_000n,
    "failed stateful transaction did not charge exactly the expected protocol fee",
  );
  const { [feePayer]: beforeFeePayer, ...beforeRollbackState } = before;
  const { [feePayer]: afterFeePayer, ...afterRollbackState } = after;
  assert.deepEqual(
    { ...afterRollbackState, feePayerNonLamportState: {
      ...afterFeePayer,
      lamports: beforeFeePayer.lamports,
    } },
    { ...beforeRollbackState, feePayerNonLamportState: beforeFeePayer },
    "a failed atomic lifecycle changed committed governance, payer, vault, or Raydium state",
  );
});

test("controlled validator rejects insufficient rent and compute regressions", async () => {
  const proof = await proveMainnetPlatformDeployment(preflightConnection(), options);
  const underfunded = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
    signerBalance: 1n,
    vaultBalance: 1n,
  });
  const rentResult = underfunded.simulateSerializedTransaction(proof.lifecycleTransactionBase64);
  assert.notEqual(rentResult.err, null);
  assert.ok(!rentResult.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} success`)));

  const computeConstrained = await createControlledSquadsValidator({
    multisigAddress: CMC_MAINNET_SQUADS_MULTISIG,
    signerAddresses: [MEMBER_A, MEMBER_B],
    vaultAddress: CMC_MAINNET_SQUADS_VAULT,
    cpmmConfigAddress: CMC_MAINNET_CPMM_CONFIG_ID,
    computeUnitLimit: 50_000n,
  });
  const computeResult = computeConstrained.simulateSerializedTransaction(
    proof.lifecycleTransactionBase64,
  );
  assert.notEqual(computeResult.err, null);
  assert.ok(computeResult.unitsConsumed >= 50_000);
  assert.ok(!computeResult.logs.some((line) =>
    line.includes(`Program ${CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58()} success`)));
});