/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Bluetooth,
  Heart,
  Gauge,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Power,
  Info,
  HelpCircle,
  Cpu,
  ExternalLink,
  Watch,
  Sliders,
} from 'lucide-react';
import { DeviceConnection, CalibrationRecord } from '../types/workout';
import { getWebBluetoothSupport, isRunningInIframe } from '../services/bluetooth';
import { TrainerLogPanel } from './TrainerLogPanel';

interface DeviceManagerProps {
  hrDevice: DeviceConnection;
  trainerDevice: DeviceConnection;
  isSimulated: boolean;
  onConnectHr: () => void;
  onDisconnectHr: () => void;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onConnectBoth: () => void;
  onToggleSimulator: () => void;
  onStartRide: () => void;
  onOpenCalibration?: () => void;
  lastCalibration?: CalibrationRecord;
}

export const DeviceManager: React.FC<DeviceManagerProps> = ({
  hrDevice,
  trainerDevice,
  isSimulated,
  onConnectHr,
  onDisconnectHr,
  onConnectTrainer,
  onDisconnectTrainer,
  onConnectBoth,
  onToggleSimulator,
  onStartRide,
  onOpenCalibration,
  lastCalibration,
}) => {
  const bleSupport = getWebBluetoothSupport();

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Title & Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Bluetooth Device Pairing
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Connect your Tacx Vortex smart trainer and Bluetooth heart rate monitor for real-time closed-loop resistance adjustment.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSimulator}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors ${
                isSimulated
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>{isSimulated ? 'Simulation Active' : 'Switch to Simulator'}</span>
            </button>

            {bleSupport.supported && !isSimulated && (
              <button
                onClick={onConnectBoth}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-950/40 transition-colors"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Pair Devices</span>
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Tab Banner for Direct Bluetooth Hardware Access when in iframe */}
        {bleSupport.isIframe && (
          <div className="mt-4 p-4 bg-sky-950/60 border border-sky-500/40 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <ExternalLink className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-sky-200">
                  Direct Bluetooth Hardware Access
                </h4>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Web browsers (Chrome & Edge) block the Web Bluetooth API inside embedded iframe previews (<code>Access disallowed by permissions policy</code>). To pair your physical Tacx Vortex trainer and Heart Rate strap, open this app directly in a full browser tab.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Dedicated Browser Tab</span>
              </a>

              <button
                onClick={onToggleSimulator}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-amber-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{isSimulated ? 'Using Simulator in Preview' : 'Switch to Virtual Simulator'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Web Bluetooth Browser Support Notice if restricted and NOT just iframe */}
        {!bleSupport.supported && !bleSupport.isIframe && (
          <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">
                Web Bluetooth Notice
              </p>
              <p className="mt-0.5 text-amber-200/90 leading-relaxed">
                {bleSupport.reason || 'Web Bluetooth requires Chrome or Edge on desktop/Android or Bluefy on iOS.'} You can use the built-in <strong>Cycling Simulator</strong> to test all features and workflows without hardware.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* DEVICE CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* CARD 1: TACX VORTEX SMART TRAINER */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Gauge className="w-6 h-6" />
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  trainerDevice.status === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : trainerDevice.status === 'connecting'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    trainerDevice.status === 'connected'
                      ? 'bg-emerald-400'
                      : trainerDevice.status === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-slate-500'
                  }`}
                />
                <span className="capitalize">{isSimulated ? 'Simulated' : trainerDevice.status}</span>
              </span>
            </div>

            <h3 className="text-lg font-bold text-white tracking-tight">
              Tacx Vortex Smart Trainer
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Interactive wheel-on electro-brake trainer with dynamic target resistance & ERG power control.
            </p>

            <div className="mt-4 space-y-2 text-xs text-slate-300">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Device Name</span>
                <span className="font-mono font-medium text-slate-200">
                  {isSimulated ? 'Virtual Tacx Vortex T2180' : trainerDevice.name || 'Not paired'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Supported Protocols</span>
                <span className="font-mono text-slate-300">FTMS (0x1826) & FE-C</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Resistance Control</span>
                <span className="text-emerald-400 font-medium">Electro-Brake 0-100%</span>
              </div>
            </div>

            {trainerDevice.error && (
              <div className="mt-3 text-xs bg-rose-500/10 p-3 rounded-xl border border-rose-500/30 space-y-2">
                <p className="text-rose-300 leading-relaxed font-medium">
                  {trainerDevice.error}
                </p>
                {trainerDevice.error.includes('permissions policy') && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Dedicated Tab</span>
                    </a>
                    <button
                      onClick={onToggleSimulator}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px] inline-flex items-center gap-1 border border-slate-750"
                    >
                      <Cpu className="w-3 h-3" />
                      <span>Use Simulator</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 space-y-2.5">
            {lastCalibration && (
              <div className="text-[11px] text-slate-400 flex items-center justify-between bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800/80">
                <span>
                  Last Cal: <strong className="text-slate-200 capitalize">{lastCalibration.dragStatus}</strong>
                  {lastCalibration.spindownDurationSec ? ` (${lastCalibration.spindownDurationSec}s)` : ''}
                </span>
                <span className="font-mono text-cyan-400">
                  {lastCalibration.powerFactor}x Pwr · {lastCalibration.speedFactor}x Spd
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {(trainerDevice.status === 'connected' || isSimulated) && onOpenCalibration && (
                <button
                  onClick={onOpenCalibration}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/60 text-cyan-300 text-xs font-bold border border-cyan-500/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Auto-Calibrate (Spindown)</span>
                </button>
              )}

              {trainerDevice.status === 'connected' ? (
                <button
                  onClick={onDisconnectTrainer}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  onClick={onConnectTrainer}
                  disabled={trainerDevice.status === 'connecting'}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/30 disabled:opacity-50 cursor-pointer"
                >
                  {trainerDevice.status === 'connecting' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Searching for Tacx...</span>
                    </>
                  ) : (
                    <>
                      <Bluetooth className="w-4 h-4" />
                      <span>Pair Tacx Trainer</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: BLUETOOTH HEART RATE SENSOR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Heart className="w-6 h-6" />
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  hrDevice.status === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : hrDevice.status === 'connecting'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    hrDevice.status === 'connected'
                      ? 'bg-emerald-400'
                      : hrDevice.status === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-slate-500'
                  }`}
                />
                <span className="capitalize">{isSimulated ? 'Simulated' : hrDevice.status}</span>
              </span>
            </div>

            <h3 className="text-lg font-bold text-white tracking-tight">
              Heart Rate Monitor
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Standard Bluetooth Smart chest strap or optical sensor (Polar H10, Garmin HRM, Wahoo, Scosche).
            </p>

            <div className="mt-4 space-y-2 text-xs text-slate-300">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Device Name</span>
                <span className="font-mono font-medium text-slate-200">
                  {isSimulated ? 'Virtual Cardiac Sensor' : hrDevice.name || 'Not paired'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Bluetooth Service</span>
                <span className="font-mono text-slate-300">Heart Rate (0x180D)</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Stream Rate</span>
                <span className="text-rose-400 font-medium">1 Hz Live Notifications</span>
              </div>
            </div>

            {hrDevice.error && (
              <div className="mt-3 text-xs bg-rose-500/10 p-3 rounded-xl border border-rose-500/30 space-y-2">
                <p className="text-rose-300 leading-relaxed font-medium">
                  {hrDevice.error}
                </p>
                {hrDevice.error.includes('permissions policy') && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Dedicated Tab</span>
                    </a>
                    <button
                      onClick={onToggleSimulator}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px] inline-flex items-center gap-1 border border-slate-750"
                    >
                      <Cpu className="w-3 h-3" />
                      <span>Use Simulator</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            {hrDevice.status === 'connected' ? (
              <button
                onClick={onDisconnectHr}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Disconnect HR Sensor</span>
              </button>
            ) : (
              <button
                onClick={onConnectHr}
                disabled={hrDevice.status === 'connecting'}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-950/30 disabled:opacity-50"
              >
                {hrDevice.status === 'connecting' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Searching for HRM...</span>
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4" />
                    <span>Pair Heart Rate Sensor</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QUICK RIDE CTA IF CONNECTED */}
      {(hrDevice.status === 'connected' || isSimulated) && (
        <div className="bg-gradient-to-r from-rose-950/50 via-slate-900 to-cyan-950/50 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-base font-bold text-white">
                Telemetry Link Established
              </h4>
              <p className="text-xs text-slate-300">
                Your trainer and cardiac stream are active. Jump into the Cockpit HUD to start riding.
              </p>
            </div>
          </div>
          <button
            onClick={onStartRide}
            className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl shadow-rose-950/50 transition-all flex items-center gap-2"
          >
            <span>Launch Cockpit HUD</span>
          </button>
        </div>
      )}

      {/* HARDWARE PAIRING GUIDE */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Info className="w-5 h-5 text-sky-400" />
          <h3 className="font-bold text-base">Tacx Vortex & Garmin Hardware Setup</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-300">
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
            <span className="font-bold text-sky-400">1. Mains Power & Wakeup</span>
            <p className="text-slate-400 leading-relaxed">
              Ensure the Tacx Vortex power cord is plugged in. Spin the bike pedals 2-3 times to wake up the electro-brake flywheel. The LED will begin flashing.
            </p>
          </div>

          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
            <span className="font-bold text-sky-400">2. Close Phone Apps</span>
            <p className="text-slate-400 leading-relaxed">
              Tacx Vortex BLE firmware allows only one active Bluetooth connection. Close the Tacx Training app, Zwift, or Garmin Connect phone app before connecting here.
            </p>
          </div>

          <div className="bg-slate-950/70 p-4 rounded-xl border border-sky-500/30 space-y-1.5 bg-sky-950/20">
            <span className="font-bold text-sky-300 flex items-center gap-1">
              <Watch className="w-3.5 h-3.5 text-sky-400" />
              <span>3. Garmin Watch Broadcast</span>
            </span>
            <p className="text-slate-300 leading-relaxed">
              On your Garmin watch: <strong>Settings &rarr; Sensors & Accessories &rarr; Wrist Heart Rate &rarr; Broadcast Heart Rate</strong>. Your watch now broadcasts standard BLE heart rate!
            </p>
          </div>

          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
            <span className="font-bold text-emerald-400">4. Pair in Dedicated Tab</span>
            <p className="text-slate-400 leading-relaxed">
              Click "Pair Devices" in a dedicated browser tab. Select your Tacx trainer and Garmin watch to start closed-loop cardiac resistance control.
            </p>
          </div>
        </div>
      </div>

      {/* LIVE TRAINER COMMUNICATION LOG */}
      <TrainerLogPanel isSimulated={isSimulated} />
    </div>
  );
};
