import { createHash } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { assertCanonicalMainnetFundingEvidence } from "../src/lib/solana-mainnet-platform-deployment.ts";

const INDEX_AUTHORIZATION_BOUNDARY =
  "read-only-evidence-index-no-transfer-proposal-signing-submission-or-enablement";
const EVIDENCE_AUTHORIZATION_BOUNDARY =
  "read-only-evidence-no-transfer-proposal-signing-submission-or-enablement";
const RECOVERY_RECEIPT_AUTHORIZATION_BOUNDARY =
  "recovery-audit-receipt-no-evidence-review-transfer-proposal-signing-submission-or-enablement";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RECOVERY_ACTIONS = new Set(["attach", "attach-historical", "quarantine"]);

async function writeOwnedExclusiveFile(path, content, onCreated = () => {}) {
  const handle = await open(path, "wx");
  let closed = false;
  try {
    await onCreated();
    await handle.writeFile(content);
    await handle.close();
    closed = true;
  } catch (error) {
    if (!closed) await handle.close().catch(() => {});
    await unlink(path).catch(() => {});
    throw error;
  }
}

function recoveryIndexFingerprint(index) {
  const projectedIndex = {
    ...index,
    ...(Array.isArray(index?.recoveryHistory)
      ? {
          recoveryHistory: index.recoveryHistory.map((entry) => {
            const {
              beforeIndexFingerprintSha256: _beforeIndexFingerprintSha256,
              afterIndexFingerprintSha256: _afterIndexFingerprintSha256,
              ...projectedEntry
            } = entry;
            return projectedEntry;
          }),
        }
      : {}),
  };
  return sha256(`${JSON.stringify(projectedIndex, null, 2)}\n`);
}

function recoveryReceiptFilename({ action, recoveredAt, expectedEvidenceFingerprintSha256 }) {
  const timestamp = recoveredAt.replaceAll(":", "-");
  return `funding-evidence-recovery-${timestamp}-${action}-${expectedEvidenceFingerprintSha256.slice(0, 12)}.json`;
}

function recoveryRollbackError(operationError, rollbackFailures) {
  const rollbackDetails = rollbackFailures
    .map(({ step, error }) => `${step}: ${error?.message ?? String(error)}`)
    .join("; ");
  return new AggregateError(
    [operationError, ...rollbackFailures.map(({ error }) => error)],
    `Funding evidence recovery failed (${operationError?.message ?? String(operationError)}); rollback was incomplete (${rollbackDetails}). Published intent and surviving evidence copies were retained for operator recovery.`,
    { cause: operationError },
  );
}

async function prepareRecoveryReceipt({
  evidenceDirectory,
  action,
  canonicalPath,
  expectedEvidenceFingerprintSha256,
  recoveredAt,
  beforeIndexFingerprintSha256,
  afterIndexFingerprintSha256,
  quarantinePath = null,
}) {
  const receiptsDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proof-recovery-receipts");
  await mkdir(receiptsDirectory, { recursive: true });
  const receiptsDirectoryStat = await lstat(receiptsDirectory);
  if (receiptsDirectoryStat.isSymbolicLink() || !receiptsDirectoryStat.isDirectory()) {
    throw new Error("Funding evidence recovery receipt path must be a real directory inside the evidence directory.");
  }
  const [resolvedEvidenceDirectory, resolvedReceiptsDirectory] = await Promise.all([
    realpath(evidenceDirectory),
    realpath(receiptsDirectory),
  ]);
  const resolvedRelativePath = relative(resolvedEvidenceDirectory, resolvedReceiptsDirectory);
  if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${sep}`)) {
    throw new Error("Funding evidence recovery receipt directory resolved path escapes the evidence directory.");
  }

  const receipt = {
    receiptVersion: 1,
    receiptPhase: "intent",
    authorizationBoundary: RECOVERY_RECEIPT_AUTHORIZATION_BOUNDARY,
    action,
    recordPath: canonicalPath,
    expectedEvidenceFingerprintSha256,
    recoveredAt,
    beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256,
    ...(quarantinePath ? { quarantinePath } : {}),
    evidenceReviewStatus: "not-reviewed-by-recovery",
  };
  const receiptPath = resolve(receiptsDirectory, recoveryReceiptFilename({
    action,
    recoveredAt,
    expectedEvidenceFingerprintSha256,
  }));
  const temporaryReceiptPath = `${receiptPath}.${process.pid}.tmp`;
  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeOwnedExclusiveFile(temporaryReceiptPath, receiptJson);
  return { receipt, receiptJson, receiptPath, temporaryReceiptPath };
}

async function publishRecoveryIntent({ receiptPath, temporaryReceiptPath }) {
  try {
    await link(temporaryReceiptPath, receiptPath);
  } catch (error) {
    await unlink(temporaryReceiptPath).catch(() => {});
    throw error;
  }
  await unlink(temporaryReceiptPath).catch(() => {});
}

async function publishRecoveryCompletion({
  preparedReceipt,
  onRecoveryCompletionCreated = () => {},
  onRecoveryCompletionWritten = () => {},
}) {
  const completionPath = preparedReceipt.receiptPath.replace(/\.json$/, ".completion.json");
  const completion = {
    receiptVersion: 1,
    receiptPhase: "completion",
    authorizationBoundary: RECOVERY_RECEIPT_AUTHORIZATION_BOUNDARY,
    receiptFingerprintSha256: sha256(preparedReceipt.receiptJson),
    action: preparedReceipt.receipt.action,
    recordPath: preparedReceipt.receipt.recordPath,
    recoveredAt: preparedReceipt.receipt.recoveredAt,
    afterIndexFingerprintSha256: preparedReceipt.receipt.afterIndexFingerprintSha256,
    outcome: "completed",
    evidenceReviewStatus: "not-reviewed-by-recovery",
  };
  await writeOwnedExclusiveFile(
    completionPath,
    `${JSON.stringify(completion, null, 2)}\n`,
    onRecoveryCompletionCreated,
  );
  try {
    await onRecoveryCompletionWritten();
  } catch (error) {
    await unlink(completionPath).catch(() => {});
    throw error;
  }
  return { completion, completionPath };
}

function canonicalComparable(value) {
  if (Array.isArray(value)) return value.map(canonicalComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["observedAt", "canonicalEvidenceJson", "evidenceFingerprintSha256"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalComparable(child)]),
    );
  }
  return value;
}

function changed(previous, current) {
  return JSON.stringify(canonicalComparable(previous)) !== JSON.stringify(canonicalComparable(current));
}

function fundingByAddress(evidence) {
  return new Map((evidence?.payerFunding ?? []).map((payer) => [payer.address, payer]));
}

export function summarizeFundingEvidenceDrift(reviewed, observed) {
  const reviewedPayers = fundingByAddress(reviewed);
  const observedPayers = fundingByAddress(observed);
  const addresses = [...new Set([...reviewedPayers.keys(), ...observedPayers.keys()])].sort();
  const payerChanges = addresses.flatMap((address) => {
    const before = reviewedPayers.get(address) ?? null;
    const after = observedPayers.get(address) ?? null;
    if (!changed(before, after)) return [];
    return [{
      address,
      before,
      after,
    }];
  });
  const amountFields = [
    "exactMinimumFundingLamports",
    "recommendedFundingLamports",
  ];
  const amountChanges = amountFields.flatMap((field) =>
    reviewed?.[field] === observed?.[field]
      ? []
      : [{ field, before: reviewed?.[field] ?? null, after: observed?.[field] ?? null }],
  );
  if (reviewed?.safetyMargin?.lamports !== observed?.safetyMargin?.lamports) {
    amountChanges.push({
      field: "safetyMargin.lamports",
      before: reviewed?.safetyMargin?.lamports ?? null,
      after: observed?.safetyMargin?.lamports ?? null,
    });
  }
  const finalizedStateChanged = changed(reviewed?.finalizedState, observed?.finalizedState);
  const sourceProofFingerprintChanged =
    reviewed?.proofFingerprintSha256 !== observed?.proofFingerprintSha256;

  return {
    reviewRequired:
      payerChanges.length > 0 ||
      amountChanges.length > 0 ||
      finalizedStateChanged ||
      sourceProofFingerprintChanged,
    payerChanges,
    amountChanges,
    finalizedStateChange: {
      changed: finalizedStateChanged,
      beforeProofFingerprintSha256: reviewed?.proofFingerprintSha256 ?? null,
      afterProofFingerprintSha256: observed?.proofFingerprintSha256 ?? null,
    },
    sourceProofFingerprintChange: {
      changed: sourceProofFingerprintChanged,
      before: reviewed?.proofFingerprintSha256 ?? null,
      after: observed?.proofFingerprintSha256 ?? null,
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assertIndexBoundary(index) {
  if (index?.indexVersion !== 1 || index.authorizationBoundary !== INDEX_AUTHORIZATION_BOUNDARY) {
    throw new Error("Funding evidence index has an invalid read-only authorization boundary.");
  }
}

async function verifyIndexedRecord({ index, evidenceDirectory, pointer, label, validateEvidence }) {
  if (
    !pointer ||
    typeof pointer.path !== "string" ||
    typeof pointer.observedAt !== "string" ||
    typeof pointer.evidenceFingerprintSha256 !== "string"
  ) {
    throw new Error(`${label} pointer is malformed.`);
  }
  const path = resolve(evidenceDirectory, pointer.path);
  const resolvedEvidenceDirectory = await realpath(evidenceDirectory);
  const resolvedPath = await resolveIndexedRealPath(path, `${label} evidence`);
  const resolvedRelativePath = relative(resolvedEvidenceDirectory, resolvedPath);
  if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} evidence resolved path escapes the evidence directory.`);
  }
  const evidence = await readJson(path);
  validateEvidence(evidence);
  if (
    evidence.authorizationBoundary !== EVIDENCE_AUTHORIZATION_BOUNDARY ||
    evidence.observedAt !== pointer.observedAt ||
    evidence.evidenceFingerprintSha256 !== pointer.evidenceFingerprintSha256
  ) {
    throw new Error(`${label} evidence no longer matches the stable index.`);
  }
  return { path, evidence };
}

async function readIndexedJson(path, label) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${path}`, { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new Error(`${label} is not valid JSON: ${path}`, { cause: error });
    }
    throw error;
  }
}

function indexedRecordPaths(index) {
  const pointers = [
    index?.reviewedRecord,
    index?.latestObservation,
    ...(Array.isArray(index?.reviewHistory)
      ? index.reviewHistory.flatMap((entry) => [
          entry?.priorReviewedRecord,
          entry?.promotedRecord,
        ])
      : []),
    ...(Array.isArray(index?.recoveryHistory)
      ? index.recoveryHistory.flatMap((entry) => [
          entry?.priorLatestObservation,
          entry?.attachedRecord,
        ])
      : []),
  ];
  return new Set(
    pointers
      .filter((pointer) => typeof pointer?.path === "string")
      .map((pointer) => pointer.path.split(sep).join("/")),
  );
}

async function inventoryArchivedRecords({ evidenceDirectory, index }) {
  const recordsDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proofs");
  let entries;
  try {
    entries = await readdir(recordsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { archivedRecords: [], orphanedRecords: [] };
    }
    throw error;
  }

  const archivedRecords = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => relative(evidenceDirectory, resolve(recordsDirectory, entry.name)).split(sep).join("/"))
    .sort();
  const referencedPaths = indexedRecordPaths(index);
  return {
    archivedRecords,
    orphanedRecords: archivedRecords.filter((path) => !referencedPaths.has(path)),
  };
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is malformed.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has a malformed schema.`);
  }
}

function assertCanonicalRecoveryPath({ evidenceDirectory, path, directoryName, label }) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\\")) {
    throw new Error(`${label} is malformed.`);
  }
  const expectedDirectory = resolve(evidenceDirectory, directoryName);
  const absolutePath = resolve(evidenceDirectory, path);
  if (!absolutePath.startsWith(`${expectedDirectory}${sep}`)) {
    throw new Error(`${label} escapes its required evidence directory.`);
  }
  return relative(evidenceDirectory, absolutePath).split(sep).join("/") === path;
}

async function assertRecoveryTargetInsideDirectory({ evidenceDirectory, path, directoryName, label }) {
  const absolutePath = resolve(evidenceDirectory, path);
  const requiredDirectory = resolve(evidenceDirectory, directoryName);
  const [resolvedRequiredDirectory, resolvedTarget] = await Promise.all([
    resolveIndexedRealPath(requiredDirectory, `${label} directory`),
    resolveIndexedRealPath(absolutePath, label),
  ]);
  const targetStat = await lstat(absolutePath);
  if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
    throw new Error(`${label} must be a real file.`);
  }
  const resolvedRelativePath = relative(resolvedRequiredDirectory, resolvedTarget);
  if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} resolved path escapes its required evidence directory.`);
  }
}

function recoveryIdentity({ action, recordPath, recoveredAt }) {
  return `${recoveredAt}\0${action}\0${recordPath}`;
}

function assertRecoveryReceiptIntent({ receipt, evidenceDirectory, filename }) {
  const expectedKeys = [
    "receiptVersion",
    "receiptPhase",
    "authorizationBoundary",
    "action",
    "recordPath",
    "expectedEvidenceFingerprintSha256",
    "recoveredAt",
    "beforeIndexFingerprintSha256",
    "afterIndexFingerprintSha256",
    ...(receipt?.action === "quarantine" ? ["quarantinePath"] : []),
    "evidenceReviewStatus",
  ];
  assertExactKeys(receipt, expectedKeys, `Funding evidence recovery intent ${filename}`);
  if (
    receipt.receiptVersion !== 1 ||
    receipt.receiptPhase !== "intent" ||
    receipt.authorizationBoundary !== RECOVERY_RECEIPT_AUTHORIZATION_BOUNDARY ||
    !RECOVERY_ACTIONS.has(receipt.action) ||
    receipt.evidenceReviewStatus !== "not-reviewed-by-recovery"
  ) {
    throw new Error(`Funding evidence recovery intent ${filename} has an invalid authorization boundary or phase.`);
  }
  if (
    !SHA256_PATTERN.test(receipt.expectedEvidenceFingerprintSha256) ||
    !SHA256_PATTERN.test(receipt.beforeIndexFingerprintSha256) ||
    !SHA256_PATTERN.test(receipt.afterIndexFingerprintSha256)
  ) {
    throw new Error(`Funding evidence recovery intent ${filename} has a malformed fingerprint.`);
  }
  if (
    typeof receipt.recoveredAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.recoveredAt)) ||
    new Date(receipt.recoveredAt).toISOString() !== receipt.recoveredAt
  ) {
    throw new Error(`Funding evidence recovery intent ${filename} has a malformed timestamp.`);
  }
  if (!assertCanonicalRecoveryPath({
    evidenceDirectory,
    path: receipt.recordPath,
    directoryName: "solana-mainnet-vault-funding-proofs",
    label: `Funding evidence recovery intent ${filename} record path`,
  })) {
    throw new Error(`Funding evidence recovery intent ${filename} record path is not canonical.`);
  }
  if (receipt.action === "quarantine") {
    if (!assertCanonicalRecoveryPath({
      evidenceDirectory,
      path: receipt.quarantinePath,
      directoryName: "solana-mainnet-vault-funding-proofs-quarantine",
      label: `Funding evidence recovery intent ${filename} quarantine path`,
    })) {
      throw new Error(`Funding evidence recovery intent ${filename} quarantine path is not canonical.`);
    }
  }
  if (filename !== recoveryReceiptFilename(receipt)) {
    throw new Error(`Funding evidence recovery intent ${filename} does not have its canonical filename.`);
  }
}

function assertRecoveryReceiptCompletion({ completion, intent, intentJson, filename }) {
  assertExactKeys(completion, [
    "receiptVersion",
    "receiptPhase",
    "authorizationBoundary",
    "receiptFingerprintSha256",
    "action",
    "recordPath",
    "recoveredAt",
    "afterIndexFingerprintSha256",
    "outcome",
    "evidenceReviewStatus",
  ], `Funding evidence recovery completion ${filename}`);
  if (
    completion.receiptVersion !== 1 ||
    completion.receiptPhase !== "completion" ||
    completion.authorizationBoundary !== RECOVERY_RECEIPT_AUTHORIZATION_BOUNDARY ||
    completion.outcome !== "completed" ||
    completion.evidenceReviewStatus !== "not-reviewed-by-recovery"
  ) {
    throw new Error(`Funding evidence recovery completion ${filename} has an invalid authorization boundary or phase.`);
  }
  if (
    completion.receiptFingerprintSha256 !== sha256(intentJson) ||
    completion.action !== intent.action ||
    completion.recordPath !== intent.recordPath ||
    completion.recoveredAt !== intent.recoveredAt ||
    completion.afterIndexFingerprintSha256 !== intent.afterIndexFingerprintSha256
  ) {
    throw new Error(`Funding evidence recovery completion ${filename} does not match its intent receipt.`);
  }
}

async function inventoryRecoveryReceipts({ evidenceDirectory, index }) {
  const receiptsDirectory = resolve(
    evidenceDirectory,
    "solana-mainnet-vault-funding-proof-recovery-receipts",
  );
  let entries;
  try {
    const directoryStat = await lstat(receiptsDirectory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error("Funding evidence recovery receipt path must be a real directory inside the evidence directory.");
    }
    const [resolvedEvidenceDirectory, resolvedReceiptsDirectory] = await Promise.all([
      realpath(evidenceDirectory),
      realpath(receiptsDirectory),
    ]);
    const resolvedRelativePath = relative(resolvedEvidenceDirectory, resolvedReceiptsDirectory);
    if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${sep}`)) {
      throw new Error("Funding evidence recovery receipt directory resolved path escapes the evidence directory.");
    }
    entries = await readdir(receiptsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") entries = [];
    else throw error;
  }

  const files = entries.map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
      throw new Error(`Funding evidence recovery receipt entry is not a regular JSON file: ${entry.name}`);
    }
    return entry.name;
  }).sort();
  const intentFiles = files.filter((name) => !name.endsWith(".completion.json"));
  const completionFiles = new Set(files.filter((name) => name.endsWith(".completion.json")));
  const receipts = [];
  const identities = new Set();

  for (const filename of intentFiles) {
    const path = resolve(receiptsDirectory, filename);
    const intentJson = await readIndexedJson(path, "Funding evidence recovery intent");
    const rawIntentJson = await readFile(path, "utf8");
    assertRecoveryReceiptIntent({ receipt: intentJson, evidenceDirectory, filename });
    const identity = recoveryIdentity(intentJson);
    if (identities.has(identity)) {
      throw new Error(`Funding evidence recovery receipt identity is duplicated: ${identity.replaceAll("\0", " ")}`);
    }
    identities.add(identity);
    await assertRecoveryTargetInsideDirectory({
      evidenceDirectory,
      path: intentJson.action === "quarantine" ? intentJson.quarantinePath : intentJson.recordPath,
      directoryName: intentJson.action === "quarantine"
        ? "solana-mainnet-vault-funding-proofs-quarantine"
        : "solana-mainnet-vault-funding-proofs",
      label: `Funding evidence recovery ${intentJson.action} target`,
    });
    const completionFilename = filename.replace(/\.json$/, ".completion.json");
    if (!completionFiles.delete(completionFilename)) {
      throw new Error(`Funding evidence recovery completion receipt is missing for ${filename}.`);
    }
    const completion = await readIndexedJson(
      resolve(receiptsDirectory, completionFilename),
      "Funding evidence recovery completion",
    );
    assertRecoveryReceiptCompletion({
      completion,
      intent: intentJson,
      intentJson: rawIntentJson,
      filename: completionFilename,
    });
    receipts.push({ identity, intent: intentJson, completion, path, completionPath: resolve(receiptsDirectory, completionFilename) });
  }
  if (completionFiles.size > 0) {
    throw new Error(`Funding evidence recovery completion has no intent receipt: ${[...completionFiles].sort().join(", ")}`);
  }

  const indexedRecoveries = Array.isArray(index?.recoveryHistory) ? index.recoveryHistory : [];
  const indexedIdentities = new Set();
  for (const recovery of indexedRecoveries) {
    const recoveryRecord = recovery?.action === "quarantine"
      ? recovery?.quarantinedRecord
      : recovery?.attachedRecord;
    if (
      !recovery ||
      !RECOVERY_ACTIONS.has(recovery.action) ||
      typeof recovery.recoveredAt !== "string" ||
      typeof recoveryRecord?.path !== "string" ||
      typeof recoveryRecord?.evidenceFingerprintSha256 !== "string" ||
      !SHA256_PATTERN.test(recovery.beforeIndexFingerprintSha256) ||
      !SHA256_PATTERN.test(recovery.afterIndexFingerprintSha256) ||
      (recovery.action === "quarantine" && typeof recovery.quarantinePath !== "string")
    ) {
      throw new Error("Funding evidence index has a malformed recovery history entry.");
    }
    const identity = recoveryIdentity({
      action: recovery.action,
      recordPath: recoveryRecord.path,
      recoveredAt: recovery.recoveredAt,
    });
    if (indexedIdentities.has(identity)) {
      throw new Error(`Funding evidence recovery history identity is duplicated: ${identity.replaceAll("\0", " ")}`);
    }
    indexedIdentities.add(identity);
    const receipt = receipts.find((candidate) => candidate.identity === identity);
    if (!receipt) {
      throw new Error(`Funding evidence recovery receipt is missing for indexed recovery: ${identity.replaceAll("\0", " ")}`);
    }
    if (
      receipt.intent.expectedEvidenceFingerprintSha256 !== recoveryRecord.evidenceFingerprintSha256 ||
      receipt.intent.beforeIndexFingerprintSha256 !== recovery.beforeIndexFingerprintSha256 ||
      receipt.intent.afterIndexFingerprintSha256 !== recovery.afterIndexFingerprintSha256 ||
      (recovery.action === "quarantine" && receipt.intent.quarantinePath !== recovery.quarantinePath)
    ) {
      throw new Error("Funding evidence recovery receipt fingerprint does not match its indexed recovery.");
    }
  }
  for (const receipt of receipts) {
    if (!indexedIdentities.has(receipt.identity)) {
      throw new Error(`Funding evidence recovery receipt has no indexed recovery: ${receipt.identity.replaceAll("\0", " ")}`);
    }
  }

  return { directory: receiptsDirectory, files, receipts };
}

async function resolveIndexedRealPath(path, label) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${path}`, { cause: error });
    }
    throw error;
  }
}

async function assertRecordInsideDirectory({ evidenceDirectory, recordPath }) {
  const recordsDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proofs");
  const absoluteRecordPath = resolve(evidenceDirectory, recordPath);
  if (!absoluteRecordPath.startsWith(`${recordsDirectory}${sep}`)) {
    throw new Error("Funding evidence record must be inside the immutable funding proofs directory.");
  }
  const [resolvedEvidenceDirectory, resolvedRecordsDirectory, resolvedRecordPath] = await Promise.all([
    realpath(evidenceDirectory),
    realpath(recordsDirectory),
    resolveIndexedRealPath(absoluteRecordPath, "Funding evidence record"),
  ]);
  const resolvedRecordsRelativePath = relative(resolvedEvidenceDirectory, resolvedRecordsDirectory);
  if (
    resolvedRecordsRelativePath === ".." ||
    resolvedRecordsRelativePath.startsWith(`..${sep}`)
  ) {
    throw new Error("Funding proofs directory resolved path escapes the evidence directory.");
  }
  const resolvedRelativePath = relative(resolvedRecordsDirectory, resolvedRecordPath);
  if (resolvedRelativePath === ".." || resolvedRelativePath.startsWith(`..${sep}`)) {
    throw new Error("Funding evidence record resolved path escapes the immutable funding proofs directory.");
  }
  return absoluteRecordPath;
}

async function validateStableIndex({ absoluteIndexPath, validateEvidence }) {
  const evidenceDirectory = dirname(absoluteIndexPath);
  const index = await readIndexedJson(absoluteIndexPath, "Funding evidence index");
  assertIndexBoundary(index);
  const records = {};
  for (const [pointerName, label] of [
    ["reviewedRecord", "Reviewed"],
    ["latestObservation", "Latest observation"],
  ]) {
    records[pointerName] = await verifyIndexedRecord({
      index,
      evidenceDirectory,
      pointer: index[pointerName],
      label,
      validateEvidence,
    });
  }
  return { evidenceDirectory, index, records };
}

export async function listOrphanFundingEvidence({
  indexPath,
  validateEvidence = assertCanonicalMainnetFundingEvidence,
}) {
  const absoluteIndexPath = resolve(indexPath);
  const { evidenceDirectory, index } = await validateStableIndex({
    absoluteIndexPath,
    validateEvidence,
  });
  const inventory = await inventoryArchivedRecords({ evidenceDirectory, index });
  const orphanedRecords = [];
  for (const path of inventory.orphanedRecords) {
    const absolutePath = await assertRecordInsideDirectory({ evidenceDirectory, recordPath: path });
    try {
      const record = await readIndexedJson(absolutePath, "Orphan funding evidence record");
      orphanedRecords.push({
        path,
        observedAt: typeof record?.observedAt === "string" ? record.observedAt : null,
        evidenceFingerprintSha256:
          typeof record?.evidenceFingerprintSha256 === "string"
            ? record.evidenceFingerprintSha256
            : null,
      });
    } catch (error) {
      orphanedRecords.push({
        path,
        observedAt: null,
        evidenceFingerprintSha256: null,
        error: error.message,
      });
    }
  }
  return { indexPath: absoluteIndexPath, orphanedRecords };
}

export async function recoverOrphanFundingEvidence({
  indexPath,
  recordPath,
  expectedEvidenceFingerprintSha256,
  action = "attach",
  recoveredAt = new Date().toISOString(),
  validateEvidence = assertCanonicalMainnetFundingEvidence,
  onRecoveryIndexTemporaryCreated = () => {},
  onBeforeRecoveryIndexReplacement = () => {},
  onRecoveryMutationCommitted = () => {},
  onRecoveryCompletionCreated = () => {},
  onRecoveryCompletionWritten = () => {},
  onBeforeRecoveryIndexRollback = () => {},
  onBeforeRecoverySourceRestore = () => {},
}) {
  if (!recordPath || !expectedEvidenceFingerprintSha256) {
    throw new Error("Exact orphan record path and expected evidence fingerprint are required.");
  }
  if (!["attach", "attach-historical", "quarantine"].includes(action)) {
    throw new Error("Recovery action must be attach, attach-historical, or quarantine.");
  }
  const absoluteIndexPath = resolve(indexPath);
  const originalIndexJson = await readFile(absoluteIndexPath, "utf8");
  const { evidenceDirectory, index, records } = await validateStableIndex({
    absoluteIndexPath,
    validateEvidence,
  });
  const absoluteRecordPath = await assertRecordInsideDirectory({ evidenceDirectory, recordPath });
  const canonicalPath = relative(evidenceDirectory, absoluteRecordPath).split(sep).join("/");
  const inventory = await inventoryArchivedRecords({ evidenceDirectory, index });
  if (!inventory.orphanedRecords.includes(canonicalPath)) {
    throw new Error("Selected funding evidence record is not an unindexed orphan.");
  }
  const orphan = await readIndexedJson(absoluteRecordPath, "Orphan funding evidence record");
  validateEvidence(orphan);
  if (orphan.authorizationBoundary !== EVIDENCE_AUTHORIZATION_BOUNDARY) {
    throw new Error("Orphan funding evidence does not have the required read-only authorization boundary.");
  }
  if (orphan.evidenceFingerprintSha256 !== expectedEvidenceFingerprintSha256) {
    throw new Error("Orphan funding evidence fingerprint does not match the expected fingerprint.");
  }
  const beforeIndexFingerprintSha256 = recoveryIndexFingerprint(index);
  const orphanObservedAt = Date.parse(orphan.observedAt);
  const latestObservedAt = Date.parse(index.latestObservation.observedAt);
  if (
    ["attach", "attach-historical"].includes(action) &&
    (!Number.isFinite(orphanObservedAt) || !Number.isFinite(latestObservedAt))
  ) {
    throw new Error("Funding evidence recovery requires valid orphan and latest observation timestamps.");
  }
  if (action === "attach" && orphanObservedAt < latestObservedAt) {
    throw new Error(
      "Orphan funding evidence predates the current latest observation; use attach-historical to index it without changing the latest pointer.",
    );
  }
  if (action === "attach-historical" && orphanObservedAt >= latestObservedAt) {
    throw new Error(
      "attach-historical requires an orphan older than the current latest observation; use attach otherwise.",
    );
  }

  if (action === "quarantine") {
    const quarantineDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proofs-quarantine");
    await mkdir(quarantineDirectory, { recursive: true });
    const quarantineDirectoryStat = await lstat(quarantineDirectory);
    if (quarantineDirectoryStat.isSymbolicLink() || !quarantineDirectoryStat.isDirectory()) {
      throw new Error("Funding evidence quarantine path must be a real directory inside the evidence directory.");
    }
    const [resolvedEvidenceDirectory, resolvedQuarantineDirectory] = await Promise.all([
      realpath(evidenceDirectory),
      realpath(quarantineDirectory),
    ]);
    const resolvedQuarantineRelativePath = relative(
      resolvedEvidenceDirectory,
      resolvedQuarantineDirectory,
    );
    if (
      resolvedQuarantineRelativePath === ".." ||
      resolvedQuarantineRelativePath.startsWith(`..${sep}`)
    ) {
      throw new Error("Funding evidence quarantine directory resolved path escapes the evidence directory.");
    }
    const quarantinePath = resolve(quarantineDirectory, absoluteRecordPath.slice(absoluteRecordPath.lastIndexOf(sep) + 1));
    const canonicalQuarantinePath = relative(evidenceDirectory, quarantinePath).split(sep).join("/");
    const recoveryEntry = {
      recoveredAt,
      action,
      quarantinedRecord: {
        path: canonicalPath,
        observedAt: orphan.observedAt,
        evidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
      },
      quarantinePath: canonicalQuarantinePath,
      beforeIndexFingerprintSha256,
    };
    const nextIndex = {
      ...index,
      recoveryHistory: [
        ...(Array.isArray(index.recoveryHistory) ? index.recoveryHistory : []),
        recoveryEntry,
      ],
    };
    recoveryEntry.afterIndexFingerprintSha256 = recoveryIndexFingerprint(nextIndex);
    const nextIndexJson = `${JSON.stringify(nextIndex, null, 2)}\n`;
    const preparedReceipt = await prepareRecoveryReceipt({
      evidenceDirectory,
      action,
      canonicalPath,
      expectedEvidenceFingerprintSha256,
      recoveredAt,
      beforeIndexFingerprintSha256,
      afterIndexFingerprintSha256: recoveryEntry.afterIndexFingerprintSha256,
      quarantinePath: canonicalQuarantinePath,
    });
    const temporaryPath = `${absoluteIndexPath}.recover-${process.pid}.tmp`;
    await publishRecoveryIntent(preparedReceipt);
    let quarantineLinked = false;
    let orphanRemoved = false;
    let temporaryIndexWritten = false;
    let indexReplaced = false;
    try {
      await link(absoluteRecordPath, quarantinePath);
      quarantineLinked = true;
      await unlink(absoluteRecordPath);
      orphanRemoved = true;
      await writeOwnedExclusiveFile(
        temporaryPath,
        nextIndexJson,
        onRecoveryIndexTemporaryCreated,
      );
      temporaryIndexWritten = true;
      await onBeforeRecoveryIndexReplacement();
      await rename(temporaryPath, absoluteIndexPath);
      indexReplaced = true;
      await onRecoveryMutationCommitted();
      const publishedCompletion = await publishRecoveryCompletion({
        preparedReceipt,
        onRecoveryCompletionCreated,
        onRecoveryCompletionWritten,
      });
      return {
        action,
        indexPath: absoluteIndexPath,
        recordPath: absoluteRecordPath,
        quarantinePath,
        receiptPath: preparedReceipt.receiptPath,
        receipt: preparedReceipt.receipt,
        index: nextIndex,
        ...publishedCompletion,
      };
    } catch (error) {
      const rollbackFailures = [];
      if (indexReplaced) {
        const rollbackPath = `${absoluteIndexPath}.recover-rollback-${process.pid}.tmp`;
        try {
          await onBeforeRecoveryIndexRollback();
          await writeFile(rollbackPath, originalIndexJson, { flag: "wx" });
          await rename(rollbackPath, absoluteIndexPath);
        } catch (rollbackError) {
          rollbackFailures.push({ step: "restore original index", error: rollbackError });
        }
      } else if (temporaryIndexWritten) {
        await unlink(temporaryPath).catch(() => {});
      }
      if (orphanRemoved) {
        try {
          await onBeforeRecoverySourceRestore();
          await link(quarantinePath, absoluteRecordPath);
        } catch (rollbackError) {
          rollbackFailures.push({ step: "restore source record", error: rollbackError });
        }
      }
      if (rollbackFailures.length === 0 && quarantineLinked) {
        await unlink(quarantinePath).catch(() => {});
      }
      if (rollbackFailures.length === 0) {
        await unlink(preparedReceipt.receiptPath).catch(() => {});
        await unlink(preparedReceipt.temporaryReceiptPath).catch(() => {});
      }
      if (rollbackFailures.length > 0) {
        throw recoveryRollbackError(error, rollbackFailures);
      }
      throw error;
    }
  }

  const selectedPointer = {
    path: canonicalPath,
    observedAt: orphan.observedAt,
    evidenceFingerprintSha256: orphan.evidenceFingerprintSha256,
  };
  const driftFromReviewed = summarizeFundingEvidenceDrift(records.reviewedRecord.evidence, orphan);
  const historicalAttachment = action === "attach-historical";
  const recoveryEntry = {
    recoveredAt,
    action,
    priorLatestObservation: index.latestObservation,
    attachedRecord: selectedPointer,
    beforeIndexFingerprintSha256,
  };
  const nextIndex = {
    ...index,
    latestObservation: historicalAttachment ? index.latestObservation : selectedPointer,
    driftFromReviewed: historicalAttachment ? index.driftFromReviewed : driftFromReviewed,
    reviewStatus: historicalAttachment
      ? index.reviewStatus
      : driftFromReviewed.reviewRequired
        ? "explicit-review-required"
        : "matches-reviewed-record",
    recoveryHistory: [
      ...(Array.isArray(index.recoveryHistory) ? index.recoveryHistory : []),
      recoveryEntry,
    ],
  };
  recoveryEntry.afterIndexFingerprintSha256 = recoveryIndexFingerprint(nextIndex);
  const nextIndexJson = `${JSON.stringify(nextIndex, null, 2)}\n`;
  const preparedReceipt = await prepareRecoveryReceipt({
    evidenceDirectory,
    action,
    canonicalPath,
    expectedEvidenceFingerprintSha256,
    recoveredAt,
    beforeIndexFingerprintSha256,
    afterIndexFingerprintSha256: recoveryEntry.afterIndexFingerprintSha256,
  });
  const temporaryPath = `${absoluteIndexPath}.recover-${process.pid}.tmp`;
  await publishRecoveryIntent(preparedReceipt);
  let temporaryIndexWritten = false;
  let indexReplaced = false;
  try {
    await writeOwnedExclusiveFile(
      temporaryPath,
      nextIndexJson,
      onRecoveryIndexTemporaryCreated,
    );
    temporaryIndexWritten = true;
    await onBeforeRecoveryIndexReplacement();
    await rename(temporaryPath, absoluteIndexPath);
    indexReplaced = true;
    await onRecoveryMutationCommitted();
    const publishedCompletion = await publishRecoveryCompletion({
      preparedReceipt,
      onRecoveryCompletionCreated,
      onRecoveryCompletionWritten,
    });
    return {
      action,
      indexPath: absoluteIndexPath,
      recordPath: absoluteRecordPath,
      index: nextIndex,
      receiptPath: preparedReceipt.receiptPath,
      receipt: preparedReceipt.receipt,
      ...publishedCompletion,
    };
  } catch (error) {
    const rollbackFailures = [];
    if (indexReplaced) {
      const rollbackPath = `${absoluteIndexPath}.recover-rollback-${process.pid}.tmp`;
      try {
        await onBeforeRecoveryIndexRollback();
        await writeFile(rollbackPath, originalIndexJson, { flag: "wx" });
        await rename(rollbackPath, absoluteIndexPath);
      } catch (rollbackError) {
        rollbackFailures.push({ step: "restore original index", error: rollbackError });
      }
    } else if (temporaryIndexWritten) {
      await unlink(temporaryPath).catch(() => {});
    }
    if (rollbackFailures.length === 0) {
      await unlink(preparedReceipt.receiptPath).catch(() => {});
      await unlink(preparedReceipt.temporaryReceiptPath).catch(() => {});
    }
    if (rollbackFailures.length > 0) {
      throw recoveryRollbackError(error, rollbackFailures);
    }
    throw error;
  }
}

export async function validateFundingEvidenceIndex({
  indexPath,
  validateEvidence = assertCanonicalMainnetFundingEvidence,
}) {
  const absoluteIndexPath = resolve(indexPath);
  const evidenceDirectory = dirname(absoluteIndexPath);
  const resolvedEvidenceDirectory = await realpath(evidenceDirectory);
  const index = await readIndexedJson(absoluteIndexPath, "Funding evidence index");

  if (index?.authorizationBoundary !== INDEX_AUTHORIZATION_BOUNDARY) {
    throw new Error("Funding evidence index does not retain the read-only authorization boundary.");
  }

  const records = {};
  for (const pointerName of ["reviewedRecord", "latestObservation"]) {
    const pointer = index?.[pointerName];
    if (
      !pointer ||
      typeof pointer.path !== "string" ||
      pointer.path.length === 0 ||
      typeof pointer.observedAt !== "string" ||
      typeof pointer.evidenceFingerprintSha256 !== "string"
    ) {
      throw new Error(`Funding evidence index has a malformed ${pointerName} pointer.`);
    }

    const recordPath = resolve(evidenceDirectory, pointer.path);
    const recordRelativePath = relative(evidenceDirectory, recordPath);
    if (recordRelativePath === ".." || recordRelativePath.startsWith(`..${sep}`)) {
      throw new Error(`Funding evidence ${pointerName} path escapes the evidence directory.`);
    }
    const resolvedRecordPath = await resolveIndexedRealPath(
      recordPath,
      `Funding evidence ${pointerName} record`,
    );
    const resolvedRecordRelativePath = relative(resolvedEvidenceDirectory, resolvedRecordPath);
    if (
      resolvedRecordRelativePath === ".." ||
      resolvedRecordRelativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(
        `Funding evidence ${pointerName} resolved path escapes the evidence directory.`,
      );
    }
    const record = await readIndexedJson(recordPath, `Funding evidence ${pointerName} record`);
    validateEvidence(record);
    if (record.authorizationBoundary !== EVIDENCE_AUTHORIZATION_BOUNDARY) {
      throw new Error(
        `Funding evidence ${pointerName} record does not retain the read-only authorization boundary.`,
      );
    }
    if (pointer.observedAt !== record.observedAt) {
      throw new Error(
        `Funding evidence ${pointerName} timestamp does not match its referenced record.`,
      );
    }
    if (pointer.evidenceFingerprintSha256 !== record.evidenceFingerprintSha256) {
      throw new Error(
        `Funding evidence ${pointerName} fingerprint does not match its referenced record.`,
      );
    }
    records[pointerName] = { path: recordPath, evidence: record };
  }

  const archiveInventory = await inventoryArchivedRecords({ evidenceDirectory, index });
  if (archiveInventory.orphanedRecords.length > 0) {
    throw new Error(
      `Funding evidence archive contains unindexed orphan records: ${archiveInventory.orphanedRecords.join(", ")}`,
    );
  }

  const recoveryReceiptInventory = await inventoryRecoveryReceipts({
    evidenceDirectory,
    index,
  });

  return { indexPath: absoluteIndexPath, index, records, archiveInventory, recoveryReceiptInventory };
}

function recordFilename(evidence) {
  const timestamp = evidence.observedAt.replaceAll(":", "-");
  return `solana-mainnet-vault-funding-proof-${timestamp}-${evidence.evidenceFingerprintSha256.slice(0, 12)}.json`;
}

export async function retainFundingEvidence({
  evidence,
  indexPath,
  initialReviewedRecordPath,
  validateEvidence = assertCanonicalMainnetFundingEvidence,
}) {
  validateEvidence(evidence);
  const absoluteIndexPath = resolve(indexPath);
  const evidenceDirectory = dirname(absoluteIndexPath);
  const recordsDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proofs");
  await mkdir(recordsDirectory, { recursive: true });

  let index;
  let existingIndex = true;
  try {
    index = await readJson(absoluteIndexPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    existingIndex = false;
    index = {
      indexVersion: 1,
      authorizationBoundary: INDEX_AUTHORIZATION_BOUNDARY,
      reviewedRecord: {
        path: relative(evidenceDirectory, resolve(initialReviewedRecordPath)),
      },
    };
  }

  const reviewedRecordPath = resolve(evidenceDirectory, index.reviewedRecord.path);
  const reviewedEvidence = await readJson(reviewedRecordPath);
  validateEvidence(reviewedEvidence);
  if (
    existingIndex &&
    (
      index.reviewedRecord.observedAt !== reviewedEvidence.observedAt ||
      index.reviewedRecord.evidenceFingerprintSha256 !==
        reviewedEvidence.evidenceFingerprintSha256
    )
  ) {
    throw new Error(
      "Reviewed funding evidence no longer matches the stable index; refusing to retain a new observation.",
    );
  }
  const recordPath = resolve(recordsDirectory, recordFilename(evidence));
  await writeFile(recordPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });

  const driftFromReviewed = summarizeFundingEvidenceDrift(reviewedEvidence, evidence);
  const nextIndex = {
    ...index,
    reviewedRecord: existingIndex
      ? index.reviewedRecord
      : {
          ...index.reviewedRecord,
          observedAt: reviewedEvidence.observedAt,
          evidenceFingerprintSha256: reviewedEvidence.evidenceFingerprintSha256,
        },
    latestObservation: {
      path: relative(evidenceDirectory, recordPath),
      observedAt: evidence.observedAt,
      evidenceFingerprintSha256: evidence.evidenceFingerprintSha256,
    },
    driftFromReviewed,
    reviewStatus: driftFromReviewed.reviewRequired ? "explicit-review-required" : "matches-reviewed-record",
  };
  await writeFile(absoluteIndexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, { flag: "w" });
  return {
    indexPath: absoluteIndexPath,
    recordPath,
    index: nextIndex,
  };
}

export async function reviewFundingEvidence({
  indexPath,
  observationPath,
  expectedEvidenceFingerprintSha256,
  reviewedAt = new Date().toISOString(),
  validateEvidence = assertCanonicalMainnetFundingEvidence,
}) {
  if (!observationPath || !expectedEvidenceFingerprintSha256) {
    throw new Error("Exact observation path and expected evidence fingerprint are required.");
  }
  const absoluteIndexPath = resolve(indexPath);
  const evidenceDirectory = dirname(absoluteIndexPath);
  const recordsDirectory = resolve(evidenceDirectory, "solana-mainnet-vault-funding-proofs");
  const selectedPath = resolve(evidenceDirectory, observationPath);
  if (!selectedPath.startsWith(`${recordsDirectory}${sep}`)) {
    throw new Error("Reviewed observation must be an immutable record in the funding proofs directory.");
  }

  const index = await readJson(absoluteIndexPath);
  assertIndexBoundary(index);
  await verifyIndexedRecord({
    index,
    evidenceDirectory,
    pointer: index.reviewedRecord,
    label: "Reviewed",
    validateEvidence,
  });
  const latest = await verifyIndexedRecord({
    index,
    evidenceDirectory,
    pointer: index.latestObservation,
    label: "Latest observation",
    validateEvidence,
  });

  const selectedEvidence = await readJson(selectedPath);
  validateEvidence(selectedEvidence);
  if (selectedEvidence.authorizationBoundary !== EVIDENCE_AUTHORIZATION_BOUNDARY) {
    throw new Error("Selected funding evidence does not have the required read-only authorization boundary.");
  }
  if (selectedEvidence.evidenceFingerprintSha256 !== expectedEvidenceFingerprintSha256) {
    throw new Error("Selected funding evidence fingerprint does not match the expected fingerprint.");
  }

  const selectedPointer = {
    path: relative(evidenceDirectory, selectedPath),
    observedAt: selectedEvidence.observedAt,
    evidenceFingerprintSha256: selectedEvidence.evidenceFingerprintSha256,
  };
  if (
    selectedPointer.path !== index.latestObservation.path ||
    selectedPointer.observedAt !== index.latestObservation.observedAt ||
    selectedPointer.evidenceFingerprintSha256 !== index.latestObservation.evidenceFingerprintSha256
  ) {
    throw new Error("Selected funding evidence is not the current indexed latest observation.");
  }
  const reviewHistory = [
    ...(Array.isArray(index.reviewHistory) ? index.reviewHistory : []),
    {
      reviewedAt,
      priorReviewedRecord: index.reviewedRecord,
      promotedRecord: selectedPointer,
    },
  ];
  const nextIndex = {
    ...index,
    reviewedRecord: selectedPointer,
    driftFromReviewed: summarizeFundingEvidenceDrift(selectedEvidence, latest.evidence),
    reviewStatus: "matches-reviewed-record",
    reviewHistory,
  };
  const temporaryPath = `${absoluteIndexPath}.review-${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(nextIndex, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, absoluteIndexPath);
  return { indexPath: absoluteIndexPath, index: nextIndex };
}