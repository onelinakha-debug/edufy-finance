import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function PageContainer({ children, className, id }: PageContainerProps) {
  return (
    <div id={id} className={cn("px-6 py-5 max-w-[1400px] mx-auto animate-fade-in", className)}>
      {children}
    </div>
  );
}
