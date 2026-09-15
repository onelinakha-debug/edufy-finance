import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useStudentStore } from "@/stores/student-store";
import { usePaymentStore } from "@/stores/payment-store";
import { useFeeStore } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, formatRelative } from "@/lib/utils";
import {
  Users, CreditCard, AlertTriangle, TrendingUp, Plus,
  RefreshCw, Receipt, ArrowRight, GraduationCap, DollarSign,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";

const COLORS = ["#C96442", "#2D8F5E", "#D4A843", "#5B7DB1", "#9B6B9E"];

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
    return { active, totalInvoiced, totalPaid, outstanding, rate, overdue };
  }, [students, invoices, payments]);

  const recentPayments = useMemo(() =>
    [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [payments]
  );

  // Chart data: payment methods breakdown
  const methodData = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => {
      if (p.status === "completed") {
        map.set(p.method, (map.get(p.method) || 0) + p.amount);
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [payments]);

  // Chart data: grade breakdown of outstanding
  const gradeData = useMemo(() => {
    const map = new Map<string, number>();
    invoices
      .filter((i) => i.status !== "paid" && i.status !== "waived")
      .forEach((inv) => {
        const grade = (inv as any).student_name?.split(" ")[0] || "Unknown";
        map.set(grade, (map.get(grade) || 0) + inv.net_amount);
      });
    // Try to group by student grade if available
    const gradeMap = new Map<string, number>();
    invoices
      .filter((i) => i.status !== "paid")
      .forEach((inv) => {
        const key = (inv as any).grade || "All";
        gradeMap.set(key, (gradeMap.get(key) || 0) + inv.net_amount);
      });
    if (gradeMap.size > 1) {
      return Array.from(gradeMap.entries()).map(([name, value]) => ({ name, value }));
    }
    return Array.from(map.entries()).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [invoices]);

  // Collection rate data for bar chart
  const collectionBarData = useMemo(() => [
    { name: "Paid", value: stats.totalPaid, fill: "#2D8F5E" },
    { name: "Outstanding", value: stats.outstanding, fill: "#D4A843" },
  ], [stats]);

  const isEmpty = students.length === 0 && invoices.length === 0 && payments.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Overview of your school's fee collection"
        actions={[
          { label: "Refresh", icon: RefreshCw, onClick: handleRefresh, variant: "ghost" },
        ]}
      />

      {/* Empty state */}
      {isEmpty && (
        <div className="card-claude p-8 mb-6">
          <EmptyState
            icon={GraduationCap}
            title="Welcome to Edufy Finance"
            description="Get started by setting up your school, adding students, and creating fee structures. Your dashboard will come alive with data."
            action={{ label: "Go to Settings", onClick: () => navigate("/settings"), icon: Plus }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Active Students", value: String(stats.active), icon: Users, color: "text-primary", onClick: () => navigate("/students"), sub: stats.active === 0 ? "Add students" : undefined },
          { label: "Collected", value: formatKES(stats.totalPaid), icon: CreditCard, color: "text-success", onClick: () => navigate("/payments"), sub: stats.totalPaid === 0 ? "Record payment" : undefined },
          { label: "Outstanding", value: formatKES(stats.outstanding), icon: AlertTriangle, color: "text-warning", onClick: () => navigate("/reports"), sub: stats.overdue > 0 ? `${stats.overdue} overdue` : undefined },
          { label: "Collection Rate", value: `${stats.rate}%`, icon: TrendingUp, color: "text-primary", onClick: () => navigate("/reports"), sub: stats.rate === 0 ? "Generate invoices" : undefined },
        ].map((s) => (
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
      {stats.totalInvoiced > 0 && (
        <div className="card-claude p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Collection Progress — {stats.rate}%</span>
            <span className="text-xs text-muted-foreground">{formatKES(stats.totalPaid)} of {formatKES(stats.totalInvoiced)}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${stats.rate}%` }} />
          </div>
        </div>
      )}

      {/* Charts row */}
      {payments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Payment methods pie */}
          {methodData.length > 0 && (
            <div className="card-claude p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Methods</h3>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={methodData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {methodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatKES(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {methodData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collected vs Outstanding bar */}
          <div className="card-claude p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Collected vs Outstanding</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={collectionBarData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatKES(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {collectionBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grade breakdown */}
          {gradeData.length > 0 && (
            <div className="card-claude p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Outstanding by Grade</h3>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                    <Tooltip formatter={(v: number) => formatKES(v)} />
                    <Bar dataKey="value" fill="#D4A843" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick actions when empty */}
      {stats.active === 0 && students.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {[
            { icon: Users, label: "Add Students", desc: "Import CSV or add manually", onClick: () => navigate("/students") },
            { icon: DollarSign, label: "Create Fees", desc: "Set up fee structures", onClick: () => navigate("/fees") },
            { icon: Receipt, label: "Record Payment", desc: "Accept M-Pesa or cash", onClick: () => navigate("/payments") },
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="card-claude p-4 text-left hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Payments */}
        <div className="card-claude">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Payments</h3>
            <button onClick={() => navigate("/payments")} className="text-[11px] text-primary hover:underline">View all</button>
          </div>
          {recentPayments.length === 0 ? (
            <div className="py-10 text-center">
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Payments will appear here once you start recording them."
                action={{ label: "Record Payment", onClick: () => navigate("/payments"), icon: Plus }}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.payment_no}</p>
                    <p className="text-[11px] text-muted-foreground">{p.method} · {formatRelative(p.created_at)}</p>
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Balances</h3>
            <button onClick={() => navigate("/reports")} className="text-[11px] text-primary hover:underline">View all</button>
          </div>
          {stats.outstanding === 0 ? (
            <div className="py-10 text-center">
              <EmptyState
                icon={AlertTriangle}
                title="All clear!"
                description="No outstanding balances. All invoices are paid."
              />
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-2xl font-bold text-warning">{formatKES(stats.outstanding)}</p>
              <p className="text-xs text-muted-foreground mt-1">Total outstanding across all students</p>
              <button
                onClick={() => navigate("/reports")}
                className="mt-3 px-4 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                View Report
              </button>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
