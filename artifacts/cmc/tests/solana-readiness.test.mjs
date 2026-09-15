import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign as signMessage } from "node:crypto";
import {
  canonicalizeReleaseRecord,
  deriveProgramAddress,
  getSolanaConfig,
  isValidSolanaPublicKey,
  productionBlockers,
  releaseRecordConfigMismatches,
  toPublicSolanaConfig,
  verifySolanaReadiness,
  verifySignedReleaseRecord,
} from "../src/lib/solana-readiness.ts";
import {
  buildMainnetReleaseDraft,
  MAINNET_RELEASE_APPROVERS,
} from "../src/lib/mainnet-release.ts";

const PROGRAM = "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6";
const CPMM = "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb";
const PDA = "11111111111111111111111111111111";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes) {
  let digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  const firstNonZero = [...bytes].findIndex((byte) => byte !== 0);
  return "1".repeat(firstNonZero < 0 ? bytes.length : firstNonZero)
    + digits.reverse().map((digit) => ALPHABET[digit]).join("");
}

function signedRecord(signerCount = 1) {
  const signers = Array.from({ length: signerCount }, () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return {
      privateKey,
      approver: base58(new Uint8Array(publicKey.export({ type: "spki", format: "der" }).slice(-32))),
    };
  });
  const approver = signers[0].approver;
  const record = {
    schemaVersion: 1,
    cluster: "mainnet-beta",
    genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    launchLabProgramId: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    cpmmProgramId: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    launchLabProgramDataAddress: PDA,
    launchLabProgramDataHash: "00".repeat(32),
    launchLabProgramDataSlot: 1,
    launchLabUpgradeAuthority: PDA,
    cpmmProgramDataAddress: PDA,
    cpmmProgramDataHash: "11".repeat(32),
    cpmmProgramDataSlot: 1,
    cpmmUpgradeAuthority: PDA,
    platformPda: PDA,
    platformFeeDestination: PDA,
    platformFeeDestinationOwner: PDA,
    treasuryAuthority: PDA,
    treasuryAuthorityOwner: PDA,
    treasuryAuthorityPolicy: "multisig",
    lpAuthority: PDA,
    lpAuthorityOwner: PDA,
    lpAuthorityPolicy: "locked",
    platformPdaSeeds: '[{"type":"utf8","value":"platform"}]',
    platformPdaBump: 255,
    platformAccountDiscriminatorHex: "0000000000000000",
    platformAccountDataLength: 104,
    platformTreasuryAuthorityOffset: 8,
    platformLpAuthorityOffset: 40,
    platformFeeDestinationOffset: 72,
    deploymentStartSlot: 1,
    sdkVersion: "0.2.69-alpha",
    artifactId: "artifact-test",
    buildId: "build-test",
    reviewedProgramIds: true,
    platformFeeDestinationReviewed: true,
    treasuryAuthorityPolicyReviewed: true,
    lpAuthorityPolicyReviewed: true,
    platformPdaReviewed: true,
    independentSecurityReviewComplete: true,
    legalReviewComplete: true,
    releaseAuthorizationRecorded: true,
    sdkBuilderReviewed: true,
    chainStateBaseline: {
      chainStateFingerprint: "22".repeat(32),
       launchLab: { programDataAddress: PDA, codeFingerprint: "00".repeat(32), deployedSlot: 1, upgradeAuthority: PDA },
       cpmm: { programDataAddress: PDA, codeFingerprint: "11".repeat(32), deployedSlot: 1, upgradeAuthority: PDA },
    },
    approvers: signers.map(({ approver: key }) => key),
    issuedAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2025-01-03T00:00:00.000Z",
    signatures: [],
  };
  record.signatures = signers.map(({ approver: key, privateKey }) => ({
    approver: key,
    signature: signMessage(null, Buffer.from(canonicalizeReleaseRecord(record)), privateKey).toString("base64"),
  }));
  return { record, approver, approvers: signers.map(({ approver: key }) => key) };
}

function rpc({ genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", executable = true } = {}) {
  return async (method, params) => {
    if (method === "getGenesisHash") return genesis;
    assert.deepEqual(params[1], { encoding: "base64", commitment: "finalized" });
    return {
      context: { slot: 123 },
      value: { executable, owner: "BPFLoaderUpgradeab1e11111111111111111111111", data: ["", "base64"] },
    };
  };
}

test("wrong genesis hash fails closed", async () => {
  const result = await verifySolanaReadiness(
    getSolanaConfig({ SOLANA_DEVNET_RPC_URL: "https://rpc.invalid" }, "devnet"),
    rpc({ genesis: "wrong-genesis" }),
  );
  assert.equal(result.genesisVerified, false);
  assert.equal(result.networkReady, false);
  assert.equal(result.activationEligible, false);
  assert.match(result.blockers.join(" "), /genesis hash/i);
});

test("mainnet activation requires every production governance field", () => {
  const config = getSolanaConfig({
    SOLANA_MAINNET_RPC_URL: "https://rpc.invalid",
    SOLANA_MAINNET_LAUNCHLAB_PROGRAM_ID: PROGRAM,
    SOLANA_MAINNET_CPMM_PROGRAM_ID: CPMM,
  }, "mainnet-beta");
  const blockers = productionBlockers(config);
  assert.match(blockers.join(" "), /release flag/i);
  assert.match(blockers.join(" "), /Platform PDA/i);
  assert.match(blockers.join(" "), /fee destination/i);
  assert.match(blockers.join(" "), /LP authority/i);
  assert.match(blockers.join(" "), /start slot/i);
  assert.match(blockers.join(" "), /security review/i);
  assert.match(blockers.join(" "), /legal review/i);
  assert.match(blockers.join(" "), /release authorization/i);
});

test("mixed generic and mainnet settings are not considered dedicated mainnet configuration", () => {
  const config = getSolanaConfig({
    SOLANA_MAINNET_RPC_URL: "https://rpc.invalid",
    SOLANA_MAINNET_PLATFORM_PDA: PDA,
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION: PDA,
    SOLANA_MAINNET_TREASURY_AUTHORITY: PDA,
    SOLANA_MAINNET_LP_AUTHORITY: PDA,
    SOLANA_PLATFORM_PDA_SEEDS_JSON: '[{"type":"utf8","value":"platform"}]',
    SOLANA_PLATFORM_PDA_BUMP: "255",
    SOLANA_DEPLOYMENT_START_SLOT: "1",
    SOLANA_RELEASE_ENABLED: "true",
    SOLANA_REVIEWED_PROGRAM_IDS: "true",
  }, "mainnet-beta");
  assert.equal(config.mainnetConfigurationDedicated, false);
  assert.match(productionBlockers(config).join(" "), /dedicated SOLANA_MAINNET/i);
});

test("malformed base58 identifiers are rejected", () => {
  assert.equal(isValidSolanaPublicKey("not-a-solana-key"), false);
  assert.equal(isValidSolanaPublicKey("0".repeat(32)), false);
  assert.equal(isValidSolanaPublicKey(PDA), true);
});

test("PDA derivation matches the canonical Solana program-address vector", async () => {
  const address = await deriveProgramAddress(
    JSON.stringify([{ type: "utf8", value: "test" }]),
    255,
    PDA,
  );
  assert.equal(address, "H68a6HmNocBWoDtYo2PDxX3ciRHLUosfsnH9b2r7xNPJ");
});

test("non-executable program accounts fail closed", async () => {
  const result = await verifySolanaReadiness(
    getSolanaConfig({}, "devnet"),
    rpc({ executable: false }),
  );
  assert.equal(result.networkReady, false);
  assert.match(result.blockers.join(" "), /not executable/i);
});

test("executable program account owner drift fails closed", async () => {
  const result = await verifySolanaReadiness(
    getSolanaConfig({}, "devnet"),
    async (method, params) => {
      if (method === "getGenesisHash") return "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      assert.deepEqual(params[1], { encoding: "base64", commitment: "finalized" });
      return {
        context: { slot: 123 },
        value: {
          executable: true,
          owner: PDA,
          data: ["", "base64"],
        },
      };
    },
  );
  assert.equal(result.networkReady, false);
  assert.equal(result.programs.launchLab.ownerVerified, false);
  assert.match(result.blockers.join(" "), /LaunchLab program account owner does not match/i);
});

test("mainnet resolves finalized upgradeable ProgramData and rejects deployed code drift", async () => {
  const code = Buffer.from("reviewed-raydium-elf");
  const reviewedHash = createHash("sha256").update(code).digest("hex");
  const config = getSolanaConfig({
    SOLANA_MAINNET_RPC_URL: "https://rpc.invalid",
    SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_ADDRESS: PDA,
    SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_HASH: reviewedHash,
    SOLANA_MAINNET_LAUNCHLAB_PROGRAM_DATA_SLOT: "42",
    SOLANA_MAINNET_LAUNCHLAB_UPGRADE_AUTHORITY: PDA,
    SOLANA_MAINNET_CPMM_PROGRAM_DATA_ADDRESS: PDA,
    SOLANA_MAINNET_CPMM_PROGRAM_DATA_HASH: reviewedHash,
    SOLANA_MAINNET_CPMM_PROGRAM_DATA_SLOT: "42",
    SOLANA_MAINNET_CPMM_UPGRADE_AUTHORITY: PDA,
  }, "mainnet-beta");
  const programData = (bytes = code) => {
    const data = Buffer.alloc(45 + bytes.length);
    data.writeUInt32LE(3, 0);
    data.writeBigUInt64LE(42n, 4);
    data.writeUInt8(1, 12);
    Buffer.alloc(32).copy(data, 13);
    bytes.copy(data, 45);
    return [data.toString("base64"), "base64"];
  };
  const program = (address) => {
    const data = Buffer.alloc(36);
    data.writeUInt32LE(2, 0);
    Buffer.alloc(32).copy(data, 4);
    return {
      context: { slot: 100 },
      value: {
        executable: true,
        owner: "BPFLoaderUpgradeab1e11111111111111111111111",
        data: [data.toString("base64"), "base64"],
      },
    };
  };
  const result = await verifySolanaReadiness(config, async (method, params) => {
    if (method === "getGenesisHash") return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    assert.deepEqual(params[1], { encoding: "base64", commitment: "finalized" });
    if (params[0] === config.launchLabProgramId || params[0] === config.cpmmProgramId) return program(PDA);
    if (params[0] === PDA) return { context: { slot: 100 }, value: {
      executable: false,
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
      data: programData(),
    } };
    return { context: { slot: 100 }, value: null };
  });
  assert.equal(result.programs.launchLab.programDataAddressVerified, true);
  assert.equal(result.programs.launchLab.programDataOwnerVerified, true);
  assert.equal(result.programs.launchLab.programDataSlot, 42);
  assert.equal(result.programs.launchLab.programDataSlotVerified, true);
  assert.equal(result.programs.launchLab.codeHash, reviewedHash);
  assert.equal(result.programs.launchLab.codeHashVerified, true);
  assert.equal(result.programs.launchLab.upgradeAuthorityVerified, true);

  const drifted = await verifySolanaReadiness(config, async (method, params) => {
    if (method === "getGenesisHash") return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    assert.deepEqual(params[1], { encoding: "base64", commitment: "finalized" });
    if (params[0] === config.launchLabProgramId || params[0] === config.cpmmProgramId) return program(PDA);
    if (params[0] === PDA) return { context: { slot: 100 }, value: {
      executable: false,
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
      data: programData(Buffer.from("substituted-raydium-elf")),
    } };
    return { context: { slot: 100 }, value: null };
  });
  assert.equal(drifted.programs.launchLab.codeHashVerified, false);
  assert.equal(drifted.networkReady, false);
  assert.match(drifted.blockers.join(" "), /LaunchLab deployed code hash does not match/i);
});

test("the finalized chain fingerprint is stable for unchanged observations and changes on drift", async () => {
  const config = getSolanaConfig({}, "devnet");
  const first = await verifySolanaReadiness(config, rpc());
  const second = await verifySolanaReadiness(config, rpc());
  assert.match(first.chainStateFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.chainStateFingerprint, second.chainStateFingerprint);

  const drifted = await verifySolanaReadiness(config, async (method, params) => {
    if (method === "getGenesisHash") return "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    assert.deepEqual(params[1], { encoding: "base64", commitment: "finalized" });
    return {
      context: { slot: 123 },
      value: {
        executable: true,
        owner: PDA,
        data: ["", "base64"],
      },
    };
  });
  assert.notEqual(first.chainStateFingerprint, drifted.chainStateFingerprint);
  assert.match(drifted.blockers.join(" "), /program account owner does not match/i);
});

test("public config does not contain RPC secrets", () => {
  const config = getSolanaConfig({
    SOLANA_DEVNET_RPC_URL: "https://secret-provider.example/rpc?api-key=do-not-leak",
  }, "devnet");
  const publicConfig = toPublicSolanaConfig(config);
  assert.equal("rpcUrl" in publicConfig, false);
  assert.equal(JSON.stringify(publicConfig).includes("do-not-leak"), false);
});

test("signed release records require a trusted, valid Ed25519 signature", async () => {
  const { record, approver } = signedRecord();
  const verified = await verifySignedReleaseRecord(
    record,
    [approver],
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(verified.valid, true);
  assert.equal(verified.signaturesValid, true);
  assert.equal(verified.present, true);
});

test("release signer policy rejects one-of-many bypass and enforces threshold and roles", async () => {
  const one = signedRecord();
  const second = signedRecord();
  const bypass = await verifySignedReleaseRecord(
    one.record,
    [one.approver, second.approver],
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(bypass.valid, false);
  assert.match(bypass.blockers.join(" "), /exactly match/i);

  const two = signedRecord(2);
  const threshold = await verifySignedReleaseRecord(
    two.record,
    { trustedKeys: [...two.approvers, second.approver], threshold: 2 },
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(threshold.valid, true);

  const thresholdBypass = await verifySignedReleaseRecord(
    one.record,
    { trustedKeys: [one.approver, second.approver], threshold: 2 },
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(thresholdBypass.valid, false);
  assert.match(thresholdBypass.blockers.join(" "), /at least 2/i);

  const roles = await verifySignedReleaseRecord(
    two.record,
    {
      trustedKeys: two.approvers,
      roles: { [two.approvers[0]]: "security", [two.approvers[1]]: "release" },
      requiredRoles: ["security", "release"],
    },
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(roles.valid, true);
});

test("signed release records fail closed for tampering, untrusted keys, and expiry", async () => {
  const { record, approver } = signedRecord();
  const tampered = { ...record, buildId: "different-build" };
  const tamperedResult = await verifySignedReleaseRecord(
    tampered,
    [approver],
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(tamperedResult.signaturesValid, false);

  const untrustedResult = await verifySignedReleaseRecord(
    record,
    [PDA],
    new Date("2025-01-02T00:00:00.000Z"),
  );
  assert.equal(untrustedResult.valid, false);
  assert.match(untrustedResult.blockers.join(" "), /untrusted/i);

  const expiredResult = await verifySignedReleaseRecord(
    record,
    [approver],
    new Date("2025-01-04T00:00:00.000Z"),
  );
  assert.equal(expiredResult.valid, false);
  assert.match(expiredResult.blockers.join(" "), /expired/i);
});

test("reviewed chain-state baseline is part of exact signed configuration", () => {
  const { record } = signedRecord();
  const config = getSolanaConfig({}, "mainnet-beta");
  config.chainStateBaseline = {
    ...record.chainStateBaseline,
    chainStateFingerprint: "33".repeat(32),
  };
  assert.match(
    releaseRecordConfigMismatches(record, config).join(" "),
    /reviewed chain-state baseline/i,
  );
});

test("mainnet activation rejects executable but unpinned program IDs", () => {
  const config = getSolanaConfig({
    SOLANA_MAINNET_RELEASE_ENABLED: "true",
    SOLANA_MAINNET_REVIEWED_PROGRAM_IDS: "true",
    SOLANA_MAINNET_PLATFORM_PDA: PDA,
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION: PDA,
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED: "true",
    SOLANA_MAINNET_TREASURY_AUTHORITY: CPMM,
    SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY: "2-of-3 multisig",
    SOLANA_MAINNET_LP_AUTHORITY: CPMM,
    SOLANA_MAINNET_LP_AUTHORITY_POLICY: "governed multisig",
    SOLANA_MAINNET_PLATFORM_PDA_SEEDS_JSON: '[{"type":"utf8","value":"platform"}]',
    SOLANA_MAINNET_PLATFORM_PDA_BUMP: "255",
    SOLANA_MAINNET_PLATFORM_ACCOUNT_DISCRIMINATOR_HEX: "0000000000000000",
    SOLANA_MAINNET_PLATFORM_ACCOUNT_DATA_LENGTH: "80",
    SOLANA_MAINNET_PLATFORM_TREASURY_AUTHORITY_OFFSET: "8",
    SOLANA_MAINNET_PLATFORM_LP_AUTHORITY_OFFSET: "40",
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OFFSET: "8",
    SOLANA_MAINNET_DEPLOYMENT_START_SLOT: "1",
    SOLANA_MAINNET_RPC_URL: "https://rpc.invalid",
    SOLANA_RAYDIUM_SDK_VERSION: "pinned",
    SOLANA_RAYDIUM_SDK_BUILDER_REVIEWED: "true",
    SOLANA_MAINNET_PLATFORM_PDA_REVIEWED: "true",
    SOLANA_MAINNET_PLATFORM_PDA_VERIFIED: "true",
    SOLANA_MAINNET_INDEPENDENT_SECURITY_REVIEW_COMPLETE: "true",
    SOLANA_MAINNET_LEGAL_REVIEW_COMPLETE: "true",
    SOLANA_MAINNET_RELEASE_AUTHORIZATION_RECORDED: "true",
    SOLANA_MAINNET_LAUNCHLAB_PROGRAM_ID: CPMM,
    SOLANA_MAINNET_CPMM_PROGRAM_ID: PROGRAM,
  }, "mainnet-beta");
  assert.match(productionBlockers(config).join(" "), /pinned Raydium mainnet ID/i);
});

test("mainnet chain verification fails closed when Platform ownership and authorities do not match", async () => {
  const config = getSolanaConfig({
    SOLANA_MAINNET_RELEASE_ENABLED: "true",
    SOLANA_MAINNET_REVIEWED_PROGRAM_IDS: "true",
    SOLANA_MAINNET_PLATFORM_PDA: PDA,
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION: PDA,
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_REVIEWED: "true",
    SOLANA_MAINNET_TREASURY_AUTHORITY: CPMM,
    SOLANA_MAINNET_TREASURY_AUTHORITY_POLICY: "2-of-3 multisig",
    SOLANA_MAINNET_LP_AUTHORITY: CPMM,
    SOLANA_MAINNET_LP_AUTHORITY_POLICY: "governed multisig",
    SOLANA_MAINNET_PLATFORM_PDA_SEEDS_JSON: '[{"type":"utf8","value":"platform"}]',
    SOLANA_MAINNET_PLATFORM_PDA_BUMP: "255",
    SOLANA_MAINNET_PLATFORM_ACCOUNT_DISCRIMINATOR_HEX: "ffffffffffffffff",
    SOLANA_MAINNET_PLATFORM_ACCOUNT_DATA_LENGTH: "80",
    SOLANA_MAINNET_PLATFORM_TREASURY_AUTHORITY_OFFSET: "8",
    SOLANA_MAINNET_PLATFORM_LP_AUTHORITY_OFFSET: "40",
    SOLANA_MAINNET_PLATFORM_FEE_DESTINATION_OFFSET: "8",
    SOLANA_MAINNET_DEPLOYMENT_START_SLOT: "1",
    SOLANA_MAINNET_RPC_URL: "https://rpc.invalid",
    SOLANA_RAYDIUM_SDK_VERSION: "pinned",
    SOLANA_RAYDIUM_SDK_BUILDER_REVIEWED: "true",
    SOLANA_MAINNET_PLATFORM_PDA_REVIEWED: "true",
    SOLANA_MAINNET_PLATFORM_PDA_VERIFIED: "true",
    SOLANA_MAINNET_INDEPENDENT_SECURITY_REVIEW_COMPLETE: "true",
    SOLANA_MAINNET_LEGAL_REVIEW_COMPLETE: "true",
    SOLANA_MAINNET_RELEASE_AUTHORIZATION_RECORDED: "true",
  }, "mainnet-beta");
  const result = await verifySolanaReadiness(config, async (method, params) => {
    if (method === "getGenesisHash") return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    return {
      context: { slot: 10 },
      value: {
        executable: params[0] === config.launchLabProgramId || params[0] === config.cpmmProgramId,
        owner: "11111111111111111111111111111111",
        data: [Buffer.alloc(80).toString("base64"), "base64"],
      },
    };
  });
  assert.equal(result.activationEligible, false);
  assert.match(result.blockers.join(" "), /signed mainnet release record/i);
  assert.equal(result.platform.ownerVerified, false);
  assert.match(result.blockers.join(" "), /not owned by the pinned LaunchLab program/i);
  assert.match(result.blockers.join(" "), /treasury authority does not match/i);
});

test("mainnet release draft copies reviewed configuration and fingerprints its canonical message", () => {
  const { record } = signedRecord();
  const config = {
    ...record,
    rpcUrl: "https://rpc.invalid",
    rpcExplicitlyConfigured: true,
    mainnetConfigurationDedicated: true,
    releaseEnabled: true,
    releaseRecord: undefined,
    releaseRecordError: undefined,
    releaseApproverKeys: [...MAINNET_RELEASE_APPROVERS],
    releaseApprovalThreshold: 2,
    releaseApproverRoles: undefined,
    releaseRequiredApproverRoles: undefined,
  };
  const issuedAt = new Date("2025-01-02T00:00:00.000Z");
  const result = buildMainnetReleaseDraft(config, issuedAt);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.draft);
  assert.deepEqual(result.draft.approvers, MAINNET_RELEASE_APPROVERS);
  assert.equal(result.draft.signatures.length, 0);
  assert.equal(result.draft.issuedAt, issuedAt.toISOString());
  assert.equal(
    result.draft.expiresAt,
    new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(result.canonicalMessage, canonicalizeReleaseRecord(result.draft));
  assert.match(result.messageFingerprintSha256, /^[0-9a-f]{64}$/);
});

test("mainnet release draft refuses a false review boolean", () => {
  const { record } = signedRecord();
  const config = {
    ...record,
    rpcUrl: "https://rpc.invalid",
    rpcExplicitlyConfigured: true,
    mainnetConfigurationDedicated: true,
    releaseEnabled: true,
    releaseRecord: undefined,
    releaseRecordError: undefined,
    releaseApproverKeys: [...MAINNET_RELEASE_APPROVERS],
    releaseApprovalThreshold: 2,
    reviewedProgramIds: false,
  };
  const result = buildMainnetReleaseDraft(config, new Date("2025-01-02T00:00:00.000Z"));
  assert.equal(result.draft, undefined);
  assert.match(result.blockers.join(" "), /reviewedProgramIds.*false/i);
});

test("mainnet release draft is signable before final enablement and records authorization in the signed payload", () => {
  const { record } = signedRecord();
  const config = {
    ...record,
    rpcUrl: "https://rpc.invalid",
    rpcExplicitlyConfigured: true,
    mainnetConfigurationDedicated: true,
    releaseEnabled: false,
    releaseAuthorizationRecorded: false,
    releaseRecord: undefined,
    releaseRecordError: undefined,
    releaseApproverKeys: [...MAINNET_RELEASE_APPROVERS],
    releaseApprovalThreshold: 2,
    releaseApproverRoles: undefined,
    releaseRequiredApproverRoles: undefined,
  };
  const result = buildMainnetReleaseDraft(config, new Date("2025-01-02T00:00:00.000Z"));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.draft.releaseAuthorizationRecorded, true);
});
