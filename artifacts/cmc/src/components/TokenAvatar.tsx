"use client";

import { useState } from "react";

export function TokenAvatar({ imageURL, name, symbol, className = "h-16 w-16" }: {
  imageURL?: string;
  name: string;
  symbol: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className={`${className} overflow-hidden rounded-xl bg-secondary border border-border flex items-center justify-center shrink-0 font-bold text-primary`}>
      {imageURL && imageURL !== failedUrl
        ? <img src={imageURL} alt={`${name} token`} className="h-full w-full object-cover" onError={() => setFailedUrl(imageURL)} />
        : symbol.slice(0, 2)}
    </div>
  );
}