# CMC legal and compliance review submission

**Confidential review draft — prepared for independent counsel/compliance
review.** This packet is a request for analysis, not legal advice, a legal
opinion, a regulatory filing, a certification, or approval. Nothing here
authorizes deployment, marketing, solicitation, trading, custody, or
mainnet/real-funds activation. Counsel should replace assumptions with
jurisdiction-specific advice and written operator instructions.

## 1. Submission cover sheet

| Field | Value |
| --- | --- |
| Product/brand | **Commodity Markets Capital (CMC)** — operating/product name supplied; legal owner not established. Marketing URLs supplied: `https://commoditymarketscapital.app/` and `https://x.com/LaunchOnCMC` |
| Version / artifact / commit | **REQUIRED CLIENT INPUT — immutable artifact ID, commit, and build ID** |
| Review date | **REQUIRED CLIENT INPUT — date and time zone** |
| Intended launch stage | Desired timing supplied: **As soon as review is done**. **REQUIRED CLIENT INPUT — select local preview, devnet demonstration, or proposed production/mainnet; no specific launch date or cluster supplied** |
| Requesting entity | **Commodity Markets Capital** (operating name only). **REQUIRED CLIENT INPUT — legal name/suffix, entity type, formation jurisdiction, and address** |
| Counsel / reviewer | **REQUIRED CLIENT INPUT — firm, attorney, jurisdiction, and engagement scope** |
| Principal/team location | **United States** supplied. **REQUIRED CLIENT INPUT — exact entity/principal place of business and service-provider locations** |
| Target users | **Adults** supplied. **REQUIRED CLIENT INPUT — age-verification method and customer eligibility** |
| Business contact | **antsags2219@gmail.com** supplied. **REQUIRED CLIENT INPUT — name, phone, and support/escalation details** |
| Compliance/privacy contact | **antsags2219@gmail.com** supplied as the business/compliance contact. **REQUIRED CLIENT INPUT — separate compliance/privacy officer or confirm none** |
| Treasury control | **Squads 2-of-2 signatures** supplied. **REQUIRED CLIENT INPUT — exact multisig, signers, authority policy, and evidence** |
| Fee recipient | **REQUIRED CLIENT INPUT — no legal fee recipient supplied; identify entity, account owner, custody, and accounting.** |
| Target jurisdictions | **United States supplied only as principal/team location. REQUIRED CLIENT INPUT — no permitted/excluded user or launch jurisdictions supplied.** |
| Marketing plan | URLs supplied: `https://commoditymarketscapital.app/` and `https://x.com/LaunchOnCMC`. **REQUIRED CLIENT INPUT — no additional claims, campaigns, affiliates, influencers, paid promotions, or approval owner supplied.** |

The accompanying `docs/review/legal-product-facts.md` is the factual annex.
It identifies code-observed facts and items that require client confirmation.

## 2. Executive product description for review

CMC presents a commodity-reference catalogue and community-token launch
experience. It has four materially different surfaces:

1. a browser-local illustrative SOL curve simulation;
2. a wallet-signed Raydium LaunchLab integration bounded to Solana devnet;
3. public/read-only finalized market and indexer views; and
4. isolated legacy BSC/Solidity test materials that are not a production
   entry point, mainnet deployment, or automatic fallback.

The local simulation does not move blockchain funds. The devnet flow can cause
users to sign and submit devnet SOL/token transactions after transaction
preparation and explicit wallet approval. Mainnet-beta is currently
read-only/fail-closed in the UI and release controls. The repository does not
constitute evidence of mainnet approval or legal clearance.

The product uses commodity and SOL/USD references for informational display.
Current documentation says these references are not commodity backing,
collateral, redemption rights, title, an oracle, a peg, or a guarantee of
token value. The intended token is described as a community token. Counsel is
asked to assess whether the actual language, user flow, economics, marketing,
creator activity, and fee arrangements produce any regulated product despite
those labels.

## 3. Materials supplied and limits

### Supplied implementation/documentation

- `docs/review/legal-product-facts.md` (this packet's factual annex)
- `threat_model.md`
- `docs/solana-launchlab-evaluation.md`
- `docs/solana-launchlab-evidence.md`
- `docs/solana-mainnet-release-controls.md`
- `artifacts/cmc/src/lib/store.ts`
- `artifacts/cmc/src/lib/solana-transactions.ts`
- `artifacts/cmc/src/app/launch/page.tsx`
- `artifacts/cmc/src/components/TokenLaunchForm.tsx`
- `artifacts/cmc/src/app/market/[address]/page.tsx`
- `artifacts/cmc/src/app/market-data/quotes/route.ts`
- `artifacts/api-server/src/routes/storage.ts`
- `artifacts/api-server/ONCHAIN_INDEXER.md`

### Not supplied and required before a final opinion

- legal entity, ownership, corporate structure, and service-provider contracts
  (operating name supplied as Commodity Markets Capital; no legal suffix or
  formation jurisdiction supplied);
- final terms, privacy notice, risk disclosures, fee schedule, creator terms,
  and complaints/takedown policy;
- target/prohibited jurisdictions, geo-blocking design, and customer
  eligibility (United States is supplied as the principal/team location only;
  target users are Adults; no permitted/excluded user jurisdictions supplied);
- KYC/KYB, AML, sanctions/OFAC, transaction-monitoring, and record-retention
  program;
- exact marketing, promotional, influencer, affiliate, and social content (two
  marketing URLs supplied; no additional claims supplied);
- final fee recipient, treasury/LP authorities, custody/governance policy, and
  tax/accounting treatment (Squads 2-of-2 signatures supplied as treasury
  control; no legal fee recipient supplied);
- data-source licenses, redistribution permissions, and attribution approvals;
- security audit, program/upgrade review, wallet support evidence, and
  production incident plan; and
- any proposed mainnet deployment or real-funds authorization.

## 4. Questions presented — securities and investment-product risk

Please analyze, separately for the local preview, devnet transactions, any
future mainnet launch, and any creator-promoted token:

1. Whether the creation, sale, secondary trading, platform fee, fundraising
   target, token allocation, reserved supply, liquidity migration, or
   promotional arrangements could constitute an offer, sale, security,
   investment contract, collective investment, managed product, or other
   regulated instrument in each target jurisdiction.
2. Whether wording such as “capital,” “market,” “value locked,” “market cap,”
   “graduation,” “treasury,” “community,” commodity pair names, projected
   valuations, or expected liquidity could create an investment/return
   expectation or misleading impression.
3. Whether creator conduct, platform curation, fee sharing, metadata control,
   post-launch support, buyback/reward proposals, or liquidity actions change
   the analysis even if the token has no redemption or commodity claim.
4. If any offering is permissible, what registration, exemption, disclosure,
   resale, transfer, investor-eligibility, recordkeeping, communications, or
   intermediary requirements apply?
5. Whether separate treatment is required for creator issuers, platform-owned
   tokens, tokens promoted by CMC, or user-created tokens, and who bears each
   obligation.
6. Required wording and prohibited claims for a risk disclosure, creator
   attestation, fee disclosure, token-page display, social post, and wallet
   confirmation.

Please provide a written conclusion for each jurisdiction and product
configuration, identifying facts that would change the conclusion. Do not
state that the repository's “community token” label resolves the analysis.

## 5. Questions presented — commodities, derivatives, and commodity references

Please analyze:

1. Whether names, symbols, single references, baskets, USD references, live or
   daily data, SOL quotations, or “paired with real commodities” presentation
   could be treated as a commodity interest, commodity-linked instrument,
   derivative, swap, futures-like product, option, retail commodity
   transaction, benchmark, index, or regulated commodity-promotion activity.
2. Whether any interface, token metadata, creator statement, or CMC marketing
   implies physical backing, title, delivery, storage, redemption, hedging,
   price tracking, or guaranteed correlation.
3. Whether the 1–5 item basket, normalized basket value, or reference-data
   methodology needs methodology, benchmark, licensing, conflicts, or
   manipulation disclosures.
4. Whether public quote sources can be used, cached, displayed, or
   redistributed for each audience and jurisdiction, and what attribution or
   contractual restrictions apply.
5. Whether the platform or creator could be viewed as arranging, dealing,
   soliciting, advising on, or operating a commodity/derivatives market.
6. Required separation between informational reference data and any actual
   settlement price, and required stale/unavailable-data disclosures.

Requested written output: jurisdiction-by-jurisdiction classification,
permitted presentation, mandatory disclosures, data-license requirements, and
facts that would require disabling a reference, basket, or market.

## 6. Questions presented — money transmission, custody, and payments

Please assess:

1. Whether preparing, submitting, routing, or facilitating devnet/mainnet SOL,
   WSOL, SPL tokens, platform fees, creator fees, LP assets, or migrated
   liquidity could constitute money transmission, payment services, custody,
   exchange, broker/intermediary, or virtual-asset service activity.
2. Whether the browser-local wallet and injected wallet connection are
   sufficiently separated from any operator custody or control, and whether
   any Platform PDA, treasury, fee wallet, LP authority, or mint authority
   changes that analysis.
3. Whether a platform fee collected through a protocol account is received for
   the operator, a principal, a third party, creators, or users, and what
   contractual/accounting disclosures and licensing consequences follow.
4. Whether transaction construction, slippage, account rent, priority fees,
   failed transactions, refunds/unused SOL, and post-migration liquidity create
   payment, disclosure, or consumer obligations.
5. Required segregation, reconciliation, safeguarding, multisig, withdrawal,
   audit, and incident controls if production funds are ever enabled.

**Required operator record:** **REQUIRED CLIENT INPUT — identify every person
or entity that can control, sign, receive, spend, withdraw, upgrade, pause,
route, or change fee/LP/treasury/mint authorities, and describe custody.**

## 7. Questions presented — AML, sanctions, and OFAC

Please assess the controls required for every intended geography and
participant type, including:

- KYB/identity verification for the operating entity and creators;
- customer identification, age/eligibility, beneficial-owner, source-of-funds,
  and enhanced due diligence requirements;
- sanctions/OFAC screening at onboarding, wallet connection, creator launch,
  transaction preparation, transaction submission, fee receipt, and
  withdrawals/claims (if later added);
- blocked jurisdictions, sanctioned addresses, mixers/privacy tools,
  high-risk counterparties, suspicious activity, escalation, reporting,
  freezes, rejection, and appeal procedures;
- blockchain analytics provider, alert thresholds, false-positive handling,
  retention, audit trail, and vendor locations; and
- whether permissionless metadata, public images, and creator/social links
  require moderation or sanctions controls.

The reviewed code does not show a KYC/KYB, sanctions, wallet-screening, AML
monitoring, suspicious-activity, or blocked-address control. That is an
implementation fact, not a conclusion that a particular regime applies.
**REQUIRED CLIENT INPUT — proposed AML/OFAC program, responsible officer,
vendors, jurisdictions, retention, and go-live gate.**

## 8. Questions presented — consumer protection and market integrity

Please review:

1. Whether UI labels, simulated balances, seed markets, volume/statistics,
   fee displays, “active markets,” “finalized,” “graduated,” “market cap,”
   “price,” “value locked,” “real commodities,” or “launch” could mislead a
   reasonable user about reality, value, liquidity, performance, or
   availability.
2. Required separation and labeling of local simulation, devnet assets, and
   any future production assets, including age/minor controls and accessibility
   disclosures.
3. Clear presentation of total fees, network fees, account rent, slippage,
   price impact, unused/refunded input, failed/reverted transactions, finality,
   irreversibility, loss of funds, volatility, liquidity, mint/freeze/update
   authority, and no-guaranteed-value risks.
4. Creator responsibilities for truthful descriptions, impersonation,
   trademarks, copyrighted images, paid promotion, conflicts, manipulation,
   wash trading, misleading claims, and user complaints.
5. Whether fees, terms, disclosures, cancellation/refund rights, customer
   support, error handling, and complaint escalation meet applicable
   consumer-protection standards.
6. Required market-integrity surveillance or prohibitions for creator and
   platform accounts, including self-trading and artificial volume.

Please review the exact public copy and approve a claims matrix before launch.
The client supplied `https://commoditymarketscapital.app/` and
`https://x.com/LaunchOnCMC` as marketing URLs and supplied no additional
claims. **REQUIRED CLIENT INPUT — final marketing library, audience, campaign
calendar, influencers/affiliates, compensation, substantiation, and approval
owner.**

## 9. Questions presented — privacy, data, and security

Please assess:

- controller/processor or equivalent roles for the operator, API host,
  object-storage provider, RPC providers, quote providers, wallet providers,
  analytics, and monitoring vendors;
- public wallet addresses, signatures, IP/request logs, metadata, social URLs,
  uploaded images, device/browser data, cookies, and support data;
- notice, consent, lawful basis, data minimization, access/deletion,
  correction/objection/portability, retention, minors, and cross-border
  transfer requirements;
- the fact that uploaded images are public, cached for approximately one year,
  and not tied to authenticated ownership in the reviewed route;
- breach, abuse, takedown, copyright, and unlawful-content response;
- whether any future KYC/AML data may be placed in browser storage or public
  chain metadata; and
- security disclosures for injected wallets, public RPC, public chain history,
  local storage, transaction simulation, metadata URLs, and immutable
  transactions.

**REQUIRED CLIENT INPUT — privacy notice owner, DPO/privacy contact if
required, vendor list and locations, retention schedule, rights workflow,
cookie/analytics inventory, and incident response plan.**

## 10. Terms, disclosures, and operational documents requested

Please draft or approve, before any non-internal release:

1. **Terms of use:** entity, eligibility, geography, wallet responsibility,
   local/devnet/mainnet separation, prohibited conduct, content license,
   transaction irreversibility, fees, taxes, disclaimers, limitation/notice
   provisions, governing law, dispute process, changes, suspension, and
   contact.
2. **Creator terms and attestation:** authority/ownership, truthful metadata,
   sanctions and prohibited persons, no unauthorized investment/commodity
   claims, IP rights, disclosure of compensation/conflicts, manipulation
   prohibition, cooperation, takedown, indemnity where appropriate, and
   allocation of token/mint/metadata responsibilities.
3. **Risk disclosure:** loss/volatility, no guaranteed value or liquidity,
   no commodity backing/redemption, quote/data limitations, fees, slippage,
   smart-contract/program/RPC/wallet risks, key loss, public-chain
   irreversibility, devnet/testnet status, and no mainnet availability unless
   separately approved.
4. **Fee schedule:** local model versus actual protocol/CPMM fees, network
   fee/rent/priority fee, destination and recipient, timing, changes,
   non-refundability (only if approved), and examples.
5. **Privacy notice:** browser storage, wallet/public-chain data, public images,
   quote/RPC/API vendors, retention, rights, transfers, security, and
   contacts.
6. **Acceptable-use/content policy:** sanctions, fraud, manipulation,
   impersonation, IP, unlawful content, sensitive data/images, creator
   obligations, reporting, review, takedown, and appeal.
7. **Data-source notices and methodology:** source, unit, timestamp,
   frequency, delay, failure behavior, license/attribution, and statement that
   references do not settle or back tokens.
8. **Complaints and incident process:** support, safety, privacy, transaction,
   sanctions, creator, and content channels with escalation and response
   targets.

No public-facing legal document should imply that counsel approved an asset,
market, issuer, token, fee recipient, jurisdiction, or regulatory status
unless counsel expressly writes that conclusion and the operator authorizes
its exact use.

## 11. Geography and go-live gate

Before counsel signs off on any scope, provide:

| Gate | Required record |
| --- | --- |
| Entity and responsible persons | Formation/ownership, service-provider and authority map |
| Jurisdiction matrix | Permitted/prohibited countries/states, user/creator categories, rationale |
| Geo-control design | IP/device/wallet/customer controls, VPN handling, override governance, testing |
| Product matrix | Local preview, devnet, read-only pages, and any production/mainnet feature by jurisdiction |
| Marketing matrix | Approved claims and audience/channel restrictions |
| Compliance matrix | KYC/KYB, AML/OFAC, monitoring, complaints, privacy, record retention |
| Fee/custody matrix | Recipient, authority, custody, reconciliation, accounting, tax |
| Release evidence | Security review, data licenses, finalized disclosures, signed release record |

Mainnet must remain disabled unless the separate release controls are met.
Neither a readiness response, devnet proof, simulation, SDK check, finalized
devnet transaction, nor a code constant is legal or production approval.

## 12. Requested written conclusions and deliverables

Please return a written memorandum or marked-up response that:

1. states the factual assumptions relied upon and identifies each missing
   client fact;
2. gives a separate conclusion for local preview, devnet, read-only indexing,
   and each proposed production configuration;
3. addresses securities/investment product, commodity/derivatives,
   money-transmission/custody, AML/OFAC, consumer, privacy, IP/data-license,
   marketing, and geographic issues;
4. identifies licensing/registration/exemption/filing obligations, if any,
   without treating product labels as determinative;
5. supplies mandatory and recommended disclosures, terms, creator attestations,
   screening, moderation, and recordkeeping controls;
6. identifies prohibited claims, prohibited users/markets, and trigger facts
   that require disabling a feature;
7. reviews the fee recipient, fee flow, authority/custody arrangement, and
   tax/accounting treatment once client inputs are supplied;
8. states whether additional local counsel, specialist commodity/derivatives
   advice, sanctions advice, privacy advice, tax advice, or data-license
   review is required; and
9. states clearly what the opinion does **not** cover (security audit,
   protocol correctness, wallet certification, market integrity monitoring,
   accounting audit, tax advice, or approval of future changes).

## 13. Outreach email template

**Subject:** Request for legal/compliance review — CMC Solana devnet and proposed production scope

Hello [COUNSEL NAME],

We are requesting a written legal and compliance review of Commodity Markets
Capital (CMC), a product that presents commodity-reference data and
community-token launch/trading flows. The attached packet and factual annex
separate the browser-local simulation, the explicitly signed Solana devnet
flow, read-only finalized indexing, and any future production/mainnet scope.

At present, the repository's mainnet path is fail-closed and no mainnet or
real-funds authorization is being requested by the codebase. The devnet flow
can prepare and submit LaunchLab launch/buy/sell transactions only after
explicit wallet approval. Commodity references are presented as informational,
not as backing, collateral, redemption, an oracle, or a guaranteed return.

Please review the questions in the packet and provide written, jurisdiction-
specific conclusions and required controls/disclosures covering securities,
commodities/derivatives, money transmission/custody, AML/OFAC, consumer
protection, privacy, terms, marketing, data licenses, creator/platform
responsibilities, and geographic restrictions. Please identify all assumptions
and the facts that would change your conclusions. We do not want the product
label or a code setting treated as a legal classification or approval.

The client has supplied the operating name **Commodity Markets Capital**,
principal/team location **United States**, target users **Adults**, treasury
control **Squads 2-of-2 signatures**, marketing URLs
`https://commoditymarketscapital.app/` and `https://x.com/LaunchOnCMC`,
business/compliance contact **antsags2219@gmail.com**, and desired timing
**As soon as review is done**. No additional marketing claims were supplied.
The following remain **REQUIRED CLIENT INPUT**: legal entity/suffix/type and
formation jurisdiction; precise permitted/excluded jurisdictions; legal fee
recipient and custody/accounting; phone and separate compliance/privacy role;
approved claims and promotion plan; and the detailed privacy, AML/OFAC,
geographic, tax, data-license, and production-release materials.

Please confirm your scope, conflicts, requested materials, estimated timing,
and whether specialist local, commodities/derivatives, sanctions, privacy,
tax, or data-licensing counsel should participate. We understand that this
request and the materials do not constitute a request for approval to launch or
move real funds.

Best,

[NAME — REQUIRED CLIENT INPUT]<br>
[TITLE / LEGAL ENTITY — Commodity Markets Capital operating name supplied;
legal entity details REQUIRED CLIENT INPUT]<br>
antsags2219@gmail.com [business/compliance contact supplied; phone REQUIRED
CLIENT INPUT]<br>
[COUNSEL/COMPLIANCE CONTACT — separate role REQUIRED CLIENT INPUT]
