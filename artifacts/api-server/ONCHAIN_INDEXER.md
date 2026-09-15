# Durable finalized Solana indexer

The API server contains a disabled-by-default, read-only indexer for Raydium
LaunchLab and its resulting CPMM state. It submits no transactions and holds no
keys. It accepts only the pinned Raydium program IDs for the configured cluster.

## Storage and audit model

Apply the Drizzle schema before enabling the worker:

```sh
pnpm --filter @workspace/db push
```

The Solana tables retain:

- finalized transactions, signatures, slots, blockhashes, and complete RPC
  transaction payloads;
- immutable LaunchLab, CPMM, and SPL/Token-2022 instruction rows keyed by
  signature plus outer/inner instruction index;
- transaction-associated account transitions with pre/post lamports and token
  balances for every writable or changed account;
- finalized current-account observations with owner, lamports, raw base64
  bytes, SHA-256, decoder version, and the exact observation slot. These rows
  deliberately have no causal signature because standard Solana RPC does not
  return historical account bytes;
- current LaunchState, SPL vault, SPL mint/authority, migration, and CPMM
  projections;
- immutable mint-authority history and direct reconciliation results.

Raw account bytes are authoritative. SPL mint and token-account layouts are
decoded directly. LaunchLab PoolState uses the reviewed 429-byte Raydium layout;
CPMM PoolState uses its reviewed 637-byte layout. An account without a matching decoder remains
explicitly `decoded: false`; its bytes and hash are still durable and auditable,
and are never interpreted as an EVM event.

## Configuration

```text
SOLANA_INDEXER_ENABLED=true
SOLANA_CLUSTER=devnet
SOLANA_DEVNET_RPC_URL=https://<reviewed-solana-rpc>
SOLANA_DEPLOYMENT_SLOT=<first-slot-to-index>
SOLANA_LAUNCHLAB_PROGRAM_ID=<pinned-launchlab-program>
SOLANA_CPMM_PROGRAM_ID=<pinned-cpmm-program>
SOLANA_PLATFORM_PDA=<reviewed-platform-pda> # optional until registered
```

`SOLANA_RPC_URL` remains a compatibility fallback, but cluster-specific
`SOLANA_DEVNET_RPC_URL` and `SOLANA_MAINNET_RPC_URL` values take precedence.

Optional polling controls:

```text
SOLANA_POLL_INTERVAL_MS=15000
SOLANA_BATCH_SIZE=100
SOLANA_INDEXER_LAG_WARNING_SLOTS=150
SOLANA_INDEXER_LAG_CRITICAL_SLOTS=600
SOLANA_INDEXER_RPC_GAP_ALERT_COUNT=3
SOLANA_INDEXER_OPERATION_TIMEOUT_MS=10000
SOLANA_INDEXER_STALL_ALERT_MS=45000
```

Both program IDs default to the pinned Raydium IDs for `devnet` or
`mainnet-beta`, and any override must equal the pinned value. Public config
never includes the RPC URL. Before every polling pass, the worker compares
`getGenesisHash` with the pinned genesis hash for the configured cluster and
fails before any read or checkpoint update on mismatch. A configured platform
PDA is a required observation on every pass.

## Finality, backfill, and recovery

- Every RPC read uses `commitment: finalized`. Signature rows above the
  captured finalized boundary are deferred. Current-account observations
  record the actual finalized context returned by RPC, which may advance while
  a historical page is processed; they remain explicitly non-causal.
- Initial history is paged backward to the deployment slot. The durable cursor
  records oldest/newest signatures and whether historical backfill completed.
  Once complete, polling uses the newest signature as the incremental cursor.
- Transactions, causal account-transition rows, instruction journal rows,
  account observations, projections, and every LaunchLab/CPMM/mint cursor for
  one pass commit in one PostgreSQL transaction under the worker lock.
- Duplicate delivery is harmless because journal and snapshot identities are
  primary keys. Missing finalized transactions are reported as RPC gaps and
  keep health red.
- LaunchLab, CPMM, and every discovered market mint address have independent
  durable finalized-signature cursors. This captures standalone token-program
  authority changes that invoke neither market program.
  Current state is refreshed for every decoded LaunchState/CPMM-referenced
  vault and mint. Historical SPL authority changes are retained from finalized
  token-program instructions; current raw bytes are retained as observations.

`GET /api/chain/status` reports finalized/indexed slots, RPC gaps, and
reconciliation issues. `GET /api/chain/markets` returns finalized LaunchState
projections and returns HTTP 503 when an enabled worker cannot prove durable
health.

## Metrics, alerts, and operator runbook

`indexedThroughSlot` is the finalized-head coverage watermark for the last
fully committed polling pass across LaunchLab, CPMM, and every tracked mint. It
is intentionally distinct from the slot of the newest matching transaction, so
a quiet program remains caught up. The worker reads the current finalized head
before taking the database lock; if storage or downstream processing fails,
`lastFinalizedSlot` advances while `indexedThroughSlot` remains at the last
successful pass and lag grows.
Existing checkpoint rows without a coverage watermark use the configured
deployment-slot baseline until the first complete pass, which fails
conservatively rather than reporting zero lag after a restart.
When backward history first reaches the deployment boundary, the worker keeps
backfill active and does not advance coverage. A subsequent forward pass must
durably catch up from the saved newest signature through its captured finalized
head before coverage advances or market health becomes green.

`GET /api/chain/metrics` exposes Prometheus text metrics for finalized-slot lag,
reconciliation failures, consecutive RPC gaps, backfill state, active alerts,
and a scrape heartbeat/timestamp. `solana_indexer_alert_active` identifies each
firing alert by `code` and `severity`; absent series are resolved alerts. Alert
delivery should group incidents by cluster, program, and code, treating a
severity change as a resolved old incident followed by a firing new incident.
Scrape this endpoint from the
internal monitoring system. Structured
`Solana indexer operational alert` log records are emitted once when an alert
becomes active, and a recovery record is emitted when it clears. The status
endpoint also exposes `alertStatus`, `activeAlerts`, `finalizedSlotLag`, and
`backfillInProgress`. No metric, alert, or status response contains an RPC URL
or database connection value.

Alert state is persisted in `solana_operational_alerts`, and each activation,
escalation, and recovery is first recorded in the namespaced
`solana_alert_outbox`. Delivery is at-least-once: successful webhook calls are
marked delivered, while failed rows retain their payload, attempt count, and
backoff time so a restart can resume paging. Repeated observations of an
unchanged critical alert reuse the same outbox key and cannot erase a pending
page.

Set `SOLANA_INDEXER_ALERT_WEBHOOK_URL` as a deployment secret to the approved
HTTPS on-call webhook. The worker sends an allowlisted JSON payload when an
alert first activates, when lag escalates from warning to critical, and when an
alert recovers. Transient webhook failures are retried with bounded backoff.
An unchanged active alert is not sent again, so warning and recovery messages do
not create duplicate pages. The payload contains only the
alert code, severity, cluster, operator-safe message/action, numeric threshold
values, and timestamps. RPC URLs, database URLs, credentials, and raw exception
messages are never included. A missing webhook leaves structured logs and
Prometheus metrics enabled but does not page an operator.

Default thresholds:

- During historical backfill, slot lag is reported as a metric but does not
  trigger `FINALIZED_SLOT_LAG`; `backfillInProgress` identifies this expected
  condition.
- After backfill, 150 slots of lag triggers a warning and 600 slots triggers a
  critical alert. Tune both thresholds for the cluster's observed slot time,
  keeping the critical threshold greater than the warning threshold.
- Three consecutive RPC-gap failures trigger a critical alert. Successful
  polling resets the consecutive count; the cumulative `rpcGapCount` remains
  visible in status.
- Any reconciliation failure or tracked-account owner/layout mismatch is
  critical immediately.
- A polling pass that exceeds the stall threshold is critical. While the main
  pass is blocked, an independent finalized-head probe continues updating lag;
  RPC calls have a bounded operation timeout.

Response steps:

1. For unexpected lag, check worker and PostgreSQL availability, then compare
   finalized and indexed-through slots. Keep `/chain/markets` unavailable until
   durable health recovers.
2. For repeated RPC gaps, fail over only to a reviewed RPC endpoint and verify
   missing finalized signatures before accepting the recovered checkpoint.
3. For reconciliation failures, inspect retained raw bytes, hashes, and the
   recorded expected/actual values. Do not trust affected projections.
4. For owner/layout mismatches, treat the event as a possible authority change
   or program upgrade. Confirm the on-chain owner and reviewed account layout
   before changing configuration or resuming.

Raydium REST APIs are not used as settlement truth. Mainnet still requires the
separate governance, RPC redundancy, reviewed IDL decoder, and release controls.