import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStudentStore } from "@/stores/student-store";
import { usePaymentStore } from "@/stores/payment-store";
import { useFeeStore } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, formatRelative, formatCompact } from "@/lib/utils";
import {
  Users, CreditCard, AlertTriangle, TrendingUp, ArrowUpRight,
  ArrowDownRight, RefreshCw, Plus, Receipt, Clock, Eye,
} from "lucide-react";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentSchoolId } = useAppStore();
  const { students, fetchStudents } = useStudentStore();
  const { payments, fetchPayments } = usePaymentStore();
  const { invoices, fetchInvoices } = useFeeStore();
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    await Promise.all([
      currentSchoolId ? fetchStudents(currentSchoolId) : fetchStudents(),
      fetchPayments(),
      fetchInvoices(),
    ]);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const active = students.filter((s) => s.status === "active").length;
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.net_amount, 0);
    const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.net_amount, 0);
    const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "waived").reduce((s, i) => s + i.net_amount, 0);
    const rate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;
    const overdue = invoices.filter((i) => i.status === "overdue").length;
    const today = new Date().toISOString().split("T")[0];
    const todayAmt = payments.filter((p) => p.created_at >= today && p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
    return { active, totalInvoiced, totalPaid, outstanding, rate, overdue, todayAmt };
  }, [students, invoices, payments]);

  const recentPayments = useMemo(() =>
    [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [payments]
  );

  const topOutstanding = useMemo(() => {
    const map = new Map<string, { name: string; outstanding: number; grade: string }>();
    invoices.filter((i) => i.status !== "paid" && i.status !== "waived").forEach((inv) => {
      const e = map.get(inv.student_id);
      if (e) e.outstanding += inv.net_amount;
      else map.set(inv.student_id, { name: inv.student_name || "Unknown", outstanding: inv.net_amount, grade: "" });
    });
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6);
  }, [invoices]);

  const STAT_CARDS = [
    { label: "Active Students", value: String(stats.active), icon: Users, color: "text-primary", onClick: () => navigate("/students") },
    { label: "Collected", value: formatKES(stats.totalPaid), sub: `${formatKES(stats.todayAmt)} today`, icon: CreditCard, color: "text-success", onClick: () => navigate("/payments") },
    { label: "Outstanding", value: formatKES(stats.outstanding), sub: `${stats.overdue} overdue`, icon: AlertTriangle, color: "text-warning", onClick: () => navigate("/reports") },
    { label: "Collection Rate", value: `${stats.rate}%`, icon: TrendingUp, color: "text-primary", onClick: () => navigate("/reports") },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Overview of your school's fee collection"
        actions={[
          { label: "Refresh", icon: RefreshCw, onClick: handleRefresh, variant: "ghost" },
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STAT_CARDS.map((s) => (
          <button
            key={s.label}
            onClick={s.onClick}
            className="stat-card group hover:border-primary/30 transition-all text-left"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="text-xl font-bold tracking-tight">{s.value}</div>
            {s.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>}
          </button>
        ))}
      </div>

      {/* Collection rate bar */}
      <div className="card-claude p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Collection Progress — {stats.rate}%</span>
          <span className="text-xs text-muted-foreground">{formatKES(stats.totalPaid)} of {formatKES(stats.totalInvoiced)}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${stats.rate}%` }} />
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Payments */}
        <div className="card-claude">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Payments</h3>
            <button onClick={() => navigate("/payments")} className="text-[11px] text-primary hover:underline">View all</button>
          </div>
          {recentPayments.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No payments yet</div>
          ) : (
            <div className="divide-y divide-border">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.payment_no}</p>
                    <p className="text-[11px] text-muted-foreground">{p.method} • {formatRelative(p.created_at)}</p>
                  </div>
                  <span className="text-sm font-mono font-medium">{formatKES(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Outstanding */}
        <div className="card-claude">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Outstanding</h3>
            <button onClick={() => navigate("/reports")} className="text-[11px] text-primary hover:underline">View all</button>
          </div>
          {topOutstanding.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">All clear — no outstanding balances</div>
          ) : (
            <div className="divide-y divide-border">
              {topOutstanding.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.grade || "—"}</p>
                  </div>
                  <span className="text-sm font-mono font-medium text-warning">{formatKES(s.outstanding)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
