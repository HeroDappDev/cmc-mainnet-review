# Agriculture and livestock market-data evaluation

Research date: 2026-09-12. Provider selected by the user: Barchart OnDemand. Status: awaiting a written commercial quote and user approval of the exact subscription cost. No subscription, credentials, or adapters have been added.

## Recommendation

Request a Barchart OnDemand commercial quote for daily exchange settlements for the catalogue's 14 agriculture/livestock instruments. The user selected Barchart on 2026-09-12, without a monthly budget ceiling. Prefer daily data over real-time subscriptions for this use case. Trading Economics Enterprise remains a documented alternative if explicitly labelled indicative benchmarks are acceptable.

Neither vendor's reviewed public materials establish an all-in price and licence for this particular public website. Do not purchase a retail subscription assuming that it permits redistribution. A provider preference or budget ceiling is not approval of an unknown subscription cost.

## Provider comparison

| Criterion | Barchart OnDemand | Trading Economics |
| --- | --- | --- |
| Instruments | Exchange futures API; grains, softs and livestock coverage. Request entitlement confirmation for all instruments below, including current lumber contract. | Public commodity table shows 13 of the 14 catalogue instruments, including Oat. Soybean oil was not found in that table; API availability must be confirmed. |
| Price meaning | Contract-specific exchange futures; getQuote supports real-time, delayed and EOD. Explicit contract/roll selection is required. Not a physical spot price. | Indicative market benchmarks; wheat documentation explicitly describes a CFD tracking the benchmark. Do not label these prices as exchange settlements without separate confirmation. |
| Units | Must confirm API numeric encoding against contract specifications; display units alone do not establish raw API scaling. | Table uses USd (cents) for bushels and pounds; USD for rice/cwt, cocoa/tonne and lumber/1,000 board feet. API sample and metadata still required. |
| Timing | Public grains page states 10-minute delay; softs page notes 10/15-minute futures delays. These are website timings, not an API SLA. API entitlement determines timing. getFuturesByExchange FAQ additionally warns of up to 20 minutes of caching. Request EOD release timing and correction policy. | No universal per-instrument exchange delay established in reviewed API materials. Request benchmark methodology, timestamps, refresh frequency and delay guarantees. Streaming availability does not prove exchange real-time status. |
| API limits | Usage-based pricing; no numeric production quota or batch cap established in reviewed pages. getQuote accepts multiple symbols. Confirm request, symbol and point counting, burst limits and overages in quote. | General 2 requests/second; historical calls max 10,000 rows; documented URL limit 260 characters. Standard 500 requests/month, Professional 5,000; Enterprise up to 1 million, subject to contract. |
| Public display | API marketed for websites/apps, but general website access is not redistribution permission. Require commercial agreement covering exchange rights, anonymous display and the browser-facing JSON response. | Enterprise explicitly advertises white-label website display and redistribution. Standard/Professional feature lists do not establish equivalent rights. Obtain written scope of permission. |
| Cost | Custom quote; no verified all-in public price. Include exchange fees, setup, minimum commitment and overages. | Standard $199/month; Professional $399/month. Neither is a verified licence for this use. Enterprise custom-priced, billed quarterly or yearly. Trials are paid, nonrefundable and auto-renew unless cancelled. |

## Instrument and unit checklist

The following are proposed exchange benchmarks, not approved provider symbols. The catalogue's generic commodity names do not specify grade, origin or expiry. Confirm these choices before activation.

| Catalogue | Proposed benchmark | Catalogue USD unit | Expected conventional quote conversion, subject to API confirmation |
| --- | --- | --- | --- |
| WHEAT | CBOT Chicago SRW wheat | bushel | cents/bushel ÷ 100 |
| CORN | CBOT corn | bushel | cents/bushel ÷ 100 |
| SOY | CBOT soybeans | bushel | cents/bushel ÷ 100 |
| SOYO | CBOT soybean oil | lb | cents/lb ÷ 100 |
| RICE | CBOT rough rice | cwt | USD/cwt unchanged |
| OATS | CBOT oats | bushel | cents/bushel ÷ 100 |
| COFF | ICE US Coffee C | lb | cents/lb ÷ 100 |
| COCO | ICE US cocoa, not London cocoa | metric tonne | USD/metric tonne unchanged |
| COTT | ICE US Cotton No. 2 | lb | cents/lb ÷ 100 |
| SUGAR | ICE US Sugar No. 11 | lb | cents/lb ÷ 100 |
| CATTLE | CME live cattle | lb | cents/lb ÷ 100 |
| HOGS | CME lean hogs | lb | cents/lb ÷ 100 |
| FEED | CME feeder cattle | lb | cents/lb ÷ 100 |
| LUMB | Current CME lumber contract | 1,000 board feet | USD/1,000 board feet unchanged |

Never apply the cents conversion if the API has already normalized to dollars. Do not derive unit prices by dividing a quoted unit price by contract size. API symbol mappings and entitlements remain unverified until vendor samples are available.

## Commercial quote request

Ask the selected vendor to quote:

- The 14 benchmarks above, EOD settlement plus previous settlement, actual observation date, exchange, currency, unit, contract expiry and settlement/correction flags.
- Public anonymous display in Commodity Markets Capital, including price, daily percentage change and attribution; delivery through the app's browser-facing JSON endpoint. Confirm whether that endpoint needs additional restrictions.
- Explicit CME/CBOT and ICE permissions, geographic/audience restrictions, any exchange agreements and reporting or subscriber obligations.
- Permitted caching duration, historical retention, backups, derived values, licence termination/deletion obligations and attribution wording.
- Exact all-in subscription amount, currency, exchange fees, taxes, setup fees, overages, minimum term, renewal/cancellation terms and trial conditions.
- Batch-size and quota counting rules, EOD availability time, timezone, holidays, corrections and support/SLA.
- Representative responses for every approved symbol, numeric scaling and documented rollover behaviour.

Cost sizing: the current route cache is 30 seconds. One continuously requested batch at that interval can generate 86,400 upstream calls per 30-day month per instance; 14 separate symbol calls would generate 1,209,600. Do not reuse that schedule for a daily paid feed. One daily batch is about 30 calls/month, or 420 for 14 individual daily requests, before retries, historical reads or multiple server instances. Use a separate provider cache and account for deployment instance count.

## Implementation gate and acceptance criteria

Only after written terms and user approval of the actual cost:

1. Add credentials through the workspace's secure connection/secrets flow, never client code.
2. Add server-side adapters only for entitled, verified symbols. Retain explicit null-valued unavailable states for all others and for malformed, stale or failed responses.
3. Use a documented expiry-selection/roll policy. Compare the same contract's consecutive settlements; do not report roll gaps as daily market moves.
4. Validate currency, raw unit/scaling, instrument identity, finite positive values and observation timestamps before converting.
5. Label the UI accurately as dated futures settlement or indicative benchmark, with source and contract/methodology information. Never substitute sample catalogue reference prices.
6. Use vendor-appropriate caching, request coalescing and failure backoff, independently of browser refreshes. Show last observation date rather than fetch time as the market date.
7. Coordinate adapter contract coverage with the existing automated quote-adapter tests work; do not duplicate that task.

## Sources

All accessed 2026-09-12. Public web pages establish product capabilities, not negotiated entitlements.

- [Barchart OnDemand overview and usage-based pricing](https://www.barchart.com/ondemand)
- [Barchart getQuote API](https://www.barchart.com/ondemand/api/getQuote)
- [Barchart API FAQ: settlement flag and caching](https://www.barchart.com/ondemand/faq)
- [Barchart terms](https://www.barchart.com/terms)
- [Grains futures](https://www.barchart.com/futures/grains), [softs](https://www.barchart.com/futures/softs), [livestock](https://www.barchart.com/futures/meats)
- [Trading Economics plans and redistribution features](https://tradingeconomics.com/api/pricing.aspx)
- [Trading Economics API rate limits](https://docs.tradingeconomics.com/get_started/rate-limits)
- [Trading Economics commodity coverage and units](https://tradingeconomics.com/commodities)
- [Trading Economics wheat benchmark description](https://tradingeconomics.com/commodity/wheat)