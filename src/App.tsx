/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { CockpitHUD } from './components/CockpitHUD';
import { DeviceManager } from './components/DeviceManager';
import { WorkoutSelector } from './components/WorkoutSelector';
import { RideHistory } from './components/RideHistory';
import { WorkoutSummaryModal } from './components/WorkoutSummaryModal';
import { SettingsModal } from './components/SettingsModal';
import {
  HeartRateData,
  TrainerData,
  DeviceConnection,
  ControllerSettings,
  ControllerDecision,
  TelemetrySample,
  WorkoutPreset,
  WorkoutSessionSummary,
} from './types/workout';
import { calculateHeartRateZones, getZoneForHeartRate, getDefaultWorkoutPresets } from './utils/zones';
import { bluetoothService, getWebBluetoothSupport, formatBluetoothError } from './services/bluetooth';
import { simulator } from './services/simulator';
import { hrController } from './services/controller';
import { soundService } from './services/audio';
import { saveWorkoutSession, getSavedWorkoutSessions, deleteWorkoutSession } from './services/storage';

const INITIAL_SETTINGS: ControllerSettings = {
  maxHr: 185,
  restingHr: 60,
  deadbandBpm: 2,
  stepIntervalSec: 5,
  responsiveness: 'balanced',
  minResistance: 5,
  maxResistance: 60,
  emergencyMaxHrCutoff: 182,
  targetHr: 135,
  useErgMode: false,
  ftpWatts: 240,
  riderWeightKg: 72,
  powerCalibrationFactor: 1.0,
  speedCalibrationFactor: 1.0,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'workouts' | 'devices' | 'history'>('cockpit');
  const [controllerSettings, setControllerSettings] = useState<ControllerSettings>(() => {
    try {
      const saved = localStorage.getItem('vortexhr_settings');
      return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  // Device connections
  const [isSimulated, setIsSimulated] = useState<boolean>(true); // start in simulator for immediate interactive experience
  const [hrDevice, setHrDevice] = useState<DeviceConnection>({
    status: 'connected',
    name: 'Virtual Cardiac Sensor',
    batteryLevel: 98,
    error: null,
    isSimulated: true,
  });
  const [trainerDevice, setTrainerDevice] = useState<DeviceConnection>({
    status: 'connected',
    name: 'Virtual Tacx Vortex T2180',
    batteryLevel: null,
    error: null,
    isSimulated: true,
  });

  // Live Telemetry
  const [currentHr, setCurrentHr] = useState<HeartRateData | null>({
    bpm: 128,
    timestamp: Date.now(),
    contactDetected: true,
  });
  const [currentTrainer, setCurrentTrainer] = useState<TrainerData | null>({
    resistancePercent: 20,
    targetPowerWatts: 135,
    cadenceRpm: 88,
    speedKmh: 19.0,
    powerWatts: 135,
    timestamp: Date.now(),
  });
  const [lastDecision, setLastDecision] = useState<ControllerDecision | null>(null);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);

  // Sound & UI state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState<boolean>(false);
  const [activeSessionSummary, setActiveSessionSummary] = useState<WorkoutSessionSummary | null>(null);
  const [savedSessions, setSavedSessions] = useState<WorkoutSessionSummary[]>([]);

  // Derived Zones & Presets
  const zones = calculateHeartRateZones(controllerSettings.maxHr, controllerSettings.restingHr);
  const currentZone = getZoneForHeartRate(currentHr?.bpm || 0, zones);
  const presets = getDefaultWorkoutPresets(controllerSettings.maxHr);

  // Workout execution state
  const [isWorkoutActive, setIsWorkoutActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [workoutElapsedTimeSec, setWorkoutElapsedTimeSec] = useState<number>(0);
  const [currentPreset, setCurrentPreset] = useState<WorkoutPreset>(presets[0]);
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState<number>(0);
  const [intervalRemainingSec, setIntervalRemainingSec] = useState<number>(presets[0].intervals[0].durationSec);
  const [timeInZonesSec, setTimeInZonesSec] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });

  // Simulator tweaking state
  const [simulatedEffort, setSimulatedEffort] = useState<number>(0);

  // References for tick loops (prevent interval resets)
  const settingsRef = useRef(controllerSettings);
  settingsRef.current = controllerSettings;
  const isWorkoutActiveRef = useRef(isWorkoutActive);
  isWorkoutActiveRef.current = isWorkoutActive;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const currentPresetRef = useRef<WorkoutPreset>(presets[0]);
  currentPresetRef.current = currentPreset;
  const currentIntervalIndexRef = useRef(currentIntervalIndex);
  currentIntervalIndexRef.current = currentIntervalIndex;

  const currentHrRef = useRef(currentHr);
  currentHrRef.current = currentHr;
  const currentTrainerRef = useRef(currentTrainer);
  currentTrainerRef.current = currentTrainer;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  // Load saved sessions on mount
  useEffect(() => {
    setSavedSessions(getSavedWorkoutSessions());
  }, []);

  // Save settings on change
  const handleUpdateSettings = (newSettings: Partial<ControllerSettings>) => {
    setControllerSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('vortexhr_settings', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      if (updated.powerCalibrationFactor !== undefined) {
        simulator.setPowerScaleFactor(updated.powerCalibrationFactor);
      }
      if (updated.speedCalibrationFactor !== undefined) {
        simulator.setSpeedScaleFactor(updated.speedCalibrationFactor);
      }
      return updated;
    });
  };

  // Heart Rate telemetry ingestion & Closed-Loop Controller
  const handleHeartRateReceived = useCallback((data: HeartRateData) => {
    setCurrentHr(data);

    // Run closed loop controller
    const decision = hrController.evaluate(data.bpm, settingsRef.current);
    if (decision) {
      setLastDecision(decision);

      // Play sound cue if increased/decreased or emergency
      if (decision.action === 'emergency_cutback') {
        soundService.playEmergencyAlarm();
      } else if (decision.action === 'increase' || decision.action === 'decrease') {
        soundService.playResistanceChanged(decision.action === 'increase');
      }

      // Send resistance to trainer or simulator
      if (isSimulated) {
        simulator.setResistancePercent(decision.newResistance);
      } else {
        bluetoothService.setResistancePercent(decision.newResistance);
      }
    }
  }, [isSimulated]);

  // Trainer telemetry ingestion
  const handleTrainerReceived = useCallback((data: Partial<TrainerData>) => {
    setCurrentTrainer(prev => {
      const pFactor = settingsRef.current.powerCalibrationFactor || 1.0;
      const sFactor = settingsRef.current.speedCalibrationFactor || 1.0;

      const rawPower = data.powerWatts ?? prev?.powerWatts ?? 135;
      const scaledPower = Math.round(rawPower * (data.powerWatts !== undefined && !isSimulated ? pFactor : 1.0));

      const rawSpeed = data.speedKmh ?? prev?.speedKmh ?? 19.0;
      const scaledSpeed = Math.round((rawSpeed * (!isSimulated ? sFactor : 1.0)) * 10) / 10;

      const merged: TrainerData = {
        resistancePercent: data.resistancePercent ?? prev?.resistancePercent ?? 20,
        targetPowerWatts: data.targetPowerWatts ?? prev?.targetPowerWatts ?? 135,
        cadenceRpm: data.cadenceRpm ?? prev?.cadenceRpm ?? 88,
        speedKmh: scaledSpeed,
        powerWatts: scaledPower,
        timestamp: data.timestamp ?? Date.now(),
      };
      return merged;
    });
  }, [isSimulated]);

  // Simulator Start/Stop
  useEffect(() => {
    if (isSimulated) {
      simulator.setPowerScaleFactor(controllerSettings.powerCalibrationFactor || 1.0);
      simulator.setSpeedScaleFactor(controllerSettings.speedCalibrationFactor || 1.0);
      simulator.start(handleHeartRateReceived, (trainerData) => {
        handleTrainerReceived(trainerData);
      });
      setHrDevice({
        status: 'connected',
        name: 'Virtual Cardiac Sensor',
        batteryLevel: 98,
        error: null,
        isSimulated: true,
      });
      setTrainerDevice({
        status: 'connected',
        name: 'Virtual Tacx Vortex T2180',
        batteryLevel: null,
        error: null,
        isSimulated: true,
      });
    } else {
      simulator.stop();
      if (hrDevice.isSimulated) {
        setHrDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
      }
      if (trainerDevice.isSimulated) {
        setTrainerDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
      }
    }

    return () => {
      simulator.stop();
    };
  }, [isSimulated, handleHeartRateReceived, handleTrainerReceived]);

  // Telemetry Recorder & Workout Interval Loop (1 Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const currentBpm = currentHrRef.current?.bpm || 0;
      const currentRes = currentTrainerRef.current?.resistancePercent || 20;
      const currentWatts = currentTrainerRef.current?.powerWatts || 0;
      const currentCad = currentTrainerRef.current?.cadenceRpm || 0;
      const currentSpd = currentTrainerRef.current?.speedKmh || 0;

      // 1. Record sample
      setSamples(prev => {
        const lastElapsed = prev.length > 0 ? prev[prev.length - 1].elapsedSec : 0;
        const newElapsed = isWorkoutActiveRef.current && !isPausedRef.current ? lastElapsed + 1 : lastElapsed + 1;
        const sample: TelemetrySample = {
          timestamp: now,
          elapsedSec: newElapsed,
          hr: currentBpm,
          targetHr: settingsRef.current.targetHr,
          resistancePercent: currentRes,
          powerWatts: currentWatts,
          cadenceRpm: currentCad,
          speedKmh: currentSpd,
          intervalIndex: currentIntervalIndexRef.current,
        };
        // Keep last 600 samples (~10 mins) rolling during active view
        return [...prev, sample].slice(-600);
      });

      // 2. If workout is actively running
      if (isWorkoutActiveRef.current && !isPausedRef.current) {
        setWorkoutElapsedTimeSec(sec => sec + 1);

        // Record time in zones
        if (currentBpm > 0 && zonesRef.current.length > 0) {
          const z = getZoneForHeartRate(currentBpm, zonesRef.current);
          setTimeInZonesSec(tz => ({
            ...tz,
            [z.zone]: (tz[z.zone] || 0) + 1,
          }));
        }

        // Interval countdown progression
        const preset = currentPresetRef.current;
        if (preset && preset.intervals.length > 0) {
          setIntervalRemainingSec(rem => {
            const nextRem = rem - 1;

            // Countdown audio cues at 3, 2, 1
            if (nextRem === 3 || nextRem === 2 || nextRem === 1) {
              soundService.playCountdownBeep(false);
            }

            if (nextRem <= 0) {
              // Advance interval
              const nextIdx = currentIntervalIndexRef.current + 1;
              if (nextIdx < preset.intervals.length) {
                setCurrentIntervalIndex(nextIdx);
                currentIntervalIndexRef.current = nextIdx;
                const nextInt = preset.intervals[nextIdx];
                soundService.playCountdownBeep(true); // high chime

                // Auto update target HR for the new interval!
                handleUpdateSettings({ targetHr: nextInt.targetHr });
                return nextInt.durationSec;
              } else {
                // Workout finished!
                handleFinishWorkout();
                return 0;
              }
            }
            return nextRem;
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Connect Real Bluetooth Heart Rate Monitor
  const handleConnectHr = async () => {
    setIsSimulated(false);
    setHrDevice(prev => ({ ...prev, status: 'connecting', error: null, isSimulated: false }));
    try {
      const name = await bluetoothService.connectHeartRate(
        handleHeartRateReceived,
        () => {
          setHrDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
        }
      );
      setHrDevice({ status: 'connected', name, batteryLevel: 95, error: null, isSimulated: false });
    } catch (err: unknown) {
      const msg = formatBluetoothError(err);
      setHrDevice({ status: 'error', name: null, batteryLevel: null, error: msg, isSimulated: false });
    }
  };

  // Connect Real Tacx Smart Trainer
  const handleConnectTrainer = async () => {
    setIsSimulated(false);
    setTrainerDevice(prev => ({ ...prev, status: 'connecting', error: null, isSimulated: false }));
    try {
      const name = await bluetoothService.connectTrainer(
        handleTrainerReceived,
        () => {
          setTrainerDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
        }
      );
      setTrainerDevice({ status: 'connected', name, batteryLevel: null, error: null, isSimulated: false });
    } catch (err: unknown) {
      const msg = formatBluetoothError(err);
      setTrainerDevice({ status: 'error', name: null, batteryLevel: null, error: msg, isSimulated: false });
    }
  };

  const handleConnectBoth = async () => {
    await handleConnectTrainer();
    await handleConnectHr();
  };

  const handleDisconnectHr = () => {
    bluetoothService.disconnectHeartRate();
    setHrDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
  };

  const handleDisconnectTrainer = () => {
    bluetoothService.disconnectTrainer();
    setTrainerDevice({ status: 'disconnected', name: null, batteryLevel: null, error: null, isSimulated: false });
  };

  // Toggle Simulator
  const handleToggleSimulator = () => {
    if (isSimulated) {
      setIsSimulated(false);
      bluetoothService.disconnectAll();
    } else {
      setIsSimulated(true);
    }
  };

  // Manual Resistance Nudge (+1%, -1%, +5%, -5%)
  const handleManualResistanceNudge = (deltaPercent: number) => {
    const current = currentTrainer?.resistancePercent || 25;
    const clamped = Math.max(5, Math.min(85, current + deltaPercent));
    hrController.setResistance(clamped);

    const decision: ControllerDecision = {
      timestamp: Date.now(),
      action: 'manual',
      previousResistance: current,
      newResistance: clamped,
      deltaPercent,
      currentHr: currentHr?.bpm || 0,
      targetHr: controllerSettings.targetHr,
      error: controllerSettings.targetHr - (currentHr?.bpm || 0),
      reason: `Manual rider override: Adjusted resistance by ${deltaPercent > 0 ? `+${deltaPercent}` : deltaPercent}% to ${clamped}%.`,
    };
    setLastDecision(decision);

    if (isSimulated) {
      simulator.setResistancePercent(clamped);
    } else {
      bluetoothService.setResistancePercent(clamped);
    }
    soundService.playResistanceChanged(deltaPercent > 0);
  };

  // Workout Controls
  const handleStartWorkout = (preset?: WorkoutPreset) => {
    const targetPreset = preset || currentPreset || presets[0];
    setCurrentPreset(targetPreset);
    currentPresetRef.current = targetPreset;
    setCurrentIntervalIndex(0);
    currentIntervalIndexRef.current = 0;
    setIntervalRemainingSec(targetPreset.intervals[0].durationSec);
    setIsWorkoutActive(true);
    isWorkoutActiveRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setWorkoutElapsedTimeSec(0);
    setTimeInZonesSec({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

    // If neither real trainer is connected nor simulator is active, turn on simulator
    if (!bluetoothService.isTrainerConnected() && !isSimulated) {
      setIsSimulated(true);
    }

    // Set target HR to first interval
    handleUpdateSettings({ targetHr: targetPreset.intervals[0].targetHr });
    setActiveTab('cockpit');
    soundService.playCountdownBeep(true);
  };

  const handlePauseWorkout = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const handleResumeWorkout = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    soundService.playCountdownBeep(true);
  };

  const handleFinishWorkout = () => {
    setIsWorkoutActive(false);
    isWorkoutActiveRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;

    // Compute workout summary stats
    const validSamples = samples.filter(s => s.hr > 40);
    const avgHr = validSamples.length > 0 ? Math.round(validSamples.reduce((a, b) => a + b.hr, 0) / validSamples.length) : 0;
    const maxHr = validSamples.length > 0 ? Math.max(...validSamples.map(s => s.hr)) : 0;
    const avgPower = validSamples.length > 0 ? Math.round(validSamples.reduce((a, b) => a + b.powerWatts, 0) / validSamples.length) : 0;
    const maxPower = validSamples.length > 0 ? Math.max(...validSamples.map(s => s.powerWatts)) : 0;
    const avgCadence = validSamples.length > 0 ? Math.round(validSamples.reduce((a, b) => a + b.cadenceRpm, 0) / validSamples.length) : 0;
    
    // Estimate distance (speed * time)
    const avgSpeed = validSamples.length > 0 ? validSamples.reduce((a, b) => a + b.speedKmh, 0) / validSamples.length : 25;
    const distanceKm = Math.round((avgSpeed * (workoutElapsedTimeSec / 3600)) * 10) / 10;
    // Estimate calories (Watts * seconds * 3.6 / 1000 / efficiency ~0.24)
    const estimatedCalories = Math.round((avgPower * workoutElapsedTimeSec * 4) / 1000);

    const summary: WorkoutSessionSummary = {
      id: `ride_${Date.now()}`,
      workoutName: currentPreset?.title || 'Target Heart Rate Hold',
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      startTime: Date.now() - (workoutElapsedTimeSec * 1000),
      durationSec: workoutElapsedTimeSec || 60,
      avgHr,
      maxHr,
      avgPower,
      maxPower,
      avgCadence,
      distanceKm,
      estimatedCalories,
      timeInZonesSec,
      samples: [...samples],
    };

    saveWorkoutSession(summary);
    setSavedSessions(getSavedWorkoutSessions());
    setActiveSessionSummary(summary);
    setSummaryModalOpen(true);
  };

  // Fullscreen toggle
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentInterval = currentPreset ? currentPreset.intervals[currentIntervalIndex] || null : null;
  const nextInterval = currentPreset && currentIntervalIndex + 1 < currentPreset.intervals.length
    ? currentPreset.intervals[currentIntervalIndex + 1]
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract compliant Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hrDevice={hrDevice}
        trainerDevice={trainerDevice}
        isSimulated={isSimulated}
        onToggleSimulator={handleToggleSimulator}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundService.setEnabled(next);
        }}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenSettings={() => setSettingsModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-24 md:pb-8">
        {activeTab === 'cockpit' && (
          <CockpitHUD
            heartRate={currentHr}
            trainer={currentTrainer}
            currentZone={currentZone}
            zones={zones}
            controllerSettings={controllerSettings}
            onUpdateSettings={handleUpdateSettings}
            lastDecision={lastDecision}
            onManualResistanceNudge={handleManualResistanceNudge}
            isWorkoutActive={isWorkoutActive}
            isPaused={isPaused}
            onStartWorkout={() => handleStartWorkout()}
            onPauseWorkout={handlePauseWorkout}
            onResumeWorkout={handleResumeWorkout}
            onStopWorkout={handleFinishWorkout}
            workoutElapsedTimeSec={workoutElapsedTimeSec}
            currentInterval={currentInterval}
            currentIntervalIndex={currentIntervalIndex}
            totalIntervals={currentPreset?.intervals.length || 1}
            intervalRemainingSec={intervalRemainingSec}
            nextInterval={nextInterval}
            samples={samples}
            isSimulated={isSimulated}
            onSimulateSprint={() => simulator.triggerSprintExertion()}
            simulatedEffort={simulatedEffort}
            onChangeSimulatedEffort={(eff) => {
              setSimulatedEffort(eff);
              simulator.setUserEffortBias(eff);
            }}
          />
        )}

        {activeTab === 'workouts' && (
          <WorkoutSelector
            presets={presets}
            selectedPresetId={currentPreset?.id || presets[0].id}
            onSelectPreset={(p) => setCurrentPreset(p)}
            onStartWorkout={(p) => handleStartWorkout(p)}
            zones={zones}
            maxHr={controllerSettings.maxHr}
          />
        )}

        {activeTab === 'devices' && (
          <DeviceManager
            hrDevice={hrDevice}
            trainerDevice={trainerDevice}
            isSimulated={isSimulated}
            onConnectHr={handleConnectHr}
            onDisconnectHr={handleDisconnectHr}
            onConnectTrainer={handleConnectTrainer}
            onDisconnectTrainer={handleDisconnectTrainer}
            onConnectBoth={handleConnectBoth}
            onToggleSimulator={handleToggleSimulator}
            onStartRide={() => setActiveTab('cockpit')}
          />
        )}

        {activeTab === 'history' && (
          <RideHistory
            sessions={savedSessions}
            onSelectSession={(s) => {
              setActiveSessionSummary(s);
              setSummaryModalOpen(true);
            }}
            onDeleteSession={(id) => {
              deleteWorkoutSession(id);
              setSavedSessions(getSavedWorkoutSessions());
            }}
            onStartNewRide={() => {
              setActiveTab('cockpit');
              handleStartWorkout();
            }}
            onImportSession={(session) => {
              saveWorkoutSession(session);
              setSavedSessions(getSavedWorkoutSessions());
            }}
            onApplyWatchSpeedCalibration={(factor) => {
              handleUpdateSettings({ speedCalibrationFactor: factor });
            }}
          />
        )}
      </main>

      {/* Settings Modal */}
      {settingsModalOpen && (
        <SettingsModal
          settings={controllerSettings}
          zones={zones}
          onSaveSettings={handleUpdateSettings}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}

      {/* Workout Summary Modal */}
      {summaryModalOpen && activeSessionSummary && (
        <WorkoutSummaryModal
          session={activeSessionSummary}
          zones={zones}
          onClose={() => setSummaryModalOpen(false)}
        />
      )}
    </div>
  );
}
