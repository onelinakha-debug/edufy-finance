import React, { useState } from "react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { CollectionReport } from "@/components/reports/collection-report";
import { OutstandingReport } from "@/components/reports/outstanding-report";
import { StudentHistoryReport } from "@/components/reports/student-history-report";
import { cn } from "@/lib/utils";
import { BarChart3, AlertTriangle, History, Download } from "lucide-react";

type ReportTab = "collection" | "outstanding" | "history";

const TABS: { key: ReportTab; label: string; icon: React.ElementType }[] = [
  { key: "collection", label: "Collection Summary", icon: BarChart3 },
  { key: "outstanding", label: "Outstanding", icon: AlertTriangle },
  { key: "history", label: "Student History", icon: History },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("collection");

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Fee collection analysis, outstanding balances, and financial reports"
        breadcrumbs={[{ label: "Reports" }]}
      />

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border mb-6 -mx-1 px-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {activeTab === "collection" && <CollectionReport />}
        {activeTab === "outstanding" && <OutstandingReport />}
        {activeTab === "history" && <StudentHistoryReport />}
      </div>
    </PageContainer>
  );
}
