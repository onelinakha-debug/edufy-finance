import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useGradeStore, Grade } from "@/stores/grade-store";
import { useAppStore } from "@/stores/app-store";
import { SearchSelect } from "@/components/ui/search-select";
import { Plus, Pencil, Trash2, GripVertical, X, Save, Loader2, Layers, Zap, Copy, Check } from "lucide-react";

const LEVELS = [
  { value: "pre_primary", label: "Pre-Primary" },
  { value: "primary", label: "Primary" },
  { value: "junior", label: "Junior Secondary" },
  { value: "senior", label: "Senior Secondary" },
];

const GRADE_PRESETS = [
  {
    name: "CBC Full (PP1 – Grade 12)",
    description: "Complete CBC curriculum: PP1-PP2, Grade 1-12",
    grades: [
      { name: "PP1", level: "pre_primary" },
      { name: "PP2", level: "pre_primary" },
      { name: "Grade 1", level: "primary" },
      { name: "Grade 2", level: "primary" },
      { name: "Grade 3", level: "primary" },
      { name: "Grade 4", level: "primary" },
      { name: "Grade 5", level: "primary" },
      { name: "Grade 6", level: "primary" },
      { name: "Grade 7", level: "junior" },
      { name: "Grade 8", level: "junior" },
      { name: "Grade 9", level: "junior" },
      { name: "Grade 10", level: "senior" },
      { name: "Grade 11", level: "senior" },
      { name: "Grade 12", level: "senior" },
    ],
  },
  {
    name: "Primary Only (PP1 – Grade 6)",
    description: "Pre-primary and primary school",
    grades: [
      { name: "PP1", level: "pre_primary" },
      { name: "PP2", level: "pre_primary" },
      { name: "Grade 1", level: "primary" },
      { name: "Grade 2", level: "primary" },
      { name: "Grade 3", level: "primary" },
      { name: "Grade 4", level: "primary" },
      { name: "Grade 5", level: "primary" },
      { name: "Grade 6", level: "primary" },
    ],
  },
  {
    name: "Junior Secondary (Grade 7-9)",
    description: "Junior secondary school only",
    grades: [
      { name: "Grade 7", level: "junior" },
      { name: "Grade 8", level: "junior" },
      { name: "Grade 9", level: "junior" },
    ],
  },
  {
    name: "8-4-4 System (Form 1-4)",
    description: "Legacy 8-4-4 curriculum",
    grades: [
      { name: "Form 1", level: "junior" },
      { name: "Form 2", level: "junior" },
      { name: "Form 3", level: "senior" },
      { name: "Form 4", level: "senior" },
    ],
  },
  {
    name: "Mixed: PP1 – Form 4",
    description: "CBC primary + 8-4-4 secondary",
    grades: [
      { name: "PP1", level: "pre_primary" },
      { name: "PP2", level: "pre_primary" },
      { name: "Grade 1", level: "primary" },
      { name: "Grade 2", level: "primary" },
      { name: "Grade 3", level: "primary" },
      { name: "Grade 4", level: "primary" },
      { name: "Grade 5", level: "primary" },
      { name: "Grade 6", level: "primary" },
      { name: "Form 1", level: "junior" },
      { name: "Form 2", level: "junior" },
      { name: "Form 3", level: "senior" },
      { name: "Form 4", level: "senior" },
    ],
  },
];

export function GradeManagementPanel() {
  const { grades, fetchGrades, addGrade, updateGrade, deleteGrade, loading } = useGradeStore();
  const { addToast, currentSchoolId } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState("primary");
  const [editName, setEditName] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentSchoolId) fetchGrades(currentSchoolId);
  }, [currentSchoolId]);

  const handleAdd = async () => {
    if (!newName.trim() || !currentSchoolId) return;
    setSubmitting(true);
    try {
      await addGrade(currentSchoolId, newName.trim(), newLevel, grades.length);
      addToast({ title: `Added grade "${newName.trim()}"`, variant: "success" });
      setNewName("");
      setAdding(false);
    } catch (err) {
      addToast({ title: "Failed to add grade", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSubmitting(true);
    try {
      await updateGrade(id, { name: editName.trim(), level: editLevel });
      addToast({ title: "Grade updated", variant: "success" });
      setEditingId(null);
    } catch (err) {
      addToast({ title: "Failed to update", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (grade: Grade) => {
    if (!confirm(`Delete "${grade.name}"? Students cannot be enrolled in a deleted grade.`)) return;
    try {
      await deleteGrade(grade.id);
      addToast({ title: `Deleted "${grade.name}"`, variant: "success" });
    } catch (err) {
      addToast({ title: "Cannot delete", description: String(err), variant: "error" });
    }
  };

  const handleApplyPreset = async (preset: typeof GRADE_PRESETS[0]) => {
    if (!currentSchoolId) return;
    if (grades.length > 0) {
      const ok = confirm(`This will add ${preset.grades.length} grades. Existing grades are kept. Continue?`);
      if (!ok) return;
    }
    setApplyingPreset(preset.name);
    let added = 0;
    for (let i = 0; i < preset.grades.length; i++) {
      const g = preset.grades[i];
      try {
        await addGrade(currentSchoolId, g.name, g.level, grades.length + i);
        added++;
      } catch { /* skip duplicates */ }
    }
    addToast({ title: `Added ${added} grades from "${preset.name}"`, variant: "success" });
    setApplyingPreset(null);
  };

  const handleBulkAdd = async () => {
    if (!bulkText.trim() || !currentSchoolId) return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setSubmitting(true);
    let added = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const [name, level] = line.split(",").map((s) => s.trim());
      const validLevel = LEVELS.find((l) => l.value === level)?.value || "primary";
      try {
        await addGrade(currentSchoolId, name, validLevel, grades.length + i);
        added++;
      } catch { /* skip duplicates */ }
    }
    addToast({ title: `Added ${added} grades`, variant: "success" });
    setBulkText("");
    setShowBulk(false);
    setSubmitting(false);
  };

  const grouped = LEVELS.map((l) => ({
    ...l,
    grades: grades.filter((g) => g.level === l.value),
  })).filter((g) => g.grades.length > 0 || adding);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Grade Levels</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{grades.length} grade{grades.length !== 1 ? "s" : ""} configured</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowBulk(!showBulk)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors inline-flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Bulk Add
          </button>
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="h-3 w-3" /> Add Grade
          </button>
        </div>
      </div>

      {/* Preset Templates */}
      {grades.length === 0 && !adding && !showBulk && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Quick Setup — One-Click Presets</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GRADE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleApplyPreset(preset)}
                disabled={applyingPreset !== null}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium group-hover:text-primary transition-colors">{preset.name}</p>
                  {applyingPreset === preset.name ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : (
                    <Zap className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{preset.grades.length} grades</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Add */}
      {showBulk && (
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Bulk Add Grades</span>
            <button onClick={() => setShowBulk(false)} className="p-0.5 rounded hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="text-[10px] text-muted-foreground">One grade per line. Format: <code className="bg-muted px-1 rounded">Grade Name, level</code> (e.g. "Grade 1, primary")</p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"PP1, pre_primary\nPP2, pre_primary\nGrade 1, primary\nGrade 2, primary"}
            rows={6}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <button
            onClick={handleBulkAdd}
            disabled={!bulkText.trim() || submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add {bulkText.split("\n").filter((l) => l.trim()).length} Grades
          </button>
        </div>
      )}

      {/* Single Add */}
      {adding && (
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 flex items-end gap-3 animate-fade-in">
          <div className="flex-1 space-y-1.5">
            <label className="block text-[11px] font-medium">Grade Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Grade 1, PP1, Form 3"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            />
          </div>
          <div className="w-40 space-y-1.5">
            <label className="block text-[11px] font-medium">Level</label>
            <SearchSelect options={LEVELS} value={newLevel} onChange={setNewLevel} searchable={false} size="sm" />
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleAdd} disabled={!newName.trim() || submitting} className="h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1 disabled:opacity-50">
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </button>
            <button onClick={() => setAdding(false)} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {/* Grade List */}
      {grouped.map((level) => (
        <div key={level.value} className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">{level.label}</p>
          <div className="space-y-1">
            {level.grades.map((grade) => (
              <div key={grade.id} className={cn("flex items-center gap-2 px-2.5 py-2 rounded-md border border-border/50 text-xs group transition-colors", editingId === grade.id ? "bg-primary/5 border-primary/20" : "hover:bg-muted/30")}>
                <GripVertical className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {editingId === grade.id ? (
                  <>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(grade.id); if (e.key === "Escape") setEditingId(null); }} />
                    <div className="w-32"><SearchSelect options={LEVELS} value={editLevel} onChange={setEditLevel} searchable={false} size="sm" /></div>
                    <button onClick={() => handleUpdate(grade.id)} disabled={submitting} className="p-1 rounded hover:bg-primary/10 text-primary"><Save className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{grade.name}</span>
                    {!grade.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactive</span>}
                    <button onClick={() => { setEditingId(grade.id); setEditName(grade.name); setEditLevel(grade.level); }} className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => handleDelete(grade)} className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {grades.length === 0 && !loading && !adding && !showBulk && (
        <div className="text-center py-6">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No grades configured yet.</p>
          <p className="text-[11px] text-muted-foreground mt-1">Use a preset above or add grades manually.</p>
        </div>
      )}
    </div>
  );
}
