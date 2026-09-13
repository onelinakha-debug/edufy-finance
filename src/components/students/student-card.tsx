import React from "react";
import { cn, getInitials, formatKES } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { User, Hash, BookOpen, Calendar, CreditCard } from "lucide-react";
import type { Student } from "@/stores/student-store";

interface StudentCardProps {
  student: Student;
  outstanding?: number;
  onClick?: () => void;
  className?: string;
}

export function StudentCard({ student, outstanding, onClick, className }: StudentCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "card-claude p-3 hover:bg-muted/50 transition-colors cursor-pointer",
        className
      )}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary">
            {getInitials(student.first_name, student.last_name)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">
              {student.first_name} {student.middle_name ? student.middle_name + " " : ""}{student.last_name}
            </h3>
            <StatusBadge status={student.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {student.admission_no}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {student.grade}{student.stream ? ` - ${student.stream}` : ""}
            </span>
            {student.enrollment_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(student.enrollment_date).toLocaleDateString("en-KE", {
                  year: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>

          {outstanding !== undefined && outstanding > 0 && (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <CreditCard className="h-3 w-3 text-warning" />
              <span className="text-warning font-medium">
                Outstanding: {formatKES(outstanding)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
