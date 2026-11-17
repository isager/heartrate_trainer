/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerDecision, ControllerSettings } from '../types/workout';

interface HrSamplePoint {
  timestamp: number;
  bpm: number;
}

export class HeartRateController {
  private lastAdjustmentTime: number = 0;
  private integralError: number = 0;
  private currentResistance: number = 20; // 0 - 100%
  private decisionHistory: ControllerDecision[] = [];
  private hrHistory: HrSamplePoint[] = [];

  constructor(initialResistance: number = 20) {
    this.currentResistance = initialResistance;
  }

  public setResistance(resistance: number) {
    this.currentResistance = Math.max(0, Math.min(100, Math.round(resistance)));
  }

  public getResistance(): number {
    return this.currentResistance;
  }

  public reset() {
    this.integralError = 0;
    this.lastAdjustmentTime = 0;
    this.hrHistory = [];
  }

  private recordHrSample(now: number, bpm: number) {
    if (!Number.isFinite(bpm) || bpm < 25 || bpm > 240) return;
    const last = this.hrHistory[this.hrHistory.length - 1];
    if (!last || now - last.timestamp >= 300) {
      this.hrHistory.push({ timestamp: now, bpm });
    }
    const cutoff = now - 45000;
    while (this.hrHistory.length > 0 && this.hrHistory[0].timestamp < cutoff) {
      this.hrHistory.shift();
    }
  }

  /**
   * Compute smoothed HR trend (BPM/sec) using ordinary least squares over the last ~18s.
   * Rejects 1-BPM quantization jitter while capturing cardiac drift/momentum quickly.
   */
  private getHrSlopeBpmPerSec(now: number): number {
    const windowMs = 18000;
    const win = this.hrHistory.filter((p) => now - p.timestamp <= windowMs);
    if (win.length < 5) return 0;

    const spanMs = win[win.length - 1].timestamp - win[0].timestamp;
    if (spanMs < 6000) return 0;

    const n = win.length;
    const t0 = win[0].timestamp;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;

    for (const p of win) {
      const x = (p.timestamp - t0) / 1000;
      sumX += x;
      sumY += p.bpm;
      sumXX += x * x;
      sumXY += x * p.bpm;
    }

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-6) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * Process a single cardiac telemetry tick using a cardiac-lag-aware PD controller.
   */
  public evaluate(
    currentHr: number,
    settings: ControllerSettings,
    forceNow: boolean = false
  ): ControllerDecision | null {
    const now = Date.now();
    this.recordHrSample(now, currentHr);

    const elapsedSinceLastAdjust = (now - this.lastAdjustmentTime) / 1000;

    // Safety First: Emergency Max HR Check
    if (currentHr >= settings.emergencyMaxHrCutoff) {
      const emergencyDelta = -15;
      const prev = this.currentResistance;
      this.currentResistance = Math.max(settings.minResistance, this.currentResistance + emergencyDelta);
      this.lastAdjustmentTime = now;
      this.integralError = 0;

      const decision: ControllerDecision = {
        timestamp: now,
        action: 'emergency_cutback',
        previousResistance: prev,
        newResistance: this.currentResistance,
        deltaPercent: this.currentResistance - prev,
        currentHr,
        targetHr: settings.targetHr,
        error: settings.targetHr - currentHr,
        reason: `EMERGENCY CUTBACK: Heart rate (${currentHr} BPM) exceeded safety threshold (${settings.emergencyMaxHrCutoff} BPM)! Dropped resistance to ${this.currentResistance}%.`,
      };
      this.decisionHistory.unshift(decision);
      if (this.decisionHistory.length > 50) this.decisionHistory.pop();
      return decision;
    }

    // Rate-limit adjustments to respect stepIntervalSec while still collecting 1 Hz HR history above
    if (!forceNow && elapsedSinceLastAdjust < settings.stepIntervalSec) {
      return null;
    }

    const rawError = settings.targetHr - currentHr; // positive = HR below target
    const absRawError = Math.abs(rawError);

    // Compute derivative trend & cardiac-lag lookahead projection
    const hrSlope = this.getHrSlopeBpmPerSec(now);
    const lookaheadSec =
      settings.responsiveness === 'smooth' ? 22 : settings.responsiveness === 'aggressive' ? 12 : 18;
    const sensitivityFactor =
      settings.responsiveness === 'smooth' ? 0.75 : settings.responsiveness === 'aggressive' ? 1.35 : 1.0;

    const projectedHr = currentHr + hrSlope * lookaheadSec;
    const projectedError = settings.targetHr - projectedHr;
    const trend15s = hrSlope * 15;
    const trendLabel = `${trend15s >= 0 ? '+' : ''}${trend15s.toFixed(1)} BPM/15s`;

    let delta = 0;
    let holdReason: string | null = null;

    // 1. Within Deadband (±deadbandBpm)
    if (absRawError <= settings.deadbandBpm) {
      this.integralError = 0;
      if (hrSlope >= 0.25 && projectedHr > settings.targetHr + settings.deadbandBpm * 1.5 && this.currentResistance > settings.minResistance) {
        // Racing rapidly through the target band -> apply gentle -1% early brake to prevent overshoot
        delta = -1;
      } else if (hrSlope <= -0.25 && projectedHr < settings.targetHr - settings.deadbandBpm * 1.5 && this.currentResistance < settings.maxResistance) {
        // Dropping rapidly through the target band -> gentle +1% catch
        delta = 1;
      } else {
        holdReason = `Holding steady at ${this.currentResistance}%: HR (${currentHr} BPM) is locked within target (${settings.targetHr} ±${settings.deadbandBpm} BPM).`;
      }
    } else if (rawError > 0 && hrSlope > 0.05 && projectedError <= settings.deadbandBpm) {
      // 2. Below target, but HR is already climbing fast enough to reach target via cardiac lag -> HOLD
      this.integralError = 0;
      holdReason = `Holding at ${this.currentResistance}%: HR (${currentHr}/${settings.targetHr} BPM) is already climbing (${trendLabel}) — waiting for cardiac lag to settle.`;
    } else if (rawError < 0 && hrSlope < -0.05 && projectedError >= -settings.deadbandBpm) {
      // 3. Above target, but HR is already recovering smoothly toward target -> HOLD (prevents low-end dumping)
      this.integralError = 0;
      holdReason = `Holding at ${this.currentResistance}%: HR (${currentHr}/${settings.targetHr} BPM) is already recovering (${trendLabel}) — avoiding undershoot.`;
    } else {
      // 4. Compute PD step based on projected error
      const absProjError = Math.abs(projectedError);

      if (projectedError > 0) {
        if (absProjError >= 15) {
          delta = Math.max(2, Math.round(3 * sensitivityFactor));
        } else if (absProjError >= 8) {
          delta = Math.max(1, Math.round(2 * sensitivityFactor));
        } else {
          delta = Math.max(1, Math.round(1 * sensitivityFactor));
        }

        // In Basic Brake (Page 48) mode, Tacx Vortex torque is flat below ~28% at ~20 km/h;
        // Traverse the bottom deadband slightly brisker when stalled below target.
        const mode = settings.fecControlMode ?? (settings.useErgMode ? 'erg' : 'simulation');
        if (mode === 'basic' && this.currentResistance < 28 && absProjError >= 4 && delta < 2) {
          delta = 2;
        }

        // Anti-windup integral: accumulate only when HR has genuinely plateaued
        if (Math.abs(hrSlope) < 0.05) {
          this.integralError += rawError;
          if (this.integralError > 60) {
            delta += 1;
            this.integralError = 0;
          }
        } else {
          this.integralError = Math.max(0, this.integralError * 0.5);
        }
      } else {
        if (absProjError >= 15) {
          delta = -Math.max(2, Math.round(4 * sensitivityFactor));
        } else if (absProjError >= 8) {
          delta = -Math.max(1, Math.round(2 * sensitivityFactor));
        } else {
          delta = -Math.max(1, Math.round(1 * sensitivityFactor));
        }
        this.integralError = 0;
      }
    }

    const prevResistance = this.currentResistance;
    const clampedNew = Math.max(
      settings.minResistance,
      Math.min(settings.maxResistance, prevResistance + delta)
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
      error: rawError,
      reason:
        holdReason ||
        (actualDelta > 0
          ? `HR ${currentHr}/${settings.targetHr} BPM (trend ${trendLabel}, est ${Math.round(projectedHr)}): Raised +${actualDelta}% to ${clampedNew}%.`
          : actualDelta < 0
          ? `HR ${currentHr}/${settings.targetHr} BPM (trend ${trendLabel}, est ${Math.round(projectedHr)}): Lowered ${actualDelta}% to ${clampedNew}%.`
          : `Resistance at configured limit (${clampedNew}%).`),
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
