import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useGradeStore, Grade } from "@/stores/grade-store";
import { useStudentStore, Student } from "@/stores/student-store";
import { useAppStore } from "@/stores/app-store";
import { SearchSelect } from "@/components/ui/search-select";
import { ArrowRight, Check, Loader2, Users, History, ChevronDown, ChevronUp } from "lucide-react";

export function PromotionPanel() {
  const { grades, promotions, fetchGrades, fetchPromotions, promote, loading } = useGradeStore();
  const { students, fetchStudents } = useStudentStore();
  const { addToast, currentSchoolId } = useAppStore();
  const [fromGrade, setFromGrade] = useState("");
  const [toGrade, setToGrade] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (currentSchoolId) {
      fetchGrades(currentSchoolId);
      fetchStudents(currentSchoolId || undefined);
      fetchPromotions(currentSchoolId);
    }
  }, [currentSchoolId]);

  const activeGrades = grades.filter((g) => g.is_active);

  const sourceStudents = useMemo(() => {
    if (!fromGrade) return [];
    return students.filter((s) => s.grade === fromGrade && s.status === "active");
  }, [students, fromGrade]);

  useEffect(() => {
    if (fromGrade && selectAll) {
      setSelectedIds(new Set(sourceStudents.map((s) => s.id)));
    }
  }, [fromGrade, sourceStudents, selectAll]);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sourceStudents.map((s) => s.id)));
    }
    setSelectAll(!selectAll);
  };

  const handlePromote = async () => {
    if (!fromGrade || !toGrade || !currentSchoolId) return;
    if (selectedIds.size === 0) {
      addToast({ title: "No students selected", variant: "error" });
      return;
    }
    const confirmed = confirm(
      `Promote ${selectedIds.size} student${selectedIds.size > 1 ? "s" : ""} from ${fromGrade} → ${toGrade}?`
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await promote(currentSchoolId, fromGrade, toGrade, currentYear, Array.from(selectedIds));
      addToast({
        title: `Promoted ${selectedIds.size} student${selectedIds.size > 1 ? "s" : ""}`,
        variant: "success",
      });
      setFromGrade("");
      setToGrade("");
      setSelectedIds(new Set());
      fetchStudents(currentSchoolId || undefined);
    } catch (err) {
      addToast({ title: "Promotion failed", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Class Promotion</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Promote students to the next grade level</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          History
          {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Promotion History */}
      {showHistory && (
        <div className="border border-border rounded-lg overflow-hidden animate-fade-in">
          <div className="bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
            Promotion History
          </div>
          {promotions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">No promotions yet</p>
          ) : (
            <div className="divide-y divide-border/50">
              {promotions.slice(0, 10).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[11px]">
                  <span className="text-muted-foreground">{new Date(p.promoted_at).toLocaleDateString("en-KE")}</span>
                  <span className="font-medium">{p.from_grade}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.to_grade}</span>
                  <span className="text-muted-foreground">{p.student_count} student{p.student_count !== 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground ml-auto">Year {p.academic_year}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grade Selectors */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground">From Grade</label>
          <SearchSelect
            options={activeGrades.map((g) => ({
              value: g.name,
              label: `${g.name} (${students.filter((s) => s.grade === g.name && s.status === "active").length} students)`,
            }))}
            value={fromGrade}
            onChange={(v) => { setFromGrade(v); setToGrade(""); setSelectedIds(new Set()); }}
            placeholder="Select source grade"
            searchable={activeGrades.length > 6}
          />
        </div>

        <div className="pb-1">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground">To Grade</label>
          <SearchSelect
            options={activeGrades
              .filter((g) => g.name !== fromGrade)
              .map((g) => ({ value: g.name, label: g.name }))}
            value={toGrade}
            onChange={setToGrade}
            placeholder="Select target grade"
            searchable={activeGrades.length > 6}
            disabled={!fromGrade}
          />
        </div>
      </div>

      {/* Student Selection */}
      {fromGrade && (
        <div className="border border-border rounded-lg overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between bg-muted/30 px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium">
                {sourceStudents.length} student{sourceStudents.length !== 1 ? "s" : ""} in {fromGrade}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <button
                onClick={toggleAll}
                className="text-[11px] text-primary hover:underline"
              >
                {selectAll ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-border/30">
            {sourceStudents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4">No active students in this grade</p>
            ) : (
              sourceStudents.map((student) => (
                <label
                  key={student.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer transition-colors",
                    selectedIds.has(student.id) ? "bg-primary/5" : "hover:bg-muted/30"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(student.id)}
                    onChange={() => toggleStudent(student.id)}
                    className="rounded border-border h-3.5 w-3.5"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground w-16">{student.admission_no}</span>
                  <span className="flex-1">{student.first_name} {student.last_name}</span>
                  {student.stream && <span className="text-[10px] text-muted-foreground">{student.stream}</span>}
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {/* Promote Button */}
      {fromGrade && toGrade && selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 animate-fade-in">
          <div className="text-xs">
            <span className="font-medium">{selectedIds.size}</span> student{selectedIds.size > 1 ? "s" : ""} will be promoted from{" "}
            <span className="font-medium">{fromGrade}</span> → <span className="font-medium">{toGrade}</span>
          </div>
          <button
            onClick={handlePromote}
            disabled={submitting}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {submitting ? "Promoting..." : "Confirm Promotion"}
          </button>
        </div>
      )}
    </div>
  );
}
