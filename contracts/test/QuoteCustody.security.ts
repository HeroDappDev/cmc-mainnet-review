import { expect } from "chai";
import { ethers } from "hardhat";

const WAD = 10n ** 18n;

type Environment = {
  owner: any;
  trader: any;
  secondTrader: any;
  treasury: any;
  buyback: any;
  feed: any;
  quote: any;
  launchpad: any;
  launchpadAddress: string;
};

async function deadline(seconds = 3600): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("missing local Hardhat block");
  return BigInt(block.timestamp) + BigInt(seconds);
}

function marketLiability(market: any): bigint {
  return market.quoteRaised + market.holderFees + market.buybackFees + market.treasuryFees;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

async function fixture(): Promise<Environment> {
  const [owner, trader, secondTrader, treasury, buyback] = await ethers.getSigners();
  const feed = await ethers.deployContract("PriceReferenceFeed", [owner.address]);
  const quote = await ethers.deployContract("SecurityQuote");
  const launchpad = await ethers.deployContract("Launchpad", [
    owner.address,
    await feed.getAddress(),
    treasury.address,
    buyback.address,
  ]);
  const quoteAddress = await quote.getAddress();
  const launchpadAddress = await launchpad.getAddress();
  await quote.setLaunchpad(launchpadAddress);
  await feed.configureAsset(quoteAddress, 6 * 60 * 60);
  await feed.pushReference(quoteAddress, WAD);
  await launchpad.setQuoteAllowed(quoteAddress, true);
  await quote.mint(trader.address, ethers.parseEther("2000000"));
  await quote.mint(secondTrader.address, ethers.parseEther("2000000"));
  return {
    owner,
    trader,
    secondTrader,
    treasury,
    buyback,
    feed,
    quote,
    launchpad,
    launchpadAddress,
  };
}

async function createMarket(env: Environment, feeBps = 100) {
  const firstBuy = ethers.parseEther("10");
  await env.quote.connect(env.trader).approve(env.launchpadAddress, firstBuy);
  await env.launchpad.connect(env.trader).createMarket(
    "Security market",
    "SEC",
    "local://security",
    await env.quote.getAddress(),
    feeBps,
    firstBuy,
    0,
    await deadline(),
  );
  const tokenAddress = await env.launchpad.allMarkets((await env.launchpad.marketCount()) - 1n);
  const token = await ethers.getContractAt("MarketToken", tokenAddress);
  return { tokenAddress, token };
}

describe("Launchpad quote custody security (local Hardhat only)", function () {
  it("uses the exact minimal final gross for 100, 200, and 300 bps fees", async function () {
    for (const feeBps of [100n, 200n, 300n]) {
      const env = await fixture();
      const { tokenAddress } = await createMarket(env, Number(feeBps));
      const market = await env.launchpad.marketOf(tokenAddress);
      const remaining = BigInt(market.curveTokensLeft);
      const requiredNet = ceilDiv(
        remaining * BigInt(market.virtualQuote),
        BigInt(market.virtualToken) - remaining,
      );
      const exactGross = ((requiredNet - 1n) * 10_000n) / (10_000n - feeBps) + 1n;
      const [exactOut, consumed, fee, refund] = await env.launchpad.quoteBuy(tokenAddress, exactGross);
      expect(exactOut).to.equal(remaining);
      expect(consumed).to.equal(exactGross);
      expect(fee).to.equal((exactGross * feeBps) / 10_000n);
      expect(refund).to.equal(0n);

      const [shortOut] = await env.launchpad.quoteBuy(tokenAddress, exactGross - 1n);
      expect(shortOut).to.be.lt(remaining);

      await env.quote.connect(env.trader).approve(env.launchpadAddress, exactGross);
      await env.launchpad.connect(env.trader).buy(
        tokenAddress,
        exactGross,
        remaining,
        await deadline(),
      );
      expect((await env.launchpad.marketOf(tokenAddress)).curveComplete).to.equal(true);
    }
  });

  it("rejects inbound fee and sender-surcharge tokens without changing market state", async function () {
    for (const mode of [1, 3]) {
      const env = await fixture();
      const { tokenAddress } = await createMarket(env);
      const before = await env.launchpad.marketOf(tokenAddress);
      const quoteBefore = await env.quote.balanceOf(env.launchpadAddress);
      const amount = WAD;
      await env.quote.setMode(mode);
      await env.quote.connect(env.trader).approve(env.launchpadAddress, amount);

      await expect(
        env.launchpad.connect(env.trader).buy(tokenAddress, amount, 0, await deadline()),
      ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");

      const after = await env.launchpad.marketOf(tokenAddress);
      expect(after.virtualToken).to.equal(before.virtualToken);
      expect(after.virtualQuote).to.equal(before.virtualQuote);
      expect(after.quoteRaised).to.equal(before.quoteRaised);
      expect(await env.quote.balanceOf(env.launchpadAddress)).to.equal(quoteBefore);
    }
  });

  it("rejects outbound taxes on sells, refunds, and holder/protocol payouts", async function () {
    {
      const env = await fixture();
      const { tokenAddress, token } = await createMarket(env);
      const tokenIn = (await token.balanceOf(env.trader.address)) / 10n;
      const [, , userOut] = await env.launchpad.quoteSell(tokenAddress, tokenIn);
      await token.connect(env.trader).approve(env.launchpadAddress, tokenIn);
      await env.quote.setMode(2);
      await expect(
        env.launchpad.connect(env.trader).sell(tokenAddress, tokenIn, userOut, await deadline()),
      ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");
    }

    {
      const env = await fixture();
      const { tokenAddress } = await createMarket(env);
      const oversized = ethers.parseEther("1000000");
      const [, , , refund] = await env.launchpad.quoteBuy(tokenAddress, oversized);
      expect(refund).to.be.gt(0n);
      await env.quote.connect(env.trader).approve(env.launchpadAddress, oversized);
      await env.quote.setMode(2);
      await expect(
        env.launchpad.connect(env.trader).buy(tokenAddress, oversized, 0, await deadline()),
      ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");
    }

    {
      const env = await fixture();
      const { tokenAddress } = await createMarket(env);
      const market = await env.launchpad.marketOf(tokenAddress);
      await env.quote.setMode(2);
      await expect(
        env.launchpad.distributeHolderFees(
          tokenAddress,
          [env.secondTrader.address],
          [market.holderFees],
        ),
      ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");
      await expect(env.launchpad.releaseProtocolFees(tokenAddress))
        .to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");
    }
  });

  it("does not let a short inbound transfer in one market use another market's custody", async function () {
    const env = await fixture();
    const first = await createMarket(env);
    const second = await createMarket(env);
    const beforeFirst = await env.launchpad.marketOf(first.tokenAddress);
    const beforeSecond = await env.launchpad.marketOf(second.tokenAddress);
    const custodyBefore = await env.quote.balanceOf(env.launchpadAddress);
    await env.quote.setMode(1);
    await env.quote.connect(env.trader).approve(env.launchpadAddress, WAD);

    await expect(
      env.launchpad.connect(env.trader).buy(first.tokenAddress, WAD, 0, await deadline()),
    ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");

    const afterFirst = await env.launchpad.marketOf(first.tokenAddress);
    const afterSecond = await env.launchpad.marketOf(second.tokenAddress);
    expect(afterFirst.quoteRaised).to.equal(beforeFirst.quoteRaised);
    expect(afterSecond.quoteRaised).to.equal(beforeSecond.quoteRaised);
    expect(await env.quote.balanceOf(env.launchpadAddress)).to.equal(custodyBefore);
    expect(marketLiability(afterFirst) + marketLiability(afterSecond)).to.equal(custodyBefore);
  });

  it("rejects rebase loss during a transfer and before the next operation", async function () {
    const env = await fixture();
    const { tokenAddress } = await createMarket(env);
    await env.quote.setMode(4);
    await env.quote.connect(env.trader).approve(env.launchpadAddress, WAD);
    await expect(
      env.launchpad.connect(env.trader).buy(tokenAddress, WAD, 0, await deadline()),
    ).to.be.revertedWithCustomError(env.launchpad, "QuoteTransferMismatch");

    await env.quote.setMode(0);
    await env.quote.rebase(env.launchpadAddress, 1n);
    await expect(
      env.launchpad.connect(env.trader).buy(tokenAddress, WAD, 0, await deadline()),
    ).to.be.revertedWithCustomError(env.launchpad, "QuoteCustodyShortfall");
  });

  it("rejects quote-token callback reentrancy atomically", async function () {
    const env = await fixture();
    const { tokenAddress } = await createMarket(env);
    const callbackData = env.launchpad.interface.encodeFunctionData("buy", [
      tokenAddress,
      WAD,
      0,
      await deadline(),
    ]);
    await env.quote.setCallback(env.launchpadAddress, callbackData);
    await env.quote.setMode(5);
    await env.quote.connect(env.trader).approve(env.launchpadAddress, WAD);
    const before = await env.launchpad.marketOf(tokenAddress);
    const balanceBefore = await env.quote.balanceOf(env.launchpadAddress);

    await expect(
      env.launchpad.connect(env.trader).buy(tokenAddress, WAD, 0, await deadline()),
    ).to.be.reverted;

    const after = await env.launchpad.marketOf(tokenAddress);
    expect(after.quoteRaised).to.equal(before.quoteRaised);
    expect(await env.quote.balanceOf(env.launchpadAddress)).to.equal(balanceBefore);
  });

  it("accepts ordinary buy, sell, refund, and fee payouts with exact deltas", async function () {
    const env = await fixture();
    const { tokenAddress, token } = await createMarket(env, 200);

    const buyAmount = WAD;
    const [buyOut] = await env.launchpad.quoteBuy(tokenAddress, buyAmount);
    await env.quote.connect(env.trader).approve(env.launchpadAddress, buyAmount);
    await expect(
      env.launchpad.connect(env.trader).buy(tokenAddress, buyAmount, buyOut, await deadline()),
    ).to.emit(env.launchpad, "Trade");

    const tokenIn = (await token.balanceOf(env.trader.address)) / 20n;
    const [, , sellOut] = await env.launchpad.quoteSell(tokenAddress, tokenIn);
    await token.connect(env.trader).approve(env.launchpadAddress, tokenIn);
    await expect(
      env.launchpad.connect(env.trader).sell(tokenAddress, tokenIn, sellOut, await deadline()),
    ).to.emit(env.launchpad, "Trade");

    const oversized = ethers.parseEther("1000000");
    const [completionOut, , , refund] = await env.launchpad.quoteBuy(tokenAddress, oversized);
    expect(completionOut).to.be.gt(0n);
    expect(refund).to.be.gt(0n);
    await env.quote.connect(env.trader).approve(env.launchpadAddress, oversized);
    await expect(
      env.launchpad.connect(env.trader).buy(tokenAddress, oversized, completionOut, await deadline()),
    ).to.emit(env.launchpad, "Trade");

    const completed = await env.launchpad.marketOf(tokenAddress);
    expect(completed.curveComplete).to.equal(true);
    await env.launchpad.distributeHolderFees(
      tokenAddress,
      [env.secondTrader.address],
      [completed.holderFees],
    );
    await env.launchpad.releaseProtocolFees(tokenAddress);
    const released = await env.launchpad.marketOf(tokenAddress);
    expect(released.holderFees).to.equal(0n);
    expect(released.buybackFees).to.equal(0n);
    expect(released.treasuryFees).to.equal(0n);
  });

  it("keeps a self-recipient payout as custody rather than erasing its liability", async function () {
    const env = await fixture();
    const { tokenAddress } = await createMarket(env);
    await env.launchpad.setRecipients(env.launchpadAddress, env.launchpadAddress);
    const before = await env.launchpad.marketOf(tokenAddress);
    await expect(env.launchpad.releaseProtocolFees(tokenAddress))
      .to.emit(env.launchpad, "ProtocolFeesReleased").withArgs(tokenAddress, 0, 0);
    const afterRelease = await env.launchpad.marketOf(tokenAddress);
    expect(afterRelease.buybackFees).to.equal(before.buybackFees);
    expect(afterRelease.treasuryFees).to.equal(before.treasuryFees);

    await env.launchpad.distributeHolderFees(
      tokenAddress,
      [env.launchpadAddress],
      [before.holderFees],
    );
    const afterHolder = await env.launchpad.marketOf(tokenAddress);
    expect(afterHolder.holderFees).to.equal(before.holderFees);

    // Restoring an external destination releases retained budgets once only.
    await env.launchpad.setRecipients(env.secondTrader.address, env.secondTrader.address);
    const recipientBefore = await env.quote.balanceOf(env.secondTrader.address);
    await expect(env.launchpad.releaseProtocolFees(tokenAddress))
      .to.emit(env.launchpad, "ProtocolFeesReleased")
      .withArgs(tokenAddress, before.buybackFees, before.treasuryFees);
    expect(await env.quote.balanceOf(env.secondTrader.address))
      .to.equal(recipientBefore + before.buybackFees + before.treasuryFees);
    await expect(env.launchpad.releaseProtocolFees(tokenAddress))
      .to.emit(env.launchpad, "ProtocolFeesReleased").withArgs(tokenAddress, 0, 0);
  });
});