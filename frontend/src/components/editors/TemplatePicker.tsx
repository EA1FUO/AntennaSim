/**
 * Visual template selector — collapsible card list showing available antenna templates.
 * Shows the selected template as a compact header; click to expand the full list.
 */

import { useCallback, useState } from "react";
import { Card } from "../ui/Card";
import { templates } from "../../templates";
import type { AntennaTemplate } from "../../templates/types";

interface TemplatePickerProps {
  selectedId: string;
  onSelect: (template: AntennaTemplate) => void;
}

const difficultyColors: Record<string, string> = {
  beginner: "text-swr-excellent",
  intermediate: "text-swr-warning",
  advanced: "text-swr-bad",
};

export function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  const [expanded, setExpanded] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? templates[0]!;

  const handleSelect = useCallback(
    (template: AntennaTemplate) => () => {
      onSelect(template);
      setExpanded(false);
    },
    [onSelect]
  );

  return (
    <div className="space-y-1.5">
      {/* Header — always visible, shows selected template */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full group"
      >
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
          Antenna Type
        </h3>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className={`text-text-secondary transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Selected template card (always shown as compact summary) */}
      {!expanded && (
        <Card
          selected
          onClick={() => setExpanded(true)}
          className="px-3 py-2 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono w-8 text-center shrink-0">
              {selectedTemplate.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">
                {selectedTemplate.nameShort}
              </div>
              <div className="text-[10px] text-text-secondary truncate">
                {selectedTemplate.description}
              </div>
            </div>
            <span className="text-[9px] text-text-secondary">Change</span>
          </div>
        </Card>
      )}

      {/* Expanded template list */}
      {expanded && (
        <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
          {templates.map((t) => (
            <Card
              key={t.id}
              selected={t.id === selectedId}
              onClick={handleSelect(t)}
              className="px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono w-8 text-center shrink-0">
                  {t.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {t.nameShort}
                  </div>
                  <div className="text-[10px] text-text-secondary truncate">
                    {t.description}
                  </div>
                </div>
                <span
                  className={`text-[9px] uppercase font-medium ${difficultyColors[t.difficulty] ?? "text-text-secondary"}`}
                >
                  {t.difficulty}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
