/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeartRateData, TrainerData } from '../types/workout';

export class CyclingSimulator {
  private isRunning: boolean = false;
  private timerId: number | null = null;

  // Simulator physiological state
  private currentHr: number = 110;
  private restingHr: number = 60;
  private maxHr: number = 185;
  private currentResistancePercent: number = 20;
  private currentCadenceRpm: number = 88;
  private currentPowerWatts: number = 135;
  private currentSpeedKmh: number = 19.0;
  
  // Rider physiology parameters
  private riderFatigue: number = 1.0; // scales up HR drift slightly over time
  private userEffortBias: number = 0; // extra effort slider (-20 to +20)
  private powerScaleFactor: number = 1.0;
  private speedScaleFactor: number = 1.0;

  private onHeartRateCallback: ((data: HeartRateData) => void) | null = null;
  private onTrainerDataCallback: ((data: TrainerData) => void) | null = null;

  constructor(maxHr = 185, restingHr = 60) {
    this.maxHr = maxHr;
    this.restingHr = restingHr;
    this.currentHr = restingHr + 25; // warm start
  }

  public setPowerScaleFactor(factor: number) {
    this.powerScaleFactor = Math.max(0.5, Math.min(1.5, factor));
  }

  public setSpeedScaleFactor(factor: number) {
    this.speedScaleFactor = Math.max(0.4, Math.min(2.0, factor));
  }

  public start(
    onHeartRate: (data: HeartRateData) => void,
    onTrainerData: (data: TrainerData) => void
  ) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.onHeartRateCallback = onHeartRate;
    this.onTrainerDataCallback = onTrainerData;

    // Simulation loop runs at 1 Hz
    this.timerId = window.setInterval(() => {
      this.tick();
    }, 1000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public setResistancePercent(percent: number) {
    this.currentResistancePercent = Math.max(5, Math.min(95, percent));
  }

  public setUserEffortBias(bias: number) {
    this.userEffortBias = Math.max(-30, Math.min(30, bias));
  }

  public triggerSprintExertion() {
    // Injects a temporary effort spike (e.g. rider stands on pedals)
    this.userEffortBias = 20;
    setTimeout(() => {
      this.userEffortBias = 0;
    }, 12000);
  }

  public setCadence(cadence: number) {
    this.currentCadenceRpm = Math.max(50, Math.min(130, cadence));
  }

  private tick() {
    const now = Date.now();

    // 1. Calculate realistic Tacx Vortex Power (Watts)
    // Base mechanical flywheel drag: ~48W at 90 RPM
    // Electro-brake resistance adds ~3.8 Watts per 1% resistance at 90 RPM
    // Cadence scaling: Power scales gently with cadence (ratio^1.15)
    const cadenceJitter = (Math.random() - 0.5) * 1.5;
    const effectiveCadence = Math.max(40, this.currentCadenceRpm + cadenceJitter);
    const cadenceFactor = Math.pow(effectiveCadence / 90, 1.15);

    const rawBrakePower = 48 + (this.currentResistancePercent * 3.8);
    let power = (rawBrakePower * cadenceFactor) + (this.userEffortBias * 1.5);
    
    // Apply user calibration scale factor (e.g. 1.0, 0.85, etc.)
    power = Math.max(35, Math.min(650, Math.round(power * this.powerScaleFactor)));
    this.currentPowerWatts = power;

    // 2. Calculate virtual bike speed (km/h) based on realistic indoor roller flywheel physics
    // Calibrated to 19 km/h at ~135W endurance power, multiplied by speedScaleFactor
    const baseSpeed = Math.pow(power / 3.2, 0.333) * 5.45;
    const virtualSpeed = Math.round((baseSpeed * this.speedScaleFactor) * 10) / 10;
    this.currentSpeedKmh = Math.max(8, virtualSpeed);

    // 3. Realistic Cardiac Response Model (First-Order Differential Equation)
    // Steady-state HR target for this mechanical wattage:
    // Typical recreational/enthusiast rider: 100W ≈ 112 BPM, 150W ≈ 134 BPM (Z2), 200W ≈ 152 BPM (Z3), 240W ≈ 168 BPM (Z4)
    const targetSteadyHr = this.restingHr + (power * 0.46) + (this.userEffortBias * 0.5);
    const clampedTargetSteadyHr = Math.max(this.restingHr + 15, Math.min(this.maxHr, targetSteadyHr));

    // Cardiac time constant: ~14 seconds lag to adapt to resistance change
    const tau = 14; 
    const deltaHr = (clampedTargetSteadyHr - this.currentHr) / tau;
    
    // Natural Heart Rate Variability (HRV ± 0.8 BPM noise)
    const hrvNoise = (Math.random() - 0.5) * 1.2;

    this.currentHr = Math.max(this.restingHr + 10, Math.min(this.maxHr, this.currentHr + deltaHr + (hrvNoise * 0.3)));
    const roundedBpm = Math.round(this.currentHr);

    // Emit Heart Rate Data
    if (this.onHeartRateCallback) {
      this.onHeartRateCallback({
        bpm: roundedBpm,
        contactDetected: true,
        rrIntervals: [Math.round((60000 / roundedBpm) + (Math.random() - 0.5) * 30)],
        timestamp: now,
      });
    }

    // Emit Trainer Data
    if (this.onTrainerDataCallback) {
      this.onTrainerDataCallback({
        resistancePercent: this.currentResistancePercent,
        targetPowerWatts: Math.round(this.currentPowerWatts),
        cadenceRpm: Math.round(effectiveCadence),
        speedKmh: this.currentSpeedKmh,
        powerWatts: this.currentPowerWatts,
        timestamp: now,
      });
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      hr: Math.round(this.currentHr),
      resistance: this.currentResistancePercent,
      power: this.currentPowerWatts,
      cadence: this.currentCadenceRpm,
      speed: this.currentSpeedKmh,
    };
  }
}

export const simulator = new CyclingSimulator();
