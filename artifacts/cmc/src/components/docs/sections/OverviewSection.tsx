export function OverviewSection() {
  return (
    <section id="overview" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">Overview</h2>
      <div className="prose prose-invert max-w-none text-muted-foreground space-y-4">
        <p>
            Commodity Markets Capital (CMC) documentation describes the current browser-local preview and the SOL-first direction for community-token launches using Raydium LaunchLab on Solana.
        </p>
        <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg text-foreground mt-6">
          <strong className="text-primary uppercase text-sm tracking-wider">Crucial Distinction: Current vs Proposed</strong>
          <p className="mt-2 text-sm">
            <strong>Active Product:</strong> The currently available interface is strictly a <strong>browser-local preview</strong>. It relies entirely on browser storage, illustrative balances, and indicative pricing. It does not connect to live contracts, move real funds, or require cryptographic signatures.
          </p>
          <p className="mt-2 text-sm">
            <strong>Proposed Product:</strong> The target is a Solana/Raydium LaunchLab flow quoted in native SOL (represented as WSOL where an SPL token account is required). <strong>LaunchLab trading, graduation, and liquidity are not deployed or active.</strong>
          </p>
        </div>
        <div className="p-4 border border-border/50 bg-card rounded-lg text-sm mt-6">
          <strong className="text-foreground">Target economics:</strong> 1,000,000,000 total tokens; 800,000,000 curve supply; 200,000,000 reserved supply; 5 SOL opening FDV; 80 SOL graduation FDV; and a 16 SOL net raise target. The observed Raydium protocol fee is 0.25%; the proposed fixed CMC platform fee is 0.50%. There are no holder rewards, automatic buybacks, or creator fee.
        </div>
        <p className="mt-6">
           The launched asset is a community token. Commodity quotes and SOL/USD values are informational references only: they are not backing, collateral, redemption rights, or a price guarantee. The token is not a commodity or a claim on any real-world physical asset.
        </p>
      </div>
    </section>
  );
}