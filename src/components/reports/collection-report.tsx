import React, { useState, useEffect, useMemo } from "react";
import { useReportStore, CollectionSummary } from "@/stores/report-store";
import { useFeeStore } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, getMethodName } from "@/lib/utils";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchSelect } from "@/components/ui/search-select";
import { Download, TrendingUp, BarChart3 } from "lucide-react";
import { useExport } from "@/hooks/use-export";

export function CollectionReport() {
  const { currentSchoolId } = useAppStore();
  const { summary, fetchSummary, loading } = useReportStore();
  const [term, setTerm] = useState<string>("1");
  const { exportToCSV } = useExport();

  useEffect(() => {
    if (currentSchoolId) {
      fetchSummary(currentSchoolId, 2026, term);
    }
  }, [currentSchoolId, term]);

  if (loading) return <LoadingPage />;
  if (!summary) return <EmptyState icon={BarChart3} title="No data" description="Generate invoices and record payments to see collection reports." />;

  const handleExport = () => {
    const data = summary.by_vote_head.map((v) => ({
      "Vote Head": v.name,
      Invoiced: v.invoiced,
      Paid: v.paid,
      Outstanding: v.invoiced - v.paid,
    }));
    exportToCSV(data, `collection-report-term-${term}`);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Term:</label>
          <SearchSelect
            options={[
              { value: "1", label: "Term 1" },
              { value: "2", label: "Term 2" },
              { value: "3", label: "Term 3" },
            ]}
            value={term}
            onChange={setTerm}
            searchable={false}
            size="sm"
            className="w-28"
          />
        </div>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-input hover:bg-muted inline-flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="text-sm font-medium text-muted-foreground">Invoiced</span>
          <div className="text-2xl font-semibold">{formatKES(summary.total_invoiced)}</div>
        </div>
        <div className="stat-card">
          <span className="text-sm font-medium text-muted-foreground">Collected</span>
          <div className="text-2xl font-semibold text-success">{formatKES(summary.total_paid)}</div>
        </div>
        <div className="stat-card">
          <span className="text-sm font-medium text-muted-foreground">Outstanding</span>
          <div className="text-2xl font-semibold text-warning">{formatKES(summary.total_outstanding)}</div>
        </div>
        <div className="stat-card">
          <span className="text-sm font-medium text-muted-foreground">Discounted</span>
          <div className="text-2xl font-semibold">{formatKES(summary.total_discounted)}</div>
        </div>
      </div>

      {/* By vote head */}
      <div className="card-claude p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">By Vote Head</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium py-2">Vote Head</th>
              <th className="text-right font-medium py-2">Invoiced</th>
              <th className="text-right font-medium py-2">Paid</th>
              <th className="text-right font-medium py-2">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {summary.by_vote_head.map((v, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-2">{v.name}</td>
                <td className="text-right font-mono py-2">{formatKES(v.invoiced)}</td>
                <td className="text-right font-mono py-2">{formatKES(v.paid)}</td>
                <td className="text-right font-mono py-2 text-warning">{formatKES(v.invoiced - v.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By method */}
      <div className="card-claude p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">By Payment Method</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.by_method.map((m, i) => (
            <div key={i} className="text-center p-3 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground">{getMethodName(m.method)}</p>
              <p className="text-lg font-semibold mt-1">{formatKES(m.total)}</p>
              <p className="text-xs text-muted-foreground">{m.count} payments</p>
            </div>
          ))}
        </div>
      </div>

      {/* By grade */}
      <div className="card-claude p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">By Grade</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium py-2">Grade</th>
              <th className="text-right font-medium py-2">Invoiced</th>
              <th className="text-right font-medium py-2">Paid</th>
              <th className="text-right font-medium py-2">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {summary.by_grade.map((g, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{g.grade}</td>
                <td className="text-right font-mono py-2">{formatKES(g.invoiced)}</td>
                <td className="text-right font-mono py-2">{formatKES(g.paid)}</td>
                <td className="text-right font-mono py-2 text-warning">{formatKES(g.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily trend */}
      {summary.daily_trend.length > 0 && (
        <div className="card-claude p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Daily Collection Trend</h3>
          <div className="flex items-end gap-1 h-32">
            {summary.daily_trend.slice(-14).map((d, i) => {
              const max = Math.max(...summary.daily_trend.map((x) => x.amount));
              const height = max > 0 ? (d.amount / max) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary/20 rounded-t"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
