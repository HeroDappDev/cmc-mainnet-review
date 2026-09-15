import { ethers } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";

const BSC_TESTNET_CHAIN_ID = 97n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await deployer.provider!.getNetwork();

  // This must remain a hard gate. Do not replace with a warning.
  if (network.chainId === 56n) {
    throw new Error(
      "REFUSED: BSC mainnet deployment is disabled pending an explicit audited-release change.",
    );
  }
  if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(`REFUSED: this bounded deployment script supports BSC testnet (97) only, got ${network.chainId}.`);
  }

  const feed = await ethers.deployContract("PriceReferenceFeed", [deployer.address]);
  await feed.waitForDeployment();

  const quote = await ethers.deployContract("MockQuote", [
    deployer.address,
    ethers.parseEther("1000000000"),
  ]);
  await quote.waitForDeployment();

  const launchpad = await ethers.deployContract("Launchpad", [
    deployer.address,
    await feed.getAddress(),
    deployer.address,
    deployer.address,
  ]);
  await launchpad.waitForDeployment();

  const cmc = await ethers.deployContract("CMCToken", [deployer.address]);
  await cmc.waitForDeployment();

  const quoteAddress = await quote.getAddress();
  await (await feed.configureAsset(quoteAddress, 6 * 60 * 60)).wait();
  // Deliberate testnet-only fixture: tQUOTE is assigned a reference of $1.
  // It is not a mainnet peg claim or an external oracle observation.
  await (await feed.pushReference(quoteAddress, ethers.parseEther("1"))).wait();
  await (await launchpad.setQuoteAllowed(quoteAddress, true)).wait();

  const deployment = {
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      cmc: await cmc.getAddress(),
      priceReferenceFeed: await feed.getAddress(),
      testnetMockQuote: quoteAddress,
      launchpad: await launchpad.getAddress(),
    },
    warnings: [
      "Testnet-only deployment; MockQuote has no peg.",
      "PancakeSwap V2 migration is intentionally disabled.",
      "Do not use on BSC mainnet.",
    ],
  };

  mkdirSync("deployments", { recursive: true });
  writeFileSync("deployments/bscTestnet.json", `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});