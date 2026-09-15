export function WalletCompatibilitySection() {
  return (
    <section id="wallet-compatibility" className="scroll-mt-24 mb-16">
      <h2 className="mb-6 font-mono text-3xl font-bold uppercase tracking-tight text-primary">
        Wallet signing compatibility
      </h2>
      <p className="mb-4 text-muted-foreground">
        The current named browser-injection set is Phantom, Solflare, Backpack, and Glow.
        The launch and market routes currently request Phantom explicitly; the
        on-chain auditor console can detect the other named providers for this
        contract harness. This is an implementation and test boundary, not a claim
        that every extension version is certified. A wallet is supportable only when
        its provider-contract evidence and the real-wallet checklist below are both recorded.
      </p>
      <div className="mb-8 rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">No funds are used by the automated harness.</strong>{" "}
        It signs an in-memory, no-op transaction and never calls an RPC send method.
        Automated evidence proves provider behavior; it cannot prove that an extension
        displayed the expected browser prompt.
      </div>

      <h3 className="mb-4 text-xl font-bold text-foreground">Automated provider contract</h3>
      <p className="mb-3 text-muted-foreground">
        Run <code>node --test tests/solana-wallet-compat.test.mjs</code> from the CMC
        artifact. The deterministic evidence schema is{" "}
        <code>cmc.solana.wallet-compatibility.v1</code>. Each record includes
        <code>noFundsSent: true</code> and these checks:
      </p>
      <ul className="mb-8 list-inside list-disc space-y-2 text-muted-foreground">
        <li><strong className="text-foreground">prompt:</strong> signTransaction was reached (not proof of visible UI).</li>
        <li><strong className="text-foreground">publicKeyContinuity:</strong> the key before and after approval is unchanged.</li>
        <li><strong className="text-foreground">signedMessageImmutability:</strong> returned message bytes equal requested bytes.</li>
        <li><strong className="text-foreground">rejection:</strong> a user rejection propagates without submission.</li>
        <li><strong className="text-foreground">disconnect:</strong> disconnect resolves and clears the provider key.</li>
        <li><strong className="text-foreground">recovery:</strong> an interrupted pending record can be recovered.</li>
      </ul>
      <pre className="mb-8 overflow-x-auto rounded-lg border border-border/50 bg-card p-4 text-xs text-muted-foreground">
        <code>{`{
  "schema": "cmc.solana.wallet-compatibility.v1",
  "wallet": { "id": "phantom", "displayName": "Phantom" },
  "mode": "manual",
  "noFundsSent": true,
  "cluster": "devnet",
  "capturedAtUtc": "<recorded UTC time>",
  "checks": {
    "prompt": { "status": "pass", "detail": "prompt shown" },
    "publicKeyContinuity": { "status": "pass", "detail": "unchanged" },
    "signedMessageImmutability": { "status": "pass", "detail": "unchanged" },
    "rejection": { "status": "pass", "detail": "cancelled; no submission" },
    "disconnect": { "status": "pass", "detail": "cleared and reconnected" },
    "recovery": { "status": "pass", "detail": "pending record recovered" }
  }
}`}</code>
      </pre>

      <h3 className="mb-4 text-xl font-bold text-foreground">Manual real-wallet checklist</h3>
      <p className="mb-3 text-muted-foreground">
        Use a fresh browser profile or unlocked devnet wallet, with no mainnet
        approval and no valuable balance. The prompt/rejection checks must use the
        in-memory no-op transaction and must not be submitted. Save one evidence
        record per wallet, extension version, browser, and commit. Never paste a
        seed phrase or private key into the record.
      </p>
      <ol className="mb-4 list-inside list-decimal space-y-2 text-muted-foreground">
        <li>Confirm the detected wallet name and public key; record the first six and last six characters only.</li>
        <li>Prepare the displayed devnet transaction and confirm the extension prompt shows the same account and reviewed intent; record that the prompt appeared, then reject it. Do not approve an economic LaunchLab transaction for this checklist.</li>
        <li>For an approved-signing observation, use only the no-op fixture in the provider harness (never a funded transaction), then verify the public key is unchanged and the harness reports exact signed-message immutability.</li>
        <li>Repeat with Reject/Cancel. Confirm no submission, no success state, and no misleading pending record.</li>
        <li>Disconnect in the extension and app. Confirm the account disappears; reconnect and verify the same key is shown before retrying.</li>
        <li>For recovery, use the automated no-RPC interruption fixture (or a local/RPC mock), confirm the pending record remains, then record finalized, reverted, or expired status; do not send a funded transaction.</li>
        <li>Attach the sanitized evidence JSON, screenshots of prompt/rejection/disconnect, extension version, browser/OS, cluster (devnet), commit, and UTC time.</li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Until every item is evidenced, describe the wallet as <em>detected</em> or
        <em>provider-contract tested</em>, not as fully supported. Mainnet funds are
        outside this compatibility claim.
      </p>
    </section>
  );
}
