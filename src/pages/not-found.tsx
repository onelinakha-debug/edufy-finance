import React from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/shared/page-container";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <PageContainer className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Search className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go Back
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-3 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            <Home className="h-3.5 w-3.5" />
            Dashboard
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
