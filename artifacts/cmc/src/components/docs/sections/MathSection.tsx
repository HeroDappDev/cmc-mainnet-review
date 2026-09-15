import { CodeBlock } from "../CodeBlock";

export function MathSection() {
  return (
    <section id="curve-math" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">Curve and Math</h2>
      <p className="text-muted-foreground mb-8">
        The preview mirrors the SOL-first Raydium LaunchLab direction with a constant-product curve. Commodity USD and SOL/USD values are informational references; the quote reserve and trade inputs are denominated in SOL.
      </p>

      <div id="supply-constants" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Supply Constants</h3>
        <ul className="space-y-3 text-muted-foreground bg-card p-6 rounded-lg border border-border/50 font-mono text-sm">
          <li><span className="text-foreground">TOTAL_SUPPLY</span> = 1,000,000,000</li>
          <li><span className="text-foreground">CURVE_SUPPLY</span> = 800,000,000</li>
          <li><span className="text-foreground">RESERVED_SUPPLY</span> = 200,000,000</li>
          <li><span className="text-foreground">OPENING_FDV_SOL</span> = 5 SOL</li>
          <li><span className="text-foreground">GRADUATION_FDV_SOL</span> = 80 SOL</li>
          <li><span className="text-foreground">NET_RAISE_SOL</span> = 16 SOL</li>
          <li><span className="text-foreground">QUOTE_ASSET</span> = native SOL (WSOL where an SPL token account is required)</li>
        </ul>
      </div>

      <div id="pricing-equations" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Pricing Equations</h3>
        
        <h4 className="text-md font-bold text-foreground mt-6 mb-2">Virtual Start and Initial Reserve</h4>
        <p className="text-sm text-muted-foreground mb-3">
          The local preview starts with the same SOL-denominated virtual reserves used by the current model. These are curve parameters, not deposited funds or a liquidity guarantee.
        </p>
        <CodeBlock 
          language="typescript"
          code={`const virtualTokenStart = 1_066_666_666.6666667;\nconst virtualQuoteStartSOL = 5.333333333333333;\nconst feeRate = 0.0075; // 0.25% Raydium + proposed 0.50% CMC\nconst netQuoteSOL = grossQuoteSOL * (1 - feeRate);`}
        />

        <h4 className="text-md font-bold text-foreground mt-6 mb-2">Buy Logic</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Buys use a constant-product formula. The gross SOL input is reduced by the 0.75% modeled fee to determine the net quote input.
        </p>
        <CodeBlock 
          language="typescript"
          code={`const netQuoteSOL = grossQuoteSOL * (1 - feeRate);\nconst tokenOut = tokenReserve - (tokenReserve * quoteReserve) / (quoteReserve + netQuoteSOL);`}
        />

        <h4 className="text-md font-bold text-foreground mt-6 mb-2">Sell Logic</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Sells calculate the gross SOL output, then apply the modeled fee. Fees are not added back to reserves.
        </p>
        <CodeBlock 
          language="typescript"
          code={`const grossQuoteSOL = quoteReserve - (tokenReserve * quoteReserve) / (tokenReserve + tokenAmount);\nconst feeSOL = grossQuoteSOL * feeRate;\nconst netQuoteSOL = grossQuoteSOL - feeSOL;`}
        />
      </div>

      <div id="worked-example" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Worked Numerical Example</h3>
        <p className="text-muted-foreground mb-4">
          Consider a local launch with a 1 SOL gross buy. The commodity pair's USD reference is not used to convert the curve; SOL is the quote asset.
        </p>
        <div className="bg-card border border-border/50 rounded-lg p-5 text-sm font-mono text-muted-foreground space-y-2">
          <p className="text-foreground">1. Virtual reserves:</p>
          <p>Virtual token start = 1,066,666,666.6666667 tokens</p>
          <p>Virtual quote start = 5.333333333333333 SOL</p>
          
          <p className="text-foreground mt-4">2. Apply the modeled fees:</p>
          <p>Fee = 1 SOL × 0.75% = 0.0075 SOL</p>
          <p>Net quote input = 1 - 0.0075 = 0.9925 SOL</p>
          
          <p className="text-foreground mt-4">3. Execute the constant-product buy:</p>
          <p>TokenOut = Vt - (Vt × Vq) / (Vq + 0.9925)</p>
          <p>TokenOut ≈ <strong className="text-primary">167,356,079.57 tokens</strong></p>
        </div>
      </div>

      <div id="fees-allocations" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold text-foreground mb-4">Fees and Allocations</h3>
        <p className="text-muted-foreground mb-4">
          The current model uses a fixed 0.75% total fee: 0.25% is the observed Raydium protocol fee and 0.50% is the proposed fixed CMC platform fee. This is not a holder-reward or treasury-allocation schedule.
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-4">
          <li><strong>0.25%</strong> observed Raydium protocol fee</li>
          <li><strong>0.50%</strong> proposed fixed CMC platform fee</li>
          <li><strong>0%</strong> holder rewards, automatic buybacks, and creator fee</li>
        </ul>
        <div className="p-4 border-l-2 border-primary bg-primary/5 text-sm text-foreground">
          <strong>Important Note:</strong> The preview does not distribute holder rewards, provide yield, process automatic buybacks, or pay a creator fee. Commodity quote values and SOL/USD values remain informational references only.
        </div>
      </div>
    </section>
  );
}