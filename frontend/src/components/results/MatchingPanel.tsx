/**
 * Matching network calculator UI panel.
 *
 * Shows topology selection, calculated component values,
 * and a schematic diagram for the matching network.
 */

import { useMemo, useState } from "react";
import { calculateMatching } from "../../engine/matching";
import type { MatchingTopology, MatchingSolution, MatchingComponent } from "../../engine/matching";
import type { FrequencyResult } from "../../api/nec";

interface MatchingPanelProps {
  /** The frequency result to match at */
  data: FrequencyResult;
}

function ComponentRow({ comp }: { comp: MatchingComponent }) {
  const value =
    comp.type === "inductor"
      ? `${comp.inductance_nh} nH`
      : `${comp.capacitance_pf} pF`;

  const symbol = comp.type === "inductor" ? "L" : "C";
  const posLabel = comp.position === "series" ? "Series" : "Shunt";

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-text-secondary">
        {posLabel} {symbol}
      </span>
      <span className="text-[11px] font-mono text-text-primary">{value}</span>
    </div>
  );
}

function SolutionCard({ solution, index }: { solution: MatchingSolution; index: number }) {
  return (
    <div className="bg-background rounded-md p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-text-secondary uppercase">
          {solution.topology}-network {index > 0 ? `(variant ${index + 1})` : ""}
        </span>
        <span className="text-[10px] text-accent font-mono">
          Q={solution.q}
        </span>
      </div>

      {/* Component values */}
      <div className="space-y-0.5">
        {solution.components.map((comp, i) => (
          <ComponentRow key={i} comp={comp} />
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px] text-text-secondary pt-1 border-t border-border/50">
        <span>BW: {solution.bandwidth_mhz} MHz</span>
        <span>Loss: {solution.insertion_loss_db} dB</span>
      </div>

      {/* Simple schematic */}
      <Schematic components={solution.components} />
    </div>
  );
}

function Schematic({ components }: { components: MatchingComponent[] }) {
  // Simple text-based schematic
  return (
    <div className="bg-surface rounded p-1.5 text-[9px] font-mono text-text-secondary overflow-x-auto">
      <div className="flex items-center gap-0.5 min-w-0">
        <span className="text-accent shrink-0">50R</span>
        <span className="shrink-0">--</span>
        {components.map((comp, i) => {
          const symbol = comp.type === "inductor" ? "L" : "C";
          const value =
            comp.type === "inductor"
              ? `${comp.inductance_nh}nH`
              : `${comp.capacitance_pf}pF`;

          if (comp.position === "series") {
            return (
              <span key={i} className="shrink-0">
                --[{symbol}: {value}]--
              </span>
            );
          } else {
            return (
              <span key={i} className="shrink-0 flex flex-col items-center leading-none">
                <span>--+--</span>
                <span className="text-[8px]">{symbol}:{value}</span>
                <span>GND</span>
              </span>
            );
          }
        })}
        <span className="shrink-0">--</span>
        <span className="text-swr-warning shrink-0">Z_L</span>
      </div>
    </div>
  );
}

export function MatchingPanel({ data }: MatchingPanelProps) {
  const [topology, setTopology] = useState<MatchingTopology>("L");

  const load = useMemo(
    () => ({ real: data.impedance.real, imag: data.impedance.imag }),
    [data.impedance]
  );

  const solutions = useMemo(
    () =>
      calculateMatching({
        load,
        target: { real: 50, imag: 0 },
        frequency_mhz: data.frequency_mhz,
        topology,
      }),
    [load, data.frequency_mhz, topology]
  );

  return (
    <div className="space-y-2">
      {/* Load impedance summary */}
      <div className="bg-background rounded-md p-2">
        <p className="text-[10px] text-text-secondary">
          Load at {data.frequency_mhz.toFixed(3)} MHz
        </p>
        <p className="text-sm font-mono text-text-primary">
          {data.impedance.real.toFixed(1)} {data.impedance.imag >= 0 ? "+" : "-"} j{Math.abs(data.impedance.imag).toFixed(1)} ohm
        </p>
      </div>

      {/* Topology selector */}
      <div className="flex items-center gap-1">
        {(["L", "Pi", "T"] as MatchingTopology[]).map((t) => (
          <button
            key={t}
            onClick={() => setTopology(t)}
            className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors ${
              topology === t
                ? "bg-accent text-white border-accent"
                : "bg-surface text-text-secondary border-border hover:border-accent/50"
            }`}
          >
            {t}-net
          </button>
        ))}
      </div>

      {/* Solutions */}
      {solutions.length === 0 ? (
        <p className="text-[10px] text-text-secondary text-center py-2">
          No {topology}-network solution found for this impedance.
        </p>
      ) : (
        <div className="space-y-2">
          {solutions.map((sol, i) => (
            <SolutionCard key={i} solution={sol} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
