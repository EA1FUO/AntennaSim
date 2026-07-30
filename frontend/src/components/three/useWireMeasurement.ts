import { useCallback, useState } from "react";
import { advanceWireMeasurementSelection } from "../../utils/wire-measurement";

export interface WireMeasurementController {
  active: boolean;
  selectedTags: readonly number[];
  toggle: () => void;
  selectWire: (tag: number) => void;
  clear: () => void;
}

/** Shared interaction state for the Simulator and Editor measurement tools. */
export function useWireMeasurement(): WireMeasurementController {
  const [active, setActive] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);

  const toggle = useCallback(() => {
    setActive((current) => !current);
    setSelectedTags([]);
  }, []);

  const selectWire = useCallback((tag: number) => {
    setSelectedTags((current) =>
      advanceWireMeasurementSelection(current, tag),
    );
  }, []);

  const clear = useCallback(() => setSelectedTags([]), []);

  return { active, selectedTags, toggle, selectWire, clear };
}
