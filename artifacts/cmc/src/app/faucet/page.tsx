export default function FaucetPage() {
  return (
    <div className="container mx-auto px-4 py-12 flex items-center justify-center min-h-[70vh]">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center shadow-xl">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase mb-4">Testnet Faucet</h1>
        <p className="text-muted-foreground mb-8">
           Review the separate browser-only practice balance used for local curve examples.
        </p>

        <div className="p-4 bg-secondary/50 border border-border rounded-lg text-sm text-left space-y-4 mb-8">
          <p>
             <strong>Note:</strong> This entire application is currently running as a browser-local preview.
          </p>
          <p>
             You start with $10,000 virtual USD in a browser-local practice wallet. It is not connected to your wallet provider, cannot be withdrawn, and never requires a signature.
          </p>
        </div>

        <button disabled className="w-full py-4 bg-secondary text-muted-foreground font-bold rounded-lg cursor-not-allowed border border-border">
          Local Funds Already Allocated
        </button>
      </div>
    </div>
  );
}
