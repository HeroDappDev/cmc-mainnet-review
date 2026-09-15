import { expect } from "chai";
import { ethers } from "hardhat";

const WAD = 10n ** 18n;
const BPS = 10_000n;
const HOLDER_BPS = 4_000n;
const BUYBACK_BPS = 3_000n;
const TOTAL_SUPPLY = 1_000_000_000n * WAD;
const CURVE_SUPPLY = 800_000_000n * WAD;
const RESERVE_SUPPLY = 200_000_000n * WAD;
const OPEN_MCAP_USD = 5_000n * WAD;
const TERMINAL_MCAP_USD = 35_000n * WAD;

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("square root of a negative number");
  if (value < 2n) return value;

  let low = 1n;
  let high = value;
  while (low <= high) {
    const mid = (low + high) / 2n;
    const square = mid * mid;
    if (square === value) return mid;
    if (square < value) low = mid + 1n;
    else high = mid - 1n;
  }
  return high;
}

/**
 * This is deliberately independent of Launchpad.sol. It is a proposal
 * calculator for graduation review, not an implementation or a deployment
 * helper. It keeps all values in raw 18-decimal token/quote units.
 */
function proposedCurveMath(terminalRatio: bigint, curveSupply = CURVE_SUPPLY) {
  const sqrtRatio = integerSqrt(terminalRatio * WAD);
  const virtualToken = ceilDiv(curveSupply * sqrtRatio, sqrtRatio - WAD);
  const initialQuote = (virtualToken * OPEN_MCAP_USD) / TOTAL_SUPPLY;
  const virtualQuote = initialQuote; // proposed quote is $1, represented in WAD
  const terminalVirtualToken = virtualToken - curveSupply;
  const allCurveProceeds = ceilDiv(curveSupply * virtualQuote, terminalVirtualToken);
  const terminalVirtualQuote = virtualQuote + allCurveProceeds;
  const terminalSpot = (terminalVirtualQuote * WAD) / terminalVirtualToken;
  return {
    sqrtRatio,
    virtualToken,
    virtualQuote,
    allCurveProceeds,
    terminalVirtualToken,
    terminalVirtualQuote,
    terminalSpot,
  };
}

function feeBuckets(fee: bigint) {
  const holder = (fee * HOLDER_BPS) / BPS;
  const buyback = (fee * BUYBACK_BPS) / BPS;
  return { holder, buyback, treasury: fee - holder - buyback };
}

type LocalContracts = {
  owner: any;
  trader: any;
  secondTrader: any;
  treasury: any;
  buyback: any;
  feed: any;
  quote: any;
  launchpad: any;
};

async function localContracts(): Promise<LocalContracts> {
  const [owner, trader, secondTrader, treasury, buyback] = await ethers.getSigners();
  const feed = await ethers.deployContract("PriceReferenceFeed", [owner.address]);
  const quote = await ethers.deployContract("CMCToken", [owner.address]);
  const launchpad = await ethers.deployContract("Launchpad", [
    owner.address,
    await feed.getAddress(),
    treasury.address,
    buyback.address,
  ]);

  const quoteAddress = await quote.getAddress();
  await (await feed.configureAsset(quoteAddress, 6 * 60 * 60)).wait();
  await (await feed.pushReference(quoteAddress, WAD)).wait();
  await (await launchpad.setQuoteAllowed(quoteAddress, true)).wait();

  // CMCToken is an 18-decimal local quote fixture. MockQuote intentionally
  // refuses Hardhat's chain and is therefore never treated as a production
  // quote or as a stablecoin in these tests.
  await (await quote.transfer(trader.address, ethers.parseEther("2000000"))).wait();
  await (await quote.transfer(secondTrader.address, ethers.parseEther("2000000"))).wait();

  return { owner, trader, secondTrader, treasury, buyback, feed, quote, launchpad };
}

async function deadline(seconds = 3600): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("missing local Hardhat block");
  return BigInt(block.timestamp) + BigInt(seconds);
}

async function createLocalMarket(
  env: LocalContracts,
  trader = env.trader,
  feeBps = 100,
  firstBuyGross = WAD,
) {
  await (
    await env.quote.connect(trader).approve(await env.launchpad.getAddress(), firstBuyGross)
  ).wait();
  await (
    await env.launchpad.connect(trader).createMarket(
      "Local economic test",
      "LET",
      "local://economic-test",
      await env.quote.getAddress(),
      feeBps,
      firstBuyGross,
      0,
      await deadline(),
    )
  ).wait();
  const tokenAddress = await env.launchpad.allMarkets(0);
  const token = await ethers.getContractAt("MarketToken", tokenAddress);
  return { tokenAddress, token };
}

describe("Launchpad economic tests (local Hardhat only)", function () {
  describe("current deployed-source curve", function () {
    it("uses a fresh allowlisted 18-decimal reference and freezes it per market", async function () {
      const env = await localContracts();
      const quoteAddress = await env.quote.getAddress();

      const [expectedToken, expectedQuote] = await env.launchpad.initialVirtualReserves(quoteAddress);
      expect(expectedToken).to.be.gt(CURVE_SUPPLY);
      expect(expectedQuote).to.be.gt(0n);

      const { tokenAddress } = await createLocalMarket(env);
      const before = await env.launchpad.marketOf(tokenAddress);
      expect(before.frozenQuoteUsd).to.equal(WAD);

      await (await env.feed.pushReference(quoteAddress, 2n * WAD)).wait();
      const [newToken, newQuote] = await env.launchpad.initialVirtualReserves(quoteAddress);
      expect(newToken).to.equal(expectedToken);
      expect(newQuote).to.equal(expectedQuote / 2n);

      const after = await env.launchpad.marketOf(tokenAddress);
      expect(after.frozenQuoteUsd).to.equal(WAD);
      // The first purchase changed the active reserves; neither reserve is
      // silently recomputed from a later keeper update.
      expect(after.virtualToken).to.be.lt(expectedToken);
      expect(after.virtualQuote).to.be.gt(expectedQuote);
    });

    it("enforces reference freshness, quote allowlisting, first-buy minimum, fee bounds, slippage, and deadlines", async function () {
      const env = await localContracts();
      const quoteAddress = await env.quote.getAddress();

      await expect(
        env.launchpad.connect(env.trader).createMarket(
          "Expired",
          "EXP",
          "local://expired",
          quoteAddress,
          100,
          WAD,
          0,
          0,
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "DeadlineExpired");

      await expect(
        env.launchpad.connect(env.trader).createMarket(
          "Too small",
          "SMALL",
          "local://small",
          quoteAddress,
          100,
          1n,
          0,
          await deadline(),
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "FirstBuyTooSmall");

      await expect(
        env.launchpad.connect(env.trader).createMarket(
          "Low fee",
          "LOW",
          "local://low",
          quoteAddress,
          99,
          WAD,
          0,
          await deadline(),
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "InvalidFee");
      await expect(
        env.launchpad.connect(env.trader).createMarket(
          "High fee",
          "HIGH",
          "local://high",
          quoteAddress,
          301,
          WAD,
          0,
          await deadline(),
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "InvalidFee");

      const unallowlisted = await ethers.deployContract("CMCToken", [env.owner.address]);
      await expect(
        env.launchpad.connect(env.trader).createMarket(
          "Not allowed",
          "NO",
          "local://not-allowed",
          await unallowlisted.getAddress(),
          100,
          WAD,
          0,
          await deadline(),
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "QuoteNotAllowed");

      const { tokenAddress } = await createLocalMarket(env);
      const [quotedTokenOut] = await env.launchpad.quoteBuy(tokenAddress, 123_456_789n);
      await (await env.quote.connect(env.trader).approve(await env.launchpad.getAddress(), 123_456_789n)).wait();
      await expect(
        env.launchpad.connect(env.trader).buy(
          tokenAddress,
          123_456_789n,
          quotedTokenOut + 1n,
          await deadline(),
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "InvalidMinOut");

      await (await env.feed.configureAsset(quoteAddress, 60)).wait();
      await (await env.feed.pushReference(quoteAddress, WAD)).wait();
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);
      await expect(env.launchpad.initialVirtualReserves(quoteAddress))
        .to.be.revertedWithCustomError(env.feed, "StaleReference");
    });

    it("matches quoteBuy/quoteSell rounding and accounts every charged fee wei", async function () {
      const env = await localContracts();
      const { tokenAddress, token } = await createLocalMarket(env, env.trader, 300, WAD);
      const launchpadAddress = await env.launchpad.getAddress();
      const traderAddress = env.trader.address;
      const marketBefore = await env.launchpad.marketOf(tokenAddress);
      const grossBuy = 12_345_678_901_234_567_891n;
      const feeBefore = marketBefore.holderFees + marketBefore.buybackFees + marketBefore.treasuryFees;
      const [tokenOut, grossConsumed, fee, refund] = await env.launchpad.quoteBuy(tokenAddress, grossBuy);

      const expectedFee = (grossBuy * 300n) / BPS;
      const netBuy = grossBuy - expectedFee;
      const expectedTokenOut = (netBuy * marketBefore.virtualToken) / (marketBefore.virtualQuote + netBuy);
      expect(tokenOut).to.equal(expectedTokenOut);
      expect(grossConsumed).to.equal(grossBuy);
      expect(fee).to.equal(expectedFee);
      expect(refund).to.equal(0n);

      await (await env.quote.connect(env.trader).approve(launchpadAddress, grossBuy)).wait();
      await (
        await env.launchpad.connect(env.trader).buy(tokenAddress, grossBuy, tokenOut, await deadline())
      ).wait();
      const marketAfterBuy = await env.launchpad.marketOf(tokenAddress);
      const expectedBuyBuckets = feeBuckets(fee);
      expect(marketAfterBuy.holderFees - marketBefore.holderFees).to.equal(expectedBuyBuckets.holder);
      expect(marketAfterBuy.buybackFees - marketBefore.buybackFees).to.equal(expectedBuyBuckets.buyback);
      expect(marketAfterBuy.treasuryFees - marketBefore.treasuryFees).to.equal(expectedBuyBuckets.treasury);
      expect(
        (marketAfterBuy.holderFees - marketBefore.holderFees)
          + (marketAfterBuy.buybackFees - marketBefore.buybackFees)
          + (marketAfterBuy.treasuryFees - marketBefore.treasuryFees),
      ).to.equal(fee);
      expect(marketAfterBuy.quoteRaised - marketBefore.quoteRaised).to.equal(netBuy);
      expect(await token.balanceOf(traderAddress)).to.be.gte(tokenOut);

      const tokenIn = tokenOut / 3n;
      const [grossOut, sellFee, userOut] = await env.launchpad.quoteSell(tokenAddress, tokenIn);
      const expectedGrossOut = (tokenIn * marketAfterBuy.virtualQuote)
        / (marketAfterBuy.virtualToken + tokenIn);
      expect(grossOut).to.equal(expectedGrossOut);
      expect(sellFee).to.equal((grossOut * 300n) / BPS);
      expect(userOut).to.equal(grossOut - sellFee);

      await (await token.connect(env.trader).approve(launchpadAddress, tokenIn)).wait();
      await (
        await env.launchpad.connect(env.trader).sell(tokenAddress, tokenIn, userOut, await deadline())
      ).wait();
      const marketAfterSell = await env.launchpad.marketOf(tokenAddress);
      expect(marketAfterSell.quoteRaised).to.equal(marketAfterBuy.quoteRaised - grossOut);
      const expectedSellBuckets = feeBuckets(sellFee);
      expect(marketAfterSell.holderFees - marketAfterBuy.holderFees).to.equal(expectedSellBuckets.holder);
      expect(marketAfterSell.buybackFees - marketAfterBuy.buybackFees).to.equal(expectedSellBuckets.buyback);
      expect(marketAfterSell.treasuryFees - marketAfterBuy.treasuryFees).to.equal(expectedSellBuckets.treasury);

      const contractQuoteBalance = await env.quote.balanceOf(launchpadAddress);
      const accounted = marketAfterSell.quoteRaised
        + marketAfterSell.holderFees
        + marketAfterSell.buybackFees
        + marketAfterSell.treasuryFees;
      expect(contractQuoteBalance).to.equal(accounted);
      expect(marketAfterSell.holderFees + marketAfterSell.buybackFees + marketAfterSell.treasuryFees)
        .to.equal(feeBefore + fee + sellFee);
    });

    it("shows the completion refund, real proceeds, 200m LP discontinuity, and closed migration", async function () {
      const env = await localContracts();
      const { tokenAddress } = await createLocalMarket(env, env.trader, 100, WAD);
      const launchpadAddress = await env.launchpad.getAddress();
      const maximumGross = 1_000_000n * WAD;
      const [remaining, grossConsumed, completionFee, refund] =
        await env.launchpad.quoteBuy(tokenAddress, maximumGross);
      const before = await env.launchpad.marketOf(tokenAddress);
      const requiredNet = ceilDiv(
        BigInt(before.curveTokensLeft) * BigInt(before.virtualQuote),
        BigInt(before.virtualToken) - BigInt(before.curveTokensLeft),
      );
      const conservativeGross = ceilDiv(requiredNet * BPS, BPS - 100n);
      const exactMinimalGross = ((requiredNet - 1n) * BPS) / (BPS - 100n) + 1n;
      expect(remaining).to.equal(before.curveTokensLeft);
      expect(grossConsumed).to.be.lt(maximumGross);
      expect(completionFee).to.equal((grossConsumed * 100n) / BPS);
      expect(refund).to.equal(maximumGross - grossConsumed);
      expect(refund).to.be.gt(0n);
      // Execution now consumes the exact minimum under the floored fee.
      // Retain the old ceiling comparison as a regression for the saved wei.
      expect(grossConsumed).to.equal(exactMinimalGross);
      expect(conservativeGross - exactMinimalGross).to.equal(1n);

      await (await env.quote.connect(env.trader).approve(launchpadAddress, maximumGross)).wait();
      await (
        await env.launchpad.connect(env.trader).buy(tokenAddress, maximumGross, remaining, await deadline())
      ).wait();

      const completed = await env.launchpad.marketOf(tokenAddress);
      expect(completed.curveComplete).to.equal(true);
      expect(completed.curveTokensLeft).to.equal(0n);
      expect(completed.quoteRaised).to.equal(before.quoteRaised + grossConsumed - completionFee);

      const balance = await env.quote.balanceOf(launchpadAddress);
      const accounted = completed.quoteRaised
        + completed.holderFees
        + completed.buybackFees
        + completed.treasuryFees;
      expect(balance).to.equal(accounted);
      expect(balance).to.be.gt(completed.quoteRaised);

      // The source has a terminal virtual spot near $35,000 / 1bn tokens.
      // This is a quote-unit spot, not a USD oracle claim.
      const terminalSpot = (completed.virtualQuote * WAD) / completed.virtualToken;
      const expectedTerminalSpot = (TERMINAL_MCAP_USD * WAD) / TOTAL_SUPPLY;
      expect(abs(terminalSpot - expectedTerminalSpot)).to.be.lt(1_000_000n);

      // Seeding all curve proceeds into only the fixed 200m reserve inventory
      // opens V2 above the terminal curve spot. Including fee buckets is even
      // more discontinuous.
      const lpWithCurveProceeds = (completed.quoteRaised * WAD) / RESERVE_SUPPLY;
      const lpWithAllProceeds = (balance * WAD) / RESERVE_SUPPLY;
      expect(lpWithCurveProceeds).to.be.gt(terminalSpot);
      expect(lpWithAllProceeds).to.be.gt(lpWithCurveProceeds);
      const discontinuityRatio = (lpWithCurveProceeds * WAD) / terminalSpot;
      expect(discontinuityRatio).to.be.gt(1_500_000_000_000_000_000n);
      expect(discontinuityRatio).to.be.lt(1_530_000_000_000_000_000n);

      await expect(env.launchpad.migrateToPancakeV2(tokenAddress))
        .to.be.revertedWithCustomError(env.launchpad, "MigrationDisabledPendingDesign");
      await expect(
        env.launchpad.quoteBuy(tokenAddress, WAD),
      ).to.be.revertedWithCustomError(env.launchpad, "CurveClosed");
      await expect(
        env.launchpad.connect(env.trader).sell(tokenAddress, 1n, 0, await deadline()),
      ).to.be.revertedWithCustomError(env.launchpad, "CurveClosed");
    });

    it("keeps holder distribution and protocol fee release explicitly owner-controlled", async function () {
      const env = await localContracts();
      const { tokenAddress } = await createLocalMarket(env, env.trader, 300, WAD);
      const market = await env.launchpad.marketOf(tokenAddress);
      expect(market.holderFees).to.be.gt(0n);
      expect(market.buybackFees).to.be.gt(0n);
      expect(market.treasuryFees).to.be.gt(0n);

      const holderAmount = market.holderFees;
      const holderBefore = await env.quote.balanceOf(env.secondTrader.address);
      await expect(
        env.launchpad.connect(env.trader).distributeHolderFees(
          tokenAddress,
          [env.secondTrader.address],
          [holderAmount],
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "OwnableUnauthorizedAccount");
      await (
        await env.launchpad.distributeHolderFees(
          tokenAddress,
          [env.secondTrader.address],
          [holderAmount],
        )
      ).wait();
      expect(await env.quote.balanceOf(env.secondTrader.address)).to.equal(holderBefore + holderAmount);

      const buybackBefore = await env.quote.balanceOf(env.buyback.address);
      const treasuryBefore = await env.quote.balanceOf(env.treasury.address);
      await (await env.launchpad.releaseProtocolFees(tokenAddress)).wait();
      expect(await env.quote.balanceOf(env.buyback.address)).to.equal(buybackBefore + market.buybackFees);
      expect(await env.quote.balanceOf(env.treasury.address)).to.equal(treasuryBefore + market.treasuryFees);
      const after = await env.launchpad.marketOf(tokenAddress);
      expect(after.holderFees).to.equal(0n);
      expect(after.buybackFees).to.equal(0n);
      expect(after.treasuryFees).to.equal(0n);
    });
  });

  describe("independent proposed Pancake V2 graduation math", function () {
    it("quantifies the all-proceeds/200m discontinuity and a feasible excess-retention alternative", async function () {
      const proposal = proposedCurveMath(7n * WAD);
      // Option A in ECONOMIC_SPEC.md uses floor so the LP starts no higher
      // than the terminal curve spot; the at-most-one-wei gap is explicit.
      const quoteNumerator = RESERVE_SUPPLY * proposal.terminalVirtualQuote;
      const quoteFor200m = quoteNumerator / proposal.terminalVirtualToken;
      const excessRetained = proposal.allCurveProceeds - quoteFor200m;
      const lpSpotWithAllProceeds = (proposal.allCurveProceeds * WAD) / RESERVE_SUPPLY;

      expect(proposal.terminalSpot).to.be.gt(0n);
      expect(quoteFor200m).to.be.lt(proposal.allCurveProceeds);
      expect(excessRetained).to.be.gt(0n);
      expect(lpSpotWithAllProceeds).to.be.gt(proposal.terminalSpot);

      const ratio = (lpSpotWithAllProceeds * WAD) / proposal.terminalSpot;
      const expectedRatio = (4n * WAD * WAD) / proposal.sqrtRatio;
      expect(abs(ratio - expectedRatio)).to.be.lt(1_000_000n);
      expect(abs(proposal.allCurveProceeds - 10_583_005_244_258_364_000_000n))
        .to.be.lt(1_000_000_000n);
      expect(abs(quoteFor200m - 7_000n * WAD)).to.be.lt(1_000_000n);
      expect(quoteFor200m * proposal.terminalVirtualToken).to.be.lte(quoteNumerator);
      expect((quoteFor200m + 1n) * proposal.terminalVirtualToken).to.be.gt(quoteNumerator);

      // Proposed, feasible policy: seed only the quote needed for 200m at
      // terminal spot and retain/refund excess proceeds under an explicit,
      // separately governed destination. No existing Solidity path performs
      // this policy.
      const continuousLpSpot = (quoteFor200m * WAD) / RESERVE_SUPPLY;
      expect(continuousLpSpot).to.be.lte(proposal.terminalSpot);
      expect(proposal.terminalSpot - continuousLpSpot).to.be.lte(1n);
    });

    it("shows that using all current proceeds would need more than the fixed 200m token reserve", async function () {
      const proposal = proposedCurveMath(7n * WAD);
      const tokenReserveNeeded = ceilDiv(proposal.allCurveProceeds * WAD, proposal.terminalSpot);

      expect(tokenReserveNeeded).to.be.gt(RESERVE_SUPPLY);
      expect(tokenReserveNeeded).to.be.lt(TOTAL_SUPPLY);
      // This is an infeasibility result for the current fixed supply, not a
      // recommendation to mint or borrow extra market tokens.
    });

    it("provides two separately-labelled feasible constant changes for continuity", async function () {
      // Option D: preserve 800m curve allocation and 200m reserve, but
      // change the terminal/opening market-cap ratio from 7x to 16x. Then
      // R/Q = sqrt(16) and all proceeds match the 200m LP inventory.
      const ratio16 = proposedCurveMath(16n * WAD);
      const lpSpot16 = (ratio16.allCurveProceeds * WAD) / RESERVE_SUPPLY;
      expect(abs(lpSpot16 - ratio16.terminalSpot)).to.be.lt(10_000_000n);
      expect(TERMINAL_MCAP_USD * 16n / 7n).to.equal(80_000n * WAD);

      // Option C from ECONOMIC_SPEC.md: preserve the 7x target and 1bn
      // total supply, but revise allocations so C/L=sqrt(7). The remaining
      // supply stays as the LP allocation. The displayed proposal is
      // approximately 725,708,114.822568 / 274,291,885.177432 tokens.
      const sqrt7 = proposedCurveMath(7n * WAD).sqrtRatio;
      const reducedCurveSupply = (TOTAL_SUPPLY * sqrt7) / (sqrt7 + WAD);
      const ratio7ReducedCurve = proposedCurveMath(7n * WAD, reducedCurveSupply);
      const reducedLpSupply = TOTAL_SUPPLY - reducedCurveSupply;
      const lpSpotReduced = (ratio7ReducedCurve.allCurveProceeds * WAD) / reducedLpSupply;
      expect(reducedCurveSupply).to.be.lt(CURVE_SUPPLY);
      expect(reducedCurveSupply).to.be.lt(TOTAL_SUPPLY);
      expect(abs(reducedCurveSupply - 725_708_114_822_568_000_000_000_000n)).to.be.lte(1_000_000_000_000_000n);
      expect(abs(reducedLpSupply - 274_291_885_177_432_000_000_000_000n)).to.be.lte(1_000_000_000_000_000n);
      expect(abs(ratio7ReducedCurve.allCurveProceeds - 9_600_215_981_000_000_000_000n))
        .to.be.lt(1_000_000_000_000_000n);
      expect(abs(lpSpotReduced - ratio7ReducedCurve.terminalSpot)).to.be.lt(10_000_000n);
    });

    it("records the one-wei conservative completion case from the floored fee formula", async function () {
      const requiredNet = 100n;
      const conservativeGross = ceilDiv(requiredNet * BPS, BPS - 100n);
      const exactMinimalGross = ((requiredNet - 1n) * BPS) / (BPS - 100n) + 1n;
      expect(conservativeGross).to.equal(102n);
      expect(exactMinimalGross).to.equal(101n);
      expect(conservativeGross - exactMinimalGross).to.equal(1n);
    });
  });
});