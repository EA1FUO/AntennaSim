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

import { useMemo, useCallback } from "react";
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
}

const SELECTED_COLOR = "#FFFFFF";
const FEEDPOINT_COLOR = "#F59E0B";

export function EditorAntennaModel({
  wire,
  isSelected,
  hasFeedpoint,
  mode,
  onWireClick,
  onEndpointDragStart,
  onWireDragStart,
}: EditorAntennaModelProps) {
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
    });

    return { geometry: tubeGeo, material: mat, start: s, end: e };
  }, [wire, isSelected]);

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
    return [
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    ];
  }, [start, end]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onWireClick(wire.tag, event);
    },
    [wire.tag, onWireClick]
  );

  /** Wire body drag — starts a whole-wire move */
  const handleWirePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (mode === "move" && isSelected && onWireDragStart) {
        event.stopPropagation();
        onWireDragStart(wire.tag, event);
      }
    },
    [mode, isSelected, wire.tag, onWireDragStart]
  );

  const capRadius = Math.max(wire.radius * 60, 0.04);
  const endpointRadius = mode === "move" ? capRadius * 2.5 : capRadius;
  const endpointColor = mode === "move" && isSelected ? "#10B981" : getWireColor(wire.tag);

  return (
    <group>
      {/* Selection outline */}
      {isSelected && outlineGeometry && outlineMaterial && (
        <mesh geometry={outlineGeometry} material={outlineMaterial} />
      )}

      {/* Wire tube — clickable for selection, draggable for whole-wire move */}
      <mesh
        geometry={geometry}
        material={material}
        onClick={handleClick}
        onPointerDown={handleWirePointerDown}
      />

      {/* Endpoint spheres */}
      <mesh
        position={start}
        onClick={handleClick}
        onPointerDown={
          mode === "move" && isSelected && onEndpointDragStart
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
          emissive={mode === "move" && isSelected ? "#10B981" : "#000000"}
          emissiveIntensity={mode === "move" && isSelected ? 0.5 : 0}
        />
      </mesh>
      <mesh
        position={end}
        onClick={handleClick}
        onPointerDown={
          mode === "move" && isSelected && onEndpointDragStart
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
          emissive={mode === "move" && isSelected ? "#10B981" : "#000000"}
          emissiveIntensity={mode === "move" && isSelected ? 0.5 : 0}
        />
      </mesh>

      {/* Feedpoint glow */}
      {hasFeedpoint && feedpointMat && (
        <mesh position={feedpointPosition} material={feedpointMat}>
          <sphereGeometry args={[capRadius * 3, 16, 16]} />
        </mesh>
      )}
    </group>
  );
}
