/**
 * Visual template selector — card grid showing available antenna templates.
 */

import { useCallback } from "react";
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
  const handleSelect = useCallback(
    (template: AntennaTemplate) => () => onSelect(template),
    [onSelect]
  );

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Antenna Type
      </h3>
      <div className="grid grid-cols-1 gap-1.5">
        {templates.map((t) => (
          <Card
            key={t.id}
            selected={t.id === selectedId}
            onClick={handleSelect(t)}
            className="px-3 py-2"
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
    </div>
  );
}
