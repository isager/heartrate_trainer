/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Activity,
  Bluetooth,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Cpu,
  Settings,
  ExternalLink,
  Gauge,
  Sliders,
  Calendar,
} from 'lucide-react';
import { DeviceConnection } from '../types/workout';
import { isRunningInIframe } from '../services/bluetooth';

interface HeaderProps {
  activeTab: 'cockpit' | 'workouts' | 'devices' | 'history';
  onSelectTab: (tab: 'cockpit' | 'workouts' | 'devices' | 'history') => void;
  hrDevice: DeviceConnection;
  trainerDevice: DeviceConnection;
  isSimulated: boolean;
  onToggleSimulator: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  hrDevice,
  trainerDevice,
  isSimulated,
  onToggleSimulator,
  soundEnabled,
  onToggleSound,
  isFullscreen,
  onToggleFullscreen,
  onOpenSettings,
}) => {
  const isHrConnected = hrDevice.status === 'connected';
  const isTrainerConnected = trainerDevice.status === 'connected';

  return (
    <>
      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Brand title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 flex items-center justify-center text-white shadow-md shadow-rose-950/50">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1 font-display">
                Vortex<span className="text-rose-500">HR</span>
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links (hidden on mobile, replaced by bottom bar) */}
          <nav className="hidden md:flex items-center gap-6 sm:gap-8 text-sm font-medium">
            <button
              onClick={() => onSelectTab('cockpit')}
              className={`whitespace-nowrap transition-colors py-1 relative cursor-pointer ${
                activeTab === 'cockpit' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cockpit HUD
              {activeTab === 'cockpit' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => onSelectTab('workouts')}
              className={`whitespace-nowrap transition-colors py-1 relative cursor-pointer ${
                activeTab === 'workouts' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Workouts
              {activeTab === 'workouts' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => onSelectTab('devices')}
              className={`whitespace-nowrap transition-colors py-1 relative flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'devices' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Devices
              <span
                className={`w-2 h-2 rounded-full ${
                  (isHrConnected && isTrainerConnected) || isSimulated ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {activeTab === 'devices' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => onSelectTab('history')}
              className={`whitespace-nowrap transition-colors py-1 relative cursor-pointer ${
                activeTab === 'history' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              History
              {activeTab === 'history' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full" />
              )}
            </button>
          </nav>

          {/* Action / Quick Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Simulator Toggle Button */}
            <button
              onClick={onToggleSimulator}
              title={isSimulated ? 'Switch to Real Bluetooth Hardware' : 'Enable Simulated Tacx & HR Monitor for Testing'}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isSimulated
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isSimulated ? 'Simulation' : 'Simulate'}</span>
              <span className="sm:hidden text-[11px]">{isSimulated ? 'Sim' : 'BLE'}</span>
            </button>

            {/* Audio Alert Toggle */}
            <button
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute Audio Cues' : 'Unmute Audio Cues'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-slate-300" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Fullscreen Button for Handlebar Phone/Tablet Mount */}
            <button
              onClick={onToggleFullscreen}
              title="Toggle Handlebar Fullscreen Mode"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Settings Trigger */}
            <button
              onClick={onOpenSettings}
              title="Rider & Controller Settings"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Open in Dedicated Tab (Web Bluetooth outside iframe) */}
            {isRunningInIframe() && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                title="Open app in dedicated browser tab to pair real Bluetooth devices directly"
                className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-sky-950/70 border border-sky-600/50 hover:bg-sky-900/60 text-sky-300 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Tab</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE BOTTOM NAVIGATION BAR (Thumb reachable on bike handlebar mount) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-lg md:hidden">
        <div className="grid grid-cols-4 h-16 max-w-md mx-auto px-2">
          <button
            onClick={() => onSelectTab('cockpit')}
            className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer relative ${
              activeTab === 'cockpit' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTab === 'cockpit' && (
              <span className="absolute top-0 left-4 right-4 h-0.5 bg-rose-500 rounded-full" />
            )}
            <Gauge className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">Cockpit</span>
          </button>

          <button
            onClick={() => onSelectTab('workouts')}
            className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer relative ${
              activeTab === 'workouts' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTab === 'workouts' && (
              <span className="absolute top-0 left-4 right-4 h-0.5 bg-rose-500 rounded-full" />
            )}
            <Sliders className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">Workouts</span>
          </button>

          <button
            onClick={() => onSelectTab('devices')}
            className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer relative ${
              activeTab === 'devices' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTab === 'devices' && (
              <span className="absolute top-0 left-4 right-4 h-0.5 bg-rose-500 rounded-full" />
            )}
            <div className="relative">
              <Bluetooth className="w-5 h-5" />
              <span
                className={`absolute -top-0.5 -right-1 w-2 h-2 rounded-full border border-slate-950 ${
                  (isHrConnected && isTrainerConnected) || isSimulated ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </div>
            <span className="text-[10px] tracking-tight">Devices</span>
          </button>

          <button
            onClick={() => onSelectTab('history')}
            className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer relative ${
              activeTab === 'history' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTab === 'history' && (
              <span className="absolute top-0 left-4 right-4 h-0.5 bg-rose-500 rounded-full" />
            )}
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">History</span>
          </button>
        </div>
      </nav>
    </>
  );
};
