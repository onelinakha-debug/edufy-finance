import React, { useState, useEffect } from "react";
import { cn, getInitials, formatKES, formatDate, getStatusColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { StudentForm } from "./student-form";
import { studentApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import { useStudentStore, Student } from "@/stores/student-store";
import {
  ArrowLeft,
  Edit,
  Trash2,
  User,
  Hash,
  BookOpen,
  Calendar,
  CreditCard,
  Phone,
  Mail,
  Users,
} from "lucide-react";

interface StudentDetailProps {
  student: Student;
  onBack: () => void;
}

interface StudentFullDetail {
  student: Student;
  parents: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    relationship: string | null;
    is_primary: boolean;
  }>;
  outstanding_fees: number;
  total_paid: number;
}

export function StudentDetail({ student, onBack }: StudentDetailProps) {
  const [detail, setDetail] = useState<StudentFullDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const { updateStudent, removeStudent } = useStudentStore();
  const { addToast } = useAppStore();

  useEffect(() => {
    loadDetail();
  }, [student.id]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await studentApi.detail(student.id);
      setDetail(data);
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    await updateStudent(student.id, data);
    addToast({ title: "Student updated", variant: "success" });
    loadDetail();
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this student? This action cannot be undone.")) return;
    try {
      await removeStudent(student.id);
      addToast({ title: "Student deleted", variant: "success" });
      onBack();
    } catch (err) {
      addToast({ title: "Error deleting student", description: String(err), variant: "error" });
    }
  };

  if (loading) return <LoadingPage />;

  const outstanding = detail?.outstanding_fees ?? 0;
  const paid = detail?.total_paid ?? 0;

  return (
    <div className="animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-input hover:bg-muted transition-colors inline-flex items-center gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Student Info Card */}
      <div className="card-claude p-4 mb-6">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-semibold text-primary">
              {getInitials(student.first_name, student.last_name)}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold">
                {student.first_name} {student.middle_name ? student.middle_name + " " : ""}{student.last_name}
              </h1>
              <StatusBadge status={student.status} size="md" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-4 w-4" />
                <span className="font-mono">{student.admission_no}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span>{student.grade}{student.stream ? ` - ${student.stream}` : ""}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{student.enrollment_date ? formatDate(student.enrollment_date) : "N/A"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                <span>ID: {student.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card-claude p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Financial Summary
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
                <p className="text-lg font-semibold text-success">{formatKES(paid)}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
                <p className={cn("text-lg font-semibold", outstanding > 0 ? "text-warning" : "text-success")}>
                  {formatKES(outstanding)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Total Invoiced</p>
                <p className="text-lg font-semibold">{formatKES(paid + outstanding)}</p>
              </div>
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="card-claude p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-4">Invoices</h2>
            {detail?.invoices && detail.invoices.length > 0 ? (
              <div className="space-y-2">
                {/* Invoice list would go here */}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices generated yet.</p>
            )}
          </div>
        </div>

        {/* Parents / Guardians */}
        <div className="card-claude p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Parents / Guardians
          </h2>
          {detail?.parents && detail.parents.length > 0 ? (
            <div className="space-y-3">
              {detail.parents.map((parent) => (
                <div key={parent.id} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{parent.name}</span>
                    {parent.is_primary && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {parent.relationship && <p>{parent.relationship}</p>}
                    <p className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {parent.phone}
                    </p>
                    {parent.email && (
                      <p className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {parent.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No parents/guardians linked.</p>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <StudentForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleUpdate}
        initialData={student}
        title="Edit Student"
      />
    </div>
  );
}
