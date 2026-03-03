/**
 * Top navigation bar — logo, nav links, theme toggle, unit toggle.
 *
 * Mobile: hamburger menu toggles a dropdown panel with all nav links.
 * Desktop: links shown inline in the header.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUIStore } from "../../stores/uiStore";

/** Shared nav link definitions */
const NAV_LINKS = [
  { to: "/", label: "Simulator" },
  { to: "/editor", label: "Editor" },
  { to: "/library", label: "Library" },
  { to: "/learn", label: "Learn" },
  { to: "/about", label: "About" },
] as const;

export function Navbar() {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const imperial = useUIStore((s) => s.imperial);
  const toggleUnits = useUIStore((s) => s.toggleUnits);

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  const location = useLocation();

  const handleUnitToggle = useCallback(() => {
    toggleUnits();
  }, [toggleUnits]);

  // Mobile menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [menuOpen]);

  function linkClass(path: string): string {
    const active = location.pathname === path;
    return `hover:text-accent transition-colors ${
      active ? "text-accent font-medium" : "text-text-secondary"
    }`;
  }

  return (
    <header className="relative shrink-0">
      <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-surface">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-accent font-bold text-lg tracking-tight">
              AntennaSim
            </span>
            <span className="text-text-secondary text-[10px] font-mono">
              v{__APP_VERSION__}
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-4 text-sm">
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className={linkClass(to)}>
                {label}
              </Link>
            ))}
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

          {/* Hamburger button (mobile only) */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 -mr-2 rounded-md text-text-secondary hover:text-text-primary
              hover:bg-surface-hover transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="md:hidden absolute top-full left-0 right-0 z-50 border-b border-border bg-surface shadow-lg"
        >
          <nav className="flex flex-col py-2">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-6 py-3 text-sm transition-colors ${
                  location.pathname === to
                    ? "text-accent font-medium bg-accent/5"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
