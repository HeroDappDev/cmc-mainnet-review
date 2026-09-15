"use client";

import { useState, useEffect } from "react";
import { QUOTE_CATALOGUE } from "@/lib/store";
import { CommodityLaunchSelector } from "@/components/CommodityLaunchSelector";
import { TokenLaunchForm } from "@/components/TokenLaunchForm";

export default function LaunchPage() {
  const [selection, setSelection] = useState<{ isBasket: boolean; symbols: string[] }>({
    isBasket: false,
    symbols: ["GLD"]
  });
  
  const [initialData, setInitialData] = useState({ name: "", symbol: "", initialBuySOL: "0.5" });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get("symbol") || "";
    const name = params.get("name") || "";
    const pair = params.get("pair");
    const buy = Number(params.get("buy"));
    
    setInitialData({
      name,
      symbol,
      initialBuySOL: Number.isFinite(buy) && buy >= 0.01 ? String(buy) : "0.5",
    });

    if (pair) {
      const parts = [...new Set(pair.split("-"))].slice(0, 5);
      if (parts.length > 1 || params.get("basket") === "1") {
         setSelection({ isBasket: true, symbols: parts.filter(p => QUOTE_CATALOGUE.some(q => q.symbol === p)) });
      } else if (QUOTE_CATALOGUE.some((quote) => quote.symbol === pair)) {
         setSelection({ isBasket: false, symbols: [pair] });
      }
    }
    
    setIsLoaded(true);
  }, []);

  if (!isLoaded) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase mb-2 flex items-center gap-2">
          Launch a market
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
            Pick commodity references and launch a real Raydium LaunchLab token on Solana devnet. Phantom approval is required, SOL pays the network fee and account rent, and the mint address is shown only after finalized confirmation.
        </p>
      </div>

      <div className="bg-[#120f0d] border border-border/50 rounded-2xl p-6 shadow-xl mb-8">
        <fieldset disabled={isSubmitting} className="min-w-0" style={isSubmitting ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
          <CommodityLaunchSelector 
            initialSelection={selection}
            onSelectionChange={(s) => {
              if (!isSubmitting) setSelection(s);
            }}
          />
        </fieldset>
      </div>

      <TokenLaunchForm 
        selection={selection} 
        initialData={initialData} 
        onSubmittingChange={setIsSubmitting}
      />
    </div>
  );
}