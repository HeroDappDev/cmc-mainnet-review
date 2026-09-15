"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  Copy,
  ShieldCheck,
  WalletCards,
  XCircle,
  RefreshCw,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WalletProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString(): string } | null;
  signMessage?: (
    message: Uint8Array,
    encoding?: string,
  ) => Promise<Uint8Array | { signature: Uint8Array }>;
};

type DetectedWallet = {
  name: string;
  provider: WalletProvider;
};

type SignatureItem = {
  approver: string;
  signature: string; // base64
};

type ReleaseResponse = {
  draft: Record<string, unknown> & { approvers: string[]; signatures: SignatureItem[] } | null;
  canonicalMessage: string | null;
  messageFingerprintSha256: string | null;
  blockers: string[];
  readiness?: any;
};

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    let carry = BASE58_ALPHABET.indexOf(character);
    if (carry < 0) throw new Error("Invalid base58.");
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === "1"; index += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const win = window as any;
  const candidates: Array<[string, WalletProvider | undefined]> = [
    ["Phantom", win.phantom?.solana ?? (win.solana?.isPhantom ? win.solana : undefined)],
    ["Solflare", win.solflare ?? (win.solana?.isSolflare ? win.solana : undefined)],
    ["Backpack", win.backpack ?? (win.solana?.isBackpack ? win.solana : undefined)],
    ["Glow", win.glow],
  ];
  const seen = new Set<WalletProvider>();
  return candidates.flatMap(([name, provider]) => {
    // Must have signMessage
    if (!provider || typeof provider.signMessage !== "function" || seen.has(provider)) return [];
    seen.add(provider);
    return [{ name, provider }];
  });
}

function short(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-6)}` : "Not configured";
}

export default function ReleasePage() {
  const [data, setData] = useState<ReleaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<DetectedWallet>();
  const [walletAddress, setWalletAddress] = useState("");
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch("/release/mainnet", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok && !body.draft && !body.blockers) {
        throw new Error(body.error || "Mainnet release endpoint unavailable.");
      }
      setData(body as ReleaseResponse);
      setSignatures({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read mainnet release draft.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setWallets(detectWallets());
    void loadData();
  }, [loadData]);

  const connectWallet = useCallback(async (wallet?: DetectedWallet) => {
    const targetWallet = wallet ?? selectedWallet;
    if (!targetWallet) {
      setWalletError("Select a compatible Solana wallet first.");
      return;
    }
    setConnecting(true);
    setWalletError("");
    try {
      if (targetWallet !== selectedWallet) {
        setSelectedWallet(targetWallet);
      }
      const result = await targetWallet.provider.connect({ onlyIfTrusted: false });
      const address = result?.publicKey?.toString() || targetWallet.provider.publicKey?.toString();
      if (!address) throw new Error("Wallet did not provide a public key.");
      setWalletAddress(address);
    } catch (reason) {
      setWalletAddress("");
      setWalletError(reason instanceof Error ? reason.message : "Wallet connection was not approved.");
    } finally {
      setConnecting(false);
    }
  }, [selectedWallet]);

  useEffect(() => {
    const requestConnection = () => {
      const available = detectWallets();
      setWallets(available);
      const wallet = selectedWallet ?? available[0];
      if (!wallet) {
        setWalletError("No compatible injected Solana wallet was detected.");
        return;
      }
      void connectWallet(wallet);
    };
    window.addEventListener("cmc_connect_solana_wallet", requestConnection);
    if (window.sessionStorage.getItem("cmc_connect_solana_wallet") === "1") {
      window.sessionStorage.removeItem("cmc_connect_solana_wallet");
      requestConnection();
    }
    return () => window.removeEventListener("cmc_connect_solana_wallet", requestConnection);
  }, [connectWallet, selectedWallet]);

  const signDraft = useCallback(async () => {
    if (!data?.draft || !data.canonicalMessage) return setActionError("No signable draft is available.");
    if (!selectedWallet?.provider.signMessage) return setActionError("The selected injected wallet cannot sign messages.");
    if (!walletAddress) return setActionError("Connect a wallet first.");
    
    if (!data.draft.approvers.includes(walletAddress)) {
      return setActionError(`The connected wallet (${short(walletAddress)}) is not an authorized approver for this release.`);
    }

    if (signatures[walletAddress]) {
      return setActionError("You have already signed this release draft.");
    }

    setBusy(true);
    setActionError("");
    setActionStatus("Review the canonical message in your wallet before approving.");
    
    try {
      const messageBytes = new TextEncoder().encode(data.canonicalMessage);
      const signed = await selectedWallet.provider.signMessage(messageBytes, "utf8");
      const signature = signed instanceof Uint8Array ? signed : signed.signature;
      
      if (signature.length !== 64) {
        throw new Error(`Invalid signature length: expected 64, got ${signature.length}.`);
      }

      // Verify in-browser
      try {
        const publicKey = await crypto.subtle.importKey(
          "raw",
          decodeBase58(walletAddress) as unknown as BufferSource,
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        const verified = await crypto.subtle.verify(
          { name: "Ed25519" },
          publicKey,
          signature as unknown as BufferSource,
          messageBytes as unknown as BufferSource,
        );
        if (!verified) throw new Error("Signature verification failed.");
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "In-browser signature verification failed.");
      }

      const base64Sig = encodeBase64(signature);
      
      setSignatures(prev => ({ ...prev, [walletAddress]: base64Sig }));
      setActionStatus(`Successfully signed with ${short(walletAddress)}.`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Wallet signing failed.");
      setActionStatus("");
    } finally {
      setBusy(false);
    }
  }, [data, selectedWallet, walletAddress, signatures]);

  const allSigned = data?.draft?.approvers.every(a => signatures[a]);
  const finalJson = useMemo(() => {
    if (!allSigned || !data?.draft) return null;
    const finalDraft = {
      ...data.draft,
      signatures: data.draft.approvers.map(a => ({
        approver: a,
        signature: signatures[a]
      }))
    };
    return JSON.stringify(finalDraft, null, 2);
  }, [allSigned, data?.draft, signatures]);

  const copyResult = useCallback(() => {
    if (finalJson) {
      void navigator.clipboard.writeText(finalJson);
      setActionStatus("Final release record copied to clipboard.");
    }
  }, [finalJson]);

  const downloadResult = useCallback(() => {
    if (finalJson) {
      const blob = new Blob([finalJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mainnet-release.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionStatus("Final release record downloaded.");
    }
  }, [finalJson]);

  const blockers = data?.blockers ?? [];
  const hasDraft = Boolean(data?.draft);
  const disableRecheck = Object.keys(signatures).length > 0;
  
  return (
    <div className="container mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <ShieldCheck className="h-4 w-4" /> Mainnet Release Console
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Mainnet release authorization</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Strictly mainnet-beta, wallet-signed authorization for the finalized platform release.
            Every configuration parameter is verified against the network, then locked in an immutable Ed25519-signed manifest.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={loadData} 
            disabled={loading || disableRecheck} 
            title={disableRecheck ? "Recheck disabled after first signature to prevent mutation" : "Recheck"}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Recheck
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border/60 bg-secondary/30 px-5 py-4">
              <h2 className="text-lg font-bold">Release Signability</h2>
              <p className="text-sm text-muted-foreground">Network and policy conditions required for mainnet release</p>
            </div>
            <div className="p-5 space-y-4">
              {loading ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <CircleDashed className="h-5 w-5 animate-spin" /> Verifying conditions...
                </div>
              ) : error ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              ) : blockers.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-destructive">
                    <XCircle className="h-5 w-5" /> {blockers.length} {blockers.length === 1 ? "Blocker" : "Blockers"} preventing release
                  </div>
                  <ul className="space-y-2">
                    {blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive/90">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : hasDraft ? (
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-bold">Ready for signatures</div>
                    <div className="text-primary/80 mt-1">All conditions met. Both approvers must sign to generate the finalized release record.</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {hasDraft && data?.draft && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border/60 bg-secondary/30 px-5 py-4 flex flex-wrap gap-4 items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Canonical Payload</h2>
                  <p className="text-sm text-muted-foreground">Immutable properties of the proposed release</p>
                </div>
                {data.messageFingerprintSha256 && (
                  <div className="flex items-center gap-2 rounded bg-background px-3 py-1.5 border border-border">
                    <Lock className="h-3 w-3 text-primary" />
                    <span className="font-mono text-[10px] text-muted-foreground">{data.messageFingerprintSha256}</span>
                  </div>
                )}
              </div>
              <div className="p-0">
                <pre className="max-h-[500px] overflow-auto p-5 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed bg-background/50 m-0 border-0 rounded-none focus:outline-none">
                  {JSON.stringify(data.draft, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden" id="wallet-connect">
            <div className="border-b border-border/60 bg-secondary/30 px-5 py-4">
              <h2 className="text-base font-bold">Signer Authorization</h2>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-muted-foreground">Detected Wallet</label>
                <div className="flex flex-wrap gap-2">
                  {wallets.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No supported wallets found</span>
                  ) : (
                    wallets.map((w) => (
                      <button
                        key={w.name}
                        onClick={() => void connectWallet(w)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
                          selectedWallet?.name === w.name
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        {w.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {walletAddress ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-primary">Connected</span>
                    </div>
                    <span className="font-mono text-xs text-primary/80">{short(walletAddress)}</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => void connectWallet()}
                  disabled={connecting || wallets.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <WalletCards className="h-4 w-4" />
                  {connecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}

              {walletError && (
                <div className="text-xs font-medium text-destructive">{walletError}</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border/60 bg-secondary/30 px-5 py-4">
              <h2 className="text-base font-bold">Release Approvers</h2>
            </div>
            <div className="p-5 space-y-4">
              {!data?.draft ? (
                <div className="text-sm text-muted-foreground">Waiting for signable draft...</div>
              ) : (
                <div className="space-y-3">
                  {data.draft.approvers.map((approver, idx) => {
                    const isSigned = !!signatures[approver];
                    const isConnected = approver === walletAddress;
                    return (
                      <div key={approver} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", isSigned ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background")}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">Approver {idx + 1}</span>
                            {isConnected && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold">You</span>}
                          </div>
                          <div className="mt-1 font-mono text-xs">{short(approver)}</div>
                        </div>
                        {isSigned ? (
                          <div className="flex flex-col items-end gap-1">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span className="text-[10px] font-bold text-primary">Signed</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <CircleDashed className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground">Pending</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {hasDraft && !allSigned && (
                <div className="pt-2">
                  <button
                    onClick={signDraft}
                    disabled={busy || blockers.length > 0 || !walletAddress || !!signatures[walletAddress]}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Awaiting Signature..." : "Sign Release Draft"}
                  </button>
                </div>
              )}

              {actionError && (
                <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive break-words">
                  {actionError}
                </div>
              )}
              {actionStatus && (
                <div className="rounded border border-primary/30 bg-primary/10 p-3 text-xs font-medium text-primary break-words">
                  {actionStatus}
                </div>
              )}
            </div>
          </div>

          {allSigned && (
            <div className="rounded-xl border border-primary/50 bg-card overflow-hidden">
              <div className="border-b border-border/60 bg-primary/10 px-5 py-4">
                <h2 className="text-base font-bold text-primary">Release Authorized</h2>
                <p className="text-xs text-primary/80 mt-1">2-of-2 signatures acquired</p>
              </div>
              <div className="p-5 flex flex-col gap-3">
                <button
                  onClick={copyResult}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-background px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <Copy className="h-4 w-4" /> Copy Final JSON
                </button>
                <button
                  onClick={downloadResult}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Download Final JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
