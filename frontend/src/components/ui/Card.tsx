/**
 * Card component for grouping related content.
 */

import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Optional click handler (makes card interactive) */
  onClick?: () => void;
  /** Highlight border when selected */
  selected?: boolean;
}

export function Card({
  children,
  className = "",
  onClick,
  selected = false,
}: CardProps) {
  const interactive = !!onClick;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`
        rounded-lg border bg-surface
        ${selected ? "border-accent shadow-sm shadow-accent/10" : "border-border"}
        ${interactive ? "cursor-pointer hover:bg-surface-hover hover:border-accent/50 transition-colors" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
