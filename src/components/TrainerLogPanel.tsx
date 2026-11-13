/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Terminal,
  Download,
  FileJson,
  Trash2,
  Pause,
  Play,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { trainerLogger, TrainerLogEntry } from '../services/trainerLogger';

interface TrainerLogPanelProps {
  isSimulated: boolean;
}

export const TrainerLogPanel: React.FC<TrainerLogPanelProps> = ({ isSimulated }) => {
  const [logs, setLogs] = useState<TrainerLogEntry[]>(() => trainerLogger.getLogs());
  const [filterDir, setFilterDir] = useState<'ALL' | 'RX' | 'TX' | 'CALIBRATION'>('ALL');
  const [includeSimulator, setIncludeSimulator] = useState<boolean>(true);
  const [isPausedView, setIsPausedView] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = trainerLogger.subscribe((updatedLogs) => {
      if (!isPausedView) {
        setLogs(updatedLogs);
      }
    });
    return unsubscribe;
  }, [isPausedView]);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (!includeSimulator && entry.source === 'SIMULATOR') {
        return false;
      }
      if (filterDir === 'RX') return entry.direction === 'RX';
      if (filterDir === 'TX') return entry.direction === 'TX';
      if (filterDir === 'CALIBRATION') {
        return entry.source === 'CALIBRATION' || entry.source === 'FTMS_CTRL' || entry.source === 'FTMS_STATUS';
      }
      return true;
    });
  }, [logs, filterDir, includeSimulator]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-lg">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Trainer Communication Log
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Raw BLE FTMS / FE-C packets, resistance commands, and decoded speed/power telemetry ({logs.length} buffered frames).
            </p>
          </div>
        </div>

        {/* Export & Stream Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPausedView(!isPausedView)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              isPausedView
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
            }`}
          >
            {isPausedView ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPausedView ? 'Resume View' : 'Freeze'}</span>
          </button>

          <button
            onClick={() => trainerLogger.exportCsv()}
            disabled={logs.length === 0}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-400 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            title="Download communication log as CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => trainerLogger.exportJson()}
            disabled={logs.length === 0}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sky-400 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            title="Download raw hex + parsed JSON log"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            onClick={() => {
              trainerLogger.clear();
              setLogs([]);
            }}
            disabled={logs.length === 0}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
            title="Clear Log Buffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'ALL', label: 'All Packets' },
              { id: 'RX', label: 'RX (Trainer → App)' },
              { id: 'TX', label: 'TX (App → Trainer)' },
              { id: 'CALIBRATION', label: 'Control & Cal' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterDir(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                filterDir === f.id
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSimulator}
            onChange={(e) => setIncludeSimulator(e.target.checked)}
            className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
          />
          <span>
            Include Simulator Frames {isSimulated ? '(Active)' : ''}
          </span>
        </label>
      </div>

      {/* Log Stream Window */}
      <div className="bg-slate-950 border border-slate-800/90 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-400">No trainer communication frames captured yet.</p>
            <p>
              Pair your Tacx Vortex trainer or enable Simulation mode to inspect raw BLE packets and calibration responses.
            </p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-900 font-mono text-[11px]">
            {filteredLogs.slice(0, 120).map((entry) => (
              <div
                key={entry.id}
                className="px-3 py-2 hover:bg-slate-900/60 transition-colors flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500">{formatTime(entry.timestamp)}</span>

                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      entry.direction === 'RX'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : entry.direction === 'TX'
                        ? 'bg-amber-500/15 text-amber-400'
                        : entry.direction === 'ERR'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    {entry.direction === 'RX' && <ArrowDownLeft className="w-2.5 h-2.5" />}
                    {entry.direction === 'TX' && <ArrowUpRight className="w-2.5 h-2.5" />}
                    {entry.direction === 'INFO' && <Info className="w-2.5 h-2.5" />}
                    {entry.direction === 'ERR' && <AlertTriangle className="w-2.5 h-2.5" />}
                    {entry.direction}
                  </span>

                  <span className="text-[10px] font-semibold text-cyan-400/90 min-w-[76px]">
                    {entry.source === 'CALIBRATION' ? (
                      <span className="inline-flex items-center gap-1 text-violet-300">
                        <Sliders className="w-2.5 h-2.5" />
                        CALIB
                      </span>
                    ) : (
                      entry.source
                    )}
                  </span>
                </div>

                <div className="flex-1 text-slate-200 break-words leading-relaxed font-sans text-xs">
                  {entry.summary}
                </div>

                {entry.rawHex && (
                  <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0 overflow-x-auto max-w-full">
                    {entry.rawHex}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
