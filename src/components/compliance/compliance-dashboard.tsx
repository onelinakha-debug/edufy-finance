import React, { useEffect, useState } from "react";
import { cn, formatKES } from "@/lib/utils";
import { useFeeStore } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Shield, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";

interface ComplianceDashboardProps {
  schoolId: string;
  term: string;
}

interface ComplianceCheck {
  id: string;
  title: string;
  description: string;
  status: "pass" | "warn" | "fail";
  details?: string;
}

export function ComplianceDashboard({ schoolId, term }: ComplianceDashboardProps) {
  const { structures, voteHeads, fetchStructures, fetchVoteHeads } = useFeeStore();
  const { addToast } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (schoolId) {
      setLoading(true);
      fetchStructures(schoolId, 2026).then(async (structs) => {
        for (const s of structs || []) {
          await fetchVoteHeads(s.id);
        }
        setLoading(false);
      });
    }
  }, [schoolId, term]);

  if (loading) return <LoadingPage />;

  // Helper: get all vote heads for a structure
  const getHeads = (structureId: string) => voteHeads[structureId] || [];

  // CBC fee caps per term (government gazette Feb 2026)
  const FEE_CAPS: Record<string, number> = { "1": 5800, "2": 6200, "3": 5400 };
  const termCap = FEE_CAPS[term] || 5800;

  const checks: ComplianceCheck[] = [];

  // Check 1: Tuition fee cap
  let tuitionViolations = 0;
  structures.forEach((s) => {
    const heads = getHeads(s.id);
    const tuition = heads.find((v) => v.category === "tuition" || v.name.toLowerCase().includes("tuition"));
    if (tuition && tuition.amount > termCap) tuitionViolations++;
  });
  checks.push({
    id: "tuition-cap",
    title: "Tuition Fee Cap",
    description: `Term ${term} tuition must not exceed ${formatKES(termCap)}`,
    status: tuitionViolations > 0 ? "fail" : "pass",
    details: tuitionViolations > 0 ? `${tuitionViolations} structure(s) exceed the cap` : undefined,
  });

  // Check 2: Vote head categories
  let uncategorized = 0;
  structures.forEach((s) => {
    const heads = getHeads(s.id);
    if (heads.some((v) => !v.category || v.category === "other")) uncategorized++;
  });
  checks.push({
    id: "vote-head-categories",
    title: "Vote Head Categories",
    description: "All vote heads should have proper CBC categories",
    status: uncategorized > 0 ? "warn" : "pass",
    details: uncategorized > 0 ? `${uncategorized} structure(s) have uncategorized vote heads` : undefined,
  });

  // Check 3: Boarding fee cap
  const BOARDING_CAP = 25000;
  let boardingViolations = 0;
  structures.forEach((s) => {
    const heads = getHeads(s.id);
    const boarding = heads.find((v) => v.category === "boarding" || v.name.toLowerCase().includes("boarding"));
    if (boarding && boarding.amount > BOARDING_CAP) boardingViolations++;
  });
  checks.push({
    id: "boarding-cap",
    title: "Boarding Fee Cap",
    description: `Boarding fees should not exceed ${formatKES(BOARDING_CAP)}`,
    status: boardingViolations > 0 ? "fail" : "pass",
    details: boardingViolations > 0 ? `${boardingViolations} structure(s) exceed boarding cap` : undefined,
  });

  // Check 4: Activity fees
  const ACTIVITY_CAP = 3000;
  let activityViolations = 0;
  structures.forEach((s) => {
    const heads = getHeads(s.id);
    const activity = heads.find((v) => v.category === "activities" || v.name.toLowerCase().includes("activity"));
    if (activity && activity.amount > ACTIVITY_CAP) activityViolations++;
  });
  checks.push({
    id: "activity-cap",
    title: "Activity Fee Cap",
    description: `Activity fees should not exceed ${formatKES(ACTIVITY_CAP)}`,
    status: activityViolations > 0 ? "warn" : "pass",
    details: activityViolations > 0 ? `${activityViolations} structure(s) have high activity fees` : undefined,
  });

  // Check 5: CBC categories present
  const CBC_CATEGORIES = ["tuition", "boarding", "activities", "medical", "cbc_projects", "transport"];
  const allHeads = structures.flatMap((s) => getHeads(s.id));
  const usedCategories = new Set(allHeads.map((v) => v.category));
  const missingCategories = CBC_CATEGORIES.filter((c) => !usedCategories.has(c));
  checks.push({
    id: "cbc-categories",
    title: "CBC Categories Coverage",
    description: "Consider using all relevant CBC fee categories",
    status: missingCategories.length > 3 ? "warn" : "pass",
    details: missingCategories.length > 0 ? `Missing: ${missingCategories.join(", ")}` : undefined,
  });

  // Check 6: Mandatory vote heads
  let missingMandatory = 0;
  structures.forEach((s) => {
    const heads = getHeads(s.id);
    if (!heads.some((v) => v.category === "tuition" && v.is_mandatory)) missingMandatory++;
  });
  checks.push({
    id: "mandatory-vote-heads",
    title: "Mandatory Vote Heads",
    description: "Tuition should be marked as mandatory in all structures",
    status: missingMandatory > 0 ? "warn" : "pass",
    details: missingMandatory > 0 ? `${missingMandatory} structure(s) missing mandatory tuition` : undefined,
  });

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const overallStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  const STATUS_CONFIG = {
    pass: { icon: CheckCircle, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
    warn: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
    fail: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
  };

  return (
    <div className="space-y-4">
      <div className={cn("p-3 rounded-lg border flex items-center gap-3", STATUS_CONFIG[overallStatus].bg, STATUS_CONFIG[overallStatus].border)}>
        {React.createElement(STATUS_CONFIG[overallStatus].icon, { className: cn("h-4 w-4", STATUS_CONFIG[overallStatus].color) })}
        <div>
          <p className="text-sm font-medium">
            {overallStatus === "pass" ? "All checks passed" : overallStatus === "warn" ? "Some checks need attention" : "Issues found"}
          </p>
          <p className="text-[11px] text-muted-foreground">{passCount} passed, {warnCount} warnings, {failCount} failures</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {checks.map((check) => {
          const config = STATUS_CONFIG[check.status];
          const Icon = config.icon;
          return (
            <div key={check.id} className="card-claude p-3">
              <div className="flex items-start gap-2.5">
                <div className={cn("w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0", config.bg)}>
                  <Icon className={cn("h-3.5 w-3.5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{check.title}</p>
                    <StatusBadge status={check.status === "pass" ? "active" : check.status === "warn" ? "partial" : "overdue"} size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{check.description}</p>
                  {check.details && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{check.details}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <p>Fee caps are based on Kenya Government Gazette (Feb 2026) for public schools. Private schools should follow their own approved fee structures.</p>
      </div>
    </div>
  );
}
