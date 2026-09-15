import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { afterEach, test } from "node:test";

// Node's native TS runner needs the extension for Next's server entry point.
// Keep this resolution adjustment in tests, not in the Next route.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/quotes.json", import.meta.url), "utf8"));
const energy = readFileSync(new URL("./fixtures/energy.csv", import.meta.url), "utf8");
const realFetch = globalThis.fetch;
const realTimeout = AbortSignal.timeout;
afterEach(() => {
  globalThis.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
});

let instance = 0;
async function harness(overrides = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const host = new URL(url).hostname;
    const provider = {
      "api.gold-api.com": "metal",
      "api.frankfurter.dev": "currency",
      "fred.stlouisfed.org": "energy",
    }[host];
    assert.ok(provider, `Unexpected outbound request: ${url}`);
    if (overrides.fetch) return overrides.fetch(provider, url, options);
    const body = provider === "metal"
      ? fixtures.metals[url.split("/").at(-1)]
      : provider === "currency" ? fixtures.currencies : energy;
    const value = Object.hasOwn(overrides, provider) ? overrides[provider] : body;
    return new Response(provider === "energy" ? value : JSON.stringify(value));
  };
  // Each scenario gets its own production module cache; no reset-only exports.
  const { GET } = await import(`../src/app/market-data/quotes/route.ts?scenario=${instance++}`);
  return { GET, calls, read: async () => (await GET()).json() };
}
function unavailable(quote) {
  assert.equal(quote.status, "unavailable");
  for (const key of ["priceUSD", "changePercent", "changePeriod", "updatedAt"]) {
    assert.equal(quote[key], null, key);
  }
  assert.ok(quote.message.length);
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("successful provider fixtures preserve price, units, source, dates and response contract", async () => {
  const h = await harness();
  const response = await h.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const data = await response.json();
  assert.equal(data.refreshAfterMs, 30_000);
  assert.ok(Number.isFinite(Date.parse(data.fetchedAt)));
  for (const [symbol, provider] of Object.entries({ GLD: "XAU", SILV: "XAG", PLAT: "XPT", PALL: "XPD", COPP: "HG" })) {
    const q = data.quotes[symbol];
    assert.equal(q.priceUSD, fixtures.metals[provider].price);
    assert.equal(q.updatedAt, fixtures.metals[provider].updatedAt);
    assert.equal(q.status, "current");
    assert.equal(q.source, "Gold API");
    assert.equal(q.sourceUrl, "https://gold-api.com/");
    assert.equal(q.changePercent, null);
    assert.equal(q.changePeriod, null);
    assert.match(q.message, symbol === "COPP" ? /copper: USD per lb/ : /USD per troy oz/);
  }
  for (const [symbol, price] of [["EUR", 1.25], ["JPY", 0.01]]) {
    const q = data.quotes[symbol];
    assert.equal(q.priceUSD, price);
    close(q.changePercent, 25);
    assert.equal(q.changePeriod, "previous business day");
    assert.equal(q.updatedAt, "2026-09-11");
    assert.equal(q.status, "daily");
    assert.equal(q.source, "Frankfurter / ECB");
  }
  for (const [symbol, price, date, change, unit] of [
    ["WTI", 55, "2026-09-10", 10, "barrel"],
    ["BRENT", 84.7, "2026-09-11", 10, "barrel"],
    ["NGAS", 3, "2026-09-11", 20, "MMBtu"],
    ["GASO", 2.2, "2026-09-10", 10, "gallon"],
    ["HEAT", 3.3, "2026-09-10", 10, "gallon"],
  ]) {
    const q = data.quotes[symbol];
    assert.equal(q.priceUSD, price);
    assert.equal(q.updatedAt, date);
    close(q.changePercent, change);
    assert.equal(q.status, "daily");
    assert.equal(q.changePeriod, "previous business day");
    assert.equal(q.source, "U.S. EIA via FRED");
    assert.match(q.message, new RegExp(`USD per ${unit}`));
    assert.match(q.message, /prior published observation/);
  }
  assert.equal(data.quotes.USD.priceUSD, 1);
  assert.equal(data.quotes.USD.status, "reference");
  unavailable(data.quotes.WHEAT);
  assert.equal(h.calls.length, 7);
  for (const { options } of h.calls) {
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

for (const value of [
  null, {}, { ...fixtures.metals.XAU, symbol: "XAG" },
  { ...fixtures.metals.XAU, currency: "EUR" },
  ...["2500", 0, -1, null].map(price => ({ ...fixtures.metals.XAU, price })),
  ...["bad date", null].map(updatedAt => ({ ...fixtures.metals.XAU, updatedAt })),
]) {
  test(`malformed Gold API payload is unavailable: ${JSON.stringify(value)}`, async () => {
    const h = await harness({ metal: value });
    unavailable((await h.read()).quotes.GLD);
  });
}

for (const value of [null, {}, { base: "EUR", rates: {} }, { base: "USD", rates: {} },
  { base: "USD", rates: { invalid: { EUR: 1 } } },
  { base: "USD", rates: { "2026-09-11": { EUR: "1", JPY: -1 } } }]) {
  test(`malformed Frankfurter payload is unavailable: ${JSON.stringify(value)}`, async () => {
    const h = await harness({ currency: value });
    const { quotes } = await h.read();
    unavailable(quotes.EUR);
    unavailable(quotes.JPY);
    assert.equal(quotes.GLD.status, "current");
  });
}

test("currency observations are selected per series across missing dates", async () => {
  const h = await harness({ currency: { base: "USD", rates: {
    "2026-09-08": { EUR: 1, JPY: 125 },
    "2026-09-09": { EUR: 0.8 },
    "2026-09-10": { JPY: 100 },
    "2026-09-11": { EUR: null, JPY: 0 },
  } } });
  const { quotes } = await h.read();
  assert.equal(quotes.EUR.updatedAt, "2026-09-09");
  assert.equal(quotes.JPY.updatedAt, "2026-09-10");
  close(quotes.EUR.changePercent, 25);
  close(quotes.JPY.changePercent, 25);
});

test("single observations have no invented change; absent series are unavailable", async () => {
  const h = await harness({
    currency: { base: "USD", rates: { "2026-09-11": { EUR: 0.8 } } },
    energy: energy.split("\n")[0] + "\n2026-09-11,55,.,0,-1,garbage\n",
  });
  const { quotes } = await h.read();
  for (const symbol of ["EUR", "WTI"]) {
    assert.equal(quotes[symbol].status, "daily");
    assert.equal(quotes[symbol].changePercent, null);
    assert.equal(quotes[symbol].changePeriod, null);
  }
  for (const symbol of ["JPY", "BRENT", "NGAS", "GASO", "HEAT"]) unavailable(quotes[symbol]);
});

for (const csv of ["", "<html>Unavailable</html>", "date,value\n2026-09-11,55",
  "observation_date,UNKNOWN\n2026-09-11,55", energy.split("\n")[0] + "\ninvalid,55,70,2,2,3"]) {
  test(`malformed EIA/FRED CSV is unavailable: ${csv.slice(0, 50)}`, async () => {
    const h = await harness({ energy: csv });
    const { quotes } = await h.read();
    for (const symbol of ["WTI", "BRENT", "NGAS", "GASO", "HEAT"]) unavailable(quotes[symbol]);
  });
}

test("FRED columns are identified by series ID, not assumed order", async () => {
  const h = await harness({ energy: "observation_date,DHHNGSP,DCOILWTICO\n2026-09-11,3,55" });
  const { quotes } = await h.read();
  assert.equal(quotes.WTI.priceUSD, 55);
  assert.equal(quotes.NGAS.priceUSD, 3);
  unavailable(quotes.BRENT);
});

for (const failure of ["http", "network", "invalid-json", "timeout"]) {
  test(`provider ${failure} failures return explicit unavailable quotes`, async () => {
    const deadlines = [];
    if (failure === "timeout") AbortSignal.timeout = ms => {
      deadlines.push(ms);
      return AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
    };
    const h = await harness({ fetch: async (_provider, _url, options) => {
      if (failure === "timeout") options.signal.throwIfAborted();
      if (failure === "network") throw new TypeError("Network failed");
      return new Response("not valid JSON or CSV", { status: failure === "http" ? 503 : 200 });
    } });
    const { quotes } = await h.read();
    for (const symbol of ["GLD", "SILV", "PLAT", "PALL", "COPP", "EUR", "JPY", "WTI", "BRENT", "NGAS", "GASO", "HEAT"]) {
      unavailable(quotes[symbol]);
      assert.ok(quotes[symbol].source);
      assert.ok(quotes[symbol].sourceUrl);
    }
    if (failure === "timeout") assert.deepEqual(deadlines, Array(7).fill(8_000));
    assert.equal(quotes.USD.status, "reference");
  });
}

test("concurrent requests and cached failures do not flood providers", async () => {
  const h = await harness({ fetch: async () => new Response("", { status: 503 }) });
  const [a, b] = await Promise.all([h.read(), h.read()]);
  assert.deepEqual(a, b);
  assert.deepEqual(await h.read(), a);
  assert.equal(h.calls.length, 7);
});