/**
 * EditorToolbar — vertical toolbar for the wire editor.
 *
 * Contains mode buttons (Select, Add, Move), operation buttons
 * (Split, Delete, Mirror), and undo/redo.
 */

import { useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorMode } from "../../stores/editorStore";

interface ToolButton {
  id: string;
  label: string;
  icon: string;
  title: string;
  mode?: EditorMode;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

function ToolBtn({
  btn,
  isActive,
  onClick,
}: {
  btn: ToolButton;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={btn.disabled}
      className={`flex flex-col items-center justify-center w-10 h-10 rounded-md text-[9px] transition-all
        ${
          isActive
            ? "bg-accent/20 text-accent border border-accent/40"
            : btn.danger
              ? "text-swr-bad hover:bg-swr-bad/10 border border-transparent"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent"
        }
        ${btn.disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
      `}
      title={btn.title}
    >
      <span className="text-sm leading-none">{btn.icon}</span>
      <span className="mt-0.5 leading-none">{btn.label}</span>
    </button>
  );
}

export function EditorToolbar() {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const splitWire = useEditorStore((s) => s.splitWire);
  const selectAll = useEditorStore((s) => s.selectAll);
  const clearAll = useEditorStore((s) => s.clearAll);
  const wires = useEditorStore((s) => s.wires);

  const hasSelection = selectedTags.size > 0;
  const singleSelected = selectedTags.size === 1;

  const handleSplit = useCallback(() => {
    if (singleSelected) {
      const tag = [...selectedTags][0]!;
      splitWire(tag);
    }
  }, [singleSelected, selectedTags, splitWire]);

  const modeButtons: ToolButton[] = [
    { id: "select", label: "Select", icon: "V", title: "Select mode (V)", mode: "select" },
    { id: "add", label: "Add", icon: "+", title: "Add wire mode (A)", mode: "add" },
    { id: "move", label: "Move", icon: "M", title: "Move endpoint mode (M)", mode: "move" },
  ];

  const operationButtons: ToolButton[] = [
    {
      id: "split",
      label: "Split",
      icon: "/",
      title: "Split selected wire at midpoint",
      action: handleSplit,
      disabled: !singleSelected,
    },
    {
      id: "delete",
      label: "Delete",
      icon: "X",
      title: "Delete selected wires (Del)",
      action: deleteSelected,
      disabled: !hasSelection,
      danger: true,
    },
    {
      id: "selall",
      label: "All",
      icon: "A",
      title: "Select all wires (Ctrl+A)",
      action: selectAll,
      disabled: wires.length === 0,
    },
    {
      id: "clear",
      label: "Clear",
      icon: "C",
      title: "Clear all wires",
      action: clearAll,
      disabled: wires.length === 0,
      danger: true,
    },
  ];

  const historyButtons: ToolButton[] = [
    { id: "undo", label: "Undo", icon: "\u21A9", title: "Undo (Ctrl+Z)", action: undo, disabled: !canUndo },
    { id: "redo", label: "Redo", icon: "\u21AA", title: "Redo (Ctrl+Shift+Z)", action: redo, disabled: !canRedo },
  ];

  return (
    <div className="flex flex-col items-center py-2 px-1 gap-1 bg-surface border-r border-border w-12 shrink-0">
      {/* Mode buttons */}
      {modeButtons.map((btn) => (
        <ToolBtn
          key={btn.id}
          btn={btn}
          isActive={btn.mode === mode}
          onClick={() => btn.mode && setMode(btn.mode)}
        />
      ))}

      <div className="w-8 h-px bg-border my-1" />

      {/* Operation buttons */}
      {operationButtons.map((btn) => (
        <ToolBtn
          key={btn.id}
          btn={btn}
          isActive={false}
          onClick={() => btn.action?.()}
        />
      ))}

      <div className="w-8 h-px bg-border my-1" />

      {/* Undo/Redo */}
      {historyButtons.map((btn) => (
        <ToolBtn
          key={btn.id}
          btn={btn}
          isActive={false}
          onClick={() => btn.action?.()}
        />
      ))}
    </div>
  );
}
