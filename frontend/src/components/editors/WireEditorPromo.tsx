import { Link } from "react-router-dom";

/** Persistent, contextual entry point from the template Simulator to the Wire Editor. */
export function WireEditorPromo() {
  return (
    <Link
      to="/editor"
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 transition-colors hover:border-accent/55 hover:bg-accent/10"
      aria-label="Open the Wire Editor to build a custom antenna"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="5" cy="18" r="2" />
          <circle cx="12" cy="7" r="2" />
          <circle cx="19" cy="16" r="2" />
          <path d="M6.2 16.4l4.6-7.8M13.6 8.2l4.1 6.6" />
        </svg>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-text-primary">
          Need a custom antenna?
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-text-secondary">
          Build, import, connect, and simulate any wire geometry.
        </span>
      </span>

      <span className="shrink-0 text-[11px] font-medium text-accent transition-transform group-hover:translate-x-0.5">
        Wire Editor <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
