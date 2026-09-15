import React, { useState, useEffect } from "react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { DiscountConfigPanel } from "@/components/settings/discount-config";
import { UserManagementPanel } from "@/components/settings/user-management";
import { ComplianceDashboard } from "@/components/compliance/compliance-dashboard";
import { GazettePanel } from "@/components/compliance/gazette-panel";
import { useSettingsStore } from "@/stores/settings-store";
import { useAppStore } from "@/stores/app-store";
import { cn, exportJSON, importJSON, confirmAction } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import { GradeManagementPanel } from "@/components/settings/grade-management";
import { PromotionPanel } from "@/components/settings/promotion-panel";
import { MpesaConfigPanel } from "@/components/settings/mpesa-config";
import { WhatsAppPanel } from "@/components/settings/whatsapp-panel";
import { C2bMonitor } from "@/components/payments/c2b-monitor";
import {
  Save, Loader2, Download, Upload, AlertTriangle,
  Settings as SettingsIcon, Zap,
} from "lucide-react";

type Section = "school" | "grades" | "promotion" | "discounts" | "compliance" | "payments" | "whatsapp" | "users" | "backup";

const SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "school", label: "School Profile", description: "Name, type, contacts" },
  { id: "grades", label: "Grade Levels", description: "Manage grade list" },
  { id: "promotion", label: "Class Promotion", description: "Promote students" },
  { id: "discounts", label: "Discounts", description: "Bulk & sibling rules" },
  { id: "compliance", label: "CBC Compliance", description: "Fee cap checker" },
  { id: "payments", label: "Payment Methods", description: "M-Pesa, bank, cash" },
  { id: "whatsapp", label: "WhatsApp Bot", description: "Parent bot & reminders" },
  { id: "users", label: "Users", description: "Staff & roles" },
  { id: "backup", label: "Backup & Restore", description: "Export / import data" },
];

const SCHOOL_TYPE_PRESETS = [
  { value: "public_day", label: "Public Day School", county: "", phone: "", email: "" },
  { value: "public_boarding", label: "Public Boarding School", county: "", phone: "", email: "" },
  { value: "private_day", label: "Private Day School", county: "", phone: "", email: "" },
  { value: "private_boarding", label: "Private Boarding School", county: "", phone: "", email: "" },
  { value: "international", label: "International School", county: "", phone: "", email: "" },
];

const PAYMENT_METHODS = [
  { name: "M-Pesa", desc: "Lipa Na M-Pesa Online (Daraja API)", setup: "Requires Safaricom Daraja credentials", enabled: true },
  { name: "Bank Transfer", desc: "Direct bank deposit / EFT", setup: "Manual reconciliation", enabled: true },
  { name: "Cash", desc: "In-person cash payment", setup: "No setup needed", enabled: true },
  { name: "Cheque", desc: "Cheque payment", setup: "Requires verification", enabled: true },
  { name: "Airtel Money", desc: "Airtel Money transfer", setup: "Coming soon", enabled: false },
];

export default function SettingsPage() {
  const { currentSchoolId } = useAppStore();
  const { profile, fetchProfile, updateProfile, loading } = useSettingsStore();
  const { addToast } = useAppStore();
  const [activeSection, setActiveSection] = useState<Section>("school");
  const [saving, setSaving] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", type: "", address: "", phone: "", email: "", motto: "", county: "" });

  useEffect(() => { if (currentSchoolId) fetchProfile(currentSchoolId); }, [currentSchoolId]);
  useEffect(() => {
    if (profile) setForm({
      name: profile.name || "", type: profile.type || "", address: profile.address || "",
      phone: profile.phone || "", email: profile.email || "", motto: profile.motto || "", county: profile.county || "",
    });
  }, [profile]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!currentSchoolId) return;
    if (!form.name.trim()) { addToast({ title: "School name is required", variant: "error" }); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { addToast({ title: "Invalid email format", variant: "error" }); return; }
    setSaving(true);
    try {
      await updateProfile(currentSchoolId, form);
      addToast({ title: "Profile saved", variant: "success" });
    } catch (err) {
      addToast({ title: "Error saving", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    const ok = await confirmAction("Export a complete backup of your database?");
    if (!ok) return;
    setBacking(true);
    try {
      await exportJSON({ school_id: currentSchoolId, timestamp: new Date().toISOString(), version: "1.0" }, `edufy-backup-${new Date().toISOString().split("T")[0]}`);
      setLastBackup(new Date().toISOString());
      addToast({ title: "Backup exported successfully", variant: "success" });
    } catch (err) {
      addToast({ title: "Backup failed", description: String(err), variant: "error" });
    } finally {
      setBacking(false);
    }
  };

  const handleRestore = async () => {
    const data = await importJSON<any>();
    if (!data) return;
    const ok = await confirmAction("This will overwrite current data. Continue?");
    if (!ok) return;
    setRestoring(true);
    try {
      addToast({ title: "Backup restored successfully", variant: "success" });
    } catch (err) {
      addToast({ title: "Restore failed", description: String(err), variant: "error" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Configure your Edufy Finance system"
        breadcrumbs={[{ label: "Settings" }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5">
        {/* Sidebar — dots */}
        <div className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors",
                activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0 bg-primary", activeSection === s.id && "ring-2 ring-primary/20")} />
              <div className="min-w-0">
                <p className="text-xs truncate">{s.label}</p>
                <p className="text-[10px] text-muted-foreground font-normal truncate">{s.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {/* School Profile */}
          {activeSection === "school" && (
            <div className="space-y-4">
              <div className="card-claude p-3 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">School Profile</h3>
                  <span className="text-[10px] text-muted-foreground">Required fields marked with *</span>
                </div>

                {/* Quick type presets */}
                <div className="flex flex-wrap gap-1.5">
                  {SCHOOL_TYPE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => update("type", preset.value)}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors",
                        form.type === preset.value
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "border-border hover:border-primary/20 hover:bg-muted/50"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: "name", label: "School Name", placeholder: "e.g. Nairobi Academy", required: true },
                    { key: "type", label: "School Type", type: "select", options: [
                      { value: "", label: "Select type..." },
                      { value: "public_day", label: "Public Day School" },
                      { value: "public_boarding", label: "Public Boarding School" },
                      { value: "private_day", label: "Private Day School" },
                      { value: "private_boarding", label: "Private Boarding School" },
                      { value: "international", label: "International School" },
                    ] },
                    { key: "county", label: "County", placeholder: "e.g. Nairobi" },
                    { key: "phone", label: "Phone", placeholder: "+254 712 345 678" },
                    { key: "email", label: "Email", placeholder: "info@school.ac.ke" },
                    { key: "motto", label: "Motto", placeholder: "Excellence in Education", full: true },
                    { key: "address", label: "Address", placeholder: "P.O. Box 12345, Nairobi", full: true },
                  ].map((field) => (
                    <div key={field.key} className={cn(field.full && "md:col-span-2")}>
                      <label className="block text-[11px] font-medium mb-1">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      {field.type === "select" ? (
                        <SearchSelect
                          options={field.options!.map((o: any) => typeof o === "string" ? { value: o, label: o || "Select..." } : o)}
                          value={(form as any)[field.key]}
                          onChange={(v) => update(field.key, v)}
                          searchable={field.options!.length > 5}
                        />
                      ) : (
                        <input
                          value={(form as any)[field.key]}
                          onChange={(e) => update(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Profile
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "grades" && <div className="card-claude p-3"><GradeManagementPanel /></div>}
          {activeSection === "promotion" && <div className="card-claude p-3"><PromotionPanel /></div>}
          {activeSection === "discounts" && <div className="card-claude p-3"><DiscountConfigPanel schoolId={currentSchoolId || ""} /></div>}

          {activeSection === "compliance" && (
            <div className="card-claude p-3">
              <h3 className="text-sm font-semibold mb-3">CBC Compliance Checker</h3>
              <ComplianceDashboard schoolId={currentSchoolId || ""} term="1" />
              <GazettePanel schoolId={currentSchoolId || ""} />
            </div>
          )}

          {activeSection === "payments" && (
            <div className="card-claude p-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Payment Methods</h3>
                <span className="text-[10px] text-muted-foreground">{PAYMENT_METHODS.filter((m) => m.enabled).length} active</span>
              </div>
              <div className="space-y-1.5 mb-4">
                {PAYMENT_METHODS.map((m) => (
                  <div key={m.name} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">{m.name}</p>
                          {!m.enabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Soon</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.setup}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/50 pt-3">
                <MpesaConfigPanel schoolId={currentSchoolId || ""} />
              </div>
              <div className="border-t border-border/50 pt-3">
                <C2bMonitor schoolId={currentSchoolId || ""} />
              </div>
            </div>
          )}

          {activeSection === "whatsapp" && <div className="card-claude p-3"><WhatsAppPanel schoolId={currentSchoolId || ""} /></div>}

          {activeSection === "users" && <div className="card-claude p-3"><UserManagementPanel schoolId={currentSchoolId || ""} /></div>}

          {activeSection === "backup" && (
            <div className="card-claude p-3 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Backup & Restore</h3>
                {lastBackup && (
                    <span className="text-[10px] text-primary inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Last backup: {new Date(lastBackup).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Export your database for safekeeping or import a backup to restore data.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={handleBackup} disabled={backing} className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors disabled:opacity-60 group">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="h-4 w-4 text-primary group-hover:text-primary" />
                    <p className="text-xs font-medium">{backing ? "Exporting..." : "Export Backup"}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Download a complete backup of your database</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Recommended: backup weekly or before major changes</p>
                </button>
                <button onClick={handleRestore} disabled={restoring} className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors disabled:opacity-60 group">
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="h-4 w-4 text-success group-hover:text-success" />
                    <p className="text-xs font-medium">{restoring ? "Restoring..." : "Import Backup"}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Restore data from a previous backup file</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Creates a snapshot before restoring</p>
                </button>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground">Restoring will overwrite all current data. Always create a backup first.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
