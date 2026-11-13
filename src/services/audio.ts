/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    // Lazily initialized on first user interaction
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  private getContext(): AudioContext | null {
    if (!this.soundEnabled) return null;
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public playTone(frequency: number, durationMs: number, type: OscillatorType = 'sine', volume: number = 0.15) {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + (durationMs / 1000));
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  public playCountdownBeep(high: boolean = false) {
    if (high) {
      this.playTone(880, 400, 'triangle', 0.25); // high beep (A5)
    } else {
      this.playTone(440, 150, 'sine', 0.18); // standard countdown beep (A4)
    }
  }

  public playTargetLocked() {
    const ctx = this.getContext();
    if (!ctx) return;
    // Pleasant dual chime
    this.playTone(523.25, 120, 'sine', 0.12); // C5
    setTimeout(() => {
      this.playTone(659.25, 200, 'sine', 0.14); // E5
    }, 120);
  }

  public playEmergencyAlarm() {
    const ctx = this.getContext();
    if (!ctx) return;
    // Urgent alarm burst
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playTone(987.77, 100, 'sawtooth', 0.3); // B5 warning
      }, i * 160);
    }
  }

  public playResistanceChanged(increased: boolean) {
    if (increased) {
      this.playTone(400, 60, 'sine', 0.08);
      setTimeout(() => this.playTone(550, 80, 'sine', 0.08), 60);
    } else {
      this.playTone(550, 60, 'sine', 0.08);
      setTimeout(() => this.playTone(400, 80, 'sine', 0.08), 60);
    }
  }
}

export const soundService = new SoundService();
