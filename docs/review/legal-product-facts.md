# CMC legal-review product facts

**Purpose.** This is a factual annex for counsel and compliance reviewers. It
describes the implementation and repository documentation observed at the time
of preparation. It is not legal advice, a legal opinion, a regulatory
classification, an approval, or a statement that the product may be offered in
any jurisdiction.

**Status boundary.** The repository contains more than one surface. The
browser-local preview, the limited Solana devnet flow, the read-only indexing
surface, and isolated legacy BSC/Solidity materials must not be described as
one deployed product. The current public launch UI can create and trade a
reviewed devnet market with an explicitly signed wallet transaction; it does
not provide a mainnet flow. Mainnet is fail-closed and the release documents
state that no mainnet or real-funds authorization is enabled by this
repository.

## 1. Client identity and scope inputs

The items below are facts about the operator, business, offer, and intended
deployment. They cannot be inferred from code. Complete them before relying on
this packet:

| Item | Required client input |
| --- | --- |
| Legal entity operating CMC, entity type, formation state/country, registration number, and beneficial owners/controllers | Operating name supplied: **Commodity Markets Capital**. **REQUIRED CLIENT INPUT — no legal suffix, entity type, formation jurisdiction, registration number, or ownership/controllers supplied.** |
| Product, website, application, and protocol names to be used in public materials; trademark permissions | Operating/product name supplied: **Commodity Markets Capital**. Marketing URLs supplied: `https://commoditymarketscapital.app/` and `https://x.com/LaunchOnCMC`. **REQUIRED CLIENT INPUT — trademark permissions and any other approved names remain unresolved.** |
| Principal place of business, offices, employees/contractors, and service-provider locations | Principal/team location supplied: **United States**. **REQUIRED CLIENT INPUT — exact place of business, entity location, offices, personnel, and service-provider locations.** |
| Launch, trading, custody, data, and marketing jurisdictions; target and prohibited countries/states; treatment of sanctioned and high-risk locations | **United States supplied only as the principal/team location, not as a permitted-user or launch jurisdiction. REQUIRED CLIENT INPUT — precise permitted/excluded jurisdictions, states/countries, and sanctioned/high-risk treatment.** |
| Intended customer groups (retail, accredited/qualified, institutional, creators, market makers), age policy, and whether U.S. persons may use each surface | Target users supplied: **Adults**. **REQUIRED CLIENT INPUT — age-verification method, customer categories, and whether U.S. persons or any other jurisdiction's users may use each surface.** |
| Legal/regulatory counsel, compliance officer, incident contact, consumer-support contact, privacy contact, and abuse/takedown contact | Business/compliance contact supplied: **antsags2219@gmail.com**. **REQUIRED CLIENT INPUT — no phone, separate compliance officer, counsel, privacy contact, or abuse/takedown contact supplied.** |
| Fee recipient legal entity, account owner, custody arrangement, fee revenue accounting, and whether the code-configured wallet is held for that entity | Treasury control supplied: **Squads 2-of-2 signatures**. **REQUIRED CLIENT INPUT — legal fee recipient, account owner/beneficial owner, custody, revenue accounting, and confirmation that the configured wallet is held for that recipient.** |
| Final fee schedule, tax treatment, refunds, chargebacks (if any), and changes/reservation language | **REQUIRED CLIENT INPUT — commercial terms** |
| Approved marketing claims, influencers/affiliates, paid campaigns, social channels, and review/approval owner | URLs supplied: `https://commoditymarketscapital.app/` and `https://x.com/LaunchOnCMC`. **REQUIRED CLIENT INPUT — no additional claims, campaigns, influencers/affiliates, paid promotions, or approval owner supplied.** |
| Intended launch date, deployment clusters, and whether any mainnet or real-funds activation is proposed | Desired timing supplied: **As soon as review is done**. **REQUIRED CLIENT INPUT — deployment cluster, specific date, and whether any mainnet or real-funds activation is proposed.** |

Names and public handles visible in the repository (including the CMC label and
the X link used for metadata) are implementation observations only. They do
not establish the legal entity, fee recipient, ownership, endorsement, or an
approved marketing plan.

## 2. Product surfaces and current status

### 2.1 Browser-local preview

The original CMC experience remains a local simulation:

- It stores illustrative markets, trades, balances, and history in browser
  `localStorage`. The simulated wallet starts with 100 SOL in the current
  `store.ts` implementation. Browser storage can be cleared, altered, or lost.
- Local markets use synthetic addresses and are not on-chain assets. The
  homepage excludes browser-local practice tokens from the finalized active
  market list.
- Local buy/sell calculations use a constant-product curve and apply the
  current 0.75% illustrative model fee. The local fee display splits that
  model into 0.25% described as Raydium protocol and 0.50% described as the CMC
  platform portion.
- Local execution updates browser state and creates no blockchain signature,
  settlement, custody relationship, or wallet transaction.
- The local UI has no automatic holder payouts, automatic buybacks, or creator
  fee claims. Local fee figures are accounting displays and do not represent
  money collected by an operator.

The current homepage and launch copy also expose a separate devnet flow. Public
copy should identify which flow a statement addresses and should not use local
simulation data as evidence of live volume, users, liquidity, fees, or
performance.

### 2.2 Solana devnet launch and trade flow

The current implementation contains a bounded, devnet-only Raydium LaunchLab
integration:

1. A user selects one catalogue reference or a basket of one to five
   references, enters token metadata, and may upload an image.
2. The browser connects to an injected Solana wallet. The launch page requires
   Phantom; the auditor console detects several injected providers but does
   not certify compatibility.
3. The app prepares and simulates a transaction against finalized/read
   RPC state. Preparation does not sign.
4. The wallet is shown the transaction and must explicitly approve it. The
   app submits and waits for finalized confirmation. A finalized launch receipt
   stores the mint, signature, creator public key, metadata, and cluster in
   browser storage while the durable index catches up.
5. A confirmed devnet market page can quote and prepare a buy or sell. The
   user reviews the output, slippage, and transaction and explicitly approves
   it in the wallet.
6. Submitted signatures are retained for browser-side recovery independent of
   a later wallet-account switch. The API indexer is read-only and does not
   submit transactions or hold keys.

The ordinary launch page uses `https://api.devnet.solana.com` and the
`devnet` cluster. The auditor console makes `mainnet-beta` read-only:
mainnet transaction construction, signing, and submission are disabled there.
The repository's mainnet controls require a separately signed release record,
finalized chain checks, governance/security/legal gates, and explicit real-funds
authorization. The existence of readiness code or evidence is not approval.

### 2.3 Read-only API and indexing

The Express API currently exposes health, public token-image storage, and
optional read-only Solana chain/indexer routes. The indexer is disabled by
default, accepts pinned program IDs for the configured cluster, uses finalized
commitment, and writes projections/history to durable PostgreSQL when enabled.
It does not custody funds, sign, construct, or submit transactions. The UI
treats indexer output as finalized chain data, not as an order or settlement
service.

## 3. Economic and fee facts

### 3.1 Local model

Current local constants are:

| Parameter | Current implementation |
| --- | ---: |
| Total illustrative token supply | 1,000,000,000 |
| Illustrative curve supply | 800,000,000 |
| Illustrative reserved supply | 200,000,000 |
| Opening illustrative FDV | 5 SOL in current SOL-first UI |
| Illustrative graduation FDV | 80 SOL |
| Illustrative net raise target | 16 SOL |
| Local model fee | 0.75% total |
| Local model split | 0.25% Raydium-labelled portion; 0.50% CMC-labelled portion |
| Holder rewards, automatic buybacks, creator fee | None active in the local UI |

These are model/display inputs. They do not establish a claim about a
commodity, token value, fee collection, or guaranteed market capitalization.
The local simulation has no automatic graduation or live liquidity.

### 3.2 Devnet transaction template

The current devnet transaction boundary pins the following test template:

- six token decimals;
- 1,000,000,000 whole-token supply (1,000,000,000,000,000 base units);
- 800,000,000 whole tokens offered on the curve
  (800,000,000,000,000 base units);
- 200,000,000 tokens not sold on the curve in the template;
- 16 SOL total fundraising target (16,000,000,000 lamports);
- zero locked amount, zero cliff, and zero unlock period;
- native SOL, represented as WSOL where an SPL token account is required;
- LaunchLab trade-fee constant of 0.25%;
- platform-fee constant of 0.50%;
- creator-fee constant of zero in the pinned devnet CMC transaction boundary.

The graduated CPMM configuration has separately decoded protocol, fund, and
creator parameters in code. A CPMM creator-fee parameter exists even though the
configured creator share is zero. Counsel should receive the exact finalized
account state and a fee-flow reconciliation before any production
representation. The repository does not establish that a code constant is the
legal fee recipient, a revenue entitlement, or the final production schedule.

**Fee recipient:** the devnet UI currently labels a CMC treasury/admin public
key as the destination for several platform-related fields. This is an
on-chain configuration observation, not confirmation of the legal owner,
beneficial owner, custody policy, or revenue recipient. The client supplied
**Squads 2-of-2 signatures** as the treasury-control arrangement. **REQUIRED
CLIENT INPUT — identify and document the legal fee recipient, account owner,
beneficial owner, authority, custody/governance arrangement, jurisdictions, and
accounting treatment.**

Users may also pay Solana network fees, account rent, priority fees as
configured, and any protocol/CPMM fees shown by the finalized transaction.
The launch UI tells users that Phantom shows the exact network fee and account
rent before approval. No fiat payment, card payment, withdrawal, or refund
rail is implemented in the reviewed surfaces.

## 4. Commodity and market-reference facts

CMC presents catalogue references for metals, energy, agriculture, livestock,
food, game items, trading cards, water, cars, and currencies. A single
selection uses a catalogue USD reference for display/comparison. A basket of
one to five symbols is normalized to an informational value of 1.00 in the
local model and is not an aggregate commodity index.

The live quote route currently:

- obtains metals (gold, silver, platinum, palladium, copper) from Gold API;
- obtains EUR and JPY daily reference rates from Frankfurter/ECB;
- obtains WTI, Brent, natural gas, gasoline, and heating oil daily government
  observations through FRED/EIA;
- marks other catalogue entries unavailable/display-only;
- returns source, source URL, units, timestamp/status, and explicit
  unavailable records; and
- does not use these references as settlement collateral, a redemption
  mechanism, an oracle for a token, or a guarantee.

The route uses public/free endpoints, caches in process for approximately 30
seconds, and can return stale/unavailable informational results. Data
redistribution rights, attribution obligations, delays, and commercial
entitlements remain a counsel/operator matter. **REQUIRED CLIENT INPUT —
confirm the licensed sources, contractual permissions, attribution, geography,
redistribution, retention, and approved marketing language for each feed.**

Current product copy describes a community token, not a tokenized commodity
title or redemption claim. That is a representation to preserve and test in
legal review, not a legal classification.

## 5. Token creator and platform responsibilities (implementation allocation)

### Creator-provided material

The launch flow accepts a token name, 2–10 character alphanumeric ticker,
optional description (up to 1,000 characters), optional website/X/Telegram
URLs (HTTP(S), valid hostname, no embedded credentials, up to 2,048
characters), and an optional PNG/JPEG/WebP image no larger than 4 MB. The
creator wallet is used as creator/account input for the devnet transaction.

The code validates syntax and file signatures, but does not establish that a
creator owns or may use a name, ticker, image, logo, URL, commodity reference,
copyright, trademark, publicity right, or third-party content. It does not
currently perform identity verification, beneficial-owner verification,
content moderation, sanctions screening, source-of-funds review, securities
review, or a creator attestation workflow.

### Platform-controlled functions

The CMC platform surface selects the reviewed cluster/program/config inputs,
builds the transaction, displays simulation/quote/slippage information,
requests wallet approval, and displays finalized records. A Platform PDA and
associated authorities are used by the devnet integration. The platform
operator must separately define:

- creator admission, prohibited content, impersonation/trademark review,
  market manipulation and wash-trading controls;
- complaints, takedowns, freezes (if technically available), incident
  escalation, and law-enforcement response;
- who owns or controls the Platform PDA, treasury, fee destination, LP
  authority, metadata/update authority, and any mint/freeze authorities;
- review of each launch, creator, token metadata, promotion, and liquidity
  event; and
- record retention, audit access, and evidence of every approval.

These controls are not legal conclusions and several are not implemented in
the current UI. **REQUIRED CLIENT INPUT — identify the actual responsible
entity, personnel, vendors, procedures, service levels, and written policies.**

## 6. Data, privacy, and security facts

The browser stores simulation state and devnet receipts locally. No user
account, login, KYC profile, or server-side trading account is implemented in
the reviewed product. Wallet connection exposes a public key; it does not
itself disclose a private key. A wallet signature and a finalized on-chain
transaction can associate a public key with a launch/trade and are public
chain data.

Token-image uploads are an exception to browser-only persistence. The API:

- accepts unauthenticated raw PNG/JPEG/WebP uploads;
- validates declared type and magic bytes, with a 4 MiB limit;
- uses a server-generated UUID path and no caller-selected object name;
- applies a shared process-local limit of 60 uploads per 15 minutes;
- permits same-origin browser requests when an `Origin` header is supplied;
  and
- serves the stored image publicly, without login or a signed URL, with a
  long immutable cache header.

The code and documentation expressly warn that UUIDs are identifiers, not a
privacy boundary, and that sensitive/identifying images should not be
uploaded. The API has no general authentication, user deletion workflow,
privacy dashboard, consent manager, KYC data store, or rights-request process
in the reviewed routes. Request logging records request ID, method, path, and
response status; the broader production logging/retention configuration is
not established by this packet.

**REQUIRED CLIENT INPUT — privacy controller/processor roles, notices,
retention/deletion, data-subject rights, cookies/analytics, cross-border
transfers, vendors/storage locations, breach response, age data, and contact
address.**

## 7. Current legal/compliance control gaps for review

These are factual implementation observations for counsel, not findings that a
law has been violated:

- no production KYC/KYB, AML program, transaction monitoring, sanctions
  screening, wallet screening, suspicious-activity escalation, or blocked
  address controls are present in the reviewed UI/API;
- no customer agreement, token-creator agreement, privacy notice, risk
  disclosure, fee schedule with legal party names, complaints process, or
  jurisdictional eligibility screen was found in the reviewed product
  surfaces;
- no fiat on-ramp, card payment, bank account, redemption, withdrawal, or
  operator custody ledger is implemented in the reviewed surfaces;
- creator-provided content is syntactically validated but not substantively
  reviewed by the platform;
- current marketing/product language references community tokens, commodity
  references, LaunchLab, fees, market launches, and “capital” branding. The
  client supplied `https://commoditymarketscapital.app/` and
  `https://x.com/LaunchOnCMC` as marketing URLs, but supplied no additional
  claims. **REQUIRED CLIENT INPUT — approved campaign, influencer, affiliate,
  performance-claim, and marketing-approval files remain unresolved;**
- the public quote sources and data entitlements need confirmation; and
- mainnet release controls deliberately keep production activation ineligible
  until the operator supplies governance, security, legal, data, and signed
  release records.

## 8. Source map for reviewers

Primary implementation sources:

- `artifacts/cmc/src/lib/store.ts` — local constants, curve arithmetic,
  browser storage, demo fees and trade records.
- `artifacts/cmc/src/components/TokenLaunchForm.tsx` — metadata validation,
  image handling, wallet approval, devnet launch flow.
- `artifacts/cmc/src/app/market/[address]/page.tsx` — finalized devnet market
  reads, buy/sell preparation, slippage, wallet signing.
- `artifacts/cmc/src/lib/solana-transactions.ts` — pinned devnet cluster,
  accounts, fee constants, template amounts, simulation/submission boundary.
- `artifacts/cmc/src/app/market-data/quotes/route.ts` and
  `artifacts/cmc/src/lib/commodity-quotes.ts` — sources, units, timing, and
  unavailable quote behavior.
- `artifacts/api-server/src/routes/storage.ts` and
  `artifacts/cmc/src/lib/token-image-upload.ts` — public image API behavior.
- `artifacts/api-server/ONCHAIN_INDEXER.md` — read-only finalized indexer,
  storage, health, and operator boundaries.
- `docs/solana-mainnet-release-controls.md` — fail-closed mainnet controls;
  it expressly says these settings do not enable a release.
- `docs/solana-launchlab-evaluation.md`,
  `docs/solana-launchlab-evidence.md`, and `threat_model.md` — intended
  architecture, risk boundaries, and evidence limitations.
