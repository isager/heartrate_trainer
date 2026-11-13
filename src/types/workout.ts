/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HeartRateData {
  bpm: number;
  rrIntervals?: number[];
  contactDetected?: boolean;
  timestamp: number;
}

export interface TrainerData {
  resistancePercent: number; // 0 to 100%
  targetPowerWatts: number;   // calculated or ERG setpoint
  cadenceRpm: number;
  speedKmh: number;
  powerWatts: number;
  rawSpeedKmh?: number;      // uncalibrated speed reported by trainer/sim
  rawPowerWatts?: number;    // uncalibrated power reported by trainer/sim
  timestamp: number;
}

export interface HeartRateZone {
  zone: number; // 1 to 5
  name: string;
  minPercent: number;
  maxPercent: number;
  minBpm: number;
  maxBpm: number;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export type ControlMode = 'auto_hr_hold' | 'workout_interval' | 'manual_resistance';

export interface WorkoutInterval {
  id: string;
  name: string;
  durationSec: number;
  targetHr: number;
  zone: number;
  targetCadence?: number;
  notes?: string;
}

export interface WorkoutPreset {
  id: string;
  title: string;
  subtitle: string;
  category: 'Endurance' | 'Threshold' | 'HIIT' | 'Recovery' | 'Ramp';
  totalDurationSec: number;
  estimatedTss: number;
  description: string;
  intervals: WorkoutInterval[];
}

export interface CalibrationRecord {
  timestamp: number;
  method: 'spindown_ftms' | 'spindown_software' | 'watch_match';
  spindownDurationSec?: number;
  peakSpeedKmh?: number;
  endSpeedKmh?: number;
  dragStatus: 'optimal' | 'tight' | 'loose' | 'custom';
  powerFactor: number;
  speedFactor: number;
  notes: string;
}

export interface ControllerSettings {
  maxHr: number;
  restingHr: number;
  deadbandBpm: number; // e.g. 2 BPM
  stepIntervalSec: number; // e.g. 5 sec between resistance adjustments
  responsiveness: 'smooth' | 'balanced' | 'aggressive';
  minResistance: number; // e.g. 5%
  maxResistance: number; // e.g. 80%
  emergencyMaxHrCutoff: number; // e.g. 182 BPM (drops resistance immediately)
  targetHr: number; // current active target
  useErgMode: boolean; // FTMS ERG Target Power (Watts) instead of raw resistance %
  ftpWatts: number;
  riderWeightKg: number;
  powerCalibrationFactor: number; // e.g. 1.0 (0.6x to 1.4x for calibrating power scale)
  speedCalibrationFactor: number; // e.g. 1.0 (0.5x to 1.5x for matching watch or bike computer speed)
  wheelCircumferenceMm?: number; // effective wheel circumference in mm (default 2096)
  lastCalibration?: CalibrationRecord;
}

export interface ControllerDecision {
  timestamp: number;
  action: 'hold' | 'increase' | 'decrease' | 'emergency_cutback' | 'manual';
  previousResistance: number;
  newResistance: number;
  deltaPercent: number;
  currentHr: number;
  targetHr: number;
  error: number;
  reason: string;
}

export interface TelemetrySample {
  timestamp: number;
  elapsedSec: number;
  hr: number;
  targetHr: number;
  resistancePercent: number;
  powerWatts: number;
  cadenceRpm: number;
  speedKmh: number;
  intervalIndex?: number;
}

export interface WorkoutSessionSummary {
  id: string;
  workoutName: string;
  date: string;
  startTime: number;
  durationSec: number;
  avgHr: number;
  maxHr: number;
  avgPower: number;
  maxPower: number;
  avgCadence: number;
  distanceKm: number;
  estimatedCalories: number;
  timeInZonesSec: Record<number, number>; // zone 1..5
  samples: TelemetrySample[];
}

export interface DeviceConnection {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  name: string | null;
  batteryLevel: number | null;
  error: string | null;
  isSimulated: boolean;
}
