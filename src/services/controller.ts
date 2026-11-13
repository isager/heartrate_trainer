/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerDecision, ControllerSettings } from '../types/workout';

export class HeartRateController {
  private lastAdjustmentTime: number = 0;
  private integralError: number = 0;
  private currentResistance: number = 20; // 0 - 100%
  private decisionHistory: ControllerDecision[] = [];

  constructor(initialResistance: number = 20) {
    this.currentResistance = initialResistance;
  }

  public setResistance(resistance: number) {
    this.currentResistance = Math.max(5, Math.min(95, Math.round(resistance)));
  }

  public getResistance(): number {
    return this.currentResistance;
  }

  public reset() {
    this.integralError = 0;
    this.lastAdjustmentTime = 0;
  }

  /**
   * Process a single cardiac telemetry tick and compute resistance adjustment
   */
  public evaluate(
    currentHr: number,
    settings: ControllerSettings,
    forceNow: boolean = false
  ): ControllerDecision | null {
    const now = Date.now();
    const elapsedSinceLastAdjust = (now - this.lastAdjustmentTime) / 1000;

    // Safety First: Emergency Max HR Check
    if (currentHr >= settings.emergencyMaxHrCutoff) {
      const emergencyDelta = -15; // aggressive reduction
      const prev = this.currentResistance;
      this.currentResistance = Math.max(settings.minResistance, this.currentResistance + emergencyDelta);
      this.lastAdjustmentTime = now;

      const decision: ControllerDecision = {
        timestamp: now,
        action: 'emergency_cutback',
        previousResistance: prev,
        newResistance: this.currentResistance,
        deltaPercent: emergencyDelta,
        currentHr,
        targetHr: settings.targetHr,
        error: settings.targetHr - currentHr,
        reason: `EMERGENCY CUTBACK: Heart rate (${currentHr} BPM) exceeded safety threshold (${settings.emergencyMaxHrCutoff} BPM)! Dropped resistance by 15%.`,
      };
      this.decisionHistory.unshift(decision);
      return decision;
    }

    // Rate-limit adjustments to allow cardiac lag to stabilize
    if (!forceNow && elapsedSinceLastAdjust < settings.stepIntervalSec) {
      return null;
    }

    const error = settings.targetHr - currentHr; // positive = HR too low, need more resistance
    const absError = Math.abs(error);

    // 1. Within Deadband (e.g. ±2 BPM) -> Hold steady
    if (absError <= settings.deadbandBpm) {
      this.lastAdjustmentTime = now;
      this.integralError = 0; // reset accumulated drift
      
      const decision: ControllerDecision = {
        timestamp: now,
        action: 'hold',
        previousResistance: this.currentResistance,
        newResistance: this.currentResistance,
        deltaPercent: 0,
        currentHr,
        targetHr: settings.targetHr,
        error,
        reason: `Holding steady: Heart rate (${currentHr} BPM) is locked within target zone (±${settings.deadbandBpm} BPM).`,
      };
      this.decisionHistory.unshift(decision);
      return decision;
    }

    // 2. Multipliers based on Responsiveness Mode
    let sensitivityFactor = 1.0;
    if (settings.responsiveness === 'smooth') sensitivityFactor = 0.7;
    if (settings.responsiveness === 'aggressive') sensitivityFactor = 1.4;

    // 3. Compute Delta Resistance
    let delta = 0;

    if (error > 0) {
      // HR is BELOW target -> Need to increase trainer resistance
      if (absError >= 15) {
        delta = Math.round(4 * sensitivityFactor);
      } else if (absError >= 8) {
        delta = Math.round(3 * sensitivityFactor);
      } else if (absError >= 4) {
        delta = Math.round(2 * sensitivityFactor);
      } else {
        delta = Math.round(1 * sensitivityFactor);
      }

      // If integral error has built up (HR stuck low for >20s), add +1 nudge
      this.integralError += error;
      if (this.integralError > 40) {
        delta += 1;
        this.integralError = 0;
      }
    } else {
      // HR is ABOVE target -> Need to reduce trainer resistance
      if (absError >= 15) {
        delta = -Math.round(5 * sensitivityFactor);
      } else if (absError >= 8) {
        delta = -Math.round(3 * sensitivityFactor);
      } else if (absError >= 4) {
        delta = -Math.round(2 * sensitivityFactor);
      } else {
        delta = -Math.round(1 * sensitivityFactor);
      }

      this.integralError = 0; // clear when dropping
    }

    // Never 0 if outside deadband
    if (delta === 0) {
      delta = error > 0 ? 1 : -1;
    }

    const prevResistance = this.currentResistance;
    const clampedNew = Math.max(
      settings.minResistance,
      Math.min(settings.maxResistance, this.currentResistance + delta)
    );

    this.currentResistance = clampedNew;
    this.lastAdjustmentTime = now;

    const actualDelta = clampedNew - prevResistance;
    const action = actualDelta > 0 ? 'increase' : actualDelta < 0 ? 'decrease' : 'hold';

    const decision: ControllerDecision = {
      timestamp: now,
      action,
      previousResistance: prevResistance,
      newResistance: clampedNew,
      deltaPercent: actualDelta,
      currentHr,
      targetHr: settings.targetHr,
      error,
      reason:
        actualDelta > 0
          ? `HR is ${absError} BPM below target (${currentHr}/${settings.targetHr}). Raised resistance +${actualDelta}% to increase workload.`
          : actualDelta < 0
          ? `HR is ${absError} BPM above target (${currentHr}/${settings.targetHr}). Lowered resistance ${actualDelta}% to facilitate recovery.`
          : `Resistance reached limit (${clampedNew}%).`,
    };

    this.decisionHistory.unshift(decision);
    if (this.decisionHistory.length > 50) this.decisionHistory.pop();

    return decision;
  }

  public getRecentDecisions(limit: number = 5): ControllerDecision[] {
    return this.decisionHistory.slice(0, limit);
  }
}

export const hrController = new HeartRateController(20);
