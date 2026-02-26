/**
 * Tab bar component for switching between content panels.
 */

import { useCallback } from "react";

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  size?: "sm" | "md";
}

export function Tabs({ tabs, activeKey, onChange, size = "sm" }: TabsProps) {
  const handleClick = useCallback(
    (key: string) => () => onChange(key),
    [onChange]
  );

  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={handleClick(tab.key)}
          className={`
            px-3 py-2 ${textSize} font-medium transition-colors
            border-b-2 -mb-px
            ${
              activeKey === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border"
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
