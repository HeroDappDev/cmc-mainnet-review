import { createHash } from "node:crypto";
import type { IndexerConfig } from "./config";
import type {
  AccountRole,
  AccountSnapshot,
  FinalizedInstruction,
  FinalizedTransaction,
  SolanaCheckpoint,
  SolanaReader,
  TrackedAccount,
} from "./types";

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const POOL_STATE_DISCRIMINATOR = Buffer.from([247, 237, 227, 245, 215, 195, 222, 70]);
const INSTRUCTION_KINDS = new Map<string, {
  kind: "trade" | "migration";
  side?: "buy" | "sell";
  amountFields?: [string, string];
}>([
  [Buffer.from([250, 234, 13, 123, 213, 156, 19, 236]).toString("hex"), { kind: "trade", side: "buy", amountFields: ["quoteAmount", "minimumBaseAmount"] }],
  [Buffer.from([24, 211, 116, 40, 105, 3, 153, 56]).toString("hex"), { kind: "trade", side: "buy", amountFields: ["baseAmount", "maximumQuoteAmount"] }],
  [Buffer.from([149, 39, 222, 155, 211, 124, 152, 26]).toString("hex"), { kind: "trade", side: "sell", amountFields: ["baseAmount", "minimumQuoteAmount"] }],
  [Buffer.from([95, 200, 71, 34, 8, 9, 11, 166]).toString("hex"), { kind: "trade", side: "sell", amountFields: ["quoteAmount", "maximumBaseAmount"] }],
  [Buffer.from([136, 92, 200, 103, 28, 218, 144, 140]).toString("hex"), { kind: "migration" }],
  [Buffer.from([207, 82, 192, 145, 254, 207, 145, 223]).toString("hex"), { kind: "migration" }],
]);

function base58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index]! * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) result += BASE58[digits[index]!]!;
  return result;
}

function fromBase58(value: string): Buffer {
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return Buffer.alloc(0);
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index]! * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leading = 0;
  while (leading < value.length && value[leading] === "1") leading += 1;
  return Buffer.from([...new Array(Math.max(0, leading - 1)).fill(0), ...bytes.reverse()]);
}

function u64(buffer: Buffer, offset: number): string {
  return buffer.readBigUInt64LE(offset).toString();
}

function optionalPubkey(buffer: Buffer, optionOffset: number, keyOffset: number): string | null {
  return buffer.readUInt32LE(optionOffset) === 0 ? null : base58(buffer.subarray(keyOffset, keyOffset + 32));
}

function decodeSpl(owner: string, data: Buffer): { role: AccountRole; decoded?: Record<string, unknown> } {
  if (!TOKEN_PROGRAMS.has(owner)) return { role: "unknown" };
  const token2022 = owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  const accountType = data.length > 165 ? data[165] : undefined;
  if (data.length === 82 || (token2022 && accountType === 1)) {
    return {
      role: "mint",
      decoded: {
        mintAuthority: optionalPubkey(data, 0, 4),
        supply: u64(data, 36),
        decimals: data[44],
        initialized: data[45] === 1,
        freezeAuthority: optionalPubkey(data, 46, 50),
      },
    };
  }
  if (data.length === 165 || (token2022 && accountType === 2)) {
    return {
      role: "vault",
      decoded: {
        mint: base58(data.subarray(0, 32)),
        authority: base58(data.subarray(32, 64)),
        amount: u64(data, 64),
      },
    };
  }
  return { role: "unknown" };
}

function decodeLaunchState(data: Buffer): Record<string, unknown> | undefined {
  if (data.length !== 429 || !data.subarray(0, 8).equals(POOL_STATE_DISCRIMINATOR)) return undefined;
  return {
    epoch: u64(data, 8),
    bump: data[16],
    status: String(data[17]),
    mintDecimalsA: data[18],
    mintDecimalsB: data[19],
    migrateType: data[20],
    supply: u64(data, 21),
    totalSellA: u64(data, 29),
    virtualBase: u64(data, 37),
    virtualQuote: u64(data, 45),
    realBase: u64(data, 53),
    realQuote: u64(data, 61),
    totalFundRaisingB: u64(data, 69),
    protocolFee: u64(data, 77),
    platformFee: u64(data, 85),
    migrateFee: u64(data, 93),
    configId: base58(data.subarray(141, 173)),
    platform: base58(data.subarray(173, 205)),
    baseMint: base58(data.subarray(205, 237)),
    quoteMint: base58(data.subarray(237, 269)),
    baseVault: base58(data.subarray(269, 301)),
    quoteVault: base58(data.subarray(301, 333)),
    creator: base58(data.subarray(333, 365)),
    mintProgramFlag: data[365],
    cpmmCreatorFeeOn: data[366],
    platformVestingShare: u64(data, 367),
  };
}

function decodeCpmmPool(data: Buffer): Record<string, unknown> | undefined {
  if (data.length !== 637 || !data.subarray(0, 8).equals(POOL_STATE_DISCRIMINATOR)) return undefined;
  return {
    config: base58(data.subarray(8, 40)),
    poolCreator: base58(data.subarray(40, 72)),
    baseVault: base58(data.subarray(72, 104)),
    quoteVault: base58(data.subarray(104, 136)),
    lpMint: base58(data.subarray(136, 168)),
    baseMint: base58(data.subarray(168, 200)),
    quoteMint: base58(data.subarray(200, 232)),
    observation: base58(data.subarray(296, 328)),
    bump: data[328],
    status: String(data[329]),
    lpDecimals: data[330],
    baseDecimals: data[331],
    quoteDecimals: data[332],
    lpSupply: u64(data, 333),
  };
}

export class SolanaRpcRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolanaRpcRequestError";
  }
}

export class SolanaRpcReader implements SolanaReader {
  private readonly config: IndexerConfig;
  private requestId = 0;

  constructor(config: IndexerConfig) {
    if (!config.enabled || !config.rpcUrl) throw new Error("Cannot create a Solana reader from disabled configuration");
    this.config = config;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.config.rpcUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params }),
        signal: AbortSignal.timeout(this.config.operationTimeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new SolanaRpcRequestError(`Solana RPC ${method} request failed: ${error instanceof Error ? error.message : "network unavailable"}`);
    }
    if (!response.ok) throw new SolanaRpcRequestError(`Solana RPC ${method} failed with HTTP ${response.status}`);
    const body = await response.json() as { result?: T; error?: { message?: string } };
    if (body.error) throw new SolanaRpcRequestError(`Solana RPC ${method} failed: ${body.error.message ?? "unknown error"}`);
    if (body.result === undefined) throw new SolanaRpcRequestError(`Solana RPC ${method} returned no result`);
    return body.result;
  }

  async verifyCluster(expectedGenesisHash: string): Promise<void> {
    const observed = await this.rpc<string>("getGenesisHash", []);
    if (observed !== expectedGenesisHash) {
      throw new Error(
        `Solana RPC genesis hash mismatch: expected ${expectedGenesisHash}, observed ${observed}`,
      );
    }
  }

  getFinalizedSlot(): Promise<number> {
    return this.rpc("getSlot", [{ commitment: "finalized" }]);
  }

  async getTransactions(
    programId: string,
    checkpoint: SolanaCheckpoint,
    limit: number,
    startSlot: number,
    finalizedThroughSlot?: number,
  ): Promise<{ transactions: FinalizedTransaction[]; backfillComplete: boolean }> {
    type SignatureRow = { signature: string; slot: number; err: unknown; blockTime: number | null };
    let signatures: SignatureRow[] = [];
    if (checkpoint.backfillComplete && checkpoint.newestSignature) {
      let before: string | undefined;
      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        const page = await this.rpc<SignatureRow[]>("getSignaturesForAddress", [
          programId,
          {
            commitment: "finalized",
            limit,
            until: checkpoint.newestSignature,
            ...(before ? { before } : {}),
          },
        ]);
        signatures.push(...page);
        if (page.length < limit) break;
        before = page[page.length - 1]!.signature;
        if (pageNumber === 99) throw new Error("Forward signature gap exceeds the safe pagination limit");
      }
    } else {
      signatures = await this.rpc<SignatureRow[]>("getSignaturesForAddress", [
        programId,
        {
          commitment: "finalized",
          limit,
          ...(checkpoint.oldestSignature ? { before: checkpoint.oldestSignature } : {}),
        },
      ]);
    }
    const selected = signatures
      .filter((entry) =>
        (finalizedThroughSlot === undefined || entry.slot <= finalizedThroughSlot) &&
        (checkpoint.backfillComplete
          ? entry.signature !== checkpoint.newestSignature
          : entry.slot >= startSlot),
      )
      .reverse();
    const backfillComplete =
      checkpoint.backfillComplete ||
      signatures.length < limit ||
      signatures.some((entry) => entry.slot < startSlot);
    const transactions: FinalizedTransaction[] = [];
    for (const item of selected) {
      const value = await this.rpc<Record<string, any> | null>("getTransaction", [
        item.signature,
        { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!value) throw new Error(`Finalized transaction ${item.signature} is unavailable (RPC gap)`);
      const accountKeys = (value.transaction?.message?.accountKeys ?? []).map((key: any) =>
        typeof key === "string" ? key : String(key.pubkey),
      );
      const instructions: FinalizedInstruction[] = [];
      const append = (instruction: any, index: number, innerIndex: number) => {
        const invokedProgram = instruction.programId
          ? String(instruction.programId)
          : accountKeys[Number(instruction.programIdIndex)] ?? "";
        if (
          invokedProgram !== this.config.programId &&
          invokedProgram !== this.config.cpmmProgramId &&
          !TOKEN_PROGRAMS.has(invokedProgram)
        ) return;
        let accounts = (instruction.accounts ?? []).map((account: any) =>
          typeof account === "number" ? accountKeys[account] ?? String(account) : String(account),
        );
        if (accounts.length === 0 && instruction.parsed?.info && typeof instruction.parsed.info === "object") {
          accounts = Object.values(instruction.parsed.info)
            .filter((value): value is string => typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value));
        }
        const touchesCpmm = invokedProgram === this.config.cpmmProgramId;
        instructions.push({
          programId: invokedProgram,
          instructionIndex: index,
          innerInstructionIndex: innerIndex,
          accounts,
          data: typeof instruction.data === "string" ? instruction.data : "",
          kind: TOKEN_PROGRAMS.has(invokedProgram) ? "token" : touchesCpmm ? "cpmm" : "launch",
          payload: instruction.parsed && typeof instruction.parsed === "object" ? instruction.parsed : {},
        });
      };
      (value.transaction?.message?.instructions ?? []).forEach((ix: any, index: number) => append(ix, index, -1));
      for (const group of value.meta?.innerInstructions ?? []) {
        (group.instructions ?? []).forEach((ix: any, inner: number) => append(ix, Number(group.index), inner));
      }
      for (const ix of instructions) {
        if (ix.programId !== programId) continue;
        const discriminator = fromBase58(ix.data).subarray(0, 8).toString("hex");
        const decodedKind = INSTRUCTION_KINDS.get(discriminator);
        if (decodedKind) {
          ix.kind = decodedKind.kind;
          if (decodedKind.side) ix.payload = { ...ix.payload, side: decodedKind.side };
          const instructionData = fromBase58(ix.data);
          if (decodedKind.amountFields && instructionData.length >= 32) {
            ix.payload = {
              ...ix.payload,
              [decodedKind.amountFields[0]]: u64(instructionData, 8),
              [decodedKind.amountFields[1]]: u64(instructionData, 16),
              shareFeeRate: u64(instructionData, 24),
            };
          }
        }
      }
      transactions.push({
        signature: item.signature,
        slot: Number(value.slot),
        blockhash: String(value.transaction?.message?.recentBlockhash ?? ""),
        blockTime: value.blockTime ?? null,
        success: value.meta?.err == null,
        instructions,
        raw: value,
      });
    }
    return { transactions, backfillComplete };
  }

  async getAccountSnapshots(
    transactions: FinalizedTransaction[],
    config: { programId: string; cpmmProgramId: string; platformPda?: string },
    trackedAccounts: TrackedAccount[] = [],
    finalizedThroughSlot?: number,
  ): Promise<AccountSnapshot[]> {
    const expectedByPubkey = new Map(trackedAccounts.map((account) => [account.pubkey, account]));
    const accounts = new Set<string>(expectedByPubkey.keys());
    for (const tx of transactions) {
      for (const instruction of tx.instructions) {
        for (const pubkey of instruction.accounts) accounts.add(pubkey);
      }
    }
    const pubkeys = [...accounts];
    const snapshots: AccountSnapshot[] = [];
    for (let offset = 0; offset < pubkeys.length; offset += 100) {
      const batch = pubkeys.slice(offset, offset + 100);
      const result = await this.rpc<{ context: { slot: number }; value: Array<any | null> }>("getMultipleAccounts", [
        batch,
        {
          commitment: "finalized",
          encoding: "base64",
          ...(finalizedThroughSlot === undefined ? {} : { minContextSlot: finalizedThroughSlot }),
        },
      ]);
      result.value.forEach((account, index) => {
        const pubkey = batch[index]!;
        if (!account) {
          if (expectedByPubkey.has(pubkey)) {
            throw new Error(`Required tracked Solana account ${pubkey} was not returned at finalized commitment`);
          }
          return;
        }
        const dataBase64 = Array.isArray(account.data) ? String(account.data[0]) : String(account.data);
        const bytes = Buffer.from(dataBase64, "base64");
        const spl = decodeSpl(String(account.owner), bytes);
        const launchState = account.owner === config.programId ? decodeLaunchState(bytes) : undefined;
        const cpmmPool = account.owner === config.cpmmProgramId ? decodeCpmmPool(bytes) : undefined;
        const role: AccountRole =
          pubkey === config.platformPda ? "platform"
          : launchState ? "launchState"
          : cpmmPool ? "cpmmPool"
          : spl.role;
        const expected = expectedByPubkey.get(pubkey);
        if (expected && (
          (expected.expectedOwner !== undefined && String(account.owner) !== expected.expectedOwner) ||
          role !== expected.expectedRole
        )) {
          throw new Error(
            `Tracked Solana account ${pubkey} expected ${expected.expectedRole}/${expected.expectedOwner ?? "supported token program"} but observed ${role}/${String(account.owner)}`,
          );
        }
        snapshots.push({
          pubkey,
          slot: result.context.slot,
          signature: null,
          owner: String(account.owner),
          lamports: String(account.lamports),
          executable: Boolean(account.executable),
          dataBase64,
          dataHash: createHash("sha256").update(bytes).digest("hex"),
          role,
          decoded: launchState ?? cpmmPool ?? spl.decoded,
        });
      });
    }
    return snapshots;
  }
}