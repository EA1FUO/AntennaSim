import { useEffect, useState } from "react";
import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/** Breakpoint matching Tailwind's `lg` (1024px) */
const LG_BREAKPOINT = 1024;

/**
 * 3D orientation gizmo — interactive axis indicator and camera view switcher.
 * Click any axis to snap to that view. Smaller on mobile to avoid covering
 * the viewport and overlapping other controls.
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

  const margin: [number, number] = isMobile ? [44, 44] : [72, 72];

  return (
    <GizmoHelper alignment="top-right" margin={margin} renderPriority={2}>
      <GizmoViewport
        axisColors={["#EF4444", "#10B981", "#3B82F6"]}
        labelColor="white"
        scale={isMobile ? 0.6 : 1}
      />
    </GizmoHelper>
  );
}
