import { resolve } from "node:path";
import { reviewFundingEvidence } from "./mainnet-funding-evidence-retention.mjs";

const [observationPath, expectedEvidenceFingerprintSha256, indexArgument] = process.argv.slice(2);
if (!observationPath || !expectedEvidenceFingerprintSha256) {
  throw new Error(
    "Usage: pnpm --filter @workspace/cmc evidence:review-mainnet-funding -- <observation-path> <expected-evidence-fingerprint> [index-path]",
  );
}

const reviewed = await reviewFundingEvidence({
  indexPath: resolve(
    process.cwd(),
    indexArgument ?? "../../docs/evidence/solana-mainnet-vault-funding-proof-index.json",
  ),
  observationPath,
  expectedEvidenceFingerprintSha256,
});

console.log(JSON.stringify({
  indexPath: reviewed.indexPath,
  reviewedRecord: reviewed.index.reviewedRecord,
  reviewStatus: reviewed.index.reviewStatus,
  reviewHistoryEntries: reviewed.index.reviewHistory.length,
}));