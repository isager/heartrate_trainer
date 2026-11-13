/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TrainerLogDirection = 'RX' | 'TX' | 'INFO' | 'ERR';

export type TrainerLogSource =
  | 'FTMS_DATA'
  | 'FTMS_CTRL'
  | 'FTMS_STATUS'
  | 'FTMS_FEATURE'
  | 'TACX_FEC'
  | 'CSC'
  | 'CPS'
  | 'HRM'
  | 'SIMULATOR'
  | 'CALIBRATION';

export interface TrainerLogMetrics {
  rawSpeedKmh?: number;
  speedKmh?: number;
  powerWatts?: number;
  cadenceRpm?: number;
  resistancePercent?: number;
  hrBpm?: number;
  flagsHex?: string;
}

export interface TrainerLogEntry {
  id: string;
  timestamp: number;
  isoTime: string;
  direction: TrainerLogDirection;
  source: TrainerLogSource;
  rawHex?: string;
  summary: string;
  metrics?: TrainerLogMetrics;
}

const MAX_LOG_ENTRIES = 600;

export function dataViewToHex(view: DataView | Uint8Array): string {
  const bytes = view instanceof DataView
    ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    : view;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

class TrainerCommunicationLogger {
  private logs: TrainerLogEntry[] = [];
  private listeners: Set<(logs: TrainerLogEntry[]) => void> = new Set();
  private counter = 0;

  public log(
    direction: TrainerLogDirection,
    source: TrainerLogSource,
    summary: string,
    rawHex?: string,
    metrics?: TrainerLogMetrics
  ): void {
    const now = Date.now();
    this.counter += 1;
    const entry: TrainerLogEntry = {
      id: `log_${now}_${this.counter}`,
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      direction,
      source,
      rawHex,
      summary,
      metrics,
    };

    this.logs = [entry, ...this.logs].slice(0, MAX_LOG_ENTRIES);
    this.notify();
  }

  public getLogs(): TrainerLogEntry[] {
    return this.logs;
  }

  public clear(): void {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: (logs: TrainerLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.logs);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn(this.logs));
  }

  public exportCsv(): void {
    const headers = [
      'ISO_Timestamp',
      'Direction',
      'Source',
      'Raw_Hex',
      'Raw_Speed_KMH',
      'Power_W',
      'Cadence_RPM',
      'Resistance_Pct',
      'HR_BPM',
      'Flags_Hex',
      'Summary',
    ];

    // Export oldest-first chronologically
    const ordered = [...this.logs].reverse();
    const rows = ordered.map((l) => [
      l.isoTime,
      l.direction,
      l.source,
      l.rawHex || '',
      l.metrics?.rawSpeedKmh ?? '',
      l.metrics?.powerWatts ?? '',
      l.metrics?.cadenceRpm ?? '',
      l.metrics?.resistancePercent ?? '',
      l.metrics?.hrBpm ?? '',
      l.metrics?.flagsHex ?? '',
      `"${l.summary.replace(/"/g, '""')}"`,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    this.downloadBlob(csv, `vortexhr-trainer-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`, 'text/csv');
  }

  public exportJson(): void {
    const ordered = [...this.logs].reverse();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'VortexHR',
      entryCount: ordered.length,
      entries: ordered,
    };
    this.downloadBlob(
      JSON.stringify(payload, null, 2),
      `vortexhr-trainer-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`,
      'application/json'
    );
  }

  private downloadBlob(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const trainerLogger = new TrainerCommunicationLogger();
