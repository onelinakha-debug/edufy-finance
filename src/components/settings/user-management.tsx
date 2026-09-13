import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useSettingsStore, User } from "@/stores/settings-store";
import { useAppStore } from "@/stores/app-store";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { SearchSelect } from "@/components/ui/search-select";
import { Plus, Trash2, Loader2, Save, Zap, Shield } from "lucide-react";

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  full_name: z.string().min(1, "Full name is required"),
  role: z.string().min(1, "Role is required"),
});

type UserFormData = z.infer<typeof userSchema>;

const ROLES = [
  { value: "admin", label: "Administrator", description: "Full access to all features", color: "bg-primary/10 text-primary" },
  { value: "bursar", label: "Bursar", description: "Manage fees, payments, and reports", color: "bg-success/10 text-success" },
  { value: "teacher", label: "Teacher", description: "View student data and fee status", color: "bg-info/10 text-info" },
  { value: "viewer", label: "Viewer", description: "Read-only access to reports", color: "bg-muted text-muted-foreground" },
];

const STAFF_PRESETS = [
  { name: "School Admin", role: "admin", description: "Head teacher / principal", autoUsername: true },
  { name: "Bursar", role: "bursar", description: "Fee collection & accounts", autoUsername: true },
  { name: "Deputy Bursar", role: "bursar", description: "Assistant bursar", autoUsername: true },
  { name: "Class Teacher", role: "teacher", description: "General class teacher", autoUsername: true },
  { name: "Grade Teacher", role: "teacher", description: "Subject / grade teacher", autoUsername: true },
  { name: "School Clerk", role: "viewer", description: "Data entry / records", autoUsername: true },
];

interface UserManagementProps {
  schoolId: string;
}

export function UserManagementPanel({ schoolId }: UserManagementProps) {
  const { users, fetchUsers, createUser, deleteUser, loading } = useSettingsStore();
  const { addToast } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers(schoolId);
  }, [schoolId]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", full_name: "", role: "bursar" },
  });

  const watchRole = watch("role");
  const watchName = watch("full_name");

  const onSubmit = async (data: UserFormData) => {
    setSubmitting(true);
    try {
      await createUser(schoolId, data);
      addToast({ title: "User created successfully", variant: "success" });
      reset();
      setShowForm(false);
    } catch (err) {
      addToast({ title: "Error creating user", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyPreset = async (preset: typeof STAFF_PRESETS[0]) => {
    const fullName = prompt(`Enter full name for "${preset.name}":`);
    if (!fullName?.trim()) return;
    const username = fullName.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
    const password = `${username}123`;
    setSubmitting(true);
    try {
      await createUser(schoolId, { username, password, full_name: fullName.trim(), role: preset.role });
      addToast({ title: `Created "${fullName.trim()}" as ${preset.role}`, variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Remove user "${user.full_name}"?`)) return;
    try {
      await deleteUser(user.id);
      addToast({ title: "User removed", variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    }
  };

  const getRoleBadge = (role: string) => {
    const r = ROLES.find((r) => r.value === role);
    return (
      <span className={cn("px-2 py-0.5 text-[10px] font-medium rounded-full", r?.color || ROLES[3].color)}>
        {r?.label || role}
      </span>
    );
  };

  const autoUsername = watchName ? watchName.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "") : "";

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">User Management</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{users.length} user{users.length !== 1 ? "s" : ""} • Role-based access control</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Add User
          </button>
        </div>
      </div>

      {/* Quick Staff Setup */}
      {users.length === 0 && !showForm && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Quick Setup — Staff Presets</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STAFF_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleApplyPreset(preset)}
                disabled={submitting}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium group-hover:text-primary transition-colors">{preset.name}</p>
                  {getRoleBadge(preset.role)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-3 animate-fade-in">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1">Full Name</label>
                <input {...register("full_name")} placeholder="e.g. Jane Muthoni" className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {errors.full_name && <p className="text-[10px] text-destructive mt-0.5">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Username</label>
                <input {...register("username")} placeholder={autoUsername || "auto-generated"} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {autoUsername && !watch("username") && <p className="text-[10px] text-muted-foreground mt-0.5">Suggestion: {autoUsername}</p>}
                {errors.username && <p className="text-[10px] text-destructive mt-0.5">{errors.username.message}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Password</label>
                <input {...register("password")} type="password" placeholder="Min 6 characters" className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {errors.password && <p className="text-[10px] text-destructive mt-0.5">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Role</label>
                <input type="hidden" {...register("role")} value={watchRole || "bursar"} />
                <SearchSelect options={ROLES.map((r) => ({ value: r.value, label: r.label }))} value={watchRole || "bursar"} onChange={(v) => setValue("role", v)} searchable={false} size="sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{ROLES.find((r) => r.value === watchRole)?.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={submitting} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60">
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Create User
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* User list */}
      {users.length === 0 ? (
        !showForm && <EmptyState icon={Zap} title="No users" description="Use a preset above or add users manually." />
      ) : (
        <div className="space-y-1.5">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold">{user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">{user.full_name}</p>
                    {getRoleBadge(user.role)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    @{user.username}
                    {user.last_login && ` • Last login: ${new Date(user.last_login).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={user.is_active ? "active" : "inactive"} size="sm" />
                <button onClick={() => handleDelete(user)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role info */}
      <div className="border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Role Permissions</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((role) => (
            <div key={role.value} className="flex items-center gap-2 text-[11px]">
              {getRoleBadge(role.value)}
              <span className="text-muted-foreground">{role.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
