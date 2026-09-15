"use client";

import { useEffect, useState } from "react";

export const TOTAL_SUPPLY = 1_000_000_000;
export const CURVE_SUPPLY = 800_000_000;
export const RESERVED_SUPPLY = 200_000_000;
export const OPENING_FDV_SOL = 5;
export const GRADUATION_FDV_SOL = 80;
export const NET_RAISE_SOL = 16;
export const FEE_PERCENT = 0.75; // 0.25% Raydium + 0.50% CMC

export const VIRTUAL_TOKEN_START = 1_066_666_666.6666667;
export const VIRTUAL_QUOTE_START = 5.333333333333333;
export const CURVE_TOKEN_FLOOR = VIRTUAL_TOKEN_START - CURVE_SUPPLY;

const SOL_FLOATING_DUST = 1e-12;

/**
 * Return the gross SOL which can still be executed before the curve reaches
 * its token floor.  The fee is paid from the input, so the constant-product
 * quote reserve only sees the net amount.
 *
 * This deliberately has no storage or UI dependencies so every browser-local
 * buy path can use the same boundary calculation.
 */
export function getMaxExecutableBuySOL(
  tokenReserve: number,
  quoteReserve: number,
  feeRate = FEE_PERCENT / 100,
) {
  if (
    !Number.isFinite(tokenReserve) ||
    !Number.isFinite(quoteReserve) ||
    !Number.isFinite(feeRate) ||
    tokenReserve <= CURVE_TOKEN_FLOOR ||
    quoteReserve <= 0 ||
    feeRate < 0 ||
    feeRate >= 1
  ) {
    return 0;
  }
  const netQuote = quoteReserve * ((tokenReserve - CURVE_TOKEN_FLOOR) / CURVE_TOKEN_FLOOR);
  return netQuote / (1 - feeRate);
}

export const CATEGORIES = [
  "All",
  "Metals",
  "Energy",
  "Agriculture",
  "Livestock",
  "Fast food",
  "CS2 skins",
  "Game gold",
  "Trading cards",
  "Water",
  "Cars",
  "Currencies",
] as const;

export type Category = typeof CATEGORIES[number];

export type QuoteItem = {
  symbol: string;
  name: string;
  category: Category;
  usdReference: number;
  unit: string;
};

export const QUOTE_CATALOGUE: QuoteItem[] = [
  { symbol: "GLD", name: "Gold", category: "Metals", usdReference: 2341.5, unit: "per oz" },
  { symbol: "SILV", name: "Silver", category: "Metals", usdReference: 28.15, unit: "per oz" },
  { symbol: "PLAT", name: "Platinum", category: "Metals", usdReference: 1050.0, unit: "per oz" },
  { symbol: "PALL", name: "Palladium", category: "Metals", usdReference: 980.0, unit: "per oz" },
  { symbol: "COPP", name: "Copper", category: "Metals", usdReference: 4.12, unit: "per lb" },
  { symbol: "ALUM", name: "Aluminum", category: "Metals", usdReference: 1.15, unit: "per lb" },
  { symbol: "WTI", name: "WTI Crude", category: "Energy", usdReference: 82.3, unit: "per bbl" },
  { symbol: "BRENT", name: "Brent Crude", category: "Energy", usdReference: 86.5, unit: "per bbl" },
  { symbol: "NGAS", name: "Natural Gas", category: "Energy", usdReference: 2.9, unit: "per MMBtu" },
  { symbol: "GASO", name: "Gasoline", category: "Energy", usdReference: 2.6, unit: "per gal" },
  { symbol: "HEAT", name: "Heating Oil", category: "Energy", usdReference: 2.5, unit: "per gal" },
  { symbol: "LUMB", name: "Lumber", category: "Agriculture", usdReference: 500.0, unit: "per 1000 bd ft" },
  { symbol: "WHEAT", name: "Wheat", category: "Agriculture", usdReference: 6.5, unit: "per bushel" },
  { symbol: "CORN", name: "Corn", category: "Agriculture", usdReference: 4.5, unit: "per bushel" },
  { symbol: "SOY", name: "Soybeans", category: "Agriculture", usdReference: 11.5, unit: "per bushel" },
  { symbol: "SOYO", name: "Soybean Oil", category: "Agriculture", usdReference: 0.45, unit: "per lb" },
  { symbol: "RICE", name: "Rice", category: "Agriculture", usdReference: 18.0, unit: "per cwt" },
  { symbol: "OATS", name: "Oats", category: "Agriculture", usdReference: 3.5, unit: "per bushel" },
  { symbol: "COFF", name: "Coffee", category: "Agriculture", usdReference: 2.2, unit: "per lb" },
  { symbol: "COCO", name: "Cocoa", category: "Agriculture", usdReference: 9000.0, unit: "per MT" },
  { symbol: "COTT", name: "Cotton", category: "Agriculture", usdReference: 0.8, unit: "per lb" },
  { symbol: "SUGAR", name: "Sugar", category: "Agriculture", usdReference: 0.2, unit: "per lb" },
  { symbol: "CATTLE", name: "Live Cattle", category: "Livestock", usdReference: 1.8, unit: "per lb" },
  { symbol: "HOGS", name: "Lean Hogs", category: "Livestock", usdReference: 0.9, unit: "per lb" },
  { symbol: "FEED", name: "Feeder Cattle", category: "Livestock", usdReference: 2.5, unit: "per lb" },
  { symbol: "BURG", name: "Burger", category: "Fast food", usdReference: 5.0, unit: "per item" },
  { symbol: "FRIES", name: "Fries", category: "Fast food", usdReference: 3.0, unit: "per item" },
  { symbol: "PIZZA", name: "Pizza", category: "Fast food", usdReference: 15.0, unit: "per item" },
  { symbol: "CS2", name: "CS2 Skin", category: "CS2 skins", usdReference: 100.0, unit: "per item" },
  { symbol: "GP", name: "Game Gold", category: "Game gold", usdReference: 0.01, unit: "per 1k" },
  { symbol: "TCG", name: "Trading Card", category: "Trading cards", usdReference: 250.0, unit: "per item" },
  { symbol: "WATER", name: "Water", category: "Water", usdReference: 1.5, unit: "per bottle" },
  { symbol: "CAR", name: "Car", category: "Cars", usdReference: 35000.0, unit: "per vehicle" },
  { symbol: "USD", name: "US Dollar", category: "Currencies", usdReference: 1.0, unit: "per USD" },
  { symbol: "EUR", name: "Euro", category: "Currencies", usdReference: 1.08, unit: "per EUR" },
  { symbol: "JPY", name: "Japanese Yen", category: "Currencies", usdReference: 0.0065, unit: "per JPY" },
];

export type Market = {
  id: string;
  name: string;
  symbol: string;
  imageURL: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  priceSOL: number;
  change24h: number;
  volume24h: number;
  marketCap: number; // in SOL
  category: Category;
  address: string;
  createdAt: number;
  pairSymbol: string;
  pairName: string;
  pairUSD: number; // informational only
  isBasket?: boolean;
  pairComponents?: string[];
  totalSupply: number;
  curveSupply: number;
  reservedSupply: number;
  tokenReserve: number;
  quoteReserve: number;
  curveValueSOL: number;
  initialBuySOL: number;
  graduated: boolean;
};

export type DemoTrade = {
  id: string;
  marketAddress: string;
  type: "launch" | "buy" | "sell";
  amount: number;
  priceSOL: number;
  feeSOL: number;
  solValue: number;
  timestamp: number;
  priceAfterSOL: number;
};

export type SimulationWallet = {
  sol: number;
  tokenBalances: Record<string, number>;
};

const MARKETS_KEY = "cmc_sol_markets_v1";
const TRADES_KEY = "cmc_sol_trades_v1";
const WALLET_KEY = "cmc_sol_wallet_v1";
const eventName = "cmc_simulation_updated";

export function initialReserves(firstBuySOL: number) {
  const quoteReserve = VIRTUAL_QUOTE_START;
  const maxExecutableSOL = getMaxExecutableBuySOL(VIRTUAL_TOKEN_START, quoteReserve);
  const executedSOL = Math.min(firstBuySOL, maxExecutableSOL);
  const rawUnspentSOL = Math.max(0, firstBuySOL - executedSOL);
  const unspentSOL = rawUnspentSOL <= SOL_FLOATING_DUST ? 0 : rawUnspentSOL;
  const feeSOL = executedSOL * (FEE_PERCENT / 100);
  const netQuote = executedSOL - feeSOL;
  const reachesFloor = maxExecutableSOL > 0 && executedSOL >= maxExecutableSOL - SOL_FLOATING_DUST;
  const tokenReserve = reachesFloor
    ? CURVE_TOKEN_FLOOR
    : VIRTUAL_TOKEN_START * quoteReserve / (quoteReserve + netQuote);
  const tokenOut = VIRTUAL_TOKEN_START - tokenReserve;
  return {
    quoteReserve: quoteReserve + netQuote,
    tokenReserve,
    tokenOut,
    requestedSOL: firstBuySOL,
    executedSOL,
    unspentSOL,
    feeSOL,
    graduated: reachesFloor,
  };
}

function makeSeed(
  id: string,
  name: string,
  symbol: string,
  quoteSymbol: string,
  ageDays: number,
): Market {
  const quote = QUOTE_CATALOGUE.find((item) => item.symbol === quoteSymbol)!;
  const initialBuySOL = 0.5;
  const reserves = initialReserves(initialBuySOL);
  const priceSOL = reserves.quoteReserve / reserves.tokenReserve;
  return {
    id,
    name,
    symbol,
    imageURL: "",
    priceSOL,
    change24h: 0,
    volume24h: initialBuySOL,
    marketCap: priceSOL * TOTAL_SUPPLY,
    category: quote.category,
    address: `DEMO-PAIR-${symbol}-SOL-${Math.floor(Math.random() * 1_000_000)}`,
    createdAt: Date.now() - 86400000 * ageDays,
    pairSymbol: quote.symbol,
    pairName: quote.name,
    pairUSD: quote.usdReference,
    totalSupply: TOTAL_SUPPLY,
    curveSupply: CURVE_SUPPLY,
    reservedSupply: RESERVED_SUPPLY,
    tokenReserve: reserves.tokenReserve,
    quoteReserve: reserves.quoteReserve,
    curveValueSOL: reserves.quoteReserve,
    initialBuySOL,
    graduated: false,
  };
}

const SEED_MARKETS: Market[] = [
  makeSeed("m1", "Gold Rush", "RUSH", "GLD", 30),
  makeSeed("m2", "Corn Dog", "CDOG", "CORN", 25),
  makeSeed("m3", "Barrel Bit", "BBIT", "WTI", 20),
];

function dispatchUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
}

function readMarkets(): Market[] {
  const saved = localStorage.getItem(MARKETS_KEY);
  if (!saved) {
    localStorage.setItem(MARKETS_KEY, JSON.stringify(SEED_MARKETS));
    return SEED_MARKETS;
  }
  try {
    return JSON.parse(saved) as Market[];
  } catch {
    localStorage.setItem(MARKETS_KEY, JSON.stringify(SEED_MARKETS));
    return SEED_MARKETS;
  }
}

function writeMarkets(markets: Market[]) {
  localStorage.setItem(MARKETS_KEY, JSON.stringify(markets));
  dispatchUpdate();
}

export function getSimulationWallet(): SimulationWallet {
  const saved = localStorage.getItem(WALLET_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as SimulationWallet;
      return { sol: Number(parsed.sol) || 0, tokenBalances: parsed.tokenBalances || {} };
    } catch {
      // Recreate below
    }
  }
  const wallet = { sol: 100, tokenBalances: {} };
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  return wallet;
}

function writeWallet(wallet: SimulationWallet) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
}

function appendTrade(trade: Omit<DemoTrade, "id" | "timestamp">) {
  const saved = localStorage.getItem(TRADES_KEY);
  let trades: DemoTrade[] = [];
  try {
    trades = saved ? JSON.parse(saved) : [];
  } catch {
    trades = [];
  }
  trades.push({ ...trade, id: `t${Date.now()}${trades.length}`, timestamp: Date.now() });
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}

export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      setMarkets(readMarkets());
      setLoading(false);
    };
    load();
    window.addEventListener(eventName, load);
    return () => window.removeEventListener(eventName, load);
  }, []);

  const addMarket = (market: {
    name: string;
    symbol: string;
    imageURL?: string;
    description?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    pairSymbol?: string;
    isBasket?: boolean;
    pairComponents?: string[];
    initialBuySOL: number;
  }) => {
    if (market.name.trim().length < 3 || market.name.trim().length > 80) throw new Error("Token name must be 3–80 characters.");
    if (!/^[A-Za-z0-9]{2,10}$/.test(market.symbol.trim())) throw new Error("Use a 2–10 character ticker containing letters and numbers.");
    if ((market.description?.trim().length ?? 0) > 1000) throw new Error("Description must be 1,000 characters or fewer.");
    const links: { website?: string; twitter?: string; telegram?: string } = {};
    for (const field of ["website", "twitter", "telegram"] as const) {
      const value = market[field]?.trim();
      if (!value) continue;
      try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || value.length > 2048) throw new Error();
        links[field] = url.href;
      } catch {
        throw new Error(`${field === "twitter" ? "X / Twitter" : field[0].toUpperCase() + field.slice(1)} must be a valid http:// or https:// URL.`);
      }
    }
    let pairUSD = 1.0;
    let pairName = "Custom Basket";
    let pairSymbol = "BASKET";
    let category: Category = "All";

    if (market.isBasket && market.pairComponents && market.pairComponents.length > 0) {
      if (market.pairComponents.length > 5 || new Set(market.pairComponents).size !== market.pairComponents.length || market.pairComponents.some(symbol => !QUOTE_CATALOGUE.some(q => q.symbol === symbol))) {
        throw new Error("Choose one to five distinct commodities from the catalogue.");
      }
      pairUSD = 1.0;
      pairSymbol = "BASKET";
      pairName = `Basket of ${market.pairComponents.length}`;
      category = "All";
    } else if (market.pairSymbol) {
      const quote = QUOTE_CATALOGUE.find((item) => item.symbol === market.pairSymbol);
      if (!quote) throw new Error("Select a quote coin from the catalogue.");
      pairUSD = quote.usdReference;
      pairName = quote.name;
      pairSymbol = quote.symbol;
      category = quote.category;
    } else {
      throw new Error("Must provide a quote coin or a basket.");
    }

    if (!Number.isFinite(market.initialBuySOL) || market.initialBuySOL <= 0) throw new Error("Your first local buy must be greater than 0 SOL.");
    const wallet = getSimulationWallet();
    if (market.initialBuySOL > wallet.sol) throw new Error("Your browser-local practice wallet does not have enough SOL.");

    const reserves = initialReserves(market.initialBuySOL);
    const priceSOL = reserves.quoteReserve / reserves.tokenReserve;
    const newMarket: Market = {
      id: `m${Date.now()}`,
      name: market.name.trim(),
      symbol: market.symbol.trim().toUpperCase(),
      category: category,
      imageURL: market.imageURL || "",
      description: market.description?.trim() || undefined,
      ...links,
      address: `DEMO-PAIR-${market.symbol.trim().toUpperCase()}-SOL-${Math.floor(Math.random() * 1_000_000)}`,
      priceSOL,
      change24h: 0,
      volume24h: reserves.executedSOL,
      marketCap: priceSOL * TOTAL_SUPPLY,
      createdAt: Date.now(),
      pairSymbol: pairSymbol,
      pairName: pairName,
      pairUSD: pairUSD,
      isBasket: market.isBasket,
      pairComponents: market.pairComponents,
      totalSupply: TOTAL_SUPPLY,
      curveSupply: CURVE_SUPPLY,
      reservedSupply: RESERVED_SUPPLY,
      tokenReserve: reserves.tokenReserve,
      quoteReserve: reserves.quoteReserve,
      curveValueSOL: reserves.quoteReserve,
      initialBuySOL: market.initialBuySOL,
      graduated: reserves.graduated,
    };
    wallet.sol -= reserves.executedSOL;
    wallet.tokenBalances[newMarket.address] = reserves.tokenOut;
    const currentMarkets = readMarkets();
    const newMarketsList = [newMarket, ...currentMarkets];
    const snapshot = [MARKETS_KEY, WALLET_KEY, TRADES_KEY].map(key => [key, localStorage.getItem(key)] as const);
    try {
      localStorage.setItem(MARKETS_KEY, JSON.stringify(newMarketsList));
      writeWallet(wallet);
      appendTrade({
        marketAddress: newMarket.address,
        type: "launch",
        amount: reserves.tokenOut,
        priceSOL,
        feeSOL: reserves.feeSOL,
        solValue: reserves.executedSOL,
        priceAfterSOL: priceSOL,
      });
    } catch {
      for (const [key, value] of snapshot) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      throw new Error("Unable to save this launch in browser storage. Free some storage and try again; no local funds were spent.");
    }
    dispatchUpdate();
    return newMarket;
  };

  return { markets, loading, addMarket };
}

export function useMarket(address: string) {
  const { markets, loading } = useMarkets();
  return { market: markets.find((market) => market.address.toLowerCase() === address.toLowerCase()), loading };
}

export function executeDemoTrade(marketAddress: string, type: "buy" | "sell", inputAmount: number) {
  const markets = readMarkets();
  const index = markets.findIndex((market) => market.address === marketAddress);
  if (index < 0) throw new Error("This local launch no longer exists.");
  const market = markets[index];
  const wallet = getSimulationWallet();
  if (!Number.isFinite(inputAmount) || inputAmount <= 0) throw new Error("Enter an amount greater than zero.");

  const feeRate = FEE_PERCENT / 100;
  let amount: number;
  let solValue: number;
  let feeSOL: number;
  let nextTokenReserve: number;
  let nextQuoteReserve: number;
  let requestedSOL: number;
  let executedSOL: number;
  let unspentSOL: number;

  if (type === "buy") {
    requestedSOL = inputAmount;
    if (requestedSOL > wallet.sol) throw new Error("Insufficient browser-local SOL balance.");
    const maxExecutableSOL = getMaxExecutableBuySOL(market.tokenReserve, market.quoteReserve, feeRate);
    if (maxExecutableSOL <= 0) throw new Error("This illustrative curve cannot quote that buy.");
    executedSOL = requestedSOL >= maxExecutableSOL - SOL_FLOATING_DUST ? maxExecutableSOL : requestedSOL;
    const rawUnspentSOL = Math.max(0, requestedSOL - executedSOL);
    unspentSOL = rawUnspentSOL <= SOL_FLOATING_DUST ? 0 : rawUnspentSOL;
    feeSOL = executedSOL * feeRate;
    const netQuote = executedSOL - feeSOL;
    const reachesFloor = executedSOL >= maxExecutableSOL - SOL_FLOATING_DUST;
    amount = reachesFloor
      ? market.tokenReserve - CURVE_TOKEN_FLOOR
      : market.tokenReserve - (market.tokenReserve * market.quoteReserve) / (market.quoteReserve + netQuote);
    if (amount <= 0 || amount >= market.tokenReserve) throw new Error("This illustrative curve cannot quote that buy.");
    nextTokenReserve = reachesFloor ? CURVE_TOKEN_FLOOR : market.tokenReserve - amount;
    nextQuoteReserve = market.quoteReserve + netQuote;
    solValue = executedSOL;
    wallet.sol -= executedSOL;
    wallet.tokenBalances[market.address] = (wallet.tokenBalances[market.address] || 0) + amount;
  } else {
    requestedSOL = 0;
    executedSOL = 0;
    unspentSOL = 0;
    amount = inputAmount;
    const balance = wallet.tokenBalances[market.address] || 0;
    if (amount > balance) throw new Error(`Insufficient local ${market.symbol} balance.`);
    const grossQuote = market.quoteReserve - (market.tokenReserve * market.quoteReserve) / (market.tokenReserve + amount);
    feeSOL = grossQuote * feeRate;
    solValue = grossQuote - feeSOL;
    if (solValue <= 0) throw new Error("This illustrative curve cannot quote that sale.");
    nextTokenReserve = market.tokenReserve + amount;
    nextQuoteReserve = market.quoteReserve - grossQuote;
    wallet.sol += solValue;
    wallet.tokenBalances[market.address] = balance - amount;
  }

  const priceSOL = nextQuoteReserve / nextTokenReserve;
  const updated: Market = {
    ...market,
    tokenReserve: nextTokenReserve,
    quoteReserve: nextQuoteReserve,
    curveValueSOL: nextQuoteReserve,
    priceSOL,
    marketCap: priceSOL * market.totalSupply,
    volume24h: market.volume24h + (type === "buy" ? executedSOL : solValue + feeSOL),
    graduated: nextTokenReserve <= CURVE_TOKEN_FLOOR + 1e-6 || priceSOL * market.totalSupply >= GRADUATION_FDV_SOL,
  };
  markets[index] = updated;
  writeWallet(wallet);
  writeMarkets(markets);
  appendTrade({ marketAddress, type, amount, priceSOL: market.priceSOL, feeSOL, solValue: type === "buy" ? executedSOL : solValue, priceAfterSOL: priceSOL });
  dispatchUpdate();
  return { market: updated, amount, solValue, feeSOL, requestedSOL, executedSOL, unspentSOL };
}

export function useSimulationWallet() {
  const [wallet, setWallet] = useState<SimulationWallet>({ sol: 0, tokenBalances: {} });
  useEffect(() => {
    const load = () => setWallet(getSimulationWallet());
    load();
    window.addEventListener(eventName, load);
    return () => window.removeEventListener(eventName, load);
  }, []);
  return wallet;
}

export function useDemoStats() {
  const [stats, setStats] = useState({ volumeSOL: 0, feesSOL: 0, raydiumFeeSOL: 0, cmcFeeSOL: 0 });
  useEffect(() => {
    const load = () => {
      let trades: DemoTrade[] = [];
      try {
        trades = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]");
      } catch {
        trades = [];
      }
      const volumeSOL = trades.reduce((total, trade) => total + (trade.solValue || 0), 0);
      const feesSOL = trades.reduce((total, trade) => total + (trade.feeSOL || 0), 0);
      setStats({
        volumeSOL,
        feesSOL,
        raydiumFeeSOL: feesSOL * (0.25 / 0.75),
        cmcFeeSOL: feesSOL * (0.50 / 0.75),
      });
    };
    load();
    window.addEventListener(eventName, load);
    return () => window.removeEventListener(eventName, load);
  }, []);
  return stats;
}

export function useMarketTrades(address: string) {
  const [trades, setTrades] = useState<DemoTrade[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const all: DemoTrade[] = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]");
        setTrades(all.filter((trade) => trade.marketAddress.toLowerCase() === address.toLowerCase()).reverse());
      } catch {
        setTrades([]);
      }
    };
    load();
    window.addEventListener(eventName, load);
    return () => window.removeEventListener(eventName, load);
  }, [address]);
  return trades;
}
