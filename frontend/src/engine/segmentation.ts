/**
 * Auto-segmentation logic matching the backend's algorithm.
 * Ensures segments follow the lambda/10 rule for NEC2 accuracy.
 */

/**
 * Calculate the recommended number of segments for a wire.
 * Uses the lambda/10 rule: each segment should be <= wavelength/10.
 * Result is always odd (for center-feed compatibility).
 */
export function autoSegment(
  wireLengthM: number,
  maxFreqMhz: number,
  minSegs = 5
): number {
  const wavelength = 300.0 / maxFreqMhz;
  const segLength = wavelength / 10.0;
  let n = Math.max(minSegs, Math.ceil(wireLengthM / segLength));
  // Make odd for center feed
  if (n % 2 === 0) {
    n += 1;
  }
  return Math.min(n, 200);
}

/**
 * Calculate the center segment index for a wire (1-based, for NEC2 EX card).
 * NEC2 segments are 1-indexed.
 */
export function centerSegment(totalSegments: number): number {
  return Math.ceil(totalSegments / 2);
}
