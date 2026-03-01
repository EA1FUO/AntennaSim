import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/**
 * 3D orientation gizmo — interactive axis indicator and camera view switcher.
 * Click any axis to snap to that view. Replaces the old camera preset buttons.
 */
export function AxesHelper() {
  return (
    <GizmoHelper alignment="top-right" margin={[72, 72]}>
      <GizmoViewport
        axisColors={["#EF4444", "#10B981", "#3B82F6"]}
        labelColor="white"
      />
    </GizmoHelper>
  );
}
