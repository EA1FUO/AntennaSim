/**
 * Ham band preset buttons — a row of pills for quick frequency selection.
 *
 * Filters bands to those relevant to the current frequency range
 * and highlights the band that matches the current sweep.
 */

import { useMemo } from "react";
import { getBandsForRegion, bandToFrequencyRange } from "../../utils/ham-bands";
import type { HamBand } from "../../utils/ham-bands";
import type { FrequencyRange } from "../../templates/types";

interface BandPresetsProps {
  /** Current frequency range (to highlight matching band) */
  currentRange: FrequencyRange;
  /** Called when user clicks a band */
  onSelectBand: (range: FrequencyRange, band: HamBand) => void;
  /** ITU region for band selection */
  region?: "r1" | "r2" | "r3";
  /** Only show HF bands (< 30 MHz) */
  hfOnly?: boolean;
}

export function BandPresets({
  currentRange,
  onSelectBand,
  region = "r1",
  hfOnly = false,
}: BandPresetsProps) {
  const bands = useMemo(() => {
    let b = getBandsForRegion(region);
    if (hfOnly) {
      b = b.filter((band) => band.stop_mhz <= 30);
    }
    return b;
  }, [region, hfOnly]);

  // Determine which band is currently "active" (matches the sweep range)
  const activeBand = useMemo(() => {
    for (const band of bands) {
      if (
        Math.abs(currentRange.start_mhz - band.start_mhz) < 0.01 &&
        Math.abs(currentRange.stop_mhz - band.stop_mhz) < 0.01
      ) {
        return band.label + band.region;
      }
    }
    return null;
  }, [bands, currentRange]);

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Band Presets
      </h3>
      <div className="flex flex-wrap gap-1 px-1">
        {bands.map((band) => {
          const key = band.label + band.region;
          const isActive = activeBand === key;
          return (
            <button
              key={key}
              onClick={() => onSelectBand(bandToFrequencyRange(band), band)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
                isActive
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-text-secondary border-border hover:border-accent/50 hover:text-text-primary"
              }`}
            >
              {band.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
