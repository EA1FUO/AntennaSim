/**
 * BackendEngine — SimulationEngine implementation that calls the FastAPI backend.
 *
 * This wraps the existing REST API and WebSocket calls.
 * Used when VITE_ENGINE=backend (the default, for Docker deployment).
 */

import { api } from "../../api/client";
import type { SimulationResult } from "../../api/nec";
import { buildGroundPayload } from "../ground";
import type {
  SimulationEngine,
  SimulateRequest,
  SimulateAdvancedRequest,
  ImportResult,
  ExportData,
  OptimizationRequest,
  OptimizationProgress,
  OptimizationResult,
} from "../types";

export class BackendEngine implements SimulationEngine {
  async simulate(request: SimulateRequest): Promise<SimulationResult> {
    const step = request.patternStep ?? 5;
    const body: Record<string, unknown> = {
      wires: request.wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1, y1: w.y1, z1: w.z1,
        x2: w.x2, y2: w.y2, z2: w.z2,
        radius: w.radius,
      })),
      excitations: [
        {
          wire_tag: request.excitation.wire_tag,
          segment: request.excitation.segment,
          voltage_real: request.excitation.voltage_real,
          voltage_imag: request.excitation.voltage_imag,
        },
      ],
      ground: buildGroundPayload(request.ground),
      frequency: {
        start_mhz: request.frequency.start_mhz,
        stop_mhz: request.frequency.stop_mhz,
        steps: request.frequency.steps,
      },
      pattern: {
        theta_start: -90,
        theta_stop: 90,
        theta_step: step,
        phi_start: 0,
        phi_stop: 360 - step,
        phi_step: step,
      },
      compute_currents: true,
      near_field: {
        enabled: true,
        plane: "horizontal",
        height_m: 1.8,
        extent_m: 20.0,
        resolution_m: 0.5,
      },
      comment: "AntennaSim simulation",
    };

    return api.post<SimulationResult>("/api/v1/simulate", body, {
      timeout: 60000,
    });
  }

  async simulateAdvanced(
    request: SimulateAdvancedRequest,
  ): Promise<SimulationResult> {
    const step = request.pattern_step ?? 5;
    const body: Record<string, unknown> = {
      wires: request.wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1, y1: w.y1, z1: w.z1,
        x2: w.x2, y2: w.y2, z2: w.z2,
        radius: w.radius,
      })),
      excitations: request.excitations.map((e) => ({
        wire_tag: e.wire_tag,
        segment: e.segment,
        voltage_real: e.voltage_real,
        voltage_imag: e.voltage_imag,
      })),
      ground: buildGroundPayload(request.ground),
      frequency: {
        start_mhz: request.frequency.start_mhz,
        stop_mhz: request.frequency.stop_mhz,
        steps: request.frequency.steps,
      },
      pattern: {
        theta_start: -90,
        theta_stop: 90,
        theta_step: step,
        phi_start: 0,
        phi_stop: 360 - step,
        phi_step: step,
      },
      loads: request.loads ?? [],
      transmission_lines: request.transmission_lines ?? [],
      arcs: request.arcs ?? [],
      transforms: request.transforms ?? [],
      ...(request.symmetry ? { symmetry: request.symmetry } : {}),
      compute_currents: request.compute_currents ?? true,
      near_field: {
        enabled: true,
        plane: "horizontal",
        height_m: 1.8,
        extent_m: 20.0,
        resolution_m: 0.5,
      },
      comment: request.comment ?? "AntennaSim V2 simulation",
    };

    return api.post<SimulationResult>("/api/v1/simulate", body, {
      timeout: 60000,
    });
  }

  async importFile(
    content: string,
    format: "nec" | "maa",
  ): Promise<ImportResult> {
    return api.post<ImportResult>("/api/v1/convert/import", {
      content,
      format,
    });
  }

  async exportFile(data: ExportData, format: "nec" | "maa"): Promise<string> {
    const resp = await api.post<{ content: string }>(
      "/api/v1/convert/export",
      {
        format,
        title: data.title,
        wires: data.wires.map((w) => ({
          tag: w.tag,
          segments: w.segments,
          x1: w.x1, y1: w.y1, z1: w.z1,
          x2: w.x2, y2: w.y2, z2: w.z2,
          radius: w.radius,
        })),
        excitations: data.excitations,
        loads: data.loads ?? [],
        ...(format === "nec"
          ? { transmission_lines: data.transmission_lines ?? [] }
          : {}),
        ground: { ground_type: data.ground.type },
        frequency_start_mhz: data.frequency_start_mhz,
        frequency_stop_mhz: data.frequency_stop_mhz,
        frequency_steps: data.frequency_steps,
      },
    );
    return resp.content;
  }

  async optimize(
    request: OptimizationRequest,
    onProgress: (progress: OptimizationProgress) => void,
  ): Promise<{ result: Promise<OptimizationResult>; cancel: () => void }> {
    // Derive WebSocket URL from API URL or page origin
    const apiBase = import.meta.env.VITE_API_URL;
    let wsBase: string;
    if (apiBase) {
      wsBase = (apiBase as string).replace(/^http/, "ws");
    } else {
      const proto =
        window.location.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${proto}//${window.location.host}`;
    }

    const wsUrl = `${wsBase}/api/v1/ws/optimize`;
    const ws = new WebSocket(wsUrl);

    let cancel = () => {
      ws.close();
    };

    const resultPromise = new Promise<OptimizationResult>(
      (resolve, reject) => {
        ws.onopen = () => {
          const payload = {
            wires: request.wires.map((w) => ({
              tag: w.tag,
              segments: w.segments,
              x1: w.x1, y1: w.y1, z1: w.z1,
              x2: w.x2, y2: w.y2, z2: w.z2,
              radius: w.radius,
            })),
            excitations: request.excitations.map((e) => ({
              wire_tag: e.wire_tag,
              segment: e.segment,
              voltage_real: e.voltage_real,
              voltage_imag: e.voltage_imag,
            })),
            ground: { ground_type: request.ground.type },
            frequency_start_mhz: request.frequency_start_mhz,
            frequency_stop_mhz: request.frequency_stop_mhz,
            frequency_steps: Math.min(request.frequency_steps, 21),
            loads: request.loads ?? [],
            transmission_lines: request.transmission_lines ?? [],
            variables: request.variables.map((v) => ({
              wire_tag: v.wire_tag,
              field: v.field,
              min_value: v.min_value,
              max_value: v.max_value,
            })),
            objective: request.objective,
            method: request.method ?? "nelder_mead",
            max_iterations: request.max_iterations,
            target_frequency_mhz: request.target_frequency_mhz,
          };
          ws.send(JSON.stringify(payload));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: "progress" | "result" | "error";
              data: OptimizationProgress | OptimizationResult | { message: string };
            };

            if (msg.type === "progress") {
              onProgress(msg.data as OptimizationProgress);
            } else if (msg.type === "result") {
              resolve(msg.data as OptimizationResult);
            } else if (msg.type === "error") {
              reject(
                new Error((msg.data as { message: string }).message),
              );
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          reject(new Error("WebSocket connection failed"));
        };

        ws.onclose = (event) => {
          if (!event.wasClean) {
            reject(new Error("WebSocket connection closed unexpectedly"));
          }
        };

        cancel = () => {
          ws.close();
          reject(new Error("Optimization cancelled"));
        };
      },
    );

    return { result: resultPromise, cancel };
  }
}
