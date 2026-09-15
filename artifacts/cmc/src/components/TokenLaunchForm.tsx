"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { QUOTE_CATALOGUE, OPENING_FDV_SOL, GRADUATION_FDV_SOL, NET_RAISE_SOL, TOTAL_SUPPLY, FEE_PERCENT } from "@/lib/store";
import { AlertCircle, RefreshCw, X, ChevronRight, ChevronDown, Image as ImageIcon } from "lucide-react";
import { uploadTokenImage } from "@/lib/token-image-upload";
import {
  CMC_DEVNET_ADMIN,
  CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
  CMC_DEVNET_LAUNCH_DECIMALS,
  CMC_DEVNET_LAUNCH_SUPPLY,
  CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
  CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
  CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
  CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
  CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
  CMC_DEVNET_PLATFORM_ID,
  DEVNET_CLUSTER,
  DEVNET_LAUNCHLAB_PROGRAM_ID,
  createBrowserRecoveryStore,
  createLiveWalletSigner,
  prepareLaunchLabTransaction,
  signAndSubmitLaunchLab,
} from "@/lib/solana-transactions";
import { persistDevnetLaunchReceipt } from "@/lib/market-receipts";

interface TokenLaunchFormProps {
  selection: { isBasket: boolean; symbols: string[] };
  initialData?: {
    name?: string;
    symbol?: string;
    initialBuySOL?: string;
  };
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

function validateURL(url: string, fieldName: string): string | null {
  if (!url) return null;
  if (url.length > 2048) return `${fieldName} URL must be 2048 characters or less.`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${fieldName} must use http:// or https:// protocol.`;
    }
    if (!parsed.hostname) {
      return `${fieldName} must have a valid hostname.`;
    }
    if (parsed.username || parsed.password) {
      return `${fieldName} must not contain credentials.`;
    }
    return null;
  } catch {
    return `${fieldName} must be a valid URL.`;
  }
}

export function TokenLaunchForm({ selection, initialData, onSubmittingChange }: TokenLaunchFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({ 
    name: initialData?.name || "", 
    symbol: initialData?.symbol || "", 
    initialBuySOL: initialData?.initialBuySOL || "0.5",
    description: "",
    website: "",
    twitter: "",
    telegram: ""
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [showOptionals, setShowOptionals] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setError(""); }, [formData, selection, imageFile]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [launchResult, setLaunchResult] = useState<{ mint: string; signature: string } | null>(null);
  const [launchStatus, setLaunchStatus] = useState("");

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 4 * 1024 * 1024) {
      setError("Image must be smaller than 4MB");
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError("Image must be PNG, JPEG, or WebP");
      return;
    }
    
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
    setError("");
  };

  const handleClearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const quoteInfo = useMemo(() => {
    if (selection.symbols.length === 0) return { usd: 0, label: "None" };
    if (selection.isBasket) return { usd: 1.0, label: "BASKET" };
    const q = QUOTE_CATALOGUE.find(i => i.symbol === selection.symbols[0]);
    return { usd: q?.usdReference || 1, label: q?.symbol || "Unknown" };
  }, [selection]);

  const handleLaunch = async () => {
    setError("");
    setLaunchResult(null);
    setLaunchStatus("");
    if (isSubmittingRef.current) return;
    
    if (selection.symbols.length === 0) return setError("Select at least one commodity.");
    
    const name = formData.name.trim();
    if (name.length < 3 || name.length > 80) return setError("Token name must be between 3 and 80 characters.");
    
    const symbol = formData.symbol.trim().toUpperCase();
    if (!/^[A-Za-z0-9]{2,10}$/.test(symbol)) return setError("Use a 2–10 character token ticker (letters and numbers only).");
    
    const description = formData.description.trim();
    if (description.length > 1000) return setError("Description must be 1000 characters or less.");
    
    const websiteErr = validateURL(formData.website.trim(), "Website");
    if (websiteErr) return setError(websiteErr);
    
    const twitterErr = validateURL(formData.twitter.trim(), "X / Twitter");
    if (twitterErr) return setError(twitterErr);
    
    const telegramErr = validateURL(formData.telegram.trim(), "Telegram");
    if (telegramErr) return setError(telegramErr);

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    onSubmittingChange?.(true);
    
    try {
      const provider = window.phantom?.solana;
      if (!provider?.isPhantom || typeof provider.signTransaction !== "function") {
        throw new Error("Phantom was not detected. Install or unlock Phantom, then try again.");
      }
      setLaunchStatus("Waiting for Phantom connection approval…");
      await provider.disconnect?.();
      const connected = await provider.connect({ onlyIfTrusted: false });
      const walletAddress = connected?.publicKey?.toString() || provider.publicKey?.toString();
      if (!walletAddress) throw new Error("Phantom did not provide a connected wallet address.");
      const wallet = new PublicKey(walletAddress);

      let imageURL = "";
      if (imageFile) {
        setLaunchStatus("Uploading token image…");
        imageURL = await uploadTokenImage(imageFile);
      }

      const mint = Keypair.generate();
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const transactionConnection = connection as unknown as Parameters<typeof prepareLaunchLabTransaction>[1];
      setLaunchStatus("Validating accounts and simulating the devnet launch…");
      const prepared = await prepareLaunchLabTransaction({
        operation: "create",
        cluster: DEVNET_CLUSTER,
        wallet,
        creator: wallet,
        platformAdmin: CMC_DEVNET_ADMIN,
        programId: new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
        platformId: CMC_DEVNET_PLATFORM_ID,
        configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
        mintA: mint.publicKey,
        mint,
        name,
        symbol,
        uri: imageURL || formData.website.trim() || "https://cmc.invalid/devnet-token",
        decimals: CMC_DEVNET_LAUNCH_DECIMALS,
        supply: CMC_DEVNET_LAUNCH_SUPPLY,
        totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
        totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
        totalLockedAmount: CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
        cliffPeriod: CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
        unlockPeriod: CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
      }, transactionConnection);
      const fee = prepared.feeLamports === null ? "an RPC-calculated network fee" : `${(prepared.feeLamports / 1_000_000_000).toFixed(6)} SOL network fee`;
      setLaunchStatus(`Simulation passed. Phantom will now show the exact launch transaction (${fee}, plus account rent).`);
      const submitted = await signAndSubmitLaunchLab(
        prepared,
        createLiveWalletSigner(provider),
        transactionConnection,
        createBrowserRecoveryStore(),
      );
      if (submitted.status !== "finalized") {
        throw new Error(`Launch ${submitted.status}. Signature: ${submitted.signature}`);
      }
      const mintAddress = mint.publicKey.toBase58();
      const pairSymbol = selection.isBasket ? "BASKET" : (selection.symbols[0] || "SOL");
      // Save the finalized receipt before unmounting this form. This is not a
      // local market: the signature/mint remain an auditable devnet record
      // while the finalized chain indexer catches up.
      persistDevnetLaunchReceipt({
        version: 1,
        cluster: "devnet",
        mint: mintAddress,
        signature: submitted.signature,
        creator: wallet.toBase58(),
        name,
        symbol,
        uri: imageURL || formData.website.trim() || "https://cmc.invalid/devnet-token",
        ...(imageURL ? { imageURL } : {}),
        ...(description ? { description } : {}),
        ...(formData.website.trim() ? { website: formData.website.trim() } : {}),
        ...(formData.twitter.trim() ? { twitter: formData.twitter.trim() } : {}),
        ...(formData.telegram.trim() ? { telegram: formData.telegram.trim() } : {}),
        pairSymbol,
        ...(selection.isBasket ? { pairComponents: selection.symbols } : {}),
        decimals: CMC_DEVNET_LAUNCH_DECIMALS,
        supply: CMC_DEVNET_LAUNCH_SUPPLY.toString(),
        confirmedAt: new Date().toISOString(),
      });
      setLaunchResult({ mint: mintAddress, signature: submitted.signature });
      setLaunchStatus("Devnet launch finalized. Opening its onchain market record…");
      router.push(`/market/${mintAddress}`);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Unable to create the devnet launch.");
      setLaunchStatus("");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 scroll-mt-28" id="token-launch">
      <div className="flex-1 min-w-0 space-y-6">
        
        {/* Section 2: Identity */}
        <div className="bg-[#120f0d] border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <h2 className="text-lg font-semibold text-foreground">Identity</h2>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">Image, name and ticker</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 mb-6">
              {/* Image Upload */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="relative w-28 h-28 rounded-xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center bg-[#0a0807] hover:bg-[#110e0c] transition-colors overflow-hidden group">
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={handleClearImage} 
                        disabled={isSubmitting}
                        className="absolute top-1 right-1 bg-black/80 p-1.5 rounded-full text-white hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <input 
                        id="token-image"
                        type="file" 
                        accept="image/png,image/jpeg,image/webp" 
                        onChange={handleImageSelect}
                        disabled={isSubmitting}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed" 
                        aria-label="Upload token image" 
                      />
                      <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-[10px] text-muted-foreground font-medium">Image</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-center text-muted-foreground/60 leading-tight">
                  PNG, JPEG, WebP<br/>&lt; 4 MB<br/>
                  <span className="text-primary/70 mt-1 block">Uploaded images are public.</span>
                </div>
              </div>

              {/* Name & Ticker */}
              <div className="flex-1 flex flex-col gap-5 justify-center">
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="flex-1">
                    <label htmlFor="token-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
                    <input 
                      id="token-name"
                      type="text" 
                      maxLength={80}
                      placeholder="Copper Internet" 
                      value={formData.name} 
                      onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                      disabled={isSubmitting}
                      className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30 disabled:opacity-50" 
                    />
                  </div>
                  <div className="w-full sm:w-1/3">
                    <label htmlFor="token-symbol" className="block text-xs font-medium text-muted-foreground mb-1.5">Ticker</label>
                    <input 
                      id="token-symbol"
                      type="text" 
                      maxLength={10}
                      placeholder="CPR" 
                      value={formData.symbol} 
                      onChange={e => setFormData(d => ({ ...d, symbol: e.target.value.toUpperCase() }))}
                      disabled={isSubmitting}
                      className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all uppercase font-mono placeholder:text-muted-foreground/30 disabled:opacity-50" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Optionals Accordion */}
            <div className="border-t border-border/30 pt-5">
              <button 
                onClick={() => setShowOptionals(!showOptionals)} 
                aria-expanded={showOptionals}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              >
                {showOptionals ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Website, socials and description <span className="text-xs font-normal opacity-50 ml-1">· optional</span>
              </button>
              
              {showOptionals && (
                <div className="mt-5 space-y-5 animate-in slide-in-from-top-2 opacity-100 duration-200">
                  <div>
                    <label htmlFor="token-desc" className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                    <textarea 
                      id="token-desc"
                      maxLength={1000}
                      placeholder="What is this market about?" 
                      value={formData.description} 
                      onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                      disabled={isSubmitting}
                      className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all resize-none h-24 placeholder:text-muted-foreground/30 disabled:opacity-50" 
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label htmlFor="token-website" className="block text-xs font-medium text-muted-foreground mb-1.5">Website</label>
                      <input 
                        id="token-website"
                        type="url" 
                        maxLength={2048}
                        placeholder="https://" 
                        value={formData.website} 
                        onChange={e => setFormData(d => ({ ...d, website: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30 disabled:opacity-50" 
                      />
                    </div>
                    <div>
                      <label htmlFor="token-twitter" className="block text-xs font-medium text-muted-foreground mb-1.5">X / Twitter</label>
                      <input 
                        id="token-twitter"
                        type="url" 
                        maxLength={2048}
                        placeholder="https://" 
                        value={formData.twitter} 
                        onChange={e => setFormData(d => ({ ...d, twitter: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30 disabled:opacity-50" 
                      />
                    </div>
                    <div>
                      <label htmlFor="token-telegram" className="block text-xs font-medium text-muted-foreground mb-1.5">Telegram</label>
                      <input 
                        id="token-telegram"
                        type="url" 
                        maxLength={2048}
                        placeholder="https://" 
                        value={formData.telegram} 
                        onChange={e => setFormData(d => ({ ...d, telegram: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30 disabled:opacity-50" 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Fee and first buy */}
        <div className="bg-[#120f0d] border border-border/50 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <h2 className="text-lg font-semibold text-foreground">Fee and first buy</h2>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block">Set once at launch</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-10">
            {/* Left: Fee */}
            <div className="flex-1">
              <div className="flex justify-between items-end mb-4">
                <label htmlFor="token-fee" className="text-sm font-bold text-foreground">Trading fee</label>
                <span className="text-2xl font-bold text-foreground">{FEE_PERCENT.toFixed(2)}%</span>
              </div>
              
              <div className="relative pt-2 pb-6">
                <div className="w-full h-1.5 bg-secondary rounded-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-full bg-primary" style={{ width: '100%' }}></div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-sm">
                Fixed illustrative fee: 0.25% Raydium protocol fee plus 0.50% CMC platform fee. There are no holder rewards or automatic buybacks.
              </p>
            </div>

            {/* Right: Buy */}
            <div className="flex-1">
              <div className="flex justify-between items-end mb-4">
                <span className="text-sm font-bold text-foreground">Launch payment</span>
                <span className="text-lg font-bold text-foreground">Phantom</span>
              </div>
              
              <div className="relative mb-3">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground"></span>
                <div id="token-buy" className="w-full bg-[#0a0807] border border-border/50 rounded-lg px-4 py-3 text-sm font-mono">
                  Devnet fee + account rent
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-sm">
                Phantom shows the exact devnet transaction before approval. A rejected or failed transaction creates no token. An initial market buy is a separate wallet-signed transaction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Overview */}
      <div className="w-full lg:w-[320px] shrink-0">
         <div className="bg-[#120f0d] border border-border/50 rounded-2xl p-6 sticky top-24 shadow-xl flex flex-col min-h-[420px]">
            <h3 className="text-[10px] tracking-[0.2em] text-muted-foreground font-bold mb-6 uppercase">OVERVIEW</h3>
            
            <div className="space-y-4 flex-1">
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Paired with</span>
                <span className="font-mono text-xs font-bold text-foreground">{quoteInfo.label}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Supply</span>
                <span className="font-mono text-xs font-bold text-foreground">{TOTAL_SUPPLY.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Opens at</span>
                <span className="font-mono text-xs font-bold text-foreground">{OPENING_FDV_SOL.toLocaleString()} SOL cap</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Net curve raise target</span>
                <span className="font-mono text-xs font-bold text-foreground">{NET_RAISE_SOL.toLocaleString()} SOL</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Graduation FDV</span>
                <span className="font-mono text-xs font-bold text-foreground">{GRADUATION_FDV_SOL.toLocaleString()} SOL</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground">Trading fee</span>
                <span className="font-mono text-xs font-bold text-foreground">{FEE_PERCENT.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center py-3 mt-2 bg-primary/5 rounded-lg px-3 -mx-3 border border-primary/10">
                <span className="text-xs font-bold text-foreground">Network</span>
                <span className="font-mono text-sm font-bold text-primary">Solana devnet</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-6 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-lg flex items-start gap-2 animate-in fade-in zoom-in-95">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {isSubmitting && (
              <div className="mt-6 text-[11px] font-medium text-primary flex items-center justify-center gap-2">
                 <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {launchStatus || "Preparing launch…"}
              </div>
            )}

            {launchResult && (
              <div className="mt-6 space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                <div className="font-bold text-emerald-400">Devnet launch finalized</div>
                <div>
                  <div className="text-muted-foreground">Contract address (mint)</div>
                  <div className="break-all font-mono text-foreground">{launchResult.mint}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Transaction signature</div>
                  <div className="break-all font-mono text-foreground">{launchResult.signature}</div>
                </div>
              </div>
            )}

            <button 
              onClick={handleLaunch} 
              disabled={isSubmitting || selection.symbols.length === 0}
              className="w-full mt-6 py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2 text-sm"
            >
              {isSubmitting ? (
                <>Launching market <RefreshCw className="w-4 h-4 animate-spin ml-1" /></>
              ) : (
                "Connect Phantom & launch on devnet"
              )}
            </button>
         </div>
      </div>
    </div>
  );
}
