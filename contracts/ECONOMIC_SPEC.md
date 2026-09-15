# Curve and PancakeSwap V2 economic specification

Status: **TEST-ONLY OPTION D IMPLEMENTATION AUTHORIZED — not audited and not a
mainnet release.**

This document specifies the existing curve and decision-ready graduation alternatives.
The user explicitly selected Option D ($80,000 terminal cap; 800M curve / 200M LP
allocation) and authorized local/test-only engineering work. This does not authorize
a production deployment, custody arrangement, quote asset, address, operator, reward
release, or mainnet use. The remaining engineering choices are delegated only for a
local/test-only candidate; they are not explicit production economic or custody
signoff. The existing `Launchpad` foundation remains intentionally non-migrating:
its migration entry point always reverts.

Security hardening of the testnet foundation is recorded in
`security/REMEDIATION.md`; it does not approve the production choices below.

## 1. Existing behavior and accounting

Sources reviewed: `src/Launchpad.sol`, `src/MarketToken.sol`,
`src/CMCToken.sol`, `src/MockQuote.sol`, `src/PriceReferenceFeed.sol`,
`scripts/deploy-testnet.ts`, `hardhat.config.ts`, and
`../artifacts/cmc/src/lib/store.ts`.

| Item | Existing definition |
| --- | --- |
| Market supply S | 1,000,000,000 tokens, 18 decimals |
| Curve allocation C | 800,000,000 tokens |
| Reserved allocation L | 200,000,000 tokens, no withdrawal path |
| Opening / terminal cap | $5,000 / $35,000, spot price times **total** supply (FDV), not cash raised |
| Curve fee | Immutable per market, 100–300 bps of gross quote on buys and sells |
| Fee split | 40% holder budget, 30% buyback budget, remainder treasury, including rounding dust |
| First buy | Gross input worth at least $1 at the creation-time reference |
| Completion | Curve closes for both buys and sells; no working DEX exit |

Let u be frozen USD per actual quote token, r = sqrt(7), x virtual market-token
reserve, y virtual quote reserve, Q real net quote proceeds, and p quote per token.
All formulas below use whole tokens for readability; contracts use 18-decimal integers.

```
x0 = C*r/(r-1)
y0 = x0*(5000/S)/u
k = x0*y0
x = x0 - outstanding curve tokens
y ≈ k/x
Q = y-y0                     # NOT y, and NOT cumulative gross trading volume
p = y/x
reference FDV = p*u*S
```

Virtual quote is not deposited capital and cannot be added to liquidity. For each
quote asset, contract custody must cover the sum across its markets of real Q plus
all unspent fee buckets. Unsolicited transfers are not proceeds or fees. Actual
balance deltas must match requested transfers; fee-on-transfer and rebasing assets
are unsupported and must not be allowlisted.

Buy: fee = floor(gross*bps/10000); net = gross-fee;
output = floor(net*x/(y+net)). Decrease x and curve inventory by output, increase
y and Q by net. Sell: gross = floor(tokens*y/(x+tokens)); fee =
floor(gross*bps/10000); user receives gross-fee; Q and y decrease by gross.
Each fee allocates floor(fee*0.4), floor(fee*0.3), and the exact remainder.
Slippage bounds and deadlines apply; outputs of zero revert at execution.

At completion, required net = ceil(remaining*y/(x-remaining)); source computes
the exact minimal consumed gross under a floored fee:
floor((requiredNet-1)*10000/(10000-bps))+1, recalculates its fee, and refunds the
rest without a fee. This replaces the earlier conservative ceiling, which could
consume one extra quote wei. Local regression tests cover execution at 100, 200
and 300 bps; this correction still requires independent review.
Solidity rounds r down at 1e18 precision, x0 up, and initial y0 down; exact caps
are consequently approximate. Integer trade paths also accumulate dust.

## 2. Reproducible discontinuity

With u=$1, ignoring integer dust, and using **net proceeds excluding fees**:

| Quantity | Value |
| --- | ---: |
| x0 | 1,286,100,174.808612 tokens |
| y0 | 6,430.500874 quote |
| terminal x | 486,100,174.808612 tokens |
| terminal y | 17,013.506118 quote |
| real Q | 10,583.005244 quote |
| terminal curve spot | $0.000035 per token |
| V2 price using Q / 200M | $0.000052915026 per token |
| V2 implied opening FDV | $52,915.026221 |

In general Q = C*(5000/S)*r/u, so:

```
(Q/L) / terminalCurvePrice = C/(L*r) = 4/sqrt(7)
                                              = 1.5118578920369088
```

This is a **51.185789% upward spot discontinuity**, not a 7x-continuous migration.
It is independent of u when both prices use the same frozen reference. Curve fees
increase buyers' gross cost, not Q: monotone net raise $10,583.005244 requires
approximately $10,689.904287 gross at 1%, or $10,910.314685 at 3%.
With churn, total fees depend on the trade path. Fees cannot be spent again as LP
proceeds. Live USD prices can differ from reference FDV if the quote asset moves.
A continuous initial reserve ratio is not a guarantee of execution price,
liquidity depth, absence of arbitrage, or commodity price tracking.

## 3. Feasible choices — approval required

| Option | Funding at graduation (u=$1) | Consequence |
| --- | --- | --- |
| A: preserve allocations and caps, partial proceeds | 200M + $7,000 | Continuous opening spot; $3,583.005244 surplus requires explicit ownership/custody policy |
| B: deposit all proceeds, accept jump | 200M + $10,583.005244 | No supply change, but explicitly accept 51.185789% jump and $52,915.03 DEX FDV |
| C: revise allocations, preserve 1bn total and caps | Curve 725,708,114.822568; LP 274,291,885.177432; proceeds $9,600.215981 | Continuous with all proceeds; changes 800M/200M allocation promise |
| D: preserve 800M/200M, revise terminal cap | r=4, terminal $80,000; proceeds $16,000 | Continuous with all proceeds, but changes the $35,000 cap promise |

C follows C/L=r with C+L=S; round allocations to token wei and derive deposit
amounts from actual terminal reserves. Adding 102,371,578.407382 tokens to the
existing 200M would match the original Q, but is **not** a free fix: minting them
changes total supply/FDV, and obtaining them from holders costs funds. Do not
silently mint or divert already purchased tokens.

Recommended candidate for discussion: **A**, only if the user explicitly accepts
the surplus policy and custody risks. Proposed A surplus policy: a segregated,
non-withdrawable quote escrow for pro-rata claims by market-token holders at
completion, excluding launchpad inventory; no treasury sweep, no expiry, no
automatic reinvestment. An immutable claim allocation/root derived from the
completion block requires a challenge/review process before activation and
independent review. This is a proposed responsibility, not an implemented refund.
If this policy is not acceptable, choose another option before implementation.

Separate required decisions (none approved):

1. Option A/B/C/D, any integer tolerances, and surplus ownership.
2. LP custody: irrevocable burn (no withdrawal/rebalancing), or a non-upgradeable
   timelock/locker with exact beneficiary, unlock date and withdrawal policy.
   A discretionary multisig-held LP is not “locked.” Do not promise both permanent
   burning and later fee harvesting.
3. Post-graduation fees: standard V2 swap fees remain with LP economics; the
   launchpad's curve fee splitter does not capture arbitrary router trades.
   Proposed policy: 1–3% and 40/30/30 apply **only on the curve**. Any advertised
   ongoing holder/buyback fees require separate approval and implementation.
4. Quote manifest, feed governance, and reward/buyback policy below.

## 4. Quote assets and reference governance

**Currently executable quote:** only an administrator-allowlisted ERC-20 with
18 decimals; deployment script creates `MockQuote` on BSC testnet 97 and pushes
a clearly artificial $1 reference. No mainnet quote is approved.
Catalogue symbols such as GOLD/WTI and baskets in the browser are not ERC-20
contracts, reserves, redemption claims, or approved trading pairs.

Proposed first production candidate: **WBNB on BSC 56**, as an ERC-20, not native
BNB; exact canonical address and runtime bytecode must be independently verified
and entered in a chain-specific allowlist manifest before approval. Users need
WBNB plus BNB gas, with a separate explicit wrapping transaction if needed.
No address is inferred from a ticker. An alternative 18-decimal stablecoin needs
its own approved identity, issuer/bridge/blacklist/depeg risk review and price feed;
do not force a $1 reference. Supporting 6-decimal quotes needs new normalization.
Commodity references, if displayed with licensed data, remain informational.
There is no commodity custody, backing, peg, or redemption mechanism.

Existing feed: owner configures age limits between 60 seconds and 72 hours and
appoints keepers; keeper pushes any positive value. Timestamp is the push block
time, not source publication time. Owner is initially also a keeper. Feed ownership
transfer now requires acceptance by the pending owner and atomically revokes the
outgoing owner's keeper role on acceptance (also on renunciation). Other keepers
remain until explicitly revoked; the new owner appoints publishers explicitly.
New markets reject stale/missing
references; each market freezes its creation reference. Later changes do not
reprice existing curves, and stale references do not halt existing trading.

Proposed production policy, pending approval: named independent USD source and
fallback source per actual quote; normalize feed decimals and record source round
and source time, reject future/stale/nonpositive rounds. For WBNB, start with a
5-minute maximum source age and reject >10% divergence from an independent source
or last accepted value until a documented manual review. These are candidate
limits, not current guarantees. A 2-of-3 multisig with distinct operators and
48-hour timelock governs sources, keepers and allowlist additions; an emergency
guardian may disable new creation without blocking ordinary exits. Publish events
and reasons. Existing contracts do not implement these controls or source checks.
Do not reinterpret frozen reference caps as continuously oracle-pegged dollar caps.

## 5. Holder distribution and buyback responsibilities

Current holder function is owner-only arbitrary recipient/amount batches; it neither
discovers holders nor enforces eligibility. Protocol release forwards actual quote
assets to configurable recipients; it performs no CMC swap or burn.

Proposed holder policy, awaiting approval: each market's 40% bucket belongs to
holders of **that market token**, not CMC holders. Weekly UTC epochs use
block-time-weighted balances across the epoch, excluding launchpad inventory,
zero/burn addresses and known DEX pair custody; LP beneficial owners are excluded
unless a separately approved look-through rule is implemented. Direct transfers
must be indexed, not just trades. An identified rewards operator publishes the
balance inputs, exclusions, reproducible allocation and reconciliation; a separate
multisig reviews it during a 48-hour challenge period. Use a funded claim contract
with epoch/chain/market/account replay protection, no expiry, and per-account floor
rounding; residual dust carries to the next epoch. No eligible weight means carry
the budget forward. This is not enforced by today's manual batch API.

Buyback policy candidate: 30% stays a quote-denominated earmarked budget until a
named multisig treasury operator publishes and executes an approved CMC purchase
route with explicit minOut/deadline and bounded budget. Publish spend, actual CMC
received, and transaction receipts. CMC liquidity/address, cadence, and maximum
slippage must be approved before purchases. Any subsequent burn requires an
approved token-supported mechanism and verifiable receipt/supply accounting;
sending funds to a buyback recipient is not a burn. No automated buys, burns,
guaranteed buy pressure, or return is promised. Treasury controls the remaining
30% under a published spending policy; none of these fee budgets funds migration.

## 6. Proposed V2 execution contract

Implementation gates after approval:

1. Snapshot final virtual reserves and actual Q on completion, close curve trading,
   and enter `PendingGraduation`, not `Graduated`. Freeze the selected policy at
   market creation; administrators must not change a funded market's economics.
2. For continuous A, set `tokenDesired=L` and
   `quoteDesired=floor(L*yTerminal/xTerminal)` in raw units. Verify
   `quoteDesired <= Q`; escrow `Q-quoteDesired` separately from fees. Specify an
   allowed one-quote-wei price rounding tolerance using cross multiplication.
3. Pin reviewed chain/router/factory/WBNB bytecode and addresses. Verify factory
   pairing and token order. Reject any nonempty, pre-seeded or donated-balance
   pair; do not let an attacker set the initialization ratio. A permissionless
   existing pair can block graduation: require an approved recovery design, not
   an unsafe forced deposit. This unresolved griefing path is a release blocker.
4. Use atomic, reentrancy-protected ERC-20 liquidity addition, bounded exact
   approvals, nonzero token/quote minimums and a finite deadline. Proposed
   maximum deadline horizon 10 minutes and maximum liquidity slippage 50 bps,
   pending approval. Check received balances, actual liquidity used and LP minted,
   including V2 minimum locked liquidity and rounding. Revert atomically on
   any policy mismatch; no partially completed transfer/custody state.
5. Send LP only to the approved custody destination; clear approvals; keep
   all unused assets accounted to their original buckets. Emit pair, amounts,
   reference and actual ratio, LP amount/destination, surplus and policy version.
   Enter `Graduated` exactly once and make retries replay-safe.
6. Failed migration leaves identifiable pending assets and a bounded retry path.
   Before release approve a timeout/cancellation/redemption design so holders
   cannot be stranded indefinitely. Today's completed curves have no such path.

## 7. Browser simulation gap

`store.ts` correctly uses the square-root virtual reserve formula, but stores
wallets, markets and trades in localStorage and uses floating-point values.
Its quote catalogue and $1 basket normalization are illustrative. `curveValueUSD`
is virtual quote valued in USD, **not cash raised**. It rejects oversize final buys
instead of applying contract refunds, can mark `graduated` from a float cap check,
and cannot prove a pair exists. Its statistics are simulated fee budgets and
`actualBurnUSD` remains zero. Preserve simulation labels and separate demo state
from future chain data. Do not migrate local demo balances into real entitlements.

## 8. Release checklist and evidence owners

All boxes below remain release gates, not claims of completed implementation.

- [ ] Product/economic owner signs option, allocations/caps, surplus, LP custody,
  curve-only vs ongoing fee disclosure, quotes, references and reward policy.
- [ ] Contract team implements approved rounding, migration and failure recovery,
  balance-delta guards, access controls and governance. Test the new deployment
  version; never represent the immutable foundation as upgradeable.
- [ ] Contract team supplies unit, property/fuzz and accounting invariant tests
  for buy/sell churn, fee withdrawals, multi-market quote custody, integer extremes,
  rounding and refunds; adversarial token, reentrancy, permissions, stale feed,
  dust donations, pre-created pair, liquidity minima, retries and replay tests.
- [ ] Integration team supplies pinned PancakeSwap V2 fork tests against verified
  router/factory/pair implementations, with hostile pre-seeding and price movement.
  An algebraic LP ratio test alone is not a router integration test.
- [ ] Independent security reviewers complete threat modeling and contract review
  of the final code/configuration; remediate and retest findings. Publish scope,
  limitations and report. This economic specification is **not an audit**.
- [ ] Frontend team replaces demo launches/trades with wallet-signed approvals,
  create/buy/sell calls, correct chain checks, on-chain integer quotes, minOut,
  deadlines, gas/fee/refund breakdowns, rejected/pending/replaced/reverted receipts,
  and chain-confirmed final states. Read RPC connectivity is not a signer.
- [ ] Backend team indexes verified factory/launchpad/token/pair events from the
  deployment block into durable storage, keyed by chain/address and
  txHash/logIndex, with idempotent replay, checkpoints, configurable finality,
  reorg rollback/backfill and direct balance reconciliation. Markets and rewards
  must survive restarts and not trust browser writes; pending events are labelled.
- [ ] Operations team verifies all addresses/bytecode and chain 56 configuration,
  source publication, multisig ownership/keeper revocations, monitoring for reserve
  shortfalls, stale/deviant feeds, failed migration, indexer lag and admin changes.
  Rehearse incident response, source outage, RPC failover and recovery on testnet.
- [ ] Legal/data owners review asset risk, consumer disclosures and display
  licensing; remove unsupported backing, peg, guaranteed reward and burn claims.
- [ ] Release owner collects approvals and reviewed test evidence before a separate
  deployment authorization. Keep `deploy:mainnet` refusal, script chain gates,
  disabled migration and visible simulation labels until reviewed replacements
  actually work. Do not request keys or execute funded transactions for this task.

## Approval record

Decision: **Option D explicitly selected by the user for local/test-only
implementation**: preserve the 800M curve allocation and 200M LP allocation and
revise the terminal cap to $80,000. The user also directed the team to do what is
needed to make that *test-only* candidate work, without providing concrete
production addresses or operators.

Delegated local/test-only engineering choices: immutable LP burn, curve-only fees,
separate fee-bucket accounting with no automated/admin reward or buyback release,
exact-minimal completion rounding, and rejection (rather than bypass) of a
pre-existing or donated pair. The test-only candidate additionally uses an immutable
timeout followed by a permissionless, irreversible token-redemption fallback: holders
return market tokens for pro-rata remaining real curve proceeds, while fee buckets
remain isolated and returned/reserve tokens have no withdrawal path. This only avoids
silently stranding the local candidate when a canonical pair is permanently poisoned;
it is not production recovery, custody, or economic authorization.

No mainnet quote, router, factory, address, LP custodian/operator, reward operator,
buyback route, oracle/source manifest, or release owner has been approved. The
original `Launchpad` source is intentionally left as a non-migrating foundation; a
separate candidate accepts only local Hardhat chain ID 31337 (and explicitly refuses
chain 56) for local tests. Local factory/router/pair mocks do not prove real
PancakeSwap identity or hostile-factory behavior. Its permissionless timeout can win
even if a healthy pair could later graduate, and inaccessible reserve/returned/
poisoned-pair token shares remain permanently locked. Remaining
production blockers include pair-griefing timeout/cancellation/redemption recovery,
independent review, actual quote/router/factory bytecode verification, reference
governance, reward eligibility/claims, buyback execution, wallet transactions and
persistent indexing.
