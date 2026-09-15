# CMC mainnet security review scope

## Purpose and status

This is the reviewer-facing scope for the current Commodity Markets Capital
(CMC) Solana mainnet release candidate. It describes the repository as it
exists today; it is not a security approval, audit opinion, deployment
authorization, or claim that the release is ready for real funds.

The repository's release-control status is explicitly **blocked**. Mainnet
activation is read-only and fail-closed, no signed mainnet release record is
retained in this repository, and the retained pre-proposal proof reports
`safeToPropose: false`. See
[Solana mainnet release controls](../solana-mainnet-release-controls.md) and
the [mainnet Squads proof](../evidence/solana-mainnet-squads-platform-proof.json).

The reviewer should assess the exact commit supplied by the release owner.
This packet does not identify a commit as the immutable candidate because the
repository does not contain a signed release record binding one.

## System under review

### In-scope product and execution boundary

The current target is a CMC-hosted Solana/Raydium LaunchLab integration using
native SOL (WSOL where an SPL token account is required), Raydium LaunchLab
for curve launches and trading, CPMM migration, a CMC Platform PDA, and Squads
governance for the proposed mainnet Platform deployment. Commodity prices and
SOL/USD values are informational references, not settlement oracles, backing,
pegs, redemption rights, or guaranteed returns.

The currently deployed application does **not** provide a mainnet transaction
path. The browser console can prepare and sign devnet transactions, while its
mainnet-beta branch is strictly read-only. The intended reviewer must therefore
review both:

1. the implemented read-only mainnet release gate and unsigned proof boundary;
2. the devnet wallet/signing and receipt-recovery code for cluster separation
   and for risks that would be carried into a future mainnet enablement.

### Exact source artifacts in scope

The following are the exact source files and directories to review. A reviewer
should not infer coverage of similarly named files outside this list without
recording an explicit scope change.

**Build and dependency inputs**

- [`package.json`](../../package.json)
- [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
- [`pnpm-lock.yaml`](../../pnpm-lock.yaml)
- [`artifacts/cmc/package.json`](../../artifacts/cmc/package.json)
- [`artifacts/cmc/next.config.mjs`](../../artifacts/cmc/next.config.mjs)
- [`artifacts/cmc/postcss.config.mjs`](../../artifacts/cmc/postcss.config.mjs)
- [`artifacts/cmc/tsconfig.json`](../../artifacts/cmc/tsconfig.json)
- [`artifacts/api-server/package.json`](../../artifacts/api-server/package.json)
- [`artifacts/api-server/tsconfig.json`](../../artifacts/api-server/tsconfig.json)
- [`artifacts/api-server/tsconfig.typecheck.json`](../../artifacts/api-server/tsconfig.typecheck.json)
- [`scripts/package.json`](../../scripts/package.json)
- [`scripts/tsconfig.json`](../../scripts/tsconfig.json)

**Mainnet release and chain verification**

- [`artifacts/cmc/src/lib/solana-readiness.ts`](../../artifacts/cmc/src/lib/solana-readiness.ts)
- [`artifacts/cmc/src/lib/mainnet-release.ts`](../../artifacts/cmc/src/lib/mainnet-release.ts)
- [`artifacts/cmc/src/lib/solana-mainnet-platform-deployment.ts`](../../artifacts/cmc/src/lib/solana-mainnet-platform-deployment.ts)
- [`artifacts/cmc/src/lib/solana-mainnet-squads-platform-transaction.ts`](../../artifacts/cmc/src/lib/solana-mainnet-squads-platform-transaction.ts)
- [`artifacts/cmc/src/app/network/solana/route.ts`](../../artifacts/cmc/src/app/network/solana/route.ts)
- [`artifacts/cmc/src/app/release/mainnet/route.ts`](../../artifacts/cmc/src/app/release/mainnet/route.ts)
- [`artifacts/cmc/src/app/onchain/page.tsx`](../../artifacts/cmc/src/app/onchain/page.tsx)
- [`artifacts/cmc/src/lib/solana-transactions.ts`](../../artifacts/cmc/src/lib/solana-transactions.ts)
- [`artifacts/cmc/src/lib/solana-wallet-compat.ts`](../../artifacts/cmc/src/lib/solana-wallet-compat.ts)
- [`artifacts/cmc/src/lib/onchain-api.ts`](../../artifacts/cmc/src/lib/onchain-api.ts)
- [`artifacts/cmc/src/lib/onchain-helpers.ts`](../../artifacts/cmc/src/lib/onchain-helpers.ts)
- [`artifacts/cmc/src/lib/onchain-abi.ts`](../../artifacts/cmc/src/lib/onchain-abi.ts)
- [`artifacts/cmc/src/lib/market-receipts.ts`](../../artifacts/cmc/src/lib/market-receipts.ts)

**CMC browser, metadata, and public-data boundary**

- [`artifacts/cmc/src/lib/store.ts`](../../artifacts/cmc/src/lib/store.ts)
- [`artifacts/cmc/src/lib/commodity-quotes.ts`](../../artifacts/cmc/src/lib/commodity-quotes.ts)
- [`artifacts/cmc/src/app/market-data/quotes/route.ts`](../../artifacts/cmc/src/app/market-data/quotes/route.ts)
- [`artifacts/cmc/src/lib/token-image-upload.ts`](../../artifacts/cmc/src/lib/token-image-upload.ts)
- [`artifacts/cmc/src/components/TokenLaunchForm.tsx`](../../artifacts/cmc/src/components/TokenLaunchForm.tsx)
- [`artifacts/cmc/src/app/launch/page.tsx`](../../artifacts/cmc/src/app/launch/page.tsx)
- [`artifacts/cmc/src/app/market/[address]/page.tsx`](../../artifacts/cmc/src/app/market/[address]/page.tsx)
- [`artifacts/cmc/src/app/page.tsx`](../../artifacts/cmc/src/app/page.tsx)
- [`artifacts/cmc/src/app/layout.tsx`](../../artifacts/cmc/src/app/layout.tsx)

**API, indexing, storage, and operational boundary**

- [`artifacts/api-server/src/app.ts`](../../artifacts/api-server/src/app.ts)
- [`artifacts/api-server/src/runtime.ts`](../../artifacts/api-server/src/runtime.ts)
- [`artifacts/api-server/src/routes/index.ts`](../../artifacts/api-server/src/routes/index.ts)
- [`artifacts/api-server/src/routes/chain.ts`](../../artifacts/api-server/src/routes/chain.ts)
- [`artifacts/api-server/src/routes/storage.ts`](../../artifacts/api-server/src/routes/storage.ts)
- [`artifacts/api-server/src/lib/objectStorage.ts`](../../artifacts/api-server/src/lib/objectStorage.ts)
- [`artifacts/api-server/src/lib/objectAcl.ts`](../../artifacts/api-server/src/lib/objectAcl.ts)
- [`artifacts/api-server/src/onchain/config.ts`](../../artifacts/api-server/src/onchain/config.ts)
- [`artifacts/api-server/src/onchain/chain-reader.ts`](../../artifacts/api-server/src/onchain/chain-reader.ts)
- [`artifacts/api-server/src/onchain/indexer.ts`](../../artifacts/api-server/src/onchain/indexer.ts)
- [`artifacts/api-server/src/onchain/store.ts`](../../artifacts/api-server/src/onchain/store.ts)
- [`artifacts/api-server/src/onchain/types.ts`](../../artifacts/api-server/src/onchain/types.ts)
- [`artifacts/api-server/src/onchain/alert-delivery.ts`](../../artifacts/api-server/src/onchain/alert-delivery.ts)
- [`artifacts/api-server/src/onchain/indexer.test.ts`](../../artifacts/api-server/src/onchain/indexer.test.ts)
- [`artifacts/api-server/src/onchain/alert-delivery.test.ts`](../../artifacts/api-server/src/onchain/alert-delivery.test.ts)
- [`artifacts/api-server/src/onchain/sql-store.test.ts`](../../artifacts/api-server/src/onchain/sql-store.test.ts)
- [`artifacts/api-server/src/onchain/sql-store.postgres.test.ts`](../../artifacts/api-server/src/onchain/sql-store.postgres.test.ts)
- [`artifacts/api-server/src/onchain/monitoring.integration.test.ts`](../../artifacts/api-server/src/onchain/monitoring.integration.test.ts)

### Exact test and fixture artifacts in scope

- [`artifacts/cmc/tests/solana-readiness.test.mjs`](../../artifacts/cmc/tests/solana-readiness.test.mjs)
- [`artifacts/cmc/tests/solana-mainnet-platform-deployment.test.mjs`](../../artifacts/cmc/tests/solana-mainnet-platform-deployment.test.mjs)
- [`artifacts/cmc/tests/solana-mainnet-squads-platform-transaction.test.mjs`](../../artifacts/cmc/tests/solana-mainnet-squads-platform-transaction.test.mjs)
- [`artifacts/cmc/tests/mainnet-funding-evidence-retention.test.mjs`](../../artifacts/cmc/tests/mainnet-funding-evidence-retention.test.mjs)
- [`artifacts/cmc/tests/fixtures/solana-validator/controlled-validator.mjs`](../../artifacts/cmc/tests/fixtures/solana-validator/controlled-validator.mjs)
- [`artifacts/cmc/tests/fixtures/solana-validator/verify-snapshot.mjs`](../../artifacts/cmc/tests/fixtures/solana-validator/verify-snapshot.mjs)
- [`artifacts/cmc/tests/fixtures/solana-validator/manifest.json`](../../artifacts/cmc/tests/fixtures/solana-validator/manifest.json)
- [`artifacts/cmc/tests/fixtures/solana-validator/snapshot.lock.json`](../../artifacts/cmc/tests/fixtures/solana-validator/snapshot.lock.json)
- [`artifacts/cmc/tests/fixtures/solana-validator/README.md`](../../artifacts/cmc/tests/fixtures/solana-validator/README.md)
- [`artifacts/cmc/tests/fixtures/solana-validator/launchLab.so`](../../artifacts/cmc/tests/fixtures/solana-validator/launchLab.so)
- [`artifacts/cmc/tests/fixtures/solana-validator/squads.so`](../../artifacts/cmc/tests/fixtures/solana-validator/squads.so)
- [`scripts/src/solana-launchlab-evidence.ts`](../../scripts/src/solana-launchlab-evidence.ts)
- [`scripts/src/solana-launchlab-proof.ts`](../../scripts/src/solana-launchlab-proof.ts)
- [`scripts/src/solana-launchlab-evidence.test.ts`](../../scripts/src/solana-launchlab-evidence.test.ts)
- [`scripts/fixtures/solana-launchlab-graduation-input.json`](../../scripts/fixtures/solana-launchlab-graduation-input.json)

The graduation input contains literal fixture signatures and addresses. They
are test fixtures and must not be treated as live deployment or graduation
evidence.

## Explicitly excluded from this review

The following are not part of the current Solana mainnet release execution
boundary:

- `contracts/` Solidity/BSC code and its test-only Option D candidate. The
  repository describes it as an isolated BSC/testnet foundation and its
  `deploy:mainnet` command refuses deployment. If CMC ever proposes a BSC
  release, this requires a separate scope and deployment-identity review.
- `artifacts/mockup-sandbox/` and visual mockups.
- Third-party Raydium and Squads source beyond the pinned SDK versions and
  observed on-chain identities. The reviewer must assess their integration and
  upgrade/admin assumptions, but this packet does not claim to audit upstream
  programs.
- Any RPC provider, database, object-storage, wallet extension, cloud account,
  CI/CD system, alert destination, or governance key custody not represented in
  the repository. These are deployment evidence and operational-control
  dependencies, not silently assumed in-scope code.
- Real-funds transfers, proposal creation, wallet signatures, mainnet
  transaction submission, and live execution. The current repository has no
  evidence that any of these occurred.

## Review questions

The review must answer, with source references and reproducible evidence:

1. Can a browser, wallet public key, RPC response, public feed, metadata
   object, or API caller select a mainnet program, PDA, authority, fee
   destination, release flag, or signed release policy?
2. Do cluster checks, genesis checks, finalized commitments, ProgramData
   addresses, code hashes, deployed slots, upgrade authorities, account
   owners, discriminators, lengths, offsets, and authority relationships bind
   the exact intended state?
3. Can a malformed, stale, replayed, expired, or changed proof reach a future
   proposal writer or signer?
4. Does the unsigned Squads lifecycle prove account ordering, instruction bytes,
   exact member set, threshold, transaction index, rent/fee obligations,
   simulation context ordering, and atomic rollback without claiming approval?
5. Are browser-local simulations, devnet transactions, finalized indexer
   projections, public commodity data, and uploaded images kept in separate
   trust domains?
6. Can RPC gaps, database failures, slot lag, duplicate delivery, cluster
   recovery, alert delivery failure, wallet switching, blockhash expiry, or
   storage exhaustion create false settlement, stale market history, or
   unauthorized value movement?
7. Are the release and operations controls sufficient to detect program or
   authority changes before real funds are exposed?

## Required reviewer output

The engagement should provide:

- a written report tied to the exact reviewed commit and the files above;
- a severity-ranked finding table with exploit preconditions, affected assets,
  source references, reproducible proof, remediation, and residual risk;
- an explicit list of unreviewed or unavailable dependencies and identities;
- retest results for the exact remediation commit, not only a branch or
  development snapshot;
- a separate statement on whether the current release remains blocked; and
- an operational evidence checklist for any later mainnet authorization.

The reviewer may issue an opinion only for the documented scope and evidence.
The report must not be represented as a release approval or an audit of
components listed as excluded.

## Acceptance criteria for closing the review

The release owner may record the review as complete only when all of the
following are retained in workspace-relative or controlled external evidence:

- the exact source commit, dependency lockfiles, build identifier, and artifact
  identifier;
- a current finalized identity manifest for the LaunchLab, CPMM, Squads,
  ProgramData, CPMM config, Platform, multisig, vault, authorities, and
  relevant token/config accounts;
- the deployed-code SHA-256 values, ProgramData addresses, deployed slots, and
  upgrade authorities for every pinned upgradeable program;
- a signed release record whose Ed25519 signatures are independently checked
  against the intended policy and whose payload matches the current baseline;
- finalized transaction signatures and slots for every authorized deployment,
  governance action, launch, trade, and graduation claimed in scope;
- reproducible positive and negative tests, including stale proof, program
  drift, authority drift, transaction-index drift, malformed account, RPC-gap,
  rollback, wallet-switch, and indexer-recovery cases;
- no unresolved Critical/High issue affecting signing, account validation,
  authority handling, settlement, or fund safety, unless the release authority
  explicitly documents acceptance and the reviewer agrees that it is outside
  the release blocker set;
- legal/data/operational controls are separately approved where the product
  claim or deployment requires them; and
- release enablement is performed only after the signed record and authorization
  are retained, with no secrets copied into evidence.
