import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20 py-8 bg-card text-muted-foreground">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <img src="/images/cmc-logo.png" alt="" width={32} height={32} className="w-8 h-8 object-contain shrink-0" />
            <span className="font-bold text-foreground">Commodity Markets Capital</span>
          </div>
          <p className="text-sm">
            Community-token launches paired with commodity quote coins, shown in a browser-local preview.
          </p>
        </div>
        
        <div>
          <h4 className="font-semibold text-foreground mb-4">Protocol</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/fees" className="hover:text-primary transition-colors">Fee Policy</Link></li>
            <li><Link href="/launch" className="hover:text-primary transition-colors">Launch a Market</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-foreground mb-4">Resources</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/docs" className="hover:text-primary transition-colors">Documentation</Link></li>
            <li><Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            <li><Link href="/faucet" className="hover:text-primary transition-colors">Testnet Faucet</Link></li>
          </ul>
        </div>

      </div>
      <div className="container mx-auto px-4 mt-8 pt-8 border-t border-border/50 text-xs text-center">
        <p className="mb-3 text-xs leading-relaxed text-primary">
          contracts pending
        </p>
        &copy; {new Date().getFullYear()} Commodity Markets Capital. All rights reserved.
      </div>
    </footer>
  );
}
