# CMC mainnet security review submission

## Submission status

**Review requested: independent security review of a blocked Solana mainnet
release candidate.**

This packet is a factual description of the current repository and its retained
evidence. It is not an audit report, security certification, approval, or
authorization to use real funds. The repository itself states that mainnet is
blocked and not independently audited in
[`contracts/security/README.md`](../../contracts/security/README.md) and
[`contracts/security/REMEDIATION.md`](../../contracts/security/REMEDIATION.md).

The current application exposes a read-only/fail-closed mainnet readiness
surface. Its wallet-signed transaction flows are explicitly devnet-only. The
review requested here should determine what is safe, what is not safe, and
what must be remediated before any separately authorized mainnet operation.

## Executive summary

CMC is a Next.js application with browser-local SOL curve simulations,
informational commodity-reference feeds, public token-image upload/serving, a
server-side Solana/Raydium readiness route, an on-chain indexer, and a bounded
devnet wallet transaction console. The target chain design uses Raydium
LaunchLab with CPMM migration and a CMC Platform PDA. The application currently
does not construct, sign, or submit a mainnet transaction.

The mainnet evidence currently establishes public identities and a read-only
unsigned Squads-to-Raydium proof boundary, not an executed deployment. The
retained Squads proof observed mainnet-beta at snapshot slot `447131839`, used
blockhash/simulation context slot `447131842`, and reached Squads execution and
Raydium `CreatePlatformConfig` before failing at the Platform rent transfer.
That proof records a vault balance of `1,000,000` lamports against
`5,445,760` lamports of Platform rent and sets `safeToPropose: false`.

A later immutable funding observation is indexed as reviewed. At
`2026-09-15T04:12:26.623Z`, it records the vault at `201,000,000` lamports,
an exact minimum funding of `0`, and a separately stated `500,000`-lamport
margin. The evidence boundary is explicitly read-only and does not prove that a
transfer, proposal, signature, or execution occurred. The older failed proof
must not be treated as a current proposal authorization merely because a later
balance observation exists.

No mainnet Platform deployment signature, proposal signature, approval
signature, execution signature, or signed release record is retained in the
repository. The Platform account was required to be absent by the pre-proposal
proof. There is therefore no repository evidence of a deployed CMC Platform
account or of a completed mainnet CMC launch/graduation lifecycle.

### Current release blockers

- No independently verified signed mainnet release record is configured or
  retained.
- Independent security and legal review gates are not recorded as complete.
- The available Squads proof is an unsigned, failed, expiring observation and
  reports `safeToPropose: false`.
- The current proof and later funding observation are different observations;
  the latter does not replace the required fresh governance/program
  handoff-validation proof.
- LaunchLab and CPMM retain the same observed upgrade authority; program
  upgrade risk and operational response require reviewer assessment.
- Devnet graduation evidence is deliberately `not-verified`; the checked-in
  dry-run does not create a mint, Platform PDA, LaunchState, or CPMM pool.
- The API indexer refuses mainnet configuration and is not evidence of a
  production mainnet indexing deployment.

## Architecture and data flow

### Current application paths

1. A browser loads CMC pages and may keep simulation markets, balances,
   metadata, and trade history in `localStorage`. These values are
   attacker-controlled and are not on-chain entitlements.
2. Commodity-reference requests go through the public market-data route to
   external sources. Responses, timestamps, availability, and freshness are
   untrusted. They must not authorize a transaction or imply backing.
3. Token images go from the browser to the unauthenticated Express
   `/storage/token-images` endpoint and then to public object storage. The
   endpoint accepts only PNG/JPEG/WebP magic bytes, limits bodies to 4 MiB,
   and applies a shared 60-upload/15-minute budget. It does not establish
   ownership or privacy.
4. The Solana readiness browser request calls
   `/network/solana?cluster=...`. The server keeps the configured RPC URL in a
   server-side closure, checks the selected genesis hash and finalized
   accounts, and returns sanitized configuration/readiness data. It does not
   return the RPC URL.
5. In devnet mode only, the browser can prepare and simulate Platform, launch,
   buy, and sell transactions, request a separate wallet signature, submit,
   and recover a submitted signature from browser storage. The page explicitly
   blocks these construction/signing flows on mainnet-beta.
6. The API indexer, when explicitly enabled, reads finalized Solana
   transactions/accounts and stores projections, checkpoints,
   reconciliation records, and operational alerts. Its configuration currently
   rejects `mainnet-beta`; it is therefore not a mainnet execution or
   settlement authority.

### Mainnet proof/release path

The read-only mainnet path is:

```text
server configuration
  -> finalized genesis/program/ProgramData/config/account reads
  -> canonical Platform instruction package
  -> canonical Squads vault message and lifecycle bytes
  -> unsigned simulation and funding evidence
  -> reviewer-controlled fresh handoff validation
  -> (future, separately authorized) proposal/sign/submit/execute boundary
```

The proof package intentionally has no signing, send, proposal, confirmation,
or execution method. The proposal boundary
`createMainnetSquadsProposal(...)` revalidates canonical proof, blockhash
expiry, governance, ProgramData, CPMM config, and Platform absence immediately
before invoking a separately supplied writer. A simulated success would still
be evidence for review only, not authorization.

## Mainnet identities, authority, signatures, and slots

The values below are public identifiers recorded in source and/or sanitized
finalized evidence. They are not secrets.

### Cluster and programs

| Role | Identity / observation |
| --- | --- |
| Cluster | `mainnet-beta` |
| Genesis hash | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Upgradeable loader | `BPFLoaderUpgradeab1e11111111111111111111111` |
| Raydium LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` |
| LaunchLab ProgramData | `D2QX47Tv2uhNNwFcnLCyJtLMZ4WGmc7eXxvyEmD6zNUh` |
| LaunchLab deployed slot | `446221802` |
| LaunchLab deployed-code SHA-256 | `4c87da8e9fdeda6daf9d141e409577733d6248ae78f694557176fe2709a09657` |
| LaunchLab observed upgrade authority | `FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK` |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` |
| CPMM ProgramData | `DMawCQzbgNTmbzaESc7o6pvL1KAeetY8zA7jNpzntHhU` |
| CPMM deployed slot | `445763504` |
| CPMM deployed-code SHA-256 | `36537be95ba356056fa38b2847d928078c68bf6cd79b875c140e157e6452cc71` |
| CPMM observed upgrade authority | `FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK` |
| Squads v4 program | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Squads ProgramData | `Fy3YMJCvwbAXUgUM5b91ucUVA3jYzwWLHL3MwBqKsh8n` |
| Squads deployed slot | `302582236` |
| Squads deployed-code SHA-256 | `00f38dd273a3809bba580b3feacd2cf35e0ce174d424852ab9a32a888eaf640e` |
| Squads observed upgrade authority | `null` (immutable in the retained baseline) |

These values are from the
[sanitized Squads proof](../evidence/solana-mainnet-squads-platform-proof.json),
the [reviewed funding observation](../evidence/solana-mainnet-vault-funding-proofs/solana-mainnet-vault-funding-proof-2026-09-15T04-12-26.623Z-feea820371d0.json),
and the pinned implementation. A reviewer must re-read finalized Program and
ProgramData accounts before relying on them.

### Governance, Platform, and transaction identities

| Role | Identity / observation |
| --- | --- |
| Squads multisig | `54BBLCExgxDZZdMVa5CYFdoHAMJSyeZFUppXiBo91uJN` |
| Squads threshold | 2-of-2 |
| Member 1 | `5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf`, permissions mask `7` |
| Member 2 / creator | `Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9`, permissions mask `7` |
| Finalized multisig transaction index | `1` |
| Proposed next transaction index | `2` |
| Vault index | `0` |
| Vault PDA | `F2YSJfgpX76bCWqhAANfbp2gEhzUeTLvLHWxqZZAL5bG` |
| Proposed transaction PDA | `CsbvYPaxVHcLaFsdy1WzQC8gAc79R8KCgkkZkPT7r9hp` |
| Proposed proposal PDA | `A2aRNWxquB7NyftQ7XiHs5YpCSP46mJJtDLgHbt9QSiQ` |
| CMC Platform PDA | `87PieZueSrA3VmuqJGQAF3KL8J56xy6etT3sQzA5CW5h` |
| Platform derivation | `["platform_config", platformAdminWallet]`, bump `254`; the governed vault is the admin wallet in the pinned package |
| CPMM config | `D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2` |
| Squads SDK | `@sqds/multisig` `2.1.4` |
| Raydium SDK | `@raydium-io/raydium-sdk-v2` `0.2.69-alpha` |

The Platform package assigns the governed vault to the listed Platform admin,
claim-fee, lock-NFT, vesting, transfer-fee-extension, platform-creator, and
curve-rule-manager authority inputs. That is the intended unsigned package,
not evidence that a Platform account was created. The retained proof required
the Platform PDA to be absent at the observation.

### Evidence signatures and slots

The repository contains **no live mainnet transaction signature** for a CMC
Platform deployment, Squads proposal, approval, execution, launch, trade, or
graduation. It also contains no signed mainnet release record. The strings
`launch-signature-fixture`, `buy-signature-fixture`, and
`migration-signature-fixture` in
[`scripts/fixtures/solana-launchlab-graduation-input.json`](../../scripts/fixtures/solana-launchlab-graduation-input.json)
are offline fixture values, not chain signatures.

Retained observation slots:

- Squads proof account snapshot: `447131839`.
- Squads proof blockhash context: `447131842`.
- Squads proof simulation context: `447131842`.
- Controlled-validator snapshot capture slot: `447133197`.
- LaunchLab ProgramData deployed slot: `446221802`.
- CPMM ProgramData deployed slot: `445763504`.
- Squads ProgramData deployed slot: `302582236`.

The proof's timestamp is `2026-09-15T02:07:01.381Z`; the indexed funding
observation is `2026-09-15T04:12:26.623Z`. Neither timestamp is a live
authorization window.

## Threat assumptions and trust boundaries

The review should assume:

- the browser, localStorage, form values, public commodity providers, uploaded
  metadata, and injected wallet objects can be malicious or stale;
- RPC responses can be stale, inconsistent, unavailable, rate-limited, or
  served by an untrusted provider;
- program IDs can remain unchanged while upgradeable ProgramData code changes;
- a public key is not a signature, a wallet connection is not consent to spend,
  and a simulation is not settlement;
- API/database projections are not chain truth unless bound to cluster,
  program/account identity, finalized slot, transaction signature, and
  reconciliation evidence;
- public images and metadata have no confidentiality or ownership guarantee;
- governance member private-key custody, RPC credentials, database credentials,
  object-storage credentials, and signing material are confidential and must
  not appear in this packet or repository evidence.

Key boundaries are browser/localStorage to UI; browser to public commodity
route; browser to image API/object storage; browser to server readiness/RPC;
browser to wallet; future transaction builder to wallet/Solana; finalized RPC
to database projections; and devnet/mainnet to the legacy BSC surface. The
root [threat model](../../threat_model.md) provides the full STRIDE-oriented
analysis and scan anchors.

## Authority model

There are two distinct authority layers:

1. **Protocol and deployment authority.** The pinned LaunchLab and CPMM
   ProgramData observations have the same non-null upgrade authority shown
   above. Squads has a null observed upgrade authority in the baseline.
   Reviewers must treat this as a material upgrade/trust assumption, not as
   immutability of Raydium behavior.
2. **CMC governance authority.** The proposed Platform deployment is wrapped
   in the observed Squads multisig with exactly two full-permission members and
   threshold 2. The canonical package uses vault index 0 and next transaction
   index 2. The code validates the independently supplied member set and
   current finalized transaction index before proof generation and again before
   a future writer.

The release record has a separate signing policy. The implementation names
these two public approvers, in order:

- `Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9`
- `5hgkueEk5Y1iNP1Q35hN7iahjivvk4d6zGzKKsnxJaNf`

The default policy requires the exact trusted signer set; the configured
threshold and any role policy are intended to be supplied independently of
the record. No private key or signature is included here, and the record is
not currently present.

## Release controls and current evidence

The server-side readiness gate requires mainnet-specific configuration, the
mainnet genesis hash, exact Raydium IDs, finalized executable/owner checks,
ProgramData addresses, deployed code hashes, slots, upgrade authorities,
Platform PDA derivation/layout/owner, authority account owners, deployment
start slot, review booleans, and a valid signed release record. Any malformed,
missing, stale, mismatched, or failed read keeps activation ineligible.

The signed record schema binds all of those values plus SDK version,
artifact/build identifiers, chain-state fingerprint, approvers, issue/expiry
times, and review assertions. It is canonical JSON with `signatures` excluded
from the Ed25519 signing payload. The verifier requires valid, unique,
trusted, non-expired signatures and compares the complete record with current
configuration and finalized ProgramData baseline.

The unsigned proof additionally:

- reconstructs and byte-compares the three Raydium instruction payloads;
- uses the official Squads serializer and rejects address-table lookups in this
  canonical package;
- checks the exact member set, threshold, permissions, and next index;
- carries finalized account snapshot context through blockhash and simulation;
- checks the CPMM config discriminator/layout and reviewed fields;
- aggregates rent and fee obligations by payer;
- exposes a read-only simulator only; and
- reports `readyToPropose: false` and `safeToPropose: false`.

The [release-control document](../solana-mainnet-release-controls.md) is the
authoritative list of environment controls and approval sequence. Secrets and
private RPC URLs are intentionally omitted from this packet.

### Retained mainnet evidence

- [Squads/Platform proof](../evidence/solana-mainnet-squads-platform-proof.json):
  sanitized mainnet-beta proof; simulation reached governance and Raydium
  Platform creation but failed on Platform rent; `safeToPropose: false`.
- [Original funding evidence](../evidence/solana-mainnet-vault-funding-proof.json):
  earlier read-only funding record, retained as historical evidence.
- [Current reviewed funding observation](../evidence/solana-mainnet-vault-funding-proofs/solana-mainnet-vault-funding-proof-2026-09-15T04-12-26.623Z-feea820371d0.json):
  immutable later observation with vault balance and funding calculations.
- [Funding review index](../evidence/solana-mainnet-vault-funding-proof-index.json):
  stable reviewed/latest pointers and review history.
- [Controlled-validator manifest](../../artifacts/cmc/tests/fixtures/solana-validator/manifest.json)
  and [snapshot lock](../../artifacts/cmc/tests/fixtures/solana-validator/snapshot.lock.json):
  versioned replay identity, hashes, toolchain, capture slot, and coverage.
- [Devnet dry-run output](../solana-launchlab-proof-output.json):
  explicitly `graduationEvidenceStatus: not-verified`,
  `networkTransactionSubmitted: false`, and `realFundsMoved: false`.
- [Devnet evidence procedure](../solana-launchlab-evidence.md): defines what a
  real finalized graduation artifact would require; no such artifact is
  retained here.

## Test commands and existing evidence

Run from the repository root unless a command says otherwise. These commands
are reproducibility instructions, not claims that this submission author ran
them.

```sh
pnpm --filter @workspace/cmc test
pnpm --filter @workspace/cmc run test:validator-snapshot
pnpm --filter @workspace/cmc typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/scripts test
pnpm --filter @workspace/scripts run typecheck
```

The repository's retained BSC foundation evidence records the following
separate, local-only commands:

```sh
cd contracts && pnpm test
```

[`contracts/security/evidence/reconciled-tests.txt`](../../contracts/security/evidence/reconciled-tests.txt)
records 32 passing local Hardhat tests. The earlier 23-test and 13-test records
are historical. These tests are not evidence of a Solana mainnet deployment,
an independent audit, a live fork, or a funded transaction.

The controlled-validator README documents the snapshot command above and says
the harness checks the manifest digest, loaded program bytes, reconstructed
deployed bytes, seeded account hashes, and exact failure behavior. The fixture
coverage is intentionally limited: Squads and LaunchLab are loaded, while CPMM
coverage is identity/config-only because this Platform lifecycle does not
invoke CPMM.

## Known limitations and open risks

1. **No independent security review or approval.** Internal threat modeling,
   local tests, and owner acceptance do not substitute for external review.
2. **No live mainnet CMC deployment proof.** No CMC Platform deployment,
   proposal, approval, execution, launch, buy, sell, or graduation signature is
   retained.
3. **Failed/stale pre-proposal proof.** The retained proof failed because the
   vault had 1,000,000 lamports and Platform rent was 5,445,760 lamports. A
   later funding observation does not authorize reuse of the old blockhash,
   governance snapshot, or proof.
4. **Upgrade authority risk.** LaunchLab and CPMM share the observed
   non-null upgrade authority. The review must assess provider/source,
   upgrade-governance, monitoring, and incident response assumptions.
5. **Platform authority state is unproven.** The pre-proposal proof required
   Platform absence; treasury, LP, and fee-destination relationships still
   require a fresh finalized read after deployment and a separately approved
   policy.
6. **Graduation is unverified.** The devnet output is a deterministic dry run,
   not a finalized launch/buy/migration lifecycle.
7. **Wallet compatibility is not certified.** The UI detects several injected
   wallet shapes, but the page itself says detection is not compatibility
   certification; cross-wallet signing evidence remains required.
8. **Indexer production boundary is incomplete.** Mainnet indexing is rejected
   by the current API configuration. A future mainnet indexer needs reviewed
   RPC failover, finalized backfill, reconciliation, database recovery, alert
   delivery, and cluster-isolated state.
9. **Public input exposure.** Browser simulation data and public images are
   attacker-controlled. The unauthenticated image endpoint has a shared
   process-local budget, not identity-based abuse prevention.
10. **Commodity-data and legal review remain open.** Existing material says
    source licensing, product claims, public fundraising, jurisdiction,
    sanctions/consumer rules, and disclosures require separate review.
11. **Legacy EVM surface is not a fallback.** The BSC foundation has open
    historical/security risks and must remain excluded from Solana release
    claims. Its remediation record explicitly says independent retest and a
    complete external audit remain required.

## Requested reviewer deliverables

Please return:

1. A report for the exact commit and dependencies supplied, with scope,
   methodology, exclusions, assumptions, and source line references.
2. A severity-ranked finding register covering signing, proof freshness,
   account/program identity, authority and fee custody, cluster separation,
   wallet behavior, API/storage inputs, indexing/finality, rollback, and
   operational monitoring.
3. Reproducible proof for each Critical/High finding and a clear distinction
   between an observed defect, a design risk, and an unverified assumption.
4. A remediation and retest plan that binds fixes to a new commit/build
   identifier and does not close a finding based solely on a local simulation.
5. A final evidence checklist specifying the required live finalized
   identities, transaction signatures, slots, signed release record, authority
   policy, RPC provenance, deployment manifest, and operational drill records.
6. An explicit statement that the current state does or does not satisfy the
   reviewer's criteria for moving to a separate release-authorization process.

## Acceptance criteria

The review packet is accepted as complete only when:

- the reviewer confirms the exact in-scope files and exclusions in
  [`security-review-scope.md`](security-review-scope.md);
- every finding has severity, impact, preconditions, evidence, owner,
  remediation, retest status, and residual risk;
- no Critical/High issue affecting signing, account validation, authority,
  settlement, or funds remains unaddressed for the proposed release, or the
  designated release authority records explicit risk acceptance;
- a fresh finalized identity baseline binds program IDs, ProgramData
  addresses, deployed hashes/slots, upgrade authorities, governance,
  Platform/config/authority accounts, and chain-state fingerprint;
- a signed release record is independently verified against the exact build,
  baseline, approval policy, validity window, and review assertions;
- all claimed live operations have finalized transaction signatures and slots,
  while absent operations are explicitly marked absent;
- negative tests cover tampering, drift, expiry, stale context, incorrect
  owners/layouts, transaction-index changes, RPC/database failures, rollback,
  wallet switching, and alert/indexer recovery;
- the reviewer records the known devnet-only, dry-run, fixture, and excluded
  component limitations; and
- any subsequent mainnet enablement remains a separate, explicit,
  signed authorization step. Passing this review does not itself enable
  mainnet or approve real-funds use.

## Outreach email template

**Subject:** Independent security review request — CMC Solana mainnet release candidate

Hello,

We are requesting an independent security review of Commodity Markets Capital's
current Solana/Raydium mainnet release candidate. The repository is currently
fail-closed: mainnet transactions are not submitted, no signed release record
or live CMC deployment signature is retained, and this request is not a request
for security approval or release authorization.

The proposed scope is attached in
`docs/review/security-review-scope.md`; the submission packet is
`docs/review/security-review-submission.md`. It covers the CMC readiness and
release gates, unsigned Squads/Raydium proof boundary, devnet wallet boundary,
browser/API trust boundaries, finalized indexer design, and the listed
operational evidence. The legacy BSC contracts and third-party program source
are excluded as described in the scope.

Please confirm your independence/conflicts, availability, methodology, exact
scope, required access, deliverables, severity convention, remediation/retest
process, and any evidence you require before engagement. Please also identify
all unavailable or excluded components in the report.

Regards,  
CMC release owner
