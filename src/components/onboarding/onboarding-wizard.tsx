import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { schoolApi, settingsApi, authApi, gradeApi, studentApi, feeApi, invoiceApi } from "@/services/tauri-commands";
import { SearchSelect } from "@/components/ui/search-select";
import {
  GraduationCap,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  School,
  Lock,
  User,
} from "lucide-react";

const SCHOOL_TYPES = [
  { value: "public_day", label: "Public Day School" },
  { value: "public_boarding", label: "Public Boarding School" },
  { value: "private_day", label: "Private Day School" },
  { value: "private_boarding", label: "Private Boarding School" },
  { value: "international", label: "International School" },
];

type Step = "welcome" | "school" | "admin" | "done";

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [schoolName, setSchoolName] = useState("");
  const [schoolType, setSchoolType] = useState("private_day");
  const [county, setCounty] = useState("");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("admin123");
  const [adminFullName, setAdminFullName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const { setCurrentSchoolId, login, addToast } = useAppStore();

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "welcome", label: "Welcome", icon: Sparkles },
    { id: "school", label: "School", icon: School },
    { id: "admin", label: "Admin", icon: User },
    { id: "done", label: "Done", icon: CheckCircle },
  ];

  const currentIdx = steps.findIndex((s) => s.id === step);

  const handleComplete = async () => {
    setCreating(true);
    setError("");
    try {
      // 1. Create school
      const school = await schoolApi.create({
        name: schoolName || "My School",
        schoolType: schoolType,
        county: county || undefined,
      });
      if (!school) throw new Error("Failed to create school — no response from server");
      setCurrentSchoolId(school.id);

      // 2. Create admin user
      const pw = adminPassword || "admin123";
      let adminUser;
      try {
        adminUser = await settingsApi.createUser(school.id, {
          username: adminUsername || "admin",
          password: pw,
          fullName: adminFullName || "Administrator",
          role: "admin",
        });
      } catch (e) {
        // If user creation fails, skip login and just continue
        console.warn("Admin user creation failed:", e);
        addToast({ title: "School created! Log in manually.", description: "Admin user could not be auto-created: " + String(e), variant: "warning" });
        onComplete();
        return;
      }

      // 3. Auto-login
      try {
        const loginResult = await authApi.login({
          username: adminUser.username,
          password: pw,
          schoolId: school.id,
        });
        if (loginResult && loginResult.token) {
          login(
            { id: loginResult.user.id, username: loginResult.user.username, fullName: loginResult.user.fullName, role: loginResult.user.role, schoolId: loginResult.schoolId },
            loginResult.token
          );
        }
      } catch (e) {
        console.warn("Auto-login failed:", e);
      }

      // 4. Create grades (best effort)
      const GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
      for (const grade of GRADES) {
        try {
          await gradeApi.create(school.id, grade, "primary", undefined);
        } catch { /* skip */ }
      }

      // 5. Create sample students (best effort)
      let count = 0;
      const firstNames = ["James", "Mary", "John", "Grace", "Peter", "Faith", "David", "Joyce", "Samuel", "Sarah"];
      const lastNames = ["Mwangi", "Wanjiku", "Ochieng", "Njeri", "Kamau", "Akinyi", "Omondi", "Wambui", "Njoroge", "Otieno"];
      for (const grade of GRADES.slice(0, 3)) {
        for (let i = 0; i < 2; i++) {
          try {
            await studentApi.create({
              schoolId: school.id,
              admissionNo: `${grade.replace(/\s/g, "")}-${String(count + 1).padStart(3, "0")}`,
              firstName: firstNames[count % firstNames.length],
              lastName: lastNames[count % lastNames.length],
              grade,
              stream: "A",
            });
            count++;
          } catch { /* skip */ }
        }
      }

      // 6. Create fee structure + invoices (best effort)
      try {
        const term = new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3;
        const year = new Date().getFullYear();
        const structure = await feeApi.createStructure({
          schoolId: school.id,
          name: "Term Fees",
          grade: "Grade 1",
          term,
          academicYear: year,
        });
        if (structure) {
          await feeApi.addVoteHead({
            feeStructureId: structure.id,
            name: "Tuition",
            category: "tuition",
            amount: 15000,
            isMandatory: true,
          });
          await invoiceApi.generate(structure.id);
        }
      } catch { /* skip */ }

      addToast({ title: "Setup complete!", variant: "success" });
      setStep("done");
    } catch (err) {
      const msg = String(err);
      setError(msg);
      addToast({ title: "Setup error", description: msg, variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                  i <= currentIdx
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i < currentIdx ? <CheckCircle className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("w-8 h-0.5 rounded", i < currentIdx ? "bg-primary" : "bg-muted")} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card-claude p-6 min-h-[320px]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}

          {step === "welcome" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Welcome to Edufy Finance</h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Let's set up your school fee management system. This takes less than a minute.
              </p>
              <div className="space-y-2 text-left max-w-xs mx-auto pt-2">
                {[
                  { icon: School, text: "Set up your school profile" },
                  { icon: User, text: "Create your admin account" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep("school")}
                className="mt-4 px-6 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "school" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">School Profile</h2>
                <p className="text-xs text-muted-foreground">Tell us about your school</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">School Name *</label>
                <input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Sunshine Academy"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">School Type</label>
                <SearchSelect
                  options={SCHOOL_TYPES}
                  value={schoolType}
                  onChange={setSchoolType}
                  placeholder="Select type"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">County (optional)</label>
                <input
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  placeholder="e.g. Nairobi"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          {step === "admin" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Admin Account</h2>
                <p className="text-xs text-muted-foreground">Create your login credentials</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="e.g. John Kamau"
                    className="flex h-9 w-full pl-9 pr-3 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Username *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="e.g. admin"
                    className="flex h-9 w-full pl-9 pr-3 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="flex h-9 w-full pl-9 pr-3 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold">You're all set!</h2>
              <p className="text-sm text-muted-foreground">
                {schoolName || "Your school"} is ready. You can now log in.
              </p>
              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground text-left max-w-sm mx-auto">
                <p className="font-medium text-foreground mb-1">Your login:</p>
                <p>Username: <code className="bg-muted px-1 rounded">{adminUsername || "admin"}</code></p>
                <p>Password: <code className="bg-muted px-1 rounded">{adminPassword || "admin123"}</code></p>
              </div>
              <button
                onClick={onComplete}
                className="mt-2 px-6 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step !== "welcome" && step !== "done" && (
          <div className="flex justify-between mt-4">
            <button
              onClick={() => {
                const idx = steps.findIndex((s) => s.id === step);
                if (idx > 0) setStep(steps[idx - 1].id);
              }}
              className="px-4 py-2 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              onClick={() => {
                if (step === "admin") {
                  handleComplete();
                } else {
                  const idx = steps.findIndex((s) => s.id === step);
                  if (idx < steps.length - 1) setStep(steps[idx + 1].id);
                }
              }}
              disabled={creating || (step === "school" && !schoolName.trim()) || (step === "admin" && !adminFullName.trim())}
              className="px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {creating ? "Setting up..." : step === "admin" ? "Finish Setup" : "Continue"}
              {!creating && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
