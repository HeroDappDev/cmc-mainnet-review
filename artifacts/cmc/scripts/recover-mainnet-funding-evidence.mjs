import { resolve } from "node:path";
import {
  listOrphanFundingEvidence,
  recoverOrphanFundingEvidence,
} from "./mainnet-funding-evidence-retention.mjs";

const [action = "list", recordPath, expectedEvidenceFingerprintSha256] = process.argv.slice(2);
const indexPath = resolve(
  import.meta.dirname,
  "../../../docs/evidence/solana-mainnet-vault-funding-proof-index.json",
);

if (action === "list") {
  const result = await listOrphanFundingEvidence({ indexPath });
  console.log(JSON.stringify(result.orphanedRecords, null, 2));
} else if (action === "attach" || action === "attach-historical" || action === "quarantine") {
  const result = await recoverOrphanFundingEvidence({
    indexPath,
    recordPath,
    expectedEvidenceFingerprintSha256,
    action,
  });
  console.log(JSON.stringify({
    action: result.action,
    recordPath,
    expectedEvidenceFingerprintSha256,
    receiptPath: result.receiptPath,
    completionPath: result.completionPath,
  }, null, 2));
} else {
  throw new Error("Usage: recover-mainnet-funding-evidence.mjs list|attach|attach-historical|quarantine [record-path] [expected-fingerprint]");
}