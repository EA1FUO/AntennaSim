/**
 * Antenna Library page — browse, search, and filter antenna templates.
 * Clicking a template navigates to the simulator with that template loaded.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { templates } from "../templates";
import type { TemplateCategory, TemplateDifficulty } from "../templates/types";
import { useAntennaStore } from "../stores/antennaStore";
import { Navbar } from "../components/layout/Navbar";

const CATEGORIES: { key: TemplateCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "wire", label: "Wire" },
  { key: "vertical", label: "Vertical" },
  { key: "directional", label: "Directional" },
  { key: "loop", label: "Loop" },
  { key: "multiband", label: "Multiband" },
];

const DIFFICULTY_COLORS: Record<TemplateDifficulty, string> = {
  beginner: "text-good",
  intermediate: "text-warning",
  advanced: "text-bad",
};

const DIFFICULTY_LABELS: Record<TemplateDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const setTemplate = useAntennaStore((s) => s.setTemplate);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.bands.some((b) => b.toLowerCase().includes(q)) ||
          t.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, category]);

  const handleSelect = useCallback(
    (templateId: string) => {
      const tmpl = templates.find((t) => t.id === templateId);
      if (tmpl) {
        setTemplate(tmpl);
        navigate("/");
      }
    },
    [setTemplate, navigate]
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary mb-1">
              Antenna Library
            </h1>
            <p className="text-sm text-text-secondary">
              Browse {templates.length} antenna templates. Click to load in the simulator.
            </p>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search antennas, bands, categories..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg
                  text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent
                  transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    category === cat.key
                      ? "bg-accent text-white"
                      : "bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          <p className="text-xs text-text-secondary mb-4">
            {filtered.length} antenna{filtered.length !== 1 ? "s" : ""} found
          </p>

          {/* Template Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary text-sm">
                No antennas match your search.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelect(tmpl.id)}
                  className="text-left p-4 bg-surface border border-border rounded-xl
                    hover:border-accent hover:bg-surface-hover transition-all group"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-mono text-accent opacity-70">
                        {tmpl.icon}
                      </span>
                      <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                        {tmpl.name}
                      </h3>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text-secondary mb-3 line-clamp-2">
                    {tmpl.description}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-medium ${DIFFICULTY_COLORS[tmpl.difficulty]}`}
                      >
                        {DIFFICULTY_LABELS[tmpl.difficulty]}
                      </span>
                      <span className="text-[10px] text-text-secondary capitalize">
                        {tmpl.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {tmpl.bands.slice(0, 4).map((band) => (
                        <span
                          key={band}
                          className="px-1.5 py-0.5 text-[10px] font-mono bg-background
                            border border-border rounded text-text-secondary"
                        >
                          {band}
                        </span>
                      ))}
                      {tmpl.bands.length > 4 && (
                        <span className="text-[10px] text-text-secondary">
                          +{tmpl.bands.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
