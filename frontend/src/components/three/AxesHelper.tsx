import { GizmoHelper, GizmoViewport } from "@react-three/drei";

/**
 * XYZ axes indicator in the corner of the viewport.
 * Uses drei's GizmoHelper for consistent positioning.
 */
export function AxesHelper() {
  return (
    <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
      <GizmoViewport
        axisColors={["#EF4444", "#10B981", "#3B82F6"]}
        labelColor="white"
      />
    </GizmoHelper>
  );
}
