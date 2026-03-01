/**
 * About page — project info, credits, and links.
 */

import { Navbar } from "../components/layout/Navbar";

const FEATURES = [
  {
    title: "NEC2 Engine",
    description:
      "Powered by nec2c, the industry-standard Numerical Electromagnetics Code. More accurate than MININEC-based tools.",
  },
  {
    title: "15 Antenna Templates",
    description:
      "From simple dipoles to Yagis, Moxons, LPDAs, and multiband designs. Each with adjustable parameters and real-time 3D preview.",
  },
  {
    title: "3D Visualization",
    description:
      "Interactive 3D antenna rendering with radiation pattern surfaces, current distribution, volumetric shells, and ground reflections.",
  },
  {
    title: "Wire Editor",
    description:
      "Full-featured wire editor with undo/redo, snap grid, loads, transmission lines, and .nec/.maa import/export.",
  },
  {
    title: "Optimizer",
    description:
      "Built-in Nelder-Mead optimizer to minimize SWR, maximize gain, or optimize front-to-back ratio automatically.",
  },
  {
    title: "Works Everywhere",
    description:
      "No installs, no Wine, no Java. Runs in any modern browser on desktop, tablet, or phone.",
  },
];

const LINKS = [
  {
    label: "NEC2 Documentation (original)",
    url: "https://www.nec2.org/",
  },
  {
    label: "nec2c (C translation of NEC2)",
    url: "https://github.com/tmolteno/nec2c",
  },
  {
    label: "ARRL Antenna Book",
    url: "https://www.arrl.org/arrl-antenna-book",
  },
  {
    label: "L.B. Cebik Antenna Models (archive)",
    url: "https://www.cebik.com/",
  },
];

export function AboutPage() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
          {/* Hero */}
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              About AntennaSim
            </h1>
            <p className="text-text-secondary leading-relaxed">
              AntennaSim is a modern, free, open-source web-based antenna simulator
              powered by the NEC2 electromagnetic engine. It replaces outdated
              desktop tools like MMANA-GAL, 4NEC2, and EZNEC with a beautiful,
              accessible web experience that works on any device without
              installation.
            </p>
          </div>

          {/* Features */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="p-4 bg-surface border border-border rounded-lg"
                >
                  <h3 className="text-sm font-semibold text-text-primary mb-1">
                    {f.title}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              How It Works
            </h2>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p>
                AntennaSim uses the <strong className="text-text-primary">Method of Moments (MoM)</strong> via
                the NEC2 engine to solve Maxwell's equations for thin-wire structures.
                Your antenna geometry is broken into segments, and NEC2 computes the
                current distribution, impedance, radiation pattern, and other parameters.
              </p>
              <p>
                The simulation runs on a server-side <code className="px-1 py-0.5 bg-background rounded text-xs font-mono">nec2c</code> process
                (the C translation of the original Fortran NEC2 code). Results are
                cached for performance, and the entire pipeline is sandboxed for security.
              </p>
              <p>
                The 3D visualization is powered by <strong className="text-text-primary">Three.js</strong> via
                React Three Fiber, with PBR materials, bloom effects, and interactive
                camera controls.
              </p>
            </div>
          </div>

          {/* Links */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              Resources
            </h2>
            <ul className="space-y-2">
              {LINKS.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Tech Stack */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              Tech Stack
            </h2>
            <div className="flex flex-wrap gap-2">
              {[
                "React 19",
                "TypeScript",
                "Three.js / R3F",
                "Tailwind CSS",
                "Zustand",
                "Recharts",
                "FastAPI",
                "nec2c",
                "Redis",
                "Docker",
                "scipy",
              ].map((tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 text-xs font-mono bg-surface border border-border rounded-md text-text-secondary"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border pt-6 pb-4">
            <p className="text-xs text-text-secondary">
              License: GPL-3.0 | Engine: nec2c (NEC2 Method of Moments)
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Made for amateur radio operators who deserve modern tools. 73!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
