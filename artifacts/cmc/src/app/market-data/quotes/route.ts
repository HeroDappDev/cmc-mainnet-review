import { NextResponse } from "next/server";
import type { CommodityQuote, CommodityQuotesResponse } from "@/lib/commodity-quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REFRESH_MS = 30_000;
const METALS = { GLD: "XAU", SILV: "XAG", PLAT: "XPT", PALL: "XPD", COPP: "HG" } as const;
const ENERGY_SERIES = {
  WTI: { id: "DCOILWTICO", name: "WTI Cushing spot", unit: "USD per barrel" },
  BRENT: { id: "DCOILBRENTEU", name: "Brent Europe spot", unit: "USD per barrel" },
  NGAS: { id: "DHHNGSP", name: "Henry Hub natural gas spot", unit: "USD per MMBtu" },
  GASO: { id: "DGASNYH", name: "New York Harbor conventional gasoline spot", unit: "USD per gallon" },
  HEAT: { id: "DHOILNYH", name: "New York Harbor No. 2 heating oil spot", unit: "USD per gallon" },
} as const;
const UNSUPPORTED = [
  "ALUM", "LUMB", "WHEAT",
  "CORN", "SOY", "SOYO", "RICE", "OATS", "COFF", "COCO", "COTT",
  "SUGAR", "CATTLE", "HOGS", "FEED", "BURG", "FRIES", "PIZZA",
  "CS2", "GP", "TCG", "WATER", "CAR",
];

let cache: { expiresAt: number; data: CommodityQuotesResponse } | null = null;
let pending: Promise<CommodityQuotesResponse> | null = null;

function unavailable(symbol: string, message = "Feed not connected"): CommodityQuote {
  return { symbol, priceUSD: null, changePercent: null, changePeriod: null, status: "unavailable", source: null, sourceUrl: null, updatedAt: null, message };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Price source returned HTTP ${response.status}`);
  return response.json();
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/csv" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Price source returned HTTP ${response.status}`);
  return response.text();
}

async function metalQuote(symbol: string, providerSymbol: string): Promise<CommodityQuote> {
  const sourceUrl = `https://gold-api.com/`;
  try {
    const value = await getJson(`https://api.gold-api.com/price/${providerSymbol}`) as {
      symbol?: string; currency?: string; price?: number; updatedAt?: string;
    };
    if (value.symbol !== providerSymbol || value.currency !== "USD" ||
      typeof value.price !== "number" || !Number.isFinite(value.price) || value.price <= 0 ||
      !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt))) {
      throw new Error("Invalid price or timestamp from provider");
    }
    return {
      symbol, priceUSD: value.price, changePercent: null, changePeriod: null,
      status: "current", source: "Gold API", sourceUrl, updatedAt: value.updatedAt,
      message: "Latest indicative provider quote. Precious metals: USD per troy oz; copper: USD per lb. Exchange timing is not guaranteed; daily change is unavailable from this feed.",
    };
  } catch {
    return { ...unavailable(symbol, "Price feed temporarily unavailable; retrying on the next refresh."), source: "Gold API", sourceUrl };
  }
}

async function currencyQuotes(): Promise<CommodityQuote[]> {
  const sourceUrl = "https://frankfurter.dev/";
  try {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 10);
    const date = from.toISOString().slice(0, 10);
    const data = await getJson(`https://api.frankfurter.dev/v1/${date}..?base=USD&symbols=EUR,JPY`) as {
      base?: string; rates?: Record<string, Record<string, number>>;
    };
    if (data.base !== "USD" || !data.rates || typeof data.rates !== "object") throw new Error("Invalid currency feed");
    const dates = Object.keys(data.rates).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    return ["EUR", "JPY"].map(symbol => {
      const availableDates = dates.filter(date => {
        const rate = data.rates![date]?.[symbol];
        return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
      });
      const latest = availableDates.at(-1);
      const previous = availableDates.at(-2);
      if (!latest) {
        return { ...unavailable(symbol, "Daily reference rate unavailable"), source: "Frankfurter / ECB", sourceUrl };
      }
      const rate = data.rates![latest]?.[symbol];
      const previousRate = previous ? data.rates![previous]?.[symbol] : null;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        return unavailable(symbol, "Daily reference rate unavailable");
      }
      const priceUSD = 1 / rate;
      const previousUSD = typeof previousRate === "number" && Number.isFinite(previousRate) && previousRate > 0 ? 1 / previousRate : null;
      return {
        symbol, priceUSD,
        changePercent: previousUSD === null ? null : (priceUSD / previousUSD - 1) * 100,
        changePeriod: previousUSD === null ? null : "previous business day",
        status: "daily", source: "Frankfurter / ECB", sourceUrl,
        updatedAt: latest,
        message: `Daily reference rate dated ${latest}, not a real-time FX quote.${previousUSD === null ? "" : ` Change versus ${previous}.`}`,
      };
    });
  } catch {
    return ["EUR", "JPY"].map(symbol => ({ ...unavailable(symbol, "Daily currency feed temporarily unavailable."), source: "Frankfurter / ECB", sourceUrl }));
  }
}

async function energyQuotes(): Promise<CommodityQuote[]> {
  const sourceUrl = "https://fred.stlouisfed.org/categories/32217";
  const symbols = Object.keys(ENERGY_SERIES) as Array<keyof typeof ENERGY_SERIES>;
  try {
    const ids = symbols.map(symbol => ENERGY_SERIES[symbol].id);
    const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${ids.join(",")}`);
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines.shift()?.split(",");
    if (!headers || headers[0] !== "observation_date") throw new Error("Invalid FRED CSV");

    const observations = new Map<string, Array<{ date: string; value: number }>>(
      ids.map(id => [id, []]),
    );
    for (const line of lines) {
      const columns = line.split(",");
      const date = columns[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      ids.forEach(id => {
        const index = headers.indexOf(id);
        if (index < 1) return;
        const value = Number(columns[index]);
        if (columns[index] !== "" && Number.isFinite(value) && value > 0) {
          observations.get(id)!.push({ date, value });
        }
      });
    }

    return symbols.map(symbol => {
      const series = ENERGY_SERIES[symbol];
      const values = observations.get(series.id) ?? [];
      const latest = values.at(-1);
      const previous = values.at(-2);
      if (!latest) {
        return { ...unavailable(symbol, `${series.name} has no published observations.`), source: "U.S. EIA via FRED", sourceUrl };
      }
      return {
        symbol,
        priceUSD: latest.value,
        changePercent: previous ? (latest.value / previous.value - 1) * 100 : null,
        changePeriod: previous ? "previous business day" : null,
        status: "daily",
        source: "U.S. EIA via FRED",
        sourceUrl,
        updatedAt: latest.date,
        message: `${series.name}, ${series.unit}, dated ${latest.date}. Daily government reference data, not a real-time futures quote.${previous ? ` Change versus the prior published observation (${previous.date}).` : ""}`,
      };
    });
  } catch {
    return symbols.map(symbol => ({
      ...unavailable(symbol, "Daily EIA energy feed temporarily unavailable."),
      source: "U.S. EIA via FRED",
      sourceUrl,
    }));
  }
}

async function loadQuotes(): Promise<CommodityQuotesResponse> {
  const [metals, currencies, energy] = await Promise.all([
    Promise.all(Object.entries(METALS).map(([symbol, providerSymbol]) => metalQuote(symbol, providerSymbol))),
    currencyQuotes(),
    energyQuotes(),
  ]);
  const quotes = Object.fromEntries([
    ...UNSUPPORTED.map(symbol => [symbol, unavailable(symbol)]),
    ...[...metals, ...currencies, ...energy].map(quote => [quote.symbol, quote]),
    ["USD", {
      symbol: "USD", priceUSD: 1, changePercent: null, changePeriod: null,
      status: "reference", source: "USD denomination", sourceUrl: null,
      updatedAt: null, message: "One USD expressed in USD; a denomination, not a market quote.",
    } satisfies CommodityQuote],
  ]);
  return { quotes, fetchedAt: new Date().toISOString(), refreshAfterMs: REFRESH_MS };
}

export async function GET() {
  // Cache failures as well as successes, and coalesce concurrent requests.
  // This prevents refresh clicks or multiple visitors from flooding providers.
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }
  if (!pending) {
    pending = loadQuotes().then(data => {
      cache = { data, expiresAt: Date.now() + REFRESH_MS };
      return data;
    }).finally(() => { pending = null; });
  }
  return NextResponse.json(await pending, { headers: { "Cache-Control": "no-store" } });
}