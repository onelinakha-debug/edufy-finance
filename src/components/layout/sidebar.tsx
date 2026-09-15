import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ChevronLeft } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/students", label: "Students" },
  { to: "/fees", label: "Fees" },
  { to: "/payments", label: "Payments" },
  { to: "/reports", label: "Reports" },
  { to: "/capitation", label: "Capitation" },
  { to: "/settings", label: "Settings" },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200",
        sidebarCollapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-12 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-primary-foreground">E</span>
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">Edufy</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0 bg-primary", isActive && "ring-2 ring-primary/20")} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-2 border-t border-sidebar-border">
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full h-7 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}
