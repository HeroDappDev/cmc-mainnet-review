# CMC contracts — bounded testnet foundation

This is an **isolated Hardhat package** for Commodity Markets Capital (CMC). The
[economic specification and release checklist](ECONOMIC_SPEC.md) records the user's
explicit **Option D** selection ($80,000 terminal cap; 800M curve / 200M LP) for a
local/test-only candidate. It is not production economics or custody approval. It
contains original Solidity source for:

- `CMCToken`: fixed 100,000,000 CMC supply; no privileged mint function.
- `MarketToken`: fixed 1,000,000,000 token supply per market.
- `MockQuote`: explicitly BSC-testnet-only, 18-decimal faucet token.
- `PriceReferenceFeed`: trusted-keeper USD reference feed.
- `Launchpad`: allowlisted 18-decimal quote curves and fee accounting.
- `TestOnlyOptionDGraduation`: a separate local candidate; it is not an upgrade or
  migration path for `Launchpad`.

It uses **PancakeSwap V2 only** as the future migration target. No Uniswap contracts, routers, or pool integrations are included.

## Status and safety boundary

This package is not audited, not production-ready, and must not be deployed to BSC mainnet. `deploy:mainnet` always exits with a refusal, and `scripts/deploy-testnet.ts` hard-refuses chain ID 56 and every chain other than BSC testnet (97). No deployment commands have been run by this package.

`MockQuote` deploys only on chain 97. Its `$1` feed fixture exists to exercise testnet math; it is **not a stablecoin, commodity, external oracle, or peg**. `PriceReferenceFeed` is an administrator/keeper-pushed reference feed, not a decentralized oracle. Commodity backing, redemption, market making, price-source governance, and mainnet peg support are all unsupported.

## Curve and frozen quote conversion

Every allowed quote token must implement `decimals() == 18`; arbitrary quote tokens are rejected. The owner must allowlist it, configure it in `PriceReferenceFeed`, and a fresh nonzero USD reference must exist. At market creation the current `usdPerToken` is read, the minimum `$1` first purchase is checked, and the conversion is stored in the market as `frozenQuoteUsd`. Subsequent feed changes do not alter that market's curve.

All dollar values use 18 decimals:

```text
total supply       = 1,000,000,000
curve supply       =   800,000,000
reserve supply     =   200,000,000
opening market cap = $5,000
terminal spot cap  = $35,000
```

For a constant-product curve, selling 800m from virtual base reserve `V0` changes spot price by `(V0 / (V0 - 800m))²`. The reserve sizing therefore uses the required square-root ratio:

```text
r  = sqrt(35,000 / 5,000) = sqrt(7)
V0 = ceil(800m × r / (r - 1))
```

The initial virtual quote reserve is calculated from the fresh, frozen USD reference so the opening spot is `$5,000 / 1bn`; the final curve spot approaches `$35,000 / 1bn`. Integer math uses OpenZeppelin full-precision `Math.mulDiv`, explicit ceiling operations at the completion boundary, and a fully accounted rounding-dust assignment to treasury.

Buy and sell require `minOut` and `deadline`. On a completing purchase, a ceiling-rounded **gross** input required to buy the remaining curve tokens is consumed. This can be one quote wei above the exact minimum under the floored fee; see the specification and regression tests. The fee is recalculated from that consumed gross amount; all unconsumed gross input is refunded. The curve does not charge a fee on a refund.


## Production migration remains deliberately disabled

The starter proposal's `reserveTokens / quoteRaised` PancakeSwap V2 seed ratio is incompatible with the final virtual-curve spot. It cannot safely claim a continuous graduation:

```text
LP price / terminal curve price = 4 / sqrt(7) ≈ 1.5119
```

Ignoring trade-fee effects and integer dust, seeding `200m` reserve tokens with all curve quote raised would open the V2 pool roughly **51.2% above** the terminal curve spot. The original zero-minimum, zero-deadline liquidity call also had unsafe execution properties.

Accordingly, `Launchpad.migrateToPancakeV2` permanently reverts in the foundation,
no production router is approved, no production LP can be minted, and no
reserve-token withdrawal path exists. A completed foundation curve closes rather than
pretending it has safely migrated. This intentionally leaves the 200m reserve
unavailable pending a separately reviewed economic design. Do not claim the
production economics are solved.

If a future audited design enables V2, it must at minimum define the discontinuity policy, router/pair validation, nonzero slippage bounds and deadline supplied by the user/governance, exact handling of excess quote, LP custody, fee collection, and adversarial tests. A dead-address V2 LP cannot collect ongoing protocol fees.

## Fees and trusted administration

Curve fees are recorded in the actual quote asset:

- 40%: `holderFees`
- 30%: `buybackFees`
- 30% plus integer dust: `treasuryFees`

`distributeHolderFees` is an `onlyOwner` manual batch transfer. It does not identify holders, calculate eligibility, or distribute automatically. `releaseProtocolFees` is also `onlyOwner`; it forwards the 30% buyback bucket to the configured buyback recipient but **does not swap for or burn CMC**. These recipient settings and distributions are trusted administrative actions. Never market them as automatic rewards or automatic CMC buyback/burn.


## Security hardening (still unaudited)

Quote transfers check exact sender debits and recipient credits. Aggregate
liabilities are checked against custody before and after operations; donations
are not credited as proceeds. A detected shortfall blocks further quote movement.
Fee payouts to the launchpad itself retain their liabilities rather than erasing
them, and release events report only amounts actually sent. These checks still
depend on truthful `balanceOf`; rebasing, transfer-tax and malicious assets are
not approved or supported.

Completing buys use the exact minimum gross under the floored fee. Feed ownership
uses two-step acceptance and revokes the outgoing owner's keeper permission at
handover. Other keepers remain separately administered. This is not production
multisig/timelock governance; renouncing ownership can still strand administration.
See [remediation and retest record](security/REMEDIATION.md) for scope and limitations.
Existing immutable deployments cannot acquire these changes.

## Install, compile, and ABI export

This directory is intentionally outside the root pnpm workspace discovery list. Run commands from `contracts/`:

```sh
pnpm install
pnpm compile
pnpm export:abi
```

`abi/Launchpad.json` is the generated ABI export after compile. Economic regression tests now accompany the specification; see the test instructions below. They do not establish security or implement live PancakeSwap integration.

### Reproduce the economic tests (local only)

```sh
cd contracts # from the repository root
pnpm install --frozen-lockfile
pnpm test
```

The default in-process Hardhat network requires no RPC, wallet key or funded
transaction. Tests instantiate source contracts locally using fixture ERC-20s, a
minimal local V2 factory/router/pair, and adversarial local fixtures only. They cover
reserve conversion, fee accounting, exact-minimal completion/refunds, a deterministic
stateful buy/sell invariant over aggregate same-quote liabilities, fee-on-transfer
rejection, pre-created/donated-and-synced pair rejection, lying-router atomic
rollback, LP burn, failed-input retry, timeout/redemption races, replay, and isolated
fee buckets. Foundation tests also cover exact quote-transfer deltas, custody
shortfalls, hostile callbacks, self-recipient fee accounting and two-step feed
ownership/keeper handover. They are mock/local evidence only: they do **not** call a
real PancakeSwap router and no pinned BSC fork test has been run or claimed.
Wider fuzz/invariant coverage, pinned fork integration, independent review and
operational rehearsal remain release blockers.

### Optional BSC testnet deployment (not executed)

1. Copy `.env.example` to `.env`.
2. Add a BSC testnet RPC endpoint and a testnet-only deployer key locally.
3. Obtain test BNB from an appropriate BSC testnet faucet.
4. Run `pnpm deploy:testnet`.

This deploys the mock quote, seeds its clearly labelled test reference, allowlists it, and writes `deployments/bscTestnet.json`. It does not deploy commodity coins or establish a real commodity market.

## Release blockers

Before any mainnet consideration, obtain independent audits and resolve: trusted/oracle architecture and source governance; commodity legal, backing, redemption and peg design; fee conversion and verifiable CMC burning; holder-distribution design; V2 graduation discontinuity and LP strategy; complete unit/invariant/fuzz/fork tests; threat modeling and incident controls; immutable deployment configuration and bytecode verification; operational monitoring; and legal/compliance review. BSC mainnet deployment remains expressly unsupported until those blockers are resolved in an explicit audited release.

### Local Option D candidate and recovery boundary

`TestOnlyOptionDGraduation` exists solely for local Hardhat testing. It accepts only
Hardhat's chain ID 31337 in its constructor and state-changing entry points; chain
ID 56 has a distinct explicit refusal and every other chain has a non-local-chain
refusal. It has no deployment script, configured router/factory, production quote, privileged
fee-release, surplus sweep, administrator recovery, or governance/reward operator. It computes Option D's
16x curve ratio, uses all **real curve proceeds** (never fee buckets) with 200M
reserve tokens, requires exact minimum amounts and a deadline no more than ten
minutes away, validates router/factory/pair state, and burns LP to the immutable
dead address.

An existing pair — including an empty pair or one with a donated balance — is
rejected. No unsafe forced deposit or pair bypass exists. A completed candidate stays
pending until either safe graduation wins or, after its immutable one-day local
timeout, anybody may irreversibly activate token redemption. Redemption accepts
returned curve tokens for floor pro-rata *remaining real curve proceeds*; it has no
administrator cancellation or sweep. Fee buckets remain isolated. Reserve tokens and
returned tokens are deliberately inaccessible. A poisoned pair's token share remains
locked, so this is not a complete production incident-recovery policy.

The local mock factory/router/pair are behavioral fixtures, not verified PancakeSwap
identity or bytecode proofs: a hostile production factory could report fake pair
semantics. The timeout is also a first-effective-call race and can activate despite a
healthy pair if graduation has not executed in time. The deliberately inaccessible
reserve, returned, and poisoned-pair token shares are permanently locked. These facts
are intentional local safety constraints, not a claim that production recovery is
complete.

These are delegated test-only engineering choices, not explicit production signoff
for LP custody, recovery, fees, a router/factory/quote address, oracle governance,
rewards, or buybacks. A permanently pre-seeded canonical pair remains a production
release blocker requiring independently approved recovery and legal/economic review.
