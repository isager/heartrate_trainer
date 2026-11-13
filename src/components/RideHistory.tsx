/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  Heart,
  Zap,
  Download,
  Trash2,
  Share2,
  FileCode,
  Flame,
  Award,
  Play,
  Upload,
  Watch,
  CheckCircle2,
  ExternalLink,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WorkoutSessionSummary } from '../types/workout';
import { exportWorkoutToTcx, exportWorkoutToCsv, parseTcxWorkoutSession } from '../services/storage';

interface RideHistoryProps {
  sessions: WorkoutSessionSummary[];
  onSelectSession: (session: WorkoutSessionSummary) => void;
  onDeleteSession: (id: string) => void;
  onStartNewRide: () => void;
  onImportSession?: (session: WorkoutSessionSummary) => void;
  onApplyWatchSpeedCalibration?: (factor: number) => void;
}

export const RideHistory: React.FC<RideHistoryProps> = ({
  sessions,
  onSelectSession,
  onDeleteSession,
  onStartNewRide,
  onImportSession,
  onApplyWatchSpeedCalibration,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showGarminGuide, setShowGarminGuide] = useState<boolean>(true);
  const [calibrationSuccess, setCalibrationSuccess] = useState<boolean>(false);

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const parsed = parseTcxWorkoutSession(content);
      if (parsed) {
        if (onImportSession) {
          onImportSession(parsed);
        }
        setImportStatus(`Successfully imported "${parsed.workoutName}" with ${parsed.samples.length} telemetry points!`);
        setTimeout(() => setImportStatus(null), 5000);
      } else {
        setImportStatus('Failed to parse file. Make sure it is a valid Garmin .TCX file.');
        setTimeout(() => setImportStatus(null), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyGarminCalibration = () => {
    // Garmin activity #25044771559 recorded 20.2 km/h over 31:42 (10.65 km)
    // 20.2 km/h vs base 19.0 km/h = 1.063x calibration factor
    const calculatedFactor = 1.06;
    if (onApplyWatchSpeedCalibration) {
      onApplyWatchSpeedCalibration(calculatedFactor);
    }
    setCalibrationSuccess(true);
    setTimeout(() => setCalibrationSuccess(false), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Workout History & Garmin Sync
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Recorded cycling sessions with closed-loop Tacx Vortex resistance telemetry. Export to Garmin or import watch activities.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".tcx,.xml"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Garmin .TCX</span>
          </button>

          {sessions.length > 0 && (
            <button
              onClick={onStartNewRide}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-md shadow-rose-950/40"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>New Ride</span>
            </button>
          )}
        </div>
      </div>

      {/* Import Status Alert */}
      {importStatus && (
        <div className="p-3 bg-sky-950/70 border border-sky-500/40 rounded-xl text-xs text-sky-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      {/* GARMIN WATCH ACTIVITY SYNC & CALIBRATION CARD */}
      <div className="bg-gradient-to-br from-slate-900 to-sky-950/40 border border-sky-500/30 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <Watch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Garmin Watch Activity Detected
                </span>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 font-mono px-2 py-0.5 rounded border border-sky-500/30">
                  #25044771559
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Indendørs cykling (Indoor Cycling)
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Your linked Garmin Connect activity recorded <strong>10.65 km</strong> in <strong>31:42</strong> with an average speed of <strong className="text-sky-300 font-mono">20.2 km/h</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowGarminGuide(!showGarminGuide)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 shrink-0 p-1"
          >
            <span>{showGarminGuide ? 'Hide details' : 'How this helps'}</span>
            {showGarminGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Action strip: 1-click calibrate to watch */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-300">
            Speed Calibration: Align Tacx Vortex roller speed to your watch's <strong>20.2 km/h</strong> baseline.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyGarminCalibration}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                calibrationSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              {calibrationSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Calibrated to Watch (1.06x)</span>
                </>
              ) : (
                <>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Calibrate Speed to 20.2 km/h</span>
                </>
              )}
            </button>

            <a
              href="https://connect.garmin.com/modern/activity/25044771559?share_unique_id=2"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 transition-colors inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in Garmin</span>
            </a>
          </div>
        </div>

        {/* Expandable Guide: How Garmin Watch + Activity are useful */}
        {showGarminGuide && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                <span>1. Live HR Broadcast</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Your Garmin watch can broadcast live heart rate over Bluetooth (Hold Up &rarr; Sensors & Accessories &rarr; Wrist Heart Rate &rarr; Broadcast HR). The app pairs with it directly to control trainer resistance.
              </p>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <span>2. True Speed Benchmark</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Your watch's 20.2 km/h gives an exact reference for your gear ratio and cadence. Clicking "Calibrate Speed" applies this ratio so your app dashboard matches your watch.
              </p>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>3. Sync Back to Garmin</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Export any finished workout as a <strong>TCX</strong> file below and import it at <code>connect.garmin.com</code> to update your Garmin training load, intensity minutes, and recovery advisor!
              </p>
            </div>
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Award className="w-8 h-8 text-slate-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No workouts recorded yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Complete your first workout in the Cockpit HUD. Telemetry, heart rate zones, and resistance changes will be stored here.
            </p>
          </div>
          <button
            onClick={onStartNewRide}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start First Ride</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map(session => (
            <div
              key={session.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-all shadow-md"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left info */}
                <div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {session.date}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(session.durationSec)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {session.workoutName}
                  </h3>
                </div>

                {/* Key stats tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-y lg:border-y-0 lg:border-x border-slate-800 lg:px-6">
                  <div>
                    <div className="text-[11px] text-slate-400">Avg Heart Rate</div>
                    <div className="text-sm font-mono font-bold text-rose-400">
                      {session.avgHr} <span className="text-xs font-normal text-slate-400">BPM</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400">Max Heart Rate</div>
                    <div className="text-sm font-mono font-bold text-rose-300">
                      {session.maxHr} <span className="text-xs font-normal text-slate-400">BPM</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400">Avg Power</div>
                    <div className="text-sm font-mono font-bold text-violet-300">
                      {session.avgPower} <span className="text-xs font-normal text-slate-400">W</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400">Energy & Distance</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {session.estimatedCalories} <span className="text-xs font-normal text-slate-400">kcal</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-end lg:self-center">
                  <button
                    onClick={() => onSelectSession(session)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                  >
                    View Analytics
                  </button>

                  <button
                    onClick={() => exportWorkoutToTcx(session)}
                    title="Export Garmin / Strava TCX File"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>TCX</span>
                  </button>

                  <button
                    onClick={() => exportWorkoutToCsv(session)}
                    title="Export Raw CSV Data"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>

                  <button
                    onClick={() => onDeleteSession(session.id)}
                    title="Delete Ride"
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
