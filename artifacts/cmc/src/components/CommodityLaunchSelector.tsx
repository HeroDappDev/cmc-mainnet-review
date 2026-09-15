"use client";

import { useState, useMemo } from "react";
import { Check, Search, X } from "lucide-react";
import { QUOTE_CATALOGUE, CATEGORIES, Category, QuoteItem } from "@/lib/store";
import { CommodityImage } from "./CommodityImage";
import { TokenizeAnythingBox } from "./TokenizeAnythingBox";

interface CommodityLaunchSelectorProps {
  onSelectionChange: (selection: { isBasket: boolean; symbols: string[] }) => void;
  initialSelection?: { isBasket: boolean; symbols: string[] };
}

export function CommodityLaunchSelector({ onSelectionChange, initialSelection }: CommodityLaunchSelectorProps) {
  const isBasket = initialSelection?.isBasket ?? false;
  const selectedSymbols = initialSelection?.symbols ?? ["GLD"];
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");

  const filteredCatalogue = useMemo(() => {
    let list = QUOTE_CATALOGUE;
    if (activeCategory !== "All") {
      list = list.filter((item) => item.category === activeCategory);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((item) => 
        item.symbol.toLowerCase().includes(s) || item.name.toLowerCase().includes(s)
      );
    }
    return list;
  }, [activeCategory, search]);

  const handleToggleMode = (basketMode: boolean) => {
    let newSelection = [...selectedSymbols];
    if (!basketMode && newSelection.length > 1) {
      newSelection = [newSelection[0]];
    }
    onSelectionChange({ isBasket: basketMode, symbols: newSelection });
  };

  const handleSelect = (symbol: string) => {
    let newSelection = [...selectedSymbols];
    
    if (isBasket) {
      if (newSelection.includes(symbol)) {
        newSelection = newSelection.filter((s) => s !== symbol);
      } else {
        if (newSelection.length < 5) {
          newSelection.push(symbol);
        }
      }
    } else {
      newSelection = [symbol];
    }
    
    onSelectionChange({ isBasket, symbols: newSelection });
  };

  const handleRemoveFromBasket = (symbol: string) => {
    if (!isBasket) return;
    const newSelection = selectedSymbols.filter((s) => s !== symbol);
    onSelectionChange({ isBasket, symbols: newSelection });
  };

  const selectedItems = selectedSymbols
    .map(sym => QUOTE_CATALOGUE.find(q => q.symbol === sym))
    .filter(Boolean) as QuoteItem[];

  return (
    <div className="flex flex-col gap-6">
      {/* Mode Switch */}
       <div className="flex items-center flex-wrap gap-3">
        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
        <h2 className="text-lg font-semibold text-foreground">Paired with</h2>
        <div className="flex p-1 bg-secondary/50 rounded-full ml-2">
          <button
            aria-pressed={!isBasket}
            onClick={() => handleToggleMode(false)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !isBasket ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Single coin
          </button>
          <button
            aria-pressed={isBasket}
            onClick={() => handleToggleMode(true)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isBasket ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Basket <span className="opacity-75 font-normal text-xs ml-1">up to 5</span>
          </button>
        </div>
      </div>

      {/* Selected Items Panel */}
      <div className="bg-secondary/20 border border-border/50 rounded-xl p-4 min-h-[90px] flex items-center flex-wrap gap-4">
        {selectedItems.length === 0 && (
          <div className="text-muted-foreground text-sm italic p-2">Select a commodity to pair with.</div>
        )}
        
        {!isBasket && selectedItems.length > 0 && (
          <div className="flex items-center gap-6 w-full px-2">
            <CommodityImage symbol={selectedItems[0].symbol} className="w-12 h-12 rounded object-cover" />
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2 text-lg">
                {selectedItems[0].symbol} <span className="text-muted-foreground text-sm font-normal">{selectedItems[0].name}</span>
              </div>
              <div className="grid grid-cols-2 mt-1 text-xs">
                <div>
                   <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-0.5">Sample reference</div>
                  <div className="font-mono text-foreground">${selectedItems[0].usdReference.toLocaleString()} / {selectedItems[0].unit.replace('per ', '')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-0.5">One Coin</div>
                  <div className="font-mono text-foreground">1 {selectedItems[0].unit.replace('per ', '')}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isBasket && (
          <div className="flex items-center gap-2 flex-wrap">
            {selectedItems.map((item) => (
              <div key={item.symbol} className="flex items-center gap-2 bg-secondary border border-border rounded-lg p-2 pr-3">
                <CommodityImage symbol={item.symbol} className="w-8 h-8 rounded" />
                <div className="flex flex-col">
                  <span className="font-bold text-sm leading-none">{item.symbol}</span>
                  <span className="text-xs text-muted-foreground leading-none mt-1">${item.usdReference.toLocaleString()}</span>
                </div>
                <button 
                  aria-label={`Remove ${item.name} from basket`}
                  onClick={() => handleRemoveFromBasket(item.symbol)}
                  className="ml-2 w-5 h-5 rounded-full bg-background/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {selectedItems.length < 5 && (
              <div className="text-sm text-muted-foreground/50 border border-dashed border-border rounded-lg p-3 px-4 flex items-center justify-center">
                + Add up to {5 - selectedItems.length} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Categories and Search */}
      <div className="flex flex-col gap-4">
         <div className="flex flex-wrap items-center gap-2 pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
               aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                activeCategory === cat 
                  ? "bg-secondary text-foreground border-border" 
                  : "bg-transparent text-muted-foreground border-transparent hover:border-border/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search commodities"
            type="text"
            placeholder="Search: gold, oil, corn, fries, gp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/30 border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredCatalogue.map((item) => {
          const isSelected = selectedSymbols.includes(item.symbol);
          const isDisabled = isBasket && !isSelected && selectedSymbols.length >= 5;
          return (
            <button
              key={item.symbol}
               aria-pressed={isSelected}
               aria-label={`Select ${item.name}`}
              onClick={() => handleSelect(item.symbol)}
              disabled={isDisabled}
              className={`flex items-center gap-3 p-2 rounded-lg border text-left transition-all relative ${
                isSelected
                  ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                  : isDisabled
                  ? "bg-secondary/20 border-transparent opacity-40 cursor-not-allowed"
                  : "bg-secondary/40 border-transparent hover:border-border hover:bg-secondary/60"
              }`}
            >
              <CommodityImage symbol={item.symbol} className="w-8 h-8 rounded shrink-0 object-cover" />
              <div className="flex flex-col min-w-0">
                <span className={`font-bold text-sm truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{item.symbol}</span>
                <span className="text-xs text-muted-foreground truncate">{item.name}</span>
              </div>
              {isSelected && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
        {filteredCatalogue.length === 0 && (
          <div className="col-span-full py-8 text-center text-muted-foreground text-sm">
            No commodities found matching "{search}".
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{isBasket ? `${selectedSymbols.length}/5 selected. Equal weights${selectedSymbols.length ? `: ${(100 / selectedSymbols.length).toFixed(1)}% each` : ""}; normalized $1 illustrative basket, not a live index.` : "Pick the coin your market trades against. Switch to Basket to pair with several."}</p>

      {/* Tokenize Anything Panel extracted to component */}
      <div className="mt-4">
        <TokenizeAnythingBox selection={{ isBasket, symbols: selectedSymbols }} onSelectionChange={onSelectionChange} />
      </div>
    </div>
  );
}