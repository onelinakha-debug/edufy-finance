import React, { useState, useEffect, useMemo } from "react";
import { useReportStore, OutstandingEntry } from "@/stores/report-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES } from "@/lib/utils";
import { DataTable, Column } from "@/components/shared/data-table";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchSelect } from "@/components/ui/search-select";
import { Download, AlertTriangle } from "lucide-react";
import { useExport } from "@/hooks/use-export";

interface OutstandingReportProps {
  onStudentClick?: (studentId: string) => void;
}

export function OutstandingReport({ onStudentClick }: OutstandingReportProps) {
  const { currentSchoolId } = useAppStore();
  const { outstanding, fetchOutstanding, loading } = useReportStore();
  const [term, setTerm] = useState<string>("1");
  const { exportToCSV } = useExport();

  useEffect(() => {
    if (currentSchoolId) {
      fetchOutstanding(currentSchoolId, 2026, term);
    }
  }, [currentSchoolId, term]);

  const columns: Column<OutstandingEntry>[] = [
    {
      key: "student_name",
      header: "Student",
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-medium">{row.student_name}</p>
          <p className="text-xs text-muted-foreground">{row.admission_no}</p>
        </div>
      ),
    },
    {
      key: "grade",
      header: "Grade",
      sortable: true,
      render: (row) => <span className="text-sm">{row.grade}</span>,
    },
    {
      key: "total_invoiced",
      header: "Invoiced",
      sortable: true,
      render: (row) => <span className="text-sm font-mono">{formatKES(row.total_invoiced)}</span>,
    },
    {
      key: "total_paid",
      header: "Paid",
      sortable: true,
      render: (row) => <span className="text-sm font-mono">{formatKES(row.total_paid)}</span>,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      sortable: true,
      render: (row) => <span className="text-sm font-mono font-medium text-warning">{formatKES(row.outstanding)}</span>,
    },
    {
      key: "days_overdue",
      header: "Days Overdue",
      sortable: true,
      render: (row) => (
        <span className={`text-sm ${row.days_overdue > 30 ? "text-destructive" : "text-muted-foreground"}`}>
          {row.days_overdue}d
        </span>
      ),
    },
  ];

  const handleExport = () => {
    const data = outstanding.map((o) => ({
      Student: o.student_name,
      "Admission No": o.admission_no,
      Grade: o.grade,
      Invoiced: o.total_invoiced,
      Paid: o.total_paid,
      Outstanding: o.outstanding,
      "Days Overdue": o.days_overdue,
    }));
    exportToCSV(data, `outstanding-report-term-${term}`);
  };

  const totalOutstanding = outstanding.reduce((s, o) => s + o.outstanding, 0);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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
          <div className="text-sm text-muted-foreground">
            {outstanding.length} students • Total: <span className="font-medium text-warning">{formatKES(totalOutstanding)}</span>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-input hover:bg-muted inline-flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {outstanding.length === 0 && !loading ? (
        <EmptyState
          icon={AlertTriangle}
          title="No outstanding balances"
          description="All students are fully paid for this term."
        />
      ) : (
        <DataTable
          columns={columns}
          data={outstanding}
          loading={loading}
          onRowClick={(row) => onStudentClick?.(row.student_id)}
          rowKey={(row) => row.student_id}
          emptyTitle="No outstanding balances"
        />
      )}
    </div>
  );
}
