/**
 * Bottom status bar — shows sim info, timing, segments, frequency, cache status.
 */

import { useSimulationStore } from "../../stores/simulationStore";
import { useAntennaStore } from "../../stores/antennaStore";

export function StatusBar() {
  const result = useSimulationStore((s) => s.result);
  const status = useSimulationStore((s) => s.status);
  const template = useAntennaStore((s) => s.template);
  const wireGeometry = useAntennaStore((s) => s.wireGeometry);

  const totalSegments = wireGeometry.reduce((sum, w) => sum + w.segments, 0);

  return (
    <footer className="flex items-center px-4 h-7 border-t border-border bg-surface text-[11px] text-text-secondary shrink-0 font-mono gap-3">
      {/* Template */}
      <span>{template.nameShort}</span>
      <span className="text-border">|</span>

      {/* Segments */}
      <span>{totalSegments} segs</span>
      <span className="text-border">|</span>

      {/* Engine */}
      <span>NEC2</span>

      {/* Simulation result info */}
      {result && status === "success" && (
        <>
          <span className="text-border">|</span>
          <span className="text-swr-excellent">
            {result.computed_in_ms.toFixed(0)}ms
          </span>
          <span className="text-border">|</span>
          <span>
            {result.frequency_data.length} freq pts
          </span>
          {result.cached && (
            <>
              <span className="text-border">|</span>
              <span className="text-swr-warning">CACHED</span>
            </>
          )}
        </>
      )}

      {status === "loading" && (
        <>
          <span className="text-border">|</span>
          <span className="text-accent animate-pulse">Simulating...</span>
        </>
      )}

      {status === "error" && (
        <>
          <span className="text-border">|</span>
          <span className="text-swr-bad">Error</span>
        </>
      )}
    </footer>
  );
}
