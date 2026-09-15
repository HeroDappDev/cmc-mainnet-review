export * from "./generated/api";
export * from "./generated/types";

import { z } from "zod";

// Error responses intentionally accept a nullable market because a failed
// finalized lookup must never expose an unverified projection.
export const GetChainMarketError = z.object({
  market: z.unknown().nullable(),
  enabled: z.boolean(),
  error: z.string(),
});

export const GetChainMarketHistoryError = z.object({
  market: z.unknown().nullable(),
  trades: z.array(z.unknown()),
  enabled: z.boolean(),
  error: z.string(),
});
