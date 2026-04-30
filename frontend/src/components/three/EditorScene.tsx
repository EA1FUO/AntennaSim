/**
 * EditorScene — R3F scene for the V2 wire editor.
 *
 * Contains:
 * - Interactive antenna model with selection
 * - Ground plane & grid
 * - Compass, axes
 * - Click handlers for add/select/move modes
 * - Ghost wire preview when in add mode
 * - Endpoint drag (move individual endpoints)
 * - Whole-wire drag (translate entire wire)
 */

import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { Suspense, useMemo, useCallback, useState, useRef, useEffect, type RefObject } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3, Plane, LineCurve3, TubeGeometry, MeshBasicMaterial } from "three";
import { GroundPlane } from "./GroundPlane";
import { CompassRose } from "./CompassRose";
import { AxesHelper } from "./AxesHelper";
import { CameraControls } from "./CameraControls";
import { PostProcessing } from "./PostProcessing";
import { EditorAntennaModel } from "./EditorAntennaModel";
import { RadiationPattern3D } from "./RadiationPattern3D";
import { VolumetricShells } from "./VolumetricShells";
import { GroundReflection } from "./GroundReflection";
import { CurrentDistribution3D } from "./CurrentDistribution3D";
import { NearFieldPlane } from "./NearFieldPlane";
import { CurrentFlowParticles } from "./CurrentFlowParticles";
import { RadiationSlice } from "./RadiationSlice";
import { SceneRaycaster } from "./SceneRaycaster";
import type { ViewToggles } from "./types";
import type { PatternData, SegmentCurrent, NearFieldResult } from "../../api/nec";
import { useUIStore } from "../../stores/uiStore";
import { useEditorStore, snap } from "../../stores/editorStore";

interface EditorSceneProps {
  viewToggles: ViewToggles;
  patternData?: PatternData | null;
  currents?: SegmentCurrent[] | null;
  nearField?: NearFieldResult | null;
  tooltipRef?: RefObject<HTMLDivElement | null>;
}

/** Ground plane for raycasting (XZ plane at y=0 in Three.js = z=0 in NEC2) */
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/** Ghost wire preview component for add mode */
function GhostWire({ start, end }: { start: Vector3; end: Vector3 }) {
  const geometry = useMemo(() => {
    const curve = new LineCurve3(start, end);
    return new TubeGeometry(curve, 2, 0.015, 4, false);
  }, [start, end]);

  const material = useMemo(
    () => new MeshBasicMaterial({ color: "#3B82F6", opacity: 0.4, transparent: true }),
    []
  );

  return (
    <group>
      <mesh position={start}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#3B82F6" opacity={0.7} transparent />
      </mesh>
      <mesh geometry={geometry} material={material} />
      <mesh position={end}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#3B82F6" opacity={0.5} transparent />
      </mesh>
    </group>
  );
}

/** Visual axis constraint indicator — colored line(s) through the dragged point */
function AxisConstraintLine({ axis, position }: { axis: AxisConstraint; position: [number, number, number] }) {
  if (!axis) return null;
  const LEN = 50;
  const [px, py, pz] = position;
  // NEC2 coords → Three.js: [x, z, -y]
  const cx = px, cy = pz, cz = -py;

  const colors: Record<string, string> = { x: "#ef4444", y: "#22c55e", z: "#3b82f6" };
  // For single axis: show that axis line. For plane (xy/xz/yz): show both axis lines.
  const axes = axis.length === 1 ? [axis] : axis.split("");

  return (
    <group>
      {axes.map((a) => {
        const dir: [number, number, number] =
          a === "x" ? [LEN, 0, 0] : a === "y" ? [0, 0, -LEN] : [0, LEN, 0];
        const points = [
          [cx - dir[0], cy - dir[1], cz - dir[2]] as [number, number, number],
          [cx + dir[0], cy + dir[1], cz + dir[2]] as [number, number, number],
        ];
        return (
          <line key={a}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array(points.flat()), 3]}
                count={2}
              />
            </bufferGeometry>
            <lineBasicMaterial color={colors[a]} opacity={0.7} transparent linewidth={1} />
          </line>
        );
      })}
    </group>
  );
}

/** Axis constraint during drag: null=free, "x"/"y"/"z"=lock to axis, "xy"/"xz"/"yz"=exclude axis */
type AxisConstraint = null | "x" | "y" | "z" | "xy" | "xz" | "yz";

type DragTarget =
  | { type: "endpoint"; tag: number; endpoint: "start" | "end";
      lastHit?: { x: number; y: number; z: number };
      axisConstraint: AxisConstraint }
  | { type: "wire"; tag: number;
      lastHit?: { x: number; y: number; z: number };
      /** Fixed camera-plane anchor so the plane doesn't drift with the wire */
      planeAnchor?: { x: number; y: number; z: number };
      axisConstraint: AxisConstraint };

/** Inner scene content — needs access to useThree */
function EditorSceneContent({
  viewToggles,
  patternData,
  currents,
  nearField,
  tooltipRef,
}: EditorSceneProps) {
  const theme = useUIStore((s) => s.theme);
  const accurateFeedpoint = useUIStore((s) => s.accurateFeedpoint);

  // Dim wires when current/flow overlays are active so the colors show through
  const wiresDimmed = (viewToggles.current || viewToggles.currentFlow) && !!currents && currents.length > 0;

  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const mode = useEditorStore((s) => s.mode);
  const snapSize = useEditorStore((s) => s.snapSize);
  const selectWire = useEditorStore((s) => s.selectWire);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const addWire = useEditorStore((s) => s.addWire);
  const updateWire = useEditorStore((s) => s.updateWire);
  const moveWire = useEditorStore((s) => s.moveWire);
  const moveSelected = useEditorStore((s) => s.moveSelected);
  const toggleSelection = useEditorStore((s) => s.toggleSelection);
  const pickingExcitationForTag = useEditorStore((s) => s.pickingExcitationForTag);
  const setExcitation = useEditorStore((s) => s.setExcitation);
  const setPickingExcitationForTag = useEditorStore((s) => s.setPickingExcitationForTag);

  /** Handle segment pick in 3D viewport — sets excitation and exits pick mode */
  const handleSegmentPick = useCallback(
    (tag: number, segment: number) => {
      setExcitation(tag, segment);
      setPickingExcitationForTag(null);
    },
    [setExcitation, setPickingExcitationForTag]
  );

  /** Build a map from wire tag to excitation segment for quick lookup */
  const excitationSegmentMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of excitations) {
      map.set(e.wire_tag, e.segment);
    }
    return map;
  }, [excitations]);

  // Add mode state: first click sets start point, second click sets end
  const [addStart, setAddStart] = useState<[number, number, number] | null>(null);
  // Ghost wire preview position
  const [ghostEnd, setGhostEnd] = useState<[number, number, number] | null>(null);

  // Axis constraint visual indicator (shown in 3D during drag)
  const [axisIndicator, setAxisIndicator] = useState<{ axis: AxisConstraint; pos: [number, number, number] } | null>(null);

  // Drag state — when non-null, orbit controls are disabled
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragTarget | null>(null);

  const { raycaster, camera, controls } = useThree();

  // Listen for X/Y/Z key presses during drag to set axis constraint
  useEffect(() => {
    if (!isDragging) {
      setAxisIndicator(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (!dragRef.current) return;
      const key = e.key.toLowerCase();
      const shift = e.shiftKey;
      if (key === "x" || key === "y" || key === "z") {
        e.preventDefault();
        const current = dragRef.current.axisConstraint;
        let next: AxisConstraint;
        if (shift) {
          // Shift+X = exclude X (move YZ), etc.
          const exclude = key === "x" ? "yz" : key === "y" ? "xz" : "xy";
          next = current === exclude ? null : exclude;
        } else {
          // X = lock to X, press again = free
          next = current === key ? null : key;
        }
        dragRef.current.axisConstraint = next;
        // Update indicator position from current wire/endpoint
        const target = dragRef.current;
        const wire = wires.find((w) => w.tag === target.tag);
        if (wire && next) {
          const pos: [number, number, number] = target.type === "endpoint"
            ? (target.endpoint === "start" ? [wire.x1, wire.y1, wire.z1] : [wire.x2, wire.y2, wire.z2])
            : [(wire.x1 + wire.x2) / 2, (wire.y1 + wire.y2) / 2, (wire.z1 + wire.z2) / 2];
          setAxisIndicator({ axis: next, pos });
        } else {
          setAxisIndicator(null);
        }
      }
      if (key === "escape") {
        dragRef.current.axisConstraint = null;
        setAxisIndicator(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isDragging, wires]);

  /** Raycast to ground plane to get NEC2 coordinates (horizontal movement: X/Y) */
  const raycastToGround = useCallback(
    (event: ThreeEvent<MouseEvent | PointerEvent>): [number, number, number] | null => {
      const intersection = new Vector3();
      const ray = event.ray ?? raycaster.ray;
      const hit = ray.intersectPlane(GROUND_PLANE, intersection);
      if (!hit) return null;

      // Three.js [x, y, z] -> NEC2 [x, -z, y]
      const necX = snap(intersection.x, snapSize);
      const necY = snap(-intersection.z, snapSize);
      const necZ = snap(intersection.y, snapSize);
      return [necX, necY, necZ];
    },
    [raycaster, snapSize]
  );

  /** Raycast to a plane perpendicular to the camera, passing through a given
   *  Three.js world point. Returns the intersection in Three.js coordinates.
   *  This is how Blender/Unity do 3D dragging — the object follows the mouse
   *  naturally from any camera angle with no dead zones. */
  const raycastCameraPlane = useCallback(
    (event: ThreeEvent<PointerEvent | MouseEvent>, throughPoint: Vector3): Vector3 | null => {
      const intersection = new Vector3();
      const ray = event.ray ?? raycaster.ray;
      const camDir = new Vector3();
      camera.getWorldDirection(camDir);
      const plane = new Plane().setFromNormalAndCoplanarPoint(camDir, throughPoint);
      const hit = ray.intersectPlane(plane, intersection);
      return hit ? intersection : null;
    },
    [raycaster, camera]
  );

  /** Handle clicking on empty space */
  const handleBackgroundClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (mode === "select") {
        deselectAll();
        return;
      }

      if (mode === "add") {
        const pos = raycastToGround(event);
        if (!pos) return;

        if (!addStart) {
          setAddStart(pos);
        } else {
          addWire({
            x1: addStart[0],
            y1: addStart[1],
            z1: addStart[2],
            x2: pos[0],
            y2: pos[1],
            z2: pos[2],
            radius: 0.001,
          });
          setAddStart(null);
          setGhostEnd(null);
        }
      }
    },
    [mode, addStart, deselectAll, addWire, raycastToGround]
  );

  /** Handle mouse move for ghost wire preview and drag operations */
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (mode === "add" && addStart) {
        const pos = raycastToGround(event);
        if (pos) setGhostEnd(pos);
      }

      // Drag operations — camera-facing plane approach.
      // Raycast onto a plane perpendicular to the camera passing through
      // the object's position. Compute delta from last hit. Apply constraints.
      if (isDragging && dragRef.current) {
        const target = dragRef.current;
        if (!target.lastHit) return;

        // For wires: use fixed planeAnchor so the plane doesn't drift as the wire moves.
        // For endpoints: use lastHit (which tracks the endpoint position).
        const anchorSrc = (target.type === "wire" && target.planeAnchor) ? target.planeAnchor : target.lastHit;
        const anchor = new Vector3(anchorSrc.x, anchorSrc.y, anchorSrc.z);
        const hit = raycastCameraPlane(event, anchor);
        if (!hit) return;

        const dtx = hit.x - target.lastHit.x;
        const dty = hit.y - target.lastHit.y; // Three.js Y = NEC2 Z
        const dtz = hit.z - target.lastHit.z;

        // Convert to NEC2 before applying axis constraint
        // Three.js (dtx, dty, dtz) -> NEC2 (dtx, -dtz, dty)
        let necDx = dtx;
        let necDy = -dtz;
        let necDz = dty;

        // Apply axis constraint in NEC2 space
        const ac = target.axisConstraint;
        if (ac === "x") { necDy = 0; necDz = 0; }
        else if (ac === "y") { necDx = 0; necDz = 0; }
        else if (ac === "z") { necDx = 0; necDy = 0; }
        else if (ac === "xy") { necDz = 0; }
        else if (ac === "xz") { necDy = 0; }
        else if (ac === "yz") { necDx = 0; }

        // Update lastHit: freeze the Three.js axes that map to zeroed NEC2 axes
        // to prevent drift on constrained axes
        const newLastHit = { x: hit.x, y: hit.y, z: hit.z };
        // NEC2 X = Three.js X, NEC2 Y = -Three.js Z, NEC2 Z = Three.js Y
        if (necDx === 0 && dtx !== 0) newLastHit.x = target.lastHit.x;
        if (necDy === 0 && dtz !== 0) newLastHit.z = target.lastHit.z;
        if (necDz === 0 && dty !== 0) newLastHit.y = target.lastHit.y;
        target.lastHit = newLastHit;

        if (Math.abs(necDx) < 1e-9 && Math.abs(necDy) < 1e-9 && Math.abs(necDz) < 1e-9) return;

        if (target.type === "endpoint") {
          const { tag, endpoint } = target;
          const wire = wires.find((w) => w.tag === tag);
          if (!wire) return;

          let newX = (endpoint === "start" ? wire.x1 : wire.x2) + necDx;
          let newY = (endpoint === "start" ? wire.y1 : wire.y2) + necDy;
          let newZ = (endpoint === "start" ? wire.z1 : wire.z2) + necDz;

          // Length lock: clamp to sphere while respecting axis constraint
          if (wire.lengthLocked) {
            const [fx, fy, fz] = endpoint === "start"
              ? [wire.x2, wire.y2, wire.z2]
              : [wire.x1, wire.y1, wire.z1];
            const L = Math.sqrt(
              (wire.x2 - wire.x1) ** 2 + (wire.y2 - wire.y1) ** 2 + (wire.z2 - wire.z1) ** 2
            );
            if (L > 1e-9) {
              if (ac === "x" || ac === "y" || ac === "z") {
                // Single axis: only 2 valid positions on that axis line
                // Fixed axes use current endpoint values
                const fixedSq = (ac !== "x" ? 0 : (newY - fy) ** 2 + (newZ - fz) ** 2)
                             + (ac !== "y" ? 0 : (newX - fx) ** 2 + (newZ - fz) ** 2)
                             + (ac !== "z" ? 0 : (newX - fx) ** 2 + (newY - fy) ** 2);
                const rem = L * L - fixedSq;
                if (rem >= 0) {
                  const d = Math.sqrt(rem);
                  // Pick the closer of the two valid positions
                  const cur = ac === "x" ? newX - fx : ac === "y" ? newY - fy : newZ - fz;
                  const clamped = Math.abs(cur - d) < Math.abs(cur + d) ? d : -d;
                  if (ac === "x") newX = fx + clamped;
                  else if (ac === "y") newY = fy + clamped;
                  else newZ = fz + clamped;
                } else {
                  // Unreachable on this axis — clamp to max
                  if (ac === "x") { newX = fx + (newX >= fx ? L : -L); newY = fy; newZ = fz; }
                  else if (ac === "y") { newY = fy + (newY >= fy ? L : -L); newX = fx; newZ = fz; }
                  else { newZ = fz + (newZ >= fz ? L : -L); newX = fx; newY = fy; }
                }
              } else if (ac === "xy" || ac === "xz" || ac === "yz") {
                // Plane: scale the 2 free axes to maintain length with the fixed axis
                const fixedD = ac === "xy" ? newZ - fz : ac === "xz" ? newY - fy : newX - fx;
                const needed = L * L - fixedD * fixedD;
                if (needed > 0) {
                  const a1 = ac === "yz" ? newY - fy : newX - fx;
                  const a2 = ac === "xy" ? newY - fy : newZ - fz;
                  const dist = Math.sqrt(a1 * a1 + a2 * a2);
                  if (dist > 1e-9) {
                    const scale = Math.sqrt(needed) / dist;
                    if (ac === "yz") { newY = fy + a1 * scale; newZ = fz + a2 * scale; }
                    else if (ac === "xz") { newX = fx + a1 * scale; newZ = fz + a2 * scale; }
                    else { newX = fx + a1 * scale; newY = fy + a2 * scale; }
                  }
                }
              } else {
                // Free: project onto sphere
                const dx = newX - fx, dy = newY - fy, dz = newZ - fz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > 1e-9) {
                  const scale = L / dist;
                  newX = fx + dx * scale;
                  newY = fy + dy * scale;
                  newZ = fz + dz * scale;
                }
              }
            }
          }

          if (endpoint === "start") {
            updateWire(tag, { x1: newX, y1: newY, z1: newZ });
          } else {
            updateWire(tag, { x2: newX, y2: newY, z2: newZ });
          }

          // Re-sync lastHit to actual endpoint after length-lock projection
          if (wire.lengthLocked && target.lastHit) {
            target.lastHit = { x: newX, y: newZ, z: -newY };
          }
        } else if (target.type === "wire") {
          if (selectedTags.size > 1 && selectedTags.has(target.tag)) {
            moveSelected(necDx, necDy, necDz);
          } else {
            moveWire(target.tag, necDx, necDy, necDz);
          }
        }
      }
    },
    [mode, addStart, isDragging, wires, selectedTags, raycastToGround, raycastCameraPlane, updateWire, moveWire, moveSelected]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      // Re-enable orbit controls synchronously so the next touch can orbit normally
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      setIsDragging(false);
      dragRef.current = null;
    }
  }, [isDragging, controls]);

  /** Handle wire click — works in both select and move mode */
  const handleWireClick = useCallback(
    (tag: number, event: ThreeEvent<MouseEvent>) => {
      if (mode === "select" || mode === "move") {
        if (event.nativeEvent.shiftKey || event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) {
          toggleSelection(tag);
        } else {
          selectWire(tag);
        }
      }
    },
    [mode, selectWire, toggleSelection]
  );

  /** Handle endpoint drag start (move mode — endpoint only) */
  const handleEndpointDragStart = useCallback(
    (tag: number, endpoint: "start" | "end", event: ThreeEvent<PointerEvent>) => {
      if (mode === "move") {
        const wire = wires.find((w) => w.tag === tag);
        const ep = event.point ?? (wire
          ? (endpoint === "start" ? new Vector3(wire.x1, wire.z1, -wire.y1) : new Vector3(wire.x2, wire.z2, -wire.y2))
          : new Vector3());
        const hit = raycastCameraPlane(event, ep);
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
        setIsDragging(true);
        dragRef.current = { type: "endpoint", tag, endpoint, axisConstraint: null, lastHit: hit ? { x: hit.x, y: hit.y, z: hit.z } : undefined };
      }
    },
    [mode, wires, controls, raycastCameraPlane]
  );

  /** Handle wire body drag start (move mode — whole wire) */
  const handleWireDragStart = useCallback(
    (tag: number, event: ThreeEvent<PointerEvent>) => {
      if (mode === "move") {
        event.stopPropagation();
        // Use the actual click point on the wire tube as the anchor.
        // This matches the camera-plane depth to where the user clicked,
        // giving 1:1 cursor tracking without sensitivity jumps.
        const clickPoint = event.point ?? new Vector3();
        const hit = raycastCameraPlane(event, clickPoint);
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
        setIsDragging(true);
        const hitObj = hit ? { x: hit.x, y: hit.y, z: hit.z } : undefined;
        dragRef.current = { type: "wire", tag, axisConstraint: null, lastHit: hitObj, planeAnchor: hitObj ? { ...hitObj } : undefined };
      }
    },
    [mode, controls, raycastCameraPlane]
  );

  // Convert wires to WireData format
  const wireDataList = useMemo(
    () =>
      wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1,
        y1: w.y1,
        z1: w.z1,
        x2: w.x2,
        y2: w.y2,
        z2: w.z2,
        radius: w.radius,
      })),
    [wires]
  );

  // Feedpoint tag set
  const feedpointTags = useMemo(
    () => new Set(excitations.map((e) => e.wire_tag)),
    [excitations]
  );

  // Antenna centroid for pattern
  const antennaCentroid = useMemo((): [number, number, number] => {
    if (wires.length === 0) return [0, 0, 0];
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const w of wires) {
      sumX += (w.x1 + w.x2) / 2;
      sumY += (w.y1 + w.y2) / 2;
      sumZ += (w.z1 + w.z2) / 2;
    }
    const n = wires.length;
    return [sumX / n, sumZ / n, -sumY / n];
  }, [wires]);

  // Ghost wire for add mode preview
  const ghostWire = useMemo(() => {
    if (mode !== "add" || !addStart || !ghostEnd) return null;
    return {
      start: new Vector3(addStart[0], addStart[2], -addStart[1]),
      end: new Vector3(ghostEnd[0], ghostEnd[2], -ghostEnd[1]),
    };
  }, [mode, addStart, ghostEnd]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={theme === "dark" ? 0.3 : 0.5} />
      <directionalLight position={[20, 30, 10]} intensity={theme === "dark" ? 0.7 : 0.8} />

      {/* Fog */}
      <fog attach="fog" args={[theme === "dark" ? "#0A0A0F" : "#E8E8ED", 60, 200]} />

      {/* Clickable background plane (invisible, for catching clicks on empty space) */}
      <mesh
        visible={false}
        position={[0, -0.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleBackgroundClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Ground — auto-sized to antenna footprint */}
      {viewToggles.grid && <GroundPlane wires={wireDataList} />}
      {viewToggles.compass && <CompassRose />}
      <AxesHelper />

      {/* Antenna Wires */}
      {viewToggles.wires &&
        wireDataList.map((wire) => (
          <EditorAntennaModel
            key={wire.tag}
            wire={wire}
            isSelected={selectedTags.has(wire.tag)}
            hasFeedpoint={feedpointTags.has(wire.tag)}
            feedSegment={excitationSegmentMap.get(wire.tag)}
            isPicking={pickingExcitationForTag === wire.tag}
            accurateFeedpoint={accurateFeedpoint}
            mode={mode}
            onWireClick={handleWireClick}
            onEndpointDragStart={handleEndpointDragStart}
            onWireDragStart={handleWireDragStart}
            onSegmentPick={handleSegmentPick}
            tooltipRef={tooltipRef}
            dimmed={wiresDimmed}
          />
        ))}

      {/* Ghost wire preview (add mode) */}
      {ghostWire && (
        <GhostWire start={ghostWire.start} end={ghostWire.end} />
      )}

      {/* Axis constraint indicator during drag */}
      {axisIndicator && axisIndicator.axis && (
        <AxisConstraintLine axis={axisIndicator.axis} position={axisIndicator.pos} />
      )}

      {/* Radiation pattern — surface mode */}
      {viewToggles.pattern && !viewToggles.volumetric && patternData && (
        <RadiationPattern3D
          pattern={patternData}
          scale={5}
          opacity={0.65}
          center={antennaCentroid}
        />
      )}

      {/* Volumetric pattern shells */}
      {viewToggles.volumetric && patternData && (
        <VolumetricShells
          pattern={patternData}
          scale={5}
          center={antennaCentroid}
        />
      )}

      {/* Ground reflection ghost */}
      {viewToggles.reflection && (
        <GroundReflection wires={wireDataList} />
      )}

      {/* Current distribution overlay */}
      {viewToggles.current && currents && currents.length > 0 && (
        <CurrentDistribution3D currents={currents} />
      )}

      {/* Animated current flow particles */}
      {viewToggles.currentFlow && currents && currents.length > 0 && (
        <CurrentFlowParticles currents={currents} />
      )}

      {/* Near-field heatmap plane */}
      {viewToggles.nearField && nearField && (
        <NearFieldPlane data={nearField} />
      )}

      {/* Radiation pattern slice animation */}
      {viewToggles.slice && patternData && (
        <RadiationSlice
          pattern={patternData}
          scale={5}
          center={antennaCentroid}
        />
      )}

      {/* Camera controls — disabled during drag, auto-frames to antenna bbox */}
      <CameraControls enabled={!isDragging} wires={wireDataList} />
      <PostProcessing />
    </>
  );
}

export function EditorScene({ viewToggles, patternData, currents, nearField }: EditorSceneProps) {
  const theme = useUIStore((s) => s.theme);
  const isPicking = useEditorStore((s) => s.pickingExcitationForTag) !== null;
  const sceneBg = theme === "dark" ? "#0A0A0F" : "#E8E8ED";

  // Tooltip ref — direct DOM mutation, no React state
  const tooltipRef = useRef<HTMLDivElement>(null);

  const glConfig = useMemo(
    () => ({
      antialias: true,
      preserveDrawingBuffer: true,
      toneMapping: ACESFilmicToneMapping,
      outputColorSpace: SRGBColorSpace,
      toneMappingExposure: 1.0,
    }),
    []
  );

  return (
    <>
    <Canvas
      gl={glConfig}
      camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 500 }}
      style={{ background: sceneBg, cursor: isPicking ? "crosshair" : undefined }}
    >
      {/* Scene background as Three.js Color so it appears in screenshots */}
      <color attach="background" args={[sceneBg]} />
      <Suspense fallback={null}>
        <EditorSceneContent viewToggles={viewToggles} patternData={patternData} currents={currents} nearField={nearField} tooltipRef={tooltipRef} />
        <SceneRaycaster tooltipRef={tooltipRef} />
      </Suspense>
    </Canvas>
    <div
      ref={tooltipRef}
      className="fixed z-50 pointer-events-none bg-surface/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-lg text-[11px] font-mono leading-relaxed whitespace-nowrap"
      style={{ display: "none" }}
    />
    </>
  );
}
