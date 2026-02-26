import { EffectComposer, Bloom } from "@react-three/postprocessing";

/**
 * Subtle post-processing: bloom on emissive elements (feedpoint glow).
 * Keep effects minimal — target < 2ms GPU overhead.
 */
export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.8}
        luminanceSmoothing={0.3}
        intensity={0.4}
      />
    </EffectComposer>
  );
}
