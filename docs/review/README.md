# External review landing page

This directory is the hand-off point for independent security and legal/compliance
review of Commodity Markets Capital (CMC). The packets describe a blocked,
fail-closed Solana release candidate. They are requests for independent review,
not an audit, certification, legal opinion, approval, or authorization to use
real funds.

## Current release status

These are the exact status assertions for this review hand-off:

| Status | Current value |
| --- | --- |
| Platform status | `finalized Platform deployed` |
| Development configuration | `networkReady: true` |
| Mainnet release | disabled |
| Signed mainnet release record | none |
| Independent security review flag | `false` |
| Legal review flag | `false` |

The Platform and `networkReady` values are configuration/readiness observations,
not authorization. The retained mainnet evidence records the finalized Platform
deployment and its governed Squads execution. It does not record a CMC token
launch, trade, graduation, signed release record, or authorization for general
mainnet real-funds use. Mainnet product activation remains disabled.

## Review packets

- [Security review scope](security-review-scope.md)
- [Security review submission](security-review-submission.md)
- [Legal/compliance review submission](legal-review-submission.md)
- [Legal product facts](legal-product-facts.md)

Security and legal/compliance are separate reviewer tracks. Security reviewers
should assess code, signing boundaries, account/program identity, authority and
fund safety, finality, indexing, storage, and operational controls. Legal and
compliance reviewers should assess entity and jurisdiction facts, product
classification, consumer disclosures, AML/sanctions, privacy, marketing, IP,
and data licensing. Neither track substitutes for the other, and neither
review enables mainnet.

## Evidence and controls

- [Mainnet release controls](../solana-mainnet-release-controls.md)
- [Sanitized Squads/Platform proof](../evidence/solana-mainnet-squads-platform-proof.json)
- [Funding evidence index](../evidence/solana-mainnet-vault-funding-proof-index.json)
- [Original funding evidence](../evidence/solana-mainnet-vault-funding-proof.json)
- [Current reviewed funding observation](../evidence/solana-mainnet-vault-funding-proofs/solana-mainnet-vault-funding-proof-2026-09-15T04-12-26.623Z-feea820371d0.json)
- [LaunchLab evaluation](../solana-launchlab-evaluation.md)
- [LaunchLab evidence procedure](../solana-launchlab-evidence.md)
- [LaunchLab proof output](../solana-launchlab-proof-output.json)
- [Evidence manifest](review-evidence-manifest.json)

The manifest records the exact source commit, configured build ID, public
mainnet identities, retained evidence fingerprints, and SHA-256 hashes of the
review/evidence packet files and release-control document. Public keys and
fingerprints are evidence identifiers; they are not secrets.

## Reproducibility

Run from the repository root. These commands are reproducibility instructions,
not claims that this submission author ran them:

```sh
pnpm --filter @workspace/cmc test
pnpm --filter @workspace/cmc run test:validator-snapshot
pnpm --filter @workspace/cmc typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/scripts test
pnpm --filter @workspace/scripts run typecheck
pnpm --filter @workspace/scripts run solana:launchlab-proof
```

The LaunchLab proof is a read-only devnet verification and deterministic dry
run; it is not graduation evidence. A future authorized evidence collection
must use the documented finalized-evidence procedure and an ephemeral,
reviewer-controlled RPC setting.

## Reporting requirements

Every report, finding, retest, and conclusion must identify the exact reviewed
git commit, dependency lockfiles, build ID, artifact ID (if applicable), review
scope, exclusions, and evidence-manifest version/hash. Retests must identify
the exact remediation commit and build, not merely a branch or development
snapshot. Reports must distinguish observed facts, design risks, and unverified
assumptions, and must state whether mainnet remains blocked.

Never place secrets in reports, evidence, commits, or this directory. This
includes private keys, seed phrases, wallet/signing material, RPC credentials
or private URLs, database/object-storage credentials, API tokens, and
environment-file contents. Public addresses, program IDs, transaction
signatures, slots, and SHA-256 fingerprints may be included only as
non-secret evidence identifiers.