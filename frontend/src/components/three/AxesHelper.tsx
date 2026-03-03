import { useEffect, useState } from "react";
import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/** Breakpoint matching Tailwind's `lg` (1024px) */
const LG_BREAKPOINT = 1024;

/**
 * 3D orientation gizmo — interactive axis indicator and camera view switcher.
 * Click any axis to snap to that view. Smaller on mobile to avoid covering
 * the viewport and overlapping other controls.
 *
 * The GizmoHelper `margin` prop controls position only (offset from corner).
 * The visual size is controlled via the Hud's orthographic camera frustum,
 * which we cannot configure directly. Instead we reduce `margin` on mobile
 * to bring it tighter to the corner and use `axisScale` + `axisHeadScale`
 * to shrink the axis geometry within the fixed Hud viewport.
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

  const margin: [number, number] = isMobile ? [40, 40] : [72, 72];

  return (
    <GizmoHelper alignment="top-right" margin={margin} renderPriority={2}>
      <GizmoViewport
        axisColors={["#EF4444", "#10B981", "#3B82F6"]}
        labelColor="white"
        axisScale={isMobile ? [0.6, 0.6, 0.6] : undefined}
        axisHeadScale={isMobile ? 0.6 : 1}
      />
    </GizmoHelper>
  );
}
