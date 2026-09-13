import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ToastContainer } from "@/components/shared/toast";
import { useAppStore } from "@/stores/app-store";
import { schoolApi } from "@/services/tauri-commands";
import { cn } from "@/lib/utils";

const DEFAULT_SCHOOL_NAME = "My School";

export function AppShell() {
  const { sidebarCollapsed, currentSchoolId, setCurrentSchoolId } = useAppStore();

  // Bootstrap: ensure a school exists and set currentSchoolId
  useEffect(() => {
    if (currentSchoolId) return;
    (async () => {
      try {
        // Try to load existing school
        const schools = await schoolApi.list();
        if (schools && schools.length > 0) {
          setCurrentSchoolId(schools[0].id);
          return;
        }
        // No schools exist — create a default one
        const school = await schoolApi.create({ name: DEFAULT_SCHOOL_NAME, school_type: "private_day" });
        if (school) {
          setCurrentSchoolId(school.id);
        }
      } catch {
        // Browser fallback: use a static ID so UI still works
        setCurrentSchoolId("browser-default-school");
      }
    })();
  }, [currentSchoolId, setCurrentSchoolId]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-200",
          sidebarCollapsed ? "ml-[64px]" : "ml-[220px]"
        )}
      >
        <Header />
        <main className="min-h-[calc(100vh-48px)]">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
