/**
 * Keyboard shortcuts help overlay.
 * Shown via a "?" button or Ctrl+/ shortcut.
 */

import { useCallback, useEffect } from "react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SIMULATOR_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Viewport",
    shortcuts: [
      { keys: ["1"], description: "Top view" },
      { keys: ["2"], description: "Front view" },
      { keys: ["3"], description: "Side view" },
      { keys: ["4"], description: "Isometric view" },
      { keys: ["Scroll"], description: "Zoom in/out" },
      { keys: ["Left drag"], description: "Rotate" },
      { keys: ["Right drag"], description: "Pan" },
    ],
  },
  {
    title: "Simulation",
    shortcuts: [
      { keys: ["Ctrl", "Enter"], description: "Run simulation" },
    ],
  },
];

const EDITOR_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Editor Modes",
    shortcuts: [
      { keys: ["V"], description: "Select mode" },
      { keys: ["A"], description: "Add wire mode" },
      { keys: ["M"], description: "Move mode" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
      { keys: ["Ctrl", "A"], description: "Select all wires" },
      { keys: ["Del"], description: "Delete selected wire(s)" },
      { keys: ["Esc"], description: "Deselect all" },
    ],
  },
  {
    title: "Viewport",
    shortcuts: [
      { keys: ["1"], description: "Top view" },
      { keys: ["2"], description: "Front view" },
      { keys: ["3"], description: "Side view" },
      { keys: ["4"], description: "Isometric view" },
    ],
  },
];

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which shortcut set to show */
  mode?: "simulator" | "editor";
}

export function KeyboardShortcutsPanel({
  isOpen,
  onClose,
  mode = "simulator",
}: KeyboardShortcutsPanelProps) {
  const groups = mode === "editor" ? EDITOR_SHORTCUTS : SIMULATOR_SHORTCUTS;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary
              hover:bg-surface-hover transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-text-secondary">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="text-text-secondary text-[10px] mx-0.5">
                              +
                            </span>
                          )}
                          <kbd className="inline-block px-1.5 py-0.5 text-[11px] font-mono
                            bg-background border border-border rounded text-text-primary">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border">
          <p className="text-[10px] text-text-secondary text-center">
            Press <kbd className="px-1 py-0.5 text-[10px] font-mono bg-background border border-border rounded">?</kbd> or <kbd className="px-1 py-0.5 text-[10px] font-mono bg-background border border-border rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
