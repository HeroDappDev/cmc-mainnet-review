import { useState } from "react";

export function CommodityImage({ symbol, className = "" }: { symbol: string; className?: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`bg-secondary flex items-center justify-center text-muted-foreground font-mono text-xs ${className}`}>
        {symbol.substring(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={`/images/commodities/${symbol}.webp`}
      alt={`${symbol} commodity`}
      className={`object-cover object-center ${className}`}
      onError={() => setError(true)}
    />
  );
}