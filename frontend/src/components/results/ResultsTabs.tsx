/**
 * Results tabs container — wraps all result views (SWR, Impedance, Pattern, Gain).
 * Used in the right panel on desktop and results sheet on mobile.
 */

import { useCallback } from "react";
import { Tabs } from "../ui/Tabs";
import { SWRChart } from "./SWRChart";
import { ImpedanceChart } from "./ImpedanceChart";
import { GainTable } from "./GainTable";
import { PatternPolar } from "./PatternPolar";
import { useSimulationStore } from "../../stores/simulationStore";
import { useUIStore, type ResultsTab } from "../../stores/uiStore";
import { formatSwr, formatImpedance, formatGain, swrColorClass } from "../../utils/units";

const TABS = [
  { key: "swr", label: "SWR" },
  { key: "impedance", label: "Z" },
  { key: "pattern", label: "Pattern" },
  { key: "gain", label: "Gain" },
];

export function ResultsPanel() {
  const status = useSimulationStore((s) => s.status);
  const result = useSimulationStore((s) => s.result);
  const error = useSimulationStore((s) => s.error);
  const selectedFreqIndex = useSimulationStore((s) => s.selectedFreqIndex);
  const setSelectedFreqIndex = useSimulationStore((s) => s.setSelectedFreqIndex);
  const selectedFreqResult = useSimulationStore((s) =>
    s.getSelectedFrequencyResult()
  );

  const resultsTab = useUIStore((s) => s.resultsTab);
  const setResultsTab = useUIStore((s) => s.setResultsTab);

  const handleTabChange = useCallback(
    (key: string) => setResultsTab(key as ResultsTab),
    [setResultsTab]
  );

  const handleFreqClick = useCallback(
    (index: number) => setSelectedFreqIndex(index),
    [setSelectedFreqIndex]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs tabs={TABS} activeKey={resultsTab} onChange={handleTabChange} />

      <div className="flex-1 overflow-y-auto p-3">
        {/* Idle state */}
        {status === "idle" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary text-center px-4">
              Run a simulation to see results here.
            </p>
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-text-secondary">
                Running NEC2 simulation...
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-swr-bad text-center px-4">{error}</p>
          </div>
        )}

        {/* Success state */}
        {status === "success" && result && (
          <div className="space-y-3">
            {/* Quick summary — always visible */}
            {selectedFreqResult && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background rounded-md p-2">
                  <div className="text-[10px] text-text-secondary">SWR</div>
                  <div
                    className={`text-lg font-mono font-bold ${swrColorClass(selectedFreqResult.swr_50)}`}
                  >
                    {formatSwr(selectedFreqResult.swr_50)}
                  </div>
                </div>
                <div className="bg-background rounded-md p-2">
                  <div className="text-[10px] text-text-secondary">Gain</div>
                  <div className="text-lg font-mono font-bold text-text-primary">
                    {formatGain(selectedFreqResult.gain_max_dbi)}
                  </div>
                </div>
                <div className="bg-background rounded-md p-2 col-span-2">
                  <div className="text-[10px] text-text-secondary">Impedance</div>
                  <div className="text-sm font-mono text-text-primary">
                    {formatImpedance(
                      selectedFreqResult.impedance.real,
                      selectedFreqResult.impedance.imag
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="border-t border-border pt-3">
              {resultsTab === "swr" && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-text-secondary">
                    SWR vs Frequency
                  </h4>
                  <SWRChart
                    data={result.frequency_data}
                    onFrequencyClick={handleFreqClick}
                    selectedIndex={selectedFreqIndex}
                  />
                </div>
              )}

              {resultsTab === "impedance" && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-text-secondary">
                    Impedance vs Frequency
                  </h4>
                  <ImpedanceChart data={result.frequency_data} />
                </div>
              )}

              {resultsTab === "pattern" && selectedFreqResult && (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-text-secondary">
                    Radiation Pattern
                  </h4>
                  {selectedFreqResult.pattern ? (
                    <div className="space-y-3">
                      <PatternPolar
                        pattern={selectedFreqResult.pattern}
                        mode="azimuth"
                        size={180}
                      />
                      <PatternPolar
                        pattern={selectedFreqResult.pattern}
                        mode="elevation"
                        size={180}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary text-center py-4">
                      No pattern data available for this frequency.
                    </p>
                  )}
                </div>
              )}

              {resultsTab === "gain" && selectedFreqResult && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-text-secondary">
                    Performance Summary
                  </h4>
                  <GainTable data={selectedFreqResult} />
                </div>
              )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="border-t border-border pt-2 space-y-1">
                {result.warnings.map((w, i) => (
                  <p
                    key={i}
                    className="text-[10px] text-swr-warning leading-relaxed"
                  >
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
