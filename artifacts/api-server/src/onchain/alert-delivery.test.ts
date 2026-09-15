import assert from "node:assert/strict";
import test from "node:test";
import {
  WebhookAlertDestination,
  createAlertDestination,
  notificationPayload,
  type IndexerAlertNotification,
} from "./alert-delivery";
import type { IndexerAlert } from "./types";

const alert: IndexerAlert = {
  code: "RECONCILIATION_FAILURE",
  severity: "critical",
  message: "1 finalized reconciliation checks failed",
  action: "Inspect retained raw account evidence.",
  observedValue: 1,
  threshold: 1,
  firstObservedAt: "2026-09-14T10:00:00.000Z",
  lastObservedAt: "2026-09-14T10:01:00.000Z",
};

test("delivery payload allowlist excludes connection URLs and credentials", async () => {
  const secrets = [
    "https://rpc.example.invalid/?api-key=rpc-secret",
    "postgres://user:database-secret@db.example.invalid/app",
    "pager-credential-secret",
  ];
  const notification: IndexerAlertNotification = { event: "active", alert, cluster: "devnet" };
  let deliveredBody = "";
  const destination = new WebhookAlertDestination(
    "https://on-call.example.invalid/credential-in-destination",
    async (_url, init) => {
      deliveredBody = String(init?.body);
      return new Response(null, { status: 204 });
    },
  );

  await destination.deliver(notification);
  const serialized = JSON.stringify(notificationPayload(notification));
  assert.equal(deliveredBody, serialized);
  for (const secret of secrets) assert.equal(deliveredBody.includes(secret), false);
  assert.deepEqual(Object.keys(JSON.parse(deliveredBody)).sort(), [
    "action", "cluster", "code", "event", "firstObservedAt", "lastObservedAt",
    "message", "observedValue", "severity", "source", "threshold",
  ].sort());
});

test("on-call webhook must be configured with HTTPS", () => {
  assert.equal(createAlertDestination({ SOLANA_INDEXER_ALERT_WEBHOOK_URL: "http://example.com/hook" }), undefined);
  assert.ok(createAlertDestination({ SOLANA_INDEXER_ALERT_WEBHOOK_URL: "https://example.com/hook" }));
});

test("retries transient paging failures before reporting delivery failure", async () => {
  let attempts = 0;
  const destination = new WebhookAlertDestination(
    "https://on-call.example.invalid/hook",
    async () => {
      attempts += 1;
      return attempts < 3
        ? new Response("temporarily unavailable", { status: 503 })
        : new Response(null, { status: 204 });
    },
  );

  await destination.deliver({ event: "active", alert, cluster: "devnet", programId: "program-devnet" });
  assert.equal(attempts, 3);
});