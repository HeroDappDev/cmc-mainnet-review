"use client";

import { Coins, Activity, BarChart2 } from "lucide-react";
import { useDemoStats } from "@/lib/store";

const solFormat = (amount: number) => `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL`;

export default function FeesPage() {
  const stats = useDemoStats();
  
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold font-mono tracking-tight uppercase mb-4 text-gradient">Local fee allocations</h1>
          <p className="text-xl text-muted-foreground">A transparent view of fees from this browser's local trades. There are no holder rewards, automatic buybacks, or creator claims.</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-6">
              <Coins className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold mb-2">CMC Platform (0.50%)</h2>
            <p className="text-muted-foreground mb-6">The platform portion calculated from local curve fees. This goes to the protocol treasury to maintain the platform.</p>
            <div className="text-3xl font-mono font-bold text-foreground">
              {solFormat(stats.cmcFeeSOL)} <span className="text-sm font-sans text-muted-foreground font-normal">locally allocated</span>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-6">
              <Coins className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Raydium Protocol (0.25%)</h2>
            <p className="text-muted-foreground mb-6">This portion represents the fee that would be taken by Raydium infrastructure during standard curve trades.</p>
            <div className="text-3xl font-mono font-bold text-foreground">
              {solFormat(stats.raydiumFeeSOL)} <span className="text-sm font-sans text-primary uppercase font-bold">budget only</span>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary/30 border border-border rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-bold">Local accounting status</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BarChart2 className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-foreground">
              {stats.feesSOL > 0 ? `${solFormat(stats.feesSOL)} in fees recorded by this browser` : "No local fee activity yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Values update only after you make local curve trades. No reward payout can be claimed or distributed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
