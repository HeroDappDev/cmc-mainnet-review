# Solana / Raydium LaunchLab evaluation

Status: **GO for a bounded devnet integration; NO-GO for an immediate full rewrite or mainnet launch.**

Reviewed on 2026-09-13 against the official Raydium documentation, the published Raydium SDK v2 interface, the live Raydium devnet configuration endpoint, and the existing CMC BSC foundation. The current npm release checked during this evaluation was `@raydium-io/raydium-sdk-v2@0.2.69-alpha`. Pin the exact SDK release for implementation because the LaunchLab interface is still alpha and has changed between releases.

## Executive decision

CMC is better suited to a branded LaunchLab platform than to finishing its custom BSC/PancakeSwap V2 graduation contract, provided the product accepts Raydium's supported curve and fee boundaries.

The recommended architecture is:

- CMC remains the commodity catalogue, launch experience, curation layer, disclosures, and market-data application.
- Raydium LaunchLab supplies token initialization, bonding-curve custody, buy/sell execution, graduation, and CPMM creation.
- CMC registers a Platform PDA and presents only launches attributable to that platform.
- Native SOL is the first quote asset because it matches the wallet and funding behavior most Solana users already understand. Commodity prices and SOL/USD remain informational references, not settlement pegs.
- Commodity prices remain informational references. A LaunchLab token is not commodity-backed, redeemable, or oracle-pegged.

This recommendation removes the custom V2 graduation discontinuity and pair-initialization recovery burden from CMC. It does not remove legal review, data licensing, frontend transaction safety, platform-key governance, RPC/indexing operations, or the need to review Raydium's program and upgrade risks.

## Reproducible proof

Run:

```sh
pnpm --filter @workspace/scripts run solana:launchlab-proof
```

The command:

1. Reads the official LaunchLab and CPMM program accounts from Solana devnet at finalized commitment and requires both accounts to be executable.
2. Reads Raydium's live devnet LaunchLab configuration list and requires a constant-product, nine-decimal native-SOL configuration.
3. Reproduces the constant-product initialization formulas published in Raydium SDK v2.
4. Simulates one `CMCGLD` launch, a buy, a sell, funding-target completion, and the expected CPMM handoff.
5. Writes an indexer-shaped result to `docs/solana-launchlab-proof-output.json`.

The proof deliberately does **not** load a wallet, create a mint, create a Platform PDA, submit a transaction, request an airdrop, create a LaunchState, or migrate a real pool. It is a read-only devnet verification plus a deterministic dry run. This boundary proves availability and economic compatibility without pretending that transaction execution, account permissions, or funded graduation have been validated.

## Economic compatibility

### Raydium constant-product initialization

The SDK derives virtual reserves from:

- `S`: total supply
- `C`: tokens sold on the curve
- `L`: locked/vested tokens
- `R = S - C - L`: tokens migrated to CPMM
- `F`: total quote fundraising target
- `M`: migration fee from the selected LaunchLab config

The current SDK calculation is:

```text
D  = (F - M) × C / R - F
Vₐ = ((F - M) × C² / R) / D
Vᵦ = F² / D

opening price    = Vᵦ / Vₐ
graduation price = (F - M) / R
```

For the live devnet native-SOL configuration, `M = 0`. With no locked allocation, the price ratio simplifies to:

```text
graduation price / opening price = (C / R)²
```

With 800 million curve tokens and 200 million migration tokens:

```text
(800m / 200m)² = 16
```

Therefore:

| Requirement | LaunchLab-compatible result |
| --- | ---: |
| Total supply | 1,000,000,000 |
| Curve allocation | 800,000,000 |
| CPMM migration allocation | 200,000,000 |
| Opening FDV | 5 SOL |
| Graduation FDV | 80 SOL |
| Net quote target | 16 SOL |
| Opening price | approximately 0.000000005 SOL |
| CPMM opening price | approximately 0.000000080 SOL |
| Price discontinuity | none in the SDK construction, before integer dust/overshoot |

This preserves the coherent **16× Option D ratio** in SOL. Its USD equivalent changes continuously with SOL/USD and is not a protocol guarantee.

Any fixed `$5,000 → $35,000` USD claim is **not compatible** with a fixed SOL curve and all of the following at once under this LaunchLab constant-product construction:

- 1 billion total supply
- 800 million sold
- 200 million migrated
- zero locked allocation
- zero migration fee

If `$35,000` remains mandatory, at least one of the opening valuation, curve/migration allocation, curve type, or fundraising target must change. Do not label the fundraising target as market capitalization; they are different quantities.

### Fees

The live native-SOL devnet global config observed by the proof has a `tradeFeeRate` of `2500` with the SDK's parts-per-million convention, or 0.25%. CMC's initial policy is a fixed 0.50% platform fee and no creator fee, subject to LaunchLab's program-level limits and verification of the deployed Platform PDA.

The existing CMC promise—user-selected 1–3% curve fee split 40% to market-token holders, 30% to CMC buyback, and 30% to treasury—does not map directly to LaunchLab:

- LaunchLab distinguishes protocol, platform, creator, referral/share, and liquidity treatment.
- Post-migration ownership is represented through locked/burned LP treatment and the platform's fee key under the current program behavior.
- LaunchLab does not natively calculate CMC's holder eligibility or execute a CMC buyback.
- Any off-program distribution would introduce a separate custody, indexing, eligibility, claims, governance, and disclosure system.

Decision: remove holder rewards and automatic buybacks from the initial protocol promise. Route the verified CMC platform fee to the governed platform treasury. Treat any future community distribution as a separate, audited proposal.

## Product and protocol fit

| CMC requirement | LaunchLab fit | Decision |
| --- | --- | --- |
| CMC-branded launchpad | Strong | Use a CMC Platform PDA and CMC-hosted UI |
| Permissionless token creation | Strong, within platform/global rules | Allow creation only after metadata and risk checks |
| 1B supply | Supported as a launch parameter, subject to active curve rules | Preserve |
| 800M curve / 200M migration | Supported by constant-product parameters when active config rules permit | Preserve |
| Automatic DEX graduation | Strong | Use CPMM-only migration for new launches |
| Exact custom curve math | Weak | Adopt supported LaunchLab curve, do not fork silently |
| 5 SOL → 80 SOL Option D | Strong with zero migration fee | Preferred launch template |
| Fixed USD thresholds | Incompatible with SOL volatility | Display live reference conversions only |
| 1–3% creator-selected fee | Unconfirmed as stated | Replace with fixed 0.50% CMC platform fee, subject to validation |
| 40/30/30 holder/buyback/treasury | Not native | Remove from initial product promise |
| Commodity reference display | Strong off-chain fit | Preserve as informational catalogue data |
| Commodity peg/backing/redemption | Not provided | Remain explicitly unsupported |
| Existing BSC demo markets/balances | Must not migrate | Keep isolated from Solana identities |

## SOL quote model

The proof uses Raydium's native SOL/WSOL mint identity:

```text
So11111111111111111111111111111111111111112
```

Native SOL offers simpler wallet funding and matches typical Solana launchpad behavior, but it makes every dollar conversion move with SOL/USD. The UI must distinguish:

- quote raised in SOL,
- current USD conversion,
- creation-time reference valuation,
- live market price,
- and the non-pegged commodity reference.

The launch template is fixed in SOL: 5 SOL opening FDV, 80 SOL graduation FDV, and 16 SOL net fundraising. Do not silently freeze SOL/USD or present a USD conversion as a guaranteed market cap.

## Migration scope

### Reusable

- Brand, navigation, commodity catalogue, token imagery, and launch metadata
- Commodity quote fetching and source-timing labels
- General launch and market-page information architecture
- Database transaction boundaries, idempotent journal concepts, health reporting, and the rule that submitted transaction truth survives wallet changes
- Existing disclosures that commodity references are not backing or redemption

### Replace

- Solidity/Hardhat/OpenZeppelin contracts with the official LaunchLab SDK/IDL integration; do not port the custom contract unless LaunchLab proves insufficient
- wagmi/viem/RainbowKit with a reviewed Solana wallet adapter and transaction-confirmation flow
- EVM chain IDs, addresses, approvals, gas estimation, deadlines, receipt replacement semantics, and BscScan links
- Ethereum log-range indexing with Solana signature/account/program-log ingestion
- ERC-20 balance/supply reconciliation with SPL mint, token-account, LaunchState, vault, Platform PDA, and resulting CPMM reconciliation
- EVM transaction hashes/log indexes with Solana signatures/instruction indexes and slot/blockhash finality
- API types that assume 20-byte addresses, numeric EVM chain IDs, EVM block numbers, or 18-decimal units

### Estimated implementation sequence

1. Pin the LaunchLab SDK and read-only RPC/API dependencies.
2. Register or reuse a devnet CMC Platform PDA and document all authority destinations.
3. Build one wallet-signed devnet launch using native SOL and constant-product Option D parameters.
4. Add buy/sell and submitted-signature recovery that does not confuse wallet switching with transaction cancellation.
5. Build a Solana-native indexer projection and reconcile LaunchState/vault/mint balances at finalized slots.
6. Connect indexed markets to CMC pages while keeping browser simulation separate.
7. Exercise actual devnet graduation and verify the resulting CPMM accounts.
8. Reassess fees, governance, legal posture, and program risk before any mainnet work.

This is a substantial chain integration, not a configuration toggle. Most presentation and commodity-data work survives; almost all signing, on-chain data, indexing, and settlement code changes.

## Risk register and release gates

### Protocol and custody

- LaunchLab's standalone program source is not currently published; the SDK IDL is the canonical public interface. Review upgrade authority, audits, admin controls, incident history, and program verification.
- Pin program IDs, GlobalConfig, Platform PDA, quote mint, token programs, CPMM config, and fee destinations by cluster.
- A Platform PDA is an authority-bearing protocol account. Use a separately approved multisig/operational policy; do not treat a browser wallet as production governance.
- Confirm current post-migration locked-LP and burn behavior against the deployed program version immediately before release.

### Economic

- Approve 5 SOL → 80 SOL, 80/20, and 16 SOL funding as one coherent set or recalculate the full set.
- Model integer rounding, buy overshoot, all fee layers, transfer-fee extensions, and actual CPMM opening reserves.
- Fix the platform fee policy at launch; do not let creators select an unreviewed 1–3% range.
- Do not advertise native holder distributions or automatic CMC buybacks unless a separate audited mechanism exists.

### Token and metadata

- Ensure full supply, mint-authority revocation, freeze-authority policy, metadata immutability/update authority, and allowed Token-2022 extensions match LaunchLab requirements.
- Treat uploaded metadata as untrusted public content and preserve current file-type/size controls.

### Indexing and operations

- Index finalized Solana slots/signatures and support RPC gaps, skipped slots, duplicate delivery, account version changes, and backfill.
- Reconcile LaunchState, base/quote vaults, mint supply/authority, Platform PDA, and graduated CPMM accounts directly against chain state.
- Use multiple reviewed RPC providers and monitor slot lag, transaction expiry, priority-fee behavior, program/config changes, and API availability.
- Raydium REST APIs are useful discovery surfaces, not the sole source of settlement truth.

### Legal and data

- Obtain counsel review for commodity-referencing tokens, public fundraising, market access, sanctions/consumer rules, and jurisdictional restrictions.
- Confirm display rights for every commodity-data source.
- Preserve explicit statements that references are delayed/informational and do not establish backing, a peg, redemption, title to commodities, or guaranteed returns.
- Review token names and imagery for trademark and misleading-association risk.

### Mainnet approval gates

Do not submit mainnet launch transactions until all are complete:

- [x] Product owner approves the SOL quote direction and permits replacement of incompatible reward/buyback promises
- [ ] Product owner approves the final 5 SOL → 80 SOL Option D production template after devnet execution
- [ ] Current LaunchLab program/config/SDK version and upgrade controls are reviewed
- [ ] CMC Platform PDA authorities and fee destinations are governed by an approved multisig policy
- [ ] Wallet launch, buy, sell, failure recovery, and real devnet graduation are exercised
- [ ] Solana indexer survives restart/backfill and reconciles direct account state
- [ ] Fee, LP, creator, holder-reward, buyback, and treasury disclosures match implemented behavior
- [ ] Independent security review covers the integration and any separate CMC programs
- [ ] Legal/compliance and commodity-data licensing review is complete
- [ ] A separate explicit mainnet and real-funds authorization is recorded

## Sources

- [Raydium LaunchLab overview](https://docs.raydium.io/products/launchlab/overview)
- [Raydium LaunchLab bonding curve](https://docs.raydium.io/products/launchlab/bonding-curve)
- [Raydium LaunchLab platforms](https://docs.raydium.io/products/launchlab/platforms)
- [Raydium LaunchLab creator fees](https://docs.raydium.io/products/launchlab/creator-fees)
- [Raydium LaunchLab code demos](https://docs.raydium.io/products/launchlab/code-demos)
- [Raydium program addresses](https://docs.raydium.io/reference/program-addresses)
- [Raydium SDK v2](https://github.com/raydium-io/raydium-sdk-V2)
- [Raydium SDK v2 launchpad demo](https://github.com/raydium-io/raydium-sdk-V2-demo/tree/master/src/launchpad)