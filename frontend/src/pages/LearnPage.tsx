/**
 * LearnPage — educational content about antenna simulation.
 *
 * Topics: NEC2 basics, SWR, impedance, radiation patterns,
 * antenna types, wire editor tips, simulation accuracy.
 */

import { useState, useCallback } from "react";
import { Navbar } from "../components/layout/Navbar";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "nec2",
    title: "What is NEC2?",
    content: (
      <>
        <p>
          NEC2 (Numerical Electromagnetics Code, version 2) is a widely-used antenna modeling engine
          originally developed by Lawrence Livermore National Laboratory in the 1980s. It uses the{" "}
          <strong>Method of Moments (MoM)</strong> to solve Maxwell's equations for thin-wire
          structures.
        </p>
        <p>
          When you run a simulation in AntSim, the antenna geometry is converted into a{" "}
          <strong>NEC2 card deck</strong> &mdash; a text-based input format describing wires,
          excitations, ground, and requested outputs. The <code>nec2c</code> engine (a C translation
          of the original Fortran code) then computes current distributions on each wire segment and
          derives far-field radiation patterns, impedance, and gain.
        </p>
        <h4>How the simulation pipeline works</h4>
        <ol>
          <li>
            <strong>Geometry definition</strong> &mdash; You define wires with endpoints (X, Y, Z
            in meters), a wire radius, and number of segments. Each wire is divided into short
            segments for computation.
          </li>
          <li>
            <strong>Excitation</strong> &mdash; A voltage source is placed at a specific segment
            (the feedpoint). NEC2 solves for the currents that flow in response.
          </li>
          <li>
            <strong>Ground model</strong> &mdash; The ground affects radiation patterns significantly.
            Options range from free space (no ground) to perfect ground and Sommerfeld real ground
            with dielectric constant and conductivity.
          </li>
          <li>
            <strong>Computation</strong> &mdash; NEC2 builds a system of linear equations (impedance
            matrix) and solves for segment currents. From these currents it calculates far-field
            patterns, input impedance, and gain.
          </li>
          <li>
            <strong>Results</strong> &mdash; AntSim parses the output and presents SWR, impedance,
            radiation patterns, and current distributions in an interactive UI.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "swr",
    title: "Understanding SWR",
    content: (
      <>
        <p>
          <strong>SWR (Standing Wave Ratio)</strong> measures how well the antenna impedance matches
          the transmission line (usually 50 ohms). A perfect match gives SWR = 1.0:1. In practice:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
          <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3">
            <div className="text-green-400 font-mono font-bold text-lg">1.0 &ndash; 1.5</div>
            <div className="text-xs text-text-secondary mt-1">
              Excellent match. Less than 4% of power is reflected. Ideal for most applications.
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
            <div className="text-amber-400 font-mono font-bold text-lg">1.5 &ndash; 3.0</div>
            <div className="text-xs text-text-secondary mt-1">
              Acceptable. Up to 25% reflected power. Most radios can handle this with a tuner.
            </div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
            <div className="text-red-400 font-mono font-bold text-lg">3.0+</div>
            <div className="text-xs text-text-secondary mt-1">
              Poor match. Significant reflected power. Indicates the antenna is not resonant at
              this frequency or needs adjustment.
            </div>
          </div>
        </div>
        <h4>What affects SWR?</h4>
        <ul>
          <li>
            <strong>Antenna dimensions</strong> &mdash; Length, height, spacing. A dipole resonates
            when its length is approximately half a wavelength.
          </li>
          <li>
            <strong>Feed impedance</strong> &mdash; The complex impedance (R + jX) at the feedpoint.
            For SWR = 1.0, you want R = 50 ohms and X = 0 ohms.
          </li>
          <li>
            <strong>Ground effects</strong> &mdash; Ground proximity changes the impedance. A
            quarter-wave vertical over perfect ground has ~36 ohms feed impedance.
          </li>
          <li>
            <strong>Frequency</strong> &mdash; SWR varies with frequency. The bandwidth is the
            range where SWR stays below your acceptable threshold (typically 2:1).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "impedance",
    title: "Impedance Explained",
    content: (
      <>
        <p>
          Antenna impedance is a complex number: <strong>Z = R + jX</strong>, where R is the
          resistance and X is the reactance, both in ohms.
        </p>
        <ul>
          <li>
            <strong>Resistance (R)</strong> &mdash; Has two components: radiation resistance (the
            useful part, representing power radiated) and loss resistance (heat in conductors and
            ground). Higher radiation resistance relative to loss resistance means higher efficiency.
          </li>
          <li>
            <strong>Reactance (X)</strong> &mdash; Represents stored energy. Positive X means the
            antenna is inductive (too long), negative X means capacitive (too short). At resonance,
            X = 0.
          </li>
        </ul>
        <h4>Reading the impedance chart</h4>
        <p>
          In AntSim's impedance chart, R is shown as a solid line and X as another. The 50-ohm
          reference line shows your target resistance. Where X crosses zero is a resonant frequency.
          The closer R is to 50 ohms at that point, the better your SWR will be.
        </p>
        <h4>The Smith Chart</h4>
        <p>
          The Smith chart is a graphical tool that maps impedance to a circular plot. The center
          represents 50 + j0 ohms (perfect match). Distance from center indicates SWR. The
          impedance locus (the curve traced as frequency changes) shows how the antenna's impedance
          varies. Constant SWR circles are shown as dashed rings.
        </p>
      </>
    ),
  },
  {
    id: "patterns",
    title: "Radiation Patterns",
    content: (
      <>
        <p>
          A <strong>radiation pattern</strong> shows how the antenna radiates energy in different
          directions. It's measured in <strong>dBi</strong> (decibels relative to an isotropic
          radiator).
        </p>
        <h4>Key pattern concepts</h4>
        <ul>
          <li>
            <strong>Main lobe</strong> &mdash; The direction of maximum radiation. For a horizontal
            dipole, the main lobe is broadside (perpendicular to the wire).
          </li>
          <li>
            <strong>Beamwidth</strong> &mdash; The angular width of the main lobe at -3dB points
            (half power). Narrower beamwidth means more directional antenna.
          </li>
          <li>
            <strong>Front-to-back ratio (F/B)</strong> &mdash; The difference in gain between the
            front and back of the antenna, in dB. Important for directional antennas like Yagis.
          </li>
          <li>
            <strong>Side lobes</strong> &mdash; Secondary radiation lobes. In well-designed
            directional antennas, side lobes should be 15-20 dB below the main lobe.
          </li>
          <li>
            <strong>Azimuth vs. Elevation</strong> &mdash; The azimuth pattern shows radiation in
            the horizontal plane (compass directions). The elevation pattern shows the vertical
            plane (takeoff angle). For HF DX, a low takeoff angle (10-20 degrees) is desirable.
          </li>
        </ul>
        <h4>3D pattern in AntSim</h4>
        <p>
          The 3D pattern mesh shows the full radiation solid. The color represents gain (blue = low,
          red = high). The pattern is centered on the antenna. You can toggle between surface mode
          and volumetric shells for different visualizations. The Slice feature animates a cutting
          plane through the 3D pattern to show cross-sections.
        </p>
      </>
    ),
  },
  {
    id: "types",
    title: "Antenna Types Overview",
    content: (
      <>
        <p>AntSim includes templates for many common antenna types. Here's when to use each:</p>
        <div className="space-y-3 my-3">
          <div>
            <h4>Dipole / Inverted Vee</h4>
            <p>
              The simplest resonant antenna. A half-wave dipole has about 2.15 dBi gain with a
              figure-8 azimuth pattern. The inverted vee variant is easier to support (single center
              mast) but has slightly less gain and broader pattern.
            </p>
          </div>
          <div>
            <h4>Yagi-Uda</h4>
            <p>
              A directional antenna with one driven element, one reflector, and one or more
              directors. Gains of 6-12 dBi depending on boom length. Requires a rotator for
              directional coverage.
            </p>
          </div>
          <div>
            <h4>Vertical / Ground Plane</h4>
            <p>
              Omnidirectional azimuth pattern with low takeoff angle, good for DX. A quarter-wave
              vertical with radials has about 0 dBi gain. Height above ground is less critical
              than for horizontally polarized antennas.
            </p>
          </div>
          <div>
            <h4>Loops (Quad, Delta, Magnetic)</h4>
            <p>
              Full-wave loops have about 1 dB more gain than a dipole. Magnetic loops are
              electrically small and can be very compact, but have narrow bandwidth and require
              a tuning capacitor.
            </p>
          </div>
          <div>
            <h4>Multi-band (Fan Dipole, G5RV, OCF)</h4>
            <p>
              These antennas work on multiple bands without a tuner. Fan dipoles use parallel
              elements for each band. The G5RV uses a matching section. Off-center-fed dipoles
              exploit harmonic relationships.
            </p>
          </div>
          <div>
            <h4>Directional (Moxon, Hex Beam, LPDA)</h4>
            <p>
              The Moxon rectangle is a compact 2-element beam with excellent F/B ratio. Hex beams
              cover multiple bands. LPDAs provide wideband directional coverage.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "editor",
    title: "Using the Wire Editor",
    content: (
      <>
        <p>
          The wire editor lets you build custom antenna geometries from scratch or modify existing
          templates.
        </p>
        <h4>Editor modes</h4>
        <ul>
          <li>
            <strong>Select mode</strong> &mdash; Click wires to select them. Shift+click for
            multi-select. View and edit properties in the right panel.
          </li>
          <li>
            <strong>Add mode</strong> &mdash; Click twice in the 3D viewport to place wire
            endpoints. The first click sets the start, the second sets the end.
          </li>
          <li>
            <strong>Move mode</strong> &mdash; Drag wire endpoints or entire wires. Hold Shift
            while dragging to move vertically (Z-axis only).
          </li>
        </ul>
        <h4>Tips</h4>
        <ul>
          <li>
            Use the <strong>snap grid</strong> (adjustable size) to align wires precisely.
          </li>
          <li>
            The <strong>Template Loader</strong> can import any template's geometry into the editor
            as a starting point.
          </li>
          <li>
            Use <strong>Import/Export</strong> to save your designs as .nec or .maa files, or load
            existing designs from other tools like EZNEC or 4nec2.
          </li>
          <li>
            The <strong>Optimizer</strong> can automatically tune wire coordinates to minimize SWR
            or maximize gain.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "accuracy",
    title: "Tips for Accurate Simulations",
    content: (
      <>
        <h4>Segmentation</h4>
        <p>
          Each wire is divided into segments for computation. More segments = more accuracy but
          slower. Rule of thumb: at least <strong>10 segments per half-wavelength</strong>. For a
          20m dipole at 14 MHz, that's about 20 segments total. AntSim's templates use sensible
          defaults.
        </p>
        <h4>Wire radius</h4>
        <p>
          Wire diameter affects impedance and bandwidth. Thicker wires have broader bandwidth.
          Use realistic values: 1mm for #14 AWG, 2mm for #12 AWG, 12mm for aluminum tubing.
          The segment length should be at least 4 times the wire radius.
        </p>
        <h4>Ground model</h4>
        <ul>
          <li>
            <strong>Free space</strong> &mdash; No ground at all. Useful for understanding the
            antenna in isolation, but not realistic for HF.
          </li>
          <li>
            <strong>Perfect ground</strong> &mdash; An ideal, lossless ground plane. Good for
            quick comparisons but overestimates low-angle performance.
          </li>
          <li>
            <strong>Real ground</strong> &mdash; Uses Sommerfeld/Norton ground model with
            dielectric constant and conductivity. Typical values: average soil is 13/0.005,
            city/industrial is 5/0.001, saltwater is 81/5.0.
          </li>
        </ul>
        <h4>Pattern resolution</h4>
        <p>
          Pattern resolution sets the angular step for radiation pattern computation. 5 degrees
          is the standard trade-off. Use 1-2 degrees for publication-quality patterns, but expect
          longer computation times.
        </p>
        <h4>Common pitfalls</h4>
        <ul>
          <li>
            Wires too close together without proper junction modeling can cause inaccurate results.
            Ensure connected wires share exact endpoint coordinates.
          </li>
          <li>
            Very short segments or very thin wires relative to segment length can cause numerical
            instability.
          </li>
          <li>
            Antenna height significantly affects radiation patterns for horizontal antennas. Always
            set realistic heights.
          </li>
        </ul>
      </>
    ),
  },
];

export function LearnPage() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!.id);

  const handleSectionClick = useCallback((id: string) => {
    setActiveSection(id);
    // Scroll the content area to top
    document.getElementById("learn-content")?.scrollTo(0, 0);
  }, []);

  const active = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]!;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — section navigation */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-surface overflow-y-auto shrink-0">
          <div className="p-3">
            <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
              Learn
            </h2>
            <nav className="space-y-0.5">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                    activeSection === section.id
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main
          id="learn-content"
          className="flex-1 overflow-y-auto"
        >
          {/* Mobile section selector */}
          <div className="md:hidden sticky top-0 z-10 bg-surface border-b border-border p-2">
            <select
              value={activeSection}
              onChange={(e) => handleSectionClick(e.target.value)}
              className="w-full bg-background text-text-primary text-sm px-2 py-1.5 rounded border border-border outline-none"
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          <div className="max-w-3xl mx-auto px-6 py-8">
            <h1 className="text-2xl font-bold text-text-primary mb-6">
              {active.title}
            </h1>
            <div className="prose prose-sm prose-invert max-w-none
              [&_p]:text-text-secondary [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-3
              [&_h4]:text-text-primary [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-5 [&_h4]:mb-2
              [&_ul]:text-text-secondary [&_ul]:text-sm [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc
              [&_ol]:text-text-secondary [&_ol]:text-sm [&_ol]:space-y-2 [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal
              [&_li]:leading-relaxed
              [&_strong]:text-text-primary [&_strong]:font-semibold
              [&_code]:text-accent [&_code]:text-xs [&_code]:bg-accent/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
            ">
              {active.content}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
