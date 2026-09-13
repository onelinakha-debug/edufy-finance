import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  actions?: Array<{
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost" | "destructive";
    shortcut?: string;
  }>;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-border">/</span>}
              {b.onClick ? (
                <button onClick={b.onClick} className="hover:text-foreground transition-colors">{b.label}</button>
              ) : (
                <span className="text-foreground font-medium">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((action, i) => (
              <Button
                key={i}
                variant={action.variant || "default"}
                onClick={action.onClick}
                className="gap-1.5 text-xs h-8"
                title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
              >
                {action.icon && <action.icon className="h-3.5 w-3.5" />}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
