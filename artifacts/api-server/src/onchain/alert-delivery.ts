import { logger } from "../lib/logger";
import type { IndexerAlert, SolanaCluster } from "./types";

export type IndexerAlertNotification =
  | { event: "active"; alert: IndexerAlert; cluster?: SolanaCluster; programId?: string }
  | { event: "recovered"; code: IndexerAlert["code"]; cluster?: SolanaCluster; programId?: string; recoveredAt: string };

export interface IndexerAlertDestination {
  deliver(notification: IndexerAlertNotification): Promise<void>;
}

export function notificationPayload(notification: IndexerAlertNotification) {
  if (notification.event === "recovered") {
    return {
      source: "solana-indexer",
      event: "recovered",
      code: notification.code,
      cluster: notification.cluster,
      ...(notification.programId ? { programId: notification.programId } : {}),
      recoveredAt: notification.recoveredAt,
    };
  }
  const { alert } = notification;
  return {
    source: "solana-indexer",
    event: "active",
    code: alert.code,
    severity: alert.severity,
    cluster: notification.cluster,
    ...(notification.programId ? { programId: notification.programId } : {}),
    message: alert.message,
    action: alert.action,
    observedValue: alert.observedValue,
    threshold: alert.threshold,
    firstObservedAt: alert.firstObservedAt,
    lastObservedAt: alert.lastObservedAt,
  };
}

export class WebhookAlertDestination implements IndexerAlertDestination {
  constructor(
    private readonly url: string,
    private readonly request: typeof fetch = fetch,
    private readonly maxAttempts = 3,
  ) {}

  async deliver(notification: IndexerAlertNotification): Promise<void> {
    const attempts = Math.max(1, Math.floor(this.maxAttempts));
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.request(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(notificationPayload(notification)),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return;
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        lastError = new Error(`On-call webhook returned HTTP ${response.status}`);
        if (!retryable || attempt === attempts) {
          throw lastError;
        }
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof Error && /HTTP \d+\b/.test(error.message))
          || /HTTP (408|429|5\d\d)\b/.test(error.message);
        if (!retryable || attempt === attempts) throw error;
      }
      // A short bounded backoff prevents a transient paging outage from
      // dropping an activation while keeping the indexer polling loop free.
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 1_000)));
    }
    throw lastError instanceof Error ? lastError : new Error("On-call webhook delivery failed");
  }
}

export function createAlertDestination(env: NodeJS.ProcessEnv = process.env): IndexerAlertDestination | undefined {
  const url = env.SOLANA_INDEXER_ALERT_WEBHOOK_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("must use HTTPS");
    return new WebhookAlertDestination(parsed.toString());
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "invalid URL" },
      "Solana indexer on-call webhook is invalid",
    );
    return undefined;
  }
}