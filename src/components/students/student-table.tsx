import React, { useMemo } from "react";
import { Column, DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStudentStore, Student } from "@/stores/student-store";
import { getInitials } from "@/lib/utils";

interface StudentTableProps {
  onStudentClick: (student: Student) => void;
}

export function StudentTable({ onStudentClick }: StudentTableProps) {
  const { students, loading, searchQuery, sortBy, sortOrder, setSort } = useStudentStore();

  const filteredStudents = useMemo(() => {
    let result = students;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q) ||
          s.admission_no.toLowerCase().includes(q)
      );
    }
    // Sort
    if (sortBy) {
      result = [...result].sort((a, b) => {
        const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? "");
        const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? "");
        const cmp = aVal.localeCompare(bVal);
        return sortOrder === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [students, searchQuery, sortBy, sortOrder]);

  const columns: Column<Student>[] = [
    {
      key: "admission_no",
      header: "Admission No",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.admission_no}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium">
              {getInitials(row.first_name, row.last_name)}
            </span>
          </div>
          <div>
            <div className="font-medium">
              {row.first_name} {row.middle_name ? row.middle_name + " " : ""}{row.last_name}
            </div>
          </div>
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
      key: "stream",
      header: "Stream",
      render: (row) => <span className="text-sm text-muted-foreground">{row.stream || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "enrollment_date",
      header: "Enrolled",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.enrollment_date
            ? new Date(row.enrollment_date).toLocaleDateString("en-KE", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={filteredStudents}
      loading={loading}
      onRowClick={onStudentClick}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={(key, order) => setSort(key, order)}
      rowKey={(row) => row.id}
      emptyMessage="No students found"
    />
  );
}
