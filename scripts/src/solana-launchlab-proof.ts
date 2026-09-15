import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
const RAYDIUM_DEVNET_CONFIGS =
  "https://launch-mint-v1-devnet.raydium.io/main/configs";
const LAUNCHLAB_PROGRAM = "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6";
const CPMM_PROGRAM = "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb";
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const RATE_DENOMINATOR = 1_000_000n;
const BASE_SCALE = 1_000_000n;
const QUOTE_SCALE = 1_000_000_000n;

type JsonRecord = Record<string, unknown>;

type ProgramAccount = {
  address: string;
  executable: boolean;
  owner: string;
  slot: number;
};

type LaunchConfig = {
  key: {
    name: string;
    pubKey: string;
    curveType: number;
    migrateFee: string;
    tradeFeeRate: string;
    mintB: string;
    requiresPlatformAuth: boolean;
  };
  mintInfoB: {
    symbol: string;
    name: string;
    decimals: number;
    programId: string;
  };
  defaultParams: {
    supplyInit: string;
    totalSellA: string;
    totalFundRaisingB: string;
  };
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} is not a safe integer`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is not a non-empty string`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} is not a boolean`);
  }
  return value;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function formatUnits(value: bigint, scale: bigint, places = 6): string {
  const whole = value / scale;
  const remainder = value % scale;
  const digits = scale.toString().length - 1;
  const fraction = remainder.toString().padStart(digits, "0").slice(0, places);
  return fraction.length === 0
    ? whole.toString()
    : `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

function ratioDecimal(
  numerator: bigint,
  denominator: bigint,
  places = 12,
): string {
  const scale = 10n ** BigInt(places);
  const scaled = (numerator * scale) / denominator;
  return `${scaled / scale}.${(scaled % scale)
    .toString()
    .padStart(places, "0")}`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function readProgram(address: string): Promise<ProgramAccount> {
  const payload = await fetchJson(SOLANA_DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: address,
      method: "getAccountInfo",
      params: [address, { encoding: "base64", commitment: "finalized" }],
    }),
  });
  const root = record(payload, "Solana RPC response");
  if (root.error) {
    throw new Error(`Solana RPC error: ${JSON.stringify(root.error)}`);
  }
  const result = record(root.result, "Solana RPC result");
  const context = record(result.context, "Solana RPC context");
  const value = record(result.value, `program account ${address}`);
  const program = {
    address,
    executable: booleanValue(value.executable, "program executable"),
    owner: stringValue(value.owner, "program owner"),
    slot: integer(context.slot, "RPC context slot"),
  };
  if (!program.executable) {
    throw new Error(`${address} exists on devnet but is not executable`);
  }
  return program;
}

function parseLaunchConfig(value: unknown): LaunchConfig {
  const input = record(value, "Raydium launch config");
  const key = record(input.key, "Raydium launch config key");
  const mintInfoB = record(input.mintInfoB, "Raydium quote mint");
  const defaultParams = record(
    input.defaultParams,
    "Raydium launch defaults",
  );
  return {
    key: {
      name: stringValue(key.name, "config name"),
      pubKey: stringValue(key.pubKey, "config public key"),
      curveType: integer(key.curveType, "curve type"),
      migrateFee: stringValue(key.migrateFee, "migration fee"),
      tradeFeeRate: stringValue(key.tradeFeeRate, "trade fee rate"),
      mintB: stringValue(key.mintB, "quote mint"),
      requiresPlatformAuth: booleanValue(
        key.requiresPlatformAuth,
        "platform authorization flag",
      ),
    },
    mintInfoB: {
      symbol: stringValue(mintInfoB.symbol, "quote symbol"),
      name: stringValue(mintInfoB.name, "quote name"),
      decimals: integer(mintInfoB.decimals, "quote decimals"),
      programId: stringValue(mintInfoB.programId, "quote token program"),
    },
    defaultParams: {
      supplyInit: stringValue(defaultParams.supplyInit, "default supply"),
      totalSellA: stringValue(defaultParams.totalSellA, "default curve sale"),
      totalFundRaisingB: stringValue(
        defaultParams.totalFundRaisingB,
        "default fundraising target",
      ),
    },
  };
}

async function readSolLaunchConfig(): Promise<LaunchConfig> {
  const payload = record(
    await fetchJson(RAYDIUM_DEVNET_CONFIGS),
    "Raydium config response",
  );
  if (payload.success !== true) {
    throw new Error("Raydium devnet config endpoint reported failure");
  }
  const outerData = record(payload.data, "Raydium config data");
  const values = Array.isArray(outerData.data) ? outerData.data : undefined;
  if (!values) throw new Error("Raydium devnet config list is missing");
  const configs = values.map(parseLaunchConfig);
  const match = configs.find(
    (config) =>
      config.key.curveType === 0 &&
      config.key.mintB === NATIVE_SOL_MINT &&
      config.mintInfoB.decimals === 9,
  );
  if (!match) {
    throw new Error(
      "No devnet constant-product LaunchLab config for native SOL was found",
    );
  }
  return match;
}

function calculateLaunchLabEconomics(config: LaunchConfig) {
  const supply = 1_000_000_000n * BASE_SCALE;
  const totalSell = 800_000_000n * BASE_SCALE;
  const locked = 0n;
  const migrateAmount = supply - totalSell - locked;
  const totalFundraising = 16n * QUOTE_SCALE;
  const migrateFee = BigInt(config.key.migrateFee);
  const fundraisingAfterMigrationFee = totalFundraising - migrateFee;

  // Mirrors LaunchConstantProductCurve.getInitParam in Raydium SDK v2.
  const denominator =
    (fundraisingAfterMigrationFee * totalSell) / migrateAmount -
    totalFundraising;
  if (denominator <= 0n) {
    throw new Error("LaunchLab initialization denominator is not positive");
  }
  const virtualBase =
    ((fundraisingAfterMigrationFee * totalSell * totalSell) / migrateAmount) /
    denominator;
  const virtualQuote =
    (totalFundraising * totalFundraising) / denominator;

  const openingPrice = ratioDecimal(
    virtualQuote * BASE_SCALE,
    virtualBase * QUOTE_SCALE,
  );
  const openingFdvUnits = (virtualQuote * supply) / virtualBase;
  const graduationPrice = ratioDecimal(
    fundraisingAfterMigrationFee * BASE_SCALE,
    migrateAmount * QUOTE_SCALE,
  );
  const graduationFdvUnits =
    (fundraisingAfterMigrationFee * supply) / migrateAmount;
  const terminalCurvePrice = ratioDecimal(
    (virtualQuote + totalFundraising) * BASE_SCALE,
    (virtualBase - totalSell) * QUOTE_SCALE,
  );

  return {
    supply,
    totalSell,
    locked,
    migrateAmount,
    totalFundraising,
    migrateFee,
    fundraisingAfterMigrationFee,
    virtualBase,
    virtualQuote,
    openingPrice,
    openingFdvUnits,
    graduationPrice,
    graduationFdvUnits,
    terminalCurvePrice,
  };
}

function simulateLifecycle(
  economics: ReturnType<typeof calculateLaunchLabEconomics>,
  protocolTradeFeeRate: bigint,
) {
  let soldBase = 0n;
  let netQuote = 0n;
  const events: JsonRecord[] = [];

  const currentPrice = () =>
    ratioDecimal(
      (economics.virtualQuote + netQuote) * BASE_SCALE,
      (economics.virtualBase - soldBase) * QUOTE_SCALE,
    );

  const buy = (netQuoteIn: bigint, label: string) => {
    const baseOut =
      (netQuoteIn * (economics.virtualBase - soldBase)) /
      (economics.virtualQuote + netQuote + netQuoteIn);
    soldBase += baseOut;
    netQuote += netQuoteIn;
    const protocolGrossEstimate = ceilDiv(
      netQuoteIn * RATE_DENOMINATOR,
      RATE_DENOMINATOR - protocolTradeFeeRate,
    );
    events.push({
      kind: "buy",
      label,
      simulated: true,
      netQuoteIn: formatUnits(netQuoteIn, QUOTE_SCALE),
      protocolGrossEstimate: formatUnits(
        protocolGrossEstimate,
        QUOTE_SCALE,
      ),
      baseOut: formatUnits(baseOut, BASE_SCALE),
      cumulativeBaseSold: formatUnits(soldBase, BASE_SCALE),
      cumulativeNetQuote: formatUnits(netQuote, QUOTE_SCALE),
      marginalPriceSol: currentPrice(),
    });
  };

  const sell = (baseIn: bigint, label: string) => {
    if (baseIn <= 0n || baseIn > soldBase) {
      throw new Error("invalid simulated sell amount");
    }
    const quoteOut =
      (baseIn * (economics.virtualQuote + netQuote)) /
      (economics.virtualBase - soldBase + baseIn);
    soldBase -= baseIn;
    netQuote -= quoteOut;
    events.push({
      kind: "sell",
      label,
      simulated: true,
      baseIn: formatUnits(baseIn, BASE_SCALE),
      netQuoteOutBeforeFees: formatUnits(quoteOut, QUOTE_SCALE),
      cumulativeBaseSold: formatUnits(soldBase, BASE_SCALE),
      cumulativeNetQuote: formatUnits(netQuote, QUOTE_SCALE),
      marginalPriceSol: currentPrice(),
    });
  };

  buy(1n * QUOTE_SCALE, "initial commodity-market purchase");
  sell(10_000_000n * BASE_SCALE, "illustrative holder exit");
  buy(
    economics.totalFundraising - netQuote,
    "funding-target completion purchase",
  );

  events.push({
    kind: "graduation-assumption",
    label: "LaunchLab closes the curve and migrates to CPMM",
    simulated: true,
    networkTransactionSubmitted: false,
    cpmmBaseReserve: formatUnits(economics.migrateAmount, BASE_SCALE),
    cpmmQuoteReserve: formatUnits(
      economics.fundraisingAfterMigrationFee,
      QUOTE_SCALE,
    ),
    cpmmOpeningPriceSol: economics.graduationPrice,
    terminalCurvePriceSol: economics.terminalCurvePrice,
    note: "The proof verifies program availability and protocol math but does not create a mint, Platform PDA, LaunchState, or CPMM pool.",
  });

  return { events, soldBase, netQuote };
}

async function main() {
  const [launchLabAccount, cpmmAccount, config] = await Promise.all([
    readProgram(LAUNCHLAB_PROGRAM),
    readProgram(CPMM_PROGRAM),
    readSolLaunchConfig(),
  ]);
  const economics = calculateLaunchLabEconomics(config);
  const protocolTradeFeeRate = BigInt(config.key.tradeFeeRate);
  const lifecycle = simulateLifecycle(economics, protocolTradeFeeRate);

  const proof = {
    generatedAt: new Date().toISOString(),
    proofKind: "read-only-devnet-verification-and-deterministic-dry-run",
    graduationEvidenceStatus: "not-verified",
    safety: {
      networkTransactionSubmitted: false,
      walletLoaded: false,
      secretKeyUsed: false,
      realFundsMoved: false,
    },
    liveDevnetEvidence: {
      rpc: SOLANA_DEVNET_RPC,
      launchLabProgram: launchLabAccount,
      cpmmProgram: cpmmAccount,
      raydiumConfigEndpoint: RAYDIUM_DEVNET_CONFIGS,
      launchConfig: config,
    },
    sampleMarket: {
      name: "CMC Gold Reference Market",
      symbol: "CMCGLD",
      commodityReference: "Gold reference price; informational only",
      quote: config.mintInfoB.symbol,
      quoteMint: config.key.mintB,
      quoteModel:
        "Native SOL is the curve and settlement quote. Commodity prices and SOL/USD are informational references only.",
      supply: formatUnits(economics.supply, BASE_SCALE),
      curveAllocation: formatUnits(economics.totalSell, BASE_SCALE),
      migrationAllocation: formatUnits(economics.migrateAmount, BASE_SCALE),
      lockedAllocation: formatUnits(economics.locked, BASE_SCALE),
      curveType: "Raydium LaunchLab constant product",
      fundingTargetQuote: formatUnits(
        economics.totalFundraising,
        QUOTE_SCALE,
      ),
      openingFdvQuote: formatUnits(
        economics.openingFdvUnits,
        QUOTE_SCALE,
      ),
      graduationFdvQuote: formatUnits(
        economics.graduationFdvUnits,
        QUOTE_SCALE,
      ),
      openingPriceQuotePerToken: economics.openingPrice,
      graduationPriceQuotePerToken: economics.graduationPrice,
      valuationRatio: ratioDecimal(
        economics.graduationFdvUnits,
        economics.openingFdvUnits,
        6,
      ),
      launchLabVirtualBase: economics.virtualBase.toString(),
      launchLabVirtualQuote: economics.virtualQuote.toString(),
      protocolTradeFeeRatePpm: protocolTradeFeeRate.toString(),
      platformFee:
        "Not modeled in the reserve proof. Proposed policy is a fixed 0.50% CMC platform fee, subject to deployed program limits and Platform PDA verification.",
    },
    indexedMarketProjection: {
      cluster: "devnet",
      status: "dry-run-not-evidence",
      source: "deterministic dry-run anchored to live devnet program/config reads",
      programId: LAUNCHLAB_PROGRAM,
      configId: config.key.pubKey,
      quoteMint: config.key.mintB,
      totalNetQuote: formatUnits(lifecycle.netQuote, QUOTE_SCALE),
      simulatedBaseSold: formatUnits(lifecycle.soldBase, BASE_SCALE),
      events: lifecycle.events,
    },
    conclusions: [
      "The official LaunchLab and CPMM programs are executable on Solana devnet.",
      "Raydium exposes a zero-migration-fee constant-product native-SOL devnet config.",
      "With 1B supply, 800M sold, 200M migrated, and zero migration fee, the LaunchLab SDK formula fixes the valuation ratio at 16x.",
      "A 5 SOL opening FDV therefore maps to 80 SOL at graduation and a 16 SOL net funding target.",
      "USD equivalents move with SOL/USD and must never be presented as fixed protocol thresholds.",
      "CMC does not promise holder rewards, automatic buybacks, or a creator fee; the proposed platform fee remains subject to deployed Platform PDA verification.",
    ],
  };

  const outputPath = resolve(
    process.cwd(),
    "..",
    "docs",
    "solana-launchlab-proof-output.json",
  );
  await writeFile(
    outputPath,
    `${JSON.stringify(
      proof,
      (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      2,
    )}\n`,
  );
  process.stdout.write(
    `LaunchLab proof written to ${outputPath}\n` +
      `opening FDV=${proof.sampleMarket.openingFdvQuote} SOL; ` +
      `graduation FDV=${proof.sampleMarket.graduationFdvQuote} SOL; ` +
      `transactions submitted=false\n`,
  );
}

await main();