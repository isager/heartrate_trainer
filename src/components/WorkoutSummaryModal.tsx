/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Award,
  Heart,
  Zap,
  Clock,
  Flame,
  Download,
  FileCode,
  Gauge,
  CheckCircle2,
} from 'lucide-react';
import { WorkoutSessionSummary, HeartRateZone } from '../types/workout';
import { exportWorkoutToTcx, exportWorkoutToCsv } from '../services/storage';
import { RollingTelemetryChart } from './RollingTelemetryChart';

interface WorkoutSummaryModalProps {
  session: WorkoutSessionSummary | null;
  zones: HeartRateZone[];
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  session,
  zones,
  onClose,
}) => {
  if (!session) return null;

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Calculate percentage of time spent in each zone
  const totalZoneSec = Object.values(session.timeInZonesSec).reduce((a, b) => a + b, 0) || session.durationSec || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-4 sm:p-6 space-y-4 sm:space-y-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Award className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <span className="text-[10px] sm:text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Workout Summary & Telemetry
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {session.workoutName}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Completed on {session.date} · {formatDuration(session.durationSec)}
            </p>
          </div>
        </div>

        {/* Top 4 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Heart className="w-4 h-4 text-rose-500" />
              <span>Avg Heart Rate</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {session.avgHr} <span className="text-xs font-normal text-slate-400">BPM</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Peak: <strong className="text-rose-400 font-mono">{session.maxHr} BPM</strong>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Zap className="w-4 h-4 text-violet-400" />
              <span>Avg Power</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {session.avgPower} <span className="text-xs font-normal text-slate-400">W</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Peak: <strong className="text-violet-300 font-mono">{session.maxPower} W</strong>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Duration</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {formatDuration(session.durationSec)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Distance: ~{session.distanceKm} km
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Energy</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {session.estimatedCalories} <span className="text-xs font-normal text-slate-400">kcal</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Avg Cadence: <strong className="text-emerald-400 font-mono">{session.avgCadence} RPM</strong>
            </div>
          </div>
        </div>

        {/* TIME IN HEART RATE ZONES BREAKDOWN */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider">
              Time in Heart Rate Zones
            </h4>
            <span className="text-slate-400 font-mono">Total {formatDuration(session.durationSec)}</span>
          </div>

          <div className="space-y-2">
            {zones.map(z => {
              const secondsInZone = session.timeInZonesSec[z.zone] || 0;
              const percent = Math.round((secondsInZone / totalZoneSec) * 100);

              let barBg = 'bg-sky-500';
              if (z.zone === 2) barBg = 'bg-emerald-500';
              if (z.zone === 3) barBg = 'bg-amber-500';
              if (z.zone === 4) barBg = 'bg-orange-500';
              if (z.zone === 5) barBg = 'bg-rose-500';

              return (
                <div key={z.zone} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      Z{z.zone} · {z.name} <span className="text-slate-500 font-mono">({z.minBpm}-{z.maxBpm} BPM)</span>
                    </span>
                    <span className="font-mono text-slate-300">
                      {formatDuration(secondsInZone)} <span className="text-slate-500">({percent}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className={`h-full ${barBg} rounded-full transition-all`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Telemetry Chart of the Completed Workout */}
        {session.samples.length > 2 && (
          <div className="h-[200px]">
            <RollingTelemetryChart
              samples={session.samples}
              targetHr={session.avgHr}
              zones={zones}
              windowSec={session.durationSec}
            />
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportWorkoutToTcx(session)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-rose-950/40"
            >
              <Download className="w-4 h-4" />
              <span>Export Garmin / Strava TCX</span>
            </button>

            <button
              onClick={() => exportWorkoutToCsv(session)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-2"
            >
              <FileCode className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
