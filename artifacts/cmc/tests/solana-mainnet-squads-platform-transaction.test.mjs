import assert from "node:assert/strict";
import { test } from "node:test";
import * as multisig from "@sqds/multisig";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  CpmmConfigInfoLayout,
  toBN,
} from "@raydium-io/raydium-sdk-v2";
import {
  CMC_MAINNET_SQUADS_CREATOR,
  CMC_MAINNET_SQUADS_MEMBERS,
  CMC_MAINNET_SQUADS_PACKAGE_SHA256,
  CMC_MAINNET_SQUADS_PROGRAM_ID,
  CMC_MAINNET_SQUADS_TRANSACTION_INDEX,
  buildMainnetSquadsPlatformTransactionPackage,
  preflightMainnetSquadsPlatformTransaction,
} from "../src/lib/solana-mainnet-squads-platform-transaction.ts";
import {
  CMC_MAINNET_CPMM_CONFIG_ID,
  CMC_MAINNET_CPMM_PROGRAM_ID,
  CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
  CMC_MAINNET_PLATFORM_ID,
  CMC_MAINNET_SQUADS_MULTISIG,
  CMC_MAINNET_SQUADS_VAULT,
} from "../src/lib/solana-mainnet-platform-deployment.ts";

const UPGRADEABLE_LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const CPMM_DISCRIMINATOR = Uint8Array.from([
  0xda, 0xf4, 0x21, 0x68, 0xcb, 0xcb, 0x2b, 0x6f,
]);

function account(owner, data, {
  executable = false,
  lamports = 1,
} = {}) {
  return { owner, data, executable, lamports };
}

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

function multisigAccount({
  threshold = 2,
  transactionIndex = 1n,
  staleTransactionIndex = 1n,
  members = CMC_MAINNET_SQUADS_MEMBERS,
} = {}) {
  const value = multisig.accounts.Multisig.fromArgs({
    createKey: new PublicKey("CgyCegugwSzpNWv7hHH6Um1hfsVG48V3Q7hSeSCtf76R"),
    configAuthority: SystemProgram.programId,
    threshold,
    timeLock: 0,
    transactionIndex,
    staleTransactionIndex,
    rentCollector: null,
    bump: 255,
    members: members.map((key) => ({ key, permissions: { mask: 7 } })),
  });
  return account(CMC_MAINNET_SQUADS_PROGRAM_ID, value.serialize()[0]);
}

function programAccount(programDataAddress) {
  const data = Buffer.alloc(36);
  data.writeUInt32LE(2, 0);
  new PublicKey(programDataAddress).toBuffer().copy(data, 4);
  return account(UPGRADEABLE_LOADER_ID, data, { executable: true });
}

function driftedProgramData(baseline) {
  const hasAuthority = baseline.upgradeAuthority !== null;
  const data = Buffer.alloc((hasAuthority ? 45 : 13) + 4);
  data.writeUInt32LE(3, 0);
  data.writeBigUInt64LE(BigInt(baseline.deployedSlot), 4);
  data[12] = hasAuthority ? 1 : 0;
  if (baseline.upgradeAuthority) {
    new PublicKey(baseline.upgradeAuthority).toBuffer().copy(data, 13);
  }
  data.set([1, 2, 3, 4], hasAuthority ? 45 : 13);
  return account(UPGRADEABLE_LOADER_ID, data);
}

function connection({
  governance = multisigAccount(),
  existingTransaction = false,
  simulationError = { InstructionError: [4, { Custom: 1 }] },
  vaultBalance = 1_000_000,
  logs = [
    "Program log: Instruction: VaultTransactionExecute",
    "Program log: Instruction: CreatePlatformConfig",
  ],
} = {}) {
  const proof = buildMainnetSquadsPlatformTransactionPackage();
  const baselines = proof.manifest.programBaselines;
  const transactionPda = new PublicKey(proof.manifest.transactionPda);
  const proposalPda = new PublicKey(proof.manifest.proposalPda);
  const values = new Map([
    [CMC_MAINNET_SQUADS_PROGRAM_ID.toBase58(),
      programAccount(baselines.squads.programDataAddress)],
    [baselines.squads.programDataAddress, driftedProgramData(baselines.squads)],
    [CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58(),
      programAccount(baselines.launchLab.programDataAddress)],
    [baselines.launchLab.programDataAddress, driftedProgramData(baselines.launchLab)],
    [CMC_MAINNET_CPMM_PROGRAM_ID.toBase58(),
      programAccount(baselines.cpmm.programDataAddress)],
    [baselines.cpmm.programDataAddress, driftedProgramData(baselines.cpmm)],
    [CMC_MAINNET_SQUADS_MULTISIG.toBase58(), governance],
    [CMC_MAINNET_CPMM_CONFIG_ID.toBase58(),
      account(CMC_MAINNET_CPMM_PROGRAM_ID, reviewedCpmmData())],
    [CMC_MAINNET_SQUADS_CREATOR.toBase58(),
      account(SystemProgram.programId, new Uint8Array(), { lamports: 493_957_796 })],
    [CMC_MAINNET_SQUADS_VAULT.toBase58(),
      account(SystemProgram.programId, new Uint8Array(), { lamports: vaultBalance })],
  ]);
  if (existingTransaction) {
    values.set(transactionPda.toBase58(),
      account(CMC_MAINNET_SQUADS_PROGRAM_ID, new Uint8Array()));
  }
  return {
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getMultipleAccountsInfoAndContext: async (addresses, config) => {
      assert.equal(config.commitment, "finalized");
      return {
        context: { slot: 100 },
        value: addresses.map((address) => {
          if (address.equals(proposalPda) || address.equals(CMC_MAINNET_PLATFORM_ID)) return null;
          return values.get(address.toBase58()) ?? null;
        }),
      };
    },
    getMinimumBalanceForRentExemption: async () => 5_445_760,
    getLatestBlockhashAndContext: async (config) => {
      assert.deepEqual(config, { commitment: "finalized", minContextSlot: 100 });
      return {
        context: { slot: 101 },
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: 123,
        },
      };
    },
    simulateTransaction: async (transaction, config) => {
      assert.deepEqual(config, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "finalized",
        minContextSlot: 101,
      });
      assert.equal(transaction.message.header.numRequiredSignatures, 2);
      return {
        context: { slot: 102 },
        value: { err: simulationError, logs, unitsConsumed: 98_829 },
      };
    },
  };
}

test("pins one deterministic Squads v4 transaction, code baseline, and execution package", () => {
  const proof = buildMainnetSquadsPlatformTransactionPackage();
  assert.equal(proof.manifest.squadsProgramId, CMC_MAINNET_SQUADS_PROGRAM_ID.toBase58());
  assert.equal(proof.manifest.multisig, CMC_MAINNET_SQUADS_MULTISIG.toBase58());
  assert.equal(proof.manifest.vault, CMC_MAINNET_SQUADS_VAULT.toBase58());
  assert.equal(proof.manifest.creator, CMC_MAINNET_SQUADS_CREATOR.toBase58());
  assert.equal(proof.manifest.transactionIndex, CMC_MAINNET_SQUADS_TRANSACTION_INDEX.toString());
  assert.equal(proof.manifest.transactionPda, "CsbvYPaxVHcLaFsdy1WzQC8gAc79R8KCgkkZkPT7r9hp");
  assert.equal(proof.manifest.proposalPda, "A2aRNWxquB7NyftQ7XiHs5YpCSP46mJJtDLgHbt9QSiQ");
  assert.equal(Buffer.from(proof.vaultTransactionMessageBase64, "base64").length, 456);
  assert.equal(proof.vaultTransactionCreateInstruction.programId,
    CMC_MAINNET_SQUADS_PROGRAM_ID.toBase58());
  assert.equal(proof.executionInstruction.programId, CMC_MAINNET_SQUADS_PROGRAM_ID.toBase58());
  assert.match(proof.manifest.programBaselines.squads.codeSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    proof.canonicalPackageJson,
    JSON.stringify({
      manifest: proof.manifest,
      vaultTransactionMessageBase64: proof.vaultTransactionMessageBase64,
      vaultTransactionCreateInstruction: proof.vaultTransactionCreateInstruction,
      proposalCreateInstruction: proof.proposalCreateInstruction,
      executionInstruction: proof.executionInstruction,
    }),
  );
  assert.equal(proof.canonicalPackageSha256, CMC_MAINNET_SQUADS_PACKAGE_SHA256);
});

test("binds snapshot, blockhash, and simulation contexts and reaches the real CPI path", async () => {
  const result = await preflightMainnetSquadsPlatformTransaction(connection());
  assert.equal(result.snapshotSlot, 100);
  assert.equal(result.blockhashSlot, 101);
  assert.equal(result.simulationSlot, 102);
  assert.equal(result.lifecycleTransactionBytes, 1_110);
  assert.equal(result.simulationReachedSquadsExecution, true);
  assert.equal(result.simulationReachedRaydiumCreatePlatform, true);
  assert.equal(result.squadsExecutionSimulationPassed, false);
  assert.equal(result.safeToPropose, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("deployed code hash")));
  assert.ok(result.blockers.some((blocker) =>
    blocker.includes("needs 5445760 lamports for Platform rent")));
});

test("fails closed on governance, stale-index, program-code, and occupied-index drift", async () => {
  const drifted = await preflightMainnetSquadsPlatformTransaction(connection({
    governance: multisigAccount({ threshold: 1, staleTransactionIndex: 0n }),
    existingTransaction: true,
    simulationError: null,
    vaultBalance: 5_445_760,
  }));
  assert.equal(drifted.squadsExecutionSimulationPassed, false);
  assert.ok(drifted.blockers.some((blocker) => blocker.includes("threshold")));
  assert.ok(drifted.blockers.some((blocker) => blocker.includes("stale transaction index")));
  assert.ok(drifted.blockers.some((blocker) => blocker.includes("already exists")));
  assert.ok(drifted.blockers.filter((blocker) => blocker.includes("deployed code hash")).length >= 3);
});

test("rejects a cloned chain or blockhash context older than the snapshot", async () => {
  const wrongChain = connection();
  wrongChain.getGenesisHash = async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  await assert.rejects(
    preflightMainnetSquadsPlatformTransaction(wrongChain),
    /not connected to Solana mainnet-beta/,
  );

  const staleBlockhash = connection();
  staleBlockhash.getLatestBlockhashAndContext = async () => ({
    context: { slot: 99 },
    value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 123 },
  });
  await assert.rejects(
    preflightMainnetSquadsPlatformTransaction(staleBlockhash),
    /blockhash context predates/,
  );
});