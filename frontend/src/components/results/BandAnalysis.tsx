/**
 * Multi-band performance analysis table.
 *
 * Shows per-band SWR, gain, and usable bandwidth for all HF ham bands
 * that have simulation data. Uses the analyzeBandPerformance utility.
 */

import { useMemo } from "react";
import { analyzeBandPerformance } from "../../utils/ham-bands";
import type { BandPerformance } from "../../utils/ham-bands";
import type { FrequencyResult } from "../../api/nec";

interface BandAnalysisProps {
  data: FrequencyResult[];
  region?: "r1" | "r2" | "r3";
}

const QUALITY_STYLES: Record<BandPerformance["quality"], { bg: string; text: string; label: string }> = {
  excellent:      { bg: "bg-swr-good/15", text: "text-swr-good", label: "Excellent" },
  good:           { bg: "bg-swr-ok/15", text: "text-swr-ok", label: "Good" },
  marginal:       { bg: "bg-swr-warning/15", text: "text-swr-warning", label: "Marginal" },
  poor:           { bg: "bg-swr-bad/15", text: "text-swr-bad", label: "Poor" },
  not_simulated:  { bg: "bg-surface", text: "text-text-secondary", label: "No data" },
};

export function BandAnalysis({ data, region = "r1" }: BandAnalysisProps) {
  const bands = useMemo(
    () => analyzeBandPerformance(data, region).filter((b) => b.band.stop_mhz <= 30),
    [data, region]
  );

  // Separate simulated vs not
  const simulated = bands.filter((b) => b.simulated);
  const notSimulated = bands.filter((b) => !b.simulated);

  if (simulated.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-text-secondary">
          No ham band data in the current sweep range.
        </p>
        <p className="text-[10px] text-text-secondary mt-1">
          Expand the frequency sweep to cover 1.8-30 MHz for a full HF analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Results table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="text-text-secondary text-left">
              <th className="py-1 pr-2 font-semibold">Band</th>
              <th className="py-1 pr-2 font-semibold text-right">Min SWR</th>
              <th className="py-1 pr-2 font-semibold text-right">@ MHz</th>
              <th className="py-1 pr-2 font-semibold text-right">BW (kHz)</th>
              <th className="py-1 pr-2 font-semibold text-right">Gain</th>
              <th className="py-1 font-semibold">Rating</th>
            </tr>
          </thead>
          <tbody>
            {simulated.map((bp) => {
              const style = QUALITY_STYLES[bp.quality];
              return (
                <tr
                  key={bp.band.label + bp.band.region}
                  className={`${style.bg} border-t border-border/50`}
                >
                  <td className="py-1 pr-2 text-text-primary font-medium">
                    {bp.band.label}
                  </td>
                  <td className={`py-1 pr-2 text-right ${style.text}`}>
                    {bp.minSwr?.toFixed(2) ?? "-"}
                  </td>
                  <td className="py-1 pr-2 text-right text-text-secondary">
                    {bp.minSwrFreqMhz?.toFixed(3) ?? "-"}
                  </td>
                  <td className="py-1 pr-2 text-right text-text-secondary">
                    {bp.usableBandwidthKhz != null ? bp.usableBandwidthKhz : "-"}
                  </td>
                  <td className="py-1 pr-2 text-right text-text-primary">
                    {bp.peakGainDbi != null ? `${bp.peakGainDbi.toFixed(1)}` : "-"}
                  </td>
                  <td className={`py-1 ${style.text} font-medium`}>
                    {style.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Not simulated bands */}
      {notSimulated.length > 0 && (
        <p className="text-[10px] text-text-secondary px-0.5">
          Not in sweep: {notSimulated.map((b) => b.band.label).join(", ")}
        </p>
      )}
    </div>
  );
}
