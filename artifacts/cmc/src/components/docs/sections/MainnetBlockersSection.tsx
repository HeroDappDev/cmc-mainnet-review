import { NetworkStatus } from "../NetworkStatus";

export function MainnetBlockersSection() {
  return (
    <section id="mainnet-blockers" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">Mainnet Blockers</h2>
      <NetworkStatus />
      
      <div className="prose prose-invert max-w-none text-muted-foreground">
        <p>
          The browser-local preview is not an onchain deployment. Solana mainnet activation is fail-closed: the product must remain inactive unless the readiness endpoint verifies the exact mainnet-beta cluster, finalized Raydium program accounts, and every release-gate configuration.
        </p>
        
        <h3 className="text-xl font-bold text-foreground mt-6 mb-4">Solana / Raydium LaunchLab Direction</h3>
        <p>
          The intended onchain route is Raydium LaunchLab on Solana, with native SOL as the quote asset (WSOL when an SPL token account is required). The curve direction uses 1,000,000,000 total tokens, 800,000,000 curve tokens, 200,000,000 reserved tokens, a 5 SOL opening FDV, an 80 SOL graduation FDV, and a 16 SOL net raise target. These are proposed economics; no graduation or liquidity migration is active.
        </p>
        <p>
          The observed Raydium protocol fee is 0.25% and the proposed fixed CMC platform fee is 0.50%. There are no holder rewards, automatic buybacks, or creator fee.
        </p>

        <h3 className="text-xl font-bold text-foreground mt-6 mb-4">Fail-Closed Mainnet Gates</h3>
        <p>
           <code>GET /network/solana?cluster=mainnet-beta</code> returns readiness data without exposing private RPC configuration. A non-ready response is HTTP 503 and must not be treated as permission to trade. Activation remains blocked until all of the following are resolved:
        </p>
        <ul className="list-disc list-inside mt-4 space-y-2">
           <li><strong>Release gate:</strong> An explicit mainnet release flag and the exact <code>mainnet-beta</code> cluster are required.</li>
           <li><strong>RPC and genesis:</strong> A valid HTTPS RPC must verify the selected cluster's genesis hash.</li>
           <li><strong>Program verification:</strong> Reviewed Raydium LaunchLab and CPMM IDs must resolve to executable accounts at finalized commitment.</li>
           <li><strong>Platform configuration:</strong> Reviewed Platform PDA, fee destination, LP authority policy, deployment start slot, and Platform PDA verification are required.</li>
           <li><strong>Transaction builder:</strong> A pinned, reviewed Raydium SDK transaction builder is required before any transaction construction.</li>
        </ul>
        <div className="p-4 border-l-2 border-primary bg-primary/5 text-sm text-foreground mt-6">
          <strong>Legacy BSC isolation:</strong> Historical BSC routes and contract/indexer code are retained only as isolated, disabled compatibility context. They are not a supported network, quote path, deployment target, or product recommendation, and they do not relax the Solana mainnet release gates.
        </div>
      </div>
    </section>
  );
}