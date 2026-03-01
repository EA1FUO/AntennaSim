/**
 * EditorAntennaModel — interactive wire rendering for the V2 wire editor.
 *
 * Extends AntennaModel with:
 * - Click-to-select (raycasting)
 * - Selection highlight (white glow outline)
 * - Endpoint spheres for move mode (drag individual endpoint)
 * - Wire body drag for move mode (translate entire wire)
 * - Feedpoint marker overlay
 */

import { useMemo, useCallback, useState, useRef } from "react";
import {
  TubeGeometry,
  LineCurve3,
  Vector3,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { WireData } from "./types";
import { getWireColor } from "./types";
import type { EditorMode } from "../../stores/editorStore";

interface EditorAntennaModelProps {
  wire: WireData;
  isSelected: boolean;
  hasFeedpoint: boolean;
  /** Actual excitation segment number (1-based), or undefined if no excitation */
  feedSegment?: number;
  /** Whether this wire is in "pick excitation segment" mode */
  isPicking: boolean;
  /** Show feedpoint marker at exact NEC2 segment center */
  accurateFeedpoint?: boolean;
  mode: EditorMode;
  onWireClick: (tag: number, event: ThreeEvent<MouseEvent>) => void;
  onEndpointDragStart?: (
    tag: number,
    endpoint: "start" | "end",
    event: ThreeEvent<PointerEvent>
  ) => void;
  /** Drag start on the wire body (whole-wire move) */
  onWireDragStart?: (
    tag: number,
    event: ThreeEvent<PointerEvent>
  ) => void;
  /** Called when a segment is picked in pick mode */
  onSegmentPick?: (tag: number, segment: number) => void;
  /** Ref to the tooltip DOM element for showing segment info on hover */
  tooltipRef?: { current: HTMLDivElement | null };
  /** When true, wire becomes semi-transparent so current overlays show through */
  dimmed?: boolean;
}

const SELECTED_COLOR = "#FFFFFF";
const FEEDPOINT_COLOR = "#F59E0B";

/** Compute the 3D position of a segment along a wire (in Three.js coords).
 *  When accurate=false (default), endpoint segments snap to wire edges for cleaner junction visuals.
 *  When accurate=true, always positions at the NEC2 segment center. */
function segmentPosition(
  wireStart: Vector3,
  wireEnd: Vector3,
  segment: number,
  totalSegments: number,
  accurate = false
): Vector3 {
  if (!accurate) {
    if (segment === 1) return wireStart.clone();
    if (segment === totalSegments) return wireEnd.clone();
  }
  const t = (segment - 0.5) / totalSegments;
  return wireStart.clone().lerp(wireEnd, t);
}

/** Compute which segment (1-based) a point along the wire falls into. */
function pointToSegment(
  wireStart: Vector3,
  wireEnd: Vector3,
  point: Vector3,
  totalSegments: number
): number {
  const wireDir = wireEnd.clone().sub(wireStart);
  const lenSq = wireDir.lengthSq();
  if (lenSq === 0) return 1;
  const toPoint = point.clone().sub(wireStart);
  const t = Math.max(0, Math.min(1, toPoint.dot(wireDir) / lenSq));
  return Math.max(1, Math.min(totalSegments, Math.ceil(t * totalSegments) || 1));
}

export function EditorAntennaModel({
  wire,
  isSelected,
  hasFeedpoint,
  feedSegment,
  isPicking,
  accurateFeedpoint,
  mode,
  onWireClick,
  onEndpointDragStart,
  onWireDragStart,
  onSegmentPick,
  tooltipRef,
  dimmed = false,
}: EditorAntennaModelProps) {
  // Pick mode: hovered segment number (null when not hovering)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const lastPointerEvent = useRef<{ clientX: number; clientY: number } | null>(null);

  const { geometry, material, start, end } = useMemo(() => {
    // NEC2: X=east, Y=north, Z=up -> Three.js: X=east, Y=up, Z=south
    const s = new Vector3(wire.x1, wire.z1, -wire.y1);
    const e = new Vector3(wire.x2, wire.z2, -wire.y2);

    const visualRadius = Math.max(wire.radius * 50, 0.03);
    const curve = new LineCurve3(s, e);
    const tubeGeo = new TubeGeometry(
      curve,
      Math.max(2, wire.segments),
      visualRadius,
      8,
      false
    );

    const color = isSelected ? SELECTED_COLOR : getWireColor(wire.tag);
    const mat = new MeshStandardMaterial({
      color,
      metalness: isSelected ? 0.3 : 0.85,
      roughness: isSelected ? 0.5 : 0.25,
      emissive: isSelected ? color : "#000000",
      emissiveIntensity: isSelected ? 0.3 : 0,
      transparent: dimmed,
      opacity: dimmed ? 0.15 : 1,
      depthWrite: !dimmed,
    });

    return { geometry: tubeGeo, material: mat, start: s, end: e };
  }, [wire, isSelected, dimmed]);

  // Selection outline
  const outlineGeometry = useMemo(() => {
    if (!isSelected) return null;
    const s = new Vector3(wire.x1, wire.z1, -wire.y1);
    const e = new Vector3(wire.x2, wire.z2, -wire.y2);
    const visualRadius = Math.max(wire.radius * 50, 0.03) * 1.4;
    const curve = new LineCurve3(s, e);
    return new TubeGeometry(curve, Math.max(2, wire.segments), visualRadius, 8, false);
  }, [wire, isSelected]);

  const outlineMaterial = useMemo(() => {
    if (!isSelected) return null;
    return new MeshStandardMaterial({
      color: "#3B82F6",
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
  }, [isSelected]);

  // Feedpoint marker material
  const feedpointMat = useMemo(() => {
    if (!hasFeedpoint) return null;
    return new MeshPhysicalMaterial({
      color: FEEDPOINT_COLOR,
      emissive: FEEDPOINT_COLOR,
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.9,
    });
  }, [hasFeedpoint]);

  const feedpointPosition = useMemo((): [number, number, number] => {
    if (feedSegment && wire.segments > 0) {
      const pos = segmentPosition(start, end, feedSegment, wire.segments, accurateFeedpoint);
      return [pos.x, pos.y, pos.z];
    }
    // Fallback to center if no segment info
    return [
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    ];
  }, [start, end, feedSegment, wire.segments, accurateFeedpoint]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onWireClick(wire.tag, event);
    },
    [wire.tag, onWireClick]
  );

  /** Wire body drag — starts a whole-wire move (no need to pre-select) */
  const handleWirePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (mode === "move" && onWireDragStart) {
        event.stopPropagation();
        onWireDragStart(wire.tag, event);
      }
    },
    [mode, wire.tag, onWireDragStart]
  );

  /** Pick mode: compute hovered segment and update tooltip */
  const handlePickPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!isPicking) return;
      const seg = pointToSegment(start, end, event.point, wire.segments);
      setHoveredSegment(seg);
      lastPointerEvent.current = { clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY };
      // Update tooltip
      if (tooltipRef?.current) {
        const el = tooltipRef.current;
        el.style.display = "block";
        el.style.left = `${event.nativeEvent.clientX + 12}px`;
        el.style.top = `${event.nativeEvent.clientY - 8}px`;
        el.textContent = `Seg ${seg} of ${wire.segments}`;
      }
    },
    [isPicking, start, end, wire.segments, tooltipRef]
  );

  /** Pick mode: hide tooltip on pointer leave */
  const handlePickPointerLeave = useCallback(() => {
    setHoveredSegment(null);
    lastPointerEvent.current = null;
    if (tooltipRef?.current) {
      tooltipRef.current.style.display = "none";
    }
  }, [tooltipRef]);

  /** Pick mode: set excitation at the clicked segment */
  const handlePickClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!isPicking || !onSegmentPick) return;
      event.stopPropagation();
      const seg = pointToSegment(start, end, event.point, wire.segments);
      onSegmentPick(wire.tag, seg);
    },
    [isPicking, onSegmentPick, start, end, wire.segments, wire.tag]
  );

  // Preview marker position (ghost feedpoint while hovering in pick mode)
  const previewPosition = useMemo((): [number, number, number] | null => {
    if (!isPicking || hoveredSegment === null) return null;
    const pos = segmentPosition(start, end, hoveredSegment, wire.segments, accurateFeedpoint);
    return [pos.x, pos.y, pos.z];
  }, [isPicking, hoveredSegment, start, end, wire.segments, accurateFeedpoint]);

  const capRadius = Math.max(wire.radius * 60, 0.04);
  const endpointRadius = mode === "move" ? capRadius * 2.5 : capRadius;
  const endpointColor = mode === "move" ? "#10B981" : getWireColor(wire.tag);

  return (
    <group>
      {/* Selection outline */}
      {isSelected && outlineGeometry && outlineMaterial && (
        <mesh geometry={outlineGeometry} material={outlineMaterial} />
      )}

      {/* Wire tube — clickable for selection, draggable for whole-wire move, pick mode interactions */}
      <mesh
        geometry={geometry}
        material={material}
        onClick={isPicking ? handlePickClick : handleClick}
        onPointerDown={isPicking ? undefined : handleWirePointerDown}
        onPointerMove={isPicking ? handlePickPointerMove : undefined}
        onPointerLeave={isPicking ? handlePickPointerLeave : undefined}
      />

      {/* Endpoint spheres */}
      <mesh
        position={start}
        onClick={handleClick}
        onPointerDown={
          mode === "move" && onEndpointDragStart
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onEndpointDragStart(wire.tag, "start", e);
              }
            : undefined
        }
      >
        <sphereGeometry args={[endpointRadius, 12, 12]} />
        <meshStandardMaterial
          color={endpointColor}
          metalness={0.5}
          roughness={0.4}
          emissive={mode === "move" ? "#10B981" : "#000000"}
          emissiveIntensity={mode === "move" ? 0.5 : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.15 : 1}
          depthWrite={!dimmed}
        />
      </mesh>
      <mesh
        position={end}
        onClick={handleClick}
        onPointerDown={
          mode === "move" && onEndpointDragStart
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onEndpointDragStart(wire.tag, "end", e);
              }
            : undefined
        }
      >
        <sphereGeometry args={[endpointRadius, 12, 12]} />
        <meshStandardMaterial
          color={endpointColor}
          metalness={0.5}
          roughness={0.4}
          emissive={mode === "move" ? "#10B981" : "#000000"}
          emissiveIntensity={mode === "move" ? 0.5 : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.15 : 1}
          depthWrite={!dimmed}
        />
      </mesh>

      {/* Feedpoint glow — positioned at actual excitation segment */}
      {hasFeedpoint && feedpointMat && (
        <mesh position={feedpointPosition} material={feedpointMat}>
          <sphereGeometry args={[capRadius * 3, 16, 16]} />
        </mesh>
      )}

      {/* Pick mode: ghost preview marker at hovered segment */}
      {previewPosition && (
        <mesh position={previewPosition}>
          <sphereGeometry args={[capRadius * 3, 16, 16]} />
          <meshPhysicalMaterial
            color="#3B82F6"
            emissive="#3B82F6"
            emissiveIntensity={1.5}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
}
