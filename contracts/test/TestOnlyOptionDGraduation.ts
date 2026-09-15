import { expect } from "chai";
import { ethers } from "hardhat";

const WAD = 10n ** 18n;
const BPS = 10_000n;
const CURVE = 800_000_000n * WAD;
const RESERVE = 200_000_000n * WAD;

function ceilDiv(a: bigint, b: bigint) {
  return (a + b - 1n) / b;
}

async function deadline(seconds = 300): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("missing local block");
  return BigInt(block.timestamp + seconds);
}

async function deployed(routerName = "TestV2Router") {
  const [deployer, alice, bob] = await ethers.getSigners();
  const quote = await ethers.deployContract("TestQuote", [deployer.address, 10_000_000n * WAD]);
  const factory = await ethers.deployContract("TestV2Factory");
  const router = await ethers.deployContract(routerName, [await factory.getAddress()]);
  const candidate = await ethers.deployContract("TestOnlyOptionDGraduation", [await router.getAddress()]);
  await (await quote.transfer(alice.address, 2_000_000n * WAD)).wait();
  await (await quote.transfer(bob.address, 2_000_000n * WAD)).wait();
  return { deployer, alice, bob, quote, factory, router, candidate };
}

async function createMarket(env: Awaited<ReturnType<typeof deployed>>, buyer = env.alice, feeBps = 100) {
  const firstBuy = WAD;
  await (await env.quote.connect(buyer).approve(await env.candidate.getAddress(), firstBuy)).wait();
  const tx = await env.candidate.connect(buyer).createMarket(
    "Option D local market",
    "ODL",
    "local://option-d",
    await env.quote.getAddress(),
    WAD,
    feeBps,
    firstBuy,
    0,
    await deadline(),
  );
  const receipt = await tx.wait();
  const log = receipt!.logs
    .map((entry: any) => {
      try { return env.candidate.interface.parseLog(entry); } catch { return null; }
    })
    .find((entry: any) => entry?.name === "MarketCreated");
  if (!log) throw new Error("MarketCreated missing");
  return { tokenAddress: log.args.token as string, token: await ethers.getContractAt("MarketToken", log.args.token) };
}

async function complete(env: Awaited<ReturnType<typeof deployed>>, tokenAddress: string) {
  const gross = 1_000_000n * WAD;
  const quoted = await env.candidate.quoteBuy(tokenAddress, gross);
  await (await env.quote.connect(env.alice).approve(await env.candidate.getAddress(), gross)).wait();
  await (await env.candidate.connect(env.alice).buy(tokenAddress, gross, quoted[0], await deadline())).wait();
  return quoted;
}

async function passRedemptionTimeout() {
  await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await ethers.provider.send("evm_mine", []);
}

describe("TestOnlyOptionDGraduation (local-only candidate)", function () {
  it("keeps deployed candidate runtime bytecode below the EIP-170 limit", async function () {
    const env = await deployed();
    const runtimeBytecode = await ethers.provider.getCode(await env.candidate.getAddress());
    expect((runtimeBytecode.length - 2) / 2).to.be.lessThan(24_576);
  });

  it("uses Option D's 80k/800m/200m math, exact-minimal completion, and burns LP", async function () {
    const env = await deployed();
    const { tokenAddress } = await createMarket(env);
    const before = await env.candidate.marketOf(tokenAddress);
    const quote = await env.candidate.quoteBuy(tokenAddress, 1_000_000n * WAD);
    const requiredNet = ceilDiv(before.curveTokensLeft * before.virtualQuote, before.virtualToken - before.curveTokensLeft);
    const minimumGross = ((requiredNet - 1n) * BPS) / (BPS - before.feeBps) + 1n;
    expect(quote[0]).to.equal(before.curveTokensLeft);
    expect(quote[1]).to.equal(minimumGross);
    expect(quote[1] - (quote[1] * before.feeBps) / BPS).to.be.gte(requiredNet);
    expect((quote[1] - 1n) - ((quote[1] - 1n) * before.feeBps) / BPS).to.be.lt(requiredNet);

    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    expect(pending.curveComplete).to.equal(true);
    expect(pending.graduated).to.equal(false);
    const terminalSpot = (pending.virtualQuote * WAD) / pending.virtualToken;
    const lpSpot = (pending.quoteRaised * WAD) / RESERVE;
    // Option D's sqrt(16)=4 makes the all-proceeds/200M opening continuous,
    // subject only to integer dust from the actual executed curve path.
    expect(terminalSpot > lpSpot ? terminalSpot - lpSpot : lpSpot - terminalSpot).to.be.lt(10n);

    await (await env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline())).wait();
    const pairAddress = await env.factory.getPair(tokenAddress, await env.quote.getAddress());
    const pair = await ethers.getContractAt("TestV2Pair", pairAddress);
    expect(await pair.balanceOf("0x000000000000000000000000000000000000dEaD")).to.be.gt(0n);
    expect(await env.quote.balanceOf(await env.candidate.getAddress()))
      .to.equal(pending.holderFees + pending.buybackFees + pending.treasuryFees);
    expect(await env.candidate.quoteLiability(await env.quote.getAddress()))
      .to.equal(pending.holderFees + pending.buybackFees + pending.treasuryFees);
    expect((await env.candidate.marketOf(tokenAddress)).graduated).to.equal(true);
  });

  it("rejects an existing/donated pair and leaves the market pending rather than bypassing it", async function () {
    const env = await deployed();
    const { tokenAddress, token } = await createMarket(env);
    await (await env.factory.createPair(tokenAddress, await env.quote.getAddress())).wait();
    const pairAddress = await env.factory.getPair(tokenAddress, await env.quote.getAddress());
    // A dust donation makes the griefing condition observable. The candidate
    // rejects even an empty existing pair; it never forces a new initial price.
    await (await token.connect(env.alice).transfer(pairAddress, 1n)).wait();
    await (await (await ethers.getContractAt("TestV2Pair", pairAddress)).sync()).wait();
    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    await expect(env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "ExistingOrDonatedPair");
    expect((await env.candidate.marketOf(tokenAddress)).graduated).to.equal(false);
    expect(await env.candidate.quoteLiability(await env.quote.getAddress()))
      .to.equal(pending.quoteRaised + pending.holderFees + pending.buybackFees + pending.treasuryFees);

    await passRedemptionTimeout();
    await (await env.candidate.connect(env.bob).activateRedemption(tokenAddress)).wait();
    const active = await env.candidate.marketOf(tokenAddress);
    expect(active.redemptionActive).to.equal(true);
    // The poisoned one-wei token share remains in the pair. It cannot be swept
    // by an administrator or used to bypass the pair validation.
    const aliceTokens = await token.balanceOf(env.alice.address);
    await (await token.connect(env.alice).approve(await env.candidate.getAddress(), aliceTokens)).wait();
    await (await env.candidate.connect(env.alice).redeem(tokenAddress, aliceTokens, 0, await deadline())).wait();
    const after = await env.candidate.marketOf(tokenAddress);
    expect(after.remainingClaims).to.equal(1n);
    expect(await token.balanceOf(pairAddress)).to.equal(1n);
    expect(after.remainingQuote).to.be.gt(0n);
  });

  it("reverts atomically against a router that lies about used liquidity amounts", async function () {
    const env = await deployed("LyingTestV2Router");
    const { tokenAddress } = await createMarket(env);
    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    const candidateBalance = await env.quote.balanceOf(await env.candidate.getAddress());
    await expect(env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "InvalidMinimum");
    expect(await env.factory.getPair(tokenAddress, await env.quote.getAddress())).to.equal(ethers.ZeroAddress);
    expect(await env.quote.balanceOf(await env.candidate.getAddress())).to.equal(candidateBalance);
  });

  it("rejects fee-on-transfer quote assets by observed balance deltas", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const quote = await ethers.deployContract("FeeOnTransferTestQuote", [deployer.address, 1_000_000n * WAD]);
    const factory = await ethers.deployContract("TestV2Factory");
    const router = await ethers.deployContract("TestV2Router", [await factory.getAddress()]);
    const candidate = await ethers.deployContract("TestOnlyOptionDGraduation", [await router.getAddress()]);
    await (await quote.transfer(alice.address, 100n * WAD)).wait();
    await (await quote.connect(alice).approve(await candidate.getAddress(), WAD)).wait();
    await expect(candidate.connect(alice).createMarket(
      "Taxed", "TAX", "local://taxed", await quote.getAddress(), WAD, 100, WAD, 0, await deadline(),
    )).to.be.revertedWithCustomError(candidate, "ExactTransferRequired");
  });

  it("maintains aggregate same-quote liabilities across markets under deterministic buy/sell fuzzing", async function () {
    const env = await deployed();
    const first = await createMarket(env, env.alice, 300);
    const second = await createMarket(env, env.bob, 100);
    const candidateAddress = await env.candidate.getAddress();

    for (let i = 1n; i <= 16n; i++) {
      const gross = (i * 17n + 3n) * WAD;
      const target = i % 2n === 0n ? first : second;
      const trader = i % 2n === 0n ? env.alice : env.bob;
      const quoted = await env.candidate.quoteBuy(target.tokenAddress, gross);
      await (await env.quote.connect(trader).approve(candidateAddress, gross)).wait();
      await (await env.candidate.connect(trader).buy(target.tokenAddress, gross, quoted[0], await deadline())).wait();
      if (i % 3n === 0n) {
        const owned = await target.token.balanceOf(trader.address);
        const sellAmount = owned / 7n;
        await (await target.token.connect(trader).approve(candidateAddress, sellAmount)).wait();
        await (await env.candidate.connect(trader).sell(target.tokenAddress, sellAmount, 0, await deadline())).wait();
      }
      const a = await env.candidate.marketOf(first.tokenAddress);
      const b = await env.candidate.marketOf(second.tokenAddress);
      const accounted = a.quoteRaised + a.holderFees + a.buybackFees + a.treasuryFees
        + b.quoteRaised + b.holderFees + b.buybackFees + b.treasuryFees;
      expect(await env.candidate.quoteLiability(await env.quote.getAddress())).to.equal(accounted);
      expect(await env.quote.balanceOf(candidateAddress)).to.equal(accounted);
    }
  });

  it("requires exact nonzero liquidity minimums and a short graduation deadline", async function () {
    const env = await deployed();
    const { tokenAddress } = await createMarket(env);
    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    await expect(env.candidate.graduate(tokenAddress, 0, pending.quoteRaised, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "InvalidMinimum");
    await expect(env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline(900)))
      .to.be.revertedWithCustomError(env.candidate, "GraduationDeadlineTooFar");
    // Reverts above make no custody/state change: a correctly bounded retry can
    // still graduate the same pending market exactly once.
    await (await env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline())).wait();
    expect((await env.candidate.marketOf(tokenAddress)).graduated).to.equal(true);
    await expect(env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "NotPendingGraduation");
  });

  it("has a permissionless irreversible timeout redemption that preserves fee isolation and final-claim dust", async function () {
    const env = await deployed();
    const { tokenAddress, token } = await createMarket(env);
    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    await expect(env.candidate.connect(env.bob).activateRedemption(tokenAddress))
      .to.be.revertedWithCustomError(env.candidate, "RedemptionNotAvailable");

    await passRedemptionTimeout();
    await (await env.candidate.connect(env.bob).activateRedemption(tokenAddress)).wait();
    const active = await env.candidate.marketOf(tokenAddress);
    expect(active.remainingClaims).to.equal(CURVE);
    expect(active.remainingQuote).to.equal(pending.quoteRaised);
    await expect(env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "NotPendingGraduation");

    const aliceTokens = await token.balanceOf(env.alice.address);
    // Split claims to exercise floor rounding and prove the final claim obtains
    // all residual quote rather than leaving a sweepable quote-dust balance.
    const firstClaim = aliceTokens / 3n;
    await (await token.connect(env.alice).approve(await env.candidate.getAddress(), aliceTokens)).wait();
    await (await env.candidate.connect(env.alice).redeem(tokenAddress, firstClaim, 0, await deadline())).wait();
    const middle = await env.candidate.marketOf(tokenAddress);
    expect(middle.remainingClaims).to.equal(CURVE - firstClaim);
    await (await env.candidate.connect(env.alice).redeem(tokenAddress, middle.remainingClaims, middle.remainingQuote, await deadline())).wait();
    const finalMarket = await env.candidate.marketOf(tokenAddress);
    expect(finalMarket.remainingClaims).to.equal(0n);
    expect(finalMarket.remainingQuote).to.equal(0n);
    expect(await env.quote.balanceOf(await env.candidate.getAddress()))
      .to.equal(pending.holderFees + pending.buybackFees + pending.treasuryFees);
    expect(await token.balanceOf(await env.candidate.getAddress())).to.equal(RESERVE + CURVE);
    await expect(env.candidate.connect(env.alice).redeem(tokenAddress, 1n, 0, await deadline()))
      .to.be.revertedWithCustomError(env.candidate, "InvalidAmount");
  });

  it("allows the normal graduation winner to settle before timeout, making redemption unavailable", async function () {
    const env = await deployed();
    const { tokenAddress } = await createMarket(env);
    await complete(env, tokenAddress);
    const pending = await env.candidate.marketOf(tokenAddress);
    await (await env.candidate.graduate(tokenAddress, RESERVE, pending.quoteRaised, await deadline())).wait();
    await passRedemptionTimeout();
    await expect(env.candidate.connect(env.bob).activateRedemption(tokenAddress))
      .to.be.revertedWithCustomError(env.candidate, "NotPendingGraduation");
  });
});