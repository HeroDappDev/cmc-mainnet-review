# Solana mainnet release controls

Mainnet remains fail-closed. Setting configuration values is not evidence that a review occurred, and no approval flag may be enabled until the corresponding signed or otherwise auditable record is retained by the release owner.

## Signed release record (required)

The booleans below are operational review assertions, not authorization. Before
`activationEligible` can be true, the server must load
`SOLANA_MAINNET_RELEASE_RECORD_JSON` and verify every Ed25519 signature in the
record using the independently configured
`SOLANA_MAINNET_RELEASE_APPROVER_KEYS_JSON` key list. The record is canonical
JSON (object keys sorted lexicographically) with the `signatures` property
excluded from the signing payload. Each signature is base64 over that UTF-8
payload and identifies one approver by its base58 Solana public key. Every
listed approver must be trusted and must sign exactly once.

By default, the independently configured approver key list is an exact signer
set: the record cannot authorize itself by naming only one key from a larger
trusted set. A separately configured quorum may be used instead with
`SOLANA_MAINNET_RELEASE_APPROVAL_THRESHOLD`; role quorum requires
`SOLANA_MAINNET_RELEASE_APPROVER_ROLES_JSON` and
`SOLANA_MAINNET_RELEASE_REQUIRED_APPROVER_ROLES_JSON`. These policy settings
are server-side and are never taken from the signed record.

The record schema is version `1` and includes `cluster`, the mainnet genesis
hash, both pinned Raydium program IDs, Platform PDA and derivation/layout
inputs, fee/treasury/LP authorities and owners/policies, SDK version,
deployment start slot, `artifactId`, `buildId`, every review assertion,
`chainStateBaseline` (the finalized fingerprint plus each program's
ProgramData address, deployed-code hash, deployed slot, and upgrade authority),
`approvers`, `issuedAt`, and `expiresAt`. The server rejects malformed,
future-dated, expired, unsigned, untrusted, or config-mismatched records.
Changing any bound value (including artifact/build identifiers) invalidates the
record; a release record is never a substitute for finalized chain checks.

Required additional settings:

| Environment setting | Meaning |
| --- | --- |
| `SOLANA_MAINNET_RELEASE_RECORD_JSON` | The signed release record JSON |
| `SOLANA_MAINNET_RELEASE_APPROVER_KEYS_JSON` | JSON array of trusted approver public keys |
| `SOLANA_MAINNET_ARTIFACT_ID` | Immutable source/artifact identifier bound into the record |
| `SOLANA_MAINNET_BUILD_ID` | Immutable build identifier bound into the record |
| `SOLANA_MAINNET_CHAIN_STATE_BASELINE_JSON` | Reviewed baseline fingerprint plus ProgramData address, code hash, deployed slot, and upgrade authority for both pinned programs |
| `SOLANA_MAINNET_RELEASE_APPROVAL_THRESHOLD` | Optional independent minimum signer count |
| `SOLANA_MAINNET_RELEASE_APPROVER_ROLES_JSON` | Optional independent public-key-to-role JSON object |
| `SOLANA_MAINNET_RELEASE_REQUIRED_APPROVER_ROLES_JSON` | Optional independent required-role JSON array |

No mainnet record or real-funds authorization is enabled by this repository;
these settings are documented for a future, separately approved release only.

## Unsigned governed Platform deployment package

`solana-mainnet-platform-deployment.ts` builds serialized, immutable Raydium
instruction payloads without exposing a signing, send, proposal, or execute
method. A caller must independently supply the exact two expected Squads
members, the next transaction index, and an immediately-before-proof
baseline for both programs. The proof reads all of those accounts at
`finalized` commitment and fails closed if any value differs.

The proof reconstructs each payload into a fresh `TransactionInstruction` and
compares its program, every signer/writable meta, and its bytes against the
reviewed SDK output. It then uses the official `@sqds/multisig` 2.1.4
serializer and `vaultTransactionCreate` builder to make one canonical wrapped
vault message. The finalized multisig must be owned by the Squads
`PROGRAM_ID`, decode as a threshold-2 Multisig with exactly the independently
supplied two-member set, and have `transactionIndex + 1` equal to the caller's
index. Vault index 0 is derived and must equal the pinned vault; transaction
and proposal PDAs are derived from that same index. The proof records a
SHA-256 fingerprint over this canonical evidence.
The fingerprint also contains the finalized-state object: genesis hash,
Program and ProgramData owners/executable flags, addresses, deployed slots,
code hashes, authorities, the Squads program observation, decoded multisig
address/owner/threshold/member keys and permission masks/transaction index,
and the derived vault/index. A proof cannot be detached from the chain
observations that produced it.

The pinned LaunchLab SDK and live program derive the Platform PDA from
`["platform_config", platformAdminWallet]`. For the governed vault this is
`87PieZueSrA3VmuqJGQAF3KL8J56xy6etT3sQzA5CW5h`, bump `254`. The shorter seed
`"platform"` derives a different address and is not accepted by the live
program.

The preflight boundary verifies mainnet genesis, independently reads finalized
upgradeable Program and ProgramData accounts, confirms the Platform does not
already exist, and checks the finalized CPMM layout. It verifies the canonical
Squads lifecycle transaction (maximum 1232 serialized bytes), one explicit
lifecycle compute-unit ceiling, transaction/proposal rent, lifecycle fees, and the
vault, rent-payer, and execution-payer balances. Its explicit read-only
simulator returns one
simulation for an atomic lifecycle containing vault-transaction creation,
proposal creation/activation, both exact-member approvals, and vault
execution. The transaction and proposal accounts therefore exist earlier in
the same simulation; it does not fetch a nonexistent transaction account.
Missing or malformed compute-unit telemetry fails closed because an atomic
result cannot safely establish separate phase-specific ceilings.
The upgradeable-loader Program discriminant is `2`; ProgramData is decoded
with its option byte at offset `12`, authority bytes `13..44`, and deployed
code starting at offset `45` when authority is present (`13` when absent).
Simulation uses `sigVerify:false`,
`replaceRecentBlockhash:false`, and `commitment:"finalized"`.

Proposal rent is calculated for the worst-case account allocation: the exact
two expected members are supplied in each of the approved, rejected, and
cancelled vectors when sizing the Proposal account. Empty initial vectors are
not used as a rent estimate. Obligations are then aggregated by address:
the rent payer owes transaction plus proposal rent, the execution payer owes
the lifecycle fee, and the vault owes Platform rent. Overlapping addresses
are summed before any finalized balance check.

Before any funding transfer, `buildMainnetFundingEvidence` converts a fresh,
canonical proof into a second canonical record. It lists every obligation
component under its actual payer, records the finalized balance, and calculates
the exact minimum funding as `max(0, aggregate obligation - balance)` per payer.
The reviewed safety margin is supplied separately with a written rationale and
an actual payer address; it is never folded into or described as the exact
minimum. The record fingerprints the finalized state, source-proof fingerprint,
component breakdown, shortfalls, margin, and a fixed read-only authorization
boundary. Missing fee estimation, a missing rationale, a non-payer margin
address, or any mismatch with the source proof fails closed.

Funding evidence does not authorize or perform a transfer. Proposal creation,
signing, submission, execution, and mainnet enablement remain separate,
explicitly authorized release operations. Run
`pnpm --filter @workspace/cmc evidence:mainnet-funding` to write a new immutable,
timestamped record under
`docs/evidence/solana-mainnet-vault-funding-proofs/`; the generator performs
reads only and requires an explicit `SOLANA_MAINNET_RPC_URL`. Exclusive-create
semantics prevent an existing observation from being overwritten.

`docs/evidence/solana-mainnet-vault-funding-proof-index.json` is the stable
review index. Its `reviewedRecord` pointer is preserved by generation, while
`latestObservation` advances to the new immutable record. The index compares
that observation with the reviewed record and lists payer, aggregate amount,
finalized-state, and source-proof fingerprint changes. Any such change sets
`reviewStatus` to `explicit-review-required`; generation does not approve the
new record or change which record is reviewed.
Reviewers promote the current observation only with
`pnpm --filter @workspace/cmc evidence:review-mainnet-funding -- <observation-path> <expected-evidence-fingerprint>`.
The path must name the latest indexed immutable file under
`docs/evidence/solana-mainnet-vault-funding-proofs/`. The command validates the
selected canonical evidence, its exact read-only authorization boundary, the
current reviewed and latest pointers, and the independently supplied expected
fingerprint before replacing `reviewedRecord`. It appends the former pointer
and promoted pointer to `reviewHistory`, then updates only the stable index.
It has no RPC connection, wallet, transfer, proposal, signing, submission,
execution, configuration, or mainnet-enablement capability.
The retained September 15, 2026 observation proves an exact minimum shortfall
of `4,445,760` lamports at the vault, a separately justified `500,000`-lamport
safety margin, and a recommended vault funding amount of `4,945,760` lamports.
The rent payer's Squads transaction rent, proposal rent, and lifecycle fee are
also recorded under its address but require no funding at that observation.
The currently reviewed record is
`docs/evidence/solana-mainnet-vault-funding-proof.json`, as identified by the
stable review index.

`readyToPropose` is always `false`. A successful direct or Squads-path
simulation is evidence for review only and never constitutes approval to
propose, sign, execute, or move funds. The vault's continued Platform-admin
role provides governed mutability; it does not make metadata, fees,
destinations, scales, or authorities permanently immutable.

The pre-proposal Squads proof package pins SDK `@sqds/multisig` `2.1.4`,
transaction index `2`, creator
`Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9`, vault index `0`, and the
two finalized full-permission members. It serializes and fingerprints the exact
vault transaction message, transaction-create instruction, proposal-create
instruction, and vault-execute instruction. Its unsigned atomic simulation
creates the transaction and proposal, records both approvals, enters the real
Squads vault-execution CPI, and calls the real Raydium instructions in one
rolled-back simulation transaction. The proof surface has no send, proposal,
signature, confirmation, or execution method and always reports
`safeToPropose: false`.

The controlled-validator fixture is an immutable versioned snapshot, not a
floating copy of current programs. Its schema binds the mainnet genesis hash,
capture slot, LiteSVM and SDK versions, proof-package fingerprint, reviewed
ProgramData baselines, loaded program binaries, seeded accounts, and explicit
coverage boundaries. A canonical manifest digest is checked against both a
separate lock record and an independent source pin. Program and account bytes
are rehashed before use. Reviewed rotations preserve the prior snapshot, create
a new snapshot ID, and update all three digest surfaces in one reviewed change;
the procedure is documented beside the fixture.

The controlled-validator failure proof deliberately reaches
`VaultTransactionExecute` after transaction creation, proposal creation, and
both approvals, then fails on a malformed late execute account list. Exact
before/after snapshots prove the multisig, vault, non-fee-payer member, CPMM
config, Platform PDA, transaction PDA, and proposal PDA remain unchanged or
absent. The fee payer loses exactly the validator's expected `10,000`-lamport
transaction fee and has no other mutation. This establishes atomic rollback of
temporary governance state rather than inferring rollback from logs alone.

All release-critical accounts are read in one finalized
`getMultipleAccountsInfoAndContext` snapshot. The blockhash and simulation must
use context slots that advance monotonically from that snapshot, and the
simulation must report a context at or after the blockhash context. The proof also binds and rechecks
the Squads v4, LaunchLab, and CPMM ProgramData addresses, deployed slots,
upgrade authorities, and deployed-code SHA-256 values, plus the reviewed CPMM
config and absent Platform account. The snapshot proves only the observation at
its recorded slot. Immediately before proposal creation, the handoff validator
must verify the proof's canonical fingerprint and unexpired blockhash, then
re-read finalized Squads governance, both Raydium programs and ProgramData
accounts, the reviewed CPMM config, and Platform absence. It rejects transaction
index advancement, member or threshold changes, program drift, or any mismatch
between the current finalized state and the reviewed proof.

Any proposal-writing integration must enter through
`createMainnetSquadsProposal(connection, reviewedProof, writer)`. That boundary
awaits the finalized freshness validator immediately before invoking the
writer. The writer has no API that accepts canonical proof JSON or serialized
reviewed proof bytes directly, and it is not called if the proof is malformed,
expired, or no longer matches current governance and program state. This makes
a previously reviewed proof insufficient on its own and keeps future proposal
creation fail closed by construction.

The finalized mainnet simulation currently reaches Raydium
`CreatePlatformConfig` through Squads and then fails at the Platform rent
transfer: the vault has `1,000,000` lamports and Platform rent alone is
`5,445,760` lamports. This failure is retained as a release blocker. A
successful future simulation would still require independent review and
explicit authorization before anyone may create transaction index `2`.
The sanitized finalized observation is retained in
`docs/evidence/solana-mainnet-squads-platform-proof.json`.

## Required governed configuration

The mainnet runtime must use mainnet-specific values for all controls below. Shared or public fallback RPC endpoints are not acceptable for release.

| Control | Environment setting | Required evidence |
| --- | --- | --- |
| Dedicated mainnet RPC | `SOLANA_MAINNET_RPC_URL` | Provider, account owner, operational review, finalized-read support, and incident contact |
| Pinned programs | `SOLANA_MAINNET_REVIEWED_PROGRAM_IDS`, each program's `*_PROGRAM_DATA_ADDRESS`, `*_PROGRAM_DATA_HASH`, `*_PROGRAM_DATA_SLOT`, and `*_UPGRADE_AUTHORITY` | Independent finalized read of the upgradeable ProgramData account, deployed ELF/code hash, deployment slot, and upgrade authority for the exact LaunchLab and CPMM IDs |
| Platform PDA | `SOLANA_MAINNET_PLATFORM_PDA` | Address recorded in the release manifest |
| PDA derivation | `SOLANA_MAINNET_PLATFORM_PDA_SEEDS_JSON`, `SOLANA_MAINNET_PLATFORM_PDA_BUMP` | Reproduced derivation against the pinned LaunchLab program; each seed is typed as `utf8`, `hex`, or `pubkey` |
| Platform account layout | `SOLANA_MAINNET_PLATFORM_ACCOUNT_DISCRIMINATOR_HEX`, `SOLANA_MAINNET_PLATFORM_ACCOUNT_DATA_LENGTH`, and all three reviewed field offsets | Reviewed IDL/version, discriminator, exact length, and byte offsets for treasury, LP, and fee destination fields |
| Fee destination | `SOLANA_MAINNET_PLATFORM_FEE_DESTINATION`, `SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OWNER`, `SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OFFSET`, `SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED` | Destination owner, Platform relationship, and treasury reconciliation procedure |
| Governed treasury | `SOLANA_MAINNET_TREASURY_AUTHORITY`, `SOLANA_MAINNET_TREASURY_AUTHORITY_OWNER`, `SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY`, `SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY_REVIEWED`, `SOLANA_MAINNET_PLATFORM_TREASURY_AUTHORITY_OFFSET` | Multisig program/owner, members, threshold, key custody, rotation, emergency, and reconciliation policy |
| LP authority | `SOLANA_MAINNET_LP_AUTHORITY`, `SOLANA_MAINNET_LP_AUTHORITY_OWNER`, `SOLANA_MAINNET_LP_AUTHORITY_POLICY`, `SOLANA_MAINNET_LP_AUTHORITY_POLICY_REVIEWED`, `SOLANA_MAINNET_PLATFORM_LP_AUTHORITY_OFFSET` | Account owner, locked/burned LP behavior, signer authority, prohibited actions, and emergency procedure |
| Deployment boundary | `SOLANA_MAINNET_DEPLOYMENT_START_SLOT` | Finalized deployment/start slot in the release manifest |
| SDK builder | `SOLANA_RAYDIUM_SDK_VERSION`, `SOLANA_RAYDIUM_SDK_BUILDER_REVIEWED` | Exact pinned SDK version and transaction-builder review |

The treasury and LP policies must identify the governed authority accounts and their account-owner programs. Their review flags must remain false until the actual threshold and custody controls have been approved. A browser wallet or one-person hot wallet is not an acceptable production policy.

## Approval sequence

The release owner enables each boolean only after retaining the named independent record:

1. `SOLANA_MAINNET_PLATFORM_PDA_REVIEWED` and `SOLANA_MAINNET_PLATFORM_PDA_VERIFIED` after the Platform address, derivation inputs, account layout, and authority relationships are reviewed.
2. `SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED` after the fee destination and reconciliation procedure are approved.
3. `SOLANA_MAINNET_INDEPENDENT_SECURITY_REVIEW_COMPLETE` after all findings affecting signing, account validation, authority handling, and fund safety are closed or explicitly accepted.
4. `SOLANA_MAINNET_LEGAL_REVIEW_COMPLETE` after counsel approves the launch scope, commodity references, fundraising access, jurisdiction controls, disclosures, and data licensing.
5. `SOLANA_MAINNET_RELEASE_AUTHORIZATION_RECORDED` after the designated release authority signs the exact release manifest for real funds.
6. `SOLANA_MAINNET_RELEASE_ENABLED` is the final operational enablement and must be set last.

The signed release record must contain the reviewed addresses, pinned program IDs, each ProgramData address/hash/deployment slot/upgrade authority, SDK version, deployment slot, artifact/build identifiers, review record identifiers, approver identities, approval times, and expiry. Secrets and private RPC URLs must not be copied into the record.

## Runtime verification

Before `activationEligible` can become true, the readiness endpoint reads finalized chain state and requires:

- the RPC genesis hash to match Solana mainnet-beta;
- the configured LaunchLab and CPMM IDs to remain exactly equal to the pinned Raydium mainnet IDs;
- the pinned LaunchLab and CPMM accounts to exist, be executable, and be owned by the canonical upgradeable BPF loader;
- each pinned program account to resolve its upgradeable ProgramData account at finalized commitment, with the reviewed ProgramData address, deployed code hash, deployment slot, and upgrade authority;
- the configured Platform PDA to reproduce from the reviewed seed, bump, and pinned LaunchLab program;
- the Platform account to be owned by the pinned LaunchLab program;
- the treasury and LP authorities decoded from the reviewed Platform account offsets to equal the configured governed authorities;
- the Platform discriminator, exact data length, and non-overlapping authority/fee offsets to match the reviewed layout;
- the treasury authority, LP authority, and fee destination accounts to exist and retain their reviewed owners;
- every finalized account-read slot to be at or after the deployment start slot; and
- every governance, review, and explicit release gate above to be complete;
- a cryptographically valid, unexpired release record to match the exact current configuration.

Each response also includes a stable `chainStateFingerprint` over the canonical finalized observations (account slots are excluded because they advance normally). Operators may persist that fingerprint and compare it with the prior reviewed observation; a changed fingerprint must be investigated as chain-state drift. The readiness check itself compares every finalized observation with the pinned configuration on every request, so it does not trust a previously eligible result.

Any malformed input, missing account, RPC failure, pinned-program drift, derivation mismatch, ownership mismatch, layout mismatch, authority mismatch, stale slot, or absent approval keeps activation ineligible; an unexpected fingerprint change is treated as drift and must be investigated before release. These reads are strictly read-only; this gate never enables mainnet or submits a transaction.
