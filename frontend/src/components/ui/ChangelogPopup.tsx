import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CURRENT_CHANGELOG } from "../../data/changelog";
import { useUIStore } from "../../stores/uiStore";
import {
  markChangelogSeen,
  shouldShowChangelog,
} from "../../utils/changelog-storage";

export function ChangelogPopup() {
  const isOpen = useUIStore((state) => state.changelogOpen);
  const openChangelog = useUIStore((state) => state.openChangelog);
  const closeChangelog = useUIStore((state) => state.closeChangelog);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      if (shouldShowChangelog(window.localStorage, CURRENT_CHANGELOG.id)) {
        openChangelog();
      }
    } catch {
      openChangelog();
    }
  }, [openChangelog]);

  const dismiss = useCallback(() => {
    try {
      markChangelogSeen(window.localStorage, CURRENT_CHANGELOG.id);
    } catch {
      // Reading localStorage itself can fail in restricted browsing contexts.
    }
    closeChangelog();
  }, [closeChangelog]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [dismiss, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        if (event.target === backdropRef.current) dismiss();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        aria-describedby="changelog-summary"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Latest changelog
            </p>
            <h2 id="changelog-title" className="text-lg font-semibold text-text-primary sm:text-xl">
              {CURRENT_CHANGELOG.title}
            </h2>
            <p id="changelog-summary" className="mt-1 text-xs text-text-secondary sm:text-sm">
              {CURRENT_CHANGELOG.summary}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={dismiss}
            className="-mr-1 shrink-0 rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/60"
            aria-label="Close changelog"
            title="Close changelog (Escape)"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {CURRENT_CHANGELOG.sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                {section.title}
              </h3>
              <ul className="space-y-2 text-xs leading-relaxed text-text-secondary sm:text-sm">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <p className="text-[10px] leading-relaxed text-text-secondary sm:max-w-sm">
            AntennaSim stores one first-party timestamp on this device for 30 days so this notice does not keep reopening. It is not used for tracking.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-10 w-full shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/60 sm:w-auto"
          >
            Got it
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
