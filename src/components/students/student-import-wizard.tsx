import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { GRADES_CBC } from "@/lib/constants";
import { useStudentStore } from "@/stores/student-store";
import { useAppStore } from "@/stores/app-store";
import { SearchSelect } from "@/components/ui/search-select";
import { X, Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle, Loader2, Download, Scissors } from "lucide-react";

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

type Step = "upload" | "map" | "preview" | "result";

interface ParsedRow {
  raw: Record<string, string>;
  index: number;
}

interface MappedField {
  key: string;
  label: string;
  required: boolean;
  csvColumn: string | null;
  example: string;
}

type NameSeparator = "space" | "comma" | "dash" | "custom";

interface NameSplitConfig {
  enabled: boolean;
  csvColumn: string | null;
  separator: NameSeparator;
  customSeparator: string;
}

const STUDENT_FIELDS: MappedField[] = [
  { key: "admission_no", label: "Admission No", required: true, csvColumn: null, example: "" },
  { key: "first_name", label: "First Name", required: true, csvColumn: null, example: "" },
  { key: "last_name", label: "Last Name", required: true, csvColumn: null, example: "" },
  { key: "middle_name", label: "Middle Name", required: false, csvColumn: null, example: "" },
  { key: "grade", label: "Grade", required: true, csvColumn: null, example: "" },
  { key: "stream", label: "Stream", required: false, csvColumn: null, example: "" },
  { key: "gender", label: "Gender", required: false, csvColumn: null, example: "" },
  { key: "date_of_birth", label: "Date of Birth", required: false, csvColumn: null, example: "" },
  { key: "phone", label: "Phone", required: false, csvColumn: null, example: "" },
  { key: "email", label: "Email", required: false, csvColumn: null, example: "" },
  { key: "parent_name", label: "Parent/Guardian Name", required: false, csvColumn: null, example: "" },
  { key: "parent_phone", label: "Parent Phone", required: false, csvColumn: null, example: "" },
  { key: "address", label: "Address", required: false, csvColumn: null, example: "" },
  { key: "status", label: "Status", required: false, csvColumn: null, example: "" },
];

const AUTO_MAP: Record<string, string[]> = {
  admission_no: ["admission_no", "admission no", "adm no", "adm_no", "student_id", "student id", "id number", "reg no", "reg_no", "register number"],
  first_name: ["first_name", "first name", "firstname", "fname", "given name", "given_name"],
  last_name: ["last_name", "last name", "lastname", "lname", "surname", "family name", "family_name"],
  middle_name: ["middle_name", "middle name", "middlename", "mname", "second name"],
  grade: ["grade", "class", "form", "level", "year"],
  stream: ["stream", "sub_class", "sub class", "section", "group"],
  gender: ["gender", "sex"],
  date_of_birth: ["date_of_birth", "date of birth", "dob", "birth_date", "birth date"],
  phone: ["phone", "phone_number", "phone number", "mobile", "tel", "telephone", "contact"],
  email: ["email", "email_address", "email address", "e-mail"],
  parent_name: ["parent_name", "parent name", "guardian", "guardian_name", "guardian name", "father", "mother", "next of kin"],
  parent_phone: ["parent_phone", "parent phone", "guardian_phone", "guardian phone", "guardian_number", "next of kin phone", "emergency phone"],
  address: ["address", "home_address", "home address", "location", "residence", "physical address"],
  status: ["status", "state", "enrollment status"],
};

const SEPARATOR_OPTIONS: { value: NameSeparator; label: string; preview: string }[] = [
  { value: "space", label: "Space", preview: "John Kamau Mwangi" },
  { value: "comma", label: "Comma", preview: "John, Kamau, Mwangi" },
  { value: "dash", label: "Dash", preview: "John - Kamau - Mwangi" },
  { value: "custom", label: "Custom...", preview: "Type your separator" },
];

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

function splitName(fullName: string, separator: NameSeparator, customSep: string): { first: string; middle: string; last: string } {
  const sep = separator === "custom" ? customSep : separator === "space" ? " " : separator === "comma" ? "," : "-";
  if (!sep) return { first: fullName.trim(), middle: "", last: "" };
  const parts = fullName.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  if (parts.length === 2) return { first: parts[0], middle: "", last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}

export function StudentImportWizard({ open, onClose }: ImportWizardProps) {
  const { addStudent, students } = useStudentStore();
  const { addToast, currentSchoolId } = useAppStore();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [fields, setFields] = useState<MappedField[]>(STUDENT_FIELDS);
  const [nameSplit, setNameSplit] = useState<NameSplitConfig>({ enabled: false, csvColumn: null, separator: "space", customSeparator: "" });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const existingAdmNos = useMemo(() => new Set(students.map((s) => s.admission_no)), [students]);

  const loadFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      addToast({ title: "No data found in file", variant: "error" });
      return;
    }
    const columns = Object.keys(parsed[0].raw);
    setCsvColumns(columns);
    setRawRows(parsed);

    // Check if there's a "full name" column
    const fullNameCol = columns.find((col) => {
      const norm = col.toLowerCase().replace(/[^a-z0-9]/g, "");
      return ["fullname", "full_name", "full name", "name", "studentname", "student name"].some((c) => norm === c);
    });

    const autoMapped = STUDENT_FIELDS.map((f) => {
      const candidates = AUTO_MAP[f.key] || [];
      const matchedCol = columns.find((col) => {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, "");
        return candidates.some((c) => norm === c.replace(/[^a-z0-9]/g, ""));
      });
      const example = matchedCol ? parsed[0].raw[matchedCol] || "" : "";
      return { ...f, csvColumn: matchedCol || null, example };
    });

    // If a full name column exists, enable name splitting
    if (fullNameCol && !autoMapped.find((f) => f.key === "first_name")?.csvColumn) {
      setNameSplit({ enabled: true, csvColumn: fullNameCol, separator: "space", customSeparator: "" });
      // Clear first/middle/last since they'll come from the split
      autoMapped.find((f) => f.key === "first_name")!.csvColumn = null;
      autoMapped.find((f) => f.key === "middle_name")!.csvColumn = null;
      autoMapped.find((f) => f.key === "last_name")!.csvColumn = null;
    }

    setFields(autoMapped);
    setStep("map");
  };

  const handleFileSelect = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,.txt";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await loadFile(file);
    };
    input.click();
  };

  const nameSplitPreview = useMemo(() => {
    if (!nameSplit.enabled || !nameSplit.csvColumn || rawRows.length === 0) return null;
    const sample = rawRows.slice(0, 3).map((row) => {
      const raw = row.raw[nameSplit.csvColumn!] || "";
      return { raw, ...splitName(raw, nameSplit.separator, nameSplit.customSeparator) };
    });
    return sample;
  }, [nameSplit, rawRows]);

  const resolveMappedRow = (row: ParsedRow): Record<string, string> => {
    const mapped: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.csvColumn) mapped[f.key] = row.raw[f.csvColumn] || "";
    });
    // Apply name split if enabled
    if (nameSplit.enabled && nameSplit.csvColumn) {
      const fullName = row.raw[nameSplit.csvColumn] || "";
      const parts = splitName(fullName, nameSplit.separator, nameSplit.customSeparator);
      if (!mapped.first_name) mapped.first_name = parts.first;
      if (!mapped.middle_name) mapped.middle_name = parts.middle;
      if (!mapped.last_name) mapped.last_name = parts.last;
    }
    return mapped;
  };

  const updateFieldMap = (fieldKey: string, csvCol: string | null) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.key !== fieldKey) return f;
        const example = csvCol && rawRows.length > 0 ? rawRows[0].raw[csvCol] || "" : "";
        return { ...f, csvColumn: csvCol, example };
      })
    );
  };

  const mappedFields = useMemo(() => {
    const m = fields.filter((f) => f.csvColumn);
    if (nameSplit.enabled && nameSplit.csvColumn) {
      // Show the full name column as a mapped field
      return [
        { key: "__full_name__", label: "Full Name (split)", required: true, csvColumn: nameSplit.csvColumn, example: rawRows[0]?.raw[nameSplit.csvColumn] || "" },
        ...m.filter((f) => f.key !== "first_name" && f.key !== "last_name" && f.key !== "middle_name"),
      ];
    }
    return m;
  }, [fields, nameSplit, rawRows]);

  const unmappedRequired = useMemo(() => {
    if (nameSplit.enabled && nameSplit.csvColumn) {
      // first/last/middle come from split, so only check other required fields
      return fields.filter((f) => f.required && !f.csvColumn && f.key !== "first_name" && f.key !== "last_name");
    }
    return fields.filter((f) => f.required && !f.csvColumn);
  }, [fields, nameSplit]);

  const previewRows = useMemo(() => {
    return rawRows.slice(0, 10).map((row) => {
      const mapped = resolveMappedRow(row);
      const errors: string[] = [];
      if (!mapped.admission_no?.trim()) errors.push("Missing admission no");
      if (!mapped.first_name?.trim()) errors.push("Missing first name");
      if (!mapped.last_name?.trim()) errors.push("Missing last name");
      if (!mapped.grade?.trim()) errors.push("Missing grade");
      if (mapped.grade && !GRADES_CBC.includes(mapped.grade)) errors.push(`Unknown grade: ${mapped.grade}`);
      if (mapped.status && !["active", "inactive", "graduated"].includes(mapped.status)) errors.push(`Invalid status: ${mapped.status}`);
      if (mapped.admission_no && existingAdmNos.has(mapped.admission_no)) errors.push("Duplicate admission no");
      return { ...mapped, errors, rowIndex: row.index, raw: row.raw };
    });
  }, [rawRows, fields, nameSplit, existingAdmNos]);

  const previewValid = previewRows.filter((r) => r.errors.length === 0).length;
  const previewInvalid = previewRows.length - previewValid;

  const handleImport = async () => {
    setImporting(true);
    const res: ImportResult = { success: 0, failed: 0, skipped: 0, errors: [] };

    for (const row of rawRows) {
      const mapped = resolveMappedRow(row);

      if (!mapped.admission_no?.trim() || !mapped.first_name?.trim() || !mapped.last_name?.trim() || !mapped.grade?.trim()) {
        res.failed++;
        res.errors.push({ row: row.index + 2, reason: "Missing required fields" });
        continue;
      }

      if (!GRADES_CBC.includes(mapped.grade)) {
        res.failed++;
        res.errors.push({ row: row.index + 2, reason: `Invalid grade: ${mapped.grade}` });
        continue;
      }

      if (existingAdmNos.has(mapped.admission_no)) {
        res.skipped++;
        res.errors.push({ row: row.index + 2, reason: `Duplicate: ${mapped.admission_no}` });
        continue;
      }

      try {
        await addStudent({
          school_id: currentSchoolId || "",
          admission_no: mapped.admission_no.trim(),
          first_name: mapped.first_name.trim(),
          last_name: mapped.last_name.trim(),
          middle_name: mapped.middle_name?.trim() || undefined,
          grade: mapped.grade,
          stream: mapped.stream?.trim() || undefined,
        });
        existingAdmNos.add(mapped.admission_no);
        res.success++;
      } catch (err) {
        res.failed++;
        res.errors.push({ row: row.index + 2, reason: String(err) });
      }
    }

    setResult(res);
    setStep("result");
    setImporting(false);

    if (res.success > 0) addToast({ title: `Imported ${res.success} students`, variant: "success" });
    if (res.failed > 0) addToast({ title: `${res.failed} rows failed to import`, variant: "error" });
    if (res.skipped > 0) addToast({ title: `${res.skipped} duplicates skipped`, variant: "warning" });
  };

  const handleDownloadTemplate = () => {
    const headers = ["Admission No", "Full Name", "Grade", "Stream", "Gender", "Phone", "Parent Name", "Parent Phone"];
    const example = ["ADM001", "John Kamau Mwangi", "Grade 1", "Blue", "M", "0712345678", "Peter Kamau", "0723456789"];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setRawRows([]);
    setCsvColumns([]);
    setFields(STUDENT_FIELDS);
    setNameSplit({ enabled: false, csvColumn: null, separator: "space", customSeparator: "" });
    setResult(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Import Students</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Step {step === "upload" ? "1" : step === "map" ? "2" : step === "preview" ? "3" : "4"} of 4
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-5 pt-3">
          {["upload", "map", "preview", "result"].map((s, i) => (
            <div key={s} className={cn(
              "flex-1 h-1 rounded-full transition-colors",
              (step === "upload" && i <= 0) || (step === "map" && i <= 1) || (step === "preview" && i <= 2) || step === "result"
                ? "bg-primary" : "bg-muted"
            )} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* STEP 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
                onClick={handleFileSelect}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Drop your CSV file here or click to browse</p>
                <p className="text-[11px] text-muted-foreground mt-1">Supports .csv, .tsv, .txt — Max 10,000 rows</p>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={handleDownloadTemplate} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <Download className="h-3 w-3" /> Download template CSV
                </button>
                <p className="text-[11px] text-muted-foreground">Required: Admission No, Name, Grade</p>
              </div>
            </div>
          )}

          {/* STEP 2: Map Columns */}
          {step === "map" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Map columns from <span className="text-primary">{fileName}</span></p>
                <p className="text-[11px] text-muted-foreground">{rawRows.length} rows detected — {csvColumns.length} columns found</p>
              </div>

              {/* Name Split Config */}
              <div className="border border-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">Full Name Split</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNameSplit((prev) => ({ ...prev, enabled: !prev.enabled, csvColumn: prev.enabled ? null : csvColumns[0] || null }))}
                    className={cn(
                      "relative w-9 h-5 rounded-full transition-colors",
                      nameSplit.enabled ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                      nameSplit.enabled ? "translate-x-4" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Split a single "Full Name" column into First, Middle, and Last names
                </p>

                {nameSplit.enabled && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium mb-1">Source Column</label>
                      <SearchSelect
                        options={csvColumns.map((c) => ({ value: c, label: c }))}
                        value={nameSplit.csvColumn || ""}
                        onChange={(v) => setNameSplit((prev) => ({ ...prev, csvColumn: v }))}
                        placeholder="Select the full name column"
                        searchable={csvColumns.length > 5}
                        size="sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium mb-1.5">Separator</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SEPARATOR_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setNameSplit((prev) => ({ ...prev, separator: opt.value }))}
                            className={cn(
                              "px-2.5 py-1 text-[11px] rounded-md border transition-colors",
                              nameSplit.separator === opt.value
                                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                                : "border-border hover:bg-muted"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {nameSplit.separator === "custom" && (
                        <input
                          value={nameSplit.customSeparator}
                          onChange={(e) => setNameSplit((prev) => ({ ...prev, customSeparator: e.target.value }))}
                          placeholder="Type separator (e.g. | or /)"
                          className="mt-2 flex h-8 w-full max-w-[200px] rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      )}
                    </div>

                    {/* Live Preview */}
                    {nameSplitPreview && nameSplit.csvColumn && (
                      <div className="bg-muted/50 rounded-md p-2.5 space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                        <div className="space-y-1">
                          {nameSplitPreview.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground truncate max-w-[140px]">{p.raw}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium">{p.first}</span>
                              {p.middle && <span className="text-muted-foreground">{p.middle}</span>}
                              <span className="font-medium">{p.last}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Field Mapping Table */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_120px_100px] gap-2 text-[11px] font-medium text-muted-foreground px-1 pb-1 border-b border-border">
                  <span>Student Field</span>
                  <span>CSV Column</span>
                  <span>Sample</span>
                  <span className="text-center">Required</span>
                </div>
                {fields.map((f) => {
                  const isNameField = nameSplit.enabled && (f.key === "first_name" || f.key === "last_name" || f.key === "middle_name");
                  return (
                    <div
                      key={f.key}
                      className={cn(
                        "grid grid-cols-[1fr_1fr_120px_100px] gap-2 items-center px-1 py-1.5 rounded-md text-xs",
                        f.required && !f.csvColumn && !isNameField && "bg-destructive/5",
                        isNameField && nameSplit.enabled && "bg-primary/5 opacity-60"
                      )}
                    >
                      <span className={cn("truncate", f.required && "font-medium")}>
                        {f.label}
                        {f.required && <span className="text-destructive ml-0.5">*</span>}
                        {isNameField && nameSplit.enabled && (
                          <span className="text-[10px] text-primary ml-1">(from split)</span>
                        )}
                      </span>
                      {isNameField ? (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {nameSplit.csvColumn ? `${nameSplit.csvColumn} → ${nameSplit.separator}` : "—"}
                        </span>
                      ) : (
                        <SearchSelect
                          options={[{ value: "__none__", label: "— Don't import —" }, ...csvColumns.map((c) => ({ value: c, label: c }))]}
                          value={f.csvColumn || "__none__"}
                          onChange={(v) => updateFieldMap(f.key, v === "__none__" ? null : v)}
                          placeholder="Select column"
                          searchable={csvColumns.length > 5}
                          size="sm"
                        />
                      )}
                      <span className="text-muted-foreground truncate text-[11px]">
                        {isNameField ? (nameSplit.enabled ? "—" : f.example || "—") : (f.example || "—")}
                      </span>
                      <span className="text-center">
                        {f.required && !isNameField ? (
                          f.csvColumn ? <Check className="h-3.5 w-3.5 text-success mx-auto" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {unmappedRequired.length > 0 && (
                <p className="text-[11px] text-destructive">
                  {unmappedRequired.length} required field{unmappedRequired.length > 1 ? "s" : ""} not mapped: {unmappedRequired.map((f) => f.label).join(", ")}
                </p>
              )}
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Preview first 10 rows</p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-success">{previewValid} valid</span>
                  {previewInvalid > 0 && <span className="text-destructive">{previewInvalid} issues</span>}
                </div>
              </div>

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                      {mappedFields.map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{f.label}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className={cn("border-b border-border/50", row.errors.length > 0 && "bg-destructive/5")}>
                        <td className="px-2 py-1.5 text-muted-foreground">{row.rowIndex + 2}</td>
                        {mappedFields.map((f) => {
                          const val = f.key === "__full_name__" ? row.raw[nameSplit.csvColumn || ""] : (row as unknown as Record<string, string>)[f.key];
                          return (
                            <td key={f.key} className="px-2 py-1.5 truncate max-w-[120px]">
                              {val || <span className="text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5">
                          {row.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" /> OK</span>
                          ) : (
                            <span className="text-destructive" title={row.errors.join("; ")}>{row.errors.length} issue{row.errors.length > 1 ? "s" : ""}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {rawRows.length} total rows. Rows with validation issues will be skipped.
              </p>
            </div>
          )}

          {/* STEP 4: Result */}
          {step === "result" && result && (
            <div className="space-y-4 text-center py-4">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
                result.success > 0 ? "bg-success/10" : "bg-destructive/10"
              )}>
                {result.success > 0 ? <Check className="h-8 w-8 text-success" /> : <AlertTriangle className="h-8 w-8 text-destructive" />}
              </div>
              <div>
                <h3 className="text-base font-semibold">Import Complete</h3>
                <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
              </div>
              <div className="flex items-center justify-center gap-6 text-sm">
                {result.success > 0 && <div className="text-center"><p className="text-2xl font-bold text-success">{result.success}</p><p className="text-[11px] text-muted-foreground">Imported</p></div>}
                {result.skipped > 0 && <div className="text-center"><p className="text-2xl font-bold text-warning">{result.skipped}</p><p className="text-[11px] text-muted-foreground">Skipped</p></div>}
                {result.failed > 0 && <div className="text-center"><p className="text-2xl font-bold text-destructive">{result.failed}</p><p className="text-[11px] text-muted-foreground">Failed</p></div>}
              </div>
              {result.errors.length > 0 && (
                <div className="text-left max-h-40 overflow-y-auto border border-border rounded-lg p-3 space-y-1">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">
                      <span className="font-mono text-foreground">Row {e.row}</span>: {e.reason}
                    </p>
                  ))}
                  {result.errors.length > 20 && <p className="text-[11px] text-muted-foreground">... and {result.errors.length - 20} more</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button onClick={step === "upload" ? onClose : reset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {step === "upload" ? "Cancel" : "Start Over"}
          </button>
          <div className="flex items-center gap-2">
            {step === "map" && (
              <button
                onClick={() => setStep("preview")}
                disabled={unmappedRequired.length > 0}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                Preview <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {step === "preview" && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {importing ? "Importing..." : `Import ${rawRows.length} Students`}
              </button>
            )}
            {step === "result" && (
              <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line, i) => {
    const values = parseCSVLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => (raw[h] = values[j] || ""));
    return { raw, index: i };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === "," || c === "\t") { result.push(current.trim()); current = ""; }
      else { current += c; }
    }
  }
  result.push(current.trim());
  return result;
}
