import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { test } from "node:test";
import {
  captureGraduationEvidence,
  type EvidenceInput,
  type Rpc,
  verifyEvidenceHash,
  DEVNET_GENESIS_HASH,
} from "./solana-launchlab-evidence.js";

const input = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/solana-launchlab-graduation-input.json"),
    "utf8",
  ),
) as EvidenceInput;

const accountAddresses = [
  input.lifecycle.mint,
  input.lifecycle.launchState,
  input.lifecycle.platform,
  input.lifecycle.vaults.base,
  input.lifecycle.vaults.quote,
  input.lifecycle.cpmm.pool,
  input.lifecycle.cpmm.baseVault,
  input.lifecycle.cpmm.quoteVault,
  input.lifecycle.cpmm.lpMint,
  input.pinned.launchLabProgram,
  input.pinned.cpmmProgram,
];

function decodeAddress(value: string): Uint8Array {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    number = number * 58n + BigInt(alphabet.indexOf(character));
  }
  const bytes = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(number & 255n);
    number >>= 8n;
  }
  return bytes;
}

function stateBytes(address: string): Uint8Array {
  const bytes = new Uint8Array(
    address === input.lifecycle.launchState
      ? 429
      : address === input.lifecycle.cpmm.pool
        ? 637
        : address === input.lifecycle.mint ||
            address === input.lifecycle.cpmm.lpMint
          ? 82
          : address === input.lifecycle.vaults.base ||
              address === input.lifecycle.vaults.quote ||
              address === input.lifecycle.cpmm.baseVault ||
              address === input.lifecycle.cpmm.quoteVault
            ? 165
          : address === input.lifecycle.platform
            ? 900
            : 3,
  );
  const discriminator = [247, 237, 227, 245, 215, 195, 222, 70];
  if (bytes.length >= 8) bytes.set(discriminator, 0);
  const put = (offset: number, value: string) => bytes.set(decodeAddress(value), offset);
  if (address === input.lifecycle.launchState) {
    put(141, input.pinned.config.id);
    put(173, input.lifecycle.platform);
    put(205, input.lifecycle.mint);
    put(237, "So11111111111111111111111111111111111111112");
    put(269, input.lifecycle.vaults.base);
    put(301, input.lifecycle.vaults.quote);
  }
  if (address === input.lifecycle.cpmm.pool) {
    put(8, input.lifecycle.cpmm.config);
    put(40, input.pinned.launchLabProgram!);
    put(72, input.lifecycle.cpmm.baseVault);
    put(104, input.lifecycle.cpmm.quoteVault);
    put(136, input.lifecycle.cpmm.lpMint);
    put(168, input.lifecycle.mint);
    put(200, "So11111111111111111111111111111111111111112");
  }
  if (address === input.lifecycle.platform) {
    bytes.set([160, 78, 128, 0, 248, 83, 230, 160], 0);
    put(728, input.lifecycle.cpmm.config);
  }
  if (
    address === input.lifecycle.vaults.base ||
    address === input.lifecycle.cpmm.baseVault
  ) {
    put(0, input.lifecycle.mint);
  }
  if (
    address === input.lifecycle.vaults.quote ||
    address === input.lifecycle.cpmm.quoteVault
  ) {
    put(0, "So11111111111111111111111111111111111111112");
  }
  return bytes;
}

class FixtureRpc implements Rpc {
  public constructor(
    private readonly transactionError = false,
    private readonly accountSlot = 904,
  ) {}

  public async call(method: string, params: unknown[]): Promise<unknown> {
    if (method === "getGenesisHash") return DEVNET_GENESIS_HASH;
    if (method === "getAccountInfo") {
      const address = params[0] as string;
      if (!accountAddresses.includes(address)) return null;
      const executable =
        address === input.pinned.launchLabProgram ||
        address === input.pinned.cpmmProgram;
      const launchOwned =
        address === input.lifecycle.launchState ||
        address === input.lifecycle.platform;
      const cpmmOwned = address === input.lifecycle.cpmm.pool;
      const bytes = stateBytes(address);
      return {
        context: { slot: this.accountSlot },
        value: {
          owner: executable
            ? "BPFLoaderUpgradeab1e11111111111111111111111"
            : launchOwned
              ? input.pinned.launchLabProgram
              : cpmmOwned
                ? input.pinned.cpmmProgram
                : input.pinned.tokenProgram,
          executable,
          lamports: 1,
          data: [Buffer.from(bytes).toString("base64"), "base64"],
        },
      };
    }
    if (method === "getTransaction") {
      const signature = params[0] as string;
      const role =
        signature === "launch-signature-fixture"
          ? "launch"
          : signature === "buy-signature-fixture"
            ? "buy"
            : "migration";
      const encode = (bytes: number[]) => {
        const alphabet =
          "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let number = 0n;
        for (const byte of bytes) number = number * 256n + BigInt(byte);
        let result = "";
        while (number > 0n) {
          result = alphabet[Number(number % 58n)] + result;
          number /= 58n;
        }
        return result || "1";
      };
      const launchData = encode(
        [...createHash("sha256").update("global:create").digest().subarray(0, 8)],
      );
      const buyData = encode([
        ...[250, 234, 13, 123, 213, 156, 19, 236],
        ...new Array(24).fill(0),
      ]);
      const migrationData = encode([
        ...[136, 92, 200, 103, 28, 218, 144, 140],
      ]);
      const cpmmData = encode([
        ...createHash("sha256").update("global:initialize").digest().subarray(0, 8),
      ]);
      const instruction = (
        programId: string,
        data: string,
        accounts: string[],
      ) => ({
        programId,
        data,
        accounts,
      });
      const launchAccounts = [
        input.pinned.launchLabProgram!,
        input.pinned.launchLabProgram!,
        input.pinned.config.id,
        input.lifecycle.platform,
        input.pinned.launchLabProgram!,
        input.lifecycle.launchState,
        input.lifecycle.mint,
        "So11111111111111111111111111111111111111112",
        input.lifecycle.vaults.base,
        input.lifecycle.vaults.quote,
      ];
      const buyAccounts = [
        input.pinned.launchLabProgram!,
        input.pinned.launchLabProgram!,
        input.pinned.config.id,
        input.lifecycle.platform,
        input.lifecycle.launchState,
        input.pinned.launchLabProgram!,
        input.pinned.launchLabProgram!,
        input.lifecycle.vaults.base,
        input.lifecycle.vaults.quote,
        input.lifecycle.mint,
      ];
      const migrationAccounts = [
        input.lifecycle.mint,
        input.lifecycle.launchState,
        input.lifecycle.platform,
        input.lifecycle.vaults.base,
        input.lifecycle.vaults.quote,
        input.lifecycle.cpmm.pool,
        input.lifecycle.cpmm.baseVault,
        input.lifecycle.cpmm.quoteVault,
        input.lifecycle.cpmm.lpMint,
      ];
      return {
        slot:
          role === "launch"
            ? 901
            : role === "buy"
              ? 902
              : 903,
        blockTime: 1_700_000_000,
        meta: {
          err: this.transactionError ? { InstructionError: [0, "Custom"] } : null,
          logMessages: [`Program ${input.pinned.cpmmProgram} success`],
        },
        transaction: {
          message: {
            accountKeys: [
              input.pinned.cpmmProgram,
              input.pinned.launchLabProgram,
              ...accountAddresses,
            ],
            instructions:
              role === "launch"
                ? [
                    instruction(
                      input.pinned.launchLabProgram!,
                      launchData,
                      launchAccounts,
                    ),
                  ]
                : role === "buy"
                  ? [
                      instruction(
                        input.pinned.launchLabProgram!,
                        buyData,
                      buyAccounts,
                      ),
                    ]
                  : [
                      instruction(
                        input.pinned.launchLabProgram!,
                        migrationData,
                        migrationAccounts,
                      ),
                      instruction(
                        input.pinned.cpmmProgram!,
                        cpmmData,
                        [
                          input.pinned.launchLabProgram!,
                          input.lifecycle.cpmm.config,
                          input.pinned.launchLabProgram!,
                          input.lifecycle.cpmm.pool,
                          input.lifecycle.mint,
                          "So11111111111111111111111111111111111111112",
                          input.lifecycle.cpmm.lpMint,
                          input.pinned.launchLabProgram!,
                          input.pinned.launchLabProgram!,
                          input.pinned.launchLabProgram!,
                          input.lifecycle.cpmm.baseVault,
                          input.lifecycle.cpmm.quoteVault,
                        ],
                      ),
                    ],
          },
        },
      };
    }
    throw new Error(`unexpected fixture method ${method}`);
  }
}

test("captures only finalized, immutable graduation evidence", async () => {
  const evidence = await captureGraduationEvidence(
    input,
    new FixtureRpc(),
    new Date("2026-09-13T20:00:00.000Z"),
  );
  strictEqual(evidence.status, "verified");
  strictEqual(evidence.verification.commitment, "finalized");
  strictEqual(evidence.verification.collectorSubmittedTransactions, false);
  strictEqual(evidence.verification.walletLoaded, false);
  strictEqual(evidence.lifecycle.migration.slot, 903);
  strictEqual(evidence.lifecycle.cpmm.pool.address, input.lifecycle.cpmm.pool);
  strictEqual(verifyEvidenceHash(evidence), true);
  strictEqual(Object.isFrozen(evidence), true);
  strictEqual(Object.isFrozen(evidence.lifecycle.cpmm), true);
  strictEqual(Object.isFrozen(evidence.lifecycle.cpmm.pool.data), true);
});

test("rejects the deterministic dry-run as evidence", async () => {
  await rejects(
    captureGraduationEvidence(
      {
        ...(input as unknown as Record<string, unknown>),
        proofKind: "read-only-devnet-verification-and-deterministic-dry-run",
      },
      new FixtureRpc(),
    ),
    /deterministic dry-run/,
  );
});

test("fails closed when a finalized transaction reports an error", async () => {
  await rejects(
    captureGraduationEvidence(input, new FixtureRpc(true)),
    /finalized with an error/,
  );
});

test("fails closed when a required account is absent", async () => {
  const missing = new FixtureRpc();
  const original = missing.call.bind(missing);
  missing.call = async (method, params) => {
    if (method === "getAccountInfo" && params[0] === input.lifecycle.cpmm.pool) {
      return null;
    }
    return original(method, params);
  };
  await rejects(
    captureGraduationEvidence(input, missing),
    /does not exist at finalized commitment/,
  );
});

test("canonical verification detects tampering", async () => {
  const evidence = await captureGraduationEvidence(input, new FixtureRpc());
  const changed = {
    ...evidence,
    lifecycle: {
      ...evidence.lifecycle,
        migration: { ...evidence.lifecycle.migration, slot: 904 },
    },
  };
  strictEqual(verifyEvidenceHash(changed), false);
  deepStrictEqual(evidence.lifecycle.migration.slot, 903);
});

test("rejects an RPC that is not the exact Solana devnet", async () => {
  const wrongGenesis: Rpc = {
    async call(method, params) {
      if (method === "getGenesisHash") return "attacker-controlled-genesis";
      return new FixtureRpc().call(method, params);
    },
  };
  await rejects(
    captureGraduationEvidence(input, wrongGenesis),
    /canonical Solana devnet/,
  );
});

test("rejects caller substitution of a Raydium program ID", async () => {
  const altered = structuredClone(input) as EvidenceInput;
  altered.pinned.launchLabProgram = "11111111111111111111111111111111";
  await rejects(
    captureGraduationEvidence(altered, new FixtureRpc()),
    /canonical devnet value/,
  );
});

test("rejects snapshots that predate the finalized migration", async () => {
  await rejects(
    captureGraduationEvidence(input, new FixtureRpc(false, 902)),
    /predates migration slot/,
  );
});

test("records unauthenticated evidence as activation-ineligible", async () => {
  const evidence = await captureGraduationEvidence(input, new FixtureRpc());
  strictEqual(evidence.lifecycle.attestation.status, "unauthenticated");
  strictEqual(evidence.lifecycle.attestation.activationEligible, false);
  strictEqual(evidence.verification.activationEligible, false);
  strictEqual("rpcUrl" in evidence.network, false);
  strictEqual(JSON.stringify(evidence).includes("api.devnet.solana.com"), false);
});

test("rejects a manifest that would persist an endpoint or credential", async () => {
  const altered = structuredClone(input) as EvidenceInput;
  altered.pinned.config.values = {
    ...altered.pinned.config.values,
    endpoint: "https://rpc.example.invalid",
  };
  await rejects(
    captureGraduationEvidence(altered, new FixtureRpc()),
    /not permitted in evidence/,
  );
});

test("rejects transactions without reviewed instruction discriminators", async () => {
  const fixture = new FixtureRpc();
  const undecodable: Rpc = {
    async call(method, params) {
      const result = await fixture.call(method, params);
      if (method !== "getTransaction" || !result || typeof result !== "object") {
        return result;
      }
      const transaction = result as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      return {
        ...transaction,
        transaction: { ...payload, message: { ...message, instructions: [] } },
      };
    },
  };
  await rejects(
    captureGraduationEvidence(input, undecodable),
    /does not contain a decoded/,
  );
});

test("resolves versioned static plus ALT account indices in order", async () => {
  const fixture = new FixtureRpc();
  const alt: Rpc = {
    async call(method, params) {
      const result = await fixture.call(method, params);
      if (
        method !== "getTransaction" ||
        params[0] !== "migration-signature-fixture" ||
        !result ||
        typeof result !== "object"
      ) {
        return result;
      }
      const transaction = result as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      const staticKeys = [
        input.pinned.launchLabProgram!,
        input.pinned.cpmmProgram!,
        input.lifecycle.mint,
        input.lifecycle.launchState,
        input.lifecycle.platform,
        input.lifecycle.vaults.base,
        input.lifecycle.vaults.quote,
        "So11111111111111111111111111111111111111112",
        input.lifecycle.cpmm.config,
      ];
      return {
        ...transaction,
        meta: {
          ...(transaction.meta as Record<string, unknown>),
          loadedAddresses: {
            writable: [
              input.lifecycle.cpmm.pool,
              input.lifecycle.cpmm.baseVault,
            ],
            readonly: [
              input.lifecycle.cpmm.quoteVault,
              input.lifecycle.cpmm.lpMint,
            ],
          },
        },
        transaction: {
          ...payload,
          message: {
            ...message,
            accountKeys: staticKeys,
            instructions: [
              {
                programIdIndex: 0,
                data: Buffer.from([
                  136, 92, 200, 103, 28, 218, 144, 140,
                ]).toString("base64"),
                accounts: [2, 3, 4, 5, 6],
              },
              {
                programIdIndex: 1,
                data: createHash("sha256")
                  .update("global:initialize")
                  .digest()
                  .subarray(0, 8)
                  .toString("base64"),
                // creator, config, authority, pool, mint A, mint B, LP mint,
                // observation/fee decoys, vault A, vault B.
                accounts: [0, 8, 0, 9, 2, 7, 12, 0, 0, 0, 10, 11],
              },
            ],
          },
        },
      };
    },
  };
  // The fixture RPC's transaction data is base58. Convert the two ALT
  // instruction payloads above from base64 to base58 through a tiny wrapper
  // that leaves account-index behavior under test.
  const result = await captureGraduationEvidence(input, {
    async call(method, params) {
      const response = await alt.call(method, params);
      if (
        method !== "getTransaction" ||
        params[0] !== "migration-signature-fixture" ||
        !response ||
        typeof response !== "object"
      ) {
        return response;
      }
      const transaction = response as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      const encode = (bytes: Uint8Array) => {
        const alphabet =
          "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let number = 0n;
        for (const byte of bytes) number = number * 256n + BigInt(byte);
        let value = "";
        while (number > 0n) {
          value = alphabet[Number(number % 58n)] + value;
          number /= 58n;
        }
        return value || "1";
      };
      const instructions = (message.instructions as Array<Record<string, unknown>>).map(
        (instruction) => ({
          ...instruction,
          data: encode(
            Uint8Array.from(
              Buffer.from(instruction.data as string, "base64"),
            ),
          ),
        }),
      );
      return {
        ...transaction,
        transaction: { ...payload, message: { ...message, instructions } },
      };
    },
  });
  strictEqual(result.lifecycle.migration.slot, 903);
  strictEqual(
    result.lifecycle.transactions
      .find((transaction) => transaction.role === "migration")
      ?.semantics.some((semantic) => semantic.kind === "cpmm-initialization"),
    true,
  );
});

test("rejects a versioned transaction when an ALT is permuted to a decoy", async () => {
  const fixture = new FixtureRpc();
  const decoy: Rpc = {
    async call(method, params) {
      const response = await fixture.call(method, params);
      if (
        method !== "getTransaction" ||
        params[0] !== "migration-signature-fixture" ||
        !response ||
        typeof response !== "object"
      ) {
        return response;
      }
      const transaction = response as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      const migration = (message.instructions as Array<Record<string, unknown>>)[1]!;
      migration.accounts = [
        input.pinned.launchLabProgram!,
        input.lifecycle.cpmm.config,
        input.pinned.launchLabProgram!,
        input.lifecycle.cpmm.quoteVault,
        input.lifecycle.mint,
        "So11111111111111111111111111111111111111112",
        input.lifecycle.cpmm.lpMint,
        input.pinned.launchLabProgram!,
        input.pinned.launchLabProgram!,
        input.pinned.launchLabProgram!,
        input.lifecycle.cpmm.pool,
        input.lifecycle.cpmm.baseVault,
      ];
      return {
        ...transaction,
        transaction: { ...payload, message: { ...message, instructions: [message.instructions instanceof Array ? (message.instructions as Array<unknown>)[0] : null, migration] } },
      };
    },
  };
  await rejects(
    captureGraduationEvidence(input, decoy),
    /does not match the reviewed lifecycle account/,
  );
});

test("rejects CPMM initialization base/quote permutation at reviewed indices", async () => {
  const fixture = new FixtureRpc();
  const permuted: Rpc = {
    async call(method, params) {
      const response = await fixture.call(method, params);
      if (
        method !== "getTransaction" ||
        params[0] !== "migration-signature-fixture" ||
        !response ||
        typeof response !== "object"
      ) {
        return response;
      }
      const transaction = response as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      const instructions = (message.instructions as Array<Record<string, unknown>>).map(
        (instruction) => ({ ...instruction }),
      );
      const cpmm = instructions[1]!;
      const accounts = [...(cpmm.accounts as string[])];
      [accounts[4], accounts[5]] = [accounts[5]!, accounts[4]!];
      cpmm.accounts = accounts;
      return {
        ...transaction,
        transaction: { ...payload, message: { ...message, instructions } },
      };
    },
  };
  await rejects(
    captureGraduationEvidence(input, permuted),
    /does not match the reviewed lifecycle account/,
  );
});

test("rejects a direct LaunchLab account permutation", async () => {
  const fixture = new FixtureRpc();
  const permuted: Rpc = {
    async call(method, params) {
      const response = await fixture.call(method, params);
      if (
        method !== "getTransaction" ||
        params[0] !== "launch-signature-fixture" ||
        !response ||
        typeof response !== "object"
      ) {
        return response;
      }
      const transaction = response as Record<string, unknown>;
      const payload = transaction.transaction as Record<string, unknown>;
      const message = payload.message as Record<string, unknown>;
      const instructions = [
        ...(message.instructions as Array<Record<string, unknown>>),
      ];
      instructions[0] = {
        ...instructions[0],
        accounts: [
          input.lifecycle.launchState,
          input.lifecycle.mint,
          input.lifecycle.platform,
          input.lifecycle.vaults.base,
          input.lifecycle.vaults.quote,
        ],
      };
      return {
        ...transaction,
        transaction: { ...payload, message: { ...message, instructions } },
      };
    },
  };
  await rejects(
    captureGraduationEvidence(input, permuted),
    /does not match the reviewed lifecycle account/,
  );
});

test("rejects a decoy vault encoded inside CPMM PoolState", async () => {
  const fixture = new FixtureRpc();
  const decoyState: Rpc = {
    async call(method, params) {
      const response = await fixture.call(method, params);
      if (
        method !== "getAccountInfo" ||
        params[0] !== input.lifecycle.cpmm.pool ||
        !response ||
        typeof response !== "object"
      ) {
        return response;
      }
      const root = response as Record<string, unknown>;
      const value = root.value as Record<string, unknown>;
      const data = stateBytes(input.lifecycle.cpmm.pool);
      data.set(decodeAddress(input.lifecycle.cpmm.quoteVault), 72);
      return {
        ...root,
        value: {
          ...value,
          data: [Buffer.from(data).toString("base64"), "base64"],
        },
      };
    },
  };
  await rejects(
    captureGraduationEvidence(input, decoyState),
    /CPMM pool relationships/,
  );
});