import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ToastContainer } from "@/components/shared/toast";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useAppStore } from "@/stores/app-store";
import { schoolApi } from "@/services/tauri-commands";
import { cn } from "@/lib/utils";

const DEFAULT_SCHOOL_NAME = "My School";

export function AppShell() {
  const { sidebarCollapsed, currentSchoolId, setCurrentSchoolId } = useAppStore();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checking, setChecking] = useState(true);

  // Bootstrap: ensure a school exists and set currentSchoolId
  useEffect(() => {
    if (currentSchoolId) { setChecking(false); return; }
    (async () => {
      try {
        // Try to load existing school
        const schools = await schoolApi.list();
        if (schools && schools.length > 0) {
          setCurrentSchoolId(schools[0].id);
          setChecking(false);
          return;
        }
        // No schools exist — show onboarding
        setNeedsOnboarding(true);
        setChecking(false);
      } catch {
        // Browser fallback: use a static ID so UI still works
        setCurrentSchoolId("browser-default-school");
        setChecking(false);
      }
    })();
  }, [currentSchoolId, setCurrentSchoolId]);

  const handleOnboardingComplete = () => {
    setNeedsOnboarding(false);
    // Reload schools to get the newly created one
    schoolApi.list().then((schools) => {
      if (schools && schools.length > 0) {
        setCurrentSchoolId(schools[0].id);
      }
    });
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

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
