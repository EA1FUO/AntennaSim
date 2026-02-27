/**
 * SceneRaycaster — R3F component that raycasts on pointer move and resolves
 * hit objects to MeasurementData for the tooltip overlay.
 *
 * Sits inside the <Canvas> and uses useThree() to access the scene.
 * Communicates results via direct DOM mutation on a tooltip element
 * (no React setState) to avoid stalling the R3F render loop.
 *
 * Performance strategy:
 * - Raycaster targets are cached and rebuilt only when the scene graph changes
 * - Raycasting is deferred via requestIdleCallback / setTimeout so it never
 *   blocks the animation frame
 * - Throttled to ~100ms intervals
 * - Module-level singletons for Raycaster / Vector2 avoid GC pressure
 */

import { useRef, useEffect, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { Vector2, Raycaster } from "three";
import type { Object3D, Intersection } from "three";
import { Vector3 } from "three";
import type { MeasurementData } from "./types";
import type { PatternData, SegmentCurrent, NearFieldResult } from "../../api/nec";

interface SceneRaycasterProps {
  /** Ref to the tooltip container DOM element for direct mutation */
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}

// Module-level singletons — never re-allocated
const _pointer = new Vector2();
const _raycaster = new Raycaster();
const _tmpVec3 = new Vector3();

/**
 * Render measurement data directly into a DOM element, bypassing React.
 * This is the key optimisation: no setState → no reconciliation → no stall.
 */
function renderTooltipDOM(
  el: HTMLDivElement,
  data: MeasurementData | null,
  clientX: number,
  clientY: number,
): void {
  if (!data) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";
  el.style.left = `${clientX + 14}px`;
  el.style.top = `${clientY - 10}px`;

  let html = "";
  switch (data.type) {
    case "pattern": {
      const gc =
        data.gainDbi >= 0
          ? "color:var(--color-swr-excellent)"
          : data.gainDbi >= -3
            ? "color:var(--color-swr-good)"
            : "color:var(--color-text-secondary)";
      html = `<div style="font-size:9px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Radiation Pattern</div>
<div style="font-size:14px;font-weight:700;${gc}">${data.gainDbi.toFixed(2)} dBi</div>
<div style="color:var(--color-text-secondary)">\u03B8 ${data.theta.toFixed(1)}\u00B0 &nbsp; \u03C6 ${data.phi.toFixed(1)}\u00B0</div>`;
      break;
    }
    case "wire":
      html = `<div style="font-size:9px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Wire #${data.tag}</div>
<div style="color:var(--color-text-primary)">Length: <b>${data.lengthM.toFixed(3)} m</b></div>
<div style="color:var(--color-text-secondary)">Height: ${data.zMin.toFixed(2)} \u2013 ${data.zMax.toFixed(2)} m</div>
<div style="color:var(--color-text-secondary)">Radius: ${data.radiusMm.toFixed(2)} mm</div>`;
      break;
    case "current": {
      const fmtCurrent =
        data.magnitudeA >= 1
          ? `${data.magnitudeA.toFixed(3)} A`
          : data.magnitudeA >= 0.001
            ? `${(data.magnitudeA * 1000).toFixed(2)} mA`
            : `${(data.magnitudeA * 1e6).toFixed(1)} \u00B5A`;
      html = `<div style="font-size:9px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Current (tag ${data.tag}, seg ${data.segment})</div>
<div style="color:var(--color-text-primary)">|I| = <b style="color:var(--color-swr-warning)">${fmtCurrent}</b></div>
<div style="color:var(--color-text-secondary)">Phase: ${data.phaseDeg.toFixed(1)}\u00B0</div>`;
      break;
    }
    case "nearfield":
      html = `<div style="font-size:9px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em">Near Field</div>
<div style="color:var(--color-text-primary)">|E| = <b style="color:var(--color-accent)">${data.fieldVm.toFixed(2)} V/m</b></div>
<div style="color:var(--color-text-secondary)">at (${data.x.toFixed(2)}, ${data.y.toFixed(2)}) m \u00B7 h=${data.heightM.toFixed(1)} m</div>`;
      break;
  }
  el.innerHTML = html;
}

export function SceneRaycaster({ tooltipRef }: SceneRaycasterProps) {
  const { scene, camera, gl } = useThree();

  // Cache raycaster targets so we don't traverse every pointer move.
  // Rebuilt lazily when scene children change.
  const targetsRef = useRef<Object3D[]>([]);
  const sceneVersionRef = useRef(0);
  const lastSceneChildCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const pendingIdleRef = useRef(0);

  // Rebuild target cache (cheap — only when scene graph changes)
  const rebuildTargets = useCallback(() => {
    const targets: Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData?.hoverType) {
        targets.push(obj);
      }
    });
    targetsRef.current = targets;
    sceneVersionRef.current++;
  }, [scene]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      // Throttle to ~100ms
      const now = performance.now();
      if (now - lastTimeRef.current < 100) return;
      lastTimeRef.current = now;

      // Snapshot pointer coordinates synchronously (they won't be valid later)
      const clientX = e.clientX;
      const clientY = e.clientY;
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

      // Cancel any pending idle callback
      if (pendingIdleRef.current) {
        cancelIdleCallback(pendingIdleRef.current);
      }

      // Defer the heavy work (traverse + raycast) off the current frame
      pendingIdleRef.current = requestIdleCallback(
        () => {
          // Lazily rebuild targets if scene graph changed
          const childCount = scene.children.length;
          if (childCount !== lastSceneChildCountRef.current) {
            lastSceneChildCountRef.current = childCount;
            rebuildTargets();
          }

          const targets = targetsRef.current;
          const tooltip = tooltipRef.current;
          if (!tooltip) return;

          if (targets.length === 0) {
            renderTooltipDOM(tooltip, null, clientX, clientY);
            return;
          }

          _pointer.set(ndcX, ndcY);
          _raycaster.setFromCamera(_pointer, camera);

          const hits = _raycaster.intersectObjects(targets, false);
          if (hits.length === 0) {
            renderTooltipDOM(tooltip, null, clientX, clientY);
            return;
          }

          const data = resolveHit(hits[0]!);
          renderTooltipDOM(tooltip, data, clientX, clientY);
        },
        { timeout: 80 }, // guarantee it runs within 80ms even if busy
      );
    },
    [scene, camera, gl, tooltipRef, rebuildTargets],
  );

  const handlePointerLeave = useCallback(() => {
    if (pendingIdleRef.current) {
      cancelIdleCallback(pendingIdleRef.current);
    }
    const tooltip = tooltipRef.current;
    if (tooltip) renderTooltipDOM(tooltip, null, 0, 0);
  }, [tooltipRef]);

  // Attach/cleanup DOM events on the canvas element
  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener("pointermove", handlePointerMove, { passive: true });
    el.addEventListener("pointerleave", handlePointerLeave);

    // Initial target collection
    rebuildTargets();

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerleave", handlePointerLeave);
      if (pendingIdleRef.current) cancelIdleCallback(pendingIdleRef.current);
    };
  }, [gl.domElement, handlePointerMove, handlePointerLeave, rebuildTargets]);

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

function resolvePatternHit(
  hit: Intersection,
  pattern: PatternData,
): MeasurementData | null {
  const face = hit.face;
  if (!face) return null;

  const {
    phi_count,
    theta_start,
    theta_step,
    phi_start,
    phi_step,
    gain_dbi,
  } = pattern;

  const vertIdx = face.a;
  const ti = Math.floor(vertIdx / phi_count);
  const pi = vertIdx % phi_count;

  const theta = theta_start + ti * theta_step;
  const phi = phi_start + pi * phi_step;
  const gain = gain_dbi[ti]?.[pi] ?? -999;

  if (gain <= -999) return null;

  return { type: "pattern", gainDbi: gain, theta, phi };
}

function resolveCurrentHit(
  hit: Intersection,
  segments: SegmentCurrent[],
): MeasurementData | null {
  if (segments.length === 0) return null;

  // Reuse module-level vector — no allocation
  _tmpVec3.copy(hit.point);
  const necX = _tmpVec3.x;
  const necY = -_tmpVec3.z;
  const necZ = _tmpVec3.y;

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

function resolveNearFieldHit(
  hit: Intersection,
  data: NearFieldResult,
): MeasurementData | null {
  const p = hit.point;
  let necX: number;
  let necY: number;

  if (data.plane === "horizontal") {
    necX = p.x;
    necY = -p.z;
  } else {
    necX = p.x;
    necY = 0;
  }

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
