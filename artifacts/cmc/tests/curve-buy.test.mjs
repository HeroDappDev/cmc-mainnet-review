import assert from "node:assert/strict";
import { test } from "node:test";

const store = await import("../src/lib/store.ts");
const {
  CURVE_TOKEN_FLOOR,
  FEE_PERCENT,
  TOTAL_SUPPLY,
  VIRTUAL_QUOTE_START,
  executeDemoTrade,
  getMaxExecutableBuySOL,
  initialReserves,
} = store;

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function boundaryMarket(address, quoteReserve = 10) {
  const remainingGrossSOL = 1;
  const tokenReserve = CURVE_TOKEN_FLOOR
    + remainingGrossSOL * (1 - FEE_PERCENT / 100) * CURVE_TOKEN_FLOOR / quoteReserve;
  return {
    id: "boundary",
    name: "Boundary",
    symbol: "BOUND",
    imageURL: "",
    priceSOL: quoteReserve / tokenReserve,
    change24h: 0,
    volume24h: 0,
    marketCap: 0,
    category: "All",
    address,
    createdAt: 0,
    pairSymbol: "USD",
    pairName: "US Dollar",
    pairUSD: 1,
    totalSupply: TOTAL_SUPPLY,
    curveSupply: 800_000_000,
    reservedSupply: 200_000_000,
    tokenReserve,
    quoteReserve,
    curveValueSOL: quoteReserve,
    initialBuySOL: 0,
    graduated: false,
  };
}

function setup(market, sol = 10) {
  globalThis.localStorage = storage();
  localStorage.setItem("cmc_sol_markets_v1", JSON.stringify([market]));
  localStorage.setItem("cmc_sol_wallet_v1", JSON.stringify({ sol, tokenBalances: {} }));
  localStorage.setItem("cmc_sol_trades_v1", "[]");
}

test("a 1.2 SOL buy with exactly 1 SOL remaining is capped and returns the rest", () => {
  const market = boundaryMarket("DEMO-PARTIAL");
  setup(market);
  const result = executeDemoTrade(market.address, "buy", 1.2);
  assert.ok(Math.abs(result.requestedSOL - 1.2) < 1e-12);
  assert.ok(Math.abs(result.executedSOL - 1) < 1e-12);
  assert.ok(Math.abs(result.unspentSOL - 0.2) < 1e-12);
  assert.ok(Math.abs(JSON.parse(localStorage.getItem("cmc_sol_wallet_v1")).sol - 9) < 1e-12);
  assert.ok(Math.abs(result.feeSOL - 1 * (FEE_PERCENT / 100)) < 1e-12);
  assert.ok(Math.abs(result.market.volume24h - 1) < 1e-12);
  assert.equal(result.market.tokenReserve, CURVE_TOKEN_FLOOR);
  assert.equal(result.market.graduated, true);
  const [trade] = JSON.parse(localStorage.getItem("cmc_sol_trades_v1"));
  assert.equal(trade.solValue, result.executedSOL);
  assert.equal(trade.feeSOL, result.feeSOL);
});

test("an exact boundary buy has no unspent SOL and graduates", () => {
  const market = boundaryMarket("DEMO-EXACT");
  setup(market);
  const boundary = getMaxExecutableBuySOL(market.tokenReserve, market.quoteReserve);
  const result = executeDemoTrade(market.address, "buy", boundary);
  assert.ok(result.unspentSOL <= 1e-12);
  assert.equal(result.market.tokenReserve, CURVE_TOKEN_FLOOR);
  assert.equal(result.market.graduated, true);
});

test("a buy below the boundary preserves the existing curve economics", () => {
  const market = boundaryMarket("DEMO-BELOW");
  setup(market);
  const result = executeDemoTrade(market.address, "buy", 0.5);
  const fee = 0.5 * (FEE_PERCENT / 100);
  const expectedTokenOut = market.tokenReserve
    - market.tokenReserve * market.quoteReserve
      / (market.quoteReserve + (0.5 - fee));
  assert.ok(Math.abs(result.executedSOL - 0.5) < 1e-12);
  assert.ok(Math.abs(result.amount - expectedTokenOut) < 1e-6);
  assert.ok(result.market.tokenReserve > CURVE_TOKEN_FLOOR);
  assert.equal(result.market.graduated, false);
});

test("initial reserves cap an oversized first buy at the curve floor", () => {
  const reserves = initialReserves(getMaxExecutableBuySOL(
    1_066_666_666.6666667,
    VIRTUAL_QUOTE_START,
  ) + 0.5);
  assert.equal(reserves.tokenReserve, CURVE_TOKEN_FLOOR);
  assert.equal(reserves.graduated, true);
  assert.ok(Math.abs(reserves.unspentSOL - 0.5) < 1e-9);
});