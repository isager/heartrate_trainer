/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Clock,
  Play,
  Flame,
  Plus,
  Trash2,
  Sliders,
  ChevronRight,
  ShieldCheck,
  Dumbbell,
  Check,
} from 'lucide-react';
import { WorkoutPreset, WorkoutInterval, HeartRateZone } from '../types/workout';

interface WorkoutSelectorProps {
  presets: WorkoutPreset[];
  selectedPresetId: string;
  onSelectPreset: (preset: WorkoutPreset) => void;
  onStartWorkout: (preset: WorkoutPreset) => void;
  zones: HeartRateZone[];
  maxHr: number;
}

export const WorkoutSelector: React.FC<WorkoutSelectorProps> = ({
  presets,
  selectedPresetId,
  onSelectPreset,
  onStartWorkout,
  zones,
  maxHr,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isBuildingCustom, setIsBuildingCustom] = useState<boolean>(false);

  // Custom Workout Builder State
  const [customTitle, setCustomTitle] = useState('Custom HR Interval');
  const [customIntervals, setCustomIntervals] = useState<WorkoutInterval[]>([
    { id: 'c1', name: 'Warmup', durationSec: 300, targetHr: Math.round(maxHr * 0.6), zone: 2, targetCadence: 90 },
    { id: 'c2', name: 'Work Bout', durationSec: 300, targetHr: Math.round(maxHr * 0.82), zone: 4, targetCadence: 92 },
    { id: 'c3', name: 'Recovery', durationSec: 180, targetHr: Math.round(maxHr * 0.6), zone: 1, targetCadence: 85 },
    { id: 'c4', name: 'Work Bout 2', durationSec: 300, targetHr: Math.round(maxHr * 0.82), zone: 4, targetCadence: 92 },
    { id: 'c5', name: 'Cooldown', durationSec: 240, targetHr: Math.round(maxHr * 0.55), zone: 1, targetCadence: 80 },
  ]);

  const filteredPresets = presets.filter(p => {
    if (filterCategory === 'all') return true;
    return p.category.toLowerCase() === filterCategory.toLowerCase();
  });

  const selectedPreset = presets.find(p => p.id === selectedPresetId) || presets[0];

  const formatMinSec = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
  };

  const handleAddCustomInterval = () => {
    const newId = `c_${Date.now()}`;
    setCustomIntervals(prev => [
      ...prev,
      {
        id: newId,
        name: `Interval ${prev.length + 1}`,
        durationSec: 180,
        targetHr: Math.round(maxHr * 0.75),
        zone: 3,
        targetCadence: 90,
      },
    ]);
  };

  const handleRemoveCustomInterval = (id: string) => {
    if (customIntervals.length <= 1) return;
    setCustomIntervals(prev => prev.filter(i => i.id !== id));
  };

  const handleStartCustom = () => {
    const totalDuration = customIntervals.reduce((acc, i) => acc + i.durationSec, 0);
    const customPreset: WorkoutPreset = {
      id: `custom_${Date.now()}`,
      title: customTitle,
      subtitle: `${customIntervals.length} Custom Intervals`,
      category: 'HIIT',
      totalDurationSec: totalDuration,
      estimatedTss: Math.round((totalDuration / 3600) * 60),
      description: 'User-designed closed-loop heart rate interval workout.',
      intervals: customIntervals,
    };
    onStartWorkout(customPreset);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Category Filter Tabs & Custom Builder CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          {['all', 'endurance', 'threshold', 'recovery'].map(cat => (
            <button
              key={cat}
              onClick={() => {
                setFilterCategory(cat);
                setIsBuildingCustom(false);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize whitespace-nowrap ${
                filterCategory === cat && !isBuildingCustom
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat === 'all' ? 'All Workouts' : cat}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsBuildingCustom(!isBuildingCustom)}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors ${
            isBuildingCustom
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isBuildingCustom ? 'Close Builder' : 'Build Custom Intervals'}</span>
        </button>
      </div>

      {/* CUSTOM WORKOUT BUILDER PANEL */}
      {isBuildingCustom ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white">Custom Interval Builder</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Design custom intervals. The Tacx Vortex will automatically adjust resistance to hold each target HR.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="Workout Name"
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={handleStartCustom}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-rose-950/40"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Custom Ride</span>
              </button>
            </div>
          </div>

          {/* Interval Rows */}
          <div className="space-y-3">
            {customIntervals.map((interval, idx) => (
              <div
                key={interval.id}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-3 min-w-[140px]">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-mono font-bold flex items-center justify-center text-[11px]">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={interval.name}
                    onChange={e => {
                      const updated = [...customIntervals];
                      updated[idx].name = e.target.value;
                      setCustomIntervals(updated);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Duration:</span>
                  <select
                    value={interval.durationSec}
                    onChange={e => {
                      const updated = [...customIntervals];
                      updated[idx].durationSec = Number(e.target.value);
                      setCustomIntervals(updated);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono focus:outline-none focus:border-rose-500"
                  >
                    <option value={60}>1 min</option>
                    <option value={120}>2 min</option>
                    <option value={180}>3 min</option>
                    <option value={300}>5 min</option>
                    <option value={480}>8 min</option>
                    <option value={600}>10 min</option>
                    <option value={900}>15 min</option>
                    <option value={1200}>20 min</option>
                  </select>
                </div>

                {/* Target HR */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Target HR:</span>
                  <input
                    type="number"
                    min={80}
                    max={maxHr}
                    value={interval.targetHr}
                    onChange={e => {
                      const updated = [...customIntervals];
                      updated[idx].targetHr = Number(e.target.value);
                      setCustomIntervals(updated);
                    }}
                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-amber-300 font-mono font-bold focus:outline-none focus:border-rose-500 text-center"
                  />
                  <span className="text-slate-400">BPM</span>
                </div>

                {/* Target Cadence */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Cadence:</span>
                  <input
                    type="number"
                    min={60}
                    max={120}
                    value={interval.targetCadence || 90}
                    onChange={e => {
                      const updated = [...customIntervals];
                      updated[idx].targetCadence = Number(e.target.value);
                      setCustomIntervals(updated);
                    }}
                    className="w-14 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-emerald-400 font-mono font-bold focus:outline-none focus:border-rose-500 text-center"
                  />
                  <span className="text-slate-400">RPM</span>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleRemoveCustomInterval(interval.id)}
                  disabled={customIntervals.length <= 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddCustomInterval}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Interval</span>
          </button>
        </div>
      ) : (
        /* PRESET WORKOUTS GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredPresets.map(preset => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <div
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                className={`bg-slate-900 border rounded-2xl p-6 cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-rose-500/70 shadow-lg shadow-rose-950/20 ring-1 ring-rose-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                      {preset.category}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatMinSec(preset.totalDurationSec)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        ~{preset.estimatedTss} TSS
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {preset.title}
                  </h3>
                  <p className="text-xs font-medium text-slate-300 mt-0.5">
                    {preset.subtitle}
                  </p>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {preset.description}
                  </p>

                  {/* Visual Interval Profile Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                      <span>Interval Profile</span>
                      <span>{preset.intervals.length} segments</span>
                    </div>

                    <div className="h-10 w-full flex items-end gap-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800/60">
                      {preset.intervals.map(int => {
                        const widthPct = (int.durationSec / preset.totalDurationSec) * 100;
                        const heightPct = Math.min(100, Math.max(25, (int.targetHr / maxHr) * 100));

                        let barBg = 'bg-sky-500';
                        if (int.zone === 2) barBg = 'bg-emerald-500';
                        if (int.zone === 3) barBg = 'bg-amber-500';
                        if (int.zone === 4) barBg = 'bg-orange-500';
                        if (int.zone === 5) barBg = 'bg-rose-500';

                        return (
                          <div
                            key={int.id}
                            style={{ width: `${widthPct}%`, height: `${heightPct}%` }}
                            className={`${barBg} rounded-sm transition-all hover:opacity-80`}
                            title={`${int.name}: ${formatMinSec(int.durationSec)} @ ${int.targetHr} BPM`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Target range: <strong className="text-slate-200">{Math.min(...preset.intervals.map(i => i.targetHr))}-{Math.max(...preset.intervals.map(i => i.targetHr))} BPM</strong>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartWorkout(preset);
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Ride Workout</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
