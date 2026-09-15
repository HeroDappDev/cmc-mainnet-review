import { Metadata } from "next";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { OverviewSection } from "@/components/docs/sections/OverviewSection";
import { UserGuideSection } from "@/components/docs/sections/UserGuideSection";
import { MathSection } from "@/components/docs/sections/MathSection";
import { ProviderCoverageSection } from "@/components/docs/sections/ProviderCoverageSection";
import { WalletCompatibilitySection } from "@/components/docs/sections/WalletCompatibilitySection";
import { ApiReferenceSection } from "@/components/docs/sections/ApiReferenceSection";
import { ArchitectureRiskSection } from "@/components/docs/sections/ArchitectureRiskSection";
import { MainnetBlockersSection } from "@/components/docs/sections/MainnetBlockersSection";

export const metadata: Metadata = {
  title: "Documentation | Commodity Markets Capital",
  description: "Comprehensive guide, APIs, and equations for the Commodity Markets Capital preview platform.",
};

export default function DocsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <div className="flex flex-col lg:flex-row gap-12 relative items-start">
        <DocsSidebar />
        
        <div className="w-full flex-1 min-w-0">
          <div className="mb-12 border-b border-border pb-8">
            <h1 className="text-4xl lg:text-5xl font-bold font-mono tracking-tight uppercase text-foreground mb-4">
              Documentation
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Complete reference for the Commodity Markets Capital platform, including user guides, protocol mathematics, and API endpoints.
            </p>
          </div>

          <div className="space-y-16">
            <OverviewSection />
            <UserGuideSection />
            <MathSection />
            <ProviderCoverageSection />
            <WalletCompatibilitySection />
            <ApiReferenceSection />
            <ArchitectureRiskSection />
            <MainnetBlockersSection />
          </div>
        </div>
      </div>
    </div>
  );
}