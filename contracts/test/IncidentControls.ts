import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Local-only characterization, not a testnet rehearsal or independent audit.
describe("Incident controls — current foundation limitations", function () {
  async function fixture() {
    const [owner, nextOwner, trader, outsider] = await ethers.getSigners();
    const feed = await ethers.deployContract("PriceReferenceFeed", [owner.address]);
    // Same ordinary 18-decimal local fixture as economics tests; MockQuote
    // deliberately refuses Hardhat chain 31337. Do not weaken that chain gate.
    const quote = await ethers.deployContract("CMCToken", [owner.address]);
    const launchpad = await ethers.deployContract("Launchpad", [
      owner.address, await feed.getAddress(), owner.address, owner.address,
    ]);
    const quoteAddress = await quote.getAddress();
    const launchpadAddress = await launchpad.getAddress();
    await feed.configureAsset(quoteAddress, 60);
    await feed.pushReference(quoteAddress, ethers.parseEther("1"));
    await launchpad.setQuoteAllowed(quoteAddress, true);
    await quote.transfer(trader.address, ethers.parseEther("1000"));
    await quote.connect(trader).approve(launchpadAddress, ethers.parseEther("1000"));
    const create = async () => launchpad.connect(trader).createMarket(
      "Incident fixture", "TEST", "", quoteAddress, 100,
      ethers.parseEther("10"), 1, (await time.latest()) + 600,
    );
    await create();
    const tokenAddress = await launchpad.allMarkets(0);
    const token = await ethers.getContractAt("MarketToken", tokenAddress);
    return { owner, nextOwner, trader, outsider, feed, quoteAddress, launchpad, launchpadAddress, create, token, tokenAddress };
  }

  it("owner can stop creation for a quote without stopping existing buys or sells", async function () {
    const e = await fixture();
    await expect(e.launchpad.connect(e.outsider).setQuoteAllowed(e.quoteAddress, false))
      .to.be.revertedWithCustomError(e.launchpad, "OwnableUnauthorizedAccount");
    await expect(e.launchpad.setQuoteAllowed(e.quoteAddress, false))
      .to.emit(e.launchpad, "QuoteAllowlistSet").withArgs(e.quoteAddress, false);
    await expect(e.create()).to.be.revertedWithCustomError(e.launchpad, "QuoteNotAllowed");
    await expect(e.launchpad.connect(e.trader).buy(
      e.tokenAddress, ethers.parseEther("1"), 1, (await time.latest()) + 600,
    )).to.emit(e.launchpad, "Trade");
    const amount = (await e.token.balanceOf(e.trader.address)) / 10n;
    await e.token.connect(e.trader).approve(e.launchpadAddress, amount);
    await expect(e.launchpad.connect(e.trader).sell(
      e.tokenAddress, amount, 1, (await time.latest()) + 600,
    )).to.emit(e.launchpad, "Trade");
  });

  it("source outage blocks new creation but does not halt frozen-reference trading", async function () {
    const e = await fixture();
    await time.increase(61);
    await expect(e.create()).to.be.revertedWithCustomError(e.feed, "StaleReference");
    await expect(e.launchpad.connect(e.trader).buy(
      e.tokenAddress, ethers.parseEther("1"), 1, (await time.latest()) + 600,
    )).to.emit(e.launchpad, "Trade");
    await e.feed.pushReference(e.quoteAddress, ethers.parseEther("1"));
    await expect(e.create()).to.emit(e.launchpad, "MarketCreated");
  });

  it("ownership handover requires acceptance and atomically revokes the outgoing owner as keeper", async function () {
    const e = await fixture();
    await e.feed.transferOwnership(e.nextOwner.address);
    expect(await e.feed.owner()).to.equal(e.owner.address);
    expect(await e.feed.pendingOwner()).to.equal(e.nextOwner.address);
    expect(await e.feed.keepers(e.owner.address)).to.equal(true);
    await expect(e.feed.connect(e.outsider).acceptOwnership())
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
    await expect(e.feed.connect(e.nextOwner).setKeeper(e.outsider.address, true))
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
    await expect(e.feed.pushReference(e.quoteAddress, ethers.parseEther("2")))
      .to.emit(e.feed, "ReferencePushed");
    await expect(e.feed.connect(e.nextOwner).acceptOwnership())
      .to.emit(e.feed, "KeeperSet").withArgs(e.owner.address, false);
    expect(await e.feed.owner()).to.equal(e.nextOwner.address);
    expect(await e.feed.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await e.feed.keepers(e.owner.address)).to.equal(false);
    expect(await e.feed.keepers(e.nextOwner.address)).to.equal(false);
    await expect(e.feed.pushReference(e.quoteAddress, ethers.parseEther("3")))
      .to.be.revertedWithCustomError(e.feed, "NotKeeper");
    await expect(e.feed.setKeeper(e.owner.address, true))
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
    await e.feed.connect(e.nextOwner).setKeeper(e.nextOwner.address, true);
    await expect(e.feed.connect(e.nextOwner).pushReference(e.quoteAddress, ethers.parseEther("1")))
      .to.emit(e.feed, "ReferencePushed");
  });

  it("cancelled or replaced handovers grant no authority and preserve unrelated keepers", async function () {
    const e = await fixture();
    await e.feed.setKeeper(e.trader.address, true);
    await e.feed.transferOwnership(e.nextOwner.address);
    await e.feed.transferOwnership(ethers.ZeroAddress);
    await expect(e.feed.connect(e.nextOwner).acceptOwnership())
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
    expect(await e.feed.owner()).to.equal(e.owner.address);
    expect(await e.feed.keepers(e.owner.address)).to.equal(true);
    await e.feed.transferOwnership(e.nextOwner.address);
    await e.feed.transferOwnership(e.outsider.address);
    await expect(e.feed.connect(e.nextOwner).acceptOwnership())
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
    await e.feed.connect(e.outsider).acceptOwnership();
    expect(await e.feed.keepers(e.owner.address)).to.equal(false);
    expect(await e.feed.keepers(e.trader.address)).to.equal(true);
    await e.feed.connect(e.outsider).setKeeper(e.trader.address, false);
    await expect(e.feed.connect(e.trader).pushReference(e.quoteAddress, 1))
      .to.be.revertedWithCustomError(e.feed, "NotKeeper");
  });

  it("renouncing ownership clears a pending handover and the outgoing owner's keeper role", async function () {
    const e = await fixture();
    await e.feed.transferOwnership(e.nextOwner.address);
    await e.feed.renounceOwnership();
    expect(await e.feed.owner()).to.equal(ethers.ZeroAddress);
    expect(await e.feed.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await e.feed.keepers(e.owner.address)).to.equal(false);
    await expect(e.feed.pushReference(e.quoteAddress, 1))
      .to.be.revertedWithCustomError(e.feed, "NotKeeper");
    await expect(e.feed.connect(e.nextOwner).acceptOwnership())
      .to.be.revertedWithCustomError(e.feed, "OwnableUnauthorizedAccount");
  });

  it("no caller can enable migration through the existing entry point", async function () {
    const e = await fixture();
    for (const signer of [e.owner, e.trader, e.outsider]) {
      await expect(e.launchpad.connect(signer).migrateToPancakeV2(e.tokenAddress))
        .to.be.revertedWithCustomError(e.launchpad, "MigrationDisabledPendingDesign");
    }
  });
});