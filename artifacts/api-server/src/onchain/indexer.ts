import { loadIndexerConfig, publicIndexerConfig, type IndexerConfig } from "./config";
import { SolanaRpcReader, SolanaRpcRequestError } from "./chain-reader";
import { SqlSolanaStore } from "./store";
import { logger } from "../lib/logger";
import {
  createAlertDestination,
  notificationPayload,
  type IndexerAlertDestination,
  type IndexerAlertNotification,
} from "./alert-delivery";
import type {
  IndexerHealth,
  IndexerAlert,
  LockedSolanaStore,
  ProjectedLaunch,
  ProjectedTrade,
  SolanaNamespace,
  SolanaReader,
  SolanaStore,
} from "./types";

function safeError(error: unknown, rpcUrl?: string): string {
  const message = error instanceof Error ? error.message : "Solana indexer polling failed";
  return [rpcUrl, process.env.DATABASE_URL]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((redacted, secret) => redacted.replaceAll(secret, "[redacted secret]"), message);
}

function advanceCheckpoint(
  checkpoint: import("./types").SolanaCheckpoint,
  transactions: import("./types").FinalizedTransaction[],
  backfillComplete: boolean,
) {
  return {
    lastFinalizedSlot: transactions.length === 0
      ? checkpoint.lastFinalizedSlot
      : Math.max(checkpoint.lastFinalizedSlot, ...transactions.map((tx) => tx.slot)),
    oldestSignature: transactions.length === 0 || checkpoint.backfillComplete
      ? checkpoint.oldestSignature
      : transactions[0]!.signature,
    newestSignature: transactions.length === 0
      ? checkpoint.newestSignature
      : checkpoint.backfillComplete
        ? transactions[transactions.length - 1]!.signature
        : checkpoint.newestSignature ?? transactions[transactions.length - 1]!.signature,
    backfillComplete,
    scannedThroughSlot: checkpoint.scannedThroughSlot,
  };
}

export class OnchainIndexer {
  readonly config: IndexerConfig;
  readonly namespace: SolanaNamespace;
  private readonly reader?: SolanaReader;
  private readonly store?: SolanaStore;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private health: IndexerHealth;
  private readonly alertFirstObserved = new Map<string, string>();
  private activeAlertNamespace?: string;
  private consecutiveRpcGaps = 0;
  private successfullyScannedThroughSlot?: number;
  private livenessSampling = false;
  private readonly alertDestination?: IndexerAlertDestination;
  private alertDeliveryRunning = false;

  constructor(options?: {
    config?: IndexerConfig;
    reader?: SolanaReader;
    store?: SolanaStore;
    alertDestination?: IndexerAlertDestination;
  }) {
    this.config = options?.config ?? loadIndexerConfig();
    this.namespace = {
      cluster: this.config.cluster ?? "devnet",
      programId: this.config.programId ?? "",
    };
    this.reader = options?.reader ?? (this.config.enabled ? new SolanaRpcReader(this.config) : undefined);
    this.alertDestination = options?.alertDestination ?? createAlertDestination();
    let durableStore = options?.store;
    let initializationError: string | undefined;
    if (!durableStore && this.config.enabled) {
      try {
        durableStore = new SqlSolanaStore();
      } catch (error) {
        initializationError = error instanceof Error ? error.message : "Durable Solana store could not be initialized";
      }
    }
    this.store = durableStore;
    this.successfullyScannedThroughSlot = this.config.enabled
      ? (this.config.startSlot ?? 0) - 1
      : undefined;
    this.health = {
      enabled: this.config.enabled,
      healthy: false,
      workerRunning: false,
      cluster: this.config.cluster,
      programId: this.config.programId,
      cpmmProgramId: this.config.cpmmProgramId,
      platformPda: this.config.platformPda,
      rpcGapCount: 0,
      reconciliationIssues: 0,
      backfillInProgress: false,
      finalizedSlotLag: 0,
      indexedThroughSlot: this.config.enabled ? (this.config.startSlot ?? 0) - 1 : undefined,
      alertStatus: "ok",
      activeAlerts: [],
      error: this.config.enabled ? initializationError : this.config.reason,
    };
  }

  getPublicConfig() {
    return publicIndexerConfig(this.config);
  }

  getHealth(): IndexerHealth {
    return { ...this.health, activeAlerts: this.health.activeAlerts.map((alert) => ({ ...alert })) };
  }

  getMetrics(): string {
    const labels = `cluster="${this.health.cluster ?? "unconfigured"}"`;
    const activeAlertMetrics = this.health.activeAlerts.map((alert) =>
      `solana_indexer_alert_active{${labels},code="${alert.code}",severity="${alert.severity}"} 1`
    );
    return [
      "# HELP solana_indexer_finalized_slot_lag Finalized head minus indexed-through slot.",
      "# TYPE solana_indexer_finalized_slot_lag gauge",
      `solana_indexer_finalized_slot_lag{${labels}} ${this.health.finalizedSlotLag}`,
      "# HELP solana_indexer_reconciliation_issues Current failed reconciliation checks.",
      "# TYPE solana_indexer_reconciliation_issues gauge",
      `solana_indexer_reconciliation_issues{${labels}} ${this.health.reconciliationIssues}`,
      "# HELP solana_indexer_consecutive_rpc_gaps Consecutive polling failures caused by RPC gaps.",
      "# TYPE solana_indexer_consecutive_rpc_gaps gauge",
      `solana_indexer_consecutive_rpc_gaps{${labels}} ${this.consecutiveRpcGaps}`,
      "# HELP solana_indexer_backfill_in_progress Whether historical backfill is active.",
      "# TYPE solana_indexer_backfill_in_progress gauge",
      `solana_indexer_backfill_in_progress{${labels}} ${this.health.backfillInProgress ? 1 : 0}`,
      "# HELP solana_indexer_active_alerts Current active operational alerts.",
      "# TYPE solana_indexer_active_alerts gauge",
      `solana_indexer_active_alerts{${labels}} ${this.health.activeAlerts.length}`,
      "# HELP solana_indexer_scrape_heartbeat Whether the metrics endpoint is responding.",
      "# TYPE solana_indexer_scrape_heartbeat gauge",
      `solana_indexer_scrape_heartbeat{${labels}} 1`,
      "# HELP solana_indexer_scrape_heartbeat_timestamp_seconds Unix timestamp of the most recent metrics scrape.",
      "# TYPE solana_indexer_scrape_heartbeat_timestamp_seconds gauge",
      `solana_indexer_scrape_heartbeat_timestamp_seconds{${labels}} ${Date.now() / 1000}`,
      "# HELP solana_indexer_last_success_timestamp_seconds Unix timestamp of the last fully committed scan.",
      "# TYPE solana_indexer_last_success_timestamp_seconds gauge",
      `solana_indexer_last_success_timestamp_seconds{${labels}} ${
        this.health.lastSuccessAt ? Date.parse(this.health.lastSuccessAt) / 1000 : 0
      }`,
      "# HELP solana_indexer_alert_active Whether a specific operational alert is active.",
      "# TYPE solana_indexer_alert_active gauge",
      ...activeAlertMetrics,
      "",
    ].join("\n");
  }

  async getMarkets(): Promise<ProjectedLaunch[]> {
    if (!this.store || !this.config.enabled) return [];
    return this.store.listLaunches(this.namespace);
  }

  async getMarket(launchState: string): Promise<ProjectedLaunch | null> {
    if (!this.store || !this.config.enabled) return null;
    return this.store.getLaunch(this.namespace, launchState);
  }

  async getTradeHistory(launchState: string, limit = 100): Promise<ProjectedTrade[]> {
    if (!this.store || !this.config.enabled) return [];
    return this.store.listTrades(this.namespace, launchState, limit);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.reader || !this.store) {
      this.health = { ...this.health, healthy: false, error: "Solana indexer reader or durable store is unavailable" };
      return;
    }
    this.health.workerRunning = true;
    void this.runOnce();
    this.timer = setInterval(
      () => {
        void this.flushAlertOutbox();
        if (this.running) void this.sampleLiveness();
        else void this.runOnce();
      },
      this.config.pollIntervalMs ?? 15_000,
    );
    void this.flushAlertOutbox();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.health.workerRunning = false;
  }

  async runOnce(): Promise<void> {
    if (!this.config.enabled || !this.reader || !this.store || this.running) return;
    this.running = true;
    this.health.lastRunAt = new Date().toISOString();
    try {
      if (!this.config.expectedGenesisHash) throw new Error("Pinned Solana genesis hash is required");
      await this.reader.verifyCluster(this.config.expectedGenesisHash);
      const finalizedSlot = await this.reader.getFinalizedSlot();
      this.health.lastFinalizedSlot = finalizedSlot;
      this.health.finalizedSlotLag = Math.max(
        0,
        finalizedSlot - (this.successfullyScannedThroughSlot ?? ((this.config.startSlot ?? 0) - 1)),
      );
      await this.store.withNamespaceLock(this.namespace, (store) => this.runLocked(store, finalizedSlot));
    } catch (error) {
      const message = safeError(error, this.config.rpcUrl);
      const rpcGap = error instanceof SolanaRpcRequestError || /RPC gap/i.test(message);
      if (rpcGap) {
        this.health.rpcGapCount += 1;
        this.consecutiveRpcGaps += 1;
      } else {
        this.consecutiveRpcGaps = 0;
      }
      this.health = { ...this.health, healthy: false, error: message };
      await this.updateAlerts(message, false);
      logger.error({ error: message }, "Finalized Solana indexer polling failed");
    } finally {
      this.running = false;
    }
  }

  private async sampleLiveness(): Promise<void> {
    if (!this.reader || this.livenessSampling) return;
    this.livenessSampling = true;
    try {
      if (!this.config.expectedGenesisHash) throw new Error("Pinned Solana genesis hash is required");
      const timeoutMs = this.config.operationTimeoutMs ?? 10_000;
      const probe = (async () => {
        await this.reader!.verifyCluster(this.config.expectedGenesisHash!);
        return this.reader!.getFinalizedSlot();
      })();
      const finalizedSlot = await Promise.race([
        probe,
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error(`Solana RPC liveness probe timed out after ${timeoutMs}ms`)),
          timeoutMs,
        )),
      ]);
      this.health.lastFinalizedSlot = finalizedSlot;
      this.health.finalizedSlotLag = Math.max(
        0,
        finalizedSlot - (this.successfullyScannedThroughSlot ?? ((this.config.startSlot ?? 0) - 1)),
      );
       await this.updateAlerts(undefined, false);
    } catch (error) {
      this.consecutiveRpcGaps += 1;
      this.health.rpcGapCount += 1;
      this.health.error = safeError(error, this.config.rpcUrl);
      await this.updateAlerts("RPC gap: liveness probe failed", false);
    } finally {
      this.livenessSampling = false;
    }
  }

  private async runLocked(store: LockedSolanaStore, finalizedSlot: number): Promise<void> {
    if (!this.reader || !this.config.programId || !this.config.cpmmProgramId) throw new Error("Solana reader configuration is incomplete");
    const checkpoint = await store.getCheckpoint(this.namespace) ?? {
      lastFinalizedSlot: (this.config.startSlot ?? 0) - 1,
      oldestSignature: null,
      newestSignature: null,
      backfillComplete: false,
    };
    const cpmmNamespace: SolanaNamespace = {
      cluster: this.namespace.cluster,
      programId: this.config.cpmmProgramId,
    };
    const cpmmCheckpoint = await store.getCheckpoint(cpmmNamespace) ?? {
      lastFinalizedSlot: (this.config.startSlot ?? 0) - 1,
      oldestSignature: null,
      newestSignature: null,
      backfillComplete: false,
    };
    const trackedAccounts = await store.listTrackedAccounts(this.namespace);
    const requiredTrackedAccounts = [...trackedAccounts];
    if (
      this.config.platformPda &&
      !requiredTrackedAccounts.some((account) => account.pubkey === this.config.platformPda)
    ) {
      requiredTrackedAccounts.push({
        pubkey: this.config.platformPda,
        expectedRole: "platform",
        expectedOwner: this.config.programId,
      });
    }
    const trackedMints = trackedAccounts.filter((account) => account.expectedRole === "mint");
    const mintStates = [];
    for (const mint of trackedMints) {
      const namespace: SolanaNamespace = {
        cluster: this.namespace.cluster,
        programId: `mint:${mint.pubkey}`,
      };
      const checkpoint = await store.getCheckpoint(namespace) ?? {
        lastFinalizedSlot: (this.config.startSlot ?? 0) - 1,
        oldestSignature: null,
        newestSignature: null,
        backfillComplete: false,
      };
      mintStates.push({ mint, namespace, checkpoint });
    }
    const requiredCheckpoints = [checkpoint, cpmmCheckpoint, ...mintStates.map((state) => state.checkpoint)];
    const restoredScanWatermark = Math.min(...requiredCheckpoints.map(
      (state) => state.scannedThroughSlot ?? ((this.config.startSlot ?? 0) - 1),
    ));
    this.successfullyScannedThroughSlot = restoredScanWatermark;
    this.health.indexedThroughSlot = restoredScanWatermark;
    this.health.finalizedSlotLag = Math.max(0, finalizedSlot - restoredScanWatermark);
    this.health.backfillInProgress = requiredCheckpoints.some((state) => !state.backfillComplete);
    const batch = await this.reader.getTransactions(
      this.config.programId,
      checkpoint,
      this.config.batchSize ?? 100,
      this.config.startSlot ?? 0,
      finalizedSlot,
    );
    const transactions = batch.transactions;
    const cpmmBatch = await this.reader.getTransactions(
      this.config.cpmmProgramId,
      cpmmCheckpoint,
      this.config.batchSize ?? 100,
      this.config.startSlot ?? 0,
      finalizedSlot,
    );
    const cpmmTransactions = cpmmBatch.transactions;
    const mintBatches: Array<{
      namespace: SolanaNamespace;
      transactions: import("./types").FinalizedTransaction[];
      checkpoint: import("./types").SolanaCheckpoint;
    }> = [];
    for (const { mint, namespace: mintNamespace, checkpoint: mintCheckpoint } of mintStates) {
      const mintBatch = await this.reader.getTransactions(
        mint.pubkey,
        mintCheckpoint,
        this.config.batchSize ?? 100,
        this.config.startSlot ?? 0,
        finalizedSlot,
      );
      mintBatches.push({
        namespace: mintNamespace,
        transactions: mintBatch.transactions,
        checkpoint: advanceCheckpoint(mintCheckpoint, mintBatch.transactions, mintBatch.backfillComplete),
      });
    }
    const mintTransactions = mintBatches.flatMap((batch) => batch.transactions);
    for (const tx of [...transactions, ...cpmmTransactions, ...mintTransactions]) {
      if (tx.slot > finalizedSlot) throw new Error(`RPC returned non-finalized slot ${tx.slot}`);
      if (!tx.blockhash || !tx.signature) throw new Error("Finalized transaction omitted its signature or blockhash");
    }
    const accounts = await this.reader.getAccountSnapshots(
      [...transactions, ...cpmmTransactions, ...mintTransactions],
      {
      programId: this.config.programId,
      cpmmProgramId: this.config.cpmmProgramId,
      platformPda: this.config.platformPda,
    }, requiredTrackedAccounts, finalizedSlot);
    const observedByPubkey = new Map(accounts.map((account) => [account.pubkey, account]));
    for (const tracked of requiredTrackedAccounts) {
      const observed = observedByPubkey.get(tracked.pubkey);
      if (
        !observed ||
        observed.role !== tracked.expectedRole ||
        (tracked.expectedOwner !== undefined && observed.owner !== tracked.expectedOwner)
      ) {
        throw new Error(`Tracked Solana account ${tracked.pubkey} was not refreshed with its expected finalized state`);
      }
    }
    const nextCheckpoint = advanceCheckpoint(checkpoint, transactions, batch.backfillComplete);
    const nextCpmmCheckpoint = advanceCheckpoint(cpmmCheckpoint, cpmmTransactions, cpmmBatch.backfillComplete);
    await store.atomicPass([
      {
        namespace: this.namespace,
        chunk: { transactions, accounts, checkpoint: nextCheckpoint },
      },
      {
        namespace: cpmmNamespace,
        chunk: { transactions: cpmmTransactions, accounts: [], checkpoint: nextCpmmCheckpoint },
      },
      ...mintBatches.map((mintBatch) => ({
        namespace: mintBatch.namespace,
        chunk: {
          transactions: mintBatch.transactions,
          accounts: [],
          checkpoint: mintBatch.checkpoint,
        },
      })),
    ]);
    const refreshedTrackedAccounts = await store.listTrackedAccounts(this.namespace);
    const initialMintAddresses = new Set(trackedMints.map((mint) => mint.pubkey));
    const newlyDiscoveredMints = refreshedTrackedAccounts.filter(
      (account) => account.expectedRole === "mint" && !initialMintAddresses.has(account.pubkey),
    );

    const launches = await store.listLaunches(this.namespace);
    let issues = 0;
    for (const launch of launches) {
      const healthy = Boolean(launch.accountHash);
      if (!healthy) issues += 1;
      await store.recordReconciliation(this.namespace, {
        entity: "launchState",
        account: launch.launchState,
        checkType: "finalized-account-snapshot",
        slot: launch.observedSlot,
        signature: launch.observedSignature,
        actual: launch.accountHash,
        expected: "present-at-finalized-observation-slot",
        healthy,
        details: launch.decoded
          ? "Raw bytes and decoded projection are retained"
          : "Raw bytes retained; no reviewed LaunchLab IDL decoder is configured",
      });
    }
    const forwardCatchupRequired =
      (!checkpoint.backfillComplete && nextCheckpoint.backfillComplete) ||
      (!cpmmCheckpoint.backfillComplete && nextCpmmCheckpoint.backfillComplete) ||
      mintStates.some((state, index) =>
        !state.checkpoint.backfillComplete &&
        Boolean(mintBatches[index]?.checkpoint.backfillComplete),
      );
    const backfillInProgress =
      !nextCheckpoint.backfillComplete ||
      !nextCpmmCheckpoint.backfillComplete ||
      mintBatches.some((batch) => !batch.checkpoint.backfillComplete) ||
      newlyDiscoveredMints.length > 0 ||
      forwardCatchupRequired;
    if (!backfillInProgress) {
      await store.markScanComplete(
        [this.namespace, cpmmNamespace, ...mintBatches.map((batch) => batch.namespace)],
        finalizedSlot,
      );
    }
    this.consecutiveRpcGaps = 0;
    if (!backfillInProgress) this.successfullyScannedThroughSlot = finalizedSlot;
    this.health = {
      ...this.health,
      healthy:
        issues === 0 && !backfillInProgress,
      lastFinalizedSlot: finalizedSlot,
      indexedThroughSlot: this.successfullyScannedThroughSlot,
      finalizedSlotLag: Math.max(0, finalizedSlot - (this.successfullyScannedThroughSlot ?? ((this.config.startSlot ?? 0) - 1))),
      backfillInProgress,
      lastSuccessAt: new Date().toISOString(),
      reconciliationIssues: issues,
      error:
        backfillInProgress
        ? "Historical finalized-signature backfill is still in progress"
        : issues === 0 ? undefined : `${issues} finalized Solana reconciliation issue(s)`,
    };
    await this.updateAlerts(undefined, true);
  }

  private async updateAlerts(error?: string, trackedAccountsValidated = false): Promise<void> {
    if (this.store?.listActiveOperationalAlerts) await this.hydrateActiveAlerts();
    const now = new Date().toISOString();
    const alerts: IndexerAlert[] = [];
    const add = (
      code: IndexerAlert["code"],
      severity: IndexerAlert["severity"],
      message: string,
      action: string,
      observedValue: number,
      threshold: number,
    ) => {
      const alertKey = this.alertKey(code);
      const firstObservedAt = this.alertFirstObserved.get(alertKey) ?? now;
      this.alertFirstObserved.set(alertKey, firstObservedAt);
      alerts.push({ code, severity, message, action, observedValue, threshold, firstObservedAt, lastObservedAt: now });
    };
    const warning = this.config.lagWarningSlots ?? 150;
    const critical = this.config.lagCriticalSlots ?? 600;
    if (!this.health.backfillInProgress && this.health.finalizedSlotLag >= warning) {
      add(
        "FINALIZED_SLOT_LAG",
        this.health.finalizedSlotLag >= critical ? "critical" : "warning",
        `Finalized market history is ${this.health.finalizedSlotLag} slots behind`,
        "Check worker/database health and RPC availability; do not serve stale market history until the lag recovers.",
        this.health.finalizedSlotLag,
        this.health.finalizedSlotLag >= critical ? critical : warning,
      );
    }
    const rpcThreshold = this.config.rpcGapAlertCount ?? 3;
    if (this.consecutiveRpcGaps >= rpcThreshold) {
      add("REPEATED_RPC_GAPS", "critical", `${this.consecutiveRpcGaps} consecutive RPC gap failures`, "Fail over to a reviewed RPC provider and verify missing finalized signatures before resuming.", this.consecutiveRpcGaps, rpcThreshold);
    }
    if (this.health.reconciliationIssues > 0) {
      add("RECONCILIATION_FAILURE", "critical", `${this.health.reconciliationIssues} finalized reconciliation checks failed`, "Inspect retained raw account evidence and stop relying on affected projections.", this.health.reconciliationIssues, 1);
    }
    if (error && /tracked solana account|expected .*observed unknown|owner|layout/i.test(error)) {
      add("TRACKED_ACCOUNT_MISMATCH", "critical", "A tracked account no longer matches its reviewed owner or layout", "Treat as a possible program upgrade or authority change; inspect the account before re-enabling market data.", 1, 1);
    } else if (
      !trackedAccountsValidated &&
      this.health.activeAlerts.some((alert) => alert.code === "TRACKED_ACCOUNT_MISMATCH")
    ) {
      add("TRACKED_ACCOUNT_MISMATCH", "critical", "A tracked account no longer matches its reviewed owner or layout", "Treat as a possible program upgrade or authority change; inspect the account before re-enabling market data.", 1, 1);
    }
    const lastRunAt = this.health.lastRunAt ? Date.parse(this.health.lastRunAt) : Date.now();
    const stallThreshold = this.config.stallAlertMs ?? Math.max(30_000, (this.config.pollIntervalMs ?? 15_000) * 3);
    const stalledFor = Math.max(0, Date.now() - lastRunAt);
    if (this.running && stalledFor >= stallThreshold) {
      add("WORKER_STALLED", "critical", `Indexer polling has not completed for ${stalledFor}ms`, "Inspect the active RPC and database operation; keep market history unavailable until a full pass completes.", stalledFor, stallThreshold);
    }
    const currentNamespace = this.alertNamespace();
    // An indexer instance normally has one immutable namespace. Keep this
    // guard anyway so a reconfigured/reused instance cannot resolve alerts
    // belonging to the previous cluster or program.
    const previousAlerts = this.activeAlertNamespace === currentNamespace
      ? new Map(this.health.activeAlerts.map((alert) => [alert.code, alert]))
      : new Map<IndexerAlert["code"], IndexerAlert>();
    const previousCodes = new Set(previousAlerts.keys());
    const activeCodes = new Set(alerts.map((alert) => alert.code));
    const transitions: IndexerAlertNotification[] = [];
    for (const alert of alerts) {
      const previous = previousAlerts.get(alert.code);
      if (!previous || (previous.severity === "warning" && alert.severity === "critical")) {
        logger[alert.severity === "critical" ? "error" : "warn"](
          { operationalAlert: alert, cluster: this.health.cluster, programId: this.health.programId },
          "Solana indexer operational alert",
        );
        transitions.push({
          event: "active",
          alert,
          cluster: this.health.cluster,
          programId: this.health.programId,
        });
      }
    }
    for (const code of previousCodes) {
      if (!activeCodes.has(code)) {
        this.alertFirstObserved.delete(this.alertKey(code));
        logger.info(
          {
            operationalAlertRecovered: code,
            cluster: this.health.cluster,
            programId: this.health.programId,
          },
          "Solana indexer operational alert recovered",
        );
        transitions.push({
          event: "recovered",
          code,
          cluster: this.health.cluster,
          programId: this.health.programId,
          recoveredAt: now,
        });
      }
    }
    this.health.activeAlerts = alerts;
    this.activeAlertNamespace = currentNamespace;
    this.health.alertStatus = alerts.some((alert) => alert.severity === "critical")
      ? "critical"
      : alerts.length > 0 ? "warning" : "ok";
    const recordOperationalAlerts = this.store?.recordOperationalAlerts;
    if (recordOperationalAlerts) {
      const events = [
        ...alerts.map((alert) => ({
          deliveryKey: `active:${alert.firstObservedAt}:${alert.severity}`,
          event: "active" as const,
          notification: {
            event: "active" as const,
            alert,
            cluster: this.health.cluster,
            programId: this.health.programId,
          } as unknown as Record<string, unknown>,
        })),
        ...transitions
          .filter((notification): notification is Extract<IndexerAlertNotification, { event: "recovered" }> =>
            notification.event === "recovered")
          .map((notification) => ({
            deliveryKey: `recovered:${notification.code}:${previousAlerts.get(notification.code)?.firstObservedAt ?? notification.recoveredAt}`,
            event: "recovered" as const,
            notification: notification as unknown as Record<string, unknown>,
          })),
      ];
      try {
        await recordOperationalAlerts.call(this.store, this.namespace, alerts, events);
        await this.flushAlertOutbox();
      } catch (error) {
        logger.error(
          { error: safeError(error, this.config.rpcUrl), cluster: this.health.cluster, programId: this.health.programId },
          "Solana indexer operational alert state persistence failed",
        );
      }
    } else {
      for (const notification of transitions) this.deliverAlert(notification);
    }
  }

  private async hydrateActiveAlerts(): Promise<void> {
    const listActive = this.store?.listActiveOperationalAlerts;
    if (!listActive) return;
    const currentNamespace = this.alertNamespace();
    try {
      const activeAlerts = await listActive.call(this.store, this.namespace);
      const namespacePrefix = `${currentNamespace}:`;
      for (const key of this.alertFirstObserved.keys()) {
        if (key.startsWith(namespacePrefix)) this.alertFirstObserved.delete(key);
      }
      for (const alert of activeAlerts) {
        this.alertFirstObserved.set(
          this.alertKey(alert.code),
          alert.firstObservedAt,
        );
      }
      this.health.activeAlerts = activeAlerts.map((alert) => ({ ...alert }));
      this.activeAlertNamespace = currentNamespace;
      this.health.alertStatus = activeAlerts.some((alert) => alert.severity === "critical")
        ? "critical"
        : activeAlerts.length > 0 ? "warning" : "ok";
    } catch (error) {
      logger.error(
        {
          error: safeError(error, this.config.rpcUrl),
          cluster: this.health.cluster,
          programId: this.health.programId,
        },
        "Solana indexer active alert state hydration failed",
      );
    }
  }

  private alertKey(code: IndexerAlert["code"]): string {
    return `${this.alertNamespace()}:${code}`;
  }

  private alertNamespace(): string {
    return `${this.health.cluster ?? "unconfigured"}:${this.health.programId ?? "unconfigured"}`;
  }

  private deliverAlert(notification: IndexerAlertNotification): void {
    if (!this.alertDestination) return;
    void this.alertDestination.deliver(notification).catch((error) => {
      logger.error(
        {
          alertCode: notification.event === "active" ? notification.alert.code : notification.code,
          alertEvent: notification.event,
          error: safeError(error, this.config.rpcUrl),
        },
        "Solana indexer on-call alert delivery failed",
      );
    });
  }

  private async flushAlertOutbox(): Promise<void> {
    const listPending = this.store?.listPendingOperationalAlertDeliveries;
    const markDelivery = this.store?.markOperationalAlertDelivery;
    if (!this.alertDestination || !listPending || !markDelivery || this.alertDeliveryRunning) return;
    this.alertDeliveryRunning = true;
    try {
      const pending = await listPending.call(this.store, this.namespace);
      for (const delivery of pending) {
        try {
          await this.alertDestination.deliver(
            delivery.notification as unknown as IndexerAlertNotification,
          );
          await markDelivery.call(this.store, delivery, true);
        } catch (error) {
          const message = safeError(error, this.config.rpcUrl);
          await markDelivery.call(this.store, delivery, false, message);
          logger.error(
            {
              alertCode: delivery.code,
              alertDeliveryKey: delivery.deliveryKey,
              cluster: delivery.cluster,
              programId: delivery.programId,
              error: message,
            },
            "Solana indexer on-call alert delivery failed",
          );
        }
      }
    } catch (error) {
      logger.error(
        { error: safeError(error, this.config.rpcUrl), cluster: this.health.cluster, programId: this.health.programId },
        "Solana indexer alert outbox drain failed",
      );
    } finally {
      this.alertDeliveryRunning = false;
    }
  }
}

export function createOnchainIndexer(): OnchainIndexer {
  return new OnchainIndexer();
}