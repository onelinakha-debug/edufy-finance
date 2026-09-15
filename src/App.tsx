import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import { schoolApi } from "@/services/tauri-commands";
import { AppShell } from "@/components/layout/app-shell";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import StudentsPage from "@/pages/students";
import FeesPage from "@/pages/fees";
import PaymentsPage from "@/pages/payments";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import NotFoundPage from "@/pages/not-found";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [checking, setChecking] = useState(true);
  const [hasSchools, setHasSchools] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const schools = await schoolApi.list();
        setHasSchools(schools && schools.length > 0);
      } catch {
        setHasSchools(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [isAuthenticated]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // First run (no schools) → allow through, AppShell will show onboarding
  if (!hasSchools) {
    return <>{children}</>;
  }

  // Schools exist but not authenticated → login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function FirstRunRedirect({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [checking, setChecking] = useState(true);
  const [hasSchools, setHasSchools] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const schools = await schoolApi.list();
        setHasSchools(schools && schools.length > 0);
      } catch {
        setHasSchools(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [isAuthenticated]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // First run → go to dashboard (which shows onboarding)
  if (!hasSchools) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <FirstRunRedirect>
              <LoginPage />
            </FirstRunRedirect>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
