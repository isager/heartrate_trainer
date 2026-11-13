/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Watch,
  Sliders,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { TrainerData, CalibrationRecord, ControllerSettings } from '../types/workout';
import { bluetoothService, FtmsSpindownEvent } from '../services/bluetooth';
import { simulator } from '../services/simulator';
import { trainerLogger } from '../services/trainerLogger';
import { soundService } from '../services/audio';

interface SpindownModalProps {
  trainer: TrainerData | null;
  settings: ControllerSettings;
  isSimulated: boolean;
  onApplyCalibration: (updates: Partial<ControllerSettings>) => void;
  onClose: () => void;
}

type WizardMode = 'spindown' | 'watch_speed';
type SpindownStep = 'intro' | 'accelerate' | 'coasting' | 'result';

export const SpindownModal: React.FC<SpindownModalProps> = ({
  trainer,
  settings,
  isSimulated,
  onApplyCalibration,
  onClose,
}) => {
  const [mode, setMode] = useState<WizardMode>('spindown');
  const [step, setStep] = useState<SpindownStep>('intro');

  // Spindown live measurement state
  const [ftmsMessage, setFtmsMessage] = useState<string | null>(null);
  const [holdProgressSec, setHoldProgressSec] = useState<number>(0);
  const [coastStartMs, setCoastStartMs] = useState<number | null>(null);
  const [coastElapsedSec, setCoastElapsedSec] = useState<number>(0);
  const [peakSpeedKmh, setPeakSpeedKmh] = useState<number>(0);
  const [computedResult, setComputedResult] = useState<CalibrationRecord | null>(null);

  // Watch speed match state
  const currentRawSpeed = trainer?.rawSpeedKmh ?? trainer?.speedKmh ?? 19.0;
  const [trainerSpeedInput, setTrainerSpeedInput] = useState<string>(currentRawSpeed.toFixed(1));
  const [watchSpeedInput, setWatchSpeedInput] = useState<string>('20.2');

  const coastSamplesRef = useRef<{ t: number; v: number }[]>([]);
  const rawSpeed = trainer?.rawSpeedKmh ?? trainer?.speedKmh ?? 0;
  const cadence = trainer?.cadenceRpm ?? 0;

  const TARGET_CALIBRATION_SPEED = 32.0; // km/h
  const COAST_END_THRESHOLD = 10.0; // km/h

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (isSimulated) {
        simulator.setCalibrationMode('normal');
      } else {
        bluetoothService.stopFtmsSpindown();
      }
    };
  }, [isSimulated]);

  // Monitor acceleration step
  useEffect(() => {
    if (step !== 'accelerate') return;

    const interval = setInterval(() => {
      if (rawSpeed >= TARGET_CALIBRATION_SPEED - 0.5) {
        setHoldProgressSec((prev) => {
          const next = prev + 0.5;
          if (next >= 2.0) {
            // Reached target speed and stabilized -> enter coasting!
            triggerCoastDownPhase(rawSpeed);
            return 2.0;
          }
          return next;
        });
      } else {
        setHoldProgressSec((prev) => Math.max(0, prev - 0.25));
      }
    }, 500);

    return () => clearInterval(interval);
  }, [step, rawSpeed]);

  // Monitor coast-down deceleration step
  useEffect(() => {
    if (step !== 'coasting' || coastStartMs === null) return;

    const timer = setInterval(() => {
      const elapsed = (Date.now() - coastStartMs) / 1000;
      setCoastElapsedSec(Math.round(elapsed * 10) / 10);

      coastSamplesRef.current.push({ t: elapsed, v: rawSpeed });
      if (rawSpeed > peakSpeedKmh) {
        setPeakSpeedKmh(rawSpeed);
      }

      // Finish when speed drops below COAST_END_THRESHOLD after at least 2s, or timeout at 25s
      if ((elapsed >= 2.0 && rawSpeed <= COAST_END_THRESHOLD) || elapsed >= 25.0) {
        completeSpindown(elapsed, peakSpeedKmh, rawSpeed);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [step, coastStartMs, rawSpeed, peakSpeedKmh]);

  const handleStartSpindown = async () => {
    setHoldProgressSec(0);
    setCoastElapsedSec(0);
    setPeakSpeedKmh(0);
    setComputedResult(null);
    coastSamplesRef.current = [];
    setStep('accelerate');

    trainerLogger.log('INFO', 'CALIBRATION', 'Started Spindown Auto-Calibration Wizard');

    if (isSimulated) {
      simulator.setResistancePercent(0);
      simulator.setCalibrationMode('spindown_accel');
      setFtmsMessage('Simulator mode active — accelerating virtual flywheel for calibration test.');
    } else {
      // Drop resistance to 0% and probe FTMS Spin Down (0x13)
      await bluetoothService.setResistancePercent(0);
      const started = await bluetoothService.startFtmsSpindown((evt: FtmsSpindownEvent) => {
        setFtmsMessage(evt.message);
        if (evt.status === 'stop_pedaling') {
          triggerCoastDownPhase(rawSpeed);
        } else if (evt.status === 'success') {
          completeSpindown(coastElapsedSec || 8.5, peakSpeedKmh || 32, rawSpeed, 'spindown_ftms');
        }
      });
      if (!started) {
        setFtmsMessage('Using software coast-down curve measurement via live trainer speed stream.');
      }
    }
  };

  const triggerCoastDownPhase = (currentSpeed: number) => {
    soundService.playCountdownBeep(true);
    setPeakSpeedKmh(Math.max(currentSpeed, 25));
    setCoastStartMs(Date.now());
    setCoastElapsedSec(0);
    coastSamplesRef.current = [{ t: 0, v: currentSpeed }];
    setStep('coasting');

    if (isSimulated) {
      simulator.setCalibrationMode('spindown_coast');
    } else {
      bluetoothService.setResistancePercent(0);
    }

    trainerLogger.log(
      'INFO',
      'CALIBRATION',
      `Entered Coast-Down Phase at ${currentSpeed.toFixed(1)} km/h (Resistance 0%)`
    );
  };

  const completeSpindown = (
    durationSec: number,
    peakSpeed: number,
    endSpeed: number,
    method: 'spindown_ftms' | 'spindown_software' = 'spindown_software'
  ) => {
    soundService.playCountdownBeep(true);

    if (isSimulated) {
      simulator.setCalibrationMode('normal');
      simulator.setResistancePercent(20);
    } else {
      bluetoothService.stopFtmsSpindown();
    }

    // Normalize spindown duration to a 32 -> 10 km/h (22 km/h drop) equivalent window
    const actualDrop = Math.max(8, peakSpeed - endSpeed);
    const normalizedDuration = Math.round((durationSec * (22 / actualDrop)) * 10) / 10;

    // Tacx Vortex nominal wheel-on spindown window (32 -> 10 km/h at 0% brake):
    // ~8.8s = Optimal roller tension (1.00x power calibration)
    // < 6.8s = Too tight / high rolling drag
    // > 11.2s = Too loose / tire slip risk
    let dragStatus: CalibrationRecord['dragStatus'] = 'optimal';
    let notes = 'Roller tension & internal drag are in the optimal Tacx Vortex calibration range.';
    if (normalizedDuration < 6.8) {
      dragStatus = 'tight';
      notes = 'Flywheel slowed quickly — roller knob may be ~1/2 turn too tight, adding mechanical rolling drag.';
    } else if (normalizedDuration > 11.2) {
      dragStatus = 'loose';
      notes = 'Long coast-down detected — roller pressure against tire may be loose (risk of slip during sprints).';
    }

    // Compute subtle power calibration adjustment factor clamped safely to [0.80, 1.20]
    // Tighter roller absorbs extra mechanical friction -> trainer under-estimates or drifts; scale gently
    const ratioOffset = (8.8 - normalizedDuration) * 0.025;
    const recommendedPowerFactor = Math.round(Math.max(0.80, Math.min(1.20, 1.0 + ratioOffset)) * 100) / 100;

    const record: CalibrationRecord = {
      timestamp: Date.now(),
      method,
      spindownDurationSec: normalizedDuration,
      peakSpeedKmh: Math.round(peakSpeed * 10) / 10,
      endSpeedKmh: Math.round(endSpeed * 10) / 10,
      dragStatus,
      powerFactor: recommendedPowerFactor,
      speedFactor: settings.speedCalibrationFactor || 1.0,
      notes,
    };

    setComputedResult(record);
    setStep('result');

    trainerLogger.log(
      'INFO',
      'CALIBRATION',
      `Spindown complete: ${normalizedDuration}s (${peakSpeed.toFixed(1)} → ${endSpeed.toFixed(1)} km/h) | Status: ${dragStatus.toUpperCase()} | Recommended Power Factor: ${recommendedPowerFactor}x`
    );
  };

  const handleApplySpindownResult = () => {
    if (!computedResult) return;
    onApplyCalibration({
      powerCalibrationFactor: computedResult.powerFactor,
      lastCalibration: computedResult,
    });
    trainerLogger.log(
      'TX',
      'CALIBRATION',
      `Applied Spindown Calibration: Power Scale = ${computedResult.powerFactor}x (${computedResult.dragStatus})`
    );
    onClose();
  };

  // Watch speed match calculations
  const parsedTrainerSpd = Math.max(5, parseFloat(trainerSpeedInput) || 19.0);
  const parsedWatchSpd = Math.max(5, parseFloat(watchSpeedInput) || 20.2);
  const watchRatio = Math.round((parsedWatchSpd / parsedTrainerSpd) * 100) / 100;
  const clampedWatchRatio = Math.max(0.5, Math.min(1.6, watchRatio));
  const effectiveWheelMm = Math.round(2096 * clampedWatchRatio);

  const handleApplyWatchMatch = () => {
    const record: CalibrationRecord = {
      timestamp: Date.now(),
      method: 'watch_match',
      dragStatus: 'custom',
      powerFactor: settings.powerCalibrationFactor || 1.0,
      speedFactor: clampedWatchRatio,
      notes: `Matched trainer speed (${parsedTrainerSpd} km/h) to watch speed (${parsedWatchSpd} km/h).`,
    };
    onApplyCalibration({
      speedCalibrationFactor: clampedWatchRatio,
      wheelCircumferenceMm: effectiveWheelMm,
      lastCalibration: record,
    });
    trainerLogger.log(
      'TX',
      'CALIBRATION',
      `Applied Watch Speed Calibration: ${parsedTrainerSpd} → ${parsedWatchSpd} km/h (Scale ${clampedWatchRatio}x, Wheel ${effectiveWheelMm} mm)`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-5 shadow-2xl relative my-auto max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Trainer Calibration Wizard
            </h2>
            <p className="text-xs text-slate-400">
              Auto-calibrate Tacx Vortex rolling drag (spindown) or match your watch speed.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            onClick={() => setMode('spindown')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'spindown'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Spindown Auto-Cal</span>
          </button>
          <button
            onClick={() => setMode('watch_speed')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'watch_speed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Watch className="w-3.5 h-3.5" />
            <span>Match Watch Speed</span>
          </button>
        </div>

        {/* MODE 1: SPINDOWN AUTO-CALIBRATION */}
        {mode === 'spindown' && (
          <div className="space-y-4">
            {step === 'intro' && (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                  <p className="font-semibold text-white text-sm">
                    How Coast-Down Calibration Works:
                  </p>
                  <ol className="space-y-2 list-decimal list-inside text-slate-300">
                    <li>
                      Pedal comfortably up to <strong className="text-cyan-300 font-mono">32 km/h</strong> (takes a few seconds in a medium-high gear).
                    </li>
                    <li>
                      When alerted <strong className="text-amber-300">STOP PEDALING</strong>, stop turning the cranks and let the wheel coast down freely.
                    </li>
                    <li>
                      The app measures the flywheel deceleration time from peak speed down to <strong>10 km/h</strong> and computes tire-to-roller friction &amp; power calibration.
                    </li>
                  </ol>
                </div>

                {settings.lastCalibration && settings.lastCalibration.method !== 'watch_match' && (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Last Spindown: <strong className="text-slate-200 font-mono">{settings.lastCalibration.spindownDurationSec}s</strong> ({settings.lastCalibration.dragStatus})
                    </span>
                    <span className="text-violet-300 font-mono font-semibold">
                      Scale: {settings.lastCalibration.powerFactor}x
                    </span>
                  </div>
                )}

                <button
                  onClick={handleStartSpindown}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Spindown Calibration</span>
                </button>
              </div>
            )}

            {step === 'accelerate' && (
              <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl p-5 text-center space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Step 1 of 2 · Pedal Up to Target Speed
                </div>

                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-mono font-extrabold text-white tracking-tighter">
                    {rawSpeed.toFixed(1)}
                  </span>
                  <span className="text-slate-400 font-mono text-lg">/ {TARGET_CALIBRATION_SPEED} km/h</span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round((rawSpeed / TARGET_CALIBRATION_SPEED) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Cadence: {cadence} RPM</span>
                    <span>
                      {rawSpeed >= TARGET_CALIBRATION_SPEED - 0.5
                        ? `Holding speed... ${Math.round((holdProgressSec / 2) * 100)}%`
                        : 'Accelerate smoothly'}
                    </span>
                  </div>
                </div>

                {ftmsMessage && (
                  <p className="text-[11px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
                    {ftmsMessage}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => triggerCoastDownPhase(Math.max(rawSpeed, 20))}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Coast Down Now ({rawSpeed.toFixed(1)} km/h)
                  </button>
                  <button
                    onClick={() => {
                      if (isSimulated) simulator.setCalibrationMode('normal');
                      setStep('intro');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {step === 'coasting' && (
              <div className="bg-amber-950/30 border-2 border-amber-500 rounded-2xl p-6 text-center space-y-4">
                <div className="inline-block px-3 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-extrabold uppercase tracking-wider animate-pulse">
                  STOP PEDALING! COAST TO A STOP
                </div>

                <div className="grid grid-cols-2 gap-4 py-2">
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400 uppercase">Current Speed</div>
                    <div className="text-4xl font-mono font-extrabold text-white mt-1">
                      {rawSpeed.toFixed(1)} <span className="text-sm font-normal text-slate-400">km/h</span>
                    </div>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-slate-400 uppercase">Coast Time</div>
                    <div className="text-4xl font-mono font-extrabold text-amber-400 mt-1">
                      {coastElapsedSec.toFixed(1)} <span className="text-sm font-normal text-slate-400">s</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-amber-200/90">
                  Do not touch the pedals or brakes. Measuring rolling drag until flywheel drops below {COAST_END_THRESHOLD} km/h...
                </p>

                <button
                  onClick={() => completeSpindown(Math.max(2, coastElapsedSec), peakSpeedKmh, rawSpeed)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
                >
                  Finish Measurement Now
                </button>
              </div>
            )}

            {step === 'result' && computedResult && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  computedResult.dragStatus === 'optimal'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                }`}>
                  {computedResult.dragStatus === 'optimal' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-white">
                      Spindown Complete · Roller Tension: <span className="uppercase">{computedResult.dragStatus}</span>
                    </h4>
                    <p className="text-xs opacity-90 mt-1 leading-relaxed">
                      {computedResult.notes}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Spindown Time</div>
                    <div className="text-lg font-mono font-bold text-cyan-400 mt-0.5">
                      {computedResult.spindownDurationSec} s
                    </div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Peak Speed</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">
                      {computedResult.peakSpeedKmh} km/h
                    </div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Power Scale</div>
                    <div className="text-lg font-mono font-bold text-violet-300 mt-0.5">
                      {computedResult.powerFactor}x
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setStep('intro')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Redo</span>
                  </button>
                  <button
                    onClick={handleApplySpindownResult}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Apply Calibration ({computedResult.powerFactor}x Power)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: MATCH WATCH / BIKE COMPUTER SPEED */}
        {mode === 'watch_speed' && (
          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-white">Why does Tacx speed differ from a watch?</p>
              <p className="text-slate-400 leading-relaxed">
                On wheel-on trainers like the Tacx Vortex, the sensor counts revolutions of the <strong>30 mm metal roller</strong> and multiplies by an assumed wheel circumference (default ~2096 mm). Tire pressure, roller tension, or wrist-based watch estimates create a fixed ratio difference. Enter both readings below to lock them together:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400">Raw Trainer Speed</label>
                  <button
                    type="button"
                    onClick={() => setTrainerSpeedInput(currentRawSpeed.toFixed(1))}
                    className="text-[10px] text-cyan-400 hover:underline font-medium cursor-pointer"
                  >
                    Use Live ({currentRawSpeed.toFixed(1)})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="60"
                    value={trainerSpeedInput}
                    onChange={(e) => setTrainerSpeedInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-400 font-mono">km/h</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <label className="text-xs text-slate-400 block">Actual Watch / Bike Speed</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="60"
                    value={watchSpeedInput}
                    onChange={(e) => setWatchSpeedInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-400 font-mono">km/h</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="text-slate-400">Computed Speed Ratio</div>
                <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
                  <span>{clampedWatchRatio}x</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-300">Wheel Circ: {effectiveWheelMm} mm</span>
                </div>
              </div>

              <button
                onClick={handleApplyWatchMatch}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Apply Speed Calibration</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
