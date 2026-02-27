/**
 * Cursor3DTooltip — HTML overlay that follows the mouse cursor and displays
 * measurement data from 3D scene hover interactions.
 *
 * Renders as a fixed-position div with pointer-events: none so it never
 * interferes with clicks or camera controls. Positioned with a small offset
 * from the cursor to avoid obscuring the hovered object.
 */

import type { MeasurementData } from "./types";

interface Cursor3DTooltipProps {
  data: MeasurementData | null;
  x: number;
  y: number;
}

export function Cursor3DTooltip({ data, x, y }: Cursor3DTooltipProps) {
  if (!data) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: x + 14, top: y - 10 }}
    >
      <div className="bg-surface/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-lg text-[11px] font-mono leading-relaxed whitespace-nowrap">
        {data.type === "pattern" && <PatternInfo data={data} />}
        {data.type === "wire" && <WireInfo data={data} />}
        {data.type === "current" && <CurrentInfo data={data} />}
        {data.type === "nearfield" && <NearFieldInfo data={data} />}
      </div>
    </div>
  );
}

function PatternInfo({ data }: { data: Extract<MeasurementData, { type: "pattern" }> }) {
  const gainColor =
    data.gainDbi >= 0 ? "text-swr-excellent" : data.gainDbi >= -3 ? "text-swr-good" : "text-text-secondary";
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">Radiation Pattern</div>
      <div className={`text-sm font-bold ${gainColor}`}>
        {data.gainDbi.toFixed(2)} dBi
      </div>
      <div className="text-text-secondary">
        {"\u03B8"} {data.theta.toFixed(1)}{"\u00B0"} &nbsp; {"\u03C6"} {data.phi.toFixed(1)}{"\u00B0"}
      </div>
    </div>
  );
}

function WireInfo({ data }: { data: Extract<MeasurementData, { type: "wire" }> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">Wire #{data.tag}</div>
      <div className="text-text-primary">
        Length: <span className="font-bold">{data.lengthM.toFixed(3)} m</span>
      </div>
      <div className="text-text-secondary">
        Height: {data.zMin.toFixed(2)} &ndash; {data.zMax.toFixed(2)} m
      </div>
      <div className="text-text-secondary">
        Radius: {data.radiusMm.toFixed(2)} mm
      </div>
    </div>
  );
}

function CurrentInfo({ data }: { data: Extract<MeasurementData, { type: "current" }> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">Current (tag {data.tag}, seg {data.segment})</div>
      <div className="text-text-primary">
        |I| = <span className="font-bold text-swr-warning">{formatCurrent(data.magnitudeA)}</span>
      </div>
      <div className="text-text-secondary">
        Phase: {data.phaseDeg.toFixed(1)}{"\u00B0"}
      </div>
    </div>
  );
}

function NearFieldInfo({ data }: { data: Extract<MeasurementData, { type: "nearfield" }> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">Near Field</div>
      <div className="text-text-primary">
        |E| = <span className="font-bold text-accent">{data.fieldVm.toFixed(2)} V/m</span>
      </div>
      <div className="text-text-secondary">
        at ({data.x.toFixed(2)}, {data.y.toFixed(2)}) m &middot; h={data.heightM.toFixed(1)} m
      </div>
    </div>
  );
}

function formatCurrent(amps: number): string {
  if (amps >= 1) return `${amps.toFixed(3)} A`;
  if (amps >= 0.001) return `${(amps * 1000).toFixed(2)} mA`;
  return `${(amps * 1e6).toFixed(1)} \u00B5A`;
}
