import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { OnchainIndexer } from "./indexer";
import { createChainRouter } from "../routes/chain";
import type { IndexerAlert, IndexerHealth } from "./types";
import type { IndexerConfig } from "./config";

const config: IndexerConfig = {
  enabled: true,
  cluster: "devnet",
  expectedGenesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  programId: "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6",
  cpmmProgramId: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  startSlot: 100,
  rpcUrl: "https://rpc.invalid/private",
  batchSize: 100,
  lagWarningSlots: 10,
  lagCriticalSlots: 50,
  rpcGapAlertCount: 3,
  stallAlertMs: 10,
};

type Notification =
  | { state: "firing"; code: IndexerAlert["code"]; severity: IndexerAlert["severity"] }
  | { state: "resolved"; code: IndexerAlert["code"]; severity: IndexerAlert["severity"] };

class ControlledMonitor {
  readonly notifications: Notification[] = [];
  private active = new Map<IndexerAlert["code"], IndexerAlert["severity"]>();

  scrape(metrics: string): void {
    const observed = new Map<IndexerAlert["code"], IndexerAlert["severity"]>();
    for (const line of metrics.split("\n")) {
      const match = line.match(
        /^solana_indexer_alert_active\{[^}]*code="([^"]+)",severity="(warning|critical)"\} 1$/,
      );
      if (match) observed.set(match[1] as IndexerAlert["code"], match[2] as IndexerAlert["severity"]);
    }

    for (const [code, severity] of observed) {
      const previousSeverity = this.active.get(code);
      if (previousSeverity === severity) continue;
      if (previousSeverity) {
        this.notifications.push({ state: "resolved", code, severity: previousSeverity });
      }
      this.notifications.push({ state: "firing", code, severity });
    }
    for (const [code, severity] of this.active) {
      if (!observed.has(code)) this.notifications.push({ state: "resolved", code, severity });
    }
    this.active = observed;
  }
}

function control(indexer: OnchainIndexer) {
  return indexer as unknown as {
    health: IndexerHealth;
    consecutiveRpcGaps: number;
    running: boolean;
    updateAlerts(error?: string, trackedAccountsValidated?: boolean): Promise<void>;
  };
}

test("monitoring scrape fires once for every market-history alert and resolves cleanly", async (t) => {
  const indexer = new OnchainIndexer({ config });
  const controlled = control(indexer);
  const app = express();
  app.use("/api", createChainRouter(indexer));
  const server = app.listen(0);
  t.after(() => server.close());
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const metricsUrl = `http://127.0.0.1:${address.port}/api/chain/metrics`;
  const monitor = new ControlledMonitor();

  const scrape = async () => {
    const response = await fetch(metricsUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
    monitor.scrape(await response.text());
  };
  const setHealth = async (changes: Partial<IndexerHealth>, error?: string, validated = true) => {
    Object.assign(controlled.health, {
      backfillInProgress: false,
      finalizedSlotLag: 0,
      reconciliationIssues: 0,
      ...changes,
    });
    controlled.consecutiveRpcGaps = 0;
    await controlled.updateAlerts(error, validated);
  };
  const expectLifecycle = async (
    code: IndexerAlert["code"],
    severity: IndexerAlert["severity"],
    activate: () => Promise<void>,
  ) => {
    const start = monitor.notifications.length;
    await activate();
    await scrape();
    await scrape();
    assert.deepEqual(monitor.notifications.slice(start), [{ state: "firing", code, severity }]);
    await setHealth({});
    await scrape();
    await scrape();
    assert.deepEqual(monitor.notifications.slice(start), [
      { state: "firing", code, severity },
      { state: "resolved", code, severity },
    ]);
  };

  const lagStart = monitor.notifications.length;
  await setHealth({ finalizedSlotLag: 10 });
  await scrape();
  await scrape();
  await setHealth({ finalizedSlotLag: 50 });
  await scrape();
  await scrape();
  await setHealth({});
  await scrape();
  await scrape();
  assert.deepEqual(monitor.notifications.slice(lagStart), [
    { state: "firing", code: "FINALIZED_SLOT_LAG", severity: "warning" },
    { state: "resolved", code: "FINALIZED_SLOT_LAG", severity: "warning" },
    { state: "firing", code: "FINALIZED_SLOT_LAG", severity: "critical" },
    { state: "resolved", code: "FINALIZED_SLOT_LAG", severity: "critical" },
  ]);
  await expectLifecycle("REPEATED_RPC_GAPS", "critical", async () => {
    controlled.consecutiveRpcGaps = 3;
    await controlled.updateAlerts("RPC gap");
  });
  await expectLifecycle("RECONCILIATION_FAILURE", "critical", () => setHealth({ reconciliationIssues: 1 }));
  await expectLifecycle("TRACKED_ACCOUNT_MISMATCH", "critical", () =>
    setHealth({}, "Tracked Solana account owner mismatch", false)
  );
  await expectLifecycle("TRACKED_ACCOUNT_MISMATCH", "critical", () =>
    setHealth({}, "Tracked Solana account layout is unknown", false)
  );
  await expectLifecycle("WORKER_STALLED", "critical", async () => {
    controlled.running = true;
    controlled.health.lastRunAt = new Date(Date.now() - 100).toISOString();
    await controlled.updateAlerts();
    controlled.running = false;
  });

  const beforeBackfill = monitor.notifications.length;
  await setHealth({ backfillInProgress: true, finalizedSlotLag: 500 });
  await scrape();
  await scrape();
  assert.equal(monitor.notifications.length, beforeBackfill);
  assert.equal(controlled.health.activeAlerts.some((alert) => alert.code === "FINALIZED_SLOT_LAG"), false);
});