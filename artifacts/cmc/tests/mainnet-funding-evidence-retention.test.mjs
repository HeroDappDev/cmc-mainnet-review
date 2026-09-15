import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  listOrphanFundingEvidence,
  recoverOrphanFundingEvidence,
  reviewFundingEvidence,
  retainFundingEvidence,
  summarizeFundingEvidenceDrift,
  validateFundingEvidenceIndex,
} from "../scripts/mainnet-funding-evidence-retention.mjs";

const INDEX_BOUNDARY =
  "read-only-evidence-index-no-transfer-proposal-signing-submission-or-enablement";
const RECORD_BOUNDARY =
  "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement";

function evidence(overrides = {}) {
  return {
    observedAt: "2026-09-15T02:46:28.379Z",
    proofFingerprintSha256: "proof-a",
    finalizedState: { genesisHash: "mainnet", vault: { address: "vault" } },
    payerFunding: [{
      address: "payer",
      balanceLamports: 10,
      obligationLamports: 20,
      exactMinimumFundingLamports: 10,
      safetyMarginLamports: 2,
      recommendedFundingLamports: 12,
      components: [{ kind: "rent", lamports: 20 }],
    }],
    exactMinimumFundingLamports: 10,
    safetyMargin: { lamports: 2, rationale: "reviewed" },
    recommendedFundingLamports: 12,
    authorizationBoundary: RECORD_BOUNDARY,
    evidenceFingerprintSha256: "evidence-a",
    authorizationBoundary: "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement",
    ...overrides,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function runInterruptedRecovery({ indexPath, recordPath, fingerprint, action }) {
  const modulePath = resolve(
    import.meta.dirname,
    "../scripts/mainnet-funding-evidence-retention.mjs",
  );
  const script = `
    import { recoverOrphanFundingEvidence } from ${JSON.stringify(modulePath)};
    await recoverOrphanFundingEvidence({
      indexPath: ${JSON.stringify(indexPath)},
      recordPath: ${JSON.stringify(recordPath)},
      expectedEvidenceFingerprintSha256: ${JSON.stringify(fingerprint)},
      action: ${JSON.stringify(action)},
      recoveredAt: "2026-09-15T05:05:00.000Z",
      validateEvidence: () => {},
      onRecoveryMutationCommitted: () => process.exit(73),
    });
  `;
  return await new Promise((accept, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => accept(code));
  });
}

async function indexedEvidenceFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "funding-evidence-index-"));
  const recordPath = resolve(directory, "record.json");
  const indexPath = resolve(directory, "index.json");
  const record = evidence();
  const pointer = {
    path: "record.json",
    observedAt: record.observedAt,
    evidenceFingerprintSha256: record.evidenceFingerprintSha256,
  };
  const index = {
    indexVersion: 1,
    authorizationBoundary: INDEX_BOUNDARY,
    reviewedRecord: { ...pointer },
    latestObservation: { ...pointer },
  };
  await writeFile(recordPath, JSON.stringify(record));
  await writeFile(indexPath, JSON.stringify(index));
  return { index, indexPath, record, recordPath };
}

test("drift summary requires review for payer, amount, finalized state, and source proof changes", () => {
  const reviewed = evidence();
  const observed = evidence({
    proofFingerprintSha256: "proof-b",
    finalizedState: { genesisHash: "mainnet", vault: { address: "changed-vault" } },
    payerFunding: [{ ...reviewed.payerFunding[0], balanceLamports: 9 }],
    exactMinimumFundingLamports: 11,
    recommendedFundingLamports: 13,
  });
  const drift = summarizeFundingEvidenceDrift(reviewed, observed);
  assert.equal(drift.reviewRequired, true);
  assert.equal(drift.payerChanges.length, 1);
  assert.deepEqual(drift.amountChanges.map(({ field }) => field), [
    "exactMinimumFundingLamports",
    "recommendedFundingLamports",
  ]);
  assert.equal(drift.finalizedStateChange.changed, true);
  assert.equal(drift.sourceProofFingerprintChange.changed, true);
});

test("review promotion requires the exact immutable record and retains the prior pointer", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "funding-evidence-review-"));
  const reviewedPath = resolve(directory, "reviewed.json");
  const indexPath = resolve(directory, "index.json");
  await writeFile(reviewedPath, JSON.stringify(evidence()));
  const observed = evidence({
    observedAt: "2026-09-15T03:00:00.000Z",
    evidenceFingerprintSha256: "evidence-b",
  });
  const retained = await retainFundingEvidence({
    evidence: observed,
    indexPath,
    initialReviewedRecordPath: reviewedPath,
    validateEvidence: () => {},
  });

  const reviewed = await reviewFundingEvidence({
    indexPath,
    observationPath: retained.index.latestObservation.path,
    expectedEvidenceFingerprintSha256: "evidence-b",
    reviewedAt: "2026-09-15T04:00:00.000Z",
    validateEvidence: () => {},
  });
  assert.equal(reviewed.index.reviewedRecord.evidenceFingerprintSha256, "evidence-b");
  assert.equal(reviewed.index.reviewStatus, "matches-reviewed-record");
  assert.deepEqual(reviewed.index.reviewHistory, [{
    reviewedAt: "2026-09-15T04:00:00.000Z",
    priorReviewedRecord: retained.index.reviewedRecord,
    promotedRecord: retained.index.latestObservation,
  }]);
});

test("review promotion fails closed on fingerprint, boundary, path, or index tampering", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "funding-evidence-review-reject-"));
  const reviewedPath = resolve(directory, "reviewed.json");
  const indexPath = resolve(directory, "index.json");
  await writeFile(reviewedPath, JSON.stringify(evidence()));
  const retained = await retainFundingEvidence({
    evidence: evidence({
      observedAt: "2026-09-15T03:00:00.000Z",
      evidenceFingerprintSha256: "evidence-b",
    }),
    indexPath,
    initialReviewedRecordPath: reviewedPath,
    validateEvidence: () => {},
  });
  const originalIndex = await readFile(indexPath, "utf8");
  const base = {
    indexPath,
    observationPath: retained.index.latestObservation.path,
    expectedEvidenceFingerprintSha256: "wrong",
    validateEvidence: () => {},
  };
  await assert.rejects(reviewFundingEvidence(base), /fingerprint does not match/);
  await assert.rejects(reviewFundingEvidence({ ...base, observationPath: "reviewed.json" }), /immutable record/);

  const record = JSON.parse(await readFile(retained.recordPath, "utf8"));
  await writeFile(retained.recordPath, JSON.stringify({ ...record, authorizationBoundary: "can-transfer" }));
  await assert.rejects(reviewFundingEvidence({
    ...base,
    expectedEvidenceFingerprintSha256: "evidence-b",
  }), /read-only authorization boundary|no longer matches/);
  assert.equal(await readFile(indexPath, "utf8"), originalIndex);

  await writeFile(retained.recordPath, JSON.stringify(record));
  const index = JSON.parse(originalIndex);
  index.authorizationBoundary = "can-enable-mainnet";
  await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(reviewFundingEvidence({
    ...base,
    expectedEvidenceFingerprintSha256: "evidence-b",
  }), /invalid read-only authorization boundary/);
});

test("retention creates an immutable observation and preserves the reviewed pointer", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "funding-evidence-"));
  const reviewedPath = resolve(directory, "reviewed.json");
  const indexPath = resolve(directory, "index.json");
  await writeFile(reviewedPath, JSON.stringify(evidence()));

  const observed = evidence({
    observedAt: "2026-09-15T03:00:00.000Z",
    evidenceFingerprintSha256: "evidence-b",
    exactMinimumFundingLamports: 11,
  });
  const retained = await retainFundingEvidence({
    evidence: observed,
    indexPath,
    initialReviewedRecordPath: reviewedPath,
    validateEvidence: () => {},
  });
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.reviewedRecord.path, "reviewed.json");
  assert.equal(index.reviewedRecord.evidenceFingerprintSha256, "evidence-a");
  assert.equal(index.latestObservation.evidenceFingerprintSha256, "evidence-b");
  assert.equal(index.reviewStatus, "explicit-review-required");
  assert.deepEqual(JSON.parse(await readFile(retained.recordPath, "utf8")), observed);

  await assert.rejects(
    retainFundingEvidence({
      evidence: observed,
      indexPath,
      initialReviewedRecordPath: reviewedPath,
      validateEvidence: () => {},
    }),
    { code: "EEXIST" },
  );
});

test("retention rejects a changed reviewed record without advancing the index", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "funding-evidence-tamper-"));
  const reviewedPath = resolve(directory, "reviewed.json");
  const indexPath = resolve(directory, "index.json");
  await writeFile(reviewedPath, JSON.stringify(evidence()));
  const firstObservation = evidence({
    observedAt: "2026-09-15T03:00:00.000Z",
    evidenceFingerprintSha256: "evidence-b",
  });
  await retainFundingEvidence({
    evidence: firstObservation,
    indexPath,
    initialReviewedRecordPath: reviewedPath,
    validateEvidence: () => {},
  });
  const originalIndex = await readFile(indexPath, "utf8");

  await writeFile(reviewedPath, JSON.stringify(evidence({
    observedAt: "2026-09-15T03:30:00.000Z",
    evidenceFingerprintSha256: "tampered",
  })));
  let validations = 0;
  await assert.rejects(
    retainFundingEvidence({
      evidence: evidence({
        observedAt: "2026-09-15T04:00:00.000Z",
        evidenceFingerprintSha256: "evidence-c",
      }),
      indexPath,
      initialReviewedRecordPath: reviewedPath,
      validateEvidence: () => { validations += 1; },
    }),
    /no longer matches the stable index/,
  );
  assert.equal(validations, 2);
  assert.equal(await readFile(indexPath, "utf8"), originalIndex);
  await assert.rejects(
    readFile(resolve(
      directory,
      "solana-mainnet-vault-funding-proofs",
      "solana-mainnet-vault-funding-proof-2026-09-15T04-00-00.000Z-evidence-c.json",
    )),
    { code: "ENOENT" },
  );
});

test("repository funding evidence index resolves and validates without RPC access", async () => {
  const indexPath = resolve(
    import.meta.dirname,
    "../../../docs/evidence/solana-mainnet-vault-funding-proof-index.json",
  );
  const validated = await validateFundingEvidenceIndex({ indexPath });
  assert.equal(
    validated.index.reviewedRecord.observedAt,
    validated.records.reviewedRecord.evidence.observedAt,
  );
  assert.equal(
    validated.index.latestObservation.evidenceFingerprintSha256,
    validated.records.latestObservation.evidence.evidenceFingerprintSha256,
  );
  assert.deepEqual(validated.archiveInventory.orphanedRecords, []);
});

test("index validation inventories archived JSON and reports every unindexed record", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  await writeFile(resolve(archiveDirectory, "orphan-b.json"), JSON.stringify(evidence()));
  await writeFile(resolve(archiveDirectory, "orphan-a.json"), JSON.stringify(evidence()));
  await writeFile(resolve(archiveDirectory, "ignored.txt"), "not evidence");

  await assert.rejects(
    validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
    /unindexed orphan records: solana-mainnet-vault-funding-proofs\/orphan-a\.json, solana-mainnet-vault-funding-proofs\/orphan-b\.json/,
  );
});

test("orphan inventory reports paths, timestamps, and fingerprints", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-15T05:00:00.000Z",
    evidenceFingerprintSha256: "orphan-a",
  });
  await writeFile(resolve(archiveDirectory, "orphan.json"), JSON.stringify(orphan));
  const listed = await listOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(listed.orphanedRecords, [{
    path: "solana-mainnet-vault-funding-proofs/orphan.json",
    observedAt: orphan.observedAt,
    evidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
  }]);
});

test("orphan recovery attaches an exact canonical record without promoting review history", async () => {
  const fixture = await indexedEvidenceFixture();
  fixture.index.reviewStatus = "matches-reviewed-record";
  fixture.index.reviewHistory = [{
    reviewedAt: "2026-09-14T05:00:00.000Z",
    priorReviewedRecord: fixture.index.reviewedRecord,
    promotedRecord: fixture.index.reviewedRecord,
  }];
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const priorLatest = evidence({
    observedAt: "2026-09-15T04:00:00.000Z",
    evidenceFingerprintSha256: "prior-latest",
  });
  await writeFile(resolve(archiveDirectory, "prior-latest.json"), JSON.stringify(priorLatest));
  fixture.index.latestObservation = {
    path: "solana-mainnet-vault-funding-proofs/prior-latest.json",
    observedAt: priorLatest.observedAt,
    evidenceFingerprintSha256: priorLatest.evidenceFingerprintSha256,
  };
  await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
  const orphan = evidence({
    observedAt: "2026-09-15T05:00:00.000Z",
    evidenceFingerprintSha256: "b".repeat(64),
    exactMinimumFundingLamports: 11,
  });
  const orphanPath = resolve(archiveDirectory, "orphan.json");
  await writeFile(orphanPath, JSON.stringify(orphan));
  const originalIndexJson = await readFile(fixture.indexPath, "utf8");

  const recovered = await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: "b".repeat(64),
    recoveredAt: "2026-09-15T05:01:00.000Z",
    validateEvidence: () => {},
  });
  assert.deepEqual(recovered.index.reviewedRecord, fixture.index.reviewedRecord);
  assert.deepEqual(recovered.index.reviewHistory, fixture.index.reviewHistory);
  assert.equal(recovered.index.latestObservation.evidenceFingerprintSha256, "b".repeat(64));
  assert.equal(recovered.index.reviewStatus, "explicit-review-required");
  assert.deepEqual(recovered.index.recoveryHistory, [{
    recoveredAt: "2026-09-15T05:01:00.000Z",
    action: "attach",
    priorLatestObservation: fixture.index.latestObservation,
    attachedRecord: recovered.index.latestObservation,
    beforeIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
  }]);
  assert.deepEqual(JSON.parse(await readFile(recovered.receiptPath, "utf8")), {
    receiptVersion: 1,
    receiptPhase: "intent",
    authorizationBoundary:
      "recovery-audit-receipt-no-evidence-review-transfer-proposal-signing-submission-or-enablement",
    action: "attach",
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: "b".repeat(64),
    recoveredAt: "2026-09-15T05:01:00.000Z",
    beforeIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
    evidenceReviewStatus: "not-reviewed-by-recovery",
  });
  assert.deepEqual(JSON.parse(await readFile(recovered.completionPath, "utf8")), {
    receiptVersion: 1,
    receiptPhase: "completion",
    authorizationBoundary:
      "recovery-audit-receipt-no-evidence-review-transfer-proposal-signing-submission-or-enablement",
    receiptFingerprintSha256: sha256(await readFile(recovered.receiptPath, "utf8")),
    action: "attach",
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    recoveredAt: "2026-09-15T05:01:00.000Z",
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
    outcome: "completed",
    evidenceReviewStatus: "not-reviewed-by-recovery",
  });
  assert.deepEqual(recovered.index.reviewedRecord, fixture.index.reviewedRecord);
  assert.deepEqual(recovered.index.reviewHistory, fixture.index.reviewHistory);
  const validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.archiveInventory.orphanedRecords, []);
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
});

test("recovery receipt anchors remain valid after later retention and explicit review", async () => {
  const fixture = await indexedEvidenceFixture();
  fixture.index.reviewStatus = "matches-reviewed-record";
  await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-15T05:00:00.000Z",
    evidenceFingerprintSha256: "b".repeat(64),
    exactMinimumFundingLamports: 11,
  });
  await writeFile(resolve(archiveDirectory, "orphan.json"), JSON.stringify(orphan));

  const recovered = await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
    recoveredAt: "2026-09-15T05:01:00.000Z",
    validateEvidence: () => {},
  });
  const recoveryEntry = structuredClone(recovered.index.recoveryHistory[0]);
  const reviewedBeforeLaterUpdates = structuredClone(recovered.index.reviewedRecord);
  const receiptJson = await readFile(recovered.receiptPath, "utf8");
  const completionJson = await readFile(recovered.completionPath, "utf8");

  let validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(validated.index.reviewStatus, "explicit-review-required");

  const laterObservation = evidence({
    observedAt: "2026-09-15T06:00:00.000Z",
    evidenceFingerprintSha256: "c".repeat(64),
    exactMinimumFundingLamports: 12,
  });
  const retained = await retainFundingEvidence({
    evidence: laterObservation,
    indexPath: fixture.indexPath,
    initialReviewedRecordPath: fixture.recordPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(retained.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(retained.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(retained.index.reviewStatus, "explicit-review-required");

  validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(validated.index.reviewStatus, "explicit-review-required");
  assert.equal(await readFile(recovered.receiptPath, "utf8"), receiptJson);
  assert.equal(await readFile(recovered.completionPath, "utf8"), completionJson);

  const reviewed = await reviewFundingEvidence({
    indexPath: fixture.indexPath,
    observationPath: retained.index.latestObservation.path,
    expectedEvidenceFingerprintSha256: laterObservation.evidenceFingerprintSha256,
    reviewedAt: "2026-09-15T06:01:00.000Z",
    validateEvidence: () => {},
  });
  assert.deepEqual(reviewed.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(reviewed.index.reviewedRecord, retained.index.latestObservation);
  assert.equal(reviewed.index.reviewStatus, "matches-reviewed-record");

  validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, retained.index.latestObservation);
  assert.equal(validated.index.reviewStatus, "matches-reviewed-record");
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
  assert.equal(await readFile(recovered.receiptPath, "utf8"), receiptJson);
  assert.equal(await readFile(recovered.completionPath, "utf8"), completionJson);
});

test("normal orphan attachment rejects a timestamp downgrade without changing the index", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-14T05:00:00.000Z",
    evidenceFingerprintSha256: "older-orphan",
  });
  await writeFile(resolve(archiveDirectory, "older-orphan.json"), JSON.stringify(orphan));
  const originalIndex = await readFile(fixture.indexPath);

  await assert.rejects(
    recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/older-orphan.json",
      expectedEvidenceFingerprintSha256: "older-orphan",
      validateEvidence: () => {},
    }),
    /predates the current latest observation.*attach-historical/,
  );
  assert.deepEqual(await readFile(fixture.indexPath), originalIndex);
});

test("explicit historical attachment indexes an older orphan without moving the latest pointer", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-14T05:00:00.000Z",
    evidenceFingerprintSha256: "c".repeat(64),
  });
  await writeFile(resolve(archiveDirectory, "historical-orphan.json"), JSON.stringify(orphan));

  const recovered = await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/historical-orphan.json",
    expectedEvidenceFingerprintSha256: "c".repeat(64),
    action: "attach-historical",
    recoveredAt: "2026-09-15T06:00:00.000Z",
    validateEvidence: () => {},
  });

  assert.equal(recovered.action, "attach-historical");
  assert.deepEqual(recovered.index.latestObservation, fixture.index.latestObservation);
  assert.deepEqual(recovered.index.recoveryHistory, [{
    recoveredAt: "2026-09-15T06:00:00.000Z",
    action: "attach-historical",
    priorLatestObservation: fixture.index.latestObservation,
    attachedRecord: {
      path: "solana-mainnet-vault-funding-proofs/historical-orphan.json",
      observedAt: orphan.observedAt,
      evidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
    },
    beforeIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
  }]);
  const validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.archiveInventory.orphanedRecords, []);
});

test("orphan attachment rejects malformed timestamps without changing the index", async (t) => {
  for (const [name, orphanObservedAt, latestObservedAt] of [
    ["malformed orphan timestamp", "not-a-timestamp", evidence().observedAt],
    ["malformed latest timestamp", "2026-09-15T04:00:00.000Z", "not-a-timestamp"],
  ]) {
    await t.test(name, async () => {
      const fixture = await indexedEvidenceFixture();
      const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
      await mkdir(archiveDirectory);
      const orphan = evidence({
        observedAt: orphanObservedAt,
        evidenceFingerprintSha256: `malformed-${name}`,
      });
      await writeFile(resolve(archiveDirectory, "orphan.json"), JSON.stringify(orphan));
      if (latestObservedAt !== fixture.index.latestObservation.observedAt) {
        fixture.record.observedAt = latestObservedAt;
        fixture.index.reviewedRecord.observedAt = latestObservedAt;
        fixture.index.latestObservation.observedAt = latestObservedAt;
        await writeFile(fixture.recordPath, JSON.stringify(fixture.record));
        await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
      }
      const originalIndex = await readFile(fixture.indexPath);

      await assert.rejects(
        recoverOrphanFundingEvidence({
          indexPath: fixture.indexPath,
          recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
          expectedEvidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
          validateEvidence: () => {},
        }),
        /requires valid orphan and latest observation timestamps/,
      );
      assert.deepEqual(await readFile(fixture.indexPath), originalIndex);
    });
  }
});

test("orphan recovery can quarantine an exact record without changing review state", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphanPath = resolve(archiveDirectory, "orphan.json");
  const quarantineFingerprint = "d".repeat(64);
  await writeFile(orphanPath, JSON.stringify(evidence({ evidenceFingerprintSha256: quarantineFingerprint })));
  const originalIndex = await readFile(fixture.indexPath, "utf8");

  const recovered = await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: quarantineFingerprint,
    action: "quarantine",
    recoveredAt: "2026-09-15T05:02:00.000Z",
    validateEvidence: () => {},
  });
  assert.deepEqual(JSON.parse(await readFile(recovered.quarantinePath, "utf8")), evidence({
    evidenceFingerprintSha256: quarantineFingerprint,
  }));
  await assert.rejects(readFile(orphanPath), { code: "ENOENT" });
  assert.deepEqual(recovered.index.reviewedRecord, fixture.index.reviewedRecord);
  assert.deepEqual(recovered.index.latestObservation, fixture.index.latestObservation);
  assert.deepEqual(recovered.index.recoveryHistory, [{
    recoveredAt: "2026-09-15T05:02:00.000Z",
    action: "quarantine",
    quarantinedRecord: {
      path: "solana-mainnet-vault-funding-proofs/orphan.json",
      observedAt: evidence().observedAt,
      evidenceFingerprintSha256: quarantineFingerprint,
    },
    quarantinePath: "solana-mainnet-vault-funding-proofs-quarantine/orphan.json",
    beforeIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
  }]);
  assert.deepEqual(JSON.parse(await readFile(recovered.receiptPath, "utf8")), {
    receiptVersion: 1,
    receiptPhase: "intent",
    authorizationBoundary:
      "recovery-audit-receipt-no-evidence-review-transfer-proposal-signing-submission-or-enablement",
    action: "quarantine",
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: quarantineFingerprint,
    recoveredAt: "2026-09-15T05:02:00.000Z",
    beforeIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256:
      recovered.index.recoveryHistory[0].afterIndexFingerprintSha256,
    quarantinePath: "solana-mainnet-vault-funding-proofs-quarantine/orphan.json",
    evidenceReviewStatus: "not-reviewed-by-recovery",
  });
  assert.equal(
    JSON.parse(await readFile(recovered.completionPath, "utf8")).receiptPhase,
    "completion",
  );
  const validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.equal(validated.index.reviewStatus, undefined);
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
});

test("quarantine receipt anchors remain valid after later retention and explicit review", async () => {
  const fixture = await indexedEvidenceFixture();
  fixture.index.reviewStatus = "matches-reviewed-record";
  await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-15T05:00:00.000Z",
    evidenceFingerprintSha256: "d".repeat(64),
    exactMinimumFundingLamports: 11,
  });
  await writeFile(resolve(archiveDirectory, "orphan.json"), JSON.stringify(orphan));

  const recovered = await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
    action: "quarantine",
    recoveredAt: "2026-09-15T05:02:00.000Z",
    validateEvidence: () => {},
  });
  const recoveryEntry = structuredClone(recovered.index.recoveryHistory[0]);
  const reviewedBeforeLaterUpdates = structuredClone(recovered.index.reviewedRecord);
  const receiptJson = await readFile(recovered.receiptPath, "utf8");
  const completionJson = await readFile(recovered.completionPath, "utf8");
  const quarantineJson = await readFile(recovered.quarantinePath, "utf8");

  let validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(validated.index.reviewStatus, "matches-reviewed-record");
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);

  const laterObservation = evidence({
    observedAt: "2026-09-15T06:00:00.000Z",
    evidenceFingerprintSha256: "e".repeat(64),
    exactMinimumFundingLamports: 12,
  });
  const retained = await retainFundingEvidence({
    evidence: laterObservation,
    indexPath: fixture.indexPath,
    initialReviewedRecordPath: fixture.recordPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(retained.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(retained.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(retained.index.reviewStatus, "explicit-review-required");

  validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, reviewedBeforeLaterUpdates);
  assert.equal(validated.index.reviewStatus, "explicit-review-required");
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
  assert.equal(await readFile(recovered.receiptPath, "utf8"), receiptJson);
  assert.equal(await readFile(recovered.completionPath, "utf8"), completionJson);
  assert.equal(await readFile(recovered.quarantinePath, "utf8"), quarantineJson);

  const reviewed = await reviewFundingEvidence({
    indexPath: fixture.indexPath,
    observationPath: retained.index.latestObservation.path,
    expectedEvidenceFingerprintSha256: laterObservation.evidenceFingerprintSha256,
    reviewedAt: "2026-09-15T06:01:00.000Z",
    validateEvidence: () => {},
  });
  assert.deepEqual(reviewed.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(reviewed.index.reviewedRecord, retained.index.latestObservation);
  assert.equal(reviewed.index.reviewStatus, "matches-reviewed-record");

  validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.index.recoveryHistory, [recoveryEntry]);
  assert.deepEqual(validated.index.reviewedRecord, retained.index.latestObservation);
  assert.equal(validated.index.reviewStatus, "matches-reviewed-record");
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
  assert.equal(await readFile(recovered.receiptPath, "utf8"), receiptJson);
  assert.equal(await readFile(recovered.completionPath, "utf8"), completionJson);
  assert.equal(await readFile(recovered.quarantinePath, "utf8"), quarantineJson);
});

test("receipt conflicts leave no partial attach receipt or index mutation", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  const receiptsDirectory = resolve(
    fixture.indexPath,
    "../solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  await mkdir(archiveDirectory);
  await mkdir(receiptsDirectory);
  await writeFile(
    resolve(archiveDirectory, "orphan.json"),
    JSON.stringify(evidence({ evidenceFingerprintSha256: "receipt-conflict" })),
  );
  const receiptPath = resolve(
    receiptsDirectory,
    "funding-evidence-recovery-2026-09-15T05-03-00.000Z-attach-receipt-conf.json",
  );
  await writeFile(receiptPath, "existing immutable receipt");
  const originalIndex = await readFile(fixture.indexPath, "utf8");

  await assert.rejects(recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: "receipt-conflict",
    recoveredAt: "2026-09-15T05:03:00.000Z",
    validateEvidence: () => {},
  }), { code: "EEXIST" });
  assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
  assert.equal(await readFile(receiptPath, "utf8"), "existing immutable receipt");
  assert.deepEqual((await readdir(receiptsDirectory)).sort(), [
    "funding-evidence-recovery-2026-09-15T05-03-00.000Z-attach-receipt-conf.json",
  ]);
});

test("receipt conflicts leave no partial quarantine receipt or record move", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  const receiptsDirectory = resolve(
    fixture.indexPath,
    "../solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  await mkdir(archiveDirectory);
  await mkdir(receiptsDirectory);
  const orphanPath = resolve(archiveDirectory, "orphan.json");
  const orphanJson = JSON.stringify(evidence({ evidenceFingerprintSha256: "receipt-conflict" }));
  await writeFile(orphanPath, orphanJson);
  const receiptPath = resolve(
    receiptsDirectory,
    "funding-evidence-recovery-2026-09-15T05-04-00.000Z-quarantine-receipt-conf.json",
  );
  await writeFile(receiptPath, "existing immutable receipt");
  const originalIndex = await readFile(fixture.indexPath, "utf8");

  await assert.rejects(recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: "receipt-conflict",
    action: "quarantine",
    recoveredAt: "2026-09-15T05:04:00.000Z",
    validateEvidence: () => {},
  }), { code: "EEXIST" });
  assert.equal(await readFile(orphanPath, "utf8"), orphanJson);
  assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
  assert.equal(await readFile(receiptPath, "utf8"), "existing immutable receipt");
  assert.deepEqual((await readdir(receiptsDirectory)).sort(), [
    "funding-evidence-recovery-2026-09-15T05-04-00.000Z-quarantine-receipt-conf.json",
  ]);
});

test("pre-mutation filesystem failures remove the published intent without changing evidence", async (t) => {
  await t.test("blocked quarantine destination", async () => {
    const fixture = await indexedEvidenceFixture();
    const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
    const quarantineDirectory = resolve(
      fixture.indexPath,
      "../solana-mainnet-vault-funding-proofs-quarantine",
    );
    await mkdir(archiveDirectory);
    await mkdir(quarantineDirectory);
    const orphanPath = resolve(archiveDirectory, "orphan.json");
    const orphanJson = JSON.stringify(evidence({ evidenceFingerprintSha256: "blocked" }));
    await writeFile(orphanPath, orphanJson);
    await writeFile(resolve(quarantineDirectory, "orphan.json"), "existing quarantine record");
    const originalIndex = await readFile(fixture.indexPath, "utf8");

    await assert.rejects(recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: "blocked",
      action: "quarantine",
      recoveredAt: "2026-09-15T05:06:00.000Z",
      validateEvidence: () => {},
    }), { code: "EEXIST" });
    assert.equal(await readFile(orphanPath, "utf8"), orphanJson);
    assert.equal(
      await readFile(resolve(quarantineDirectory, "orphan.json"), "utf8"),
      "existing quarantine record",
    );
    assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
    assert.deepEqual(await readdir(resolve(
      fixture.indexPath,
      "../solana-mainnet-vault-funding-proof-recovery-receipts",
    )), []);
  });

  await t.test("blocked temporary index", async () => {
    const fixture = await indexedEvidenceFixture();
    const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
    await mkdir(archiveDirectory);
    await writeFile(
      resolve(archiveDirectory, "orphan.json"),
      JSON.stringify(evidence({ evidenceFingerprintSha256: "blocked" })),
    );
    const temporaryIndexPath = `${fixture.indexPath}.recover-${process.pid}.tmp`;
    await writeFile(temporaryIndexPath, "existing temporary index");
    const originalIndex = await readFile(fixture.indexPath, "utf8");

    await assert.rejects(recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: "blocked",
      recoveredAt: "2026-09-15T05:07:00.000Z",
      validateEvidence: () => {},
    }), { code: "EEXIST" });
    assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
    assert.equal(await readFile(temporaryIndexPath, "utf8"), "existing temporary index");
    assert.deepEqual(await readdir(resolve(
      fixture.indexPath,
      "../solana-mainnet-vault-funding-proof-recovery-receipts",
    )), []);
  });
});

test("quarantine index and completion failures restore all evidence and allow retry", async (t) => {
  for (const [name, failureHook] of [
    ["after index temporary creation", "onRecoveryIndexTemporaryCreated"],
    ["before index replacement", "onBeforeRecoveryIndexReplacement"],
    ["after completion creation", "onRecoveryCompletionCreated"],
    ["after completion write", "onRecoveryCompletionWritten"],
  ]) {
    await t.test(name, async () => {
      const fixture = await indexedEvidenceFixture();
      const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
      const quarantineDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proofs-quarantine",
      );
      const receiptsDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proof-recovery-receipts",
      );
      await mkdir(archiveDirectory);
      const orphanPath = resolve(archiveDirectory, "orphan.json");
      const fingerprint = "7".repeat(64);
      const orphanJson = JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint }));
      await writeFile(orphanPath, orphanJson);
      const originalIndexJson = await readFile(fixture.indexPath, "utf8");
      const recovery = {
        indexPath: fixture.indexPath,
        recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
        expectedEvidenceFingerprintSha256: fingerprint,
        action: "quarantine",
        recoveredAt: "2026-09-15T05:08:00.000Z",
        validateEvidence: () => {},
      };

      await assert.rejects(
        recoverOrphanFundingEvidence({
          ...recovery,
          [failureHook]: () => {
            throw new Error(`injected ${name} failure`);
          },
        }),
        new RegExp(`injected ${name} failure`),
      );

      assert.equal(await readFile(orphanPath, "utf8"), orphanJson);
      await assert.rejects(
        readFile(resolve(quarantineDirectory, "orphan.json")),
        { code: "ENOENT" },
      );
      assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndexJson);
      assert.deepEqual(await readdir(receiptsDirectory), []);

      const retried = await recoverOrphanFundingEvidence(recovery);
      await assert.rejects(readFile(orphanPath), { code: "ENOENT" });
      assert.equal(await readFile(retried.quarantinePath, "utf8"), orphanJson);
      assert.equal(
        JSON.parse(await readFile(fixture.indexPath, "utf8"))
          .recoveryHistory.at(-1).afterIndexFingerprintSha256,
        retried.index.recoveryHistory.at(-1).afterIndexFingerprintSha256,
      );
      assert.deepEqual((await readdir(receiptsDirectory)).sort(), [
        `funding-evidence-recovery-2026-09-15T05-08-00.000Z-quarantine-${fingerprint.slice(0, 12)}.completion.json`,
        `funding-evidence-recovery-2026-09-15T05-08-00.000Z-quarantine-${fingerprint.slice(0, 12)}.json`,
      ]);
    });
  }
});

test("quarantine rollback failures retain actionable errors and every surviving evidence copy", async (t) => {
  for (const [name, rollbackHook, expectedState] of [
    [
      "original index restoration",
      "onBeforeRecoveryIndexRollback",
      { indexAdvanced: true, sourceRestored: true },
    ],
    [
      "source record restoration",
      "onBeforeRecoverySourceRestore",
      { indexAdvanced: false, sourceRestored: false },
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await indexedEvidenceFixture();
      const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
      const quarantineDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proofs-quarantine",
      );
      const receiptsDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proof-recovery-receipts",
      );
      await mkdir(archiveDirectory);
      const orphanPath = resolve(archiveDirectory, "orphan.json");
      const fingerprint = "6".repeat(64);
      const orphanJson = JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint }));
      await writeFile(orphanPath, orphanJson);
      const originalIndexJson = await readFile(fixture.indexPath, "utf8");
      const quarantinePath = resolve(quarantineDirectory, "orphan.json");
      const receiptName =
        `funding-evidence-recovery-2026-09-15T05-08-30.000Z-quarantine-${fingerprint.slice(0, 12)}.json`;

      let rejected;
      try {
        await recoverOrphanFundingEvidence({
          indexPath: fixture.indexPath,
          recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
          expectedEvidenceFingerprintSha256: fingerprint,
          action: "quarantine",
          recoveredAt: "2026-09-15T05:08:30.000Z",
          validateEvidence: () => {},
          onRecoveryCompletionWritten: () => {
            throw new Error("injected completion failure");
          },
          [rollbackHook]: () => {
            throw new Error(`injected ${name} failure`);
          },
        });
      } catch (error) {
        rejected = error;
      }

      assert.ok(rejected instanceof AggregateError);
      assert.match(rejected.message, /injected completion failure/);
      assert.match(rejected.message, new RegExp(`injected ${name} failure`));
      assert.equal(rejected.cause.message, "injected completion failure");
      assert.deepEqual(
        rejected.errors.map((error) => error.message),
        ["injected completion failure", `injected ${name} failure`],
      );
      assert.equal(
        JSON.parse(await readFile(fixture.indexPath, "utf8")).recoveryHistory !== undefined,
        expectedState.indexAdvanced,
      );
      if (expectedState.indexAdvanced === false) {
        assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndexJson);
      }
      if (expectedState.sourceRestored) {
        assert.equal(await readFile(orphanPath, "utf8"), orphanJson);
      } else {
        await assert.rejects(readFile(orphanPath), { code: "ENOENT" });
      }
      assert.equal(await readFile(quarantinePath, "utf8"), orphanJson);
      assert.deepEqual(await readdir(receiptsDirectory), [receiptName]);
      assert.equal(
        JSON.parse(await readFile(resolve(receiptsDirectory, receiptName), "utf8")).receiptPhase,
        "intent",
      );
    });
  }
});

test("attach index rollback failure retains the advanced index and intent for operator recovery", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  const receiptsDirectory = resolve(
    fixture.indexPath,
    "../solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  await mkdir(archiveDirectory);
  const fingerprint = "5".repeat(64);
  await writeFile(
    resolve(archiveDirectory, "orphan.json"),
    JSON.stringify(evidence({
      observedAt: "2026-09-15T05:00:00.000Z",
      evidenceFingerprintSha256: fingerprint,
    })),
  );

  await assert.rejects(
    recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: fingerprint,
      recoveredAt: "2026-09-15T05:08:45.000Z",
      validateEvidence: () => {},
      onRecoveryCompletionWritten: () => {
        throw new Error("injected completion failure");
      },
      onBeforeRecoveryIndexRollback: () => {
        throw new Error("injected index rollback failure");
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /injected completion failure/);
      assert.match(error.message, /injected index rollback failure/);
      return true;
    },
  );

  assert.equal(
    JSON.parse(await readFile(fixture.indexPath, "utf8")).latestObservation.evidenceFingerprintSha256,
    fingerprint,
  );
  assert.deepEqual(await readdir(receiptsDirectory), [
    `funding-evidence-recovery-2026-09-15T05-08-45.000Z-attach-${fingerprint.slice(0, 12)}.json`,
  ]);
});

test("pre-existing completion conflicts are preserved while recovery rolls back", async (t) => {
  for (const action of ["attach", "quarantine"]) {
    await t.test(action, async () => {
      const fixture = await indexedEvidenceFixture();
      const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
      const quarantineDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proofs-quarantine",
      );
      const receiptsDirectory = resolve(
        fixture.indexPath,
        "../solana-mainnet-vault-funding-proof-recovery-receipts",
      );
      await mkdir(archiveDirectory);
      await mkdir(receiptsDirectory);
      const orphanPath = resolve(archiveDirectory, "orphan.json");
      const fingerprint = "8".repeat(64);
      const orphanJson = JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint }));
      await writeFile(orphanPath, orphanJson);
      const originalIndexJson = await readFile(fixture.indexPath, "utf8");
      const completionPath = resolve(
        receiptsDirectory,
        `funding-evidence-recovery-2026-09-15T05-09-00.000Z-${action}-${fingerprint.slice(0, 12)}.completion.json`,
      );
      await writeFile(completionPath, "pre-existing completion");

      await assert.rejects(recoverOrphanFundingEvidence({
        indexPath: fixture.indexPath,
        recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
        expectedEvidenceFingerprintSha256: fingerprint,
        action,
        recoveredAt: "2026-09-15T05:09:00.000Z",
        validateEvidence: () => {},
      }), { code: "EEXIST" });

      assert.equal(await readFile(orphanPath, "utf8"), orphanJson);
      assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndexJson);
      assert.equal(await readFile(completionPath, "utf8"), "pre-existing completion");
      assert.deepEqual(await readdir(receiptsDirectory), [
        completionPath.slice(completionPath.lastIndexOf("/") + 1),
      ]);
      if (action === "quarantine") {
        await assert.rejects(
          readFile(resolve(quarantineDirectory, "orphan.json")),
          { code: "ENOENT" },
        );
      }
    });
  }
});

test("an interrupted attach leaves a canonical intent receipt beside the advanced index", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  await writeFile(
    resolve(archiveDirectory, "orphan.json"),
    JSON.stringify(evidence({
      observedAt: "2026-09-15T05:00:00.000Z",
      evidenceFingerprintSha256: "interrupted",
    })),
  );

  assert.equal(await runInterruptedRecovery({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    fingerprint: "interrupted",
    action: "attach",
  }), 73);
  assert.equal(
    JSON.parse(await readFile(fixture.indexPath, "utf8")).latestObservation.evidenceFingerprintSha256,
    "interrupted",
  );
  const receiptsDirectory = resolve(
    fixture.indexPath,
    "../solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  const entries = await readdir(receiptsDirectory);
  assert.deepEqual(entries, [
    "funding-evidence-recovery-2026-09-15T05-05-00.000Z-attach-interrupted.json",
  ]);
  assert.equal(
    JSON.parse(await readFile(resolve(receiptsDirectory, entries[0]), "utf8")).receiptPhase,
    "intent",
  );
});

test("an interrupted quarantine leaves a canonical intent receipt beside the moved record", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphanPath = resolve(archiveDirectory, "orphan.json");
  await writeFile(
    orphanPath,
    JSON.stringify(evidence({ evidenceFingerprintSha256: "interrupted" })),
  );

  assert.equal(await runInterruptedRecovery({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    fingerprint: "interrupted",
    action: "quarantine",
  }), 73);
  await assert.rejects(readFile(orphanPath), { code: "ENOENT" });
  assert.equal(
    JSON.parse(await readFile(resolve(
      fixture.indexPath,
      "../solana-mainnet-vault-funding-proofs-quarantine/orphan.json",
    ), "utf8")).evidenceFingerprintSha256,
    "interrupted",
  );
  const receiptsDirectory = resolve(
    fixture.indexPath,
    "../solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  const entries = await readdir(receiptsDirectory);
  assert.deepEqual(entries, [
    "funding-evidence-recovery-2026-09-15T05-05-00.000Z-quarantine-interrupted.json",
  ]);
  assert.equal(
    JSON.parse(await readFile(resolve(receiptsDirectory, entries[0]), "utf8")).receiptPhase,
    "intent",
  );
});

test("orphan recovery failures leave the index unchanged", async (t) => {
  for (const [name, content, fingerprint, expected] of [
    ["fingerprint mismatch", JSON.stringify(evidence({ evidenceFingerprintSha256: "actual" })), "wrong", /fingerprint does not match/],
    ["malformed JSON", "{not-json", "expected", /not valid JSON/],
    ["malformed evidence", JSON.stringify(evidence({ observedAt: null })), "evidence-a", /canonical evidence rejected/],
  ]) {
    await t.test(name, async () => {
      const fixture = await indexedEvidenceFixture();
      const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
      await mkdir(archiveDirectory);
      await writeFile(resolve(archiveDirectory, "orphan.json"), content);
      const originalIndex = await readFile(fixture.indexPath, "utf8");
      await assert.rejects(
        recoverOrphanFundingEvidence({
          indexPath: fixture.indexPath,
          recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
          expectedEvidenceFingerprintSha256: fingerprint,
          validateEvidence: (record) => {
            if (typeof record.observedAt !== "string") throw new Error("canonical evidence rejected");
          },
        }),
        expected,
      );
      assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
    });
  }
});

test("orphan recovery rejects a proofs directory symlink outside the evidence directory", async () => {
  const fixture = await indexedEvidenceFixture();
  const externalDirectory = await mkdtemp(resolve(tmpdir(), "external-funding-proofs-"));
  const externalRecord = JSON.stringify(evidence({ evidenceFingerprintSha256: "external" }));
  await writeFile(resolve(externalDirectory, "orphan.json"), externalRecord);
  await symlink(
    externalDirectory,
    resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs"),
  );
  const originalIndex = await readFile(fixture.indexPath, "utf8");

  await assert.rejects(
    recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: "external",
      action: "quarantine",
      validateEvidence: () => {},
    }),
    /proofs directory resolved path escapes the evidence directory/,
  );
  assert.equal(await readFile(resolve(externalDirectory, "orphan.json"), "utf8"), externalRecord);
  assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
});

test("orphan recovery rejects a quarantine directory symlink outside the evidence directory", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphanPath = resolve(archiveDirectory, "orphan.json");
  const orphanRecord = JSON.stringify(evidence({ evidenceFingerprintSha256: "stay-put" }));
  await writeFile(orphanPath, orphanRecord);
  const externalDirectory = await mkdtemp(resolve(tmpdir(), "external-funding-quarantine-"));
  await symlink(
    externalDirectory,
    resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs-quarantine"),
  );
  const originalIndex = await readFile(fixture.indexPath, "utf8");

  await assert.rejects(
    recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: "stay-put",
      action: "quarantine",
      validateEvidence: () => {},
    }),
    /quarantine path must be a real directory/,
  );
  assert.equal(await readFile(orphanPath, "utf8"), orphanRecord);
  assert.equal(await readFile(fixture.indexPath, "utf8"), originalIndex);
  await assert.rejects(readFile(resolve(externalDirectory, "orphan.json")), { code: "ENOENT" });
});

test("index validation accepts archived records referenced by current pointers or review history", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const currentPath = resolve(archiveDirectory, "current.json");
  const historicalPath = resolve(archiveDirectory, "historical.json");
  await writeFile(currentPath, JSON.stringify(fixture.record));
  await writeFile(historicalPath, JSON.stringify(evidence({
    observedAt: "2026-09-14T03:00:00.000Z",
    evidenceFingerprintSha256: "historical",
  })));
  fixture.index.reviewedRecord.path = "solana-mainnet-vault-funding-proofs/current.json";
  fixture.index.latestObservation.path = "solana-mainnet-vault-funding-proofs/current.json";
  fixture.index.reviewHistory = [{
    reviewedAt: "2026-09-15T04:00:00.000Z",
    priorReviewedRecord: {
      path: "solana-mainnet-vault-funding-proofs/historical.json",
      observedAt: "2026-09-14T03:00:00.000Z",
      evidenceFingerprintSha256: "historical",
    },
    promotedRecord: { ...fixture.index.reviewedRecord },
  }];
  await writeFile(fixture.indexPath, JSON.stringify(fixture.index));

  const validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.archiveInventory, {
    archivedRecords: [
      "solana-mainnet-vault-funding-proofs/current.json",
      "solana-mainnet-vault-funding-proofs/historical.json",
    ],
    orphanedRecords: [],
  });
});

test("index validation rejects missing and malformed referenced records", async (t) => {
  await t.test("missing record", async () => {
    const fixture = await indexedEvidenceFixture();
    fixture.index.latestObservation = {
      ...fixture.index.latestObservation,
      path: "renamed-without-index-update.json",
    };
    await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /latestObservation record does not exist/,
    );
  });

  await t.test("malformed record", async () => {
    const fixture = await indexedEvidenceFixture();
    await writeFile(fixture.recordPath, "{not-json");
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /reviewedRecord record is not valid JSON/,
    );
  });

  await t.test("record outside evidence directory", async () => {
    const fixture = await indexedEvidenceFixture();
    fixture.index.reviewedRecord.path = "../outside.json";
    await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /reviewedRecord path escapes the evidence directory/,
    );
  });

  await t.test("symlinked record outside evidence directory", async () => {
    const fixture = await indexedEvidenceFixture();
    const outsideDirectory = await mkdtemp(resolve(tmpdir(), "funding-evidence-outside-"));
    const outsideRecordPath = resolve(outsideDirectory, "outside.json");
    const linkedRecordPath = resolve(fixture.indexPath, "../linked-record.json");
    await writeFile(outsideRecordPath, JSON.stringify(fixture.record));
    await symlink(outsideRecordPath, linkedRecordPath);
    fixture.index.reviewedRecord.path = "linked-record.json";
    await writeFile(fixture.indexPath, JSON.stringify(fixture.index));

    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /reviewedRecord resolved path escapes the evidence directory/,
    );
  });
});

test("index validation rejects timestamp, fingerprint, and authorization-boundary drift", async (t) => {
  for (const [name, mutate, expected] of [
    [
      "timestamp",
      (fixture) => { fixture.index.latestObservation.observedAt = "2026-09-15T04:00:00.000Z"; },
      /latestObservation timestamp does not match/,
    ],
    [
      "fingerprint",
      (fixture) => { fixture.index.reviewedRecord.evidenceFingerprintSha256 = "changed"; },
      /reviewedRecord fingerprint does not match/,
    ],
    [
      "index boundary",
      (fixture) => { fixture.index.authorizationBoundary = "transfer-enabled"; },
      /index does not retain the read-only authorization boundary/,
    ],
    [
      "record boundary",
      (fixture) => { fixture.record.authorizationBoundary = "transfer-enabled"; },
      /reviewedRecord record does not retain the read-only authorization boundary/,
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await indexedEvidenceFixture();
      mutate(fixture);
      await writeFile(fixture.indexPath, JSON.stringify(fixture.index));
      await writeFile(fixture.recordPath, JSON.stringify(fixture.record));
      await assert.rejects(
        validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
        expected,
      );
    });
  }
});

test("index validation inventories and validates every recovery receipt offline without reviewing evidence", async () => {
  const fixture = await indexedEvidenceFixture();
  const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
  await mkdir(archiveDirectory);
  const orphan = evidence({
    observedAt: "2026-09-15T05:00:00.000Z",
    evidenceFingerprintSha256: "a".repeat(64),
  });
  await writeFile(resolve(archiveDirectory, "orphan.json"), JSON.stringify(orphan));
  await recoverOrphanFundingEvidence({
    indexPath: fixture.indexPath,
    recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
    expectedEvidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
    recoveredAt: "2026-09-15T05:10:00.000Z",
    validateEvidence: () => {},
  });
  const beforeValidation = await readFile(fixture.indexPath, "utf8");
  const validated = await validateFundingEvidenceIndex({
    indexPath: fixture.indexPath,
    validateEvidence: () => {},
  });
  assert.deepEqual(validated.recoveryReceiptInventory.files, [
    `funding-evidence-recovery-2026-09-15T05-10-00.000Z-attach-${"a".repeat(12)}.completion.json`,
    `funding-evidence-recovery-2026-09-15T05-10-00.000Z-attach-${"a".repeat(12)}.json`,
  ]);
  assert.equal(validated.recoveryReceiptInventory.receipts.length, 1);
  assert.equal(validated.index.reviewedRecord.evidenceFingerprintSha256, "evidence-a");
  assert.equal(await readFile(fixture.indexPath, "utf8"), beforeValidation);
});

test("index validation fails closed for missing, malformed, altered, duplicated, and escaping recovery receipts", async (t) => {
  async function recoveredFixture() {
    const fixture = await indexedEvidenceFixture();
    const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
    await mkdir(archiveDirectory);
    const fingerprint = "b".repeat(64);
    await writeFile(
      resolve(archiveDirectory, "orphan.json"),
      JSON.stringify(evidence({
        observedAt: "2026-09-15T05:00:00.000Z",
        evidenceFingerprintSha256: fingerprint,
      })),
    );
    const recovered = await recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: fingerprint,
      recoveredAt: "2026-09-15T05:11:00.000Z",
      validateEvidence: () => {},
    });
    return { fixture, recovered };
  }

  await t.test("missing completion", async () => {
    const { fixture, recovered } = await recoveredFixture();
    await unlink(recovered.completionPath);
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /completion receipt is missing/,
    );
  });

  for (const [name, mutate, expected] of [
    ["malformed schema", (receipt) => { receipt.unexpected = true; }, /malformed schema/],
    ["altered index fingerprint", (receipt) => { receipt.afterIndexFingerprintSha256 = "c".repeat(64); }, /does not match its intent|final index fingerprint/],
    ["authorization boundary", (receipt) => { receipt.authorizationBoundary = "can-review"; }, /invalid authorization boundary/],
    ["action", (receipt) => { receipt.action = "review"; }, /malformed schema|invalid authorization boundary/],
    ["record path escape", (receipt) => { receipt.recordPath = "../outside.json"; }, /record path escapes/],
    ["timestamp", (receipt) => { receipt.recoveredAt = "not-a-time"; }, /malformed timestamp/],
  ]) {
    await t.test(name, async () => {
      const { fixture, recovered } = await recoveredFixture();
      const receipt = JSON.parse(await readFile(recovered.receiptPath, "utf8"));
      mutate(receipt);
      await writeFile(recovered.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      await assert.rejects(
        validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
        expected,
      );
    });
  }

  await t.test("duplicate identity", async () => {
    const { fixture, recovered } = await recoveredFixture();
    const receiptsDirectory = resolve(recovered.receiptPath, "..");
    const receiptJson = await readFile(recovered.receiptPath, "utf8");
    const duplicatePath = resolve(receiptsDirectory, `funding-evidence-recovery-duplicate-${"b".repeat(12)}.json`);
    await writeFile(duplicatePath, receiptJson);
    await writeFile(
      duplicatePath.replace(/\.json$/, ".completion.json"),
      await readFile(recovered.completionPath, "utf8"),
    );
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /canonical filename|duplicated/,
    );
  });

  await t.test("coordinated receipt fingerprint alteration", async () => {
    const { fixture, recovered } = await recoveredFixture();
    const receipt = JSON.parse(await readFile(recovered.receiptPath, "utf8"));
    receipt.beforeIndexFingerprintSha256 = "9".repeat(64);
    const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(recovered.receiptPath, receiptJson);
    const completion = JSON.parse(await readFile(recovered.completionPath, "utf8"));
    completion.receiptFingerprintSha256 = sha256(receiptJson);
    await writeFile(recovered.completionPath, `${JSON.stringify(completion, null, 2)}\n`);
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /fingerprint does not match its indexed recovery/,
    );
  });

  await t.test("missing quarantine receipt pair", async () => {
    const fixture = await indexedEvidenceFixture();
    const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
    await mkdir(archiveDirectory);
    const fingerprint = "e".repeat(64);
    await writeFile(
      resolve(archiveDirectory, "orphan.json"),
      JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint })),
    );
    const recovered = await recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: fingerprint,
      action: "quarantine",
      recoveredAt: "2026-09-15T05:12:00.000Z",
      validateEvidence: () => {},
    });
    await Promise.all([unlink(recovered.receiptPath), unlink(recovered.completionPath)]);
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /recovery receipt is missing for indexed recovery/,
    );
  });

  await t.test("quarantine target symlink escape", async () => {
    const fixture = await indexedEvidenceFixture();
    const archiveDirectory = resolve(fixture.indexPath, "../solana-mainnet-vault-funding-proofs");
    await mkdir(archiveDirectory);
    const fingerprint = "f".repeat(64);
    await writeFile(
      resolve(archiveDirectory, "orphan.json"),
      JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint })),
    );
    const recovered = await recoverOrphanFundingEvidence({
      indexPath: fixture.indexPath,
      recordPath: "solana-mainnet-vault-funding-proofs/orphan.json",
      expectedEvidenceFingerprintSha256: fingerprint,
      action: "quarantine",
      recoveredAt: "2026-09-15T05:13:00.000Z",
      validateEvidence: () => {},
    });
    const outsideDirectory = await mkdtemp(resolve(tmpdir(), "recovery-receipt-target-"));
    const outsidePath = resolve(outsideDirectory, "outside.json");
    await writeFile(outsidePath, JSON.stringify(evidence({ evidenceFingerprintSha256: fingerprint })));
    await unlink(recovered.quarantinePath);
    await symlink(outsidePath, recovered.quarantinePath);
    await assert.rejects(
      validateFundingEvidenceIndex({ indexPath: fixture.indexPath, validateEvidence: () => {} }),
      /must be a real file|resolved path escapes/,
    );
  });
});