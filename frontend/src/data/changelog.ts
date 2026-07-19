interface ChangelogSection {
  title: string;
  items: readonly string[];
}

interface ChangelogEntry {
  /** Change this value whenever the popup content changes materially. */
  id: string;
  title: string;
  summary: string;
  sections: readonly ChangelogSection[];
}

/** User-facing summary of the current unreleased changelog. */
export const CURRENT_CHANGELOG: ChangelogEntry = {
  id: "high-frequency-precision-2026-07",
  title: "What’s new in AntennaSim",
  summary: "High-frequency and precision improvements",
  sections: [
    {
      title: "Wider frequency range",
      items: [
        "Simulator and Editor frequency controls now support 0.1–2000 MHz in both the server and browser/WASM engines.",
        "Imports and validation now use the same limits, avoiding different results between workflows.",
      ],
    },
    {
      title: "Clearer antenna visualization",
      items: [
        "Wires, feedpoints, current overlays, patterns, camera framing, and fog now scale with the antenna geometry.",
        "Very small antennas remain readable without bulky wires, while large low-frequency antennas stay visible in the scene.",
      ],
    },
    {
      title: "More precise dimensions",
      items: [
        "Height controls in both Simulator and Editor offer explicit m, cm, mm, ft, and in choices based on the global unit system.",
        "Each selected unit uses a predictable 1–100 slider range, and numeric fields preserve precise values.",
      ],
    },
  ],
};
