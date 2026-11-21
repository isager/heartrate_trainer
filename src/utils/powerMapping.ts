/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Map a 0..100% closed-loop control level to Target Power (Watts) for ERG mode
 * (FE-C Page 49 / FTMS Opcode 0x05).
 *
 * Scaled from the rider's FTP so warmup/recovery (~28-35% FTP, ~70-95 W at 240 W FTP)
 * through threshold/VO2 (~100-120% FTP) are smoothly reachable in ~2 W steps per 1%.
 */
export function resistancePercentToTargetWatts(percent: number, ftpWatts: number = 240): number {
  const clamped = Math.max(0, Math.min(100, percent));
  const validFtp = ftpWatts >= 80 && ftpWatts <= 600 ? ftpWatts : 240;
  return Math.max(50, Math.min(600, Math.round((0.28 + (clamped / 100) * 0.92) * validFtp)));
}

/**
 * Inverse mapping: convert an observed wattage to the closest 0..100% control level
 * so switching into ERG mode mid-ride preserves current effort without a sudden jump.
 */
export function targetWattsToResistancePercent(watts: number, ftpWatts: number = 240): number {
  const validFtp = ftpWatts >= 80 && ftpWatts <= 600 ? ftpWatts : 240;
  const normalized = (watts / validFtp - 0.28) / 0.92;
  return Math.max(0, Math.min(100, Math.round(normalized * 100)));
}
