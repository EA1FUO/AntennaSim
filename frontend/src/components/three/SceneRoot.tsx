import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { GroundPlane } from "./GroundPlane";
import { CompassRose } from "./CompassRose";
import { AxesHelper } from "./AxesHelper";
import { AntennaModel } from "./AntennaModel";
import { FeedpointMarker } from "./FeedpointMarker";
import { CameraControls } from "./CameraControls";
import { PostProcessing } from "./PostProcessing";
import { RadiationPattern3D } from "./RadiationPattern3D";
import type { WireData, FeedpointData, ViewToggles } from "./types";
import type { PatternData } from "../../api/nec";
import { useUIStore } from "../../stores/uiStore";

interface SceneRootProps {
  wires: WireData[];
  feedpoints: FeedpointData[];
  viewToggles: ViewToggles;
  /** Radiation pattern data to render as 3D mesh */
  patternData?: PatternData | null;
}

export function SceneRoot({
  wires,
  feedpoints,
  viewToggles,
  patternData,
}: SceneRootProps) {
  const theme = useUIStore((s) => s.theme);
  const sceneBg = theme === "dark" ? "#0A0A0F" : "#E8E8ED";
  const fogColor = theme === "dark" ? "#0A0A0F" : "#E8E8ED";

  const glConfig = useMemo(
    () => ({
      antialias: true,
      toneMapping: ACESFilmicToneMapping,
      outputColorSpace: SRGBColorSpace,
      toneMappingExposure: 1.0,
    }),
    []
  );

  // Compute antenna centroid in Three.js coordinates for pattern positioning.
  // NEC2: X=east, Y=north, Z=up → Three.js: X=east, Y=up, Z=south(=-north)
  const antennaCentroid = useMemo((): [number, number, number] => {
    if (wires.length === 0) return [0, 0, 0];
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const w of wires) {
      // Average of both endpoints for each wire
      sumX += (w.x1 + w.x2) / 2;
      sumY += (w.y1 + w.y2) / 2;
      sumZ += (w.z1 + w.z2) / 2;
    }
    const n = wires.length;
    // NEC2 → Three.js coordinate swap: [necX, necZ, -necY]
    return [sumX / n, sumZ / n, -sumY / n];
  }, [wires]);

  return (
    <Canvas
      gl={glConfig}
      camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 500 }}
      style={{ background: sceneBg }}
    >
      <Suspense fallback={null}>
        {/* Lighting */}
        <ambientLight intensity={theme === "dark" ? 0.3 : 0.5} />
        <directionalLight
          position={[20, 30, 10]}
          intensity={theme === "dark" ? 0.7 : 0.8}
          castShadow={false}
        />

        {/* Fog for depth perception */}
        <fog attach="fog" args={[fogColor, 60, 200]} />

        {/* Ground */}
        {viewToggles.grid && <GroundPlane />}

        {/* Compass Rose */}
        {viewToggles.compass && <CompassRose />}

        {/* Axes */}
        <AxesHelper />

        {/* Antenna Wires */}
        {viewToggles.wires &&
          wires.map((wire) => (
            <AntennaModel key={wire.tag} wire={wire} />
          ))}

        {/* Feedpoints */}
        {viewToggles.wires &&
          feedpoints.map((fp, i) => (
            <FeedpointMarker key={i} position={fp.position} />
          ))}

        {/* 3D Radiation Pattern — centered on antenna */}
        {viewToggles.pattern && patternData && (
          <RadiationPattern3D
            pattern={patternData}
            scale={5}
            opacity={0.65}
            center={antennaCentroid}
          />
        )}

        {/* Camera */}
        <CameraControls />

        {/* Post-processing */}
        <PostProcessing />
      </Suspense>
    </Canvas>
  );
}
