export function UserGuideSection() {
  return (
    <section id="user-guide" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">User Guide</h2>
      
      <div id="launch-validation" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Launch Validation</h3>
        <p className="text-muted-foreground mb-4">
          Creating a new local market preview requires specific field formatting for the SOL-first launch direction. These checks do not submit a Solana transaction.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-foreground font-mono">
              <tr>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Validation Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-muted-foreground">
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Name</td>
                <td className="px-4 py-3">3 to 80 characters. Trimmed.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Ticker</td>
                <td className="px-4 py-3">2 to 10 characters. Must contain only ASCII letters and numbers. Automatically uppercased.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Description</td>
                <td className="px-4 py-3">Optional. Maximum 1000 characters.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Links (Web/X/Telegram)</td>
                <td className="px-4 py-3">Optional. Must start with http:// or https://, have a valid hostname/URL, contain no credentials. Maximum 2048 characters.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Image</td>
                <td className="px-4 py-3">Optional. PNG, JPEG, or WebP only. Maximum size 4 MB. Uploaded images become publicly accessible immediately.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="commodity-modes" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Commodity Modes</h3>
        <p className="text-muted-foreground mb-4">
          The launch interface allows pairing the community token with either a single commodity reference or a basket. The catalog contains various items across Metals, Energy, Agriculture, Livestock, Fast food, CS2, Game gold, Trading cards, Water, Cars, and Currencies. These commodity and SOL/USD values are informational references only; the launch quote asset is native SOL, represented as WSOL where an SPL token account is required.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border border-border/50">
            <h4 className="font-bold text-primary mb-2">Single Mode</h4>
            <p className="text-sm text-muted-foreground">
               Permits exactly one valid catalog symbol. The curve uses the item's USD reference for display and comparison only. It does not create a commodity claim or use the reference as collateral.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-card border border-border/50">
            <h4 className="font-bold text-primary mb-2">Basket Mode</h4>
            <p className="text-sm text-muted-foreground">
               Select between 1 and 5 distinct symbols. The interface visually weights them equally. The basket's normalized USD value is informational; curve balances and trade amounts remain SOL-denominated.
            </p>
          </div>
        </div>
      </div>

      <div id="buy-sell-steps" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Buy & Sell Steps</h3>
        <p className="text-muted-foreground mb-4">
          Interacting with a local market preview follows these strict deterministic operations. The target quote asset is native SOL/WSOL.
        </p>
        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
          <li><strong>Select Operation:</strong> Choose to Buy (spending local SOL to receive tokens) or Sell (burning local tokens to receive SOL).</li>
          <li><strong>Input Amount:</strong> Enter the desired gross SOL or token amount. The preview applies the observed 0.25% Raydium protocol fee plus the proposed fixed 0.50% CMC platform fee (0.75% total in the current model).</li>
          <li><strong>Curve Guardrails:</strong> The trade is calculated against the constant-product curve. If a buy crosses the curve's 800,000,000 token limit, it is capped at the exact remaining curve supply and the unused SOL stays in your browser-local wallet. Buys are rejected only when your browser-local SOL balance is insufficient. Graduation is not enabled in the preview.</li>
          <li><strong>Local Execution:</strong> Click to execute. The interface applies the math, updates your browser's local ledger, and adjusts the local quote reserve. <strong>No signature or onchain transaction takes place.</strong></li>
        </ol>
      </div>

      <div id="local-wallet" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Local Wallet Integration</h3>
        <p className="text-muted-foreground mb-4">
          The connected wallet interface acts only as a display layer. Under the hood, a browser-local practice wallet initializes with exactly <strong>100 SOL</strong> of illustrative local SOL.
        </p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          <li><strong>Storage Risk:</strong> Balances, tokens, and history exist strictly in your browser's <code>localStorage</code>. Clearing site data permanently deletes these local preview records.</li>
          <li><strong>Initial Buy:</strong> Launching a market requires an initial SOL buy. The amount cannot exceed your current browser-local SOL balance; if it would cross the 800,000,000 token limit, the first buy is capped at the exact remaining curve supply and the unused SOL remains in your local wallet.</li>
          <li><strong>No Transactions:</strong> Approving a launch or trade explicitly costs no blockchain transaction fees and requires no wallet signatures.</li>
        </ul>
      </div>
    </section>
  );
}