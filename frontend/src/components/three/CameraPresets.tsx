import type { CameraPreset } from "./types";

const PRESETS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  top: { position: [0, 40, 0.01], target: [0, 0, 0] },
  front: { position: [0, 10, 30], target: [0, 10, 0] },
  side: { position: [30, 10, 0], target: [0, 10, 0] },
  isometric: { position: [15, 12, 15], target: [0, 5, 0] },
};

interface CameraPresetsProps {
  onPreset: (preset: CameraPreset) => void;
  activePreset: CameraPreset | null;
}

/**
 * Camera preset buttons overlay — rendered as HTML on top of canvas.
 */
export function CameraPresetsOverlay({ onPreset, activePreset }: CameraPresetsProps) {
  const buttons: { key: CameraPreset; label: string }[] = [
    { key: "top", label: "Top" },
    { key: "front", label: "Front" },
    { key: "side", label: "Side" },
    { key: "isometric", label: "3D" },
  ];

  return (
    <div className="absolute top-2 right-2 flex gap-1 z-10">
      {buttons.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onPreset(key)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activePreset === key
              ? "bg-accent text-white"
              : "bg-surface/80 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          } backdrop-blur-sm border border-border/50`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Get camera position/target for a preset */
export function getPresetCamera(preset: CameraPreset) {
  return PRESETS[preset];
}
