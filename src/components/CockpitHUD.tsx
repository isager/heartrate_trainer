/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Heart,
  Zap,
  RotateCw,
  Gauge,
  Play,
  Pause,
  Square,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  Sliders,
  Flame,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import {
  HeartRateData,
  TrainerData,
  HeartRateZone,
  WorkoutInterval,
  ControllerDecision,
  ControllerSettings,
} from '../types/workout';
import { RollingTelemetryChart } from './RollingTelemetryChart';
import { TelemetrySample } from '../types/workout';

interface CockpitHUDProps {
  heartRate: HeartRateData | null;
  trainer: TrainerData | null;
  currentZone: HeartRateZone;
  zones: HeartRateZone[];
  controllerSettings: ControllerSettings;
  onUpdateSettings: (newSettings: Partial<ControllerSettings>) => void;
  lastDecision: ControllerDecision | null;
  onManualResistanceNudge: (deltaPercent: number) => void;
  // Workout execution state
  isWorkoutActive: boolean;
  isPaused: boolean;
  onStartWorkout: () => void;
  onPauseWorkout: () => void;
  onResumeWorkout: () => void;
  onStopWorkout: () => void;
  workoutElapsedTimeSec: number;
  currentInterval: WorkoutInterval | null;
  currentIntervalIndex: number;
  totalIntervals: number;
  intervalRemainingSec: number;
  nextInterval: WorkoutInterval | null;
  samples: TelemetrySample[];
  // Simulator triggers
  isSimulated: boolean;
  onSimulateSprint: () => void;
  simulatedEffort: number;
  onChangeSimulatedEffort: (effort: number) => void;
}

export const CockpitHUD: React.FC<CockpitHUDProps> = ({
  heartRate,
  trainer,
  currentZone,
  zones,
  controllerSettings,
  onUpdateSettings,
  lastDecision,
  onManualResistanceNudge,
  isWorkoutActive,
  isPaused,
  onStartWorkout,
  onPauseWorkout,
  onResumeWorkout,
  onStopWorkout,
  workoutElapsedTimeSec,
  currentInterval,
  currentIntervalIndex,
  totalIntervals,
  intervalRemainingSec,
  nextInterval,
  samples,
  isSimulated,
  onSimulateSprint,
  simulatedEffort,
  onChangeSimulatedEffort,
}) => {
  const bpm = heartRate?.bpm || 0;
  const resistance = trainer?.resistancePercent || 25;
  const power = trainer?.powerWatts || 0;
  const cadence = trainer?.cadenceRpm || 0;
  const speed = trainer?.speedKmh || 0;

  const hrDelta = bpm > 0 ? bpm - controllerSettings.targetHr : 0;
  const isEmergency = bpm >= controllerSettings.emergencyMaxHrCutoff;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Emergency Alert Banner if HR is too high */}
      {isEmergency && (
        <div className="bg-rose-500/20 border-2 border-rose-500 rounded-2xl p-4 flex items-center gap-3 animate-pulse text-rose-200">
          <AlertTriangle className="w-7 h-7 text-rose-400 shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold text-base text-rose-100 uppercase tracking-wide">
              Emergency Cardiac Safety Override Active!
            </h4>
            <p className="text-sm text-rose-200/90">
              Heart rate has exceeded your safety threshold ({controllerSettings.emergencyMaxHrCutoff} BPM).
              Trainer resistance has been dumped by 15% to safeguard cardiovascular recovery. Ease off pedaling.
            </p>
          </div>
        </div>
      )}

      {/* TOP WORKOUT STATUS & CONTROLS STRIP */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Workout Timer & Interval progress */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider">
              {isWorkoutActive ? (
                isPaused ? (
                  <span className="flex items-center gap-1 text-amber-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Paused
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    Live Ride
                  </span>
                )
              ) : (
                <span className="text-slate-400">Elapsed Time</span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-tight">
              {formatTime(workoutElapsedTimeSec)}
            </div>
          </div>

          {currentInterval && (
            <div className="border-l border-slate-800 pl-4 sm:pl-6">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Interval {currentIntervalIndex + 1}/{totalIntervals}
                </span>
                <span className="text-xs text-rose-400 font-semibold">
                  {currentInterval.name}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-mono font-bold text-rose-300">
                  {formatTime(intervalRemainingSec)}
                </span>
                <span className="text-xs text-slate-400">remaining</span>
              </div>
              {/* Interval Progress Bar */}
              <div className="w-32 sm:w-40 h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-rose-500 transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((currentInterval.durationSec - intervalRemainingSec) / currentInterval.durationSec) * 100))}%`
                  }}
                />
              </div>
            </div>
          )}

          {nextInterval && (
            <div className="hidden lg:flex flex-col justify-center border-l border-slate-800 pl-6 text-xs text-slate-400">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Up Next</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-slate-200">{nextInterval.name}</span>
                <span className="font-mono text-slate-400">({formatTime(nextInterval.durationSec)} @ {nextInterval.targetHr} BPM)</span>
              </div>
            </div>
          )}
        </div>

        {/* Start / Pause / Stop Actions */}
        <div className="flex items-center gap-2">
          {!isWorkoutActive ? (
            <button
              onClick={onStartWorkout}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-rose-950/40 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Workout</span>
            </button>
          ) : (
            <>
              {isPaused ? (
                <button
                  onClick={onResumeWorkout}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={onPauseWorkout}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              )}
              <button
                onClick={onStopWorkout}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Finish</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* PRIMARY 4-TILE CYCLING HUD (High visibility from bicycle mount on mobile & desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* TILE 1: HEART RATE & ZONE */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-3.5 sm:p-5 relative overflow-hidden flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 text-rose-400">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-rose-500/20 text-rose-500 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-400">
                Heart Rate
              </span>
            </div>
            {/* Zone Tag */}
            <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded truncate max-w-[90px] sm:max-w-none ${currentZone.bgColor} ${currentZone.color} border ${currentZone.borderColor}`}>
              Z{currentZone.zone} <span className="hidden sm:inline">· {currentZone.name}</span>
            </span>
          </div>

          <div className="my-2 sm:my-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-4xl sm:text-6xl sm:text-7xl font-mono font-extrabold text-white tracking-tighter">
              {bpm > 0 ? bpm : '--'}
            </span>
            <span className="text-slate-400 font-mono text-xs sm:text-lg font-medium">BPM</span>
          </div>

          {/* Target Delta and zone bar */}
          <div className="space-y-1.5 sm:space-y-2 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[11px] sm:text-xs">
              <span className="text-slate-400">
                Target: <strong className="text-amber-400 font-mono">{controllerSettings.targetHr}</strong>
              </span>
              <span className={`font-mono font-semibold flex items-center gap-0.5 ${
                Math.abs(hrDelta) <= controllerSettings.deadbandBpm
                  ? 'text-emerald-400'
                  : hrDelta > 0
                  ? 'text-rose-400'
                  : 'text-sky-400'
              }`}>
                {Math.abs(hrDelta) <= controllerSettings.deadbandBpm ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Locked</span>
                  </>
                ) : hrDelta > 0 ? (
                  <>
                    <ArrowUpRight className="w-3 h-3" />
                    <span>+{hrDelta}</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-3 h-3" />
                    <span>{hrDelta}</span>
                  </>
                )}
              </span>
            </div>

            {/* Micro 5-zone progress bar */}
            <div className="grid grid-cols-5 gap-0.5 sm:gap-1 h-1.5 rounded-full overflow-hidden bg-slate-800">
              {zones.map(z => (
                <div
                  key={z.zone}
                  className={`h-full transition-colors ${
                    currentZone.zone === z.zone ? 'bg-rose-500 shadow-sm' : 'bg-slate-700/50'
                  }`}
                  title={`${z.name}: ${z.minBpm}-${z.maxBpm} BPM`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TILE 2: TACX RESISTANCE & CLOSED-LOOP CONTROLLER */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-3.5 sm:p-5 relative overflow-hidden flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 text-cyan-400">
              <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-400">
                Resistance
              </span>
            </div>
            {/* Auto status badge */}
            <span className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded uppercase tracking-wider ${
              lastDecision?.action === 'increase'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : lastDecision?.action === 'decrease'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : lastDecision?.action === 'emergency_cutback'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {lastDecision?.action === 'increase'
                ? 'Ramping'
                : lastDecision?.action === 'decrease'
                ? 'Relieving'
                : lastDecision?.action === 'emergency_cutback'
                ? 'Cutback'
                : 'Hold'}
            </span>
          </div>

          <div className="my-2 sm:my-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-4xl sm:text-6xl sm:text-7xl font-mono font-extrabold text-cyan-400 tracking-tighter">
              {resistance}
            </span>
            <span className="text-slate-400 font-mono text-xs sm:text-lg font-medium">%</span>
          </div>

          {/* Quick manual resistance nudge buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
            <span className="hidden sm:inline text-xs text-slate-400">Nudge</span>
            <div className="flex items-center justify-between w-full sm:w-auto gap-1">
              <button
                onClick={() => onManualResistanceNudge(-5)}
                className="flex-1 sm:flex-initial px-1.5 sm:px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded font-mono text-[11px] sm:text-xs font-semibold transition-colors"
                title="Decrease resistance by 5%"
              >
                -5%
              </button>
              <button
                onClick={() => onManualResistanceNudge(-1)}
                className="flex-1 sm:flex-initial px-1.5 sm:px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded font-mono text-[11px] sm:text-xs font-semibold transition-colors"
                title="Decrease resistance by 1%"
              >
                -1%
              </button>
              <button
                onClick={() => onManualResistanceNudge(1)}
                className="flex-1 sm:flex-initial px-1.5 sm:px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded font-mono text-[11px] sm:text-xs font-semibold transition-colors"
                title="Increase resistance by 1%"
              >
                +1%
              </button>
              <button
                onClick={() => onManualResistanceNudge(5)}
                className="flex-1 sm:flex-initial px-1.5 sm:px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-slate-300 rounded font-mono text-[11px] sm:text-xs font-semibold transition-colors"
                title="Increase resistance by 5%"
              >
                +5%
              </button>
            </div>
          </div>
        </div>

        {/* TILE 3: POWER OUTPUT */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-3.5 sm:p-5 relative overflow-hidden flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 text-violet-400">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-400">
                Power
              </span>
            </div>
            <span className="text-[10px] sm:text-xs font-mono text-slate-400">
              {controllerSettings.ftpWatts > 0
                ? `${Math.round((power / controllerSettings.ftpWatts) * 100)}% FTP`
                : 'Watts'}
            </span>
          </div>

          <div className="my-2 sm:my-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-4xl sm:text-6xl sm:text-7xl font-mono font-extrabold text-violet-300 tracking-tighter">
              {power}
            </span>
            <span className="text-slate-400 font-mono text-xs sm:text-lg font-medium">W</span>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
            <span>W/kg:</span>
            <span className="font-mono font-semibold text-slate-200">
              {(power / (controllerSettings.riderWeightKg || 70)).toFixed(1)}
            </span>
          </div>
        </div>

        {/* TILE 4: CADENCE & VIRTUAL SPEED */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-3.5 sm:p-5 relative overflow-hidden flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-400">
              <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-slate-400">
                Cadence
              </span>
            </div>
            <span className="text-[10px] sm:text-xs text-slate-400 font-mono">
              <strong className="text-white">{speed}</strong> km/h
            </span>
          </div>

          <div className="my-2 sm:my-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-4xl sm:text-6xl sm:text-7xl font-mono font-extrabold text-emerald-400 tracking-tighter">
              {cadence}
            </span>
            <span className="text-slate-400 font-mono text-xs sm:text-lg font-medium">RPM</span>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
            <span>Rhythm:</span>
            <span className={`font-medium truncate ${
              cadence >= 85 && cadence <= 98 ? 'text-emerald-400' : 'text-slate-300'
            }`}>
              {cadence >= 85 && cadence <= 98 ? 'Optimal' : cadence < 85 ? 'Grind' : 'Spin'}
            </span>
          </div>
        </div>
      </div>

      {/* ROLLING TELEMETRY CHART */}
      <div className="h-[260px] sm:h-[300px]">
        <RollingTelemetryChart
          samples={samples}
          targetHr={controllerSettings.targetHr}
          zones={zones}
          windowSec={300}
        />
      </div>

      {/* QUICK TARGET ADJUSTMENT & CONTROLLER FEEDBACK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card A: Target HR Dial */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Target Heart Rate
              </span>
            </div>
            <span className="text-lg font-mono font-bold text-amber-400">
              {controllerSettings.targetHr} BPM
            </span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={90}
            max={controllerSettings.maxHr}
            value={controllerSettings.targetHr}
            onChange={(e) => onUpdateSettings({ targetHr: Number(e.target.value) })}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 mb-3"
          />

          {/* Quick Bump buttons */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              onClick={() => onUpdateSettings({ targetHr: Math.max(90, controllerSettings.targetHr - 5) })}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors"
            >
              -5 BPM
            </button>
            <button
              onClick={() => onUpdateSettings({ targetHr: Math.max(90, controllerSettings.targetHr - 1) })}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors"
            >
              -1 BPM
            </button>
            <button
              onClick={() => onUpdateSettings({ targetHr: Math.min(controllerSettings.maxHr, controllerSettings.targetHr + 1) })}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors"
            >
              +1 BPM
            </button>
            <button
              onClick={() => onUpdateSettings({ targetHr: Math.min(controllerSettings.maxHr, controllerSettings.targetHr + 5) })}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors"
            >
              +5 BPM
            </button>
          </div>
        </div>

        {/* Card B: Live Closed-Loop Controller Reasoning */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Controller Reasoner
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Mode: <strong className="text-slate-200 capitalize">{controllerSettings.responsiveness}</strong>
            </span>
          </div>

          <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 min-h-[72px] flex items-center">
            {lastDecision ? (
              <p className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-rose-400">
                  {lastDecision.action.toUpperCase()}:
                </span>{' '}
                {lastDecision.reason}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Awaiting heart rate telemetry stream to evaluate resistance adjustments...
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Deadband: ±{controllerSettings.deadbandBpm} BPM</span>
            <span>Step Interval: Every {controllerSettings.stepIntervalSec}s</span>
          </div>
        </div>

        {/* Card C: Simulator Controls or Hardware Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {isSimulated ? 'Physiology Simulator' : 'Tacx Vortex Connection'}
            </span>
            {isSimulated ? (
              <span className="text-xs text-amber-400 font-medium">Demo Mode</span>
            ) : (
              <span className="text-xs text-emerald-400 font-medium">BLE Online</span>
            )}
          </div>

          {isSimulated ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Rider Effort Bias</span>
                <span className="font-mono text-white font-semibold">
                  {simulatedEffort > 0 ? `+${simulatedEffort}` : simulatedEffort} W
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                value={simulatedEffort}
                onChange={(e) => onChangeSimulatedEffort(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <button
                onClick={onSimulateSprint}
                className="w-full py-1.5 px-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Flame className="w-3.5 h-3.5 fill-white" />
                <span>Simulate 12s Sprint Surge</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-300">
              <p className="leading-relaxed">
                Connected to Tacx Vortex smart electro-brake. Resistance commands are transmitted via Bluetooth FTMS protocol.
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <span>Protocol: FTMS / FE-C</span>
                <span>Range: 5% - 85%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
