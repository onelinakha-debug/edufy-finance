import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import DashboardPage from "@/pages/dashboard";
import StudentsPage from "@/pages/students";
import FeesPage from "@/pages/fees";
import PaymentsPage from "@/pages/payments";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import NotFoundPage from "@/pages/not-found";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
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
