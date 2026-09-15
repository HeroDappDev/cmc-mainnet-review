export type CommodityQuote = {
  symbol: string;
  priceUSD: number | null;
  changePercent: number | null;
  changePeriod: "previous business day" | null;
  status: "current" | "daily" | "reference" | "unavailable";
  source: string | null;
  sourceUrl: string | null;
  updatedAt: string | null;
  message: string;
};

export type CommodityQuotesResponse = {
  quotes: Record<string, CommodityQuote>;
  fetchedAt: string;
  refreshAfterMs: number;
};