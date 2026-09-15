# Internal AI-assisted remediation review — not an independent audit

**PASS — the fixes correctly preserve quote custody/accounting and two-step feed handover; no exploitable regression was found within this internal-review scope.**

**Critical analysis**
- Accounting is internally consistent: buys increase aggregate liabilities by `grossConsumed`; sells reduce them by `grossQuoteOut - fee`; actual custody changes by the same amounts. The per-market `grossQuoteOut <= quoteRaised` check prevents one market from consuming another market’s proceeds or its own fee buckets.
- Exact transfer helpers reject short credits, sender surcharges, outbound taxes, and transfer-time rebases atomically. Refund callbacks occur under `nonReentrant`; sell and protocol-payout effects are committed before external transfers. Protocol recipients are snapshotted, so callbacks cannot redirect an in-progress release.
- Self-recipient protocol/holder amounts remain in their original buckets and aggregate liability; events report only released amounts. Restoring external protocol recipients releases retained funds exactly once.
- The exact-minimal gross formula is correct for floored fees. The one-less input cannot provide the required net amount.
- `Ownable2Step` cancellation/replacement semantics are correct. Acceptance and renunciation clear `pendingOwner` and revoke the outgoing owner’s keeper role. The intentional compatibility change is that integrations now require transfer plus acceptance; the new owner is not automatically a keeper.
- Verified 23 passing Hardhat tests with `--no-compile`; the tested artifact’s build input exactly matches the current Launchpad/feed sources.

**Security:** No new serious violation observed. Documented residual governance risk remains: unrelated keepers survive renunciation and become irrevocable once ownership is zero; this is an intentional policy blocker, not a regression in these fixes.

**Memory note:** The added preview-performance memory text is a one-off process/debugging recipe about wrapper termination and port occupation; it should be reduced to a durable launcher-ownership principle or removed.

**Next actions**
1. Add invariant/fuzz coverage over randomized multi-market buys, sells, refunds, mixed self/external payouts, and fee rates.
2. Add explicit characterization that renunciation with an unrelated keeper leaves that keeper active forever, preventing operators from mistaking renunciation for shutdown.
3. Update all handoff tooling/runbooks to perform `transferOwnership` then `acceptOwnership`, followed by explicit keeper appointment/inventory.