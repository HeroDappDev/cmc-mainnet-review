"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ExternalLink, History, RefreshCw, ShieldCheck } from "lucide-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getPdaLaunchpadPoolId, toBN } from "@raydium-io/raydium-sdk-v2";
import { cn } from "@/lib/utils";
import { fetchChainMarkets, type IndexedMarket } from "@/lib/onchain-api";
import { findDevnetLaunchReceipt, type DevnetLaunchReceipt } from "@/lib/market-receipts";
import {
  CMC_DEVNET_ADMIN,
  CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
  CMC_DEVNET_PLATFORM_ID,
  DEVNET_CLUSTER,
  DEVNET_LAUNCHLAB_PROGRAM_ID,
  WSOL_MINT,
  createBrowserRecoveryStore,
  createLiveWalletSigner,
  fetchFinalizedLaunchLabPoolState,
  prepareCpmmSwapTransaction,
  prepareLaunchLabTransaction,
  quoteFinalizedCpmmSwap,
  quoteLaunchLabBuyExactIn,
  quoteLaunchLabSellExactIn,
  signAndSubmitLaunchLab,
  type LaunchLabPoolState,
  type LaunchLabQuote,
  type PreparedLaunchLabTransaction,
} from "@/lib/solana-transactions";

type TradeType = "buy" | "sell";
const RPC = "https://api.devnet.solana.com";
const TOKEN_DECIMALS = 6;
const FEE_BPS = 75;
type BN = ReturnType<typeof toBN>;

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function decimalUnits(value: string, decimals: number, field: string): BN {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    throw new Error(`${field} must be a positive number, for example 0.001.`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`${field} supports at most ${decimals} decimal places.`);
  const units = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error(`${field} must be greater than zero.`);
  return toBN(units.toString());
}

function unitsToDecimal(value: string | null | undefined, decimals: number) {
  if (!value) return "";
  try {
    const units = BigInt(value);
    const divisor = 10n ** BigInt(decimals);
    const whole = units / divisor;
    const fraction = (units % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return "";
  }
}

function indexedQuote(indexed: IndexedMarket | undefined, type: TradeType, amount: string) {
  if (!indexed?.virtualBase || !indexed.virtualQuote) return "";
  try {
    const base = BigInt(indexed.virtualBase);
    const quote = BigInt(indexed.virtualQuote);
    const input = BigInt(decimalUnits(amount, type === "buy" ? 9 : TOKEN_DECIMALS, "Amount").toString());
    if (base <= 0n || quote <= 0n || input <= 0n) return "";
    const netInput = input * BigInt(10_000 - FEE_BPS) / 10_000n;
    const output = type === "buy"
      ? base * netInput / (quote + netInput)
      : quote * input / (base + input) * BigInt(10_000 - FEE_BPS) / 10_000n;
    return type === "buy" ? unitsToDecimal(output.toString(), TOKEN_DECIMALS) : unitsToDecimal(output.toString(), 9);
  } catch {
    return "";
  }
}

export default function MarketPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [indexed, setIndexed] = useState<IndexedMarket>();
  const [receipt, setReceipt] = useState<DevnetLaunchReceipt>();
  const [pool, setPool] = useState<LaunchLabPoolState>();
  const [loading, setLoading] = useState(true);
  const [indexError, setIndexError] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>("buy");
  const [amount, setAmount] = useState("");
  const slippage = "100";
  const [wallet, setWallet] = useState("");
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [prepared, setPrepared] = useState<PreparedLaunchLabTransaction>();
  const [cpmmQuote, setCpmmQuote] = useState<{ amountOut: BN; minimumAmountOut: BN }>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"connect" | "prepare" | "sign" | "">("");
  const connection = useMemo(() => new Connection(RPC, "confirmed"), []);
  const transactionConnection = useMemo(
    () => connection as unknown as Parameters<typeof prepareLaunchLabTransaction>[1],
    [connection],
  );

  useEffect(() => {
    let cancelled = false;
    setReceipt(findDevnetLaunchReceipt(address));
    const load = async () => {
      setLoading(true);
      setIndexError("");
      let routeMint: PublicKey;
      try {
        routeMint = new PublicKey(address);
      } catch {
        if (!cancelled) {
          setIndexError("The route is not a valid Solana mint.");
          setLoading(false);
        }
        return;
      }
      const poolAddress = getPdaLaunchpadPoolId(
        new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
        routeMint,
        WSOL_MINT,
      ).publicKey;
      let poolReason: unknown;
      for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
        try {
          const state = await fetchFinalizedLaunchLabPoolState(transactionConnection, poolAddress);
          if (!cancelled) setPool(state);
          poolReason = undefined;
          break;
        } catch (reason) {
          poolReason = reason;
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
      if (!cancelled && poolReason) setIndexError(poolReason instanceof Error ? poolReason.message : "Finalized LaunchLab pool is unavailable.");
      try {
        const response = await fetchChainMarkets();
        const match = response.markets.find((market) => market.cluster === "devnet" && market.baseMint?.toLowerCase() === address.toLowerCase());
        if (!cancelled) setIndexed(match);
      } catch (reason) {
        if (!cancelled && !pool) setIndexError(reason instanceof Error ? reason.message : "Finalized market index is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [address, transactionConnection]);

  const mint = pool ? address : indexed?.baseMint ?? receipt?.mint;
  const name = receipt?.name ?? "Devnet market";
  const symbol = receipt?.symbol ?? (mint ? short(mint) : "TOKEN");
  const pair = receipt?.pairSymbol ?? "SOL";
  let directQuote: LaunchLabQuote | undefined;
  if (pool && pool.status !== 2 && amount) {
    try {
      const units = decimalUnits(amount, tradeType === "buy" ? 9 : TOKEN_DECIMALS, "Amount");
      const bps = Number(slippage);
      if (Number.isInteger(bps) && bps >= 0 && bps < 10_000) {
        directQuote = tradeType === "buy"
          ? quoteLaunchLabBuyExactIn(pool, units, { slippageBps: bps })
          : quoteLaunchLabSellExactIn(pool, units, { slippageBps: bps });
      }
    } catch {
      directQuote = undefined;
    }
  }
  const activeQuote = pool?.status === 2 ? cpmmQuote : directQuote;
  const estimated = activeQuote
    ? unitsToDecimal(activeQuote.amountOut.toString(), tradeType === "buy" ? TOKEN_DECIMALS : 9)
    : indexedQuote(indexed, tradeType, amount);
  const directMinimum = activeQuote
    ? unitsToDecimal(activeQuote.minimumAmountOut.toString(), tradeType === "buy" ? TOKEN_DECIMALS : 9)
    : "";
  const effectiveExpected = directMinimum || estimated;
  const finalized = Boolean(pool || indexed);

  useEffect(() => {
    let cancelled = false;
    if (!pool || pool.status !== 2 || !amount) {
      setCpmmQuote(undefined);
      return;
    }
    try {
      const units = decimalUnits(amount, tradeType === "buy" ? 9 : TOKEN_DECIMALS, "Amount");
      void quoteFinalizedCpmmSwap(transactionConnection, new PublicKey(address), tradeType, units)
        .then((quote) => {
          if (!cancelled) setCpmmQuote({
            amountOut: quote.amountOut,
            minimumAmountOut: quote.minimumAmountOut,
          });
        })
        .catch(() => { if (!cancelled) setCpmmQuote(undefined); });
    } catch {
      setCpmmQuote(undefined);
    }
    return () => { cancelled = true; };
  }, [pool, amount, tradeType, transactionConnection, address]);

  const refreshTokenBalance = async (walletAddress: string) => {
    if (!mint) return;
    const owner = new PublicKey(walletAddress);
    const tokenAccount = getAssociatedTokenAddressSync(new PublicKey(mint), owner);
    try {
      const balance = await connection.getTokenAccountBalance(tokenAccount, "finalized");
      setTokenBalance(BigInt(balance.value.amount));
    } catch {
      setTokenBalance(0n);
    }
  };

  const fillSellPercent = (percent: 25 | 50 | 100) => {
    const units = percent === 100 ? tokenBalance : tokenBalance * BigInt(percent) / 100n;
    setAmount(unitsToDecimal(units.toString(), TOKEN_DECIMALS));
    setPrepared(undefined);
  };

  useEffect(() => {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) return;
    let active = true;
    const applyWallet = async (publicKey: { toString(): string } | null | undefined) => {
      const address = publicKey?.toString();
      if (!active || !address) return;
      setWallet(address);
      await refreshTokenBalance(address);
    };
    if (provider.publicKey) {
      void applyWallet(provider.publicKey);
    } else {
      void provider.connect({ onlyIfTrusted: true })
        .then((result) => applyWallet(result?.publicKey ?? provider.publicKey))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [mint, connection]);

  const connectWallet = async () => {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      setError("Phantom is required for a reviewed devnet transaction.");
      return;
    }
    setBusy("connect");
    setError("");
    try {
      const result = await provider.connect({ onlyIfTrusted: false });
      const address = result?.publicKey?.toString() || provider.publicKey?.toString();
      if (!address) throw new Error("Phantom did not provide a wallet address.");
      setWallet(address);
      await refreshTokenBalance(address);
      setStatus("Wallet connected. Review the amount, slippage, and transaction before signing.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection was not approved.");
    } finally {
      setBusy("");
    }
  };

  const prepareTrade = async () => {
    if (!mint) return setError("This route is not a confirmed devnet mint.");
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) return setError("Phantom is required for a reviewed devnet transaction.");
    setBusy("prepare");
    setError("");
    setStatus("");
    try {
      let walletAddress = wallet || provider.publicKey?.toString();
      if (!walletAddress) {
        const result = await provider.connect({ onlyIfTrusted: false });
        walletAddress = result?.publicKey?.toString() || provider.publicKey?.toString();
      }
      if (!walletAddress) throw new Error("Connect Phantom before preparing a transaction.");
      setWallet(walletAddress);
      await refreshTokenBalance(walletAddress);
      const amountUnits = decimalUnits(amount, tradeType === "buy" ? 9 : TOKEN_DECIMALS, "Amount");
      const bps = Number(slippage);
      if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) throw new Error("Slippage must be an integer from 0 to 9999 bps.");
      if (!pool) throw new Error("The finalized LaunchLab pool must be decoded before preparing a trade.");
      if (pool.status === 2) {
        const result = await prepareCpmmSwapTransaction({
          cluster: DEVNET_CLUSTER,
          wallet: new PublicKey(walletAddress),
          mint: new PublicKey(mint),
          side: tradeType,
          amountIn: amountUnits,
        }, transactionConnection);
        setPrepared(result.prepared);
        setStatus(`${tradeType === "buy" ? "Buy" : "Sell"} prepared and simulated against the finalized CPMM pool. Review the exact transaction, then sign it.`);
        return;
      }
      const quote = tradeType === "buy"
        ? quoteLaunchLabBuyExactIn(pool, amountUnits, { slippageBps: bps })
        : quoteLaunchLabSellExactIn(pool, amountUnits, { slippageBps: bps });
      const creator = receipt?.creator ?? indexed?.creator ?? pool.creator.toBase58();
      const next = await prepareLaunchLabTransaction({
        operation: tradeType,
        cluster: DEVNET_CLUSTER,
        wallet: new PublicKey(walletAddress),
        creator: new PublicKey(creator),
        platformAdmin: CMC_DEVNET_ADMIN,
        programId: new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
        platformId: CMC_DEVNET_PLATFORM_ID,
        configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
        mintA: new PublicKey(mint),
        amount: quote.amountInUsed,
        minAmount: quote.minimumAmountOut,
      }, transactionConnection);
      setPrepared(next);
      const refund = quote.refund.isZero() ? "" : ` ${unitsToDecimal(quote.refund.toString(), 9)} SOL remains in your wallet.`;
      setStatus(`${tradeType === "buy" ? "Buy" : "Sell"} prepared and simulated.${refund} Review the exact transaction, then sign it.`);
    } catch (reason) {
      setPrepared(undefined);
      setError(reason instanceof Error ? reason.message : "Unable to prepare the reviewed transaction.");
    } finally {
      setBusy("");
    }
  };

  const signTrade = async () => {
    const provider = window.phantom?.solana;
    if (!prepared || !provider?.isPhantom) return setError("Prepare a transaction and keep Phantom connected before signing.");
    setBusy("sign");
    setError("");
    try {
      const result = await signAndSubmitLaunchLab(
        prepared,
        createLiveWalletSigner(provider),
        transactionConnection,
        createBrowserRecoveryStore(),
      );
      if (result.status !== "finalized") throw new Error(`Trade ${result.status}. Signature: ${result.signature}`);
      setStatus(`Finalized devnet ${tradeType}: ${result.signature}. The indexer will publish activity after its next finalized pass.`);
      setPrepared(undefined);
      setAmount("");
      await refreshTokenBalance(wallet);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet signing or submission failed.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!mint) {
    return <div className="container mx-auto px-4 py-16 text-center"><h1 className="mb-4 text-2xl font-bold">Market Not Found</h1><p className="mb-8 text-muted-foreground">Only confirmed onchain devnet mints have market pages. Browser-local practice tokens are not supported here.</p><Link href="/" className="text-primary hover:underline">Return to active markets</Link></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to active markets</Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-3"><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Solana devnet</span>{finalized && <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Finalized pool verified</span>}</div>
          <h1 className="text-3xl font-bold tracking-tight">{name} <span className="text-base text-muted-foreground">{symbol}/{pair}</span></h1>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Mint: {mint}</p>
        </div>
        <a href={`https://explorer.solana.com/address/${mint}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">View on Solana Explorer <ExternalLink className="h-4 w-4" /></a>
      </div>

      {indexError && <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">Historical indexing is still catching up. Trading quotes come directly from the finalized on-chain pool; no local market or trade data is being used.</div>}
      {receipt?.description && <div className="mb-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{receipt.description}</div>}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="relative h-[360px] rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Price chart</h2><span className="text-xs font-mono text-muted-foreground">FINALIZED DATA ONLY</span></div>
            <div className="flex h-[270px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 text-center text-muted-foreground"><ShieldCheck className="mb-3 h-8 w-8 text-primary/70" /><p className="font-semibold">Chart history is not available yet</p><p className="mt-2 max-w-md text-xs">No synthetic candles or browser-local prices are shown. The durable index currently exposes finalized launch/account state, not a finalized swap time series.</p></div>
          </section>

          <section className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-secondary/40 p-4"><div className="mb-2 text-xs text-muted-foreground">Launch state</div><div className="font-mono text-sm">{indexed?.status ?? (pool ? "Trading" : "Pending")}</div></div>
            <div className="rounded-lg border border-border bg-secondary/40 p-4"><div className="mb-2 text-xs text-muted-foreground">SOL remaining</div><div className="font-mono text-sm">{pool ? unitsToDecimal(pool.totalFundRaisingB.sub(pool.realB).toString(), 9) : "Pending"} SOL</div></div>
            <div className="rounded-lg border border-border bg-secondary/40 p-4"><div className="mb-2 text-xs text-muted-foreground">Observed slot</div><div className="font-mono text-sm">{indexed?.observedSlot?.toLocaleString() ?? "Direct finalized read"}</div></div>
            <div className="rounded-lg border border-border bg-secondary/40 p-4"><div className="mb-2 text-xs text-muted-foreground">Launch signature</div>{(indexed?.observedSignature ?? receipt?.signature) ? <a href={`https://explorer.solana.com/tx/${indexed?.observedSignature ?? receipt?.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline">{short(indexed?.observedSignature ?? receipt!.signature)} <ArrowUpRight className="h-3 w-3" /></a> : <div className="font-mono text-sm">See Explorer</div>}</div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6"><h2 className="mb-4 flex items-center gap-2 font-bold"><History className="h-4 w-4 text-primary" /> Finalized activity</h2><div className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">No finalized swap activity has been published for this mint yet. Activity will appear here from the durable chain index; it will never be populated from browser storage.</div></section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5"><h2 className="text-xl font-bold">Trade {symbol}</h2><p className="mt-2 text-xs text-muted-foreground">Devnet only. Buy and Sell prepare the reviewed LaunchLab or graduated CPMM transaction and request an explicit Phantom signature. No demo wallet or local trade execution is used.</p></div>
            <div className="mb-5 flex rounded-lg bg-secondary/50 p-1"><button className={cn("flex-1 rounded-md py-2 text-sm font-bold", tradeType === "buy" ? "bg-background shadow" : "text-muted-foreground")} onClick={() => { setTradeType("buy"); setPrepared(undefined); }}>Buy</button><button className={cn("flex-1 rounded-md py-2 text-sm font-bold", tradeType === "sell" ? "bg-background shadow" : "text-muted-foreground")} onClick={() => { setTradeType("sell"); setPrepared(undefined); }}>Sell</button></div>
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-muted-foreground">{tradeType === "buy" ? "Spend SOL" : `Sell ${symbol}`}<input value={amount} onChange={(event) => { setAmount(event.target.value); setPrepared(undefined); }} inputMode="decimal" placeholder={tradeType === "buy" ? "Enter amount, e.g. 0.001" : "Enter token amount"} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 font-mono text-lg outline-none focus:border-primary" /></label>
              {tradeType === "sell" && <div className="rounded-lg border border-border bg-secondary/30 p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Wallet balance</span><span className="break-all font-mono font-bold text-foreground">{unitsToDecimal(tokenBalance.toString(), TOKEN_DECIMALS)} {symbol}</span></div><div className="mt-3 grid grid-cols-3 gap-2">{([25, 50, 100] as const).map((percent) => <button key={percent} type="button" onClick={() => fillSellPercent(percent)} disabled={!wallet || tokenBalance === 0n} className="rounded-md border border-border bg-background py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{percent === 100 ? "MAX" : `${percent}%`}</button>)}</div></div>}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold text-muted-foreground">You receive approximately</div>
                <div className="mt-1 break-all font-mono text-xl font-bold text-primary">{estimated || "—"} {tradeType === "buy" ? symbol : "SOL"}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">CMC automatically applies a 1% minimum-output safety limit using the finalized pool quote.</div>
              </div>
              {tradeType === "buy" && directQuote && <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Requested</span><span className="font-mono">{unitsToDecimal(directQuote.amountIn.toString(), 9)} SOL</span></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Executable</span><span className="font-mono">{unitsToDecimal(directQuote.amountInUsed.toString(), 9)} SOL</span></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Unused in wallet</span><span className="font-mono">{unitsToDecimal(directQuote.refund.toString(), 9)} SOL</span></div></div>}
            </div>
            {wallet ? <div className="mt-4 break-all text-xs text-muted-foreground">Wallet: <span className="font-mono text-foreground">{short(wallet)}</span></div> : <button onClick={() => void connectWallet()} disabled={busy !== ""} className="mt-4 w-full rounded-lg border border-border py-2 text-sm font-bold hover:border-primary disabled:opacity-50">{busy === "connect" ? "Connecting…" : "Connect Phantom"}</button>}
            {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
            {status && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{status}</div>}
            {!prepared ? <button onClick={() => void prepareTrade()} disabled={busy !== "" || !amount} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{busy === "prepare" ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{busy === "prepare" ? "Preparing and simulating…" : tradeType === "buy" ? "Review buy" : "Review sell"}</button> : <button onClick={() => void signTrade()} disabled={busy !== ""} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-bold text-white disabled:opacity-50">{busy === "sign" ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{busy === "sign" ? "Waiting for confirmation…" : "Approve in Phantom"}</button>}
          </section>
        </div>
      </div>
    </div>
  );
}