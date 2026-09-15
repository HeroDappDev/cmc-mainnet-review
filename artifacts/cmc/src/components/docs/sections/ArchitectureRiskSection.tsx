export function ArchitectureRiskSection() {
  return (
    <section id="architecture-security" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">Architecture & Security</h2>
      
      <div id="persistence-privacy" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Persistence & Privacy</h3>
        <p className="text-muted-foreground mb-4">
          The current environment emphasizes local data testing and strict network separation.
        </p>
        <ul className="list-disc list-inside space-y-3 text-muted-foreground">
           <li><strong>Local Storage Isolation:</strong> All wallets, trades, generated market configurations, and portfolio states are stored entirely in the client's browser <code>localStorage</code> mechanism (e.g., <code>cmc_curve_markets</code>, <code>cmc_curve_wallet</code>). There is no server/database persistence. Clearing browsing data results in immediate, irreversible loss of all local preview progress.</li>
          <li><strong>Image Upload Privacy:</strong> Image uploads via the API are immediately public through a public access policy. UUID paths are identifiers, not a privacy boundary; viewing requires no signed URL or login. Do not upload sensitive or identifying images.</li>
          <li><strong>Data Rollbacks:</strong> To prevent corrupted state during a failure to write to the browser's <code>localStorage</code> quota limits, launch workflows perform manual rollback snapshots.</li>
        </ul>
      </div>

      <div id="faq-troubleshooting" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">FAQ & Troubleshooting</h3>
        
        <div className="space-y-6">
          <div className="bg-card border border-border/50 rounded-lg p-5">
            <h4 className="font-bold text-foreground mb-2">Why is the Active Markets list empty on the homepage?</h4>
            <p className="text-sm text-muted-foreground">
               By design, the homepage shows an empty list of active markets until the Solana/Raydium release gates pass and a real onchain deployment exists. The markets you create are intentionally sequestered to your local browser and display only in the portfolio and local commodities lists.
            </p>
          </div>

          <div className="bg-card border border-border/50 rounded-lg p-5">
            <h4 className="font-bold text-foreground mb-2">I uploaded an image but the server returns 403 Forbidden.</h4>
            <p className="text-sm text-muted-foreground">
              The token image upload route strictly enforces the Same-Origin Policy. If your browser sends an <code>Origin</code> header, it must perfectly match the <code>Host</code> of the API server.
            </p>
          </div>

          <div className="bg-card border border-border/50 rounded-lg p-5">
            <h4 className="font-bold text-foreground mb-2">Why does the Buy button reject my transaction near the end of the curve?</h4>
            <p className="text-sm text-muted-foreground">
               The local buy calculates the exact output using the SOL-denominated constant-product formula. The guardrails reject any trade that attempts to output tokens pushing the distributed supply past the 800,000,000 token limit. Graduation is not enabled; you cannot bypass this cap.
            </p>
          </div>

          <div className="bg-card border border-border/50 rounded-lg p-5">
             <h4 className="font-bold text-foreground mb-2">Can I execute a Solana launch from this preview?</h4>
            <p className="text-sm text-muted-foreground">
               No. The target is Raydium LaunchLab on Solana, but the current interface is browser-local only. It does not construct or sign transactions, mint liquidity, perform graduation, or move SOL. Mainnet activation remains fail-closed behind the Solana readiness gates.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}