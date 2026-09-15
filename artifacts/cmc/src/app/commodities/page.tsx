"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, AlertCircle, RefreshCw, Clock, ExternalLink, Activity } from "lucide-react";
import { QUOTE_CATALOGUE, useMarkets, CATEGORIES, Category } from "@/lib/store";
import { CommodityImage } from "@/components/CommodityImage";
import type { CommodityQuotesResponse } from "@/lib/commodity-quotes";
import Link from "next/link";
import { TokenAvatar } from "@/components/TokenAvatar";

const SIDEBAR_GROUPS = [
  {
    title: "Resources",
    items: ["Metals", "Energy", "Water"]
  },
  {
    title: "Food & agriculture",
    items: ["Agriculture", "Livestock", "Fast food"]
  },
  {
    title: "Collectibles & gaming",
    items: ["Trading cards", "CS2 skins", "Game gold"]
  },
  {
    title: "Alternative markets",
    items: ["Cars", "Currencies"]
  }
];

export default function CommoditiesCataloguePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"Official" | "Community">("Official");
  const [activeCategory, setActiveCategory] = useState<"All" | Category>("All");
  const [search, setSearch] = useState("");
  const { markets, loading: marketsLoading } = useMarkets();

  const { data, isLoading, error, refetch, isRefetching } = useQuery<CommodityQuotesResponse>({
    queryKey: ["commodity-quotes"],
    queryFn: async ({ signal }) => {
      const abortController = new AbortController();
      const id = setTimeout(() => abortController.abort(), 12000);
      try {
        // Tanstack query provides a signal, but we also enforce a 12s timeout
        const res = await fetch("/market-data/quotes", {
          signal: AbortSignal.any([signal, abortController.signal])
        });
        if (!res.ok) throw new Error("Failed to fetch quotes");
        return await res.json();
      } catch (err: any) {
        if (err.name === 'AbortError') throw new Error("Request timed out after 12 seconds");
        throw err;
      } finally {
        clearTimeout(id);
      }
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    retry: 1,
    staleTime: 10000,
    enabled: activeTab === "Official",
  });

  const getMarketCount = (symbol: string) => {
    return markets.filter(m => 
      m.pairSymbol?.toLowerCase() === symbol.toLowerCase() || 
      m.pairComponents?.some(c => c.toLowerCase() === symbol.toLowerCase())
    ).length;
  };

  const counts = useMemo(() => {
    const c = { All: QUOTE_CATALOGUE.length } as Record<string, number>;
    CATEGORIES.forEach(cat => {
      if (cat !== "All") {
        c[cat] = QUOTE_CATALOGUE.filter(q => q.category === cat).length;
      }
    });
    return c;
  }, []);

  const searchLower = search.toLowerCase();

  const officialQuotes = useMemo(() => {
    return QUOTE_CATALOGUE.filter(q => {
      const matchesSearch = q.name.toLowerCase().includes(searchLower) || q.symbol.toLowerCase().includes(searchLower);
      const matchesCategory = activeCategory === "All" || q.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchLower, activeCategory]);

  const groupedOfficial = useMemo(() => {
    const groups: Record<string, typeof QUOTE_CATALOGUE> = {};
    officialQuotes.forEach(q => {
      if (!groups[q.category]) groups[q.category] = [];
      groups[q.category].push(q);
    });
    return groups;
  }, [officialQuotes]);

  const communityTokens = useMemo(() => {
    return markets.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(searchLower) || m.symbol.toLowerCase().includes(searchLower);
      // For community, category filter might just be "All" or match quote category
      const matchesCategory = activeCategory === "All" || m.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [markets, searchLower, activeCategory]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-mono tracking-tight mb-2">Commodities</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Browse CMC’s reference catalogue of commodities, collectibles, and everyday goods.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-8 border-b border-border/40 mb-8">
        <button 
          aria-pressed={activeTab === "Official"}
          onClick={() => setActiveTab("Official")}
          className={`pb-4 text-sm font-bold tracking-wide transition-colors relative disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === "Official" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Official
          {activeTab === "Official" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
        </button>
        <button 
          aria-pressed={activeTab === "Community"}
          onClick={() => setActiveTab("Community")}
          className={`pb-4 text-sm font-bold tracking-wide transition-colors relative disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === "Community" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Community
          {activeTab === "Community" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 items-start">
        <label className="lg:hidden w-full text-sm text-muted-foreground">Category
          <select aria-label="Filter commodity category" value={activeCategory} onChange={event => setActiveCategory(event.target.value as Category)} className="mt-2 w-full p-3 bg-card border border-border rounded-lg text-foreground">
            {CATEGORIES.map(category => <option key={category} value={category}>{category === "All" ? "All commodities" : category} ({activeTab === "Official" ? counts[category] : markets.filter(m => category === "All" || m.category === category).length})</option>)}
          </select>
        </label>
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-6 sticky top-24">
          <button 
            onClick={() => setActiveCategory("All")}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeCategory === "All" ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-white/5"}`}
          >
            <span>All commodities</span>
            <span className="font-mono text-xs opacity-70">{activeTab === "Official" ? counts["All"] : markets.length}</span>
          </button>

          {SIDEBAR_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-xs font-bold tracking-wider text-muted-foreground/60 uppercase mb-2 px-3">{group.title}</h3>
              <div className="flex flex-col gap-1">
                {group.items.map(cat => {
                  const isActive = activeCategory === cat;
                  const count = activeTab === "Official" 
                    ? counts[cat] 
                    : markets.filter(m => m.category === cat).length;
                  
                  // Even if count is 0, we show it, but maybe muted? 
                  return (
                    <button 
                      key={cat}
                      onClick={() => setActiveCategory(cat as Category)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-white/5"}`}
                    >
                      <span>{cat}</span>
                      {count !== undefined && <span className="font-mono text-xs opacity-70">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-xl font-bold">
              {activeTab === "Official" ? "Official commodities" : "Community tokens"}
              <span className="ml-3 text-sm font-normal text-muted-foreground">
                {activeTab === "Official" ? `${officialQuotes.length} commodities` : `${communityTokens.length} tokens`}
              </span>
            </h2>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                aria-label="Search commodities by name or symbol"
                type="text" 
                placeholder="Search name or symbol" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent border border-border/50 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
              />
            </div>
          </div>


          {activeTab === "Official" && (
            <div className="mb-6 bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-3">
              <Activity className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p>
                  Latest metal quotes plus daily EIA energy benchmarks and currency rates refresh every 30 seconds. Source dates are shown below; these are not universal real-time exchange quotes.
                  Missing feeds or change history are shown as unavailable. Market counts refer to local launches in this browser.
                </p>
                <button onClick={() => refetch()} disabled={isRefetching} className="mt-2 inline-flex items-center gap-1 text-primary disabled:opacity-50" aria-label="Refresh commodity prices"><RefreshCw className="h-3 w-3" /> Refresh prices</button>
                {isRefetching && <span className="text-primary inline-flex items-center gap-1 mt-1"><RefreshCw className="w-3 h-3 animate-spin" /> Updating...</span>}
              </div>
            </div>
          )}

          {activeTab === "Official" && error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-500 font-bold text-sm mb-1">Failed to connect to data feed</h3>
                <p className="text-xs text-red-400/80 mb-3">{error instanceof Error ? error.message : "Unknown error"}</p>
                <button onClick={() => refetch()} className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded flex items-center gap-2 transition-colors">
                  <RefreshCw className="w-3 h-3" /> Retry connection
                </button>
              </div>
            </div>
          )}

          {activeTab === "Official" && (
            <div className="space-y-10">
              {Object.keys(groupedOfficial).length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border/40 rounded-xl">
                  <p className="text-muted-foreground">No commodities found matching your criteria.</p>
                </div>
              ) : (
                Object.entries(groupedOfficial).map(([category, items]) => (
                  <div key={category}>
                    <div className="flex items-end justify-between border-b border-border/40 pb-2 mb-4">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        {category} <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
                      </h3>
                      <div className="hidden sm:flex text-xs font-bold tracking-wider text-muted-foreground uppercase gap-4">
                        <div className="w-32 text-right">Price</div>
                        <div className="w-24 text-right">Change</div>
                        <div className="w-20 text-right">Markets</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col">
                      {items.map(item => {
                        const quote = data?.quotes[item.symbol];
                        const marketCount = getMarketCount(item.symbol);
                        const isStale = !!quote && (Boolean(error) || (quote.status === "current" && !!quote.updatedAt && Date.now() - Date.parse(quote.updatedAt) > 5 * 60 * 1000));

                        return (
                          <div 
                            key={item.symbol}
                            role="link"
                            tabIndex={0}
                            aria-label={`Launch a token paired with ${item.name}`}
                            onKeyDown={event => { if (event.key === "Enter" && event.target === event.currentTarget) router.push(`/launch?pair=${item.symbol}`); }}
                            onClick={() => router.push(`/launch?pair=${item.symbol}`)}
                            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-3.5 px-3 -mx-3 cursor-pointer transition-colors rounded-lg mb-1 hover:bg-white/5 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.1)]"
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <CommodityImage symbol={item.symbol} className="w-10 h-10 rounded shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold truncate">{item.name}</span>
                                  <span className="text-xs font-mono text-muted-foreground shrink-0">{item.symbol}</span>
                                </div>
                                
                                {isLoading && !quote && (
                                  <div className="h-3 w-20 bg-muted/30 animate-pulse rounded mt-1"></div>
                                )}
                                
                                {quote && (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                                    {quote.status === 'daily' && <span className="bg-blue-500/10 text-blue-400 px-1 rounded">Daily</span>}
                                    {quote.status === 'reference' && <span className="bg-primary/10 text-primary px-1 rounded">Reference</span>}
                                    {isStale && <span className="text-primary">Stale</span>}
                                    {quote.source && quote.sourceUrl && (
                                      <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        {quote.source} <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                    {quote.updatedAt && (
                                      <span className={isStale ? "text-primary/80 flex items-center gap-1" : "flex items-center gap-1"} title={`${quote.updatedAt} — ${quote.message}`}>
                                        <Clock className="w-2.5 h-2.5" /> 
                                        {quote.status === "daily" ? quote.updatedAt : new Date(quote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-[minmax(0,1fr)_70px_60px] sm:flex items-center sm:justify-end gap-2 sm:gap-4">
                              <div className="sm:w-32 text-left sm:text-right">
                                <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Price</div>
                                {isLoading && !quote ? (
                                  <div className="h-4 w-16 bg-muted/30 animate-pulse rounded ml-auto"></div>
                                ) : quote?.priceUSD !== null && quote?.priceUSD !== undefined ? (
                                  <div className="font-mono text-sm">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: quote.priceUSD < 10 ? 4 : 2 }).format(quote.priceUSD)}
                                    <span className="text-[10px] text-muted-foreground ml-1">{item.unit}</span>
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground" title={quote?.message || "Feed not connected"}>
                                    {quote?.status === 'unavailable' ? (quote.source ? "Feed unavailable" : "Feed not connected") : '—'}
                                  </div>
                                )}
                              </div>

                              <div className="sm:w-24 text-left sm:text-right">
                                <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Change</div>
                                {isLoading && !quote ? (
                                  <div className="h-4 w-12 bg-muted/30 animate-pulse rounded ml-auto"></div>
                                ) : quote?.changePercent !== null && quote?.changePercent !== undefined ? (
                                  <div title={quote.message} className={`font-mono text-sm ${quote.changePercent > 0 ? 'text-green-400' : quote.changePercent < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                    {quote.changePercent > 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground" title="24h history not provided by source">
                                    —
                                  </div>
                                )}
                              </div>

                              <div className="sm:w-20 text-left sm:text-right font-mono text-sm text-muted-foreground">
                                <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Markets</div>
                                {marketCount}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}


          {activeTab === "Community" && (
            <div className="space-y-6">
              {marketsLoading ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-muted-foreground text-sm">Loading local markets...</p>
                </div>
              ) : communityTokens.length === 0 ? (
                <div className="py-16 px-6 text-center border border-dashed border-border/40 rounded-xl bg-white/5">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">No community tokens found</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    You haven't launched any local tokens matching this filter. Community tokens are stored locally in your browser.
                  </p>
                  <Link 
                    href="/launch" 
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Launch a Token
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="hidden sm:flex items-center px-2 text-xs font-bold tracking-wider text-muted-foreground uppercase border-b border-border/40 pb-2 mb-2 gap-4">
                    <div className="flex-1">Token</div>
                    <div className="w-32 text-right">Price (local)</div>
                    <div className="w-24 text-right">Change</div>
                    <div className="w-32 text-right">Local volume</div>
                  </div>
                  
                  {communityTokens.map(token => (
                    <div 
                      key={token.address}
                      role="link"
                      tabIndex={0}
                      onKeyDown={event => { if (event.key === "Enter") router.push(`/market/${token.address}`); }}
                      onClick={() => router.push(`/market/${token.address}`)}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 border-b border-border/20 hover:bg-white/5 cursor-pointer transition-colors px-2 -mx-2 rounded-lg"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <TokenAvatar 
                          imageURL={token.imageURL} 
                          name={token.name} 
                          symbol={token.symbol} 
                          className="w-10 h-10 shrink-0" 
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold truncate">{token.name}</span>
                            <span className="text-xs font-mono text-muted-foreground shrink-0">{token.symbol}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <span>Paired w/ {token.pairSymbol}</span>
                            <span className="opacity-50">•</span>
                            <span className="font-mono text-xs">{token.address.replace(/^DEMO-/i, "LOCAL-").substring(0, 14)}...</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end sm:gap-4 ml-14 sm:ml-0">
                        <div className="w-32 text-left sm:text-right">
                          <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Price</div>
                          <div className="font-mono text-sm">
                            {token.priceSOL < 0.01 ? token.priceSOL.toFixed(6) : token.priceSOL.toFixed(2)} SOL
                          </div>
                        </div>

                        <div className="w-24 text-left sm:text-right">
                          <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Change</div>
                          <div className={`font-mono text-sm ${token.change24h > 0 ? 'text-green-400' : token.change24h < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {token.change24h > 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                          </div>
                        </div>

                        <div className="w-32 text-left sm:text-right font-mono text-sm">
                          <div className="text-[10px] text-muted-foreground uppercase sm:hidden mb-1">Volume</div>
                          ${token.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
