export type WireMeasurementKeyboardAction =
  | "editor"
  | "exit-measurement"
  | "ignore";

/** Advance the tap/click selection used by the measurement tool. */
export function advanceWireMeasurementSelection(
  selectedTags: readonly number[],
  tag: number,
): number[] {
  if (selectedTags.length === 0) return [tag];
  if (selectedTags.length === 1) {
    return selectedTags[0] === tag ? [] : [selectedTags[0]!, tag];
  }
  return [tag];
}

/**
 * Isolate editor shortcuts while measurement mode owns viewport interaction.
 * Escape remains available as the single keyboard exit from measurement mode.
 */
export function resolveWireMeasurementKeyboardAction(
  measurementActive: boolean,
  key: string,
): WireMeasurementKeyboardAction {
  if (!measurementActive) return "editor";
  return key === "Escape" ? "exit-measurement" : "ignore";
}
