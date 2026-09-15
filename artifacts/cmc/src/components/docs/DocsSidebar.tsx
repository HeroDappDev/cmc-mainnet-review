"use client";

import { useEffect, useState } from "react";

export interface NavItem {
  id: string;
  title: string;
  items?: { id: string; title: string }[];
}

const navItems: NavItem[] = [
  { id: "overview", title: "Overview" },
  {
    id: "user-guide",
    title: "User Guide",
    items: [
      { id: "launch-validation", title: "Launch Validation" },
      { id: "commodity-modes", title: "Commodity Modes" },
      { id: "buy-sell-steps", title: "Buy & Sell Steps" },
      { id: "local-wallet", title: "Local Wallet" },
    ]
  },
  {
    id: "curve-math",
    title: "Curve and Math",
    items: [
      { id: "supply-constants", title: "Supply Constants" },
      { id: "pricing-equations", title: "Pricing Equations" },
      { id: "worked-example", title: "Worked Example" },
      { id: "fees-allocations", title: "Fees and Allocations" },
    ]
  },
  { id: "provider-coverage", title: "Provider Coverage" },
  { id: "wallet-compatibility", title: "Wallet Compatibility" },
  {
    id: "api-reference",
    title: "API Reference",
    items: [
      { id: "api-overview", title: "Domains & Access" },
      { id: "api-health", title: "Health Check" },
      { id: "api-network", title: "Solana Readiness" },
      { id: "api-quotes", title: "Market Quotes" },
      { id: "api-upload", title: "Upload Image" },
      { id: "api-serve", title: "Serve Image" },
    ]
  },
  {
    id: "architecture-security",
    title: "Architecture & Security",
    items: [
      { id: "persistence-privacy", title: "Persistence & Privacy" },
      { id: "faq-troubleshooting", title: "FAQ & Troubleshooting" }
    ]
  },
  { id: "mainnet-blockers", title: "Mainnet Blockers" }
];

export function DocsSidebar() {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const handleScroll = () => {
      const ids = navItems.flatMap(s => s.items ? [s.id, ...s.items.map(i => i.id)] : [s.id]);
      const elements = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[];
      
      const scrollPosition = window.scrollY + 120;
      let currentActiveId = "";

      for (const el of elements) {
        if (el.getBoundingClientRect().top + window.scrollY <= scrollPosition) {
          currentActiveId = el.id;
        }
      }
      if (currentActiveId) setActiveId(currentActiveId);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <nav aria-label="Documentation contents" className="w-full lg:w-64 flex-shrink-0 lg:sticky lg:top-24 max-h-64 lg:max-h-[calc(100vh-8rem)] overflow-y-auto pr-6 border border-border rounded-xl p-4 lg:border-0 lg:p-0 lg:pr-6">
      <div className="space-y-6">
        {navItems.map((section) => {
          const isSectionActive = activeId === section.id || section.items?.some(i => i.id === activeId);
          return (
            <div key={section.id}>
              <button
                onClick={() => scrollTo(section.id)}
                className={`block text-sm font-bold mb-2 text-left w-full transition-colors ${
                  isSectionActive ? "text-primary" : "text-foreground hover:text-primary/80"
                }`}
              >
                {section.title}
              </button>
              {section.items && (
                <ul className="space-y-2 border-l-2 border-border/50 ml-2 pl-4">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => scrollTo(item.id)}
                        className={`block text-sm text-left w-full transition-colors ${
                          activeId === item.id
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}