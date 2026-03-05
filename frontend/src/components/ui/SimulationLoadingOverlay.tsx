/**
 * SimulationLoadingOverlay — fixed full-page overlay shown while a NEC2
 * simulation is running. Covers everything (navbar, panels, bottom sheet)
 * to prevent any interaction until the simulation completes.
 */

import { useEffect, useState } from "react";

/** Messages cycle every few seconds to keep the wait entertaining. */
const MESSAGES = [
  "Launching NEC2 engine...",
  "Building wire geometry...",
  "Computing segment currents...",
  "Solving matrix equations...",
  "Tracing radiation pattern...",
  "Tuning the antenna...",
  "Measuring SWR...",
  "Calculating impedance...",
  "Analyzing far-field...",
  "Optimizing feed point...",
  "Checking bandwidth...",
  "Almost there...",
];

/** How often the message rotates (ms). */
const ROTATE_INTERVAL = 2400;

export function SimulationLoadingOverlay() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    // Start from a random message so it doesn't always begin the same way
    setMsgIndex(Math.floor(Math.random() * MESSAGES.length));

    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % MESSAGES.length);
    }, ROTATE_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-xl bg-surface/95 border border-border shadow-xl max-w-[260px] lg:max-w-[300px]">
        {/* Animated spinner — pulsing rings */}
        <div className="relative w-14 h-14 lg:w-16 lg:h-16">
          {/* Outer ring */}
          <div
            className="absolute inset-0 rounded-full border-2 border-accent/30"
            style={{ animation: "sim-pulse 2s ease-in-out infinite" }}
          />
          {/* Spinning arc */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 48 48"
            style={{ animation: "sim-spin 1.2s linear infinite" }}
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80 50"
              className="text-accent"
            />
          </svg>
          {/* Inner dot */}
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="w-2.5 h-2.5 rounded-full bg-accent"
              style={{ animation: "sim-dot 2s ease-in-out infinite" }}
            />
          </div>
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-text-primary">
          Running Simulation
        </p>

        {/* Rotating status message */}
        <p
          key={msgIndex}
          className="text-xs text-text-secondary text-center font-mono sim-fade-in"
        >
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Inline keyframe animations — avoids needing a global CSS file change */}
      <style>{`
        @keyframes sim-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sim-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.12); opacity: 0.8; }
        }
        @keyframes sim-dot {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.4); opacity: 1; }
        }
        @keyframes sim-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sim-fade-in {
          animation: sim-fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
