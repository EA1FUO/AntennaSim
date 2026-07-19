import type { FrequencyRange, FrequencySegment } from "../templates/types";

/** Shared simulation boundaries used by templates, controls, and browser parsers. */
export const MIN_FREQUENCY_MHZ = 0.1;
export const MAX_FREQUENCY_MHZ = 2000;

export function clampFrequencyMhz(value: number): number {
  return Math.min(MAX_FREQUENCY_MHZ, Math.max(MIN_FREQUENCY_MHZ, value));
}

export function assertSupportedFrequencyMhz(
  value: number,
  label = "Frequency",
): void {
  if (
    !Number.isFinite(value) ||
    value < MIN_FREQUENCY_MHZ ||
    value > MAX_FREQUENCY_MHZ
  ) {
    throw new Error(
      `${label} must be between ${MIN_FREQUENCY_MHZ} and ${MAX_FREQUENCY_MHZ} MHz.`,
    );
  }
}

/** Validate both the fallback sweep and any multi-band segments. */
export function assertSupportedFrequencyRange(
  frequency: FrequencyRange,
  segments?: FrequencySegment[],
): void {
  assertSupportedFrequencyMhz(frequency.start_mhz, "Sweep start frequency");
  assertSupportedFrequencyMhz(frequency.stop_mhz, "Sweep stop frequency");
  for (const [index, segment] of (segments ?? []).entries()) {
    assertSupportedFrequencyMhz(
      segment.start_mhz,
      `Segment ${index + 1} start frequency`,
    );
    assertSupportedFrequencyMhz(
      segment.stop_mhz,
      `Segment ${index + 1} stop frequency`,
    );
  }
}
