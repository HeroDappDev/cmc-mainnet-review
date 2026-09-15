export function ProviderCoverageSection() {
  return (
    <section id="provider-coverage" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">Provider Coverage</h2>
      
      <p className="text-muted-foreground mb-6">
        Prices are sourced strictly from free-tier public endpoints with no subscription mechanisms. No endpoint accepts private keys or credentials. These commodity feeds expose informational USD references (including <code>priceUSD</code>) only; they do not determine the SOL quote reserve, provide backing, or create a commodity claim.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border/50 mb-8">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-muted/50 text-foreground font-mono">
            <tr>
              <th className="px-4 py-3 font-medium">Category / Provider</th>
              <th className="px-4 py-3 font-medium">Symbols</th>
              <th className="px-4 py-3 font-medium">Unit & Frequency</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-muted-foreground">
            <tr>
              <td className="px-4 py-3 font-medium text-foreground">Metals (Gold API)</td>
              <td className="px-4 py-3">GLD, SILV, PLAT, PALL, COPP</td>
              <td className="px-4 py-3">USD / troy oz (Copper: / lb)<br/><span className="text-xs text-muted-foreground">Current / Indicative</span></td>
              <td className="px-4 py-3"><a href="https://gold-api.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">gold-api.com</a></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-foreground">FX (Frankfurter/ECB)</td>
              <td className="px-4 py-3">EUR, JPY</td>
              <td className="px-4 py-3">Base USD<br/><span className="text-xs text-muted-foreground">Daily Reference</span></td>
              <td className="px-4 py-3"><a href="https://frankfurter.dev/" target="_blank" rel="noreferrer" className="text-primary hover:underline">frankfurter.dev</a></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-foreground">Energy (U.S. EIA via FRED)</td>
              <td className="px-4 py-3">WTI, BRENT, NGAS, GASO, HEAT</td>
              <td className="px-4 py-3">Barrel / MMBtu / Gallon<br/><span className="text-xs text-muted-foreground">Daily Government</span></td>
              <td className="px-4 py-3"><a href="https://fred.stlouisfed.org/categories/32217" target="_blank" rel="noreferrer" className="text-primary hover:underline">fred.stlouisfed.org</a></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-xl font-bold text-foreground mb-4">Unavailable Assets</h3>
      <p className="text-muted-foreground mb-4">
        The following catalogue symbols represent display-only or theoretical components. They explicitly return an <code>unavailable</code> status from the API. Future integration with licensed providers (e.g. Barchart, Trading Economics) is pending legal and subscription approval.
      </p>
      <div className="bg-card p-4 rounded-lg border border-border/50">
        <p className="text-sm font-mono text-muted-foreground leading-relaxed break-all">
          ALUM, LUMB, WHEAT, CORN, SOY, SOYO, RICE, OATS, COFF, COCO, COTT, SUGAR, CATTLE, HOGS, FEED, BURG, FRIES, PIZZA, CS2, GP, TCG, WATER, CAR
        </p>
      </div>
    </section>
  );
}