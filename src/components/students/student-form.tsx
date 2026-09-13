import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { GRADES_CBC } from "@/lib/constants";
import { SearchSelect } from "@/components/ui/search-select";
import { X, Save, Loader2 } from "lucide-react";

const studentSchema = z.object({
  admission_no: z.string().min(1, "Admission number is required"),
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, "Last name is required"),
  grade: z.string().min(1, "Grade is required"),
  stream: z.string().optional(),
});

type StudentFormData = z.infer<typeof studentSchema>;

interface StudentFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: StudentFormData) => Promise<void>;
  initialData?: {
    id?: string;
    admission_no?: string;
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
    grade?: string;
    stream?: string | null;
  };
  title?: string;
}

export function StudentForm({
  open,
  onClose,
  onSubmit,
  initialData,
  title = "Add Student",
}: StudentFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      admission_no: initialData?.admission_no || "",
      first_name: initialData?.first_name || "",
      middle_name: initialData?.middle_name || "",
      last_name: initialData?.last_name || "",
      grade: initialData?.grade || "",
      stream: initialData?.stream || "",
    },
  });

  const handleFormSubmit = async (data: StudentFormData) => {
    setSubmitting(true);
    try {
      await onSubmit(data);
      reset();
      onClose();
    } catch (err) {
      console.error("Form submission error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          {/* Admission Number */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Admission Number <span className="text-destructive">*</span>
            </label>
            <input
              {...register("admission_no")}
              disabled={!!initialData?.id}
              placeholder="e.g. ADM-001"
              className={cn(
                "flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                errors.admission_no ? "border-destructive" : "border-input",
                initialData?.id && "opacity-60 cursor-not-allowed"
              )}
            />
            {errors.admission_no && (
              <p className="text-xs text-destructive mt-1">{errors.admission_no.message}</p>
            )}
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                First Name <span className="text-destructive">*</span>
              </label>
              <input
                {...register("first_name")}
                placeholder="First name"
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  errors.first_name && "border-destructive"
                )}
              />
              {errors.first_name && (
                <p className="text-xs text-destructive mt-1">{errors.first_name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Middle Name</label>
              <input
                {...register("middle_name")}
                placeholder="Middle name (optional)"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Last Name <span className="text-destructive">*</span>
            </label>
            <input
              {...register("last_name")}
              placeholder="Last name / surname"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                errors.last_name && "border-destructive"
              )}
            />
            {errors.last_name && (
              <p className="text-xs text-destructive mt-1">{errors.last_name.message}</p>
            )}
          </div>

          {/* Grade & Stream */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Grade <span className="text-destructive">*</span>
              </label>
              <input type="hidden" {...register("grade")} value={watch("grade") || ""} />
              <SearchSelect
                options={GRADES_CBC.map((g) => ({ value: g, label: g }))}
                value={watch("grade") || ""}
                onChange={(v) => setValue("grade", v)}
                placeholder="Select grade"
                searchable={true}
                className={errors.grade ? "ring-1 ring-destructive" : ""}
              />
              {errors.grade && (
                <p className="text-xs text-destructive mt-1">{errors.grade.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Stream</label>
              <input
                {...register("stream")}
                placeholder="e.g. North, South"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {initialData?.id ? "Update" : "Add"} Student
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
