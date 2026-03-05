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
  FrequencySegment,
} from "../templates/types";
import { getDefaultParams } from "../templates/types";
import { getDefaultTemplate } from "../templates";
import { computeSteps } from "../utils/ham-bands";
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
  /** Multi-segment frequency sweep (empty = use single frequencyRange) */
  frequencySegments: FrequencySegment[];
  /**
   * When true, setParam/setParams will NOT overwrite frequencyRange with the
   * template-derived default. Set by setFrequencyRange, cleared by setTemplate.
   */
  _frequencyOverride: boolean;

  // Actions
  /** Set the active template (resets params to defaults) */
  setTemplate: (template: AntennaTemplate) => void;
  /** Update a single parameter value */
  setParam: (key: string, value: number) => void;
  /** Update multiple parameter values at once */
  setParams: (params: Record<string, number>) => void;
  /** Set ground configuration */
  setGround: (ground: GroundConfig) => void;
  /** Override the frequency range (e.g. from band presets or sweep controls) */
  setFrequencyRange: (range: FrequencyRange) => void;
  /** Set all frequency segments at once */
  setFrequencySegments: (segments: FrequencySegment[]) => void;
  /** Add a frequency segment */
  addFrequencySegment: (segment: FrequencySegment) => void;
  /** Remove a frequency segment by index */
  removeFrequencySegment: (index: number) => void;
  /** Update a frequency segment at a specific index */
  updateFrequencySegment: (index: number, segment: FrequencySegment) => void;
  /** Clear all frequency segments (revert to single sweep) */
  clearFrequencySegments: () => void;
  /** Recompute derived geometry from current template + params */
  recompute: () => void;
}

/** Compute all derived state from template + params */
function computeDerived(template: AntennaTemplate, params: Record<string, number>) {
  const wireGeometry = template.generateGeometry(params);
  const excitation = template.generateExcitation(params, wireGeometry);
  const wireData = wireGeometryToWireData(wireGeometry);
  const feedpoints = template.generateFeedpoints(params, wireGeometry);
  const templateRange = template.defaultFrequencyRange(params);
  // Override template's hardcoded steps with adaptive computation
  const frequencyRange: FrequencyRange = {
    ...templateRange,
    steps: computeSteps(templateRange.start_mhz, templateRange.stop_mhz),
  };

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
    frequencySegments: [],
    _frequencyOverride: false,
    ...derived,

    setTemplate: (template) => {
      const params = getDefaultParams(template);
      const derived = computeDerived(template, params);
      set({
        template,
        params,
        ground: { ...template.defaultGround },
        frequencySegments: [],
        _frequencyOverride: false,
        ...derived,
      });
    },

    setParam: (key, value) => {
      const state = get();
      const newParams = { ...state.params, [key]: value };
      const derived = computeDerived(state.template, newParams);
      // If user has explicitly set frequency range (band preset, sweep controls),
      // don't let the template-derived range overwrite it.
      if (state._frequencyOverride) {
        const { frequencyRange: _ignored, ...rest } = derived;
        void _ignored;
        set({ params: newParams, ...rest });
      } else {
        set({ params: newParams, ...derived });
      }
    },

    setParams: (params) => {
      const state = get();
      const newParams = { ...state.params, ...params };
      const derived = computeDerived(state.template, newParams);
      if (state._frequencyOverride) {
        const { frequencyRange: _ignored, ...rest } = derived;
        void _ignored;
        set({ params: newParams, ...rest });
      } else {
        set({ params: newParams, ...derived });
      }
    },

    setGround: (ground) => {
      set({ ground });
    },

    setFrequencyRange: (range) => {
      set({ frequencyRange: range, _frequencyOverride: true });
    },

    setFrequencySegments: (segments) => {
      set({ frequencySegments: segments, _frequencyOverride: true });
    },

    addFrequencySegment: (segment) => {
      const state = get();
      set({
        frequencySegments: [...state.frequencySegments, segment],
        _frequencyOverride: true,
      });
    },

    removeFrequencySegment: (index) => {
      const state = get();
      set({
        frequencySegments: state.frequencySegments.filter((_, i) => i !== index),
      });
    },

    updateFrequencySegment: (index, segment) => {
      const state = get();
      const updated = [...state.frequencySegments];
      updated[index] = segment;
      set({ frequencySegments: updated });
    },

    clearFrequencySegments: () => {
      set({ frequencySegments: [] });
    },

    recompute: () => {
      const state = get();
      const derived = computeDerived(state.template, state.params);
      set(derived);
    },
  };
});
