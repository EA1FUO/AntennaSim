/**
 * Save/Load project buttons with keyboard shortcuts (Ctrl+S / Ctrl+O).
 *
 * Works in both Simulator and Editor modes — the parent page provides
 * callbacks for creating and restoring project state.
 */

import { useCallback, useEffect, useRef } from "react";
import { loadProjectFile, downloadProject } from "../../utils/project-file";
import type { ProjectFile } from "../../utils/project-file";

interface ProjectActionsProps {
  /** Create a ProjectFile from current page state */
  onSave: () => ProjectFile;
  /** Restore page state from a loaded ProjectFile */
  onLoad: (project: ProjectFile) => void;
  /** Optional: additional class names for the wrapper */
  className?: string;
}

export function ProjectActions({ onSave, onLoad, className = "" }: ProjectActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const project = onSave();
    downloadProject(project);
  }, [onSave]);

  const handleOpenClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const project = await loadProjectFile(file);
        onLoad(project);
      } catch (err) {
        // eslint wants us to narrow the type
        const msg = err instanceof Error ? err.message : "Failed to load project";
        alert(msg);
      }

      // Reset the input so the same file can be re-selected
      e.target.value = "";
    },
    [onLoad]
  );

  // Keyboard shortcuts: Ctrl+S to save, Ctrl+O to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        handleOpenClick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleOpenClick]);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        onClick={handleSave}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-text-secondary bg-surface border border-border rounded hover:border-accent/50 hover:text-text-primary transition-colors"
        title="Save project (Ctrl+S)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        Save
      </button>
      <button
        onClick={handleOpenClick}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-text-secondary bg-surface border border-border rounded hover:border-accent/50 hover:text-text-primary transition-colors"
        title="Open project (Ctrl+O)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        Open
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".antennasim,.json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
