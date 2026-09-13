import React, { useState, useEffect } from "react";
import { useReportStore, StudentHistoryEntry } from "@/stores/report-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, formatDateTime, getMethodName } from "@/lib/utils";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchSelect } from "@/components/ui/search-select";
import { Download, Search, History } from "lucide-react";
import { useExport } from "@/hooks/use-export";
import { useStudentStore } from "@/stores/student-store";

export function StudentHistoryReport() {
  const { currentSchoolId } = useAppStore();
  const { students, fetchStudents } = useStudentStore();
  const { studentHistory, fetchStudentHistory, loading } = useReportStore();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [search, setSearch] = useState("");
  const { exportToCSV } = useExport();

  useEffect(() => {
    if (currentSchoolId) fetchStudents(currentSchoolId);
  }, [currentSchoolId]);

  useEffect(() => {
    if (selectedStudentId) fetchStudentHistory(selectedStudentId);
  }, [selectedStudentId]);

  const filteredStudents = students.filter(
    (s) =>
      s.first_name.toLowerCase().includes(search.toLowerCase()) ||
      s.last_name.toLowerCase().includes(search.toLowerCase()) ||
      s.admission_no.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebit = studentHistory.reduce((s, h) => s + h.debit, 0);
  const totalCredit = studentHistory.reduce((s, h) => s + h.credit, 0);
  const balance = totalDebit - totalCredit;

  const handleExport = () => {
    const data = studentHistory.map((h) => ({
      Date: h.date,
      Description: h.description,
      Debit: h.debit,
      Credit: h.credit,
      Balance: h.balance,
      Method: h.method ? getMethodName(h.method) : "",
      Reference: h.reference || "",
    }));
    exportToCSV(data, `student-history-${selectedStudentId}`);
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="space-y-6">
      {/* Student selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="flex h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <SearchSelect
          options={filteredStudents.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name} (${s.admission_no})` }))}
          value={selectedStudentId}
          onChange={setSelectedStudentId}
          placeholder="Select a student..."
          searchable={true}
          className="w-64"
        />
        {selectedStudentId && (
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-input hover:bg-muted inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        )}
      </div>

      {!selectedStudentId ? (
        <EmptyState
          icon={History}
          title="Select a student"
          description="Choose a student to view their complete payment history and running balance."
        />
      ) : studentHistory.length === 0 && !loading ? (
        <EmptyState
          icon={History}
          title="No transactions"
          description="This student has no invoice or payment records yet."
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <span className="text-sm font-medium text-muted-foreground">Total Billed</span>
              <div className="text-xl font-semibold">{formatKES(totalDebit)}</div>
            </div>
            <div className="stat-card">
              <span className="text-sm font-medium text-muted-foreground">Total Paid</span>
              <div className="text-xl font-semibold text-success">{formatKES(totalCredit)}</div>
            </div>
            <div className="stat-card">
              <span className="text-sm font-medium text-muted-foreground">Balance</span>
              <div className={`text-xl font-semibold ${balance > 0 ? "text-warning" : "text-success"}`}>
                {formatKES(balance)}
              </div>
            </div>
          </div>

          {/* History table */}
          <div className="card-claude overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium py-3 px-4">Date</th>
                  <th className="text-left font-medium py-3 px-4">Description</th>
                  <th className="text-right font-medium py-3 px-4">Debit</th>
                  <th className="text-right font-medium py-3 px-4">Credit</th>
                  <th className="text-right font-medium py-3 px-4">Balance</th>
                  <th className="text-left font-medium py-3 px-4">Method</th>
                </tr>
              </thead>
              <tbody>
                {studentHistory.map((h, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="py-3 px-4 text-muted-foreground">{h.date}</td>
                    <td className="py-3 px-4">{h.description}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {h.debit > 0 ? formatKES(h.debit) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-success">
                      {h.credit > 0 ? formatKES(h.credit) : "—"}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono font-medium ${h.balance > 0 ? "text-warning" : "text-success"}`}>
                      {formatKES(h.balance)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {h.method ? getMethodName(h.method) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
