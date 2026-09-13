import React, { useEffect, useState, useMemo, useCallback } from "react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentForm } from "@/components/students/student-form";
import { StudentDetail } from "@/components/students/student-detail";
import { StudentImportWizard } from "@/components/students/student-import-wizard";
import { useStudentStore, Student } from "@/stores/student-store";
import { useGradeStore } from "@/stores/grade-store";
import { useAppStore } from "@/stores/app-store";
import { GRADES_CBC } from "@/lib/constants";
import { formatKES, formatDate, exportCSV, cn } from "@/lib/utils";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { SearchSelect } from "@/components/ui/search-select";
import { Users, Plus, Search, Download, Upload, Trash2, Filter, X } from "lucide-react";

type View = "list" | "detail" | "add";

export default function StudentsPage() {
  const { students, fetchStudents, loading, removeStudent, addStudent } = useStudentStore();
  const { grades, fetchGrades } = useGradeStore();
  const { addToast, currentSchoolId } = useAppStore();
  const [view, setView] = useState<View>("list");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportWizard, setShowImportWizard] = useState(false);

  useEffect(() => { fetchStudents(currentSchoolId || undefined); }, []);
  useEffect(() => { if (currentSchoolId) fetchGrades(currentSchoolId); }, [currentSchoolId]);

  const gradeList = useMemo(() => {
    if (grades.length > 0) return grades.filter((g) => g.is_active).map((g) => g.name);
    return GRADES_CBC;
  }, [grades]);

  const filtered = useMemo(() => {
    let list = students;
    if (gradeFilter) list = list.filter((s) => s.grade === gradeFilter);
    if (statusFilter) list = list.filter((s) => s.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.admission_no.toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, gradeFilter, statusFilter, search]);

  const handleExport = () => {
    const data = filtered.map((s) => ({
      "Admission No": s.admission_no,
      "First Name": s.first_name,
      "Last Name": s.last_name,
      "Grade": s.grade,
      "Stream": s.stream || "",
      "Status": s.status,
      "Enrolled": s.enrollment_date || "",
    }));
    exportCSV(data, `students-${new Date().toISOString().split("T")[0]}`);
    addToast({ title: `Exported ${data.length} students`, variant: "success" });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} students?`)) return;
    for (const id of selectedIds) {
      await removeStudent(id);
    }
    addToast({ title: `Deleted ${selectedIds.size} students`, variant: "success" });
    setSelectedIds(new Set());
    fetchStudents();
  };

  const columns: Column<Student>[] = [
    {
      key: "admission_no",
      header: "Adm No",
      sortable: true,
      render: (s) => <span className="font-mono text-xs">{s.admission_no}</span>,
    },
    {
      key: "first_name",
      header: "Name",
      sortable: true,
      render: (s) => (
        <div>
          <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
          {s.middle_name && <p className="text-[11px] text-muted-foreground">{s.middle_name}</p>}
        </div>
      ),
    },
    {
      key: "grade",
      header: "Grade",
      sortable: true,
      render: (s) => <span className="text-xs">{s.grade}</span>,
    },
    {
      key: "stream",
      header: "Stream",
      render: (s) => <span className="text-xs">{s.stream || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: "enrollment_date",
      header: "Enrolled",
      sortable: true,
      render: (s) => <span className="text-xs text-muted-foreground">{s.enrollment_date ? formatDate(s.enrollment_date) : "—"}</span>,
    },
  ];

  const handleRowClick = (student: Student) => {
    setSelectedStudent(student);
    setView("detail");
  };

  if (view === "detail" && selectedStudent) {
    return (
      <PageContainer>
        <StudentDetail student={selectedStudent} onBack={() => { setView("list"); fetchStudents(); }} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Students"
        description={`${filtered.length} student${filtered.length !== 1 ? "s" : ""} ${gradeFilter ? `in ${gradeFilter}` : "total"}`}
        breadcrumbs={[{ label: "Students" }]}
        actions={[
          { label: "Import CSV", icon: Upload, onClick: () => setShowImportWizard(true), variant: "outline" },
          { label: "Export", icon: Download, onClick: handleExport, variant: "outline" },
          ...(selectedIds.size > 0 ? [{ label: `Delete (${selectedIds.size})`, icon: Trash2, onClick: handleBulkDelete, variant: "destructive" as const }] : []),
          { label: "Add Student", icon: Plus, onClick: () => setView("add") },
        ]}
      />

      {view === "add" ? (
        <StudentForm
          open={true}
          onClose={() => setView("list")}
          onSubmit={async (data) => {
            await addStudent({ school_id: currentSchoolId || "", ...data });
          }}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or admission no..."
                className="flex h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <SearchSelect
              options={gradeList.map((g) => ({ value: g, label: g }))}
              value={gradeFilter}
              onChange={setGradeFilter}
              placeholder="All Grades"
              searchable={gradeList.length > 6}
              size="sm"
              className="w-32"
            />
            <SearchSelect
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "graduated", label: "Graduated" },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Status"
              searchable={false}
              size="sm"
              className="w-32"
            />
            {(gradeFilter || statusFilter || search) && (
              <button
                onClick={() => { setGradeFilter(""); setStatusFilter(""); setSearch(""); }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            loading={loading}
            onRowClick={handleRowClick}
            rowKey={(s) => s.id}
            selectedRows={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyIcon={Users}
            emptyTitle="No students"
            emptyDescription="Add your first student to get started."
            emptyAction={{ label: "Add Student", onClick: () => setView("add"), icon: Plus }}
          />
        </>
      )}

      <StudentImportWizard
        open={showImportWizard}
        onClose={() => { setShowImportWizard(false); fetchStudents(); }}
      />
    </PageContainer>
  );
}
