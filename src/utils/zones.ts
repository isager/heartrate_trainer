/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeartRateZone, WorkoutPreset } from '../types/workout';

export function calculateHeartRateZones(maxHr: number, restingHr: number = 60): HeartRateZone[] {
  // 5-Zone Coggan/Karvonen heart rate training zones
  const reserve = Math.max(0, maxHr - restingHr);

  const zoneBorders = [
    { zone: 1, name: 'Active Recovery', minPct: 0.50, maxPct: 0.60, color: 'text-sky-400', bgColor: 'bg-sky-500/10', borderColor: 'border-sky-500/30', desc: 'Easy pedal, recovery, clears lactic acid' },
    { zone: 2, name: 'Aerobic Base', minPct: 0.60, maxPct: 0.70, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', desc: 'Fat oxidation, all-day conversational pace' },
    { zone: 3, name: 'Tempo', minPct: 0.70, maxPct: 0.80, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', desc: 'Rhythmic aerobic effort, concentrated breathing' },
    { zone: 4, name: 'Lactate Threshold', minPct: 0.80, maxPct: 0.90, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', desc: 'Hard, sustainable race pace, lactic buildup' },
    { zone: 5, name: 'VO2 Max', minPct: 0.90, maxPct: 1.00, color: 'text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/30', desc: 'Maximum cardiac output, sprint, high anaerobic' },
  ];

  return zoneBorders.map(zb => {
    // If resting HR is sensible, use Karvonen heart rate reserve, else % max HR
    const minBpm = Math.round(restingHr > 40 && restingHr < 100 
      ? restingHr + (reserve * zb.minPct) 
      : maxHr * zb.minPct);
    const maxBpm = Math.round(restingHr > 40 && restingHr < 100 
      ? restingHr + (reserve * zb.maxPct) 
      : maxHr * zb.maxPct);

    return {
      zone: zb.zone,
      name: zb.name,
      minPercent: Math.round(zb.minPct * 100),
      maxPercent: Math.round(zb.maxPct * 100),
      minBpm,
      maxBpm,
      color: zb.color,
      bgColor: zb.bgColor,
      borderColor: zb.borderColor,
      description: zb.desc,
    };
  });
}

export function getZoneForHeartRate(bpm: number, zones: HeartRateZone[]): HeartRateZone {
  if (bpm <= 0) return zones[0];
  for (const z of zones) {
    if (bpm <= z.maxBpm) return z;
  }
  return zones[zones.length - 1];
}

export function getDefaultWorkoutPresets(maxHr: number): WorkoutPreset[] {
  const z2Target = Math.round(maxHr * 0.65);
  const z3Target = Math.round(maxHr * 0.75);
  const z4Target = Math.round(maxHr * 0.85);
  const z1Target = Math.round(maxHr * 0.55);

  return [
    {
      id: 'zone2-endurance-45',
      title: 'Zone 2 Fat-Oxidation Base',
      subtitle: 'Steady aerobic endurance & mitochondrial development',
      category: 'Endurance',
      totalDurationSec: 45 * 60,
      estimatedTss: 42,
      description: 'The cornerstone of cycling fitness. The smart controller holds resistance right at the sweet spot of Zone 2 to maximize fat oxidation without inducing cardiac fatigue.',
      intervals: [
        { id: 'i1', name: 'Warmup Spin', durationSec: 8 * 60, targetHr: z1Target + 5, zone: 1, targetCadence: 90, notes: 'Spin up legs smoothly at high cadence' },
        { id: 'i2', name: 'Aerobic Base Block 1', durationSec: 15 * 60, targetHr: z2Target, zone: 2, targetCadence: 88, notes: 'Steady breathing, controller will trim resistance' },
        { id: 'i3', name: 'Micro Spin Recovery', durationSec: 2 * 60, targetHr: z1Target + 10, zone: 1, targetCadence: 92, notes: 'Quick hydration spin' },
        { id: 'i4', name: 'Aerobic Base Block 2', durationSec: 15 * 60, targetHr: z2Target + 2, zone: 2, targetCadence: 88, notes: 'Hold consistent cadence as fatigue sets in' },
        { id: 'i5', name: 'Cooldown Flush', durationSec: 5 * 60, targetHr: z1Target, zone: 1, targetCadence: 85, notes: 'Gradual resistance release' },
      ],
    },
    {
      id: 'threshold-over-under-36',
      title: 'Lactate Threshold Intervals',
      subtitle: '3 × 6 min Threshold at 85% Max HR',
      category: 'Threshold',
      totalDurationSec: 36 * 60,
      estimatedTss: 58,
      description: 'Boost your functional threshold heart rate (LTHR). The trainer automatically increases resistance during work bouts and eases off during rest valleys.',
      intervals: [
        { id: 'th1', name: 'Gradual Ramp Warmup', durationSec: 6 * 60, targetHr: z2Target - 5, zone: 2, targetCadence: 90 },
        { id: 'th2', name: 'Threshold Bout 1', durationSec: 6 * 60, targetHr: z4Target, zone: 4, targetCadence: 92, notes: 'Push deep into lactate zone' },
        { id: 'th3', name: 'Active Recovery 1', durationSec: 3 * 60, targetHr: z1Target + 5, zone: 1, targetCadence: 85 },
        { id: 'th4', name: 'Threshold Bout 2', durationSec: 6 * 60, targetHr: z4Target, zone: 4, targetCadence: 92 },
        { id: 'th5', name: 'Active Recovery 2', durationSec: 3 * 60, targetHr: z1Target + 5, zone: 1, targetCadence: 85 },
        { id: 'th6', name: 'Threshold Bout 3', durationSec: 6 * 60, targetHr: z4Target, zone: 4, targetCadence: 94, notes: 'Final push, stay smooth' },
        { id: 'th7', name: 'Cooldown Spin', durationSec: 6 * 60, targetHr: z1Target, zone: 1, targetCadence: 80 },
      ],
    },
    {
      id: 'tempo-pyramid-30',
      title: 'Tempo Cardiac Ladder',
      subtitle: 'Stepwise progression from Z1 up to Z4 and down',
      category: 'Endurance',
      totalDurationSec: 30 * 60,
      estimatedTss: 38,
      description: 'Tests closed-loop resistance responsiveness across all cardiac zones with 5-minute stepped transitions.',
      intervals: [
        { id: 'pyr1', name: 'Warmup Spin', durationSec: 5 * 60, targetHr: z1Target, zone: 1, targetCadence: 90 },
        { id: 'pyr2', name: 'Step 1: Zone 2 Low', durationSec: 5 * 60, targetHr: z2Target - 4, zone: 2, targetCadence: 88 },
        { id: 'pyr3', name: 'Step 2: Zone 3 Tempo', durationSec: 5 * 60, targetHr: z3Target, zone: 3, targetCadence: 88 },
        { id: 'pyr4', name: 'Step 3: Zone 4 Threshold', durationSec: 5 * 60, targetHr: z4Target - 2, zone: 4, targetCadence: 90 },
        { id: 'pyr5', name: 'Step 4: Zone 3 Downstep', durationSec: 5 * 60, targetHr: z3Target - 5, zone: 3, targetCadence: 86 },
        { id: 'pyr6', name: 'Cooldown Spin', durationSec: 5 * 60, targetHr: z1Target, zone: 1, targetCadence: 82 },
      ],
    },
    {
      id: 'active-recovery-20',
      title: 'Recovery Spin & Flush',
      subtitle: 'Strict Zone 1 ceiling for active rest days',
      category: 'Recovery',
      totalDurationSec: 20 * 60,
      estimatedTss: 12,
      description: 'Keeps resistance light and cuts back immediately if your heart rate creeps above 60% Max HR. Perfect the day after a grueling ride or race.',
      intervals: [
        { id: 'rec1', name: 'Gentle Spin In', durationSec: 4 * 60, targetHr: z1Target - 5, zone: 1, targetCadence: 85 },
        { id: 'rec2', name: 'Aerobic Flush', durationSec: 12 * 60, targetHr: z1Target, zone: 1, targetCadence: 85 },
        { id: 'rec3', name: 'Wind Down', durationSec: 4 * 60, targetHr: z1Target - 8, zone: 1, targetCadence: 80 },
      ],
    },
  ];
}
