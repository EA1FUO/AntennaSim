import { useMemo } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { findEndpointJunction } from "../../utils/editor-junctions";

function endpointLabel(wireTag: number, endpoint: "start" | "end") {
  return `Wire ${wireTag} ${endpoint}`;
}

export function EndpointConnectionControls() {
  const selectedEndpoints = useEditorStore((state) => state.selectedEndpoints);
  const junctions = useEditorStore((state) => state.junctions);
  const lastEditorMessage = useEditorStore((state) => state.lastEditorMessage);
  const snapSelectedEndpoints = useEditorStore((state) => state.snapSelectedEndpoints);
  const toggleSelectedJunction = useEditorStore((state) => state.toggleSelectedJunction);
  const clearEndpointSelection = useEditorStore((state) => state.clearEndpointSelection);
  const clearEditorMessage = useEditorStore((state) => state.clearEditorMessage);

  const selectedJunction = useMemo(
    () => selectedEndpoints[0]
      ? findEndpointJunction(junctions, selectedEndpoints[0])
      : undefined,
    [junctions, selectedEndpoints],
  );

  if (selectedEndpoints.length === 0 && !lastEditorMessage) return null;

  const source = selectedEndpoints[0];
  const target = selectedEndpoints[1];
  const canSnap = Boolean(source && target);

  return (
    <section
      aria-label="Endpoint connection tools"
      className="absolute bottom-2 left-2 right-2 z-20 lg:right-auto lg:w-[31rem] rounded-lg border border-border bg-surface/95 p-2 shadow-lg backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-secondary">
          <span className="font-semibold text-amber-400">1 Source:</span>{" "}
          {source ? endpointLabel(source.wireTag, source.endpoint) : "select an endpoint"}
        </span>
        <span className="text-text-secondary">
          <span className="font-semibold text-blue-400">2 Target:</span>{" "}
          {target ? endpointLabel(target.wireTag, target.endpoint) : "select another endpoint"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!canSnap}
          onClick={() => snapSelectedEndpoints(false)}
          className="cursor-pointer rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
          title="Move the source endpoint onto the target (S)"
        >
          Snap end <kbd className="ml-1 opacity-70">S</kbd>
        </button>
        <button
          type="button"
          disabled={!canSnap}
          onClick={() => snapSelectedEndpoints(true)}
          className="cursor-pointer rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          title="Translate the source wire onto the target without changing its length (Shift+S)"
        >
          Snap, keep length <kbd className="ml-1 opacity-70">Shift+S</kbd>
        </button>
        <button
          type="button"
          disabled={!source}
          onClick={() => toggleSelectedJunction()}
          className="cursor-pointer rounded-md border border-purple-500/40 bg-purple-500/10 px-2.5 py-1.5 text-[11px] font-medium text-purple-400 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          title="Lock all coincident endpoints, or unlock this junction (J)"
        >
          {selectedJunction ? "Unlock junction" : "Lock junction"} <kbd className="ml-1 opacity-70">J</kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            clearEndpointSelection();
            clearEditorMessage();
          }}
          className="cursor-pointer rounded-md px-2 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selectedEndpoints.length > 0 ? "Clear" : "Dismiss"}
        </button>
      </div>

      {lastEditorMessage && (
        <p role="status" className="mt-1.5 text-[10px] leading-snug text-text-secondary">
          {lastEditorMessage}
        </p>
      )}
    </section>
  );
}
