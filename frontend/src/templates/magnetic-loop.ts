/**
 * Small Magnetic Loop antenna template.
 *
 * A small transmitting magnetic loop antenna. The loop circumference is
 * much less than a wavelength (<0.25 lambda). Tuned with a variable capacitor
 * placed opposite the feedpoint.
 *
 * Geometry (side view, XZ plane):
 *
 *         C (capacitor)
 *        _|_
 *       / | \
 *      /  |  \
 *     |   |   |  ← circular loop, radius R
 *      \  |  /
 *       \_|_/
 *         F (feed)
 *
 * The loop is a full circle in the XZ plane at a given center height.
 * NEC2 uses GA card for the wire arc.
 *
 * For 3D preview, the arc is approximated as short straight segments.
 * For simulation, the backend receives the arc as a GA card.
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import { arcToWireSegments } from "./types";

export const magneticLoopTemplate: AntennaTemplate = {
  id: "magnetic-loop",
  name: "Small Magnetic Loop",
  nameShort: "Mag Loop",
  description: "Small transmitting loop with tuning capacitor, excellent for HF in limited space.",
  longDescription:
    "A small magnetic loop antenna (also called a small transmitting loop or STL) " +
    "is a full circle of conductor tuned to resonance by a high-voltage variable capacitor. " +
    "Despite its small size (typically 1-3 ft diameter for HF), it can be surprisingly " +
    "efficient on 40m-10m. The radiation pattern is broadside to the plane of the loop " +
    "(figure-8 in the plane of the loop). Key advantages: very compact, low-noise receiving, " +
    "sharp tuning rejects out-of-band interference. Key limitations: very narrow bandwidth " +
    "(a few kHz on 40m), high voltages at the capacitor (several kV at 100W).",
  icon: "O",
  category: "loop",
  difficulty: "intermediate",
  bands: ["40m", "30m", "20m", "17m", "15m", "12m", "10m"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the loop",
      unit: "MHz",
      min: 3.5,
      max: 30,
      step: 0.1,
      defaultValue: 14.1,
      decimals: 1,
    },
    {
      key: "radius",
      label: "Loop Radius",
      description: "Radius of the circular loop",
      unit: "m",
      min: 0.2,
      max: 2.0,
      step: 0.05,
      defaultValue: 0.5,
      decimals: 2,
    },
    {
      key: "tube_dia",
      label: "Tube Diameter",
      description: "Diameter of the conductor tube/wire",
      unit: "mm",
      min: 3,
      max: 25,
      step: 1,
      defaultValue: 12,
      decimals: 0,
    },
    {
      key: "height",
      label: "Center Height",
      description: "Height of the loop center above ground",
      unit: "m",
      min: 0.5,
      max: 15,
      step: 0.5,
      defaultValue: 3,
      decimals: 1,
    },
  ],

  defaultGround: { type: "average" },

  generateGeometry: (params: Record<string, number>): WireGeometry[] => {
    const radius = params.radius ?? 0.5;
    const tubeDia = params.tube_dia ?? 12;
    const height = params.height ?? 3;
    const wireRadius = (tubeDia / 1000) / 2; // mm to m radius

    // For 3D preview: approximate circle as N short straight segments
    // The GA card handles the actual NEC2 geometry
    const segments = 36; // 10-degree segments for smooth circle
    const arc = {
      tag: 1,
      segments,
      arc_radius: radius,
      start_angle: 0,
      end_angle: 360,
      wire_radius: wireRadius,
    };

    return arcToWireSegments(arc, height);
  },

  generateExcitation: (
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation => {
    // Feed at bottom of loop (segment 1 of the arc = bottom, 0 degrees)
    return {
      wire_tag: 1,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints: (
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] => {
    const radius = params.radius ?? 0.5;
    const height = params.height ?? 3;
    // Feedpoint at bottom of loop (angle = 0 degrees in XZ plane)
    // NEC2 coords: X = R, Y = 0, Z = height
    // Three.js: [X, Z, -Y] = [R, height, 0]
    return [
      {
        position: [radius, height, 0],
        wireTag: 1,
      },
    ];
  },

  defaultFrequencyRange: (params: Record<string, number>): FrequencyRange => {
    const freq = params.frequency ?? 14.1;
    // Magnetic loops have very narrow bandwidth, so use a tighter sweep
    const bw = freq * 0.05; // 5% bandwidth
    return {
      start_mhz: Math.max(0.1, freq - bw),
      stop_mhz: freq + bw,
      steps: 21,
    };
  },

  tips: [
    "The tuning capacitor must handle very high voltages (several kV at 100W). Use a vacuum variable or high-voltage air variable.",
    "Bandwidth is extremely narrow (a few kHz on 40m). You will need to retune for every frequency change.",
    "Use the largest diameter conductor you can find (copper tube, 12-25mm). Efficiency improves dramatically with thicker conductors.",
    "Keep the loop at least 1/4 wavelength from any metal structures for best performance.",
    "The radiation pattern is broadside to the loop plane — orient the loop to point at your target direction.",
    "This simulation uses the NEC2 GA (wire arc) card for accurate circular geometry.",
  ],

  relatedTemplates: ["delta-loop", "quad"],
};
