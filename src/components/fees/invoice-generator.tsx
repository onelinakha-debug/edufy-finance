import React, { useState, useEffect } from "react";
import { cn, formatKES } from "@/lib/utils";
import { useFeeStore, FeeStructure } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { GRADES_CBC, TERMS } from "@/lib/constants";
import { Loader2, CheckCircle, AlertTriangle, Layers } from "lucide-react";

interface InvoiceGeneratorProps {
  schoolId: string;
  onGenerated?: (count: number) => void;
}

export function InvoiceGenerator({ schoolId, onGenerated }: InvoiceGeneratorProps) {
  const { structures, fetchStructures, generateInvoices, fetchVoteHeads, voteHeads } = useFeeStore();
  const { addToast } = useAppStore();
  const [selectedStructureId, setSelectedStructureId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);

  useEffect(() => {
    fetchStructures(schoolId);
  }, [schoolId]);

  useEffect(() => {
    if (selectedStructureId) {
      fetchVoteHeads(selectedStructureId);
    }
  }, [selectedStructureId]);

  const selectedStructure = structures.find((s) => s.id === selectedStructureId);
  const currentVoteHeads = selectedStructureId ? (voteHeads[selectedStructureId] || []) : [];
  const totalPerStudent = currentVoteHeads.reduce((sum, vh) => sum + vh.amount, 0);

  const handleGenerate = async () => {
    if (!selectedStructureId) return;
    setGenerating(true);
    try {
      const invoices = await generateInvoices(selectedStructureId);
      setResult({ count: invoices.length });
      addToast({ title: `${invoices.length} invoices generated`, variant: "success" });
      onGenerated?.(invoices.length);
    } catch (err) {
      addToast({ title: "Error generating invoices", description: String(err), variant: "error" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card-claude p-4">
      <h3 className="text-lg font-semibold mb-1">Generate Invoices</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Select a fee structure to generate invoices for all active students
      </p>

      <div className="space-y-4">
        {/* Select structure */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Fee Structure</label>
          <SearchSelect
            options={structures.map((s) => ({
              value: s.id,
              label: `${s.name} — ${s.grade} (Term ${s.term}, ${s.academic_year})`
            }))}
            value={selectedStructureId}
            onChange={(v) => { setSelectedStructureId(v); setResult(null); }}
            placeholder="Select a fee structure"
            searchable={true}
          />
        </div>

        {/* Preview */}
        {selectedStructure && currentVoteHeads.length > 0 && (
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{currentVoteHeads.length} vote heads</span>
            </div>
            <div className="space-y-1">
              {currentVoteHeads.map((vh) => (
                <div key={vh.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{vh.name}</span>
                  <span className="font-mono">{formatKES(vh.amount)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
              <span>Total per student</span>
              <span className="font-mono">{formatKES(totalPerStudent)}</span>
            </div>
          </div>
        )}

        {selectedStructure && currentVoteHeads.length === 0 && (
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            No vote heads configured for this structure. Add vote heads first.
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Successfully generated {result.count} invoices.
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!selectedStructureId || generating || currentVoteHeads.length === 0}
          className="w-full py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Invoices"
          )}
        </button>
      </div>
    </div>
  );
}
