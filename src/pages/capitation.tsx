import { useEffect, useState } from "react";
import { capitationApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import { formatKES } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Landmark,
  Loader2,
  Upload,
  CheckCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";

interface PreviewRow {
  admission_no: string;
  student_name?: string | null;
  grade?: string | null;
  amount: number;
  matched: boolean;
  outstanding: number;
  will_apply: number;
}

interface Batch {
  id: string;
  term: number;
  academic_year: number;
  total_amount: number;
  student_count: number;
  matched_count: number;
  source_filename?: string | null;
  created_at: string;
}

const TERMS = [
  { value: "1", label: "Term 1" },
  { value: "2", label: "Term 2" },
  { value: "3", label: "Term 3" },
];

function parseCsv(text: string): { admissionNo: string; amount: number }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^admission/i.test(l))
    .map((line) => {
      const [adm, amt] = line.split(/[,;\t]/).map((s) => (s || "").trim());
      return { admissionNo: adm || "", amount: Math.round(Number(amt) || 0) };
    })
    .filter((r) => r.admissionNo && r.amount > 0);
}

export default function CapitationPage() {
  const { currentSchoolId, addToast, authUser } = useAppStore();
  const [csv, setCsv] = useState("");
  const [term, setTerm] = useState("1");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);

  const loadBatches = async () => {
    if (!currentSchoolId) return;
    try {
      setBatches((await capitationApi.batches(currentSchoolId)) || []);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    loadBatches();
  }, [currentSchoolId]);

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    setCsv(await f.text());
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!currentSchoolId) return;
    const items = parseCsv(csv);
    if (items.length === 0) {
      addToast({ title: "No valid rows — expected: admission_no,amount", variant: "error" });
      return;
    }
    setPreviewing(true);
    try {
      setPreview((await capitationApi.preview(currentSchoolId, items)) || []);
    } catch (err) {
      addToast({ title: "Preview failed", description: String(err), variant: "error" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!currentSchoolId || !preview) return;
    const items = parseCsv(csv);
    if (!confirm(`Apply capitation to ${items.length} row(s)? This records payments and cannot be undone.`)) return;
    setApplying(true);
    try {
      const res = await capitationApi.apply(
        currentSchoolId,
        Number(term),
        Number(year),
        items,
        "ministry-upload.csv",
        authUser?.username || "bursar"
      );
      addToast({
        title: `Applied: ${res.payments_recorded} payment(s), ${formatKES(res.total_amount)}`,
        description: res.unmatched.length > 0 ? `${res.unmatched.length} unmatched: ${res.unmatched.slice(0, 5).join(", ")}` : undefined,
        variant: res.unmatched.length > 0 ? "warning" : "success",
      });
      setPreview(null);
      setCsv("");
      loadBatches();
    } catch (err) {
      addToast({ title: "Apply failed", description: String(err), variant: "error" });
    } finally {
      setApplying(false);
    }
  };

  const matched = (preview || []).filter((r) => r.matched);
  const unmatched = (preview || []).filter((r) => !r.matched);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold">Capitation Grants</h1>
          <p className="text-xs text-muted-foreground">
            Upload the Ministry disbursement CSV — grants apply to oldest invoices first
          </p>
        </div>
      </div>

      <div className="card-claude p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Term</label>
            <SearchSelect options={TERMS} value={term} onChange={setTerm} placeholder="Term" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Academic year</label>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              inputMode="numeric"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Disbursement CSV (admission_no,amount)</label>
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            rows={6}
            placeholder={"34567,1420\n34568,1420"}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            Choose file
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          <button
            onClick={handlePreview}
            disabled={previewing || !csv.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Preview
          </button>
          {preview && (
            <button
              onClick={handleApply}
              disabled={applying || matched.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Apply to {matched.length} student(s)
            </button>
          )}
        </div>

        {preview && (
          <div className="text-xs rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 font-medium flex items-center gap-2">
              {unmatched.length === 0 ? (
                <CheckCircle className="h-3.5 w-3.5 text-success" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              )}
              {matched.length} matched · {unmatched.length} unmatched ·{" "}
              {formatKES(matched.reduce((s, r) => s + r.will_apply, 0))} will apply
            </div>
            <div className="max-h-56 overflow-auto divide-y divide-border/50">
              {preview.map((r) => (
                <div key={r.admission_no} className="px-3 py-1.5 flex justify-between gap-2">
                  <span className="font-mono">{r.admission_no}</span>
                  <span className="text-muted-foreground truncate">
                    {r.matched ? `${r.student_name} (${r.grade})` : "not found"}
                  </span>
                  <span className="font-mono">{formatKES(r.will_apply)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-claude p-4">
        <h2 className="text-sm font-semibold mb-2">Applied batches</h2>
        {batches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No capitation applied yet.</p>
        ) : (
          <div className="divide-y divide-border/50 text-xs">
            {batches.map((b) => (
              <div key={b.id} className="py-2 flex justify-between gap-2">
                <span>
                  Term {b.term} {b.academic_year} · {b.matched_count}/{b.student_count} matched
                </span>
                <span className="font-mono font-medium">{formatKES(b.total_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
