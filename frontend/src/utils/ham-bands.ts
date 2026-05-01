/**
 * Amateur radio band definitions and analysis utilities.
 *
 * Band data is loaded from shared/ham-bands.json — the single source of truth
 * consumed by both this TypeScript module and the Python MCP server.
 */

import type { FrequencyRange, FrequencySegment } from "../templates/types";
import type { FrequencyResult } from "../api/nec";
import rawBandsData from "../../../shared/ham-bands.json";

// ---------------------------------------------------------------------------
// Band definitions
// ---------------------------------------------------------------------------

export interface HamBand {
  /** Short label: "40m", "20m", etc. */
  label: string;
  /** Full name: "40 meters" */
  name: string;
  /** Lower band edge in MHz */
  start_mhz: number;
  /** Upper band edge in MHz */
  stop_mhz: number;
  /** Center frequency in MHz */
  center_mhz: number;
  /** ITU region: "all" = worldwide, "r1" = Europe/Africa, "r2" = Americas, "r3" = Asia/Pacific */
  region: "all" | "r1" | "r2" | "r3";
}

// Type of the raw JSON entries (region is widened to string by JSON import)
interface RawHamBand {
  label: string;
  name: string;
  start_mhz: number;
  stop_mhz: number;
  center_mhz: number;
  region: string;
}

/**
 * Standard amateur radio HF/VHF/UHF bands.
 *
 * Loaded from shared/ham-bands.json — both Python (MCP server) and TypeScript
 * consume the same file, so changes need to be made in only one place.
 *
 * For bands where Region 1/2/3 allocations differ (80m, 40m), the JSON
 * contains separate entries for each region.
 */
export const HAM_BANDS: HamBand[] = (rawBandsData as RawHamBand[]).map((b) => ({
  label: b.label,
  name: b.name,
  start_mhz: b.start_mhz,
  stop_mhz: b.stop_mhz,
  center_mhz: b.center_mhz,
  region: b.region as HamBand["region"],
}));

/**
 * Get bands for a specific ITU region.
 * Returns bands where region matches or is "all".
 * For bands with region-specific variants (80m, 40m), only the matching variant is returned.
 */
export function getBandsForRegion(region: "r1" | "r2" | "r3" = "r1"): HamBand[] {
  return HAM_BANDS.filter((b) => b.region === "all" || b.region === region);
}

/**
 * Get the band-edge-only list used by SWRChart for marking band edges.
 * Returns one entry per unique label (no duplicates from region variants).
 */
export function getBandEdges(region: "r1" | "r2" | "r3" = "r1"): Array<{ name: string; start: number; end: number }> {
  return getBandsForRegion(region).map((b) => ({
    name: b.label,
    start: b.start_mhz,
    end: b.stop_mhz,
  }));
}

// ---------------------------------------------------------------------------
// Frequency range from band
// ---------------------------------------------------------------------------

/**
 * Compute a sensible number of sweep steps for a given frequency range.
 *
 * Uses ~25 points per MHz of bandwidth, clamped to [21, 101].
 */
export function computeSteps(startMhz: number, stopMhz: number): number {
  const bw = Math.abs(stopMhz - startMhz);
  return Math.max(21, Math.min(101, Math.round(bw * 25) + 1));
}

/**
 * Create a FrequencyRange from a ham band.
 * Steps are computed automatically from the bandwidth.
 */
export function bandToFrequencyRange(band: HamBand): FrequencyRange {
  return {
    start_mhz: band.start_mhz,
    stop_mhz: band.stop_mhz,
    steps: computeSteps(band.start_mhz, band.stop_mhz),
  };
}

// ---------------------------------------------------------------------------
// Multi-segment helpers
// ---------------------------------------------------------------------------

/** Convert a HamBand to a FrequencySegment */
export function bandToSegment(band: HamBand): FrequencySegment {
  return {
    start_mhz: band.start_mhz,
    stop_mhz: band.stop_mhz,
    steps: computeSteps(band.start_mhz, band.stop_mhz),
    label: band.label,
  };
}

/** Check if a segment matches a band's frequency range */
function segmentMatchesBand(seg: FrequencySegment, band: HamBand): boolean {
  return (
    Math.abs(seg.start_mhz - band.start_mhz) < 0.01 &&
    Math.abs(seg.stop_mhz - band.stop_mhz) < 0.01
  );
}

/** Check if a band already exists in the segments list */
export function hasBandSegment(segments: FrequencySegment[], band: HamBand): boolean {
  return segments.some((seg) => segmentMatchesBand(seg, band));
}

/** Remove a band's segment from the list */
export function removeBandSegment(segments: FrequencySegment[], band: HamBand): FrequencySegment[] {
  return segments.filter((seg) => !segmentMatchesBand(seg, band));
}

// ---------------------------------------------------------------------------
// Band performance analysis
// ---------------------------------------------------------------------------

export interface BandPerformance {
  band: HamBand;
  simulated: boolean;
  pointCount: number;
  minSwr: number | null;
  minSwrFreqMhz: number | null;
  usableBandwidthKhz: number | null;
  avgGainDbi: number | null;
  peakGainDbi: number | null;
  quality: "excellent" | "good" | "marginal" | "poor" | "not_simulated";
}

/**
 * Analyze simulation results across all ham bands for a given region.
 */
export function analyzeBandPerformance(
  results: FrequencyResult[],
  region: "r1" | "r2" | "r3" = "r1",
  swrThreshold: number = 2.0,
): BandPerformance[] {
  const bands = getBandsForRegion(region);

  return bands.map((band) => {
    const inBand = results.filter(
      (r) => r.frequency_mhz >= band.start_mhz && r.frequency_mhz <= band.stop_mhz,
    );

    if (inBand.length === 0) {
      return {
        band,
        simulated: false,
        pointCount: 0,
        minSwr: null,
        minSwrFreqMhz: null,
        usableBandwidthKhz: null,
        avgGainDbi: null,
        peakGainDbi: null,
        quality: "not_simulated" as const,
      };
    }

    let minSwr = Infinity;
    let minSwrFreq = 0;
    for (const r of inBand) {
      if (r.swr_50 < minSwr) {
        minSwr = r.swr_50;
        minSwrFreq = r.frequency_mhz;
      }
    }

    const usable = inBand.filter((r) => r.swr_50 <= swrThreshold);
    let usableBwKhz: number | null = null;
    if (usable.length > 0) {
      const minFreq = Math.min(...usable.map((r) => r.frequency_mhz));
      const maxFreq = Math.max(...usable.map((r) => r.frequency_mhz));
      usableBwKhz = Math.round((maxFreq - minFreq) * 1000);
    }

    const gains = inBand.map((r) => r.gain_max_dbi).filter((g) => g > -999);
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
    const peakGain = gains.length > 0 ? Math.max(...gains) : null;

    let quality: BandPerformance["quality"];
    if (minSwr <= 1.5) {
      quality = "excellent";
    } else if (minSwr <= 2.0) {
      quality = "good";
    } else if (minSwr <= 3.0) {
      quality = "marginal";
    } else {
      quality = "poor";
    }

    return {
      band,
      simulated: true,
      pointCount: inBand.length,
      minSwr: Math.round(minSwr * 100) / 100,
      minSwrFreqMhz: Math.round(minSwrFreq * 1000) / 1000,
      usableBandwidthKhz: usableBwKhz,
      avgGainDbi: avgGain !== null ? Math.round(avgGain * 100) / 100 : null,
      peakGainDbi: peakGain !== null ? Math.round(peakGain * 100) / 100 : null,
      quality,
    };
  });
}