/**
 * Top navigation bar — logo, nav links, theme toggle, unit toggle.
 */

import { useCallback } from "react";
import { useUIStore } from "../../stores/uiStore";

export function Navbar() {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const imperial = useUIStore((s) => s.imperial);
  const toggleUnits = useUIStore((s) => s.toggleUnits);

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  const handleUnitToggle = useCallback(() => {
    toggleUnits();
  }, [toggleUnits]);

  return (
    <header className="flex items-center justify-between px-4 h-11 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="text-accent font-bold text-lg tracking-tight">
            AntSim
          </span>
          <span className="text-text-secondary text-[10px] font-mono">
            v0.1
          </span>
        </a>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
          <a
            href="/"
            className="text-text-primary hover:text-accent transition-colors font-medium"
          >
            Simulator
          </a>
          <a
            href="/about"
            className="text-text-secondary hover:text-accent transition-colors"
          >
            About
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Unit toggle */}
        <button
          onClick={handleUnitToggle}
          className="px-1.5 py-0.5 rounded-md text-[11px] font-mono text-text-secondary
            hover:text-text-primary hover:bg-surface-hover transition-colors border border-border"
          title={`Switch to ${imperial ? "metric" : "imperial"} units`}
        >
          {imperial ? "ft" : "m"}
        </button>

        {/* Theme toggle */}
        <button
          onClick={handleThemeToggle}
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary
            hover:bg-surface-hover transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
