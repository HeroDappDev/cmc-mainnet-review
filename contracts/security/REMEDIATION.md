# Internal security remediation and retest

**Not independently audited. Mainnet release remains blocked.**

This record supersedes baseline statements about uncorrected transfer accounting,
final-buy rounding and feed handover in `README.md` and its historical evidence.
It does not fulfill the broader independent-review requirement or approve graduation,
economic policy, LP custody, a quote/source manifest or use of real funds.

The subsequent owner acceptance in `OWNER_ACCEPTANCE.md` approves merging this
code/readiness deliverable despite the outstanding independent-review scope.
It does not certify that scope as fulfilled. After reconciliation with the local
Option D candidate, the combined suite passed 32 tests; the 23-test evidence below
remains the historical pre-reconciliation record.

## Changes

| Finding | Implementation and local retest | Remaining risk / disposition |
| --- | --- | --- |
| SEC-02: incompatible quote underfunds shared custody | All incoming/outgoing quote transfers check exact debit/credit deltas. Per-quote aggregate liabilities are checked before/after operations. Sells cannot exceed that market's real proceeds. Tests exercise inbound tax, sender surcharge, outbound tax on sell/refund/payout, two-market isolation, transfer rebase, existing shortfall and callback reentrancy. | Locally remediated for tested token behaviors, pending independent retest. Malicious `balanceOf`, changes outside transfers and upgraded assets still require strict asset governance. A shortfall fails closed; this is not a recovery mechanism. |
| SEC-03: old owner retains publishing power | Feed uses OpenZeppelin two-step ownership. Acceptance atomically revokes outgoing owner as keeper. Cancellation/replacement cannot grant authority; unrelated keepers remain explicit. Tests cover unauthorized acceptance, old-key rejection, new publisher appointment, cancellation/replacement and renunciation. | Handover sub-finding locally remediated, pending independent retest. Multisig/timelock, production source rules, arbitrary payouts and separate one-step launchpad ownership remain unresolved. Renouncing can permanently strand administration and leave separately appointed keepers active. |
| SEC-04: excess completion consumption | Exact minimal gross is `floor((requiredNet-1)*10000/(10000-bps))+1`. Tests compare on-chain quotes/execution at 100/200/300 bps and prove one-less gross is insufficient. Existing economics test now asserts the corrected result while retaining the prior ceiling comparison. | Locally remediated, pending independent retest and wider fuzz/extreme-value testing. |
| SEC-01 / SEC-05 | No graduation or production oracle implemented by this remediation. | Open. Completed curves still have no exit; production source provenance/divergence and recovery must be implemented under the approved design. |

Payouts configured to the launchpad itself are no-ops: corresponding fee
liabilities remain available for a later real payout. Protocol release snapshots
destinations, updates liabilities before interaction, and emits only actual
amounts sent. Tests confirm retained budgets release exactly once after destination
correction. This is accounting correctness, not holder eligibility enforcement.

## Verification

- Final reconciled `cd contracts && pnpm test`: **32 passing**, local Hardhat only.
  Raw output: `evidence/reconciled-tests.txt`. Final reconciled source/ABI/compiler/
  dependency hashes: `evidence/reconciled-source-sha256.txt`.
- Pre-reconciliation `cd contracts && pnpm test`: **23 passing**, local Hardhat chain only.
  Raw output: `evidence/security-remediation-tests.txt`.
- `cd contracts && pnpm export:abi`: updated the checked-in Launchpad interface.
- Source/dependency/compiler input hashes and tool versions:
  `evidence/remediation-source-sha256.txt`.
- Internal AI-assisted code review is captured separately, not represented as
  third-party audit evidence. Any reviewer-requested fixes are recorded below.

The earlier log with 13 passing tests is historical. During development, the
existing completion test correctly failed its old conservative-gross assertion;
it was changed to verify the exact-minimal behavior and the full suite rerun.
No RPC credentials, private keys, live fork, deploy command or funded transaction
were used. No application UI/runtime code was changed.

## Deployment compatibility and operations

These are source changes for a **new deployment only**. Existing immutable
launchpad/feed contracts cannot be upgraded to acquire them. Feed ownership
handoff tooling must submit `transferOwnership` and then `acceptOwnership` from
the intended successor; prepare replacement keepers before removing the old role
when continued publication is needed. Inventory and revoke all other obsolete
keepers explicitly. An emergency creation disable does not pause existing trades.

The mainnet command refusal, testnet-only script/MockQuote gates, disabled
migration and visible browser simulation remain unchanged. A complete external
audit and pinned Pancake V2/operational evidence remain required after the final
implementation is available; this internal retest does not replace either.