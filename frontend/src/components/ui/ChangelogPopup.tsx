import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CHANGELOG_ENTRIES,
  CURRENT_CHANGELOG_ID,
} from "../../data/changelog";
import { useUIStore } from "../../stores/uiStore";
import {
  markChangelogSeen,
  shouldShowChangelog,
} from "../../utils/changelog-storage";

/** Renders the inline code spans used by CHANGELOG.md without injecting HTML. */
function ChangelogText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index): ReactNode => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-background px-1 py-0.5 font-mono text-[0.9em] text-text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function ChangelogPopup() {
  const isOpen = useUIStore((state) => state.changelogOpen);
  const openChangelog = useUIStore((state) => state.openChangelog);
  const closeChangelog = useUIStore((state) => state.closeChangelog);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    () => new Set(CHANGELOG_ENTRIES[0] ? [CHANGELOG_ENTRIES[0].version] : []),
  );

  useEffect(() => {
    try {
      if (shouldShowChangelog(window.localStorage, CURRENT_CHANGELOG_ID)) {
        openChangelog();
      }
    } catch {
      openChangelog();
    }
  }, [openChangelog]);

  const dismiss = useCallback(() => {
    try {
      markChangelogSeen(window.localStorage, CURRENT_CHANGELOG_ID);
    } catch {
      // Reading localStorage itself can fail in restricted browsing contexts.
    }
    closeChangelog();
  }, [closeChangelog]);

  const toggleVersion = useCallback((version: string) => {
    setExpandedVersions((current) => {
      const next = new Set(current);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }, []);

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
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
              Version {__APP_VERSION__}
            </p>
            <h2
              id="changelog-title"
              className="text-lg font-semibold text-text-primary sm:text-xl"
            >
              What’s new in AntennaSim
            </h2>
            <p
              id="changelog-summary"
              className="mt-1 text-xs text-text-secondary sm:text-sm"
            >
              Select a version to show or hide its changes.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={dismiss}
            className="-mr-1 shrink-0 cursor-pointer rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/60"
            aria-label="Close changelog"
            title="Close changelog (Escape)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4L14 14M14 4L4 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
          <div className="space-y-2">
            {CHANGELOG_ENTRIES.map((entry, index) => {
              const expanded = expandedVersions.has(entry.version);
              const panelId = `changelog-version-${entry.version.replace(/[^a-zA-Z0-9]/g, "-")}`;
              return (
                <article
                  key={entry.version}
                  className="overflow-hidden rounded-lg border border-border bg-background/35"
                >
                  <button
                    type="button"
                    onClick={() => toggleVersion(entry.version)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/60 sm:px-4"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      className={`shrink-0 text-text-secondary transition-transform ${expanded ? "rotate-90" : ""}`}
                    >
                      <path
                        d="M5 3L9 7L5 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="min-w-0 flex-1 font-mono text-sm font-semibold text-text-primary">
                      v{entry.version}
                    </span>
                    {index === 0 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent sm:text-[10px]">
                        Latest
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div
                      id={panelId}
                      className="space-y-4 border-t border-border px-3 py-3 sm:px-4 sm:py-4"
                    >
                      {entry.sections.map((section) => (
                        <section key={section.title}>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-primary">
                            {section.title}
                          </h3>
                          <ul className="space-y-2 text-xs leading-relaxed text-text-secondary sm:text-sm">
                            {section.items.map((item, itemIndex) => (
                              <li
                                key={`${item}-${itemIndex}`}
                                className="flex gap-2.5"
                              >
                                <span
                                  className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                                  aria-hidden="true"
                                />
                                <span>
                                  <ChangelogText text={item} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <p className="text-[10px] leading-relaxed text-text-secondary sm:max-w-sm">
            AntennaSim stores one first-party timestamp on this device for 30
            days so this notice does not keep reopening. It is not used for
            tracking.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-10 w-full shrink-0 cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/60 sm:w-auto"
          >
            Got it
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
