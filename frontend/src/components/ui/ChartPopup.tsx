/**
 * ChartPopup — modal overlay for expanding charts to full size.
 *
 * Usage: Wrap any chart in <ChartExpandable title="...">. Clicking the chart
 * or the expand icon opens the modal. The chart re-renders at full modal size.
 *
 * Features:
 * - 80vw x 80vh on desktop, 95vw x 90vh on mobile
 * - Dark semi-transparent backdrop, fade-in animation (150ms)
 * - Close on Escape, click-outside, or X button
 * - Expand icon affordance in top-right corner
 * - Chart title in modal header
 * - Export PNG button in modal header
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ChartExpandableProps {
  /** Title shown in the modal header */
  title: string;
  /** Chart content — rendered both inline and in the modal */
  children: ReactNode;
  /** Optional: render different content in the expanded modal (e.g., larger size) */
  expandedChildren?: ReactNode;
  /** Optional: callback to export chart as PNG */
  onExportPng?: () => void;
}

/**
 * Wraps chart content in a clickable container with an expand icon.
 * Clicking opens a full-size modal with the chart.
 */
export function ChartExpandable({
  title,
  children,
  expandedChildren,
  onExportPng,
}: ChartExpandableProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      {/* Inline chart with expand affordance */}
      <div className="relative group cursor-pointer" onClick={open}>
        {children}

        {/* Expand icon — top-right corner */}
        <button
          className="absolute top-1 right-1 p-1 rounded bg-surface/80 backdrop-blur-sm border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          title="Expand chart"
          aria-label="Expand chart"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="text-text-secondary"
          >
            <path
              d="M8.5 1.5H12.5V5.5M12.5 1.5L7.5 6.5M5.5 12.5H1.5V8.5M1.5 12.5L6.5 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Modal overlay */}
      {isOpen && (
        <ChartModal
          title={title}
          onClose={close}
          onExportPng={onExportPng}
        >
          {expandedChildren ?? children}
        </ChartModal>
      )}
    </>
  );
}

interface ChartModalProps {
  title: string;
  onClose: () => void;
  onExportPng?: () => void;
  children: ReactNode;
}

function ChartModal({ title, onClose, onExportPng, children }: ChartModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Fade-in on mount
  useEffect(() => {
    // Trigger reflow then set visible for CSS transition
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  return createPortal(
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-150 ${
        visible ? "bg-black/60 backdrop-blur-sm" : "bg-transparent"
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-surface border border-border rounded-lg shadow-2xl flex flex-col transition-all duration-150 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } w-[80vw] h-[80vh] max-sm:w-[95vw] max-sm:h-[90vh]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <div className="flex items-center gap-2">
            {/* Export PNG button */}
            {onExportPng && (
              <button
                onClick={onExportPng}
                className="px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
                title="Export as PNG"
              >
                PNG
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-text-secondary hover:text-text-primary"
              title="Close (Escape)"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4L12 12M12 4L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Chart content — fills remaining space */}
        <div className="flex-1 p-4 min-h-0 relative">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
