import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ComputeBudget,
  FailedTransactionMetadata,
  LiteSVM,
} from "litesvm";
import {
  CMC_MAINNET_SQUADS_PACKAGE_SHA256,
} from "../../../src/lib/solana-mainnet-squads-platform-transaction.ts";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  await readFile(join(FIXTURE_DIR, "manifest.json"), "utf8"),
);
const SNAPSHOT_LOCK = JSON.parse(
  await readFile(join(FIXTURE_DIR, "snapshot.lock.json"), "utf8"),
);
const DEFAULT_BALANCE = 20_000_000n;
export const CONTROLLED_VALIDATOR_SNAPSHOT_SHA256 =
  "9b731506a0c6eca458ef3ada683465cccba2d30a5b07ec2354ab731870f646e2";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function verifySnapshotIdentity() {
  assert.equal(MANIFEST.schemaVersion, 2, "controlled-validator schema version drifted");
  assert.equal(
    MANIFEST.snapshotId,
    "solana-mainnet-squads-platform-v1",
    "controlled-validator snapshot identity drifted",
  );
  assert.equal(MANIFEST.cluster, "mainnet-beta", "controlled-validator cluster drifted");
  assert.equal(
    MANIFEST.genesisHash,
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "controlled-validator genesis hash drifted",
  );
  assert.deepEqual(MANIFEST.toolchain, {
    litesvm: "0.5.0",
    squadsSdk: "2.1.4",
    raydiumSdk: "0.2.69-alpha",
  }, "controlled-validator toolchain drifted");
  assert.equal(
    MANIFEST.proofPackageSha256,
    CMC_MAINNET_SQUADS_PACKAGE_SHA256,
    "controlled-validator proof-package baseline drifted",
  );
  assert.equal(SNAPSHOT_LOCK.schemaVersion, 1, "snapshot lock schema version drifted");
  assert.equal(SNAPSHOT_LOCK.snapshotId, MANIFEST.snapshotId, "snapshot lock identity drifted");
  const manifestHash = sha256(JSON.stringify(canonicalize(MANIFEST)));
  assert.equal(
    manifestHash,
    CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
    "controlled-validator manifest changed without reviewed snapshot rotation",
  );
  assert.equal(
    SNAPSHOT_LOCK.manifestCanonicalSha256,
    CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
    "snapshot lock and reviewed source digest differ",
  );
}

verifySnapshotIdentity();

export async function verifyControlledValidatorSnapshot() {
  await Promise.all(MANIFEST.coverage.loadedPrograms.map(async (name) => {
    const fixture = MANIFEST.programs[name];
    const baseline = MANIFEST.reviewedProgramBaselines[name];
    assert.ok(fixture, `missing ${name} program manifest entry`);
    assert.ok(baseline, `missing ${name} reviewed ProgramData baseline`);
    assert.equal(
      fixture.programDataAddress,
      baseline.programDataAddress,
      `${name} fixture ProgramData address is not the reviewed baseline`,
    );
    assert.equal(
      fixture.deployedCodeSha256,
      baseline.codeSha256,
      `${name} fixture deployed-code hash is not the reviewed baseline`,
    );
    const bytes = await readFile(join(FIXTURE_DIR, `${name}.so`));
    assert.equal(bytes.length, fixture.bytes, `${name} program fixture length drifted`);
    assert.equal(sha256(bytes), fixture.sha256, `${name} program fixture hash drifted`);
    const prefix = Buffer.from(fixture.deployedCodePrefixHex, "hex");
    assert.equal(
      prefix.length,
      fixture.loadableElfOffset,
      `${name} deployed-code prefix does not match the reviewed ELF offset`,
    );
    const deployedCode = Buffer.concat([prefix, bytes]);
    assert.equal(
      deployedCode.length,
      fixture.deployedCodeBytes,
      `${name} reconstructed deployed-code length drifted`,
    );
    assert.equal(
      sha256(deployedCode),
      fixture.deployedCodeSha256,
      `${name} loadable fixture does not reconstruct the reviewed deployed code`,
    );
  }));
  for (const name of MANIFEST.coverage.seededAccounts) fixtureAccount(name);
  return Object.freeze({
    snapshotId: MANIFEST.snapshotId,
    snapshotSha256: CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
  });
}

async function loadReviewedProgram(svm, name) {
  const fixture = MANIFEST.programs[name];
  const bytes = await readFile(join(FIXTURE_DIR, `${name}.so`));
  assert.equal(bytes.length, fixture.bytes, `${name} program fixture length drifted`);
  assert.equal(sha256(bytes), fixture.sha256, `${name} program fixture hash drifted`);
  svm.addProgram(new PublicKey(fixture.programId), bytes);
}

function fixtureAccount(name) {
  const fixture = MANIFEST.accounts[name];
  const data = Buffer.from(fixture.dataBase64, "base64");
  assert.equal(sha256(data), fixture.sha256, `${name} account fixture hash drifted`);
  return {
    address: new PublicKey(fixture.address),
    account: {
      lamports: BigInt(fixture.lamports),
      data,
      owner: new PublicKey(fixture.owner),
      executable: fixture.executable,
      rentEpoch: 0n,
    },
  };
}

function systemAccount(lamports = DEFAULT_BALANCE) {
  return {
    lamports,
    data: new Uint8Array(),
    owner: SystemProgram.programId,
    executable: false,
    rentEpoch: 0n,
  };
}

function snapshotAccount(account) {
  if (account === null) return null;
  return Object.freeze({
    lamports: account.lamports.toString(),
    dataBase64: Buffer.from(account.data).toString("base64"),
    owner: account.owner.toBase58(),
    executable: account.executable,
    rentEpoch: account.rentEpoch.toString(),
  });
}

function simulationValue(result) {
  if (result instanceof FailedTransactionMetadata) {
    return {
      err: result.err(),
      logs: result.meta().logs(),
      unitsConsumed: Number(result.meta().computeUnitsConsumed()),
      postAccounts: [],
    };
  }
  const metadata = result.meta();
  return {
    err: null,
    logs: metadata.logs(),
    unitsConsumed: Number(metadata.computeUnitsConsumed()),
    postAccounts: result.postAccounts().map(([address]) => address.toBase58()),
  };
}

function transactionValue(result) {
  if (result instanceof FailedTransactionMetadata) {
    return {
      err: result.err(),
      logs: result.meta().logs(),
      unitsConsumed: Number(result.meta().computeUnitsConsumed()),
    };
  }
  return {
    err: null,
    logs: result.logs(),
    unitsConsumed: Number(result.computeUnitsConsumed()),
  };
}

/**
 * Reproducible in-process validator loaded with pinned mainnet program bytes.
 * simulateTransaction never commits its post-state to the validator.
 */
export async function createControlledSquadsValidator({
  multisigAddress,
  signerAddresses,
  vaultAddress,
  cpmmConfigAddress,
  signerBalance = DEFAULT_BALANCE,
  vaultBalance = DEFAULT_BALANCE,
  computeUnitLimit = 1_400_000n,
}) {
  await verifyControlledValidatorSnapshot();
  const computeBudget = new ComputeBudget();
  computeBudget.computeUnitLimit = computeUnitLimit;
  const svm = new LiteSVM()
    .withSigverify(false)
    .withBlockhashCheck(false)
    .withComputeBudget(computeBudget);

  await Promise.all([
    loadReviewedProgram(svm, "squads"),
    loadReviewedProgram(svm, "launchLab"),
  ]);

  const cpmmConfig = fixtureAccount("cpmmConfig");
  assert.equal(cpmmConfig.address.toBase58(), cpmmConfigAddress.toBase58());
  svm.setAccount(cpmmConfig.address, cpmmConfig.account);
  const multisig = fixtureAccount("multisig");
  assert.equal(multisig.address.toBase58(), multisigAddress.toBase58());
  svm.setAccount(multisig.address, multisig.account);
  for (const address of signerAddresses) {
    svm.setAccount(address, systemAccount(signerBalance));
  }
  svm.setAccount(vaultAddress, systemAccount(vaultBalance));

  return Object.freeze({
    fixture: MANIFEST,
    snapshotSha256: CONTROLLED_VALIDATOR_SNAPSHOT_SHA256,
    getAccount: (address) => svm.getAccount(address),
    snapshotAccounts: (addresses) => Object.freeze(Object.fromEntries(
      addresses.map((address) => [
        address.toBase58(),
        snapshotAccount(svm.getAccount(address)),
      ]),
    )),
    simulateTransaction: (transaction) =>
      simulationValue(svm.simulateTransaction(transaction)),
    simulateSerializedTransaction: (serialized) =>
      simulationValue(svm.simulateTransaction(
        VersionedTransaction.deserialize(Buffer.from(serialized, "base64")),
      )),
    sendTransaction: (transaction) =>
      transactionValue(svm.sendTransaction(transaction)),
    sendSerializedTransaction: (serialized) =>
      transactionValue(svm.sendTransaction(
        VersionedTransaction.deserialize(Buffer.from(serialized, "base64")),
      )),
  });
}