# Finalized LaunchLab graduation evidence

`solana-launchlab-evidence.ts` is a **read-only, fail-closed evidence
collector**. It records an already-authorized Solana devnet lifecycle; it does
not create a mint, launch a curve, trade, graduate a launch, or submit any
transaction. It has no wallet or signing-key dependency.

The existing `solana:launchlab-proof` command remains a program/config
availability check and deterministic economic dry run. Its
`dry-run-not-evidence` output is not evidence of a graduation and is rejected
by this collector. A successful collector run requires finalized launch and
migration signatures, a successful migration transaction, and finalized reads
of every account listed below.

## Authorized run

After the separately authorized devnet lifecycle has completed, prepare a
manifest. The checked-in offline example is
`scripts/fixtures/solana-launchlab-graduation-input.json`; replace every
fixture address and signature with values from the authorized run. The
manifest must contain:

- `authorizationReference`, identifying the approved devnet change/run;
- the exact canonical LaunchLab config ID and the values used by the launch
  (the collector stores a canonical SHA-256 of these values);
- finalized signature references with `launch`, `buy`, and `migration` entries;
- the mint, LaunchState, Platform, LaunchLab base/quote vaults, and CPMM pool,
  base vault, quote vault, and LP mint; and
- the CPMM config ID when one was used.

Run from the repository root. Supply the RPC only through the process
environment or an ephemeral command-line argument; it is never copied to the
manifest or evidence output:

```sh
export SOLANA_DEVNET_RPC_URL='https://api.devnet.solana.com'
pnpm --filter @workspace/scripts run solana:launchlab-evidence \
  --input ./fixtures/solana-launchlab-graduation-input.json \
  --output ../docs/solana-launchlab-graduation-evidence.json
```

The output file is created with exclusive-write semantics. A typo, missing
account, non-executable pinned program, ownership mismatch, RPC error,
non-finalized/missing transaction, transaction error, wrong devnet genesis,
caller-substituted program/config ID, unknown launch/buy/migration
instruction, instruction with unrelated accounts, migration that does not
mention the pinned CPMM program, out-of-order slot, or an account snapshot
older than migration exits non-zero and writes no evidence file.
Never rerun with a different manifest over an existing output: retain each
evidence file as an append-only artifact.

The collector asks only for:

```text
getGenesisHash()
getAccountInfo(address, { encoding: "base64", commitment: "finalized" })
getTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 })
```

It does not call `sendTransaction`, `sendRawTransaction`, an airdrop method,
or a wallet loader. The output records only the canonical devnet genesis hash,
not an RPC endpoint. It explicitly records
`collectorSubmittedTransactions: false` and `walletLoaded: false`; the
`authorizationReference` identifies the external process that performed the
lifecycle.

## Evidence contents and integrity

The immutable schema is
`solana-launchlab-graduation-evidence/v2`, with
`evidenceKind: finalized-devnet-launchlab-cpmm-graduation` and
`status: verified`. It contains:

- finalized transaction signatures, slots, block times, successful `meta`, and
  verification timestamps;
- decoded Anchor instruction discriminators and amounts for the LaunchLab
  launch, buy, and migration instructions, plus CPMM initialization and the
  exact reviewed account role/index lists (including static keys followed by
  versioned-transaction writable and readonly address-table keys). For the
  pinned `makeCreateCpmmPoolInInstruction` layout, creator/config/authority
  are indices 0/1/2, pool is 3, canonical base/quote mints are 4/5, LP mint
  is 6, and base/quote vaults are 10/11;
- finalized base64 account snapshots, account owners, executable flags,
  lamports, read slots, byte lengths, and base64 hashes for the mint,
  LaunchState, Platform, both LaunchLab vaults, CPMM pool/vaults/LP mint, and
  pinned LaunchLab/CPMM programs;
- decoded post-migration LaunchState/CPMM PoolState relationships proving
  config, platform, mint, vault, quote mint, and LP-mint links, plus SPL mint
  and vault layouts; the reviewed PlatformConfig discriminator and CPMM config
  link are also required;
- pinned program/config identities and a canonical config hash; and
- capture start/completion timestamps, finalized commitment, cluster,
  authorization reference, and collector safety flags.
- an explicit `unauthenticated` attestation status and
  `activationEligible: false` at both verification and attestation boundaries.
  This collector does not pretend that a
  caller-supplied label is a cryptographic signer approval. A separately
  reviewed detached signer attestation must be added and verified before any
  activation process can treat this artifact as authorization.

The top-level `evidenceSha256` covers the canonicalized document excluding the
hash field. Consumers can call `verifyEvidenceHash` from
`scripts/src/solana-launchlab-evidence.ts` before indexing or publishing an
artifact. The TypeScript result is deeply frozen before it is returned. A
changed JSON artifact therefore cannot be treated as the captured record.

## Offline tests

The fixture tests use no RPC and no wallet:

```sh
pnpm --filter @workspace/scripts test
pnpm --filter @workspace/scripts run typecheck
```

They cover successful immutable capture, rejection of the existing
deterministic dry run, finalized transaction errors, missing accounts, and
tamper detection. These tests do not substitute for an authorized devnet
graduation; they verify that the collector cannot turn a dry run or incomplete
RPC response into graduation evidence.