# Threat Model

## Project Overview

Commodity Markets Capital (CMC) is a Next.js application with browser-local SOL
curve simulation, public commodity-reference feeds, token-image uploads, and a
read-only Solana/Raydium readiness surface. The target execution path is
Raydium LaunchLab on Solana with CPMM migration; the current application does
not construct, sign, or submit transactions. An injected wallet can currently
be connected only to read its public key. A future release may build
LaunchLab, buy, sell, and migration transactions for explicit wallet signing.

The Express API stores public token images. The Solana readiness route performs
server-side RPC checks while keeping RPC credentials out of the browser.
Devnet and mainnet-beta are separate security domains. Legacy BSC/Solidity,
PancakeSwap, and its disabled indexer are isolated development/test surfaces,
not a production entry point or automatic fallback. This document states
release guarantees, not an audit or evidence that those guarantees already
hold.

## Assets

- User SOL, launched SPL tokens, pool liquidity, Raydium protocol fees, the
  CMC platform fee, and the governed treasury destination. Loss or
  misrouting is financial loss.
- LaunchLab/CPMM program identity, token mint and market state, Platform PDA,
  governance authority, fee destinations, LP authority policy, deployment
  slot, and pinned SDK/builder configuration.
- Wallet public-key association and, in a future release, the user's exact
  transaction intent, wallet approval, signatures, blockhash and transaction
  receipts. A public key is not a signature or authorization.
- Browser simulation records, local SOL/token balances, curve parameters and
  metadata. These are user-editable demonstrations and must never become real
  entitlements or on-chain instructions.
- Commodity prices, source/timestamp disclosures and SOL/USD references.
  They are informational inputs, not commodity backing, an oracle, a peg or a
  guarantee of token value.
- Uploaded token images, token/market metadata, storage availability and
  cost. Images are public; RPC credentials, storage credentials and database
  credentials are confidential.
- Finalized Solana event history, indexer checkpoints, projections,
  reconciliation results and audit records used to display on-chain state.

## Trust Boundaries

- **Browser/localStorage to UI:** all simulation records, balances, metadata and
  curve results are attacker-controlled and unauthenticated. A wallet
  connection must not grant authority over this state.
- **Browser to public commodity-feed route to external providers:** provider
  responses, timestamps, coverage and availability are untrusted. The route
  normalizes free public sources and caches failures; it must not turn a stale
  or missing quote into a trade authorization.
- **Browser to Express image API to object storage:** uploads are public and
  unauthenticated for the browser-local preview. The API validates size,
  declared type and magic bytes, uses UUID image identifiers and a shared
  process-local budget. Origin and an unguessable identifier do not establish
  ownership or privacy.
- **Browser to server-side Solana readiness route to RPC:** the browser may
  select devnet or mainnet-beta, but the server owns RPC URLs and performs
  genesis, program-account and finalized-commitment checks. RPC/API results
  are evidence to validate, not authority to trust blindly.
- **Browser to injected wallet:** wallet providers are untrusted page
  dependencies. Public-key connection is distinct from consent; future signing
  must be an explicit user action with a reviewable transaction.
- **Future transaction builder to wallet to Solana:** client inputs, serialized
  instructions, accounts, amounts, slippage, fee destinations and blockhashes
  cross independent trust boundaries. The wallet and the chain, not browser
  state or an API response, determine authorization and settlement.
- **Solana programs/configuration to governance and fee destinations:** a
  Platform PDA, program IDs, mint accounts, authorities and treasury must be
  verified for the selected cluster; symbols, labels and browser configuration
  are not identity.
- **Finalized Solana RPC/indexer to PostgreSQL and public market APIs:** an
  indexer must bind events to cluster, program/address, transaction/log
  identity and finalized slots, then reconcile projections. Database
  projections cannot be treated as chain truth when RPC or finality checks
  fail.
- **Devnet/mainnet and legacy BSC boundaries:** keys, RPC endpoints, IDs,
  mints, fee destinations, data and release flags must never cross clusters.
  `contracts/` and the BSC indexer remain isolated/disabled test code.

## Scan Anchors

- Browser simulation and metadata: `artifacts/cmc/src/lib/store.ts`,
  `artifacts/cmc/src/app/launch/page.tsx`, and
  `artifacts/cmc/src/components/TokenLaunchForm.tsx`.
- Public commodity route and source validation:
  `artifacts/cmc/src/app/market-data/quotes/route.ts` and
  `artifacts/cmc/src/lib/commodity-quotes.ts`.
- Public image upload/serve paths:
  `artifacts/api-server/src/routes/storage.ts`,
  `artifacts/api-server/src/lib/objectStorage.ts`, and
  `artifacts/cmc/src/lib/token-image-upload.ts`.
- Solana configuration/readiness and wallet public-key connection:
  `artifacts/cmc/src/lib/solana-readiness.ts`,
  `artifacts/cmc/src/app/network/solana/route.ts`, and
  `artifacts/cmc/src/app/onchain/page.tsx`.
- Future transaction and release gates must cover Raydium LaunchLab/CPMM
  program IDs, Platform PDA, governance, fee destinations, LP policy, start
  slot, SDK builder and indexer. `contracts/` and the unmounted BSC API indexer
  are legacy isolated/disabled code, not production execution paths.

## Threat Categories

### Spoofing

An attacker can replace a program ID, Platform PDA, mint, treasury, LP
authority, cluster, RPC result, commodity source, wallet provider or metadata
label. The application MUST bind every production identity to the selected
Solana cluster, reviewed deployment/configuration, executable program account,
verified PDA derivation/authority and approved fee destination; symbols and
browser records are insufficient. Readiness MUST verify the expected genesis
hash and Raydium accounts at finalized commitment. Mainnet MUST remain
fail-closed until reviewed IDs, governance, start slot, SDK builder and release
flag are present. A connected public key MUST NOT be represented as a signed
authorization.

### Tampering

localStorage, public feeds, image bytes, metadata, RPC responses and future
client-built transactions can all be modified. Simulation values MUST be
explicitly labeled and MUST NOT authorize real trades. Feed responses MUST
validate schema, symbol, positive values, source and timestamp; unavailable,
delayed and unsupported references MUST remain unavailable or clearly labeled.
Commodity/SOL references MUST NOT alter fixed SOL curve economics or imply
backing.

Before wallet signing, a future builder MUST derive and validate the expected
LaunchLab/CPMM instructions and all account metas against pinned program IDs,
mint, Platform PDA, governance/fee destinations, LP policy, amounts, fees,
slippage, minimums, deadlines and cluster. The UI MUST show the same intent
that is passed to the wallet; it MUST never accept arbitrary program IDs or
unchecked serialized instructions. On-chain confirmation and finalized
account/event reads, not a client success flag, MUST determine settlement.
Expired or near-expiry blockhashes MUST be refreshed and the transaction
rebuilt; retries MUST be explicit and replay-safe, never silently resubmit a
changed or stale transaction.

Uploads MUST remain limited to intended PNG/JPEG/WebP bytes and size, with
server-derived object names and safe content headers. Metadata URLs, names,
symbols, descriptions and social links MUST be length/format validated,
displayed as untrusted content, and MUST NOT inject markup, scripts, or
authority. Public images and metadata MUST not be treated as proof of token
identity or ownership.

### Repudiation

Future wallet-signed actions MUST retain the cluster, wallet public key,
transaction signature, exact intent/configuration version, blockhash and
resulting slot/status. Release/configuration changes MUST identify the
reviewed program IDs, Platform PDA, governance and fee destinations. A
Solana indexer MUST key immutable records by cluster/program/address,
transaction signature and instruction/event identity, and preserve enough
evidence to reconcile a wallet receipt with finalized chain state.

### Information Disclosure

RPC URLs containing credentials, storage credentials, database credentials and
future signing material MUST stay server-side and MUST NOT appear in client
bundles, responses, logs or errors. A wallet public key and uploaded image URL
are public information; the UI and API MUST make no confidentiality claim for
them. Public errors MUST be redacted and MUST not disclose provider URLs,
object paths outside the intended image namespace, stack traces or secrets.

### Denial of Service

Commodity providers and Solana RPCs can time out, return stale data, rate
limit, or disagree. Server calls MUST have bounded timeouts and controlled
refresh/coalescing; feed failures, RPC failures and indexer lag MUST produce
explicit unavailable/not-ready states, never invented prices, balances or
readiness. The public image endpoint MUST enforce its 4 MiB type-checked body
and shared upload budget, while operations accept that the process-local
budget is not identity-based and monitor storage/cost exhaustion.

Blockhash expiry, insufficient fees, congestion and wallet refusal MUST be
recoverable without claiming settlement. Finalized indexing MUST stop or
surface unhealthy state when canonical hashes, durable storage, reconciliation
or finality cannot be verified. No mainnet transaction path may be enabled as
an outage fallback to devnet, an unverified RPC, or the legacy BSC path.

### Elevation of Privilege

The browser MUST NOT choose governance authorities, Platform PDA data, fee
destinations, LP custody, program IDs or release flags. Mainnet configuration
MUST verify that the Platform PDA and governed treasury are the reviewed
destinations and that governance is the approved multisig/timelock or other
documented least-privilege authority. Raydium protocol fees and the fixed CMC
platform fee MUST follow the approved policy; no creator, metadata author,
wallet, RPC provider or client-supplied account may redirect them.

Transaction signing MUST authorize only the user's selected operation, and a
public-key connection MUST never be an implicit signing or spending grant.
Devnet credentials/configuration MUST be unusable for mainnet, and legacy BSC
contracts/indexing MUST remain isolated and disabled rather than serving as a
production fallback.