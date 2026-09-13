import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn, formatKES } from "@/lib/utils";
import { useFeeStore, DiscountConfig } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchSelect } from "@/components/ui/search-select";
import { Plus, Trash2, Loader2, Save, Zap } from "lucide-react";

const discountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["bulk", "sibling"]),
  rate: z.coerce.number().min(0).max(100),
  min_students: z.coerce.number().min(1),
});

type DiscountFormData = z.infer<typeof discountSchema>;

interface DiscountConfigPanelProps {
  schoolId: string;
}

const DISCOUNT_PRESETS = [
  { name: "2+ Siblings — 10%", type: "sibling" as const, rate: 10, min_students: 2, description: "Standard sibling discount" },
  { name: "3+ Siblings — 15%", type: "sibling" as const, rate: 15, min_students: 3, description: "Larger family discount" },
  { name: "4+ Siblings — 20%", type: "sibling" as const, rate: 20, min_students: 4, description: "Big family discount" },
  { name: "2+ Bulk — 5%", type: "bulk" as const, rate: 5, min_students: 2, description: "Small group discount" },
  { name: "5+ Bulk — 10%", type: "bulk" as const, rate: 10, min_students: 5, description: "Medium group discount" },
  { name: "10+ Bulk — 15%", type: "bulk" as const, rate: 15, min_students: 10, description: "Large group discount" },
  { name: "Staff Kids — 50%", type: "sibling" as const, rate: 50, min_students: 1, description: "Staff children benefit" },
  { name: "Early Bird — 5%", type: "bulk" as const, rate: 5, min_students: 1, description: "Early payment incentive" },
];

export function DiscountConfigPanel({ schoolId }: DiscountConfigPanelProps) {
  const { discountConfigs, fetchDiscountConfigs, addDiscountConfig, removeDiscountConfig, loading } = useFeeStore();
  const { addToast } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDiscountConfigs(schoolId);
  }, [schoolId]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DiscountFormData>({
    resolver: zodResolver(discountSchema),
    defaultValues: { name: "", type: "bulk", rate: 5, min_students: 2 },
  });

  const watchType = watch("type");

  const onSubmit = async (data: DiscountFormData) => {
    setSubmitting(true);
    try {
      await addDiscountConfig({
        school_id: schoolId,
        name: data.name,
        type: data.type,
        rate: data.rate / 100,
        min_students: data.min_students,
        is_active: true,
      });
      addToast({ title: "Discount rule added", variant: "success" });
      reset();
      setShowForm(false);
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyPreset = async (preset: typeof DISCOUNT_PRESETS[0]) => {
    setSubmitting(true);
    try {
      await addDiscountConfig({
        school_id: schoolId,
        name: preset.name,
        type: preset.type,
        rate: preset.rate / 100,
        min_students: preset.min_students,
        is_active: true,
      });
      addToast({ title: `Added "${preset.name}"`, variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeDiscountConfig(id);
      addToast({ title: "Discount rule removed", variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Discount Rules</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{discountConfigs.length} rule{discountConfigs.length !== 1 ? "s" : ""} configured</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Add Rule
          </button>
        </div>
      </div>

      {/* Preset Templates */}
      {discountConfigs.length === 0 && !showForm && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Quick Setup — Discount Presets</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DISCOUNT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleApplyPreset(preset)}
                disabled={submitting}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium group-hover:text-primary transition-colors">{preset.name}</p>
                  <Zap className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{preset.type === "sibling" ? "Sibling" : "Bulk"} • Min {preset.min_students}</p>
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
                <label className="block text-[11px] font-medium mb-1">Rule Name</label>
                <input {...register("name")} placeholder="e.g. 3+ Sibling Discount" className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {errors.name && <p className="text-[10px] text-destructive mt-0.5">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Type</label>
                <input type="hidden" {...register("type")} value={watch("type") || "bulk"} />
                <SearchSelect options={[{ value: "bulk", label: "Bulk Discount" }, { value: "sibling", label: "Sibling Discount" }]} value={watch("type") || "bulk"} onChange={(v) => setValue("type", v as any)} searchable={false} size="sm" />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Rate (%)</label>
                <input {...register("rate")} type="number" min={1} max={100} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {errors.rate && <p className="text-[10px] text-destructive mt-0.5">{errors.rate.message}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">{watchType === "sibling" ? "Min Siblings" : "Min Students"}</label>
                <input {...register("min_students")} type="number" min={1} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                {errors.min_students && <p className="text-[10px] text-destructive mt-0.5">{errors.min_students.message}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={submitting} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60">
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save Rule
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-input hover:bg-muted transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Existing rules */}
      {discountConfigs.length === 0 ? (
        !showForm && <EmptyState icon={Zap} title="No discount rules" description="Use a preset above or add a custom rule." />
      ) : (
        <div className="space-y-1.5">
          {discountConfigs.map((config) => (
            <div key={config.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group">
              <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", config.type === "sibling" ? "bg-info/10" : "bg-primary/10")}>
                  <span className="text-[10px] font-bold">{Math.round(config.rate * 100)}%</span>
                </div>
                <div>
                  <p className="text-xs font-medium">{config.name}</p>
                  <p className="text-[10px] text-muted-foreground">{config.type === "sibling" ? "Sibling" : "Bulk"} • Min {config.min_students}</p>
                </div>
              </div>
              <button onClick={() => handleRemove(config.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
