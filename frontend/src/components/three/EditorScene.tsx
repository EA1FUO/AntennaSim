/**
 * EditorScene — R3F scene for the V2 wire editor.
 *
 * Contains:
 * - Interactive antenna model with selection
 * - Ground plane & grid
 * - Compass, axes
 * - Click handlers for add/select/move modes
 * - Ghost wire preview when in add mode
 */

import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { Suspense, useMemo, useCallback, useState, useRef } from "react";
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
import type { ViewToggles } from "./types";
import type { PatternData, SegmentCurrent } from "../../api/nec";
import { useUIStore } from "../../stores/uiStore";
import { useEditorStore, snap } from "../../stores/editorStore";

interface EditorSceneProps {
  viewToggles: ViewToggles;
  patternData?: PatternData | null;
  currents?: SegmentCurrent[] | null;
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

/** Inner scene content — needs access to useThree */
function EditorSceneContent({
  viewToggles,
  patternData,
  currents,
}: EditorSceneProps) {
  const theme = useUIStore((s) => s.theme);

  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const mode = useEditorStore((s) => s.mode);
  const snapSize = useEditorStore((s) => s.snapSize);
  const selectWire = useEditorStore((s) => s.selectWire);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const addWire = useEditorStore((s) => s.addWire);
  const updateWire = useEditorStore((s) => s.updateWire);
  const toggleSelection = useEditorStore((s) => s.toggleSelection);

  // Add mode state: first click sets start point, second click sets end
  const [addStart, setAddStart] = useState<[number, number, number] | null>(
    null
  );
  // Ghost wire preview position
  const [ghostEnd, setGhostEnd] = useState<[number, number, number] | null>(
    null
  );

  // Move mode state
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    tag: number;
    endpoint: "start" | "end";
  } | null>(null);

  const { raycaster } = useThree();

  /** Raycast to ground plane to get NEC2 coordinates */
  const raycastToGround = useCallback(
    (event: ThreeEvent<MouseEvent | PointerEvent>): [number, number, number] | null => {
      const intersection = new Vector3();
      const ray = event.ray ?? raycaster.ray;
      const hit = ray.intersectPlane(GROUND_PLANE, intersection);
      if (!hit) return null;

      // Three.js [x, y, z] -> NEC2 [x, -z, y] (inverse of the NEC->Three transform)
      const necX = snap(intersection.x, snapSize);
      const necY = snap(-intersection.z, snapSize);
      const necZ = snap(intersection.y, snapSize);
      return [necX, necY, necZ];
    },
    [raycaster, snapSize]
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
          // First click: set start
          setAddStart(pos);
        } else {
          // Second click: create wire
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

  /** Handle mouse move for ghost wire preview */
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (mode === "add" && addStart) {
        const pos = raycastToGround(event);
        if (pos) setGhostEnd(pos);
      }

      // Move mode dragging
      if (isDragging && dragRef.current) {
        const pos = raycastToGround(event);
        if (!pos) return;
        const { tag, endpoint } = dragRef.current;
        if (endpoint === "start") {
          updateWire(tag, { x1: pos[0], y1: pos[1], z1: pos[2] });
        } else {
          updateWire(tag, { x2: pos[0], y2: pos[1], z2: pos[2] });
        }
      }
    },
    [mode, addStart, isDragging, raycastToGround, updateWire]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      dragRef.current = null;
    }
  }, [isDragging]);

  /** Handle wire click */
  const handleWireClick = useCallback(
    (tag: number, event: ThreeEvent<MouseEvent>) => {
      if (mode === "select") {
        if (event.nativeEvent.shiftKey || event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) {
          toggleSelection(tag);
        } else {
          selectWire(tag);
        }
      }
    },
    [mode, selectWire, toggleSelection]
  );

  /** Handle endpoint drag start (move mode) */
  const handleEndpointDragStart = useCallback(
    (tag: number, endpoint: "start" | "end", _event: ThreeEvent<PointerEvent>) => {
      if (mode === "move") {
        setIsDragging(true);
        dragRef.current = { tag, endpoint };
      }
    },
    [mode]
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
    // Convert NEC2 to Three.js
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
        position={[0, -0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleBackgroundClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Ground */}
      {viewToggles.grid && <GroundPlane />}
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
            mode={mode}
            onWireClick={handleWireClick}
            onEndpointDragStart={handleEndpointDragStart}
          />
        ))}

      {/* Ghost wire preview (add mode) */}
      {ghostWire && (
        <GhostWire start={ghostWire.start} end={ghostWire.end} />
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

      <CameraControls />
      <PostProcessing />
    </>
  );
}

export function EditorScene({ viewToggles, patternData, currents }: EditorSceneProps) {
  const theme = useUIStore((s) => s.theme);
  const sceneBg = theme === "dark" ? "#0A0A0F" : "#E8E8ED";

  const glConfig = useMemo(
    () => ({
      antialias: true,
      toneMapping: ACESFilmicToneMapping,
      outputColorSpace: SRGBColorSpace,
      toneMappingExposure: 1.0,
    }),
    []
  );

  return (
    <Canvas
      gl={glConfig}
      camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 500 }}
      style={{ background: sceneBg }}
    >
      <Suspense fallback={null}>
        <EditorSceneContent viewToggles={viewToggles} patternData={patternData} currents={currents} />
      </Suspense>
    </Canvas>
  );
}
