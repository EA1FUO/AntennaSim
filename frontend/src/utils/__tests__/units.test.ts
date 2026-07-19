import {
  lengthUnitToMeters,
  metersToLengthUnit,
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

  it("supports the imperial choices exposed by the global unit mode", () => {
    expect(metersToLengthUnit(1, "ft")).toBeCloseTo(3.28084, 5);
    expect(metersToLengthUnit(1, "in")).toBeCloseTo(39.37008, 5);
    expect(lengthUnitToMeters(12, "in")).toBeCloseTo(0.3048, 5);
  });
});
