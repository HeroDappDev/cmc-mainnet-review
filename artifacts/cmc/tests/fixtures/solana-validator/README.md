# Controlled validator snapshot

This fixture is an immutable, reviewable replay snapshot for the unsigned
Squads-to-Raydium Platform lifecycle. It is not authorization to propose, sign,
submit, fund, or execute a mainnet transaction.

## Snapshot identity

`manifest.json` records the cluster, capture slot, toolchain versions, exact
proof-package hash, reviewed ProgramData baselines, loaded program binaries,
seeded accounts, and the explicit CPMM coverage boundary. The canonical
manifest SHA-256 is recorded in `snapshot.lock.json` and independently pinned
in `controlled-validator.mjs`.

The harness verifies:

- the manifest schema, snapshot ID, genesis hash, and toolchain versions;
- the canonical manifest digest against both independent pins;
- every loaded program file's byte length and SHA-256;
- reconstruction of each reviewed deployed-code byte sequence from its recorded
  loader prefix plus loadable ELF, followed by a deployed-code hash check;
- every seeded account's serialized-data SHA-256; and
- the exact controlled-validator behavior asserted by the main deployment
  tests.

Run:

```sh
pnpm --filter @workspace/cmc run test:validator-snapshot
```

## Reviewed rotation procedure

Do not silently replace files in an existing snapshot.

1. Copy this directory to a new versioned snapshot directory and preserve the
   old snapshot for historical replay.
2. Obtain fresh finalized Program and ProgramData observations and retain their
   addresses, deployment slots, upgrade authorities, and deployed-code hashes.
3. Replace only the program binaries and account data covered by the new
   review. Record their exact provenance outside the repository if it contains
   private RPC details. If the loader's deployed-code bytes contain a prefix
   that is not accepted by LiteSVM as a loadable ELF, record that exact prefix
   and offset; the verifier must reconstruct and hash the full reviewed
   deployed-code sequence before loading the ELF.
4. Update the snapshot ID, capture slot, toolchain versions, proof-package hash,
   reviewed baselines, coverage declaration, individual lengths, and hashes.
5. Compute the canonical manifest digest with recursively sorted object keys.
   Update `snapshot.lock.json` and the source-pinned digest in the new harness
   in the same reviewed change.
6. Point the tests at the new snapshot and run the snapshot verifier, focused
   controlled-validator tests, full suite, typecheck, and independent review.
7. Reject the rotation if CPMM is claimed as executed coverage without loading
   and exercising a reviewed CPMM program binary. The current Platform
   lifecycle does not invoke CPMM, so CPMM coverage is intentionally limited to
   its reviewed identity and config account.