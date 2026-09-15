"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getPdaLaunchpadPoolId } from "@raydium-io/raydium-sdk-v2";
import { fetchChainMarkets, type IndexedMarket } from "@/lib/onchain-api";
import { readDevnetLaunchReceipts, type DevnetLaunchReceipt } from "@/lib/market-receipts";
import {
  DEVNET_LAUNCHLAB_PROGRAM_ID,
  WSOL_MINT,
  fetchFinalizedLaunchLabPoolState,
} from "@/lib/solana-transactions";

const DEVNET_RPC = "https://api.devnet.solana.com";
const VERIFIED_GRADUATED_MINTS = ["6px2Wii1MwANi7PdDBmp8RJUVrKHRgbUc4sJDbJR6d3r"] as const;

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export default function Home() {
  const [indexedMarkets, setIndexedMarkets] = useState<IndexedMarket[]>([]);
  const [receipts, setReceipts] = useState<DevnetLaunchReceipt[]>([]);
  const [directMints, setDirectMints] = useState<string[]>([]);
  const [marketsError, setMarketsError] = useState("");
  const [loadingMarkets, setLoadingMarkets] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingMarkets(true);
      setMarketsError("");
      setReceipts(readDevnetLaunchReceipts());
      const connection = new Connection(DEVNET_RPC, "confirmed");
      const verified = await Promise.all(VERIFIED_GRADUATED_MINTS.map(async (mint) => {
        try {
          const mintKey = new PublicKey(mint);
          const poolId = getPdaLaunchpadPoolId(
            new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
            mintKey,
            WSOL_MINT,
          ).publicKey;
          const state = await fetchFinalizedLaunchLabPoolState(
            connection as unknown as Parameters<typeof fetchFinalizedLaunchLabPoolState>[0],
            poolId,
          );
          return state.status === 2 ? mint : null;
        } catch {
          return null;
        }
      }));
      if (!cancelled) setDirectMints(verified.filter((mint) => mint !== null));
      try {
        const response = await fetchChainMarkets();
        if (!cancelled) setIndexedMarkets(response.markets.filter((market) => market.cluster === "devnet" && Boolean(market.baseMint)));
      } catch (reason) {
        if (!cancelled) {
          setIndexedMarkets([]);
          setMarketsError(reason instanceof Error ? reason.message : "Finalized market index is unavailable.");
        }
      } finally {
        if (!cancelled) setLoadingMarkets(false);
      }
    };
    void load();
    const refresh = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  const indexedMints = new Set(indexedMarkets.map((market) => market.baseMint));
  const receiptMarkets = receipts.filter((receipt) => !indexedMints.has(receipt.mint));
  const receiptMints = new Set(receiptMarkets.map((receipt) => receipt.mint));
  const directMarkets = directMints.filter((mint) => !indexedMints.has(mint) && !receiptMints.has(mint));
  const activeMarketCount = indexedMarkets.length + receiptMarkets.length + directMarkets.length;

  return (
    <div className="flex flex-col w-full min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 border-b border-border/50 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-full max-h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10"></div>
        
        <div className="flex flex-col lg:flex-row gap-12 lg:items-center justify-between relative z-10">
          
          {/* Left: Text & CTA */}
          <div className="max-w-2xl flex-1">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight text-foreground">
              Markets paired<br />with <span className="text-primary">real commodities</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
              Create community tokens on Solana with commodity references, from gold and crude to wheat. Explore single-commodity markets or build a basket of up to five references.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-5">
              <Link 
                href="/launch" 
                className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Launch a market
              </Link>
              <Link 
                href="/commodities" 
                className="px-6 py-3 bg-secondary text-secondary-foreground font-bold rounded-xl hover:bg-secondary/80 transition-colors border border-border"
              >
                Browse commodities
              </Link>
            </div>
            <div className="mb-12 rounded-xl border-2 border-primary/80 bg-primary/10 px-6 py-5 text-center font-mono text-lg sm:text-xl font-bold tracking-wider text-primary shadow-lg shadow-primary/10">
              CA: COMING SOON
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-border/50">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-mono">Markets</div>
                <div className="text-2xl font-mono font-bold text-foreground">{activeMarketCount}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-mono">Commodities</div>
                <div className="text-2xl font-mono font-bold text-foreground">36</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-mono">24h Volume</div>
                <div className="text-2xl font-mono font-bold text-foreground">—</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-mono">Value Locked</div>
                <div className="text-2xl font-mono font-bold text-foreground">—</div>
              </div>
            </div>
          </div>

          {/* Right: Exchange Coin Panel */}
          <div className="w-full lg:w-[420px] shrink-0">
            <div className="bg-card rounded-2xl border border-border overflow-hidden p-8 flex flex-col h-full shadow-2xl relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full pointer-events-none"></div>
              
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-8">Exchange Coin</div>
              
              <div className="flex items-center gap-4 mb-8">
                <img src="/images/cmc-logo.png" alt="Commodity Markets Capital logo" width={64} height={64} className="w-16 h-16 object-contain shrink-0" />
                <div>
                  <div className="font-bold text-xl leading-none text-foreground mb-1">$CMC</div>
                  <div className="text-sm text-muted-foreground">Commodity Markets Capital</div>
                </div>
              </div>

              <div className="mb-8">
                <div className="text-xs text-muted-foreground mb-2">CMC price · SOL</div>
                <div className="text-4xl md:text-5xl font-mono font-bold text-foreground mb-3 tracking-tight">—</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  NOT LIVE · PRICE DATA PENDING
                </div>
                <p className="text-sm text-muted-foreground mt-4">Contract address will be added at launch. Live price tracking is not connected yet.</p>
              </div>

              <div className="mt-auto pt-6 border-t border-border/50 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1.5 font-mono uppercase tracking-wide">Network</div>
                  <div className="font-mono font-bold text-sm">Solana</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1.5 font-mono uppercase tracking-wide">24h change</div>
                  <div className="font-mono font-bold text-sm">—</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1.5 font-mono uppercase tracking-wide">Market cap</div>
                  <div className="font-mono font-bold text-sm">—</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Where the fees go Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-4 tracking-tight">Where the fees go</h2>
        <p className="text-muted-foreground max-w-3xl mb-10 text-lg">
          Fixed fee policy: 0.25% Raydium protocol fee plus 0.50% CMC platform fee during the curve.
        </p>

        {/* Visual Bar */}
        <div className="w-full h-3 flex rounded-full overflow-hidden mb-6 bg-secondary shadow-inner">
          <div className="h-full bg-emerald-500 w-1/3" title="0.25% Raydium"></div>
          <div className="h-full bg-primary w-2/3" title="0.50% CMC Platform"></div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-8 mb-12 text-sm font-mono uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm"></div>
            Raydium Protocol (0.25%)
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-primary shadow-sm"></div>
            CMC Platform (0.50%)
          </div>
        </div>

        {/* Fee Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-border/80 transition-colors">
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4">Paid to holders</div>
            <div className="text-3xl font-mono font-bold text-foreground mb-2">0</div>
            <div className="text-sm text-muted-foreground">No automatic holder payouts</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-border/80 transition-colors">
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4">$CMC Bought Back</div>
            <div className="text-3xl font-mono font-bold text-foreground mb-2">—</div>
            <div className="text-sm text-muted-foreground">Buybacks are not active</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-border/80 transition-colors">
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4">Platform allocation</div>
            <div className="text-3xl font-mono font-bold text-foreground mb-2 flex items-baseline gap-2">
              0.50%
            </div>
            <div className="text-sm text-muted-foreground">CMC share of curve fees</div>
          </div>
        </div>
      </section>

      {/* Active Markets: finalized index projections and confirmed receipts. */}
      <section className="container mx-auto px-4 py-16 border-t border-border/50">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Active Markets</h2>
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Solana devnet</span>
        </div>

        {loadingMarkets ? (
          <div className="py-20 bg-card/50 border border-border rounded-2xl border-dashed text-center text-muted-foreground">Loading finalized devnet markets…</div>
        ) : activeMarketCount === 0 ? (
          <div className="py-24 bg-card/50 border border-border rounded-2xl border-dashed flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6 border border-border/50 shadow-sm">
              <img src="/images/cmc-logo.png" alt="" width={48} height={48} className="w-12 h-12 object-contain" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">No finalized devnet markets yet</h3>
            <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
              Markets appear after a finalized LaunchLab transaction is observed. Browser-local practice tokens are never listed.
            </p>
            <Link 
              href="/launch"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Preview a launch <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            {marketsError && (
              <div className="mb-5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                Finalized index temporarily unavailable. Showing confirmed launch receipts until it recovers.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {indexedMarkets.map((market) => {
                const receipt = receipts.find((item) => item.mint === market.baseMint);
                const mint = market.baseMint!;
                return (
                  <Link key={mint} href={`/market/${mint}`} className="bg-card border border-border rounded-xl p-5 hover:border-primary/60 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div>
                        <div className="font-bold text-lg">{receipt?.name ?? "Devnet market"}</div>
                        <div className="font-mono text-sm text-primary">{receipt?.symbol ?? short(mint)}</div>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-400">Finalized</span>
                    </div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between gap-3"><span>Mint</span><span className="font-mono text-foreground">{short(mint)}</span></div>
                      <div className="flex justify-between gap-3"><span>Observed slot</span><span className="font-mono text-foreground">{market.observedSlot.toLocaleString()}</span></div>
                      <div className="flex justify-between gap-3"><span>State</span><span className="font-mono text-foreground">{market.status}</span></div>
                    </div>
                  </Link>
                );
              })}
              {receiptMarkets.map((receipt) => (
                <Link key={receipt.mint} href={`/market/${receipt.mint}`} className="bg-card border border-primary/30 rounded-xl p-5 hover:border-primary/60 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <div className="font-bold text-lg">{receipt.name}</div>
                      <div className="font-mono text-sm text-primary">{receipt.symbol}</div>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Receipt saved</span>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-3"><span>Mint</span><span className="font-mono text-foreground">{short(receipt.mint)}</span></div>
                    <div className="flex justify-between gap-3"><span>Launch tx</span><span className="font-mono text-foreground">{short(receipt.signature)}</span></div>
                    <div className="text-primary">Awaiting finalized index projection</div>
                  </div>
                </Link>
              ))}
              {directMarkets.map((mint) => (
                <Link key={mint} href={`/market/${mint}`} className="bg-card border border-emerald-500/30 rounded-xl p-5 hover:border-primary/60 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <div className="font-bold text-lg">Graduated devnet market</div>
                      <div className="font-mono text-sm text-primary">{short(mint)}</div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-400">On-chain verified</span>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-3"><span>Mint</span><span className="font-mono text-foreground">{short(mint)}</span></div>
                    <div className="flex justify-between gap-3"><span>State</span><span className="font-mono text-foreground">CPMM trading</span></div>
                    <div className="text-emerald-400">Verified directly at finalized commitment</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Bottom Information Cards */}
      <section className="container mx-auto px-4 py-12 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-xl p-8 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm"></div>
              <h3 className="font-bold text-xl tracking-tight">Launch</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Try a local launch at an illustrative 5 SOL opening cap. Choose one commodity reference or a basket of up to five. No real funds or onchain deployment are involved.
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-8 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full bg-primary shadow-sm"></div>
              <h3 className="font-bold text-xl tracking-tight">Curve</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Explore an illustrative curve targeting an 80 SOL cap. Supply is 1 billion: 800M for the curve and 200M in reserve. Raydium graduation remains blocked pending testing.
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-8 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full bg-zinc-500 shadow-sm"></div>
              <h3 className="font-bold text-xl tracking-tight">Fees</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Fixed 0.75% curve fee for this local preview (0.25% to Raydium, 0.50% to CMC platform). There are no holder rewards or automatic buybacks.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
