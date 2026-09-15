"use client";

import { useEffect, useState } from "react";

type Status = {
  readiness?: {
    cluster: "devnet" | "mainnet-beta";
    connected: boolean;
    networkReady: boolean;
    activationEligible: boolean;
    activation: "not-eligible" | "eligible";
    blockers: string[];
    checkedAt: string;
    quoteAsset?: {
      native: string;
      wrapped: string;
    };
  };
};

export function NetworkStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/network/solana?cluster=mainnet-beta", { signal: controller.signal, cache: "no-store" });
        if (response.status !== 200 && response.status !== 503) throw new Error("Unavailable");
        const data = await response.json();
        if (!data.readiness || typeof data.readiness.networkReady !== "boolean" || typeof data.readiness.activationEligible !== "boolean") {
          throw new Error("Invalid response");
        }
        setStatus(data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-8" aria-live="polite">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Network connectivity · read-only</div>
      <h3 className="text-lg font-bold mb-2">
        {error ? "Solana readiness check unavailable" : status?.readiness?.activationEligible ? "Solana mainnet eligible" : status?.readiness?.networkReady ? "Solana mainnet verified; activation blocked" : status ? "Solana mainnet not verified" : "Checking Solana mainnet…"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {error
          ? "The readiness request failed. It will retry automatically."
          : status?.readiness?.blockers?.[0] || "Read-only Solana/Raydium readiness is being checked."}
      </p>
      {!error && status?.readiness && (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-mono">
            Cluster {status.readiness.cluster} · Activation {status.readiness.activation} · Checked {new Date(status.readiness.checkedAt).toLocaleTimeString()}
          </p>
          {status.readiness.blockers.length > 1 && (
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              {status.readiness.blockers.slice(1, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3">Server-side RPC access only. No wallet signing, transaction construction, contract deployment, or fund movement. Mainnet activation fails closed until every readiness gate passes. Refreshes every minute.</p>
    </div>
  );
}