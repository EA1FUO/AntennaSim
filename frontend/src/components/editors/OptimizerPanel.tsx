/**
 * OptimizerPanel — V2 antenna parameter optimization UI.
 *
 * Uses the SimulationEngine abstraction for optimization:
 * - BackendEngine: WebSocket to backend
 * - WasmEngine: Web Worker running locally (future)
 *
 * Features:
 * 1. Live progress bar
 * 2. Live best cost value
 * 3. Convergence chart (updates live)
 * 4. Cancel button
 * 5. Apply optimized parameters to the editor
 */

import { useCallback, useState, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useEditorStore } from "../../stores/editorStore";
import { useChartTheme } from "../../hooks/useChartTheme";
import { Button } from "../ui/Button";
import { NumberInput } from "../ui/NumberInput";
import { getEngine } from "../../engine";
import type {
  OptimizationProgress,
  OptimizationResult,
} from "../../engine/types";

type Objective = "min_swr" | "min_swr_band" | "max_gain" | "max_fb";

interface Variable {
  wireTag: number;
  field: string;
  minValue: number;
  maxValue: number;
}

const OBJECTIVES: { key: Objective; label: string }[] = [
  { key: "min_swr", label: "Min SWR" },
  { key: "min_swr_band", label: "Min SWR (band)" },
  { key: "max_gain", label: "Max Gain" },
  { key: "max_fb", label: "Max F/B" },
];

const WIRE_FIELDS = ["x1", "y1", "z1", "x2", "y2", "z2"];

export function OptimizerPanel() {
  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const ground = useEditorStore((s) => s.ground);
  const frequencyRange = useEditorStore((s) => s.frequencyRange);
  const loads = useEditorStore((s) => s.loads);
  const transmissionLines = useEditorStore((s) => s.transmissionLines);
  const updateWire = useEditorStore((s) => s.updateWire);

  const ct = useChartTheme();

  const [objective, setObjective] = useState<Objective>("min_swr");
  const [maxIterations, setMaxIterations] = useState(50);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live progress state
  const [progress, setProgress] = useState<OptimizationProgress | null>(null);
  const [liveHistory, setLiveHistory] = useState<{ iteration: number; cost: number }[]>([]);

  // Cancel function ref
  const cancelRef = useRef<(() => void) | null>(null);

  // Add a variable
  const addVariable = useCallback(() => {
    if (wires.length === 0) return;
    const firstWire = wires[0]!;
    setVariables((v) => [
      ...v,
      {
        wireTag: firstWire.tag,
        field: "z2",
        minValue: -20,
        maxValue: 20,
      },
    ]);
  }, [wires]);

  const removeVariable = useCallback((index: number) => {
    setVariables((v) => v.filter((_, i) => i !== index));
  }, []);

  const updateVariable = useCallback(
    (index: number, updates: Partial<Variable>) => {
      setVariables((v) => {
        const newVars = [...v];
        newVars[index] = { ...newVars[index]!, ...updates };
        return newVars;
      });
    },
    []
  );

  // Cancel optimization
  const handleCancel = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsRunning(false);
    setProgress(null);
  }, []);

  // Run optimization via engine
  const handleOptimize = useCallback(() => {
    if (variables.length === 0 || wires.length === 0) return;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setLiveHistory([]);

    const engine = getEngine();

    const request = {
      wires: wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1, y1: w.y1, z1: w.z1,
        x2: w.x2, y2: w.y2, z2: w.z2,
        radius: w.radius,
      })),
      excitations: excitations.map((e) => ({
        wire_tag: e.wire_tag,
        segment: e.segment,
        voltage_real: e.voltage_real,
        voltage_imag: e.voltage_imag,
      })),
      ground,
      frequency_start_mhz: frequencyRange.start_mhz,
      frequency_stop_mhz: frequencyRange.stop_mhz,
      frequency_steps: Math.min(frequencyRange.steps, 21),
      loads,
      transmission_lines: transmissionLines,
      variables: variables.map((v) => ({
        wire_tag: v.wireTag,
        field: v.field,
        min_value: v.minValue,
        max_value: v.maxValue,
      })),
      objective,
      method: "nelder_mead",
      max_iterations: maxIterations,
      target_frequency_mhz: (frequencyRange.start_mhz + frequencyRange.stop_mhz) / 2,
    };

    engine
      .optimize(request, (p) => {
        setProgress(p);
        setLiveHistory((prev) => [
          ...prev,
          { iteration: p.iteration, cost: p.current_cost },
        ]);
      })
      .then(({ result: resultPromise, cancel }) => {
        cancelRef.current = cancel;

        resultPromise
          .then((optResult) => {
            setResult(optResult);
            setIsRunning(false);
            setProgress(null);
            cancelRef.current = null;
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : "Optimization failed";
            if (msg !== "Optimization cancelled") {
              setError(msg);
            }
            setIsRunning(false);
            setProgress(null);
            cancelRef.current = null;
          });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to start optimization";
        setError(msg);
        setIsRunning(false);
        setProgress(null);
      });
  }, [variables, wires, excitations, ground, frequencyRange, loads, transmissionLines, objective, maxIterations]);

  // Apply optimized values back to editor
  const handleApply = useCallback(() => {
    if (!result) return;
    for (const wire of result.optimized_wires) {
      updateWire(wire.tag, {
        x1: wire.x1, y1: wire.y1, z1: wire.z1,
        x2: wire.x2, y2: wire.y2, z2: wire.z2,
      });
    }
  }, [result, updateWire]);

  // Chart data — use live history during optimization, final history after
  const chartData = isRunning
    ? liveHistory
    : (result?.history.map((h) => ({ iteration: h.iteration, cost: h.cost })) ?? []);

  // Progress percentage
  const progressPct = progress
    ? Math.min(100, Math.round((progress.iteration / progress.total_iterations) * 100))
    : 0;

  return (
    <div className="space-y-2">
      {/* Objective selection */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text-secondary shrink-0">Goal:</span>
        <select
          value={objective}
          onChange={(e) => setObjective(e.target.value as Objective)}
          className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border outline-none"
        >
          {OBJECTIVES.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Max iterations */}
      <NumberInput
        label="Iterations:"
        value={maxIterations}
        onChange={setMaxIterations}
        min={10}
        max={500}
        decimals={0}
      />

      {/* Variables */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Variables</span>
          <button
            onClick={addVariable}
            disabled={wires.length === 0}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-40"
          >
            + Add
          </button>
        </div>

        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-1 bg-background rounded p-1">
            <select
              value={v.wireTag}
              onChange={(e) => updateVariable(i, { wireTag: parseInt(e.target.value) })}
              className="bg-transparent text-text-primary text-[9px] font-mono outline-none w-12"
            >
              {wires.map((w) => (
                <option key={w.tag} value={w.tag}>
                  W{w.tag}
                </option>
              ))}
            </select>
            <select
              value={v.field}
              onChange={(e) => updateVariable(i, { field: e.target.value })}
              className="bg-transparent text-text-primary text-[9px] font-mono outline-none w-8"
            >
              {WIRE_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <NumberInput
              value={v.minValue}
              onChange={(val) => updateVariable(i, { minValue: val })}
              decimals={1}
            />
            <span className="text-[9px] text-text-secondary">-</span>
            <NumberInput
              value={v.maxValue}
              onChange={(val) => updateVariable(i, { maxValue: val })}
              decimals={1}
            />
            <button
              onClick={() => removeVariable(i)}
              className="text-text-secondary hover:text-swr-bad text-[9px] ml-auto"
            >
              x
            </button>
          </div>
        ))}

        {variables.length === 0 && (
          <p className="text-[9px] text-text-secondary">
            Add variables to define what to optimize.
          </p>
        )}
      </div>

      {/* Run / Cancel buttons */}
      {isRunning ? (
        <Button
          onClick={handleCancel}
          className="w-full"
          size="sm"
          variant="danger"
        >
          Cancel
        </Button>
      ) : (
        <Button
          onClick={handleOptimize}
          disabled={variables.length === 0 || wires.length === 0}
          className="w-full"
          size="sm"
        >
          Run Optimizer
        </Button>
      )}

      {/* Live progress bar */}
      {isRunning && progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9px] text-text-secondary">
            <span>Iteration {progress.iteration}/{progress.total_iterations}</span>
            <span className="font-mono">Best: {progress.best_cost.toFixed(4)}</span>
          </div>
          <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Live convergence chart during optimization */}
      {isRunning && liveHistory.length > 2 && (
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveHistory}>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="iteration"
                stroke={ct.axis}
                tick={{ fontSize: 7, fill: ct.tick }}
              />
              <YAxis
                stroke={ct.axis}
                tick={{ fontSize: 7, fill: ct.tick }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#3B82F6"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[10px] text-swr-bad">{error}</p>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-text-secondary">
              {result.status} in {result.iterations_used} iterations
            </div>
            <button
              onClick={handleApply}
              className="text-[10px] px-2 py-0.5 rounded border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
            >
              Apply
            </button>
          </div>

          {/* Optimized values */}
          <div className="text-[9px] font-mono text-text-primary space-y-0.5">
            {Object.entries(result.optimized_values).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-text-secondary">{key}:</span>
                <span>{val.toFixed(4)} m</span>
              </div>
            ))}
          </div>

          {/* Convergence chart (final) */}
          {chartData.length > 2 && (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="iteration"
                    stroke={ct.axis}
                    tick={{ fontSize: 7, fill: ct.tick }}
                  />
                  <YAxis
                    stroke={ct.axis}
                    tick={{ fontSize: 7, fill: ct.tick }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: ct.tooltipBg,
                      border: `1px solid ${ct.tooltipBorder}`,
                      borderRadius: "4px",
                      fontSize: "9px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
