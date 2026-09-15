# Security review readiness package

**Release status: BLOCKED — NOT INDEPENDENTLY AUDITED — NO RELEASE AUTHORIZATION.**

The project owner has approved merging the current code/readiness work after
self-identifying as an auditor. See [OWNER_ACCEPTANCE.md](OWNER_ACCEPTANCE.md)
for the exact statement and limited scope. This does not close production gates
or establish an independent audit.

**Current code update:** the foundation has since received custody/refund and feed
handover fixes. See [REMEDIATION.md](REMEDIATION.md) for current results and residual
risks. The evidence and findings below describe the initial review baseline unless
explicitly noted; keep them as the before-fix record, not current test totals.

Prepared 2026-09-12 against base commit
`b70c4fa42a4df5819fe8ab25463eb9b9bb280dab`.
Exact input SHA-256 hashes are in `evidence/source-sha256.txt`.
The initial readiness package changed no contract source, governance, economic
choice or mainnet safeguard; subsequent source changes are separately recorded.
This package is internal AI-assisted review and local testing only. No external
reviewer has been engaged, no audit opinion obtained and no funded transaction sent.

## Prerequisites and handoff

Option D has been authorized for local/test-only engineering, with a separate
local graduation candidate. Production policy/configuration approval and final
release evidence remain outstanding. Do not commission a *final-code* opinion on
this foundation and present it as coverage of later implementations.

To arrange independent review, the release owner must:

1. Supply signed economic/configuration decisions from ECONOMIC_SPEC sections 3–6.
2. Freeze implemented final contracts, governance, frontend/indexer integration,
   compiler/lockfiles and deployment manifest by commit plus source/bytecode hashes.
3. Select a qualified external Solidity/EVM reviewer, agree scope, availability,
   independence/conflicts, fee/budget and permission to share the source. This
   package does not book, pay or contact a reviewer.
4. Supply the package below and obtain a written scope/engagement confirmation.
5. Track each finding through remediation and external retest of the exact revised
   candidate; publish the report and limitations with reviewer permission.
6. Obtain separate release authorization only after all specification gates close.

### External review brief (ready to send after the prerequisites)

Review market creation, curve buy/sell rounding/refunds, pooled quote solvency,
multi-market fee custody/withdrawals, quote behavior, source provenance/freshness,
privileged role handoff, graduation/failure recovery, pair griefing, LP custody,
surplus/reward claims, buyback policy and actual deployment configuration.
Include stateful fuzz/invariants, adversarial ERC-20/callbacks, exact pinned Pancake
V2 fork integration and testnet incident rehearsal. Verify frontend/indexer trust
boundaries and disclosures where they affect transaction intent or reward claims.
Require severity, exploit/preconditions, source references, remediation suggestions,
reproducible evidence, retest results and residual risk. Explicitly identify all
excluded components, unverified deployment identities and unavailable tests.

## Gate/evidence record (initial review baseline)

| ECONOMIC_SPEC gate | Current evidence | Status / responsible role |
| --- | --- | --- |
| Signed economics/policies | Spec explicitly awaits approval | Blocked / product owner |
| Approved final implementation | Current migration permanently reverts | Blocked / contract team |
| Unit/accounting tests | `evidence/local-tests.txt`: 13 passing | Partial / contract team; not fuzz or full adversarial evidence |
| Pinned V2 fork integration | No router call in current foundation | Not run / integration team |
| Independent threat/contract review | Root `threat_model.md`; `evidence/internal-review.md` are internal only | Not obtained / external reviewer |
| Remediation and external retest | Findings below remain open | Blocked / contract team + reviewer |
| Wallet transactions/durable indexing | Current implementation is a browser simulation | Blocked / frontend/backend teams |
| Identity/governance verification | Checklist below; no approved mainnet manifest | Not verified / operations |
| Incident rehearsal | Four local characterization tests | Partial; testnet and operator drill not performed / operations |
| Legal/disclosures/data rights | Not assessed by this review | Required / legal/data owners |
| Deployment authorization | None | Blocked / release owner |

## Findings and remediation/retest record (initial review baseline)

Severities describe potential **production** impact, not incidents observed on chain.
No finding is closed by a passing characterization test. These rows describe the
pre-fix baseline, not current implementation behavior. `REMEDIATION.md` is the
current status record: transfer accounting and rounding have local fixes, and
the old-owner keeper issue is locally corrected; independent retest is outstanding.

| ID | Severity / finding | Evidence and prerequisite | Remediation / retest requirement | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | Critical: completed markets have no exit | `Launchpad.sol` active-market guard and permanently reverting `migrateToPancakeV2`; final token sold | Approved new implementation with pending state, recovery, LP/surplus policy; test completion, failure, retry, replay and timeout/redemption reconciliation | Open; known implementation blocker |
| SEC-02 | High: incompatible quote can underfund pooled custody | `setQuoteAllowed` checks decimals, `_executeBuy` credits requested amounts without balance-delta verification; owner must allowlist bad/changeable token | Exact transfer guards plus reviewed asset policy; fee/rebase/callback/malformed-return tokens and multiple markets must never cross-subsidize | Open; defect |
| SEC-03 | High: privileged discretion and incomplete role handoff | `PriceReferenceFeed` keeper map survives ownership transfer; fee recipient/holder payout powers are discretionary | Approved multisig/timelock/payout controls, safe transfer/revocation procedure; test obsolete key, wrong recipient, renunciation and unauthorized payout | Open; local test proves old keeper persists and explicit revocation works, not a governance fix |
| SEC-04 | Low: one-wei conservative final-buy consumption | `_buyAmounts` and economic spec §1 | Reviewed exact-minimum rounding and boundary/property tests before minimal-refund claims | Open; algebraic example only |
| SEC-05 | High: production source provenance/divergence controls absent | Keeper push accepts arbitrary positive prices and timestamps receipt rather than publication | Approved independent source identities/round-time checks/divergence rules; stale/future/nonpositive/deviant/outage tests | Open; design blocker |

Production fixes belong in the approved implementation, not an unapproved rewrite
of this immutable testnet foundation. External review must reconfirm these findings
and add any others; the internal review is not exhaustive.

### Historical test execution / correction record

Command: `cd contracts && pnpm test`, local Hardhat chain 31337, no fork.
Initial-package result: **13 passing**, including four new incident-control tests.
Initial run: nine passed and four fixture deployments failed because `MockQuote`
correctly refuses non-testnet chains. `evidence/local-tests-initial.txt` preserves
that result. The fixture was corrected to use the same ordinary 18-decimal
`CMCToken` as the economic tests; production gates were not weakened.
The full rerun passed (`evidence/local-tests.txt`). This fixture is not an approved
mainnet quote. The suite's “independent proposed ... math” heading means separate
algebra, **not independent auditors or real PancakeSwap integration**.

## Identity verification and pinned integration evidence requirements

**No mainnet quote/router/factory/pair/source identity is verified by this package.**
Do not infer an address from a ticker or treat the unused router interface as an
integration. WBNB is a candidate only. Before fork testing, record the following
in a reviewed manifest; any missing field blocks sign-off:

- Network chain ID; exact finalized fork block number **and block hash**; RPC
  provenance without credential URLs; observed chain/header agreement from a second
  independent provider. A floating `latest` fork is not reproducible.
- Router, factory, WBNB, actual quote and pair addresses, runtime-code Keccak hashes,
  verified source provenance/commit, compiler settings, constructor parameters and
  proxy implementation/admin identities where applicable. Independently compare
  official deployment records and explorer/source artifacts to on-chain code.
- Router `factory()` and `WETH()` links, factory `getPair`, pair `factory`,
  `token0`/`token1`, reserves, actual token balances, LP total supply and custody.
  Verify balance donations even when reserves are zero.
- Quote decimals and transfer/rebase/upgrade/blacklist behavior. Record issuer,
  bridge and depeg risks where relevant. A symbol/decimal match is insufficient.
- USD primary/fallback source addresses or publisher identity, provenance,
  decimals, source round/publication time, age/divergence policy and keeper/owner
  authority. The artificial testnet $1 push is not a verified production source.
- Launchpad/feed/token code, owners, all keepers (including prior owners),
  recipients, multisig owners/threshold, timelock roles/delay and LP destination.
  Review proposed deployment and then compare actual deployment under separate
  authorization; no live deployment is authorized here.

Attach fork command/tool versions, source/manifest hashes and complete results for:

| Required adversarial V2 case | Required assertion | Evidence now |
| --- | --- | --- |
| Clean pair; both token orders | Actual router amounts/LP minted, minimum locked liquidity, approved initial ratio/custody | Not run |
| Pre-created empty pair | Approved deterministic behavior, no double graduation | Not run |
| Pre-seeded pair; dust donation; reserve/balance mismatch | Reject unsafe state atomically and exercise approved recovery | Not run |
| Price movement/minima/deadline failures | No partial transfers/state; exact retry accounting | Not run |
| Malicious token/router callbacks; tax/rebase assets | Reentrancy rejection, exact deltas, no cross-market shortfall | Not run |
| Completion/retries/replay/unused assets | One graduation; zero residual approvals; surplus/fees remain segregated | Not run |

Algebraic LP ratio tests already pass but cannot substitute for any row above.

## Incident runbook and rehearsal record (initial review baseline)

The table preserves initial observations. For current feed handover, use two-step
`transferOwnership` / `acceptOwnership`; acceptance atomically revokes the outgoing
owner as keeper. Inventory and revoke other obsolete keepers explicitly. See
`REMEDIATION.md` for current tests and limits; do not follow the old handover
observation below as current behavior.

Current controls are owner-only, not a guardian/multisig implementation. Use an
isolated local chain for characterization; an authorized testnet deployment with
named operators is required for the eventual operational drill.

| Scenario | Procedure and expected outcome | Observed evidence |
| --- | --- | --- |
| Compromised quote/source | Record affected market/quote and balances; owner disables new creation for quote. Confirm rejection of new markets and ordinary existing exits. Do not call this a global pause: buys also remain enabled | Local test passed; completed-market exits still unavailable |
| Source outage | Stop reference pushes past maxAge; new creation must revert. Existing frozen-reference trades continue. Restore only reviewed source data and reconcile before reopening | Local outage/recovery test passed with fixture price, not real source failover |
| Ownership/keeper handoff | Inventory keepers before transfer; new owner explicitly revokes old key and verifies rejected pushes; appoint verified replacement and check valid push | Local test passed; transfer alone leaves old key active |
| Migration incident | Confirm no migration can execute in this foundation; inventory stranded assets and warn users. Do not promise rescue or change disabled migration without approved new design | Local owner/user/outsider rejection test passed |
| RPC failure/indexer lag | Show unavailable/stale state; stop new transaction preparation, preserve pending hashes, verify alternate chain/headers and reconcile finality before resume | Not rehearsed; real transaction/indexer path absent |
| Reserve shortfall or unauthorized payout | Alert named incident lead; preserve balances/logs/roles; stop new creation and communicate risk. Current code cannot freeze all trading or recover completed markets | Tabletop requirement only; no operational drill |

The eventual testnet drill record must name operator/approver roles, chain and
deployment hashes, scenario timestamps, expected/actual state, transaction receipts,
alerts/detection time, custody reconciliation, recovery verification and approver
sign-off. Do not store private keys, provider credentials or signed secret URLs.
A local test does not prove multisig access, monitoring, RPC failover or operator
availability. All remain release blockers until evidenced.