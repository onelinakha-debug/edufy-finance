import { useEffect, useState } from "react";
import { gazetteApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import { formatKES } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import { Loader2, Save, Scale } from "lucide-react";

interface GazetteRow {
  category: string;
  charged: number;
  cap_amount?: number | null;
  status: "within" | "over" | "uncapped";
}

const TERMS = [
  { value: "1", label: "Term 1" },
  { value: "2", label: "Term 2" },
  { value: "3", label: "Term 3" },
];

export function GazettePanel({ schoolId }: { schoolId: string }) {
  const { addToast } = useAppStore();
  const [term, setTerm] = useState("1");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<GazetteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = (await gazetteApi.report(schoolId, Number(year) || 2026, Number(term))) || [];
      setRows(data);
      const c: Record<string, string> = {};
      for (const r of data) if (r.cap_amount != null) c[r.category] = String(r.cap_amount);
      setCaps(c);
    } catch (err) {
      console.error("Gazette load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const handleSaveCap = async (category: string) => {
    const val = Math.round(Number(caps[category]) || 0);
    if (val <= 0) {
      addToast({ title: "Enter a cap amount greater than 0", variant: "error" });
      return;
    }
    setSaving(category);
    try {
      await gazetteApi.setCap(schoolId, category, val);
      addToast({ title: `Cap saved for ${category}`, variant: "success" });
      load();
    } catch (err) {
      addToast({ title: "Could not save cap", description: String(err), variant: "error" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Scale className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Gazette Return — per vote-head category</h4>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Actual charges vs your configured caps for the term. Confirm caps against the current
        Ministry gazette — categories without a cap show as uncapped.
      </p>

      <div className="flex gap-2 mb-3">
        <div className="w-32">
          <SearchSelect options={TERMS} value={term} onChange={setTerm} placeholder="Term" />
        </div>
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputMode="numeric"
          className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 h-9 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No charges found for this term/year.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.category} className="flex items-center gap-2 text-xs rounded-lg border border-border/50 px-2.5 py-2">
              <span className="font-medium capitalize w-24 truncate">{r.category}</span>
              <span className="font-mono">{formatKES(r.charged)}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  r.status === "over"
                    ? "bg-destructive/10 text-destructive"
                    : r.status === "within"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {r.status === "over" ? "OVER CAP" : r.status === "within" ? "Within cap" : "Uncapped"}
              </span>
              <span className="flex-1" />
              <input
                value={caps[r.category] ?? ""}
                onChange={(e) => setCaps((c) => ({ ...c, [r.category]: e.target.value }))}
                placeholder="Set cap"
                inputMode="numeric"
                className="h-7 w-24 rounded-md border border-input bg-transparent px-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                onClick={() => handleSaveCap(r.category)}
                disabled={saving === r.category}
                className="p-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors disabled:opacity-60"
                title={`Save cap for ${r.category}`}
              >
                {saving === r.category ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
