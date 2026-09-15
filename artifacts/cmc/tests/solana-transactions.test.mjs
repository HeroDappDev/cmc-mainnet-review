import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  CpmmConfigInfoLayout,
  CpmmPoolInfoLayout,
  DEVNET_PROGRAM_ID,
  LaunchpadConfig,
  LaunchpadPool,
  PlatformConfig,
  getCreatePoolKeys,
  toBN,
} from "@raydium-io/raydium-sdk-v2";
import {
  DEVNET_LAUNCHLAB_PROGRAM_ID,
  CMC_DEVNET_ADMIN,
  CMC_DEVNET_CPMM_CONFIG_ID,
  CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
  CMC_DEVNET_PLATFORM_ID,
  CMC_DEVNET_TREASURY,
  CPMM_AMM_CONFIG_DISCRIMINATOR,
  LAUNCHLAB_CONFIG_DISCRIMINATOR,
  PLATFORM_CONFIG_DISCRIMINATOR,
  CMC_DEVNET_PLATFORM_FEE_RATE,
  CMC_DEVNET_CREATOR_FEE_RATE,
  CMC_DEVNET_LAUNCH_DECIMALS,
  CMC_DEVNET_LAUNCH_SUPPLY,
  CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
  CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
  CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
  CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
  CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
  CMC_DEVNET_COMPUTE_UNIT_LIMIT,
  CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS,
  DEVNET_PLATFORM_ID,
  WSOL_MINT,
  createLiveWalletSigner,
  prepareLaunchLabTransaction,
  prepareCpmmSwapTransaction,
  prepareConfigurePlatformTransaction,
  preparePlatformTransaction,
  createBrowserRecoveryStore,
  recoverLaunchLabTransaction,
  signAndSubmitLaunchLab,
  verifyPlatformGovernanceCompletion,
  verifyReviewedPlatformAccount,
  signatureFromSignedTransaction,
  slippageBound,
  LAUNCHLAB_POOL_DISCRIMINATOR,
  decodeLaunchLabPoolState,
  fetchFinalizedLaunchLabPoolState,
  quoteLaunchLabBuyExactIn,
  quoteLaunchLabSellExactIn,
  remainingSolToGraduation,
} from "../src/lib/solana-transactions.ts";

const wallet = Keypair.generate();
const mint = Keypair.generate();
const base = {
  cluster: "devnet",
  wallet: wallet.publicKey,
  configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
  mintA: mint.publicKey,
  creator: wallet.publicKey,
  platformAdmin: CMC_DEVNET_ADMIN,
  platformId: CMC_DEVNET_PLATFORM_ID,
};

function launchConfigData() {
  const data = Buffer.alloc(LaunchpadConfig.span);
  LaunchpadConfig.encode({
    epoch: toBN(0), curveType: 0, index: 0, migrateFee: toBN(0), tradeFeeRate: toBN(2500),
    maxShareFeeRate: toBN(10000), minSupplyA: toBN(10000000), maxLockRate: toBN(999999),
    minSellRateA: toBN(1), minMigrateRateA: toBN(1), minFundRaisingB: toBN(1),
    mintB: WSOL_MINT,
    protocolFeeOwner: new PublicKey("DRaySeEaQ4oFFFZNFfM8vZTZdj6ve6bqBByBg4DuLGdi"),
    migrateFeeOwner: new PublicKey("DRays1SduYDUsRmtsRoEshsFMD1N93LW9GLjpUGu7TLW"),
    migrateToAmmWallet: new PublicKey("DRay9TLEqeJsXr9je9yKopK137gRLXNhtNXgpAmGDTdh"),
    migrateToCpmmWallet: new PublicKey("DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF"),
  }, data);
  data.set(LAUNCHLAB_CONFIG_DISCRIMINATOR);
  return data;
}

function platformData({
  platformCpCreator = CMC_DEVNET_ADMIN,
  curveRuleManager = CMC_DEVNET_ADMIN,
} = {}) {
  const data = Buffer.alloc(PlatformConfig.span);
  PlatformConfig.encode({
    epoch: toBN(0),
    platformClaimFeeWallet: CMC_DEVNET_TREASURY,
    platformLockNftWallet: CMC_DEVNET_TREASURY,
    platformScale: toBN(1_000_000), creatorScale: toBN(0), burnScale: toBN(0), feeRate: toBN(5000),
    name: new Array(64).fill(0), web: new Array(256).fill(0), img: new Array(256).fill(0),
    cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID, creatorFeeRate: toBN(0),
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY,
    platformVestingWallet: CMC_DEVNET_TREASURY, platformVestingScale: toBN(0),
    platformCpCreator, restrictGlobalConfig: 0, restrictCurveParam: 0,
    curveRuleManager,
  }, data);
  data.set(PLATFORM_CONFIG_DISCRIMINATOR);
  return data;
}

function cpmmData() {
  const data = Buffer.alloc(CpmmConfigInfoLayout.span);
  CpmmConfigInfoLayout.encode({
    bump: 253, disableCreatePool: false, index: 0,
    tradeFeeRate: toBN(2500), protocolFeeRate: toBN(120000), fundFeeRate: toBN(40000),
    createPoolFee: toBN(150000000),
    protocolOwner: new PublicKey("DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK"),
    fundOwner: new PublicKey("DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK"),
    creatorFeeRate: toBN(2500), creatorFeeShareRate: toBN(0),
  }, data);
  data.set(CPMM_AMM_CONFIG_DISCRIMINATOR);
  return data;
}

function poolData({
  realA = 400,
  realB = 100,
  totalFundRaisingB = 3_000,
} = {}) {
  const data = Buffer.alloc(LaunchpadPool.span);
  LaunchpadPool.encode({
    epoch: toBN(0),
    bump: 1,
    status: 0,
    mintDecimalsA: 6,
    mintDecimalsB: 9,
    migrateType: 0,
    supply: toBN(1_000),
    totalSellA: toBN(800),
    virtualA: toBN(1_000),
    virtualB: toBN(1_000),
    realA: toBN(realA),
    realB: toBN(realB),
    totalFundRaisingB: toBN(totalFundRaisingB),
    protocolFee: toBN(0),
    platformFee: toBN(0),
    migrateFee: toBN(0),
    vestingSchedule: {
      totalLockedAmount: toBN(0),
      cliffPeriod: toBN(0),
      unlockPeriod: toBN(0),
      startTime: toBN(0),
      totalAllocatedShare: toBN(0),
    },
    configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
    platformId: CMC_DEVNET_PLATFORM_ID,
    mintA: mint.publicKey,
    mintB: WSOL_MINT,
    vaultA: Keypair.generate().publicKey,
    vaultB: Keypair.generate().publicKey,
    creator: wallet.publicKey,
    mintProgramFlag: 0,
    cpmmCreatorFeeOn: 0,
    platformVestingShare: toBN(0),
  }, data);
  data.set(LAUNCHLAB_POOL_DISCRIMINATOR);
  return data;
}

function cpmmPoolData() {
  const keys = getCreatePoolKeys({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    configId: CMC_DEVNET_CPMM_CONFIG_ID,
    mintA: WSOL_MINT,
    mintB: mint.publicKey,
  });
  const data = Buffer.alloc(CpmmPoolInfoLayout.span);
  CpmmPoolInfoLayout.encode({
    bump: 1,
    openTime: toBN(0),
    configId: CMC_DEVNET_CPMM_CONFIG_ID,
    mintA: WSOL_MINT,
    mintB: mint.publicKey,
    vaultA: keys.vaultA,
    vaultB: keys.vaultB,
    observationId: keys.observationId,
    status: 0,
    feeOn: 0,
    lpAmount: toBN(1_000),
    mintLp: keys.lpMint,
    poolCreator: CMC_DEVNET_ADMIN,
    mintProgramA: TOKEN_PROGRAM_ID,
    mintProgramB: TOKEN_PROGRAM_ID,
    lpDecimals: 9,
    mintDecimalA: 9,
    mintDecimalB: 6,
    protocolFeesMintA: toBN(0),
    protocolFeesMintB: toBN(0),
    fundFeesMintA: toBN(0),
    fundFeesMintB: toBN(0),
    epoch: toBN(0),
    enableCreatorFee: false,
    creatorFeesMintA: toBN(0),
    creatorFeesMintB: toBN(0),
  }, data);
  data.set(LAUNCHLAB_POOL_DISCRIMINATOR);
  return { data, keys };
}

function cpmmConnection(overrides = {}) {
  const baseline = connection();
  const pool = cpmmPoolData();
  return {
    pool,
    rpc: {
      ...baseline,
      getAccountInfo: async (address, commitment) => address.equals(pool.keys.poolId)
        ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: pool.data }
        : baseline.getAccountInfo(address, commitment),
      getTokenAccountBalance: async () => ({ value: { amount: "1000000" } }),
      ...overrides,
    },
  };
}

function mutated(data, offset, value = (data[offset] + 1) & 0xff) {
  const copy = Buffer.from(data);
  copy[offset] = value;
  return copy;
}

function connection(overrides = {}) {
  return {
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 900,
    }),
    getBlockHeight: async () => 100,
    getAccountInfo: async (address) => {
      if (address.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)) {
        return { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: launchConfigData() };
      }
      if (address.equals(CMC_DEVNET_PLATFORM_ID)) {
        return { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: platformData() };
      }
      if (address.equals(CMC_DEVNET_CPMM_CONFIG_ID)) {
        return { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() };
      }
      return null;
    },
    simulateTransaction: async () => ({ value: { err: null, logs: ["ok"] } }),
    getFeeForMessage: async () => ({ value: 5_000 }),
    sendRawTransaction: async (raw) => signatureFromSignedTransaction(Transaction.from(raw)),
    confirmTransaction: async () => ({ value: { err: null } }),
    ...overrides,
  };
}

function store() {
  const values = new Map();
  return {
    values,
    get: (id) => values.get(id),
    set: (value) => values.set(value.id, value),
    delete: (id) => values.delete(id),
  };
}

test("uses the pinned devnet LaunchLab and canonical WSOL quote", async () => {
  assert.equal(DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58(), DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM.toBase58());
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    mintB: new PublicKey("So11111111111111111111111111111111111111112"),
    amount: toBN(10_000),
    minAmount: toBN(90),
  }, connection());
  assert.equal(prepared.feeLamports, 5_000);
  assert.equal(prepared.accounts.poolId instanceof PublicKey, true);
  assert.equal(prepared.transaction.feePayer.toBase58(), wallet.publicKey.toBase58());
  assert.equal(prepared.transaction.lastValidBlockHeight, 900);
   assert.equal(prepared.transaction.instructions.length, 8);
  assert.equal(prepared.transaction.instructions[0].programId.toBase58(), "ComputeBudget111111111111111111111111111111");
  assert.equal(prepared.transaction.instructions[1].programId.toBase58(), "ComputeBudget111111111111111111111111111111");
  assert.deepEqual([...prepared.transaction.instructions[0].data], [3, 64, 66, 15, 0, 0, 0, 0, 0]);
  assert.deepEqual([...prepared.transaction.instructions[1].data], [2, 192, 39, 9, 0]);
  assert.equal(prepared.intentSnapshot.parameters.computeUnitLimit, String(CMC_DEVNET_COMPUTE_UNIT_LIMIT));
  assert.equal(prepared.intentSnapshot.parameters.computeUnitPriceMicroLamports, String(CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS));
  assert.equal(prepared.intentSnapshot.parameters.maxPriorityFeeLamports, String(CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS));
   assert.equal(prepared.transaction.instructions.at(-2).programId.toBase58(), DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58());
  // The SDK instruction receives WSOL, never a made-up quote token.
   assert.equal(prepared.transaction.instructions.at(-2).keys[10].pubkey.toBase58(), WSOL_MINT.toBase58());
   assert.equal(prepared.transaction.instructions.at(-1).programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(prepared.intentSnapshot.accounts.wallet, wallet.publicKey.toBase58());
  assert.equal(prepared.intentSnapshot.accounts.platformAdmin, CMC_DEVNET_ADMIN.toBase58());
  assert.equal(prepared.intentSnapshot.accounts.platformId, base.platformId.toBase58());
  assert.equal(prepared.intentSnapshot.accounts.configId, CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58());
  assert.equal(prepared.intentSnapshot.accounts.mintA, mint.publicKey.toBase58());
  assert.equal(prepared.intentSnapshot.parameters.amount, "10000");
  assert.equal(prepared.intentSnapshot.parameters.minAmount, "90");
  assert.equal(Object.isFrozen(prepared.intentSnapshot), true);
  assert.equal(Object.isFrozen(prepared.intentSnapshot.accounts), true);
  assert.equal(Object.isFrozen(prepared.intentSnapshot.parameters), true);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.intentSnapshot)), prepared.intentSnapshot);
});

test("adds an atomic WSOL close after a temporary LaunchLab buy", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(10_000),
    minAmount: toBN(90),
  }, connection());
  const close = prepared.transaction.instructions.at(-1);
  assert.equal(close.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(close.data[0], 9, "the final instruction must close the temporary WSOL account");
  assert.equal(close.keys[0].pubkey.toBase58(), prepared.intentSnapshot.accounts.userTokenAccountB);
  assert.equal(close.keys[2].pubkey.toBase58(), wallet.publicKey.toBase58());
});

test("a reverted LaunchLab trade does not report cleanup success or retain recovery state", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  const result = await signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection({
    confirmTransaction: async () => ({ value: { err: { InstructionError: [0, "Custom"] } } }),
  }), pendingStore);
  assert.equal(result.status, "reverted");
  assert.equal(pendingStore.values.size, 0);
});

test("a submitted cleanup flow remains recoverable until finalized", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection({
    sendRawTransaction: async () => { throw new Error("RPC timeout"); },
  }), pendingStore), /RPC timeout/);
  assert.equal(pendingStore.values.size, 1);
  const pending = [...pendingStore.values.values()][0];
  const recovered = await recoverLaunchLabTransaction(pending, connection(), pendingStore);
  assert.deepEqual(recovered, { signature: pending.signature, finalized: true, status: "finalized" });
  assert.equal(pendingStore.values.size, 0);
});

test("preserves a pre-existing user WSOL account and does not append close", async () => {
  const quoteAccount = getAssociatedTokenAddressSync(WSOL_MINT, wallet.publicKey);
  const reviewedConnection = connection();
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection({
    getAccountInfo: async (address, commitment) => address.equals(quoteAccount)
      ? { owner: TOKEN_PROGRAM_ID, data: new Uint8Array(165) }
      : reviewedConnection.getAccountInfo(address, commitment),
  }));
  assert.notEqual(prepared.transaction.instructions.at(-1).programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(
    prepared.transaction.instructions.filter((instruction) => instruction.programId.equals(TOKEN_PROGRAM_ID) && instruction.data[0] === 9).length,
    0,
  );
});

test("CPMM sell closes only the temporary WSOL output account", async () => {
  const fixture = cpmmConnection();
  const result = await prepareCpmmSwapTransaction({
    cluster: "devnet",
    wallet: wallet.publicKey,
    mint: mint.publicKey,
    side: "sell",
    amountIn: toBN(100),
  }, fixture.rpc);
  const close = result.prepared.transaction.instructions.at(-1);
  assert.equal(close.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(close.data[0], 9);
  assert.equal(close.keys[0].pubkey.toBase58(), result.prepared.intentSnapshot.accounts.outputAccount);
  assert.equal(close.keys[1].pubkey.toBase58(), wallet.publicKey.toBase58());
  assert.equal(result.prepared.transaction.instructions.at(-2).programId.toBase58(), DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58());
});

test("CPMM sell preserves a pre-existing WSOL output account", async () => {
  const fixture = cpmmConnection();
  const userWsol = getAssociatedTokenAddressSync(WSOL_MINT, wallet.publicKey);
  const originalGetAccountInfo = fixture.rpc.getAccountInfo;
  fixture.rpc.getAccountInfo = async (address, commitment) => address.equals(userWsol)
    ? { owner: TOKEN_PROGRAM_ID, data: new Uint8Array(165) }
    : originalGetAccountInfo(address, commitment);
  const result = await prepareCpmmSwapTransaction({
    cluster: "devnet",
    wallet: wallet.publicKey,
    mint: mint.publicKey,
    side: "sell",
    amountIn: toBN(100),
  }, fixture.rpc);
  assert.notEqual(result.prepared.transaction.instructions.at(-1).programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(
    result.prepared.transaction.instructions.filter((instruction) => instruction.programId.equals(TOKEN_PROGRAM_ID) && instruction.data[0] === 9).length,
    0,
  );
});

test("a concurrent WSOL ATA creation fails before broadcast instead of closing the pre-existing account", async () => {
  const quoteAccount = getAssociatedTokenAddressSync(WSOL_MINT, wallet.publicKey);
  const baseline = connection();
  let accountAppeared = false;
  let walletCalls = 0;
  const raceConnection = connection({
    getAccountInfo: async (address, commitment) => address.equals(quoteAccount) && !accountAppeared
      ? null
      : baseline.getAccountInfo(address, commitment),
    sendRawTransaction: async (raw) => {
      assert.equal(accountAppeared, true);
      const transaction = Transaction.from(raw);
      const create = transaction.instructions.find((instruction) => instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
        && instruction.keys.some((key) => key.pubkey.equals(quoteAccount)));
      assert.ok(create);
      assert.equal(create.data.length, 0, "the temporary ATA must use non-idempotent creation");
      assert.equal(transaction.instructions.at(-1).programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
      assert.equal(transaction.instructions.at(-1).keys[0].pubkey.toBase58(), quoteAccount.toBase58());
      throw new Error("WSOL ATA was created concurrently");
    },
  });
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(100),
    minAmount: toBN(1),
  }, raceConnection);
  accountAppeared = true;
  const pendingStore = store();
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      walletCalls += 1;
      transaction.partialSign(wallet);
      return transaction;
    },
  }, raceConnection, pendingStore), /created concurrently/);
  assert.equal(walletCalls, 1);
  assert.equal(pendingStore.values.size, 1);
});

test("create requires the mint signer and simulation completes before wallet signing", async () => {
  const calls = [];
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "create",
    mint: mint,
    name: "Test",
    symbol: "TST",
    uri: "https://example.invalid/token.json",
    decimals: CMC_DEVNET_LAUNCH_DECIMALS,
    supply: CMC_DEVNET_LAUNCH_SUPPLY,
    totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
    totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
    totalLockedAmount: CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
    cliffPeriod: CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
    unlockPeriod: CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
  }, connection({
    simulateTransaction: async (...args) => {
      assert.equal(args.length, 1, "legacy Transaction simulation must not receive VersionedTransaction config");
      const [transaction] = args;
      calls.push(transaction.signatures.length);
      return { value: { err: null } };
    },
  }));
  assert.equal(calls.length, 1);
  assert.equal(prepared.transaction.instructions[2].programId.toBase58(), DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58());
  assert.equal(
    prepared.transaction.instructions[2].keys[1].pubkey.toBase58(),
    base.creator.toBase58(),
    "the validated creator must be passed to initializeV2",
  );
  assert.equal(prepared.transaction.instructions.length, 3);
  assert.equal(prepared.intentSnapshot.parameters.supply, "1000000000000000");
  assert.equal(prepared.intentSnapshot.parameters.curveType, "ConstantCurve");
  assert.equal(prepared.intentSnapshot.parameters.migrateType, "cpmm");
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base,
      operation: "create",
      mint: Keypair.generate(),
      name: "Test",
      symbol: "TST",
      uri: "https://example.invalid/token.json",
      supply: toBN(1),
      totalSellA: toBN(1),
      totalFundRaisingB: toBN(1),
    }, connection()),
    /must match the supplied mint signer/,
  );
});

test("rejects every substituted launch economic input", async () => {
  const request = {
    ...base,
    operation: "create",
    mint,
    name: "Test",
    symbol: "TST",
    uri: "https://example.invalid/token.json",
    decimals: CMC_DEVNET_LAUNCH_DECIMALS,
    supply: CMC_DEVNET_LAUNCH_SUPPLY,
    totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
    totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
    totalLockedAmount: CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
    cliffPeriod: CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
    unlockPeriod: CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
  };
  await assert.rejects(prepareLaunchLabTransaction({ ...request, decimals: 9 }, connection()), /decimals/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, supply: toBN("1000000000000001") }, connection()), /supply/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, totalSellA: toBN("800000000000001") }, connection()), /totalSellA/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, totalFundRaisingB: toBN("160000000000") }, connection()), /fundraising/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, totalLockedAmount: toBN(1) }, connection()), /vesting economics/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, cliffPeriod: toBN(1) }, connection()), /vesting economics/);
  await assert.rejects(prepareLaunchLabTransaction({ ...request, unlockPeriod: toBN(1) }, connection()), /vesting economics/);
});

test("rejects mainnet and non-SOL quote construction", async () => {
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, cluster: "mainnet-beta", operation: "buy", amount: toBN(1), minAmount: toBN(1) }, connection()),
    /disabled outside Solana devnet/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, operation: "buy", mintB: Keypair.generate().publicKey, amount: toBN(1), minAmount: toBN(1) }, connection()),
    /only supports SOL/,
  );
});

test("requires the reviewed Platform PDA and rejects zero minimum output", async () => {
  const withoutPlatform = { ...base };
  delete withoutPlatform.platformId;
  await assert.rejects(
    prepareLaunchLabTransaction({ ...withoutPlatform, operation: "buy", amount: toBN(1), minAmount: toBN(1) }, connection()),
    /explicit CMC Platform PDA/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base,
      platformId: Keypair.generate().publicKey,
      operation: "buy",
      amount: toBN(1),
      minAmount: toBN(1),
    }, connection()),
    /Platform PDA does not match/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, operation: "sell", amount: toBN(1), minAmount: toBN(0) }, connection()),
    /minimum output must be positive/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base,
      operation: "buy",
      amount: toBN(1),
      minAmount: toBN(1),
    }, connection({
      getAccountInfo: async () => ({
        owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        data: new Uint8Array(128),
      }),
    })),
    /CMC Platform account/,
  );
});

test("slippage uses integer bounds, including zero, without floating point", () => {
  assert.equal(slippageBound(1_000_000n, 125n).toString(), "987500");
  assert.equal(slippageBound(999n, 1n, "maximum").toString(), "1000");
  assert.throws(() => slippageBound(1n, 10_000n), /Slippage/);
});

test("decodes the finalized LaunchLab pool layout and quotes integer buys/sells", async () => {
  const stateful = connection({
    getAccountInfo: async (address) => address.equals(CMC_DEVNET_PLATFORM_ID)
      ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: poolData() }
      : null,
  });
  const pool = await fetchFinalizedLaunchLabPoolState(stateful, CMC_DEVNET_PLATFORM_ID);
  assert.equal(pool.realA.toString(), "400");
  assert.equal(pool.realB.toString(), "100");
  assert.equal(remainingSolToGraduation(pool).toString(), "2900");
  const buy = quoteLaunchLabBuyExactIn(pool, toBN(10_000), { slippageBps: 125 });
  // 400 base tokens are the exact curve boundary; fees are 7,500 / 1,000,000
  // and the inverse integer fee calculation consumes 2,217 quote units.
  assert.equal(buy.amountInUsed.toString(), "2217");
  assert.equal(buy.refund.toString(), "7783");
  assert.equal(buy.amountOut.toString(), "400");
  assert.equal(buy.minimumAmountOut.toString(), "395");
  assert.equal(buy.cappedAtGraduation, true);
  const sell = quoteLaunchLabSellExactIn(pool, toBN(100));
  assert.equal(sell.amountOut.toString(), "155");
});

test("final buy grosses up the remaining net raise for fees", () => {
  const pool = LaunchpadPool.decode(poolData({
    realA: 1,
    realB: 100,
    totalFundRaisingB: 200,
  }));
  const buy = quoteLaunchLabBuyExactIn(pool, toBN(1_000), { slippageBps: 100 });
  assert.equal(buy.amountInUsed.toString(), "101");
  assert.equal(buy.fee.toString(), "1");
  assert.equal(buy.amountInAfterFees.toString(), "100");
  assert.equal(buy.refund.toString(), "899");
  assert.equal(buy.cappedAtGraduation, true);
});

test("fails closed for a substituted or non-finalized LaunchLab pool", async () => {
  assert.throws(() => decodeLaunchLabPoolState(poolData().subarray(0, -1)), /truncated/);
  const wrongDiscriminator = poolData();
  wrongDiscriminator[0] ^= 1;
  assert.throws(() => decodeLaunchLabPoolState(wrongDiscriminator), /discriminator/);
  await assert.rejects(
    fetchFinalizedLaunchLabPoolState(connection({
      getAccountInfo: async () => ({ owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: poolData() }),
    }), CMC_DEVNET_PLATFORM_ID),
    /wrong owner/,
  );
});

test("persists and recovers submitted signatures, while checking wallet identity", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  const result = await signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection(), pendingStore, 123);
  assert.equal(typeof result.signature, "string");
  assert.ok(result.signature.length > 20);
  assert.equal(pendingStore.values.size, 0);

  const recovered = {
    id: "sell:signature-2:123",
    signature: "signature-2",
    operation: "sell",
    wallet: wallet.publicKey.toBase58(),
    blockhash: prepared.blockhash,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    submittedAt: 123,
  };
  pendingStore.set(recovered);
  assert.deepEqual(await recoverLaunchLabTransaction(recovered, connection(), pendingStore), {
    signature: "signature-2",
    finalized: true,
    status: "finalized",
  });
  await assert.rejects(
    signAndSubmitLaunchLab(prepared, {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async () => prepared.transaction,
    }, connection(), pendingStore),
    /identity changed/,
  );
});

test("persists the derived signature before send and retains it on an RPC timeout", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  let persistedBeforeSend = false;
  const timedOutConnection = connection({
    sendRawTransaction: async (raw) => {
      persistedBeforeSend = pendingStore.values.size === 1;
      assert.equal(signatureFromSignedTransaction(Transaction.from(raw)).length > 20, true);
      throw new Error("RPC timeout");
    },
  });
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, timedOutConnection, pendingStore), /RPC timeout/);
  assert.equal(persistedBeforeSend, true);
  assert.equal(pendingStore.values.size, 1);
});

test("does not emit success or clear recovery before finalized commitment", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  const commitments = [];
  const finalityUnavailable = connection({
    confirmTransaction: async (_strategy, commitment) => {
      commitments.push(commitment);
      throw new Error("finalized commitment is temporarily unavailable");
    },
  });
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, finalityUnavailable, pendingStore), /finalized commitment is temporarily unavailable/);
  assert.deepEqual(commitments, ["finalized"]);
  assert.equal(pendingStore.values.size, 1);

  const pending = [...pendingStore.values.values()][0];
  await assert.rejects(
    recoverLaunchLabTransaction(pending, finalityUnavailable, pendingStore),
    /finalized commitment is temporarily unavailable/,
  );
  assert.deepEqual(commitments, ["finalized", "finalized"]);
  assert.equal(pendingStore.values.size, 1);
});

test("rejects a mismatched RPC signature and removes reverted/expired terminal records", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection({ sendRawTransaction: async () => "different-signature" }), pendingStore), /different/);
  assert.equal(pendingStore.values.size, 1);

  const reverted = [...pendingStore.values.values()][0];
  const revertedResult = await recoverLaunchLabTransaction(reverted, connection({
    confirmTransaction: async () => ({ value: { err: { InstructionError: [0, "Custom"] } } }),
  }), pendingStore);
  assert.equal(revertedResult.status, "reverted");
  assert.equal(pendingStore.values.size, 0);

  const expired = { ...reverted, id: "sell:expired:1", signature: "expired" };
  pendingStore.set(expired);
  const expiredResult = await recoverLaunchLabTransaction(expired, connection({
    confirmTransaction: async () => {
      const error = new Error("TransactionExpiredBlockheightExceededError");
      error.name = "TransactionExpiredBlockheightExceededError";
      throw error;
    },
  }), pendingStore);
  assert.equal(expiredResult.status, "expired");
  assert.equal(pendingStore.values.size, 0);
});

test("refreshes an expired trade blockhash before wallet signing", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  let signatures = 0;
  const originalBlockhash = prepared.blockhash;
  const originalInstructionBytes = prepared.transaction.instructions.map((instruction) => Buffer.from(instruction.data).toString("hex"));
  let latestCalls = 0;
  const result = await signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      signatures += 1;
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection({
    getBlockHeight: async () => 900,
    getLatestBlockhash: async () => {
      latestCalls += 1;
      return {
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 2_000,
      };
    },
  }), store());
  assert.equal(result.status, "finalized");
  assert.equal(signatures, 1);
  assert.equal(latestCalls, 1);
  assert.notEqual(prepared.blockhash, originalBlockhash);
  assert.equal(prepared.lastValidBlockHeight, 2_000);
  assert.deepEqual(
    prepared.transaction.instructions.map((instruction) => Buffer.from(instruction.data).toString("hex")),
    originalInstructionBytes,
  );
});

test("refreshes an expired create and restores its mint signature", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "create",
    mint,
    name: "Test",
    symbol: "TST",
    uri: "https://example.invalid/token.json",
    decimals: CMC_DEVNET_LAUNCH_DECIMALS,
    supply: CMC_DEVNET_LAUNCH_SUPPLY,
    totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
    totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
  }, connection());
  let mintSigned = false;
  const result = await signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      mintSigned = Boolean(transaction.signatures.find((item) => item.publicKey.equals(mint.publicKey))?.signature);
      transaction.partialSign(wallet);
      return transaction;
    },
  }, connection({
    getBlockHeight: async () => 900,
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 2_000,
    }),
  }), store());
  assert.equal(result.status, "finalized");
  assert.equal(mintSigned, true);
});

test("rejects mutation before an expired-blockhash refresh and before wallet approval", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  prepared.transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  let walletCalls = 0;
  let refreshCalls = 0;
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async () => {
      walletCalls += 1;
      return prepared.transaction;
    },
  }, connection({
    getBlockHeight: async () => 900,
    getLatestBlockhash: async () => {
      refreshCalls += 1;
      return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 2_000 };
    },
  }), store()), /Prepared transaction changed after simulation/);
  assert.equal(walletCalls, 0);
  assert.equal(refreshCalls, 0);
});

test("rejects a wallet that mutates the approved transaction message", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  const pendingStore = store();
  let broadcast = false;
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
      return transaction;
    },
  }, connection({
    sendRawTransaction: async () => {
      broadcast = true;
      return "unreachable";
    },
  }), pendingStore), /changed the transaction message.*Structural diff.*expected.*actual.*recentBlockhash/s);
  assert.equal(broadcast, false);
  assert.equal(pendingStore.values.size, 0);
});

test("rejects transaction mutation after simulation and before wallet approval", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  prepared.transaction.instructions[0].data[0] ^= 0xff;
  let signCalls = 0;
  let broadcasts = 0;
  await assert.rejects(
    signAndSubmitLaunchLab(
      prepared,
      {
        publicKey: wallet.publicKey,
        async signTransaction(transaction) {
          signCalls += 1;
          transaction.partialSign(wallet);
          return transaction;
        },
      },
      connection({ sendRawTransaction: async () => { broadcasts += 1; return "unused"; } }),
      store(),
    ),
    /changed after simulation/,
  );
  assert.equal(signCalls, 0);
  assert.equal(broadcasts, 0);
});

test("rechecks finalized decoded account state immediately before signing", async () => {
  let currentPlatform = platformData();
  const statefulConnection = connection({
    getAccountInfo: async (address) => address.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)
      ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: launchConfigData() }
      : address.equals(CMC_DEVNET_PLATFORM_ID)
        ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: currentPlatform }
        : address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
          ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
        : null,
  });
  const prepared = await prepareLaunchLabTransaction({
    ...base, operation: "buy", amount: toBN(1), minAmount: toBN(1),
  }, statefulConnection);
  currentPlatform = mutated(currentPlatform, 104);
  let signatures = 0;
  await assert.rejects(signAndSubmitLaunchLab(prepared, {
    publicKey: wallet.publicKey,
    signTransaction: async (transaction) => {
      signatures += 1;
      transaction.partialSign(wallet);
      return transaction;
    },
  }, statefulConnection, store()), /Platform feeRate/);
  assert.equal(signatures, 0);
});

test("rechecks wallet identity after the approval prompt", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(10),
    minAmount: toBN(1),
  }, connection());
  let liveKey = wallet.publicKey;
  const switchingWallet = {
    get publicKey() {
      return liveKey;
    },
    signTransaction: async (transaction) => {
      transaction.partialSign(wallet);
      liveKey = Keypair.generate().publicKey;
      return transaction;
    },
  };
  await assert.rejects(signAndSubmitLaunchLab(prepared, switchingWallet, connection(), store()), /identity changed/);
});

test("the injected-provider adapter observes an account switch during approval", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const switched = Keypair.generate();
  const provider = {
    publicKey: wallet.publicKey,
    async signTransaction(transaction) {
      transaction.partialSign(wallet);
      this.publicKey = switched.publicKey;
      return transaction;
    },
  };
  const pendingStore = store();
  let broadcasts = 0;
  await assert.rejects(
    signAndSubmitLaunchLab(
      prepared,
      createLiveWalletSigner(provider),
      connection({ sendRawTransaction: async () => { broadcasts += 1; return "unused"; } }),
      pendingStore,
    ),
    /identity changed/,
  );
  assert.equal(broadcasts, 0);
  assert.equal(pendingStore.values.size, 0);
});

test("normalizes injected wallet signed Transaction, bytes, and base64 responses", async () => {
  for (const [label, convert] of [
    ["in-place Transaction", (transaction, raw) => transaction],
    ["serialized bytes", (_transaction, raw) => raw],
    ["serialized base64", (_transaction, raw) => Buffer.from(raw).toString("base64")],
    ["new Transaction", (_transaction, raw) => Transaction.from(raw)],
    ["transaction wrapper", (_transaction, raw) => ({ transaction: raw })],
    ["signedTransaction wrapper", (_transaction, raw) => ({ signedTransaction: raw })],
    ["serializedTransaction wrapper", (_transaction, raw) => ({ serializedTransaction: raw })],
    ["rawTransaction wrapper", (_transaction, raw) => ({ rawTransaction: raw })],
    ["nested result wrapper", (_transaction, raw) => ({ result: { serializedTransaction: raw } })],
    ["numeric byte array", (_transaction, raw) => [...raw]],
    ["Buffer JSON shape", (_transaction, raw) => ({ type: "Buffer", data: [...raw] })],
  ]) {
    const prepared = await prepareLaunchLabTransaction({
      ...base,
      operation: "sell",
      amount: toBN(100),
      minAmount: toBN(1),
    }, connection());
    const provider = {
      publicKey: wallet.publicKey,
      async signTransaction(transaction) {
        transaction.partialSign(wallet);
        const raw = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        return convert(transaction, raw);
      },
    };
    const result = await signAndSubmitLaunchLab(
      prepared,
      createLiveWalletSigner(provider),
      connection(),
      store(),
    );
    assert.equal(result.status, "finalized", label);
  }
});

test("normalizes a strict cross-bundle Transaction-like wallet response", async () => {
  class CrossBundleTransaction {
    constructor(transaction, serialized) {
      this._serialized = serialized;
      this._message = transaction.serializeMessage();
      this.recentBlockhash = transaction.recentBlockhash;
      this.signatures = transaction.signatures;
      this.instructions = transaction.instructions;
      this.feePayer = transaction.feePayer;
      this.lastValidBlockHeight = transaction.lastValidBlockHeight;
    }

    serialize(_options) {
      return this._serialized;
    }

    serializeMessage() {
      return this._message;
    }
  }
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "sell",
    amount: toBN(100),
    minAmount: toBN(1),
  }, connection());
  const provider = {
    publicKey: wallet.publicKey,
    async signTransaction(transaction) {
      transaction.partialSign(wallet);
      const raw = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
      return new CrossBundleTransaction(transaction, raw);
    },
  };
  const result = await signAndSubmitLaunchLab(
    prepared,
    createLiveWalletSigner(provider),
    connection(),
    store(),
  );
  assert.equal(result.status, "finalized");
});

test("rejects Transaction-like lookalikes without both serialization methods", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  const lookalike = {
    recentBlockhash: prepared.transaction.recentBlockhash,
    signatures: [],
    instructions: [],
    serialize: () => new Uint8Array(),
  };
  await assert.rejects(
    signAndSubmitLaunchLab(
      prepared,
      createLiveWalletSigner({
        publicKey: wallet.publicKey,
        signTransaction: async () => lookalike,
      }),
      connection(),
      store(),
    ),
    (error) => {
      assert.match(error.message, /unsupported signed transaction format/);
      assert.match(error.message, /"enumerableKeys":\["instructions","recentBlockhash","serialize","signatures"\]/);
      return true;
    },
  );
});

test("reports cross-bundle serialization failures without provider values", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  const failing = {
    recentBlockhash: prepared.transaction.recentBlockhash,
    signatures: [],
    instructions: [],
    serialize: () => { throw new Error("private provider detail"); },
    serializeMessage: () => new Uint8Array(),
  };
  await assert.rejects(
    signAndSubmitLaunchLab(
      prepared,
      createLiveWalletSigner({
        publicKey: wallet.publicKey,
        signTransaction: async () => failing,
      }),
      connection(),
      store(),
    ),
    (error) => {
      assert.match(error.message, /cross-bundle transaction serialization failed/);
      assert.doesNotMatch(error.message, /private provider detail/);
      return true;
    },
  );
});

test("rejects signature-only injected wallet responses with safe diagnostics", async () => {
  const prepared = await prepareLaunchLabTransaction({
    ...base,
    operation: "buy",
    amount: toBN(1),
    minAmount: toBN(1),
  }, connection());
  await assert.rejects(
    signAndSubmitLaunchLab(
      prepared,
      createLiveWalletSigner({
        publicKey: wallet.publicKey,
        signTransaction: async () => ({ signature: "not-a-transaction", secret: "must-not-leak" }),
      }),
      connection(),
      store(),
    ),
    (error) => {
      assert.match(error.message, /unsupported signed transaction format/);
      assert.match(error.message, /"objectTag":"\[object Object\]"/);
      assert.match(error.message, /"constructorName":"Object"/);
      assert.match(error.message, /"enumerableKeys":\["secret","signature"\]/);
      assert.doesNotMatch(error.message, /not-a-transaction|must-not-leak/);
      return true;
    },
  );
});

test("uses the exact reviewed devnet Platform PDA", () => {
  assert.equal(DEVNET_PLATFORM_ID.toBase58(), DEVNET_PROGRAM_ID.LAUNCHPAD_PLATFORM.toBase58());
  assert.equal(CMC_DEVNET_ADMIN.toBase58(), "Atj7ip3wC544DRGJqeVEYFJpPc6C4dA6VvqMPmesdij9");
  assert.equal(CMC_DEVNET_PLATFORM_ID.toBase58(), "ENPQU6GScAyfBTsPQrQwhbQVwH2HFW7WAhhhZgBEYyx8");
  assert.equal(CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58(), "7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
  assert.equal(CMC_DEVNET_CPMM_CONFIG_ID.toBase58(), "5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");
  assert.equal(CMC_DEVNET_PLATFORM_FEE_RATE.toString(), "5000");
  assert.equal(CMC_DEVNET_CREATOR_FEE_RATE.toString(), "0");
});

test("rejects substituted LaunchLab governance and config inputs", async () => {
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, configId: Keypair.generate().publicKey, operation: "buy", amount: toBN(1), minAmount: toBN(1) }, connection()),
    /LaunchLab config does not match/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, platformAdmin: Keypair.generate().publicKey, operation: "buy", amount: toBN(1), minAmount: toBN(1) }, connection()),
    /reviewed CMC devnet admin/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({ ...base, platformId: Keypair.generate().publicKey, operation: "buy", amount: toBN(1), minAmount: toBN(1) }, connection()),
    /reviewed CMC Platform PDA/,
  );
});

test("fails closed on decoded LaunchLab and Platform account mutations", async () => {
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base, operation: "buy", amount: toBN(1), minAmount: toBN(1),
    }, connection({
      getAccountInfo: async (address) => address.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)
        ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: mutated(launchConfigData(), 27) }
        : address.equals(CMC_DEVNET_PLATFORM_ID)
          ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: platformData() }
          : address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
            ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
          : null,
    })),
    /LaunchLab config tradeFeeRate/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base, operation: "sell", amount: toBN(1), minAmount: toBN(1),
    }, connection({
      getAccountInfo: async (address) => address.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)
        ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: launchConfigData() }
        : address.equals(CMC_DEVNET_PLATFORM_ID)
          ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: mutated(platformData(), 104) }
          : address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
            ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
          : null,
    })),
    /Platform feeRate/,
  );
  await assert.rejects(
    prepareLaunchLabTransaction({
      ...base, operation: "buy", amount: toBN(1), minAmount: toBN(1),
    }, connection({
      getAccountInfo: async (address) => address.equals(CMC_DEVNET_LAUNCHLAB_CONFIG_ID)
        ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: launchConfigData() }
        : address.equals(CMC_DEVNET_PLATFORM_ID)
          ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: mutated(platformData(), 16) }
          : address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
            ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
          : null,
    })),
    /Platform platformClaimFeeWallet/,
  );
});

test("prepares the reviewed CMC Platform PDA without claiming creation", async () => {
  const cpConfigId = CMC_DEVNET_CPMM_CONFIG_ID;
  const admin = { publicKey: CMC_DEVNET_ADMIN };
  const platformConnection = connection({
    getAccountInfo: async (address) => address.equals(cpConfigId)
      ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
      : null,
  });
  const prepared = await preparePlatformTransaction({
    operation: "createPlatform",
    cluster: "devnet",
    wallet: admin.publicKey,
    platformAdmin: admin.publicKey,
    cpConfigId,
    platformClaimFeeWallet: CMC_DEVNET_TREASURY,
    platformLockNftWallet: CMC_DEVNET_TREASURY,
    platformVestingWallet: CMC_DEVNET_TREASURY,
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY,
    migrateCpLockNftScale: { platformScale: toBN(1_000_000), creatorScale: toBN(0), burnScale: toBN(0) },
    feeRate: CMC_DEVNET_PLATFORM_FEE_RATE,
    creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE,
    platformVestingScale: toBN(0),
    name: "CMC devnet",
    web: "https://example.invalid",
    img: "https://example.invalid/image.png",
  }, platformConnection);
  assert.equal(prepared.operation, "createPlatform");
  assert.equal(prepared.platform.cpConfigId.toBase58(), cpConfigId.toBase58());
  assert.equal(prepared.transaction.instructions.length, 3);
  assert.equal(prepared.transaction.instructions[0].programId.toBase58(), "ComputeBudget111111111111111111111111111111");
  assert.equal(prepared.transaction.instructions[1].programId.toBase58(), "ComputeBudget111111111111111111111111111111");
  assert.equal(prepared.transaction.instructions[2].programId.toBase58(), DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58());
  assert.equal(prepared.feeLamports, 5_000);
  assert.equal(prepared.simulation.err, null);
  assert.equal(prepared.platform.platformId instanceof PublicKey, true);
  assert.equal(prepared.intentSnapshot.accounts.cpConfigId, cpConfigId.toBase58());
  assert.equal(prepared.intentSnapshot.parameters.platformFeeRate, "5000");
  assert.equal(prepared.intentSnapshot.parameters.creatorFeeRate, "0");
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.intentSnapshot)), prepared.intentSnapshot);
});

test("prepares the one-time Platform governance completion from default authorities", async () => {
  let currentPlatform = platformData({
    platformCpCreator: PublicKey.default,
    curveRuleManager: PublicKey.default,
  });
  const governanceConnection = connection({
    getAccountInfo: async (address) => address.equals(CMC_DEVNET_PLATFORM_ID)
      ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: currentPlatform }
      : address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
        ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: cpmmData() }
      : null,
  });
  const governance = await verifyPlatformGovernanceCompletion(governanceConnection);
  assert.equal(governance.valid, true);
  assert.equal(governance.needsCompletion, true);
  assert.equal((await verifyReviewedPlatformAccount(governanceConnection)).valid, false);
  const prepared = await prepareConfigurePlatformTransaction({
    operation: "configurePlatform",
    cluster: "devnet",
    wallet: CMC_DEVNET_ADMIN,
    platformId: CMC_DEVNET_PLATFORM_ID,
  }, governanceConnection);
  assert.equal(prepared.operation, "configurePlatform");
  assert.equal(prepared.transaction.instructions.length, 4);
  assert.equal(prepared.transaction.instructions[2].programId.toBase58(), DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58());
  assert.equal(prepared.transaction.instructions[3].programId.toBase58(), DEVNET_LAUNCHLAB_PROGRAM_ID.toBase58());
  assert.notDeepEqual([...prepared.transaction.instructions[2].data], [...prepared.transaction.instructions[3].data]);
  assert.equal(
    Buffer.from(prepared.transaction.instructions[2].data).toString("hex"),
    "c33c4c81922d438f0b92f96c96af60c3d976bcb5c381e8ef5ad514975426a004bc94a38bc2068f5130",
  );
  assert.equal(
    Buffer.from(prepared.transaction.instructions[3].data).toString("hex"),
    "c33c4c81922d438f0e92f96c96af60c3d976bcb5c381e8ef5ad514975426a004bc94a38bc2068f5130",
  );
  assert.equal(prepared.intentSnapshot.parameters.updatePlatformCpCreator, CMC_DEVNET_ADMIN.toBase58());
  assert.equal(prepared.intentSnapshot.parameters.updateCurveRuleManager, CMC_DEVNET_ADMIN.toBase58());

  currentPlatform = platformData();
  const complete = await verifyPlatformGovernanceCompletion(governanceConnection);
  assert.equal(complete.alreadyConfigured, true);
  assert.equal((await verifyReviewedPlatformAccount(governanceConnection)).valid, true);
  await assert.rejects(
    prepareConfigurePlatformTransaction({
      operation: "configurePlatform",
      cluster: "devnet",
      wallet: CMC_DEVNET_ADMIN,
      platformId: CMC_DEVNET_PLATFORM_ID,
    }, governanceConnection),
    /already configured/,
  );
});

test("governance completion rejects mutations outside the two default/admin fields", async () => {
  const wrongPlatform = mutated(platformData({
    platformCpCreator: PublicKey.default,
    curveRuleManager: PublicKey.default,
  }), 104);
  await assert.rejects(
    prepareConfigurePlatformTransaction({
      operation: "configurePlatform",
      cluster: "devnet",
      wallet: CMC_DEVNET_ADMIN,
      platformId: CMC_DEVNET_PLATFORM_ID,
    }, connection({
      getAccountInfo: async (address) => address.equals(CMC_DEVNET_PLATFORM_ID)
        ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: wrongPlatform }
        : null,
    })),
    /not eligible for governance completion/,
  );
});

test("governance completion rechecks finalized state before wallet approval", async () => {
  let currentPlatform = platformData({
    platformCpCreator: PublicKey.default,
    curveRuleManager: PublicKey.default,
  });
  const governanceConnection = connection({
    getAccountInfo: async (address) => address.equals(CMC_DEVNET_PLATFORM_ID)
      ? { owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: currentPlatform }
      : null,
  });
  const prepared = await prepareConfigurePlatformTransaction({
    operation: "configurePlatform",
    cluster: "devnet",
    wallet: CMC_DEVNET_ADMIN,
    platformId: CMC_DEVNET_PLATFORM_ID,
  }, governanceConnection);
  currentPlatform = mutated(platformData({
    platformCpCreator: PublicKey.default,
    curveRuleManager: PublicKey.default,
  }), 104);
  let walletCalls = 0;
  await assert.rejects(
    signAndSubmitLaunchLab(prepared, {
      publicKey: CMC_DEVNET_ADMIN,
      signTransaction: async () => {
        walletCalls += 1;
        return prepared.transaction;
      },
    }, governanceConnection, store()),
    /governance state changed/,
  );
  assert.equal(walletCalls, 0);
});

test("refreshes an expired Platform blockhash before wallet signing", async () => {
  const prepared = await preparePlatformTransaction({
    operation: "createPlatform",
    cluster: "devnet",
    wallet: CMC_DEVNET_ADMIN,
    platformAdmin: CMC_DEVNET_ADMIN,
    cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID,
    platformClaimFeeWallet: CMC_DEVNET_TREASURY,
    platformLockNftWallet: CMC_DEVNET_TREASURY,
    platformVestingWallet: CMC_DEVNET_TREASURY,
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY,
    migrateCpLockNftScale: { platformScale: toBN(1_000_000), creatorScale: toBN(0), burnScale: toBN(0) },
    feeRate: CMC_DEVNET_PLATFORM_FEE_RATE,
    creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE,
    name: "CMC",
    web: "https://example.invalid",
    img: "https://example.invalid/image.png",
  }, connection());
  let walletCalls = 0;
  const result = await signAndSubmitLaunchLab(prepared, {
    publicKey: CMC_DEVNET_ADMIN,
    signTransaction: async (transaction) => {
      walletCalls += 1;
      const signer = transaction.signatures.find((item) => item.publicKey.equals(CMC_DEVNET_ADMIN));
      signer.signature = new Uint8Array(64).fill(1);
      const serialize = transaction.serialize.bind(transaction);
      transaction.serialize = (options) => serialize({ ...(options ?? {}), verifySignatures: false });
      return transaction;
    },
  }, connection({
    getBlockHeight: async () => 900,
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 2_000,
    }),
  }), store());
  assert.equal(result.status, "finalized");
  assert.equal(walletCalls, 1);
  assert.equal(prepared.lastValidBlockHeight, 2_000);
});

test("Platform preparation validates CPMM ownership and admin identity", async () => {
  const request = {
    operation: "createPlatform",
    cluster: "devnet",
    wallet: CMC_DEVNET_ADMIN,
    platformAdmin: CMC_DEVNET_ADMIN,
    cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID,
    platformClaimFeeWallet: CMC_DEVNET_TREASURY,
    platformLockNftWallet: CMC_DEVNET_TREASURY,
    platformVestingWallet: CMC_DEVNET_TREASURY,
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY,
    migrateCpLockNftScale: { platformScale: toBN(1_000_000), creatorScale: toBN(0), burnScale: toBN(0) },
    feeRate: CMC_DEVNET_PLATFORM_FEE_RATE,
    creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE,
    name: "CMC",
    web: "https://example.invalid",
    img: "https://example.invalid/image.png",
  };
  await assert.rejects(
    preparePlatformTransaction(request, connection({
      getAccountInfo: async () => ({ owner: DEVNET_LAUNCHLAB_PROGRAM_ID, data: new Uint8Array(128) }),
    })),
    /CPMM config account/,
  );
  await assert.rejects(
    preparePlatformTransaction({ ...request, cpConfigId: Keypair.generate().publicKey }, connection()),
    /CPMM config does not match/,
  );
  await assert.rejects(
    preparePlatformTransaction({ ...request, platformClaimFeeWallet: Keypair.generate().publicKey }, connection()),
    /treasury/,
  );
  await assert.rejects(
    preparePlatformTransaction({ ...request, feeRate: toBN(1) }, connection()),
    /pinned to 5000/,
  );
  await assert.rejects(
    preparePlatformTransaction({
      ...request,
      migrateCpLockNftScale: { platformScale: toBN(999_999), creatorScale: toBN(0), burnScale: toBN(0) },
    }, connection()),
    /migration and vesting scales/,
  );
  await assert.rejects(
    preparePlatformTransaction(request, connection({
      getAccountInfo: async (address) => address.equals(CMC_DEVNET_CPMM_CONFIG_ID)
        ? { owner: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, data: mutated(cpmmData(), 20) }
        : null,
    })),
    /CPMM config protocolFeeRate/,
  );
  await assert.rejects(
    preparePlatformTransaction({ ...request, platformAdmin: Keypair.generate().publicKey, wallet: Keypair.generate().publicKey }, connection()),
    /reviewed CMC devnet admin/,
  );
});

test("browser RecoveryStore survives reload-shaped instances", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const first = createBrowserRecoveryStore(storage);
  const item = {
    id: "buy:signature:1",
    signature: "signature",
    operation: "buy",
    wallet: wallet.publicKey.toBase58(),
    blockhash: "blockhash",
    lastValidBlockHeight: 100,
    submittedAt: 1,
  };
  first.set(item);
  const second = createBrowserRecoveryStore(storage);
  assert.deepEqual(second.get(item.id), item);
  second.delete(item.id);
  assert.equal(second.get(item.id), undefined);
});
