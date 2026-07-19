import {
  assertSupportedFrequencyMhz,
  assertSupportedFrequencyRange,
  MAX_FREQUENCY_MHZ,
} from "../limits";

describe("simulation frequency limits", () => {
  it("accepts microwave amateur-band frequencies", () => {
    expect(() =>
      assertSupportedFrequencyRange(
        { start_mhz: 1240, stop_mhz: 1300, steps: 31 },
        [{ start_mhz: 1290, stop_mhz: 1298, steps: 11, label: "23cm" }],
      )
    ).not.toThrow();
  });

  it("provides a clear error above the supported range", () => {
    expect(() => assertSupportedFrequencyMhz(MAX_FREQUENCY_MHZ + 1)).toThrow(
      "between 0.1 and 2000 MHz",
    );
  });

  it("validates every multi-band segment", () => {
    expect(() =>
      assertSupportedFrequencyRange(
        { start_mhz: 14, stop_mhz: 14.35, steps: 11 },
        [{ start_mhz: 2390, stop_mhz: 2450, steps: 11 }],
      )
    ).toThrow("Segment 1 start frequency");
  });
});
