import { describe, expect, it } from "vitest";
import {
  advanceWireMeasurementSelection,
  resolveWireMeasurementKeyboardAction,
} from "../wire-measurement-interaction";

describe("advanceWireMeasurementSelection", () => {
  it("selects two wires, deselects the first, and starts over after a result", () => {
    expect(advanceWireMeasurementSelection([], 3)).toEqual([3]);
    expect(advanceWireMeasurementSelection([3], 3)).toEqual([]);
    expect(advanceWireMeasurementSelection([3], 7)).toEqual([3, 7]);
    expect(advanceWireMeasurementSelection([3, 7], 9)).toEqual([9]);
  });
});

describe("resolveWireMeasurementKeyboardAction", () => {
  it("leaves all shortcuts with the editor outside measurement mode", () => {
    expect(resolveWireMeasurementKeyboardAction(false, "Delete")).toBe("editor");
    expect(resolveWireMeasurementKeyboardAction(false, "a")).toBe("editor");
  });

  it("blocks destructive and mode-changing shortcuts while measuring", () => {
    expect(resolveWireMeasurementKeyboardAction(true, "Delete")).toBe("ignore");
    expect(resolveWireMeasurementKeyboardAction(true, "Backspace")).toBe("ignore");
    expect(resolveWireMeasurementKeyboardAction(true, "a")).toBe("ignore");
    expect(resolveWireMeasurementKeyboardAction(true, "v")).toBe("ignore");
  });

  it("keeps Escape available to exit measurement mode", () => {
    expect(resolveWireMeasurementKeyboardAction(true, "Escape")).toBe(
      "exit-measurement",
    );
  });
});
