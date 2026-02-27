import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { GroundPlane } from "./GroundPlane";
import { CompassRose } from "./CompassRose";
import { AxesHelper } from "./AxesHelper";
import { AntennaModel, JunctionSpheres } from "./AntennaModel";
import { FeedpointMarker } from "./FeedpointMarker";
import { CameraControls } from "./CameraControls";
import { PostProcessing } from "./PostProcessing";
import { RadiationPattern3D } from "./RadiationPattern3D";
import { VolumetricShells } from "./VolumetricShells";
import { GroundReflection } from "./GroundReflection";
import { CurrentDistribution3D } from "./CurrentDistribution3D";
import { NearFieldPlane } from "./NearFieldPlane";
import { CurrentFlowParticles } from "./CurrentFlowParticles";
import { RadiationSlice } from "./RadiationSlice";
import type { WireData, FeedpointData, ViewToggles } from "./types";
import type { PatternData, SegmentCurrent, NearFieldResult } from "../../api/nec";
import { useUIStore } from "../../stores/uiStore";

interface SceneRootProps {
  wires: WireData[];
  feedpoints: FeedpointData[];
  viewToggles: ViewToggles;
  /** Radiation pattern data to render as 3D mesh */
  patternData?: PatternData | null;
  /** V2: Current distribution data */
  currents?: SegmentCurrent[] | null;
  /** V2: Near-field visualization data */
  nearField?: NearFieldResult | null;
}

export function SceneRoot({
  wires,
  feedpoints,
  viewToggles,
  patternData,
  currents,
  nearField,
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

        {/* Ground — auto-sized to antenna footprint */}
        {viewToggles.grid && <GroundPlane wires={wires} />}

        {/* Compass Rose */}
        {viewToggles.compass && <CompassRose />}

        {/* Axes */}
        <AxesHelper />

        {/* Antenna Wires */}
        {viewToggles.wires &&
          wires.map((wire) => (
            <AntennaModel key={wire.tag} wire={wire} />
          ))}

        {/* Wire junction spheres */}
        {viewToggles.wires && <JunctionSpheres wires={wires} />}

        {/* Feedpoints */}
        {viewToggles.wires &&
          feedpoints.map((fp, i) => (
            <FeedpointMarker key={i} position={fp.position} />
          ))}

        {/* 3D Radiation Pattern — surface mode */}
        {viewToggles.pattern && !viewToggles.volumetric && patternData && (
          <RadiationPattern3D
            pattern={patternData}
            scale={5}
            opacity={0.65}
            center={antennaCentroid}
          />
        )}

        {/* Volumetric pattern shells — alternative to surface */}
        {viewToggles.volumetric && patternData && (
          <VolumetricShells
            pattern={patternData}
            scale={5}
            center={antennaCentroid}
          />
        )}

        {/* Ground Reflection (ghost mirror) */}
        {viewToggles.reflection && <GroundReflection wires={wires} />}

        {/* Current Distribution overlay */}
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

        {/* Camera — auto-frames to antenna bounding box */}
        <CameraControls wires={wires} hasGround={viewToggles.grid} />

        {/* Post-processing */}
        <PostProcessing />
      </Suspense>
    </Canvas>
  );
}
