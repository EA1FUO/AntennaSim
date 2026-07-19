import {
  metersToMetricUnit,
  metricUnitToMeters,
} from "../units";

describe("metric editor units", () => {
  it("converts meters to centimeter and millimeter display values", () => {
    expect(metersToMetricUnit(0.125, "cm")).toBe(12.5);
    expect(metersToMetricUnit(0.125, "mm")).toBe(125);
  });

  it("converts edited display values back to canonical meters", () => {
    expect(metricUnitToMeters(12.5, "cm")).toBe(0.125);
    expect(metricUnitToMeters(125, "mm")).toBe(0.125);
  });
});
