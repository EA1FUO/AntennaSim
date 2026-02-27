/**
 * SceneRaycaster — R3F component that raycasts on pointer move and resolves
 * hit objects to MeasurementData for the tooltip overlay.
 *
 * Sits inside the <Canvas> and uses useThree() to access the scene.
 * Communicates results via an onMeasurement callback.
 * Throttled to ~60ms intervals to avoid performance overhead.
 */

import { useCallback, useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector2, Raycaster, Vector3 } from "three";
import type { Intersection, Object3D } from "three";
import type { MeasurementData } from "./types";
import type { PatternData, SegmentCurrent, NearFieldResult } from "../../api/nec";

interface SceneRaycasterProps {
  /** Called when measurement data changes (or null when nothing is hovered) */
  onMeasurement: (data: MeasurementData | null, clientX: number, clientY: number) => void;
}

const _pointer = new Vector2();
const _raycaster = new Raycaster();

export function SceneRaycaster({ onMeasurement }: SceneRaycasterProps) {
  const { scene, camera, gl } = useThree();
  const lastTimeRef = useRef(0);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      // Throttle to ~60ms
      const now = performance.now();
      if (now - lastTimeRef.current < 60) return;
      lastTimeRef.current = now;

      const rect = gl.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointer, camera);

      // Collect all meshes with hoverType userData
      const targets: Object3D[] = [];
      scene.traverse((obj) => {
        if (obj.userData?.hoverType) {
          targets.push(obj);
        }
      });

      if (targets.length === 0) {
        onMeasurement(null, e.clientX, e.clientY);
        return;
      }

      const hits = _raycaster.intersectObjects(targets, false);
      if (hits.length === 0) {
        onMeasurement(null, e.clientX, e.clientY);
        return;
      }

      const hit = hits[0]!;
      const data = resolveHit(hit);
      onMeasurement(data, e.clientX, e.clientY);
    },
    [scene, camera, gl, onMeasurement]
  );

  const handlePointerLeave = useCallback(() => {
    onMeasurement(null, 0, 0);
  }, [onMeasurement]);

  // Attach/cleanup DOM events on the canvas element
  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [gl.domElement, handlePointerMove, handlePointerLeave]);

  return null; // Renders nothing — purely side-effect component
}

// ---- Hit resolution ----

function resolveHit(hit: Intersection): MeasurementData | null {
  const ud = hit.object.userData;
  if (!ud?.hoverType) return null;

  switch (ud.hoverType) {
    case "pattern":
      return resolvePatternHit(hit, ud.patternData as PatternData);
    case "wire":
      return {
        type: "wire",
        tag: ud.tag as number,
        lengthM: ud.lengthM as number,
        zMin: ud.zMin as number,
        zMax: ud.zMax as number,
        radiusMm: ud.radiusMm as number,
      };
    case "current":
      return resolveCurrentHit(hit, ud.segments as SegmentCurrent[]);
    case "nearfield":
      return resolveNearFieldHit(hit, ud.nfData as NearFieldResult);
    default:
      return null;
  }
}

function resolvePatternHit(hit: Intersection, pattern: PatternData): MeasurementData | null {
  const face = hit.face;
  if (!face) return null;

  const { phi_count, theta_start, theta_step, phi_start, phi_step, gain_dbi } = pattern;

  // Use vertex A of the hit face to find (ti, pi)
  // Vertex index layout: ti * phi_count + pi
  const vertIdx = face.a;
  const ti = Math.floor(vertIdx / phi_count);
  const pi = vertIdx % phi_count;

  const theta = theta_start + ti * theta_step;
  const phi = phi_start + pi * phi_step;
  const gain = gain_dbi[ti]?.[pi] ?? -999;

  if (gain <= -999) return null;

  return { type: "pattern", gainDbi: gain, theta, phi };
}

function resolveCurrentHit(hit: Intersection, segments: SegmentCurrent[]): MeasurementData | null {
  if (segments.length === 0) return null;

  // Convert hit point from Three.js to NEC2 coordinates
  // Three.js: [x, y, z] -> NEC2: [x, -z, y]
  const p = hit.point;
  // Account for potential parent group transforms
  const worldPoint = new Vector3();
  worldPoint.copy(p);

  const necX = worldPoint.x;
  const necY = -worldPoint.z;
  const necZ = worldPoint.y;

  // Find nearest segment by distance
  let nearest = segments[0]!;
  let minDist = Infinity;
  for (const seg of segments) {
    const dx = seg.x - necX;
    const dy = seg.y - necY;
    const dz = seg.z - necZ;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < minDist) {
      minDist = dist;
      nearest = seg;
    }
  }

  return {
    type: "current",
    tag: nearest.tag,
    segment: nearest.segment,
    magnitudeA: nearest.current_magnitude,
    phaseDeg: nearest.current_phase_deg,
    x: nearest.x,
    y: nearest.y,
    z: nearest.z,
  };
}

function resolveNearFieldHit(hit: Intersection, data: NearFieldResult): MeasurementData | null {
  // Hit point is in world coordinates. Convert to NEC2 grid coordinates.
  const p = hit.point;

  // For horizontal plane: Three.js [x, y, z] where y = height, x = necX, z = -necY
  // For vertical plane: Three.js [x, y, z] where y = necZ, x = necX, z = 0
  let necX: number;
  let necY: number;

  if (data.plane === "horizontal") {
    necX = p.x;
    necY = -p.z;
  } else {
    necX = p.x;
    necY = 0;
  }

  // Convert to grid indices
  const xi = Math.round((necX - data.x_start) / data.dx);
  const yi = Math.round((necY - data.y_start) / data.dy);

  if (xi < 0 || xi >= data.nx || yi < 0 || yi >= data.ny) return null;

  const fieldVal = data.field_magnitude[xi]?.[yi] ?? 0;

  return {
    type: "nearfield",
    fieldVm: fieldVal,
    x: necX,
    y: necY,
    heightM: data.height_m,
  };
}
