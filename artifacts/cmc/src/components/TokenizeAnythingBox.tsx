"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { QUOTE_CATALOGUE } from "@/lib/store";
import { CommodityImage } from "./CommodityImage";

interface TokenizeAnythingBoxProps {
  selection: { isBasket: boolean; symbols: string[] };
  onSelectionChange: (selection: { isBasket: boolean; symbols: string[] }) => void;
}

export function TokenizeAnythingBox({ selection, onSelectionChange }: TokenizeAnythingBoxProps) {
  const [tokenizeSearch, setTokenizeSearch] = useState("");
  const isBasket = selection.isBasket;
  const selectedSymbols = selection.symbols;

  const handleSelect = (symbol: string) => {
    let newSelection = [...selectedSymbols];
    if (isBasket) {
      if (newSelection.includes(symbol)) {
        newSelection = newSelection.filter((s) => s !== symbol);
      } else if (newSelection.length < 5) {
        newSelection.push(symbol);
      }
    } else {
      newSelection = [symbol];
    }
    onSelectionChange({ isBasket, symbols: newSelection });
  };

  return (
    <div className="bg-[#1a1512] border border-primary/20 rounded-xl p-5 shadow-inner">
      <h3 className="font-bold text-foreground mb-2 text-sm">Tokenize anything</h3>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Explore collectibles, game items, and everyday goods in this illustrative catalogue. External product search and tokenization are not connected.
      </p>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          aria-label="Search catalogue products"
          placeholder="Search catalogue: trading card, burger, car..."
          value={tokenizeSearch}
          onChange={(e) => setTokenizeSearch(e.target.value)}
          className="w-full bg-[#110e0c] border border-border/50 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>
      {tokenizeSearch.trim() && (
        <div className="mt-3 grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
          {QUOTE_CATALOGUE.filter(item => `${item.name} ${item.symbol}`.toLowerCase().includes(tokenizeSearch.trim().toLowerCase())).map(item => (
            <button 
              key={item.symbol} 
              disabled={isBasket && selectedSymbols.length >= 5 && !selectedSymbols.includes(item.symbol)} 
              onClick={() => handleSelect(item.symbol)} 
              className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors ${
                selectedSymbols.includes(item.symbol) 
                  ? "bg-primary/20 border-primary/50 text-foreground" 
                  : "border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground disabled:opacity-40"
              }`}
            >
              <CommodityImage symbol={item.symbol} className="h-8 w-8 rounded shrink-0" />
              <span className="truncate font-medium">{item.name}</span>
            </button>
          ))}
          {!QUOTE_CATALOGUE.some(item => `${item.name} ${item.symbol}`.toLowerCase().includes(tokenizeSearch.trim().toLowerCase())) && (
            <p className="col-span-2 text-xs text-muted-foreground py-2 text-center border border-dashed border-border/40 rounded-lg">
              No matching catalogue products. External catalogue search is unavailable.
            </p>
          )}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/60 mt-4 pt-3 border-t border-border/30">
        {QUOTE_CATALOGUE.length} illustrative references · No external minting
      </div>
    </div>
  );
}
