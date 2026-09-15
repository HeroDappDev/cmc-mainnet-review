import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  SOLANA_BROWSER_WALLET_IDS,
  compatibilityEvidenceJson,
  runWalletProviderContract,
} from "../src/lib/solana-wallet-compat.ts";

function fixtureTransaction(wallet) {
  return new Transaction({
    feePayer: wallet.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(new TransactionInstruction({
    // This transaction is only serialized and signed in memory. It is never
    // handed to an RPC, so the program id does not move any funds.
    programId: new PublicKey("11111111111111111111111111111111"),
    keys: [],
    data: Buffer.alloc(0),
  }));
}

function providerFor(wallet, { reject = false, mutate = false } = {}) {
  let publicKey = wallet.publicKey;
  return {
    get publicKey() {
      return publicKey;
    },
    async connect() {
      return { publicKey };
    },
    async signTransaction(transaction) {
      if (reject) throw Object.assign(new Error("User rejected the signing request."), { code: 4001 });
      if (mutate) transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
      transaction.partialSign(wallet);
      return transaction;
    },
    async disconnect() {
      publicKey = null;
    },
  };
}

function allChecksPass(evidence) {
  return Object.values(evidence.checks).every((check) => check.status === "pass");
}

for (const walletId of SOLANA_BROWSER_WALLET_IDS) {
  test(`${walletId} provider contract is fundless and reproducible`, async () => {
    const wallet = Keypair.generate();
    const transaction = fixtureTransaction(wallet);
    let pending = null;
    const evidence = await runWalletProviderContract({
      wallet: walletId,
      provider: providerFor(wallet),
      rejectionProvider: providerFor(wallet, { reject: true }),
      transaction,
      expectedPublicKey: wallet.publicKey,
      recoveryProbe: async () => {
        pending = { id: `${walletId}:contract` };
        const recovered = pending;
        pending = null;
        return recovered?.id === `${walletId}:contract` && pending === null;
      },
    });

    assert.equal(evidence.schema, "cmc.solana.wallet-compatibility.v1");
    assert.equal(evidence.mode, "provider-contract");
    assert.equal(evidence.noFundsSent, true);
    assert.equal(allChecksPass(evidence), true, JSON.stringify(evidence, null, 2));
    assert.match(compatibilityEvidenceJson(evidence), /"signedMessageImmutability":/);
  });
}

test("provider contract evidence fails closed when a wallet changes the signed message", async () => {
  const wallet = Keypair.generate();
  const evidence = await runWalletProviderContract({
    wallet: "phantom",
    provider: providerFor(wallet, { mutate: true }),
    transaction: fixtureTransaction(wallet),
    expectedPublicKey: wallet.publicKey,
  });

  assert.equal(evidence.checks.signedMessageImmutability.status, "fail");
  assert.equal(evidence.noFundsSent, true);
});
