/**
 * Dismissable validation warning/error banner.
 *
 * Shows pre-simulation validation issues from the validation engine.
 * Errors are red, warnings are yellow. Dismissed per-session.
 */

import { useState } from "react";
import type { ValidationResult, ValidationSeverity } from "../../engine/validation";

interface ValidationWarningsProps {
  validation: ValidationResult | null;
  className?: string;
}

const SEVERITY_STYLES: Record<ValidationSeverity, { bg: string; border: string; text: string; icon: string }> = {
  error: {
    bg: "bg-swr-bad/10",
    border: "border-swr-bad/30",
    text: "text-swr-bad",
    icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  warning: {
    bg: "bg-swr-warning/10",
    border: "border-swr-warning/30",
    text: "text-swr-warning",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z",
  },
  info: {
    bg: "bg-accent/10",
    border: "border-accent/30",
    text: "text-accent",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

export function ValidationWarnings({ validation, className = "" }: ValidationWarningsProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!validation || validation.issues.length === 0 || dismissed) {
    return null;
  }

  // Group by severity for display
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");

  // Show most severe issues first, limit to 5
  const displayed = [...errors, ...warnings].slice(0, 5);
  const remaining = validation.issues.length - displayed.length;

  // Overall severity for the container
  const overallSeverity: ValidationSeverity = errors.length > 0 ? "error" : "warning";
  const styles = SEVERITY_STYLES[overallSeverity];

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-md p-2 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`${styles.text} shrink-0 mt-0.5`}
          >
            <path d={SEVERITY_STYLES[overallSeverity].icon} />
          </svg>
          <div className="space-y-0.5 min-w-0">
            <p className={`text-[11px] font-medium ${styles.text}`}>
              {errors.length > 0
                ? `${errors.length} error${errors.length > 1 ? "s" : ""}${warnings.length > 0 ? `, ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""}`
                : `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`}
            </p>
            <ul className="space-y-0.5">
              {displayed.map((issue, i) => (
                <li
                  key={i}
                  className={`text-[10px] leading-tight ${
                    issue.severity === "error" ? "text-swr-bad" : "text-text-secondary"
                  }`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <p className="text-[10px] text-text-secondary">
                +{remaining} more issue{remaining > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-text-secondary hover:text-text-primary shrink-0"
          title="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
