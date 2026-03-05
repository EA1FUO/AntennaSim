/**
 * Amateur radio band definitions and analysis utilities.
 *
 * Band allocations follow ITU Region 1 (IARU Region 1) defaults,
 * with Region 2/3 variants for bands where allocations differ.
 */

import type { FrequencyRange, FrequencySegment } from "../templates/types";
import type { FrequencyResult } from "../api/nec";

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

/**
 * Standard amateur radio HF/VHF/UHF bands.
 *
 * For bands where Region 1/2/3 allocations differ (80m, 40m),
 * we provide the widest common allocation plus region-specific variants.
 */
export const HAM_BANDS: HamBand[] = [
  { label: "160m", name: "160 meters", start_mhz: 1.800, stop_mhz: 2.000, center_mhz: 1.900, region: "all" },
  { label: "80m",  name: "80 meters",  start_mhz: 3.500, stop_mhz: 3.800, center_mhz: 3.650, region: "r1" },
  { label: "80m",  name: "80 meters",  start_mhz: 3.500, stop_mhz: 4.000, center_mhz: 3.750, region: "r2" },
  { label: "60m",  name: "60 meters",  start_mhz: 5.3515, stop_mhz: 5.3665, center_mhz: 5.359, region: "all" },
  { label: "40m",  name: "40 meters",  start_mhz: 7.000, stop_mhz: 7.200, center_mhz: 7.100, region: "r1" },
  { label: "40m",  name: "40 meters",  start_mhz: 7.000, stop_mhz: 7.300, center_mhz: 7.150, region: "r2" },
  { label: "30m",  name: "30 meters",  start_mhz: 10.100, stop_mhz: 10.150, center_mhz: 10.125, region: "all" },
  { label: "20m",  name: "20 meters",  start_mhz: 14.000, stop_mhz: 14.350, center_mhz: 14.175, region: "all" },
  { label: "17m",  name: "17 meters",  start_mhz: 18.068, stop_mhz: 18.168, center_mhz: 18.118, region: "all" },
  { label: "15m",  name: "15 meters",  start_mhz: 21.000, stop_mhz: 21.450, center_mhz: 21.225, region: "all" },
  { label: "12m",  name: "12 meters",  start_mhz: 24.890, stop_mhz: 24.990, center_mhz: 24.940, region: "all" },
  { label: "10m",  name: "10 meters",  start_mhz: 28.000, stop_mhz: 29.700, center_mhz: 28.850, region: "all" },
  { label: "6m",   name: "6 meters",   start_mhz: 50.000, stop_mhz: 54.000, center_mhz: 52.000, region: "all" },
  { label: "2m",   name: "2 meters",   start_mhz: 144.000, stop_mhz: 148.000, center_mhz: 146.000, region: "all" },
  { label: "70cm", name: "70 cm",      start_mhz: 420.000, stop_mhz: 450.000, center_mhz: 435.000, region: "all" },
];

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
 * Uses ~25 points per MHz of bandwidth, clamped to [11, 101].
 * This ensures narrow bands (e.g. 60m, 50 kHz wide) still get enough
 * resolution to find SWR dips, while wide sweeps (e.g. 6m, 4 MHz)
 * don't generate unnecessarily large simulations.
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
  /** The band being analyzed */
  band: HamBand;
  /** Whether any simulation data falls within this band */
  simulated: boolean;
  /** Number of frequency points in this band */
  pointCount: number;
  /** Minimum SWR found in band */
  minSwr: number | null;
  /** Frequency of minimum SWR */
  minSwrFreqMhz: number | null;
  /** Usable bandwidth in kHz (frequency range where SWR < threshold) */
  usableBandwidthKhz: number | null;
  /** Average gain across the band */
  avgGainDbi: number | null;
  /** Peak gain in the band */
  peakGainDbi: number | null;
  /** Quality rating */
  quality: "excellent" | "good" | "marginal" | "poor" | "not_simulated";
}

/**
 * Analyze simulation results across all ham bands for a given region.
 *
 * @param results - Array of FrequencyResult from a simulation
 * @param region - ITU region for band selection
 * @param swrThreshold - SWR threshold for "usable" bandwidth (default 2.0)
 */
export function analyzeBandPerformance(
  results: FrequencyResult[],
  region: "r1" | "r2" | "r3" = "r1",
  swrThreshold: number = 2.0,
): BandPerformance[] {
  const bands = getBandsForRegion(region);

  return bands.map((band) => {
    // Find all frequency results within this band
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

    // Min SWR
    let minSwr = Infinity;
    let minSwrFreq = 0;
    for (const r of inBand) {
      if (r.swr_50 < minSwr) {
        minSwr = r.swr_50;
        minSwrFreq = r.frequency_mhz;
      }
    }

    // Usable bandwidth (contiguous range where SWR < threshold)
    const usable = inBand.filter((r) => r.swr_50 <= swrThreshold);
    let usableBwKhz: number | null = null;
    if (usable.length > 0) {
      const minFreq = Math.min(...usable.map((r) => r.frequency_mhz));
      const maxFreq = Math.max(...usable.map((r) => r.frequency_mhz));
      usableBwKhz = Math.round((maxFreq - minFreq) * 1000);
    }

    // Gain statistics
    const gains = inBand
      .map((r) => r.gain_max_dbi)
      .filter((g) => g > -999);
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
    const peakGain = gains.length > 0 ? Math.max(...gains) : null;

    // Quality rating
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
