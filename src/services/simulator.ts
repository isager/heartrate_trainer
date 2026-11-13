/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeartRateData, TrainerData } from '../types/workout';
import { trainerLogger } from './trainerLogger';

export type SimCalibrationMode = 'normal' | 'spindown_accel' | 'spindown_coast';

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

  // Spindown calibration simulation state
  private simMode: SimCalibrationMode = 'normal';

  // Rider physiology parameters
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

  public setCalibrationMode(mode: SimCalibrationMode) {
    this.simMode = mode;
    if (mode === 'spindown_accel') {
      trainerLogger.log('INFO', 'CALIBRATION', 'Simulator: Accelerating to calibration speed (~34 km/h)');
    } else if (mode === 'spindown_coast') {
      this.currentCadenceRpm = 0;
      trainerLogger.log('INFO', 'CALIBRATION', 'Simulator: Rider stopped pedaling — measuring flywheel coast-down');
    } else {
      this.currentCadenceRpm = 88;
    }
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
    this.simMode = 'normal';
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public setResistancePercent(percent: number) {
    const next = Math.max(0, Math.min(95, percent));
    if (next !== this.currentResistancePercent) {
      trainerLogger.log('TX', 'SIMULATOR', `Set Simulated Resistance: ${next}%`);
    }
    this.currentResistancePercent = next;
  }

  public setUserEffortBias(bias: number) {
    this.userEffortBias = Math.max(-30, Math.min(30, bias));
  }

  public triggerSprintExertion() {
    this.userEffortBias = 20;
    setTimeout(() => {
      this.userEffortBias = 0;
    }, 12000);
  }

  public setCadence(cadence: number) {
    this.currentCadenceRpm = Math.max(0, Math.min(130, cadence));
  }

  private tick() {
    const now = Date.now();
    let rawPower = 0;
    let rawSpeed = 0;
    let effectiveCadence = 0;

    if (this.simMode === 'spindown_accel') {
      // Simulate rider spinning up to ~35 km/h in a higher gear for spindown
      effectiveCadence = Math.round(98 + (Math.random() - 0.5) * 2);
      const targetAccelSpeed = 35.5;
      rawSpeed = Math.round((this.currentSpeedKmh + (targetAccelSpeed - this.currentSpeedKmh) * 0.45) * 10) / 10;
      rawPower = Math.round(230 + (Math.random() - 0.5) * 10);
      this.currentPowerWatts = Math.round(rawPower * this.powerScaleFactor);
      this.currentSpeedKmh = Math.round(rawSpeed * this.speedScaleFactor * 10) / 10;
    } else if (this.simMode === 'spindown_coast') {
      // Simulate flywheel deceleration under roller & electro-brake drag (from ~35 down to 0 over ~9-10s)
      effectiveCadence = 0;
      rawPower = 0;
      const dragDrop = 2.6 + (this.currentSpeedKmh * 0.035);
      rawSpeed = Math.max(0, Math.round((this.currentSpeedKmh / (this.speedScaleFactor || 1) - dragDrop) * 10) / 10);
      this.currentPowerWatts = 0;
      this.currentSpeedKmh = Math.max(0, Math.round(rawSpeed * this.speedScaleFactor * 10) / 10);
    } else {
      // Normal riding physics
      const cadenceJitter = (Math.random() - 0.5) * 1.5;
      effectiveCadence = Math.max(40, this.currentCadenceRpm + cadenceJitter);
      const cadenceFactor = Math.pow(effectiveCadence / 90, 1.15);

      const rawBrakePower = 48 + (this.currentResistancePercent * 3.8);
      rawPower = Math.max(35, Math.min(650, Math.round((rawBrakePower * cadenceFactor) + (this.userEffortBias * 1.5))));

      const power = Math.max(35, Math.min(650, Math.round(rawPower * this.powerScaleFactor)));
      this.currentPowerWatts = power;

      // Baseline roller speed: 19.0 km/h at ~135W
      rawSpeed = Math.max(8, Math.round((Math.pow(rawPower / 3.2, 0.333) * 5.45) * 10) / 10);
      const virtualSpeed = Math.round((rawSpeed * this.speedScaleFactor) * 10) / 10;
      this.currentSpeedKmh = Math.max(8, virtualSpeed);
    }

    // Realistic Cardiac Response Model (First-Order Differential Equation)
    const targetSteadyHr = this.restingHr + (this.currentPowerWatts * 0.46) + (this.userEffortBias * 0.5);
    const clampedTargetSteadyHr = Math.max(this.restingHr + 15, Math.min(this.maxHr, targetSteadyHr));
    const tau = 14;
    const deltaHr = (clampedTargetSteadyHr - this.currentHr) / tau;
    const hrvNoise = (Math.random() - 0.5) * 1.2;

    this.currentHr = Math.max(this.restingHr + 10, Math.min(this.maxHr, this.currentHr + deltaHr + (hrvNoise * 0.3)));
    const roundedBpm = Math.round(this.currentHr);

    trainerLogger.log(
      'RX',
      'SIMULATOR',
      `Speed: ${this.currentSpeedKmh.toFixed(1)} km/h (raw ${rawSpeed.toFixed(1)}) | Cad: ${Math.round(effectiveCadence)} rpm | Pwr: ${this.currentPowerWatts} W | Res: ${this.currentResistancePercent}%`,
      undefined,
      {
        rawSpeedKmh: rawSpeed,
        speedKmh: this.currentSpeedKmh,
        powerWatts: this.currentPowerWatts,
        cadenceRpm: Math.round(effectiveCadence),
        resistancePercent: this.currentResistancePercent,
        hrBpm: roundedBpm,
      }
    );

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
        rawSpeedKmh: rawSpeed,
        powerWatts: this.currentPowerWatts,
        rawPowerWatts: rawPower,
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
