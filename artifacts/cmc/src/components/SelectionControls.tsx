"use client";

import { X } from "lucide-react";
import { CommodityImage } from "./CommodityImage";

interface SelectionControlsProps {
  selection: { isBasket: boolean; symbols: string[] };
  onSelectionChange: (selection: { isBasket: boolean; symbols: string[] }) => void;
}

export function SelectionControls({ selection, onSelectionChange }: SelectionControlsProps) {
  const { isBasket, symbols } = selection;
  
  const handleToggleMode = (basketMode: boolean) => {
    let newSelection = [...symbols];
    if (!basketMode && newSelection.length > 1) {
      newSelection = [newSelection[0]];
    }
    onSelectionChange({ isBasket: basketMode, symbols: newSelection });
  };

  const handleRemove = (symbol: string) => {
    onSelectionChange({ isBasket, symbols: symbols.filter(s => s !== symbol) });
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-secondary/20 p-4 rounded-xl border border-border/50 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0" />
      
      <div className="flex items-center gap-4 flex-wrap relative z-10">
        <div className="flex p-1 bg-[#0a0807] rounded-full border border-border/50 shrink-0 shadow-inner">
          <button 
            onClick={() => handleToggleMode(false)} 
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              !isBasket 
                ? "bg-primary text-primary-foreground shadow" 
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            Single coin
          </button>
          <button 
            onClick={() => handleToggleMode(true)} 
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              isBasket 
                ? "bg-primary text-primary-foreground shadow" 
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            Basket <span className="opacity-75 font-normal text-xs ml-1">up to 5</span>
          </button>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap min-h-[32px]">
          {symbols.length === 0 && (
            <span className="text-sm text-muted-foreground font-medium italic animate-in fade-in px-2">
              Select a commodity to pair with.
            </span>
          )}
          
          {symbols.map(sym => (
            <div key={sym} className="flex items-center gap-2 bg-[#0a0807] border border-border/60 rounded-full pl-1.5 pr-2 py-1.5 shadow-sm animate-in zoom-in-95 duration-200">
              <CommodityImage symbol={sym} className="w-5 h-5 rounded-full object-cover" />
              <span className="text-xs font-bold text-foreground tracking-tight">{sym}</span>
              <button 
                aria-label="Remove" 
                onClick={(e) => { e.stopPropagation(); handleRemove(sym); }} 
                className="w-4 h-4 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          
          {isBasket && symbols.length > 0 && symbols.length < 5 && (
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground/50 ml-2 animate-in fade-in duration-200">
              {symbols.length} / 5
            </span>
          )}
        </div>
      </div>
      
      <a 
        href="#token-launch" 
        className="shrink-0 px-6 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] transition-all font-bold rounded-xl text-sm border border-primary/20 flex items-center gap-2 relative z-10 group justify-center md:justify-start"
      >
        Skip to launch <span className="group-hover:translate-y-0.5 transition-transform">↓</span>
      </a>
    </div>
  );
}
