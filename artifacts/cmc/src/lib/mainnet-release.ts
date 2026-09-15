import { createHash } from "node:crypto";
import {
  canonicalizeReleaseRecord,
  parseSolanaReleaseRecord,
  productionBlockers,
  type SolanaConfig,
  type SolanaReleaseRecord,
} from "./solana-readiness.ts";

/** The two human approvers for the CMC mainnet release, in signing order. */
export const MAINNET_RELEASE_APPROVERS = [
  "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9",
  "5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf",
] as const;

const UNSIGNED_RECORD_BLOCKER = "A signed mainnet release record is not configured.";
const DISABLED_RELEASE_BLOCKER = "An explicit mainnet release flag is not enabled.";
const UNRECORDED_AUTHORIZATION_BLOCKER = "Explicit mainnet real-funds release authorization is not recorded.";
const MISSING_CHAIN_BASELINE_BLOCKER = "The reviewed mainnet chain-state baseline is not configured.";

export type MainnetReleaseDraftResult = {
  draft?: SolanaReleaseRecord;
  canonicalMessage?: string;
  messageFingerprintSha256?: string;
  blockers: string[];
};

function policyBlockers(config: SolanaConfig): string[] {
  const blockers: string[] = [];
  const trusted = config.releaseApproverKeys;
  const expected = [...MAINNET_RELEASE_APPROVERS];

  if (!trusted || trusted.length === 0) {
    blockers.push("The mainnet release approver policy must explicitly trust both fixed approvers.");
  } else if (
    trusted.length !== expected.length
    || trusted.some((key, index) => key !== expected[index])
  ) {
    blockers.push("The mainnet release approver policy must trust the fixed approvers in the required order.");
  }

  const threshold = config.releaseApprovalThreshold ?? trusted?.length;
  if (threshold !== 2) {
    blockers.push("The mainnet release approver policy must require a compatible 2-of-2 threshold.");
  }

  const roles = config.releaseApproverRoles;
  const requiredRoles = config.releaseRequiredApproverRoles;
  if (roles || requiredRoles) {
    if (!roles || expected.some((key) => !roles[key])) {
      blockers.push("Every fixed mainnet release approver must have a configured role.");
    }
    if (requiredRoles) {
      if (new Set(requiredRoles).size !== requiredRoles.length || requiredRoles.some((role) => !role)) {
        blockers.push("The mainnet release approver role requirements are malformed.");
      } else if (requiredRoles.some((role) => !expected.some((key) => roles?.[key] === role))) {
        blockers.push("The mainnet release approver role requirements are not satisfiable by both fixed approvers.");
      }
    }
  }
  return blockers;
}

function reviewBlockers(config: SolanaConfig): string[] {
  const reviews: Array<[string, unknown]> = [
    ["reviewedProgramIds", config.reviewedProgramIds],
    ["platformFeeDestinationReviewed", config.platformFeeDestinationReviewed],
    ["treasuryAuthorityPolicyReviewed", config.treasuryAuthorityPolicyReviewed],
    ["lpAuthorityPolicyReviewed", config.lpAuthorityPolicyReviewed],
    ["platformPdaReviewed", config.platformPdaReviewed],
    ["independentSecurityReviewComplete", config.independentSecurityReviewComplete],
    ["legalReviewComplete", config.legalReviewComplete],
    ["sdkBuilderReviewed", config.sdkBuilderReviewed],
  ];
  return reviews.flatMap(([field, value]) => value === true
    ? []
    : [`The mandatory release review boolean ${field} is missing or false.`]);
}

/**
 * Construct the exact payload that approvers will sign. This function never
 * fills in a governance or review value: every such value comes from the
 * server configuration, and a false value is a hard blocker.
 */
export function buildMainnetReleaseDraft(
  config: SolanaConfig,
  issuedAt = new Date(),
): MainnetReleaseDraftResult {
  const blockers = [
    // The record being created is the one exception to the normal activation
    // blockers. Enablement stays false until after signatures, authorization
    // becomes recorded by those signatures, and the live route supplies the
    // finalized chain baseline used in the draft.
    ...productionBlockers(config).filter((blocker) => ![
      UNSIGNED_RECORD_BLOCKER,
      DISABLED_RELEASE_BLOCKER,
      UNRECORDED_AUTHORIZATION_BLOCKER,
      MISSING_CHAIN_BASELINE_BLOCKER,
    ].includes(blocker)),
    ...policyBlockers(config),
    ...reviewBlockers(config),
  ];

  if (!config.chainStateBaseline) {
    blockers.push("The reviewed mainnet chain-state baseline is mandatory for a signable release draft.");
  }
  if (!Number.isFinite(issuedAt.getTime())) {
    blockers.push("The server-issued release timestamp is invalid.");
  }
  const issuedAtValue = Number.isFinite(issuedAt.getTime()) ? issuedAt.toISOString() : "";
  const expiresAtValue = Number.isFinite(issuedAt.getTime())
    ? new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : "";

  const draft: SolanaReleaseRecord = {
    schemaVersion: 1,
    cluster: "mainnet-beta",
    genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    launchLabProgramId: config.launchLabProgramId as string,
    cpmmProgramId: config.cpmmProgramId as string,
    launchLabProgramDataAddress: config.launchLabProgramDataAddress as string,
    launchLabProgramDataHash: config.launchLabProgramDataHash as string,
    launchLabProgramDataSlot: config.launchLabProgramDataSlot as number,
    launchLabUpgradeAuthority: config.launchLabUpgradeAuthority as string,
    cpmmProgramDataAddress: config.cpmmProgramDataAddress as string,
    cpmmProgramDataHash: config.cpmmProgramDataHash as string,
    cpmmProgramDataSlot: config.cpmmProgramDataSlot as number,
    cpmmUpgradeAuthority: config.cpmmUpgradeAuthority as string,
    platformPda: config.platformPda as string,
    platformFeeDestination: config.platformFeeDestination as string,
    platformFeeDestinationOwner: config.platformFeeDestinationOwner as string,
    treasuryAuthority: config.treasuryAuthority as string,
    treasuryAuthorityOwner: config.treasuryAuthorityOwner as string,
    treasuryAuthorityPolicy: config.treasuryAuthorityPolicy as string,
    lpAuthority: config.lpAuthority as string,
    lpAuthorityOwner: config.lpAuthorityOwner as string,
    lpAuthorityPolicy: config.lpAuthorityPolicy as string,
    platformPdaSeeds: config.platformPdaSeeds as string,
    platformPdaBump: config.platformPdaBump as number,
    platformAccountDiscriminatorHex: config.platformAccountDiscriminatorHex as string,
    platformAccountDataLength: config.platformAccountDataLength as number,
    platformTreasuryAuthorityOffset: config.platformTreasuryAuthorityOffset as number,
    platformLpAuthorityOffset: config.platformLpAuthorityOffset as number,
    platformFeeDestinationOffset: config.platformFeeDestinationOffset as number,
    deploymentStartSlot: config.deploymentStartSlot as number,
    sdkVersion: config.sdkVersion as string,
    artifactId: config.artifactId as string,
    buildId: config.buildId as string,
    reviewedProgramIds: config.reviewedProgramIds,
    platformFeeDestinationReviewed: config.platformFeeDestinationReviewed,
    treasuryAuthorityPolicyReviewed: config.treasuryAuthorityPolicyReviewed,
    lpAuthorityPolicyReviewed: config.lpAuthorityPolicyReviewed,
    platformPdaReviewed: config.platformPdaReviewed,
    independentSecurityReviewComplete: config.independentSecurityReviewComplete,
    legalReviewComplete: config.legalReviewComplete,
    releaseAuthorizationRecorded: true,
    sdkBuilderReviewed: config.sdkBuilderReviewed,
    chainStateBaseline: config.chainStateBaseline as SolanaReleaseRecord["chainStateBaseline"],
    approvers: [...MAINNET_RELEASE_APPROVERS],
    issuedAt: issuedAtValue,
    expiresAt: expiresAtValue,
    signatures: [],
  };

  // Keep malformed or undefined values from being hidden by the type
  // assertions above. The parser is the single schema validation authority.
  try {
    parseSolanaReleaseRecord(draft);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "The release draft does not satisfy its schema.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length > 0) return { blockers: uniqueBlockers };

  const canonicalMessage = canonicalizeReleaseRecord(draft);
  return {
    draft,
    canonicalMessage,
    messageFingerprintSha256: createHash("sha256").update(canonicalMessage).digest("hex"),
    blockers: [],
  };
}