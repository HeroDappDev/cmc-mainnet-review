export default function FAQPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-4xl font-bold font-mono tracking-tight uppercase mb-8">FAQ</h1>
      <div className="space-y-8">
        <div>
          <h3 className="text-xl font-bold mb-2">What am I launching?</h3>
          <p className="text-muted-foreground">A local preview record for a meme or community token paired with a selected commodity quote coin. It does not mint a commodity token or create a deployed asset.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-2">Does GLD, CORN, or WTI peg my token?</h3>
          <p className="text-muted-foreground">No. The quote coin selection and its illustrative reference are used only as metadata. There is no oracle, price target, collateral, physical backing, or redemption right.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-2">Where are my local tokens?</h3>
          <p className="text-muted-foreground">They are saved per token in the browser-only practice wallet. That wallet starts with virtual SOL and is separate from any wallet you connect in the header.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-2">Can I earn or claim rewards?</h3>
          <p className="text-muted-foreground">No. Fee portions are local accounting displays only. There are no reward payouts, staking balances, LP positions, token buybacks, or actual burns.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-2">What do the 5 SOL and 80 SOL bars mean?</h3>
          <p className="text-muted-foreground">They are illustrative curve and graduation milestones in this preview. Graduation to Raydium is blocked pending testing, so reaching a displayed threshold does not deploy or migrate anything.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-2">Is mainnet live?</h3>
          <p className="text-muted-foreground">No. This is a browser-local preview on Solana. Trades do not request signatures or process onchain transactions, and no mainnet contracts are deployed.</p>
        </div>
      </div>
    </div>
  );
}
