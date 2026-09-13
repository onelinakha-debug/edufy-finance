import { useCallback } from "react";
import { useAppStore } from "@/stores/app-store";

function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function useExport() {
  const { addToast } = useAppStore();

  const exportToCSV = useCallback(
    async (data: Record<string, unknown>[], defaultFilename: string) => {
      if (data.length === 0) {
        addToast({ title: "No data to export", variant: "error" });
        return;
      }

      if (!isTauriAvailable()) {
        // Browser fallback: download as file
        const headers = Object.keys(data[0]);
        const rows = data.map((row) =>
          headers
            .map((h) => {
              const val = String(row[h] ?? "");
              return val.includes(",") || val.includes('"') || val.includes("\n")
                ? `"${val.replace(/"/g, '""')}"`
                : val;
            })
            .join(",")
        );
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${defaultFilename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addToast({ title: "Export downloaded", variant: "success" });
        return;
      }

      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const filePath = await save({
        defaultPath: `${defaultFilename}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });

      if (!filePath) return;

      const headers = Object.keys(data[0]);
      const rows = data.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h] ?? "");
            return val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          })
          .join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");
      await writeTextFile(filePath, csv);

      addToast({ title: "Export complete", variant: "success" });
    },
    [addToast]
  );

  return { exportToCSV };
}
