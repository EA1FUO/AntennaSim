/**
 * ImportExportPanel — handles import/export of .maa, .nec, .json, .csv files.
 *
 * Placed in the editor page's right panel or as a modal.
 * Supports:
 * - Import: .maa, .nec, .json (native)
 * - Export: .maa, .nec, .json, .csv (results)
 */

import { useCallback, useRef } from "react";
import { api } from "../../api/client";
import { useEditorStore } from "../../stores/editorStore";
import { useSimulationStore } from "../../stores/simulationStore";
import { downloadTextFile } from "../../utils/csv-export";
import { downloadResultsCSV } from "../../utils/csv-export";
import { downloadViewportScreenshot } from "../../utils/screenshot";
import type { GroundConfig } from "../../templates/types";

interface ImportExportPanelProps {
  className?: string;
}

/** Map ground type string from backend to our GroundConfig */
function mapGroundType(type: string): GroundConfig {
  const validTypes = [
    "free_space",
    "perfect",
    "salt_water",
    "fresh_water",
    "pastoral",
    "average",
    "rocky",
    "city",
    "dry_sandy",
  ];
  if (validTypes.includes(type)) {
    return { type: type as GroundConfig["type"] };
  }
  return { type: "average" };
}

export function ImportExportPanel({ className = "" }: ImportExportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor store actions
  const clearAll = useEditorStore((s) => s.clearAll);
  const addWire = useEditorStore((s) => s.addWire);
  const addWireRaw = useEditorStore((s) => s.addWireRaw);
  const setExcitation = useEditorStore((s) => s.setExcitation);
  const setGround = useEditorStore((s) => s.setGround);
  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const loads = useEditorStore((s) => s.loads);
  const transmissionLines = useEditorStore((s) => s.transmissionLines);
  const ground = useEditorStore((s) => s.ground);
  const frequencyRange = useEditorStore((s) => s.frequencyRange);
  const setFrequencyRange = useEditorStore((s) => s.setFrequencyRange);

  // Simulation store
  const result = useSimulationStore((s) => s.result);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "json") {
        // Native JSON import
        try {
          const data = JSON.parse(content);
          if (data.wires && Array.isArray(data.wires)) {
            clearAll();
            for (const w of data.wires) {
              if (w.tag && w.segments) {
                addWireRaw({
                  tag: w.tag,
                  segments: w.segments,
                  x1: w.x1, y1: w.y1, z1: w.z1,
                  x2: w.x2, y2: w.y2, z2: w.z2,
                  radius: w.radius ?? 0.001,
                });
              } else {
                addWire({
                  x1: w.x1, y1: w.y1, z1: w.z1,
                  x2: w.x2, y2: w.y2, z2: w.z2,
                  radius: w.radius ?? 0.001,
                });
              }
            }
            if (data.excitations?.[0]) {
              setExcitation(
                data.excitations[0].wire_tag,
                data.excitations[0].segment
              );
            }
            if (data.ground) {
              setGround(data.ground);
            }
          }
        } catch {
          // Invalid JSON
        }
      } else if (ext === "maa" || ext === "nec") {
        // Use backend converter
        try {
          const resp = await api.post<{
            title: string;
            wires: Array<{
              tag: number; segments: number;
              x1: number; y1: number; z1: number;
              x2: number; y2: number; z2: number;
              radius: number;
            }>;
            excitations: Array<{
              wire_tag: number; segment: number;
              voltage_real: number; voltage_imag: number;
            }>;
            ground_type: string;
            frequency_start_mhz: number;
            frequency_stop_mhz: number;
            frequency_steps: number;
          }>("/api/v1/convert/import", {
            content,
            format: ext,
          });

          clearAll();
          for (const w of resp.wires) {
            addWireRaw({
              tag: w.tag,
              segments: w.segments,
              x1: w.x1, y1: w.y1, z1: w.z1,
              x2: w.x2, y2: w.y2, z2: w.z2,
              radius: w.radius,
            });
          }
          if (resp.excitations.length > 0) {
            const ex = resp.excitations[0]!;
            setExcitation(ex.wire_tag, ex.segment);
          }
          setGround(mapGroundType(resp.ground_type));
          setFrequencyRange({
            start_mhz: resp.frequency_start_mhz,
            stop_mhz: resp.frequency_stop_mhz,
            steps: resp.frequency_steps,
          });
        } catch {
          // API error
        }
      }

      // Reset input
      e.target.value = "";
    },
    [clearAll, addWire, setExcitation, setGround, setFrequencyRange]
  );

  const handleExportJSON = useCallback(() => {
    const data = {
      version: 1,
      title: "AntSim Project",
      wires: wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1, y1: w.y1, z1: w.z1,
        x2: w.x2, y2: w.y2, z2: w.z2,
        radius: w.radius,
      })),
      excitations,
      loads,
      transmission_lines: transmissionLines,
      ground,
      frequency: frequencyRange,
    };
    const json = JSON.stringify(data, null, 2);
    downloadTextFile(json, "antenna.json", "application/json");
  }, [wires, excitations, loads, transmissionLines, ground, frequencyRange]);

  const handleExportNEC = useCallback(async () => {
    try {
      const resp = await api.post<{ content: string }>("/api/v1/convert/export", {
        format: "nec",
        title: "AntSim export",
        wires: wires.map((w) => ({
          tag: w.tag,
          segments: w.segments,
          x1: w.x1, y1: w.y1, z1: w.z1,
          x2: w.x2, y2: w.y2, z2: w.z2,
          radius: w.radius,
        })),
        excitations,
        loads,
        transmission_lines: transmissionLines,
        ground: { ground_type: ground.type },
        frequency_start_mhz: frequencyRange.start_mhz,
        frequency_stop_mhz: frequencyRange.stop_mhz,
        frequency_steps: frequencyRange.steps,
      });
      downloadTextFile(resp.content, "antenna.nec", "text/plain");
    } catch {
      // API error
    }
  }, [wires, excitations, loads, transmissionLines, ground, frequencyRange]);

  const handleExportMAA = useCallback(async () => {
    try {
      const resp = await api.post<{ content: string }>("/api/v1/convert/export", {
        format: "maa",
        title: "AntSim export",
        wires: wires.map((w) => ({
          tag: w.tag,
          segments: w.segments,
          x1: w.x1, y1: w.y1, z1: w.z1,
          x2: w.x2, y2: w.y2, z2: w.z2,
          radius: w.radius,
        })),
        excitations,
        loads,
        ground: { ground_type: ground.type },
        frequency_start_mhz: frequencyRange.start_mhz,
        frequency_stop_mhz: frequencyRange.stop_mhz,
        frequency_steps: frequencyRange.steps,
      });
      downloadTextFile(resp.content, "antenna.maa", "text/plain");
    } catch {
      // API error
    }
  }, [wires, excitations, loads, ground, frequencyRange]);

  const handleExportCSV = useCallback(() => {
    if (result) {
      downloadResultsCSV(result.frequency_data);
    }
  }, [result]);

  const handleScreenshot = useCallback(() => {
    downloadViewportScreenshot();
  }, []);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".maa,.nec,.json,.MAA,.NEC,.JSON"
        className="hidden"
        onChange={handleFileChange}
      />

      <h4 className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
        Import / Export
      </h4>

      {/* Import */}
      <button
        onClick={handleImport}
        className="w-full px-2 py-1.5 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors text-left"
      >
        Import .maa / .nec / .json
      </button>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={handleExportJSON}
          disabled={wires.length === 0}
          className="px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
        >
          .json
        </button>
        <button
          onClick={handleExportNEC}
          disabled={wires.length === 0}
          className="px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
        >
          .nec
        </button>
        <button
          onClick={handleExportMAA}
          disabled={wires.length === 0}
          className="px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
        >
          .maa
        </button>
        <button
          onClick={handleExportCSV}
          disabled={!result}
          className="px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
        >
          .csv
        </button>
      </div>

      {/* Screenshot */}
      <button
        onClick={handleScreenshot}
        className="w-full px-2 py-1 text-[10px] rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
      >
        Screenshot (.png)
      </button>
    </div>
  );
}
