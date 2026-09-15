"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { toBN } from "@raydium-io/raydium-sdk-v2";
import { cn } from "@/lib/utils";
import {
  DEVNET_CLUSTER,
  CMC_DEVNET_ADMIN,
  CMC_DEVNET_CPMM_CONFIG_ID,
  CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
  CMC_DEVNET_PLATFORM_ID,
  CMC_DEVNET_TREASURY,
  CMC_DEVNET_PLATFORM_FEE_RATE,
  CMC_DEVNET_CREATOR_FEE_RATE,
  CMC_DEVNET_PLATFORM_SCALE,
  CMC_DEVNET_CREATOR_SCALE,
  CMC_DEVNET_BURN_SCALE,
  CMC_DEVNET_PLATFORM_VESTING_SCALE,
  CMC_DEVNET_LAUNCH_DECIMALS,
  CMC_DEVNET_LAUNCH_SUPPLY,
  CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
  CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
  CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
  CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
  CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
  CMC_DEVNET_COMPUTE_UNIT_LIMIT,
  CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS,
  verifyReviewedPlatformAccount,
  verifyPlatformGovernanceCompletion,
  DEVNET_LAUNCHLAB_PROGRAM_ID,
  LAUNCHLAB_RECOVERY_STORAGE_KEY,
  createBrowserRecoveryStore,
  createLiveWalletSigner,
  prepareLaunchLabTransaction,
  preparePlatformTransaction,
  prepareConfigurePlatformTransaction,
  recoverLaunchLabTransaction,
  signAndSubmitLaunchLab,
  slippageBound,
  type PendingLaunchLabTransaction,
  type PreparedLaunchLabTransaction,
} from "@/lib/solana-transactions";

type Cluster = "devnet" | "mainnet-beta";
type WalletProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString(): string } | null;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};

declare global {
  interface Window {
    solana?: WalletProvider;
    phantom?: { solana?: WalletProvider };
    solflare?: WalletProvider;
    backpack?: WalletProvider;
    glow?: WalletProvider;
  }
}

type SolanaResponse = {
  config: {
    cluster: Cluster;
    rpcExplicitlyConfigured: boolean;
    launchLabProgramId?: string;
    cpmmProgramId?: string;
    releaseEnabled: boolean;
    reviewedProgramIds: boolean;
    platformPda?: string;
    platformFeeDestination?: string;
    lpAuthorityPolicy?: string;
    deploymentStartSlot?: number;
    platformPdaReviewed: boolean;
    sdkBuilderReviewed: boolean;
    sdkVersion?: string;
    quoteAsset: { symbol: string; native: string; wrapped: string; description: string };
  };
  readiness: {
    cluster: Cluster;
    connected: boolean;
    genesisVerified: boolean;
    genesisHash?: string;
    programs: {
      launchLab: { id: string; accountFound: boolean; executable: boolean; error?: string };
      cpmm: { id: string; accountFound: boolean; executable: boolean; error?: string };
    };
    networkReady: boolean;
    activationEligible: boolean;
    activation: "not-eligible" | "eligible";
    blockers: string[];
    quoteAsset: { symbol: string; native: string; wrapped: string; description: string };
    checkedAt: string;
  };
};

type DetectedWallet = {
  name: string;
  provider: WalletProvider;
};

type PlatformFields = {
  cpConfigId: string;
  platformClaimFeeWallet: string;
  platformLockNftWallet: string;
  platformVestingWallet: string;
  transferFeeExtensionAuth: string;
  platformScale: string;
  creatorScale: string;
  burnScale: string;
  feeRate: string;
  creatorFeeRate: string;
  vestingScale: string;
  name: string;
  web: string;
  img: string;
};

type LaunchFields = {
  platformAdmin: string;
  configId: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: string;
  supply: string;
  totalSellA: string;
  totalFundRaisingB: string;
};

type TradeFields = {
  platformAdmin: string;
  configId: string;
  mintA: string;
  creator: string;
  amount: string;
  expectedAmount: string;
  slippageBps: string;
};

const DEVNET_RPC = "https://api.devnet.solana.com";
const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary";

function short(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-6)}` : "Not configured";
}

function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const candidates: Array<[string, WalletProvider | undefined]> = [
    ["Phantom", window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined)],
    ["Solflare", window.solflare ?? (window.solana?.isSolflare ? window.solana : undefined)],
    ["Backpack", window.backpack ?? (window.solana?.isBackpack ? window.solana : undefined)],
    ["Glow", window.glow],
  ];
  const seen = new Set<WalletProvider>();
  return candidates.flatMap(([name, provider]) => {
    if (!provider || seen.has(provider)) return [];
    seen.add(provider);
    return [{ name, provider }];
  });
}

function ProgramRow({
  name,
  id,
  accountFound,
  executable,
  error,
}: {
  name: string;
  id: string;
  accountFound: boolean;
  executable: boolean;
  error?: string;
}) {
  const verified = accountFound && executable;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
      <div className="flex items-center gap-3">
        {verified ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-primary/80" />}
        <div>
          <div className="font-semibold">{name}</div>
          <div className="font-mono text-xs text-muted-foreground">{short(id)}</div>
        </div>
      </div>
      <span className={cn("rounded-full px-2 py-1 text-xs font-bold", verified ? "bg-primary/10 text-primary" : "bg-primary/10 text-primary/80")}>
        {verified ? "Executable / finalized" : error ?? "Not verified"}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly = false,
  help,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  help?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn(inputClass, readOnly && "cursor-not-allowed opacity-70")}
      />
      {help && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{help}</span>}
    </label>
  );
}

function validKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`${field} is not a valid Solana public key.`);
  }
}

function integer(value: string, field: string) {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${field} must be a non-negative integer in base units.`);
  return toBN(value.trim());
}

function pendingFromStorage(): PendingLaunchLabTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LAUNCHLAB_RECOVERY_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value as PendingLaunchLabTransaction[] : [];
  } catch {
    return [];
  }
}

export default function OnchainPage() {
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [data, setData] = useState<SolanaResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<DetectedWallet>();
  const [walletAddress, setWalletAddress] = useState("");
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [prepared, setPrepared] = useState<PreparedLaunchLabTransaction>();
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [mintKeypair, setMintKeypair] = useState<Keypair>();
  const connection = useMemo(() => new Connection(DEVNET_RPC, "confirmed"), []);
  const transactionConnection = useMemo(
    () => connection as unknown as Parameters<typeof prepareLaunchLabTransaction>[1],
    [connection],
  );
  const [platformReady, setPlatformReady] = useState(false);
  const [platformNeedsCompletion, setPlatformNeedsCompletion] = useState(false);
  const [platformManualReview, setPlatformManualReview] = useState("");

  const [platform, setPlatform] = useState<PlatformFields>({
    cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID.toBase58(),
    platformClaimFeeWallet: CMC_DEVNET_TREASURY.toBase58(),
    platformLockNftWallet: CMC_DEVNET_TREASURY.toBase58(),
    platformVestingWallet: CMC_DEVNET_TREASURY.toBase58(),
    transferFeeExtensionAuth: CMC_DEVNET_TREASURY.toBase58(),
    platformScale: "1000000", creatorScale: "0", burnScale: "0",
    feeRate: CMC_DEVNET_PLATFORM_FEE_RATE.toString(),
    creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE.toString(),
    vestingScale: "0",
    name: "Commodity Markets Capital",
    web: "https://x.com/LaunchOnCMC",
    img: "https://x.com/LaunchOnCMC",
  });
  const [launch, setLaunch] = useState<LaunchFields>({
    platformAdmin: CMC_DEVNET_ADMIN.toBase58(),
    configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58(), creator: "", name: "", symbol: "", uri: "", decimals: "6",
    supply: CMC_DEVNET_LAUNCH_SUPPLY.toString(),
    totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A.toString(),
    totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B.toString(),
  });
  const [trade, setTrade] = useState<TradeFields>({
    platformAdmin: CMC_DEVNET_ADMIN.toBase58(),
    configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58(), mintA: "", creator: "", amount: "", expectedAmount: "", slippageBps: "100",
  });
  const adminPlatformId = CMC_DEVNET_PLATFORM_ID;

  const loadReadiness = useCallback(async (selectedCluster: Cluster) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/network/solana?cluster=${selectedCluster}`, { cache: "no-store" });
      const body = await response.json() as SolanaResponse | { error?: string };
      if (!response.ok && !("readiness" in body)) throw new Error(("error" in body && body.error) || "Solana readiness endpoint unavailable.");
      if (!("readiness" in body)) throw new Error("Solana readiness response is malformed.");
      setData(body);
    } catch (reason) {
      setData(undefined);
      setError(reason instanceof Error ? reason.message : "Unable to read Solana readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setWallets(detectWallets());
    void loadReadiness(cluster);
  }, [cluster, loadReadiness]);

  useEffect(() => {
    let cancelled = false;
    setPlatformReady(false);
    setPlatformNeedsCompletion(false);
    setPlatformManualReview("");
    if (cluster === DEVNET_CLUSTER) {
      void verifyPlatformGovernanceCompletion(transactionConnection).then((result) => {
        if (!cancelled) {
          setPlatformReady(result.valid && !result.needsCompletion);
          setPlatformNeedsCompletion(result.valid && result.needsCompletion);
          setPlatformManualReview(result.valid || /missing/i.test(result.error ?? "")
            ? "" : (result.error ?? "Manual Platform account review is required."));
        }
      });
    }
    return () => { cancelled = true; };
  }, [cluster, transactionConnection]);

  // Receipt recovery deliberately does not depend on the connected wallet. A
  // submitted signature remains observable after an account switch or reload.
  useEffect(() => {
    const pending = pendingFromStorage();
    if (!pending.length) return;
    const store = createBrowserRecoveryStore();
    let cancelled = false;
    void Promise.all(pending.map(async (item) => {
      try {
        const result = await recoverLaunchLabTransaction(item, transactionConnection, store);
        if (!cancelled) setRecoveryStatus(
          result.status === "finalized"
            ? `Recovered and finalized ${item.operation} ${short(item.signature)}.`
            : `Recovered ${item.operation} ${short(item.signature)} as ${result.status}; it did not succeed.`,
        );
      } catch (reason) {
        if (!cancelled) setRecoveryStatus(`Pending ${item.operation} ${short(item.signature)}: ${reason instanceof Error ? reason.message : "confirmation is still unavailable"}`);
      }
    }));
    return () => { cancelled = true; };
  }, [transactionConnection]);

  const connectWallet = useCallback(async () => {
    if (!selectedWallet) {
      setWalletError("Select an injected Solana wallet first.");
      return;
    }
    setConnecting(true);
    setWalletError("");
    try {
      const result = await selectedWallet.provider.connect({ onlyIfTrusted: false });
      const address = result?.publicKey?.toString() || selectedWallet.provider.publicKey?.toString();
      if (!address) throw new Error("Wallet did not provide a public key.");
      setPrepared(undefined);
      setActionStatus("");
      setWalletAddress(address);
      setLaunch((value) => ({ ...value, creator: value.creator || address }));
      setTrade((value) => ({ ...value, creator: value.creator || address }));
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
      setSelectedWallet(wallet);
      void wallet.provider.connect({ onlyIfTrusted: false }).then((result) => {
        const address = result?.publicKey?.toString() || wallet.provider.publicKey?.toString();
        if (!address) throw new Error("Wallet did not provide a public key.");
        setPrepared(undefined);
        setActionStatus("");
        setWalletAddress(address);
        setLaunch((value) => ({ ...value, creator: value.creator || address }));
        setTrade((value) => ({ ...value, creator: value.creator || address }));
        setWalletError("");
      }).catch((reason: unknown) => {
        setWalletAddress("");
        setWalletError(reason instanceof Error ? reason.message : "Wallet connection was not approved.");
      });
    };
    window.addEventListener("cmc_connect_solana_wallet", requestConnection);
    if (window.sessionStorage.getItem("cmc_connect_solana_wallet") === "1") {
      window.sessionStorage.removeItem("cmc_connect_solana_wallet");
      requestConnection();
    }
    return () => window.removeEventListener("cmc_connect_solana_wallet", requestConnection);
  }, [selectedWallet]);

  const preparePlatform = useCallback(async () => {
    if (cluster !== DEVNET_CLUSTER) return setActionError("Mainnet-beta is strictly read-only; platform construction is disabled.");
    if (!walletAddress) return setActionError("Connect a wallet before preparing a transaction.");
    setBusyAction("platform");
    setActionError("");
    setActionStatus("");
    try {
      const wallet = validKey(walletAddress, "Connected wallet");
      const request = {
        operation: "createPlatform" as const,
        cluster: DEVNET_CLUSTER,
        wallet,
        platformAdmin: CMC_DEVNET_ADMIN,
        platformId: adminPlatformId,
        cpConfigId: CMC_DEVNET_CPMM_CONFIG_ID,
        platformClaimFeeWallet: CMC_DEVNET_TREASURY,
        platformLockNftWallet: CMC_DEVNET_TREASURY,
        platformVestingWallet: CMC_DEVNET_TREASURY,
        transferFeeExtensionAuth: CMC_DEVNET_TREASURY,
        migrateCpLockNftScale: {
          platformScale: CMC_DEVNET_PLATFORM_SCALE,
          creatorScale: CMC_DEVNET_CREATOR_SCALE,
          burnScale: CMC_DEVNET_BURN_SCALE,
        },
        feeRate: CMC_DEVNET_PLATFORM_FEE_RATE,
        creatorFeeRate: CMC_DEVNET_CREATOR_FEE_RATE,
        platformVestingScale: CMC_DEVNET_PLATFORM_VESTING_SCALE,
        name: platform.name, web: platform.web, img: platform.img,
      };
      setPrepared(await preparePlatformTransaction(request, transactionConnection));
      setActionStatus("Platform transaction prepared and simulated. No wallet signature was requested.");
      window.setTimeout(() => document.getElementById("prepared-review")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (reason) {
      setPrepared(undefined);
      setActionError(reason instanceof Error ? reason.message : "Unable to prepare platform transaction.");
    } finally {
      setBusyAction("");
    }
  }, [adminPlatformId, cluster, platform, transactionConnection, walletAddress]);

  const preparePlatformCompletion = useCallback(async () => {
    if (cluster !== DEVNET_CLUSTER) return setActionError("Mainnet-beta is strictly read-only; platform construction is disabled.");
    if (!walletAddress) return setActionError("Connect the pinned CMC admin wallet before preparing governance completion.");
    setBusyAction("platform");
    setActionError("");
    setActionStatus("");
    try {
      const request = {
        operation: "configurePlatform" as const,
        cluster: DEVNET_CLUSTER,
        wallet: validKey(walletAddress, "Connected wallet"),
        platformId: adminPlatformId,
      };
      setPrepared(await prepareConfigurePlatformTransaction(request, transactionConnection));
      setActionStatus("Governance completion transaction prepared and simulated. No wallet signature was requested.");
      window.setTimeout(() => document.getElementById("prepared-review")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (reason) {
      setPrepared(undefined);
      setActionError(reason instanceof Error ? reason.message : "Unable to prepare governance completion transaction.");
    } finally {
      setBusyAction("");
    }
  }, [adminPlatformId, cluster, transactionConnection, walletAddress]);

  const prepareLaunch = useCallback(async () => {
    if (cluster !== DEVNET_CLUSTER) return setActionError("Mainnet-beta is strictly read-only; launch construction is disabled.");
    if (!platformReady) return setActionError("The reviewed CMC Platform PDA must exist and pass finalized verification before launch preparation.");
    if (!walletAddress) return setActionError("Connect a wallet before preparing a transaction.");
    if (!mintKeypair) return setActionError("Generate a mint keypair first. It is held only in component state.");
    setBusyAction("launch");
    setActionError("");
    setActionStatus("");
    try {
      const wallet = validKey(walletAddress, "Connected wallet");
      const creator = validKey(launch.creator || walletAddress, "Creator");
      const request = {
        operation: "create" as const,
        cluster: DEVNET_CLUSTER,
        wallet,
        creator,
        platformAdmin: CMC_DEVNET_ADMIN,
        programId: new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
        platformId: CMC_DEVNET_PLATFORM_ID,
        configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
        mintA: mintKeypair.publicKey,
        mint: mintKeypair,
        name: launch.name,
        symbol: launch.symbol,
        uri: launch.uri,
        decimals: CMC_DEVNET_LAUNCH_DECIMALS,
        supply: CMC_DEVNET_LAUNCH_SUPPLY,
        totalSellA: CMC_DEVNET_LAUNCH_TOTAL_SELL_A,
        totalFundRaisingB: CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B,
        totalLockedAmount: CMC_DEVNET_LAUNCH_TOTAL_LOCKED_AMOUNT,
        cliffPeriod: CMC_DEVNET_LAUNCH_CLIFF_PERIOD,
        unlockPeriod: CMC_DEVNET_LAUNCH_UNLOCK_PERIOD,
      };
      setPrepared(await prepareLaunchLabTransaction(request, transactionConnection));
      setActionStatus("Launch transaction prepared and simulated. No wallet signature was requested.");
      window.setTimeout(() => document.getElementById("prepared-review")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (reason) {
      setPrepared(undefined);
      setActionError(reason instanceof Error ? reason.message : "Unable to prepare launch transaction.");
    } finally {
      setBusyAction("");
    }
  }, [cluster, launch, mintKeypair, platformReady, transactionConnection, walletAddress]);

  const prepareTrade = useCallback(async (operation: "buy" | "sell") => {
    if (cluster !== DEVNET_CLUSTER) return setActionError("Mainnet-beta is strictly read-only; trade construction is disabled.");
    if (!platformReady) return setActionError("The reviewed CMC Platform PDA must exist and pass finalized verification before trade preparation.");
    if (!walletAddress) return setActionError("Connect a wallet before preparing a transaction.");
    setBusyAction(operation);
    setActionError("");
    setActionStatus("");
    try {
      const wallet = validKey(walletAddress, "Connected wallet");
      const request = {
        operation,
        cluster: DEVNET_CLUSTER,
        wallet,
        platformAdmin: CMC_DEVNET_ADMIN,
        creator: validKey(trade.creator || walletAddress, "Creator"),
        programId: new PublicKey(DEVNET_LAUNCHLAB_PROGRAM_ID),
        platformId: CMC_DEVNET_PLATFORM_ID,
        configId: CMC_DEVNET_LAUNCHLAB_CONFIG_ID,
        mintA: validKey(trade.mintA, "Base mint"),
        amount: integer(trade.amount, "Trade amount"),
        minAmount: slippageBound(
          integer(trade.expectedAmount, "Expected output"),
          Number(trade.slippageBps),
        ),
      } as const;
      setPrepared(await prepareLaunchLabTransaction(request, transactionConnection));
      setActionStatus(`${operation === "buy" ? "Buy" : "Sell"} transaction prepared and simulated. No wallet signature was requested.`);
      window.setTimeout(() => document.getElementById("prepared-review")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (reason) {
      setPrepared(undefined);
      setActionError(reason instanceof Error ? reason.message : `Unable to prepare ${operation} transaction.`);
    } finally {
      setBusyAction("");
    }
  }, [cluster, platformReady, trade, transactionConnection, walletAddress]);

  const signSubmit = useCallback(async () => {
    if (!prepared || cluster !== DEVNET_CLUSTER) return setActionError("Only a prepared devnet transaction can be signed.");
    if (!selectedWallet?.provider.signTransaction) return setActionError("The selected injected wallet cannot sign transactions.");
    setBusyAction("sign");
    setActionError("");
    setActionStatus("Rechecking wallet identity. Review the transaction in your wallet before approving.");
    try {
      const currentAddress = selectedWallet.provider.publicKey?.toString();
      if (!currentAddress) throw new Error("Wallet is no longer connected.");
      const store = createBrowserRecoveryStore();
      const result = await signAndSubmitLaunchLab(
        prepared,
        createLiveWalletSigner(selectedWallet.provider),
        transactionConnection,
        store,
      );
      if (result.status === "finalized") {
        if (prepared.operation === "createPlatform" || prepared.operation === "configurePlatform") {
          const platform = await verifyReviewedPlatformAccount(transactionConnection);
          setPlatformReady(platform.valid);
          setPlatformNeedsCompletion(false);
          setPlatformManualReview(platform.valid ? "" : "Finalized Platform governance fields are not fully configured; use Recheck below.");
          setActionStatus(platform.valid
            ? `Finalized ${prepared.operation}: ${result.signature}. Finalized Platform verified; launch creation is now unlocked.`
            : `Finalized ${prepared.operation}: ${result.signature}. Waiting for finalized Platform verification; use Recheck below.`);
        } else {
          setActionStatus(`Finalized ${prepared.operation}: ${result.signature}`);
        }
      } else {
        setActionError(`${prepared.operation} ${result.status}: ${result.signature}. No successful execution was recorded; prepare a fresh transaction before retrying.`);
      }
      setPrepared(undefined);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Wallet signing or submission failed.");
    } finally {
      setBusyAction("");
    }
  }, [cluster, prepared, selectedWallet, transactionConnection]);

  const readiness = data?.readiness;
  const production = cluster === "mainnet-beta";
  const connectedIsAdmin = walletAddress === CMC_DEVNET_ADMIN.toBase58();
  const nextAction = !walletAddress
    ? "Connect your Solana wallet. No transaction can be prepared until its public key is visible here."
     : platformNeedsCompletion
       ? "DO THIS NEXT: use the governance completion transaction to set both pinned Platform authorities, then recheck finalized state."
    : !platformReady && !connectedIsAdmin
      ? `Switch to the CMC admin wallet ${short(CMC_DEVNET_ADMIN.toBase58())}. The connected wallet ${short(walletAddress)} cannot create the pinned Platform PDA.`
      : !platformReady
        ? "Click “Prepare Platform PDA transaction” below, review the immutable transaction, then click “Recheck wallet · sign and submit” and approve the wallet prompt."
        : "Platform verified. Generate a mint keypair, enter token metadata, prepare the launch, then approve the reviewed transaction.";
  const activationLabel = readiness?.activation === "eligible" ? "Eligible for review" : "Not activated";
  const allBlockers = useMemo(() => readiness?.blockers ?? ["Readiness has not been verified yet."], [readiness?.blockers]);
  const tradeFloor = trade.expectedAmount && trade.slippageBps && /^\d+$/.test(trade.expectedAmount) && /^\d+$/.test(trade.slippageBps)
    ? (() => {
      try { return slippageBound(toBN(trade.expectedAmount), Number(trade.slippageBps)).toString(); } catch { return ""; }
    })()
    : "";
  const invalidatePrepared = () => {
    setPrepared(undefined);
    setActionStatus("");
  };
  const setPlatformField = (field: keyof PlatformFields, value: string) => {
    invalidatePrepared();
    setPlatform((current) => ({ ...current, [field]: value }));
  };
  const setLaunchField = (field: keyof LaunchFields, value: string) => {
    invalidatePrepared();
    setLaunch((current) => ({ ...current, [field]: value }));
  };
  const setTradeField = (field: keyof TradeFields, value: string) => {
    invalidatePrepared();
    setTrade((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="container mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <ShieldCheck className="h-4 w-4" /> Solana / Raydium LaunchLab
          </div>
          <h1 className="text-4xl font-bold tracking-tight">LaunchLab auditor console</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Explicitly devnet-only, wallet-signed preparation for the CMC Platform PDA, launch, buy, and sell flows.
            Launch and trade preparation remain gated until the pinned Platform PDA exists and passes a finalized state check. Every eligible transaction is prepared, simulated, reviewed, and then explicitly signed by the connected wallet.
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1" role="group" aria-label="Solana cluster">
          {(["devnet", "mainnet-beta"] as Cluster[]).map((value) => (
            <button key={value} type="button" onClick={() => { setCluster(value); setPrepared(undefined); setActionError(""); }} className={cn("rounded-md px-3 py-2 text-sm font-bold", cluster === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {value === "devnet" ? "Devnet" : "Mainnet-beta"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {loading ? <CircleDashed className="h-5 w-5 animate-spin text-primary" /> : readiness?.networkReady ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-primary/80" />}
          <div>
            <div className="font-bold">{loading ? "Checking finalized RPC state…" : `${cluster} · ${activationLabel}`}</div>
            <div className="text-xs text-muted-foreground">{readiness?.connected ? "RPC connected; public RPC URL is never shown." : error || "RPC not verified."}</div>
          </div>
        </div>
        <button type="button" onClick={() => void loadReadiness(cluster)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Refresh Solana readiness">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && <div role="alert" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}
      <section className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Do this next</div>
        <p className="mt-2 text-sm font-semibold">{nextAction}</p>
        {walletAddress && <p className={cn("mt-2 break-all font-mono text-xs", connectedIsAdmin ? "text-primary" : "text-primary/80")}>
          Connected: {walletAddress} · {connectedIsAdmin ? "CMC admin verified" : "not the CMC Platform admin"}
        </p>}
        {actionError && <div role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{actionError}</div>}
        {actionStatus && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{actionStatus}</div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-2 text-xl font-bold">Protocol verification</h2>
          <p className="mb-4 text-sm text-muted-foreground">Both official program accounts must exist and be executable at finalized commitment, and the genesis hash must match the selected cluster.</p>
          <div className="mb-4 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-sm">
            <span className="font-semibold">Genesis hash:</span>{" "}
            {readiness?.genesisVerified ? <span className="text-primary">verified</span> : <span className="text-primary/80">not verified</span>}
            {readiness?.genesisHash && <span className="ml-2 font-mono text-xs text-muted-foreground">{short(readiness.genesisHash)}</span>}
          </div>
          <ProgramRow name="Raydium LaunchLab" {...(readiness?.programs.launchLab ?? { id: data?.config.launchLabProgramId ?? "", accountFound: false, executable: false })} />
          <ProgramRow name="Raydium CPMM" {...(readiness?.programs.cpmm ?? { id: data?.config.cpmmProgramId ?? "", accountFound: false, executable: false })} />
        </section>

        <section id="wallet-connect" className="scroll-mt-24 rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Injected wallet status</h2>
          </div>
           <p className="mb-4 text-sm text-muted-foreground">Connection only requests the public key. Signing is never automatic; the separate sign/submit control rechecks this wallet immediately before requesting approval. Detection is not a compatibility certification; see Wallet compatibility in the documentation for provider-contract and manual evidence requirements.</p>
          {wallets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No compatible window.solana wallet was detected.</div>
          ) : (
            <>
              <select value={selectedWallet?.name ?? ""} onChange={(event) => { invalidatePrepared(); setWalletAddress(""); setSelectedWallet(wallets.find((wallet) => wallet.name === event.target.value)); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Select wallet</option>
                {wallets.map((wallet) => <option key={wallet.name} value={wallet.name}>{wallet.name}</option>)}
              </select>
              <button type="button" onClick={() => void connectWallet()} disabled={connecting || !selectedWallet} className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                {connecting ? "Connecting wallet…" : walletAddress ? "Wallet connected" : "Connect Wallet"}
              </button>
              {walletAddress && <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 font-mono text-xs text-emerald-300">{walletAddress}</div>}
              {walletError && <div role="alert" className="mt-3 text-xs text-primary/80">{walletError}</div>}
            </>
          )}
        </section>
      </div>

      {production ? (
        <section className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-6">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div>
              <h2 className="font-bold text-red-100">Mainnet-beta is strictly read-only and fail-closed</h2>
              <p className="mt-1 text-sm text-red-100/75">No mainnet transaction is constructed, simulated for signing, or submitted here. Mainnet activation remains blocked until every server-side release control is satisfied.</p>
              <div className="mt-4 space-y-2">{allBlockers.map((blocker) => <div key={blocker} className="flex gap-2 text-sm text-red-100/80"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{blocker}</div>)}</div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary/80" />
              <div>
                <h2 className="font-bold text-primary">Devnet signing boundary</h2>
                <p className="mt-1 text-sm text-primary/75">Reviewed governance, config, treasury, and fee values are pinned in the transaction boundary and passed to the SDK; SOL is represented as WSOL where an SPL token account is required. Preparation never signs.</p>
                <div className={cn("mt-3 rounded-lg border p-3 text-xs", platformReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-100")}>
                  {platformReady
                    ? "Finalized prerequisite verified: the reviewed CMC Platform PDA exists with the pinned state."
                     : platformNeedsCompletion
                       ? "DO THIS NEXT: the Platform exists, but its two post-creation governance authorities still need the pinned CMC admin completion transaction."
                       : platformManualReview
                         ? `Manual review required: ${platformManualReview}`
                         : "Prerequisite not met: the reviewed CMC Platform PDA must exist and pass a finalized account-state check. Launch and trade preparation are disabled; create the Platform first."}
                </div>
                {platformNeedsCompletion && <button type="button" onClick={() => void preparePlatformCompletion()} disabled={Boolean(busyAction) || !connectedIsAdmin} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busyAction === "platform" ? "Preparing and simulating…" : "Prepare governance completion transaction"}</button>}
                <button type="button" onClick={() => {
                  setPlatformReady(false);
                  setPlatformNeedsCompletion(false);
                  setPlatformManualReview("");
                  void verifyPlatformGovernanceCompletion(transactionConnection).then((result) => {
                    setPlatformReady(result.valid && !result.needsCompletion);
                    setPlatformNeedsCompletion(result.valid && result.needsCompletion);
                    setPlatformManualReview(result.valid || /missing/i.test(result.error ?? "")
                      ? "" : (result.error ?? "Manual Platform account review is required."));
                  });
                }} className="mt-3 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary">
                  Recheck finalized Platform prerequisite
                </button>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">1. Create CMC Platform PDA</h2>
            <p className="mt-1 text-sm text-muted-foreground">The reviewed CMC Platform PDA, CPMM config, treasury destinations, and fee policy are pinned and verified before simulation.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="CPMM config account (reviewed, exact)" value={CMC_DEVNET_CPMM_CONFIG_ID.toBase58()} readOnly />
              <Field label="CMC Platform PDA (reviewed, exact)" value={adminPlatformId.toBase58()} readOnly />
              <Field label="Platform claim fee wallet (CMC treasury)" value={CMC_DEVNET_TREASURY.toBase58()} readOnly />
              <Field label="Platform lock NFT wallet (CMC treasury)" value={CMC_DEVNET_TREASURY.toBase58()} readOnly />
              <Field label="Platform vesting wallet (CMC treasury)" value={CMC_DEVNET_TREASURY.toBase58()} readOnly />
              <Field label="Transfer-fee extension authority (CMC treasury)" value={CMC_DEVNET_TREASURY.toBase58()} readOnly />
              <Field label="Migration platform scale (pinned)" value={CMC_DEVNET_PLATFORM_SCALE.toString()} readOnly />
              <Field label="Migration creator scale (pinned)" value={CMC_DEVNET_CREATOR_SCALE.toString()} readOnly />
              <Field label="Migration burn scale (pinned)" value={CMC_DEVNET_BURN_SCALE.toString()} readOnly />
              <Field label="Platform fee rate (base units, pinned 0.50%)" value={CMC_DEVNET_PLATFORM_FEE_RATE.toString()} readOnly />
              <Field label="Creator fee rate (base units, pinned 0)" value={CMC_DEVNET_CREATOR_FEE_RATE.toString()} readOnly />
              <Field label="Platform vesting scale (pinned)" value={CMC_DEVNET_PLATFORM_VESTING_SCALE.toString()} readOnly />
              <Field label="Platform name" value={platform.name} onChange={(value) => setPlatformField("name", value)} />
              <Field label="Platform web metadata" value={platform.web} onChange={(value) => setPlatformField("web", value)} />
              <Field label="Platform image metadata" value={platform.img} onChange={(value) => setPlatformField("img", value)} />
            </div>
            <button type="button" onClick={() => void (platformNeedsCompletion ? preparePlatformCompletion() : preparePlatform())} disabled={Boolean(busyAction)} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busyAction === "platform" ? "Preparing and simulating…" : platformNeedsCompletion ? "Prepare governance completion transaction" : connectedIsAdmin ? "Prepare Platform PDA transaction" : "Prepare Platform PDA transaction (admin wallet required)"}</button>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold">2. Create launch</h2><p className="mt-1 text-sm text-muted-foreground">Mint signing material is generated locally and discarded on reload.</p></div>
              <button type="button" onClick={() => { invalidatePrepared(); setMintKeypair(Keypair.generate()); }} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary">{mintKeypair ? "Regenerate mint keypair" : "Generate mint keypair"}</button>
            </div>
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary/80">Warning: the mint keypair exists only in this component state. Reloading this page discards an unsubmitted mint and it cannot be recovered.</div>
            {mintKeypair && <div className="mt-3 rounded-lg bg-secondary/50 p-3 font-mono text-xs">Exact mint account: {mintKeypair.publicKey.toBase58()}</div>}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="LaunchLab config account (reviewed, exact)" value={CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58()} readOnly />
              <Field label="CMC Platform admin (reviewed, exact)" value={CMC_DEVNET_ADMIN.toBase58()} readOnly />
              <Field label="Creator account (exact)" value={launch.creator} onChange={(value) => setLaunchField("creator", value)} placeholder={walletAddress || "Wallet public key"} />
              <Field label="Token name metadata" value={launch.name} onChange={(value) => setLaunchField("name", value)} />
              <Field label="Token symbol metadata" value={launch.symbol} onChange={(value) => setLaunchField("symbol", value)} />
              <Field label="Metadata URI" value={launch.uri} onChange={(value) => setLaunchField("uri", value)} />
              <Field label="Decimals (pinned test template)" value={String(CMC_DEVNET_LAUNCH_DECIMALS)} readOnly help="6 decimals: 1,000,000,000 whole tokens = 1,000,000,000,000,000 base units." />
              <Field label="Token supply (pinned, base units)" value={CMC_DEVNET_LAUNCH_SUPPLY.toString()} readOnly help="Reference assumption: 1B tokens at 6 decimals." />
              <Field label="Total sell A (pinned, base units)" value={CMC_DEVNET_LAUNCH_TOTAL_SELL_A.toString()} readOnly help="Reference assumption: 800M tokens at 6 decimals." />
              <Field label="Total fundraising B (pinned, lamports)" value={CMC_DEVNET_LAUNCH_TOTAL_FUNDRAISING_B.toString()} readOnly help="Reviewed template: 16 SOL = 16,000,000,000 lamports." />
            </div>
             <button type="button" onClick={() => void prepareLaunch()} disabled={Boolean(busyAction) || !mintKeypair || !platformReady} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busyAction === "launch" ? "Preparing and simulating…" : "Prepare launch transaction"}</button>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">3. Buy or sell</h2>
            <p className="mt-1 text-sm text-muted-foreground">Trade inputs and expected output are integer base units. The minimum sent to LaunchLab is derived with integer math from the expected output and selected slippage.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="LaunchLab config account (reviewed, exact)" value={CMC_DEVNET_LAUNCHLAB_CONFIG_ID.toBase58()} readOnly />
              <Field label="CMC Platform admin (reviewed, exact)" value={CMC_DEVNET_ADMIN.toBase58()} readOnly />
              <Field label="Base mint account (exact)" value={trade.mintA} onChange={(value) => setTradeField("mintA", value)} />
              <Field label="Creator account (exact)" value={trade.creator} onChange={(value) => setTradeField("creator", value)} placeholder={walletAddress || "Pool creator public key"} />
              <Field label="Amount in (base units / lamports)" value={trade.amount} onChange={(value) => setTradeField("amount", value)} />
              <Field label="Expected output (base units)" value={trade.expectedAmount} onChange={(value) => setTradeField("expectedAmount", value)} />
              <Field label="Slippage (basis points)" value={trade.slippageBps} onChange={(value) => setTradeField("slippageBps", value)} help={tradeFloor ? `Exact minimum sent: ${tradeFloor} base units` : "Must be between 0 and 9,999 basis points."} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
               <button type="button" onClick={() => void prepareTrade("buy")} disabled={Boolean(busyAction) || !platformReady} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busyAction === "buy" ? "Preparing…" : "Prepare buy"}</button>
               <button type="button" onClick={() => void prepareTrade("sell")} disabled={Boolean(busyAction) || !platformReady} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-secondary disabled:opacity-50">{busyAction === "sell" ? "Preparing…" : "Prepare sell"}</button>
            </div>
          </section>

          {recoveryStatus && <div className="mt-6 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">{recoveryStatus}</div>}

          {prepared && (
            <section id="prepared-review" className="mt-6 scroll-mt-24 rounded-2xl border border-primary/40 bg-primary/5 p-6">
              <h2 className="text-xl font-bold">Prepared transaction review</h2>
              <p className="mt-1 text-sm text-muted-foreground">Simulation succeeded. Review all wallet details, then explicitly request a signature and submit.</p>
              <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                <div><span className="font-semibold">Operation:</span> {prepared.operation}</div>
                <div><span className="font-semibold">Fee preview:</span> {prepared.feeLamports === null ? "RPC unavailable" : `${prepared.feeLamports.toLocaleString()} lamports`}</div>
                <div><span className="font-semibold">Compute budget:</span> {CMC_DEVNET_COMPUTE_UNIT_LIMIT.toLocaleString()} CU at {CMC_DEVNET_COMPUTE_UNIT_PRICE_MICROLAMPORTS.toLocaleString()} microLamports/CU</div>
                <div><span className="font-semibold">Maximum priority fee:</span> {CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS.toLocaleString()} lamports ({(CMC_DEVNET_MAX_PRIORITY_FEE_LAMPORTS / 1_000_000_000).toFixed(6)} SOL)</div>
                <div><span className="font-semibold">Last valid block height:</span> {prepared.lastValidBlockHeight.toLocaleString()}</div>
                <div><span className="font-semibold">Simulation:</span> <span className="text-emerald-300">success</span></div>
                <div className="md:col-span-2"><span className="font-semibold">Fee payer:</span> <span className="font-mono">{prepared.wallet.toBase58()}</span></div>
                {prepared.platform && <div className="md:col-span-2"><span className="font-semibold">Platform PDA / CPMM config:</span> <span className="font-mono">{prepared.platform.platformId.toBase58()} / {prepared.platform.cpConfigId.toBase58()}</span></div>}
                {prepared.accounts && <div className="md:col-span-2"><span className="font-semibold">Derived auth / pool / vaults:</span> <span className="font-mono break-all">{prepared.accounts.auth.toBase58()} / {prepared.accounts.poolId.toBase58()} / {prepared.accounts.vaultA.toBase58()} / {prepared.accounts.vaultB.toBase58()}</span></div>}
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background/70 p-4">
                <h3 className="text-sm font-bold">Immutable signing intent</h3>
                <p className="mt-1 text-xs text-muted-foreground">Changing any form value, wallet, or mint invalidates this preparation. These exact values are bound to the simulated transaction.</p>
                <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs md:grid-cols-2">
                  {[...Object.entries(prepared.intentSnapshot.accounts), ...Object.entries(prepared.intentSnapshot.parameters)].map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="font-semibold text-muted-foreground">{key}</dt>
                      <dd className="break-all font-mono text-foreground">{value ?? "None"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <button type="button" onClick={() => void signSubmit()} disabled={busyAction === "sign"} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busyAction === "sign" ? "Waiting for wallet approval…" : "Recheck wallet · sign and submit"}</button>
              <p className="mt-2 text-xs text-muted-foreground">The transaction is saved to local recovery storage after submission and observed independently of the current wallet.</p>
            </section>
          )}
        </>
      )}

      <div className="mt-5 text-center text-xs text-muted-foreground">
        <span>Raydium IDs and finalized account state are verified server-side.</span>{" "}
        <a href="/docs#api-network" className="inline-flex items-center gap-1 text-primary hover:underline">Read network notes <ExternalLink className="h-3 w-3" /></a>
      </div>
    </div>
  );
}