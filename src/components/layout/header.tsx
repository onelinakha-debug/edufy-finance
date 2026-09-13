import React, { useState, useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { CommandPalette, CommandPaletteTrigger } from "@/components/shared/command-palette";
import { Moon, Sun, Bell } from "lucide-react";

export function Header() {
  const { theme, toggleTheme, toasts } = useAppStore();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 h-12 bg-background/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6">
        <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
