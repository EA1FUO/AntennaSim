/**
 * WireTable — V2 spreadsheet-style wire list for the wire editor.
 *
 * Displays all wires with editable coordinates, segments, and radius.
 * Clicking a row selects the wire in the 3D viewport.
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorWire } from "../../stores/editorStore";

/** Column definitions */
const COLUMNS = [
  { key: "tag", label: "Tag", width: "w-12", editable: false },
  { key: "segments", label: "Segs", width: "w-12", editable: false },
  { key: "x1", label: "X1", width: "w-16", editable: true },
  { key: "y1", label: "Y1", width: "w-16", editable: true },
  { key: "z1", label: "Z1", width: "w-16", editable: true },
  { key: "x2", label: "X2", width: "w-16", editable: true },
  { key: "y2", label: "Y2", width: "w-16", editable: true },
  { key: "z2", label: "Z2", width: "w-16", editable: true },
  { key: "radius", label: "R(m)", width: "w-16", editable: true },
] as const;

type EditableKey = "x1" | "y1" | "z1" | "x2" | "y2" | "z2" | "radius";

interface EditCell {
  tag: number;
  field: EditableKey;
}

export function WireTable() {
  const wires = useEditorStore((s) => s.wires);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const selectWire = useEditorStore((s) => s.selectWire);
  const updateWire = useEditorStore((s) => s.updateWire);
  const deleteWires = useEditorStore((s) => s.deleteWires);
  const addWire = useEditorStore((s) => s.addWire);

  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editCell]);

  const handleRowClick = useCallback(
    (tag: number, e: React.MouseEvent) => {
      selectWire(tag, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [selectWire]
  );

  const handleCellDoubleClick = useCallback(
    (tag: number, field: EditableKey, currentValue: number) => {
      setEditCell({ tag, field });
      setEditValue(String(currentValue));
    },
    []
  );

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const numVal = parseFloat(editValue);
    if (!isNaN(numVal) && isFinite(numVal)) {
      updateWire(editCell.tag, { [editCell.field]: numVal });
    }
    setEditCell(null);
    setEditValue("");
  }, [editCell, editValue, updateWire]);

  const cancelEdit = useCallback(() => {
    setEditCell(null);
    setEditValue("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  const handleAddWire = useCallback(() => {
    addWire({
      x1: 0,
      y1: 0,
      z1: 5,
      x2: 5,
      y2: 0,
      z2: 5,
      radius: 0.001,
    });
  }, [addWire]);

  const handleDeleteSelected = useCallback(() => {
    const tags = [...selectedTags];
    if (tags.length > 0) {
      deleteWires(tags);
    }
  }, [selectedTags, deleteWires]);

  const formatNum = (v: number, decimals = 3) => {
    return v.toFixed(decimals);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Wires ({wires.length})
        </h3>
        <div className="flex items-center gap-1">
          {selectedTags.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-1.5 py-0.5 text-[10px] rounded bg-swr-bad/20 text-swr-bad hover:bg-swr-bad/30 transition-colors"
              title="Delete selected wires"
            >
              Del
            </button>
          )}
          <button
            onClick={handleAddWire}
            className="px-1.5 py-0.5 text-[10px] rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            title="Add new wire"
          >
            + Wire
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-surface z-10">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} px-1 py-1 text-text-secondary font-medium text-right border-b border-border`}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-6 px-1 py-1 border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {wires.map((wire) => {
              const isSelected = selectedTags.has(wire.tag);
              return (
                <tr
                  key={wire.tag}
                  onClick={(e) => handleRowClick(wire.tag, e)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-accent/15 hover:bg-accent/20"
                      : "hover:bg-surface-hover"
                  }`}
                >
                  {COLUMNS.map((col) => {
                    const value = wire[col.key as keyof EditorWire];
                    const isEditing =
                      editCell?.tag === wire.tag && editCell?.field === col.key;

                    if (isEditing) {
                      return (
                        <td key={col.key} className={`${col.width} px-0.5 py-0`}>
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-accent/20 text-text-primary text-right text-[10px] font-mono px-0.5 py-0.5 rounded outline-none border border-accent/40"
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.key}
                        className={`${col.width} px-1 py-0.5 text-right ${
                          col.key === "tag"
                            ? "text-accent font-bold"
                            : "text-text-primary"
                        }`}
                        onDoubleClick={
                          col.editable
                            ? () =>
                                handleCellDoubleClick(
                                  wire.tag,
                                  col.key as EditableKey,
                                  typeof value === "number" ? value : 0
                                )
                            : undefined
                        }
                      >
                        {col.key === "tag" || col.key === "segments"
                          ? String(value)
                          : formatNum(value as number, col.key === "radius" ? 4 : 3)}
                      </td>
                    );
                  })}
                  <td className="w-6 px-0.5 py-0.5 text-center">
                    {isSelected && (
                      <span className="text-accent text-xs">*</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {wires.length === 0 && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-xs">
            No wires. Click "+ Wire" to add one.
          </div>
        )}
      </div>
    </div>
  );
}
