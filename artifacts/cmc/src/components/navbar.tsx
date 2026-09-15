"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Search, PlusCircle, Coins, Menu, X, BookOpen, WalletCards, ShieldCheck } from "lucide-react";
import { SiX } from "react-icons/si";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [walletLabel, setWalletLabel] = useState("Connect Wallet");
  const links = [
    { href: "/commodities", label: "Commodities", icon: BarChart3 },
    { href: "/launch", label: "Launch", icon: PlusCircle },
    { href: "/fees", label: "Fee Policy", icon: Coins },
    { href: "/docs", label: "Docs", icon: BookOpen },
    { href: "/onchain", label: "Solana readiness", icon: WalletCards },
    { href: "/release", label: "Release console", icon: ShieldCheck },
  ];
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    router.push(term ? `/?search=${encodeURIComponent(term)}` : "/");
    window.dispatchEvent(new CustomEvent("cmc_launch_search", { detail: term }));
    setOpen(false);
  };
  const requestWalletConnection = async () => {
    if (pathname.startsWith("/onchain")) {
      window.dispatchEvent(new CustomEvent("cmc_connect_solana_wallet"));
      document.getElementById("wallet-connect")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      window.alert("Phantom was not detected. Install or unlock Phantom, then try again.");
      return;
    }
    try {
      await provider.disconnect?.();
      const connected = await provider.connect({ onlyIfTrusted: false });
      const address = connected?.publicKey?.toString() || provider.publicKey?.toString();
      if (!address) throw new Error("Phantom did not provide a wallet address.");
      setWalletLabel(`${address.slice(0, 4)}…${address.slice(-4)}`);
    } catch (error) {
      setWalletLabel("Connect Wallet");
      window.alert(error instanceof Error ? error.message : "Phantom connection was not approved.");
    }
  };
  const navLinks = (mobile = false) => links.map((link) => {
    const Icon = link.icon;
    const active = pathname.startsWith(link.href);
    return <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={cn(mobile ? "flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium" : "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors", active ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")}><Icon className="w-4 h-4" />{link.label}</Link>;
  });
  return <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-4"><Link href="/" className="flex items-center gap-2 group"><img src="/images/cmc-logo.png" alt="" width={40} height={40} className="w-10 h-10 object-contain shrink-0" /><span className="font-bold text-lg tracking-tight group-hover:text-primary transition-colors">CMC</span></Link><nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1">{navLinks()}</nav></div>
      <div className="flex items-center gap-2 md:gap-4">
        <a href="https://x.com/LaunchOnCMC" target="_blank" rel="noopener noreferrer" aria-label="Follow CMC on X (opens in a new tab)" title="Follow CMC on X" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <SiX className="h-5 w-5" aria-hidden="true" />
        </a>
        <form role="search" onSubmit={submitSearch} className="hidden lg:flex relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search local token launches" value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search launches..." className="bg-secondary/50 border border-border rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors w-48 focus:w-64" /></form><button type="button" onClick={() => void requestWalletConnection()} className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary" title="Connect Phantom"><WalletCards className="h-4 w-4" />{walletLabel}</button><button type="button" className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button></div>
    </div>
    {open && <div id="mobile-navigation" className="md:hidden border-t border-border bg-background px-4 py-3 space-y-2"><form role="search" onSubmit={submitSearch} className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search local token launches" value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search launches..." className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary" /></form><nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-1">{navLinks(true)}</nav></div>}
  </header>;
}
