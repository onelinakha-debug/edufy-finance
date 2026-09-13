import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { GRADES_CBC, TERMS, VOTE_HEAD_CATEGORIES } from "@/lib/constants";
import { SearchSelect } from "@/components/ui/search-select";
import { useFeeStore, VoteHead } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES } from "@/lib/utils";
import {
  X,
  Plus,
  Save,
  Loader2,
  Trash2,
  GripVertical,
  DollarSign,
  Layers,
} from "lucide-react";

const structureSchema = z.object({
  name: z.string().min(1, "Name is required"),
  grade: z.string().min(1, "Grade is required"),
  term: z.coerce.number().min(1).max(3),
  academic_year: z.coerce.number().min(2024).max(2030),
});

type StructureFormData = z.infer<typeof structureSchema>;

const voteHeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  is_mandatory: z.boolean().default(true),
});

type VoteHeadFormData = z.infer<typeof voteHeadSchema>;

interface FeeBuilderProps {
  schoolId: string;
  onCreated?: () => void;
}

export function FeeBuilder({ schoolId, onCreated }: FeeBuilderProps) {
  const [step, setStep] = useState<"details" | "voteheads">("details");
  const [createdStructure, setCreatedStructure] = useState<{ id: string; name: string } | null>(null);
  const [voteHeadFormOpen, setVoteHeadFormOpen] = useState(false);
  const { createStructure, addVoteHead, fetchVoteHeads, voteHeads } = useFeeStore();
  const { addToast } = useAppStore();
  const [submitting, setSubmitting] = useState(false);

  // Structure form
  const {
    register: regStructure,
    handleSubmit: handleSubmitStructure,
    setValue: setStructureValue,
    watch: watchStructure,
    formState: { errors: structErrors },
  } = useForm<StructureFormData>({
    resolver: zodResolver(structureSchema),
    defaultValues: {
      name: "",
      grade: "",
      term: 1,
      academic_year: 2026,
    },
  });

  // Vote head form
  const {
    register: regVoteHead,
    handleSubmit: handleSubmitVoteHead,
    reset: resetVoteHead,
    setValue: setVHValue,
    watch: watchVH,
    formState: { errors: vhErrors },
  } = useForm<VoteHeadFormData>({
    resolver: zodResolver(voteHeadSchema),
    defaultValues: { name: "", category: "", amount: 0, is_mandatory: true },
  });

  const onSubmitStructure = async (data: StructureFormData) => {
    setSubmitting(true);
    try {
      const structure = await createStructure({ ...data, school_id: schoolId });
      setCreatedStructure({ id: structure.id, name: structure.name });
      setStep("voteheads");
      addToast({ title: "Fee structure created", variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitVoteHead = async (data: VoteHeadFormData) => {
    if (!createdStructure) return;
    try {
      await addVoteHead({ ...data, fee_structure_id: createdStructure.id });
      resetVoteHead();
      addToast({ title: "Vote head added", variant: "success" });
    } catch (err) {
      addToast({ title: "Error", description: String(err), variant: "error" });
    }
  };

  const handleFinish = () => {
    onCreated?.();
    setStep("details");
    setCreatedStructure(null);
  };

  const currentVoteHeads = createdStructure ? (voteHeads[createdStructure.id] || []) : [];
  const totalAmount = currentVoteHeads.reduce((sum, vh) => sum + vh.amount, 0);

  return (
    <div className="card-claude p-4">
      <h3 className="text-lg font-semibold mb-1">Create Fee Structure</h3>
      <p className="text-sm text-muted-foreground mb-6">
        {step === "details"
          ? "Define the basic fee structure details"
          : `Adding vote heads to "${createdStructure?.name}"`}
      </p>

      {step === "details" ? (
        <form onSubmit={handleSubmitStructure(onSubmitStructure)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">
                Structure Name <span className="text-destructive">*</span>
              </label>
              <input
                {...regStructure("name")}
                placeholder="e.g. Grade 7 Term 1 2026"
                className={cn(
                  "flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  structErrors.name && "border-destructive"
                )}
              />
              {structErrors.name && (
                <p className="text-xs text-destructive mt-1">{structErrors.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Grade</label>
              <input type="hidden" {...regStructure("grade")} value={watchStructure("grade") || ""} />
              <SearchSelect
                options={GRADES_CBC.map((g) => ({ value: g, label: g }))}
                value={watchStructure("grade") || ""}
                onChange={(v) => setStructureValue("grade", v)}
                placeholder="Select grade"
                searchable={true}
                className={structErrors.grade ? "ring-1 ring-destructive" : ""}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Term</label>
              <input type="hidden" {...regStructure("term")} value={watchStructure("term") || ""} />
              <SearchSelect
                options={TERMS.map((t) => ({ value: String(t.value), label: t.label }))}
                value={String(watchStructure("term") || 1)}
                onChange={(v) => setStructureValue("term", Number(v))}
                searchable={false}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Academic Year</label>
              <input
                {...regStructure("academic_year")}
                type="number"
                min={2024}
                max={2030}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create & Add Vote Heads
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Existing vote heads */}
          {currentVoteHeads.length > 0 ? (
            <div className="space-y-2">
              {currentVoteHeads.map((vh) => (
                <div
                  key={vh.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-sm">{vh.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({VOTE_HEAD_CATEGORIES.find((c) => c.value === vh.category)?.label || vh.category})
                      </span>
                    </div>
                    {!vh.is_mandatory && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Optional</span>
                    )}
                  </div>
                  <span className="font-mono text-sm font-medium">{formatKES(vh.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No vote heads added yet. Click below to add fee components.
            </div>
          )}

          {/* Total */}
          {currentVoteHeads.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Total per Student</span>
              <span className="text-lg font-semibold">{formatKES(totalAmount)}</span>
            </div>
          )}

          {/* Add vote head form */}
          {voteHeadFormOpen ? (
            <form onSubmit={handleSubmitVoteHead(onSubmitVoteHead)} className="p-4 rounded-lg border border-border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Name</label>
                  <input
                    {...regVoteHead("name")}
                    placeholder="e.g. Tuition"
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <input type="hidden" {...regVoteHead("category")} value={watchVH("category") || ""} />
                  <SearchSelect
                    options={VOTE_HEAD_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                    value={watchVH("category") || ""}
                    onChange={(v) => setVHValue("category", v)}
                    placeholder="Select"
                    searchable={true}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Amount (KES)</label>
                  <input
                    {...regVoteHead("amount")}
                    type="number"
                    min={0}
                    placeholder="0"
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...regVoteHead("is_mandatory")} className="h-4 w-4 rounded border-input" />
                    Mandatory
                  </label>
                </div>
              </div>
              {(vhErrors.name || vhErrors.category || vhErrors.amount) && (
                <p className="text-xs text-destructive">
                  {vhErrors.name?.message || vhErrors.category?.message || vhErrors.amount?.message}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => { setVoteHeadFormOpen(false); resetVoteHead(); }}
                  className="px-3 py-1.5 text-sm font-medium rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setVoteHeadFormOpen(true)}
              className="w-full py-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Vote Head
            </button>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => { setStep("details"); setCreatedStructure(null); }}
              className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleFinish}
              disabled={currentVoteHeads.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Finish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
