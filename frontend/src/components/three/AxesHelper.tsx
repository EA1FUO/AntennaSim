import { useEffect, useState } from "react";
import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/** Breakpoint matching Tailwind's `lg` (1024px) */
const LG_BREAKPOINT = 1024;

/**
 * 3D orientation gizmo — interactive axis indicator and camera view switcher.
 * Click any axis to snap to that view. Smaller on mobile to avoid covering
 * the viewport and overlapping other controls.
 *
 * Labels and colors are remapped from Three.js coordinates (Y=up) to NEC2
 * coordinates (Z=up) so the gizmo matches what the user sees in the UI:
 *   Three.js X  →  NEC2 X  (red)
 *   Three.js Y  →  NEC2 Z  (blue, up)
 *   Three.js Z  →  NEC2 Y  (green, north→south is -Y but we label it Y)
 *
 * GizmoViewport internally sets `scale: 40` on its root <group> (40 units in
 * the Hud's orthographic pixel-space). Because it spreads `...props` after
 * this default, we can override it with a smaller value on mobile to genuinely
 * shrink the widget's screen footprint.
 */
export function AxesHelper() {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < LG_BREAKPOINT
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const margin: [number, number] = isMobile ? [50, 50] : [72, 72];

  return (
    <GizmoHelper alignment="top-right" margin={margin} renderPriority={2}>
      <GizmoViewport
        axisColors={["#EF4444", "#3B82F6", "#10B981"]}
        labels={["X", "Z", "Y"]}
        labelColor="white"
        {...(isMobile ? { scale: 25 } : {})}
      />
    </GizmoHelper>
  );
}
