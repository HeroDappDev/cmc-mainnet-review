import { resolve } from "node:path";
import { Connection } from "@solana/web3.js";
import {
  CMC_MAINNET_CPMM_PROGRAM_ID,
  CMC_MAINNET_LAUNCHLAB_PROGRAM_ID,
  CMC_MAINNET_SQUADS_VAULT,
  buildMainnetFundingEvidence,
  proveMainnetPlatformDeployment,
} from "../src/lib/solana-mainnet-platform-deployment.ts";
import { retainFundingEvidence } from "./mainnet-funding-evidence-retention.mjs";

const rpcUrl = process.env.SOLANA_MAINNET_RPC_URL;
if (!rpcUrl) {
  throw new Error(
    "SOLANA_MAINNET_RPC_URL is required; funding evidence will not use an implicit public RPC.",
  );
}
const indexPath = resolve(
  process.cwd(),
  process.argv[2] ?? "../../docs/evidence/solana-mainnet-vault-funding-proof-index.json",
);
const initialReviewedRecordPath = resolve(
  process.cwd(),
  process.argv[3] ?? "../../docs/evidence/solana-mainnet-vault-funding-proof.json",
);
const connection = new Connection(rpcUrl, "finalized");
const proof = await proveMainnetPlatformDeployment(connection, {
  baseline: {
    launchLab: {
      programAddress: CMC_MAINNET_LAUNCHLAB_PROGRAM_ID.toBase58(),
      programDataAddress: "D2QX47Tv2uhNNwFcnLCyJtLMZ4WGmc7eXxvyEmD6zNUh",
      codeFingerprint: "4c87da8e9fdeda6daf9d141e409577733d6248ae78f694557176fe2709a09657",
      deployedSlot: 446221802,
      upgradeAuthority: "FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK",
    },
    cpmm: {
      programAddress: CMC_MAINNET_CPMM_PROGRAM_ID.toBase58(),
      programDataAddress: "DMawCQzbgNTmbzaESc7o6pvL1KAeetY8zA7jNpzntHhU",
      codeFingerprint: "36537be95ba356056fa38b2847d928078c68bf6cd79b875c140e157e6452cc71",
      deployedSlot: 445763504,
      upgradeAuthority: "FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK",
    },
  },
  expectedMembers: [
    "5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf",
    "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
  ],
  nextTransactionIndex: 2n,
  creator: "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
  rentPayer: "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
  executionPayer: "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
});
const evidence = buildMainnetFundingEvidence(proof, {
  observedAt: new Date().toISOString(),
  safetyMarginLamports: 500_000,
  safetyMarginRationale:
    "Reviewed fixed reserve for finalized rent or base-fee drift between this observation and a separately authorized execution; it is not part of the exact minimum.",
  safetyMarginPayer: CMC_MAINNET_SQUADS_VAULT,
});
const retained = await retainFundingEvidence({
  evidence,
  indexPath,
  initialReviewedRecordPath,
});
console.log(JSON.stringify({
  indexPath: retained.indexPath,
  recordPath: retained.recordPath,
  reviewedRecord: retained.index.reviewedRecord,
  reviewStatus: retained.index.reviewStatus,
  driftFromReviewed: retained.index.driftFromReviewed,
  evidenceFingerprintSha256: evidence.evidenceFingerprintSha256,
  exactMinimumFundingLamports: evidence.exactMinimumFundingLamports,
  safetyMarginLamports: evidence.safetyMargin.lamports,
  recommendedFundingLamports: evidence.recommendedFundingLamports,
}));