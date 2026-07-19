import { parseMaa } from "../maa-import";

function maaAtFrequency(frequencyMhz: number): string {
  return [
    "High-frequency dipole",
    "1 0 1",
    "0 0 0 0.1 0 0 0.0005 11",
    "1 6 1 0",
    String(frequencyMhz),
  ].join("\n");
}

describe("MMANA-GAL frequency import", () => {
  it("preserves frequencies above the former 500 MHz limit", () => {
    const result = parseMaa(maaAtFrequency(1296));

    expect(result.frequency_start_mhz).toBe(1296);
    expect(result.frequency_stop_mhz).toBe(1296);
  });

  it("ignores frequencies beyond the supported 2 GHz range", () => {
    const result = parseMaa(maaAtFrequency(2400));

    expect(result.frequency_start_mhz).toBe(14);
    expect(result.frequency_stop_mhz).toBe(14);
  });
});
