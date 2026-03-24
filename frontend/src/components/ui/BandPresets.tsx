/**
 * Ham band preset buttons — a row of pills for quick frequency selection.
 *
 * Interaction:
 * - Click: toggle band as a frequency segment (multi-band sweep)
 * - Ctrl+click (desktop) / long-press (mobile): change antenna design
 *   frequency and set single-band sweep
 */

import { useMemo, useCallback, useRef } from "react";
import { getBandsForRegion, bandToFrequencyRange, hasBandSegment } from "../../utils/ham-bands";
import type { HamBand } from "../../utils/ham-bands";
import type { FrequencyRange, FrequencySegment } from "../../templates/types";

/** Long-press threshold in ms */
const LONG_PRESS_MS = 500;

interface BandPresetsProps {
  /** Current frequency range (to highlight matching band when no segments) */
  currentRange: FrequencyRange;
  /** Called on Ctrl+click / long-press — changes antenna + single sweep */
  onSelectBand: (range: FrequencyRange, band: HamBand) => void;
  /** ITU region for band selection */
  region?: "r1" | "r2" | "r3";
  /** Only show HF bands (< 30 MHz) */
  hfOnly?: boolean;
  /** Active frequency segments */
  segments?: FrequencySegment[];
  /** Called on regular click — toggles band as segment */
  onToggleBand?: (band: HamBand) => void;
}

export function BandPresets({
  currentRange,
  onSelectBand,
  region = "r1",
  hfOnly = false,
  segments = [],
  onToggleBand,
}: BandPresetsProps) {
  const bands = useMemo(() => {
    let b = getBandsForRegion(region);
    if (hfOnly) {
      b = b.filter((band) => band.stop_mhz <= 30);
    }
    return b;
  }, [region, hfOnly]);

  // Which band matches the single frequencyRange (shown when no segments)
  const singleBandKey = useMemo(() => {
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

  // Set of band keys that are active as segments
  const activeSegmentKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const band of bands) {
      if (hasBandSegment(segments, band)) {
        keys.add(band.label + band.region);
      }
    }
    return keys;
  }, [bands, segments]);

  // --- Long-press support for mobile ---
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handlePointerDown = useCallback(
    (band: HamBand) => {
      longPressFired.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onSelectBand(bandToFrequencyRange(band), band);
      }, LONG_PRESS_MS);
    },
    [onSelectBand],
  );

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent, band: HamBand) => {
      // If long-press already fired, ignore the click
      if (longPressFired.current) {
        longPressFired.current = false;
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+click: change antenna + single sweep
        onSelectBand(bandToFrequencyRange(band), band);
      } else if (onToggleBand) {
        // Regular click: toggle as segment
        onToggleBand(band);
      }
    },
    [onSelectBand, onToggleBand],
  );

  const hasSegments = segments.length > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-1">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Band Sweep Presets
        </h3>
        {hasSegments && (
          <span className="text-[10px] text-accent">
            {segments.length} band{segments.length !== 1 ? "s" : ""}
          </span>
        )}
        <span
          className="text-[10px] text-text-secondary/60 cursor-help ml-auto"
          title="Click: add/remove band segment. Ctrl+click (long-press on mobile): switch antenna to this band."
        >
          ?
        </span>
      </div>
      <div className="flex flex-wrap gap-1 px-1">
        {bands.map((band) => {
          const key = band.label + band.region;
          const isSegmentActive = activeSegmentKeys.has(key);
          const isSingleActive = !hasSegments && singleBandKey === key;
          const isActive = isSegmentActive || isSingleActive;
          return (
            <button
              key={key}
              onClick={(e) => handleClick(e, band)}
              onPointerDown={() => handlePointerDown(band)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(e) => e.preventDefault()}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors select-none ${
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
