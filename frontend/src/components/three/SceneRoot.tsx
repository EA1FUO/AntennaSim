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
import type { WireData, FeedpointData, ViewToggles } from "./types";

interface SceneRootProps {
  wires: WireData[];
  feedpoints: FeedpointData[];
  viewToggles: ViewToggles;
}

export function SceneRoot({ wires, feedpoints, viewToggles }: SceneRootProps) {
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
      style={{ background: "#0A0A0F" }}
    >
      <Suspense fallback={null}>
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[20, 30, 10]}
          intensity={0.7}
          castShadow={false}
        />

        {/* Fog for depth perception */}
        <fog attach="fog" args={["#0A0A0F", 60, 200]} />

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

        {/* Camera */}
        <CameraControls />

        {/* Post-processing */}
        <PostProcessing />
      </Suspense>
    </Canvas>
  );
}
