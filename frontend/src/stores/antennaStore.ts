/**
 * Antenna state store — template selection, parameters, generated geometry.
 *
 * This is the primary store for the antenna editor. It holds the selected
 * template, parameter values, and the derived wire geometry / excitation
 * that gets sent to the 3D viewport and simulation API.
 */

import { create } from "zustand";
import type {
  AntennaTemplate,
  GroundConfig,
  WireGeometry,
  Excitation,
  FrequencyRange,
} from "../templates/types";
import { getDefaultParams } from "../templates/types";
import { getDefaultTemplate } from "../templates";
import type { WireData, FeedpointData } from "../components/three/types";
import { wireGeometryToWireData } from "../templates/types";

interface AntennaState {
  /** Currently selected template */
  template: AntennaTemplate;
  /** Current parameter values */
  params: Record<string, number>;
  /** Ground configuration */
  ground: GroundConfig;

  // Derived geometry (computed from template + params)
  /** NEC2 wire geometry for simulation */
  wireGeometry: WireGeometry[];
  /** Excitation source */
  excitation: Excitation;
  /** Wire data for 3D viewport */
  wireData: WireData[];
  /** Feedpoint data for 3D viewport */
  feedpoints: FeedpointData[];
  /** Default frequency range */
  frequencyRange: FrequencyRange;

  // Actions
  /** Set the active template (resets params to defaults) */
  setTemplate: (template: AntennaTemplate) => void;
  /** Update a single parameter value */
  setParam: (key: string, value: number) => void;
  /** Update multiple parameter values at once */
  setParams: (params: Record<string, number>) => void;
  /** Set ground configuration */
  setGround: (ground: GroundConfig) => void;
  /** Recompute derived geometry from current template + params */
  recompute: () => void;
}

/** Compute all derived state from template + params */
function computeDerived(template: AntennaTemplate, params: Record<string, number>) {
  const wireGeometry = template.generateGeometry(params);
  const excitation = template.generateExcitation(params, wireGeometry);
  const wireData = wireGeometryToWireData(wireGeometry);
  const feedpoints = template.generateFeedpoints(params, wireGeometry);
  const frequencyRange = template.defaultFrequencyRange(params);

  return { wireGeometry, excitation, wireData, feedpoints, frequencyRange };
}

export const useAntennaStore = create<AntennaState>((set, get) => {
  const defaultTemplate = getDefaultTemplate();
  const defaultParams = getDefaultParams(defaultTemplate);
  const derived = computeDerived(defaultTemplate, defaultParams);

  return {
    template: defaultTemplate,
    params: defaultParams,
    ground: { ...defaultTemplate.defaultGround },
    ...derived,

    setTemplate: (template) => {
      const params = getDefaultParams(template);
      const derived = computeDerived(template, params);
      set({
        template,
        params,
        ground: { ...template.defaultGround },
        ...derived,
      });
    },

    setParam: (key, value) => {
      const state = get();
      const newParams = { ...state.params, [key]: value };
      const derived = computeDerived(state.template, newParams);
      set({ params: newParams, ...derived });
    },

    setParams: (params) => {
      const state = get();
      const newParams = { ...state.params, ...params };
      const derived = computeDerived(state.template, newParams);
      set({ params: newParams, ...derived });
    },

    setGround: (ground) => {
      set({ ground });
    },

    recompute: () => {
      const state = get();
      const derived = computeDerived(state.template, state.params);
      set(derived);
    },
  };
});
