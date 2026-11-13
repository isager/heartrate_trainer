/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Sliders,
  Heart,
  Shield,
  Gauge,
  User,
  Volume2,
  Save,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { ControllerSettings, HeartRateZone } from '../types/workout';

interface SettingsModalProps {
  settings: ControllerSettings;
  zones: HeartRateZone[];
  onSaveSettings: (settings: ControllerSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  zones,
  onSaveSettings,
  onClose,
}) => {
  const [localSettings, setLocalSettings] = React.useState<ControllerSettings>({ ...settings });

  const handleResetDefaults = () => {
    setLocalSettings({
      maxHr: 185,
      restingHr: 60,
      deadbandBpm: 2,
      stepIntervalSec: 5,
      responsiveness: 'balanced',
      minResistance: 5,
      maxResistance: 60,
      emergencyMaxHrCutoff: 182,
      targetHr: 135,
      useErgMode: false,
      ftpWatts: 240,
      riderWeightKg: 72,
      powerCalibrationFactor: 1.0,
      speedCalibrationFactor: 1.0,
    });
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 sm:space-y-6 shadow-2xl relative my-auto max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800 flex items-center justify-center text-rose-400 shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Rider Profile & Settings
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Calibrate physiological metrics and the Tacx Vortex resistance algorithm.
            </p>
          </div>
        </div>

        <div className="space-y-5 sm:space-y-6 overflow-y-auto pr-1 flex-1">
          {/* Section 1: Rider Physiology */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Rider Physiology</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Maximum Heart Rate (Max HR)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={130}
                    max={225}
                    value={localSettings.maxHr}
                    onChange={(e) => {
                      const maxHr = Number(e.target.value);
                      setLocalSettings(prev => ({
                        ...prev,
                        maxHr,
                        emergencyMaxHrCutoff: Math.min(prev.emergencyMaxHrCutoff, maxHr - 2),
                      }));
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">BPM</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Rule of thumb: 220 minus your age.</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Resting Heart Rate
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={35}
                    max={95}
                    value={localSettings.restingHr}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, restingHr: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">BPM</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Waking resting pulse.</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Rider Weight
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={40}
                    max={150}
                    value={localSettings.riderWeightKg}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, riderWeightKg: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">kg</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Used for accurate virtual speed & W/kg.</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Functional Threshold Power (FTP)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={100}
                    max={550}
                    value={localSettings.ftpWatts}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, ftpWatts: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">Watts</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Your 1-hour maximum sustainable wattage.</p>
              </div>
            </div>
          </div>

          {/* Section 2: Closed-Loop Controller Tuning */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              <span>Closed-Loop Resistance Controller Tuning</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Deadband Tolerance (± BPM)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={localSettings.deadbandBpm}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, deadbandBpm: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">BPM</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Holds resistance steady when HR is within target ± deadband. Prevents hunting.
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1">
                  Step Adjustment Interval
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={3}
                    max={12}
                    value={localSettings.stepIntervalSec}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, stepIntervalSec: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">Seconds</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Seconds between adjustments to allow cardiac lag to stabilize.
                </p>
              </div>
            </div>

            {/* Responsiveness Presets */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <label className="text-xs text-slate-400 block mb-2">
                Controller Responsiveness Profile
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['smooth', 'balanced', 'aggressive'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLocalSettings(prev => ({ ...prev, responsiveness: mode }))}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      localSettings.responsiveness === mode
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                {localSettings.responsiveness === 'smooth' && 'Gentle resistance steps (±1-2%). Minimal oscillation, ideal for long steady Z2 rides.'}
                {localSettings.responsiveness === 'balanced' && 'Standard proportional response (±2-3%). Balances quick acquisition with cardiac stability.'}
                {localSettings.responsiveness === 'aggressive' && 'Snappy adjustments (±3-5%). Rapid response for interval workouts.'}
              </p>
            </div>
          </div>

          {/* Section 3: Power & Resistance Scale Calibration */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Power Output & Resistance Calibration</span>
            </h3>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Power Calibration Scale</span>
                  <span className="text-violet-400 font-mono font-bold">
                    {Math.round((localSettings.powerCalibrationFactor || 1.0) * 100)}% ({localSettings.powerCalibrationFactor || 1.0}x)
                  </span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={140}
                  step={5}
                  value={Math.round((localSettings.powerCalibrationFactor || 1.0) * 100)}
                  onChange={(e) =>
                    setLocalSettings(prev => ({
                      ...prev,
                      powerCalibrationFactor: Math.round(Number(e.target.value)) / 100,
                    }))
                  }
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Adjust if the power reading or simulated trainer wattage feels too high or low compared to your natural effort or bike power meter.
                </p>
              </div>

              {/* Quick Calibration Presets */}
              <div className="flex items-center gap-2 pt-1">
                {[
                  { label: '-20% (0.80x)', val: 0.8 },
                  { label: '-10% (0.90x)', val: 0.9 },
                  { label: 'Standard (1.00x)', val: 1.0 },
                  { label: '+10% (1.10x)', val: 1.1 },
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setLocalSettings(prev => ({ ...prev, powerCalibrationFactor: p.val }))}
                    className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-mono font-semibold transition-colors ${
                      Math.abs((localSettings.powerCalibrationFactor || 1.0) - p.val) < 0.02
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Speed & Watch Calibration */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              <span>Speed & Watch Calibration</span>
            </h3>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Speed Calibration Scale</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {Math.round((localSettings.speedCalibrationFactor || 1.0) * 100)}% ({localSettings.speedCalibrationFactor || 1.0}x)
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={Math.round((localSettings.speedCalibrationFactor || 1.0) * 100)}
                  onChange={(e) =>
                    setLocalSettings(prev => ({
                      ...prev,
                      speedCalibrationFactor: Math.round(Number(e.target.value)) / 100,
                    }))
                  }
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Calibrate indoor roller speed to match your Garmin, Apple Watch, Polar, or bike computer.
                </p>
              </div>

              {/* Match Watch Speed Quick Tool */}
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">
                    Quick Match Watch Speed
                  </span>
                  <span className="text-[10px] text-slate-400">
                    If your watch reads a specific speed (e.g. 19 km/h):
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalSettings(prev => ({ ...prev, speedCalibrationFactor: 1.0 }))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 text-xs font-mono font-bold border border-emerald-500/30 transition-colors"
                  >
                    19.0 km/h (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalSettings(prev => ({ ...prev, speedCalibrationFactor: 0.85 }))}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-mono transition-colors"
                  >
                    -15%
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalSettings(prev => ({ ...prev, speedCalibrationFactor: 1.15 }))}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-mono transition-colors"
                  >
                    +15%
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Safety Guardrails */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Safety Guardrails</span>
            </h3>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Emergency Max HR Cutoff</span>
                  <span className="text-rose-400 font-mono font-bold">{localSettings.emergencyMaxHrCutoff} BPM</span>
                </div>
                <input
                  type="range"
                  min={140}
                  max={localSettings.maxHr}
                  value={localSettings.emergencyMaxHrCutoff}
                  onChange={(e) =>
                    setLocalSettings(prev => ({ ...prev, emergencyMaxHrCutoff: Number(e.target.value) }))
                  }
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  If your heart rate hits this threshold, resistance will immediately dump by 15% and sound a warning alert.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-850">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Min Resistance</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={localSettings.minResistance}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, minResistance: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Max Resistance</label>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={localSettings.maxResistance}
                    onChange={(e) =>
                      setLocalSettings(prev => ({ ...prev, maxResistance: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-950/40 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
