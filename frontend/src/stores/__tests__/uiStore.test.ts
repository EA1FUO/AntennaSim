import { useUIStore } from "../uiStore";

describe("UI length-unit preferences", () => {
  beforeEach(() => {
    useUIStore.setState({
      imperial: false,
      metricLengthUnit: "m",
      imperialLengthUnit: "ft",
    });
  });

  it("keeps a preferred unit for each measurement system", () => {
    useUIStore.getState().setLengthUnit("cm");
    useUIStore.getState().setLengthUnit("in");

    expect(useUIStore.getState().metricLengthUnit).toBe("cm");
    expect(useUIStore.getState().imperialLengthUnit).toBe("in");
  });

  it("switches systems without replacing either preferred unit", () => {
    useUIStore.getState().setLengthUnit("mm");
    useUIStore.getState().toggleUnits();

    expect(useUIStore.getState().imperial).toBe(true);
    expect(useUIStore.getState().metricLengthUnit).toBe("mm");
    expect(useUIStore.getState().imperialLengthUnit).toBe("ft");
  });
});

describe("UI changelog dialog", () => {
  beforeEach(() => {
    useUIStore.setState({ changelogOpen: false });
  });

  it("can be reopened and closed from shared navigation state", () => {
    useUIStore.getState().openChangelog();
    expect(useUIStore.getState().changelogOpen).toBe(true);

    useUIStore.getState().closeChangelog();
    expect(useUIStore.getState().changelogOpen).toBe(false);
  });
});
