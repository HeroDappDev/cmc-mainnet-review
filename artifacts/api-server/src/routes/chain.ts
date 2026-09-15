import { Router, type IRouter } from "express";
import {
  GetChainConfigResponse,
  GetChainMarketHistoryResponse,
  GetChainMarketHistoryError,
  GetChainMarketResponse,
  GetChainMarketError,
  GetChainMarketsResponse,
  GetChainStatusResponse,
} from "@workspace/api-zod";
import type { OnchainIndexer } from "../onchain/indexer";

export function createChainRouter(indexer: OnchainIndexer): IRouter {
  const router: IRouter = Router();
  const explicitlyRequested = () => process.env.SOLANA_INDEXER_ENABLED === "true";

  router.get("/chain/config", (_req, res) => {
    res.json(GetChainConfigResponse.parse(indexer.getPublicConfig()));
  });

  router.get("/chain/markets", async (_req, res): Promise<void> => {
    const health = indexer.getHealth();
    if (!health.enabled) {
      const requested = explicitlyRequested();
      const body = GetChainMarketsResponse.parse({
        markets: [],
        enabled: false,
        ...(requested
          ? { error: health.error ?? "Solana indexing configuration is invalid" }
          : { reason: health.error ?? "Solana indexing is disabled" }),
      });
      res.status(requested ? 503 : 200).json(body);
      return;
    }
    if (!health.workerRunning || !health.healthy) {
      const body = GetChainMarketsResponse.parse({
        markets: [],
        enabled: true,
        error:
          health.error ??
          "On-chain indexer is not running with durable storage",
      });
      res.status(503).json(body);
      return;
    }
    try {
      const markets = await indexer.getMarkets();
      const body = GetChainMarketsResponse.parse({
        markets,
        enabled: true,
        cluster: health.cluster,
        programId: health.programId,
        indexedThroughSlot: health.indexedThroughSlot,
      });
      res.json(body);
    } catch (error) {
      const body = GetChainMarketsResponse.parse({
        markets: [],
        enabled: true,
        error:
          error instanceof Error
            ? error.message
            : "Projected market storage is unavailable",
      });
      res.status(503).json(body);
    }
  });

  router.get("/chain/markets/:launchState", async (req, res): Promise<void> => {
    const launchState = req.params.launchState;
    const health = indexer.getHealth();
    if (!health.enabled || !health.workerRunning || !health.healthy) {
      const body = GetChainMarketError.parse({
        market: null,
        enabled: health.enabled,
        error: health.error ?? "On-chain indexer is not running with durable storage",
      });
      res.status(503).json(body);
      return;
    }
    try {
      const market = await indexer.getMarket(launchState);
      if (!market) {
        const body = GetChainMarketError.parse({
          market: null,
          enabled: true,
          error: "Finalized market was not found",
        });
        res.status(404).json(body);
        return;
      }
      const body = GetChainMarketResponse.parse({
        market,
        enabled: true,
        cluster: health.cluster,
        programId: health.programId,
        indexedThroughSlot: health.indexedThroughSlot,
      });
      res.json(body);
    } catch (error) {
      const body = GetChainMarketError.parse({
        market: null,
        enabled: true,
        error: error instanceof Error ? error.message : "Projected market storage is unavailable",
      });
      res.status(503).json(body);
    }
  });

  router.get("/chain/markets/:launchState/history", async (req, res): Promise<void> => {
    const launchState = req.params.launchState;
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    const health = indexer.getHealth();
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      const body = GetChainMarketHistoryError.parse({
        market: null,
        trades: [],
        enabled: health.enabled,
        error: "limit must be an integer between 1 and 500",
      });
      res.status(400).json(body);
      return;
    }
    if (!health.enabled || !health.workerRunning || !health.healthy) {
      const body = GetChainMarketHistoryError.parse({
        market: null,
        trades: [],
        enabled: health.enabled,
        error: health.error ?? "On-chain indexer is not running with durable storage",
      });
      res.status(503).json(body);
      return;
    }
    try {
      const market = await indexer.getMarket(launchState);
      if (!market) {
        const body = GetChainMarketHistoryError.parse({
          market: null,
          trades: [],
          enabled: true,
          error: "Finalized market was not found",
        });
        res.status(404).json(body);
        return;
      }
      const trades = await indexer.getTradeHistory(launchState, limit);
      const body = GetChainMarketHistoryResponse.parse({
        market,
        trades,
        enabled: true,
        cluster: health.cluster,
        programId: health.programId,
        indexedThroughSlot: health.indexedThroughSlot,
      });
      res.json(body);
    } catch (error) {
      const body = GetChainMarketHistoryError.parse({
        market: null,
        trades: [],
        enabled: true,
        error: error instanceof Error ? error.message : "Projected market history storage is unavailable",
      });
      res.status(503).json(body);
    }
  });

  router.get("/chain/status", (_req, res) => {
    const health = indexer.getHealth();
    // Disabled is an intentional release-gate state and is represented in
    // JSON. An enabled worker that cannot prove its health is an HTTP 503.
    const body = GetChainStatusResponse.parse(health);
    res
      .status(
        (health.enabled && !health.healthy) ||
          (explicitlyRequested() && Boolean(health.error))
          ? 503
          : 200,
      )
      .json(body);
  });

  router.get("/chain/metrics", (_req, res) => {
    res.type("text/plain; version=0.0.4; charset=utf-8").send(indexer.getMetrics());
  });

  return router;
}
