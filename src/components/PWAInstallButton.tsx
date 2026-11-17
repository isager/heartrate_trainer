/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Smartphone, Share, MoreVertical, ExternalLink, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isRunningInIframe } from '../services/bluetooth';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<'ios' | 'android' | null>(null);
  const inIframe = isRunningInIframe();

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={() => {
          void install();
        }}
        title="Install HR Trainer as an app on your device"
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm shadow-rose-950/50 transition-colors cursor-pointer shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </button>
    );
  }

  if (isAndroid) {
    return (
      <>
        <button
          onClick={() => setShowGuideModal('android')}
          title="Install HR Trainer in Chrome on Android"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-rose-400" />
          <span>Install</span>
        </button>

        {showGuideModal === 'android' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-base">
                  <Smartphone className="w-5 h-5 text-rose-400" />
                  <span>Install on Android Chrome</span>
                </div>
                <button
                  onClick={() => setShowGuideModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {inIframe ? (
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <p>
                    Android Chrome cannot install a Web App while it is inside an embedded preview frame. Open HR Trainer in its own Chrome tab first:
                  </p>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in Chrome Tab</span>
                  </a>
                </div>
              ) : (
                <ol className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-rose-400 font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>
                      Tap the Chrome menu button <MoreVertical className="inline w-3.5 h-3.5 text-slate-200 align-text-bottom" /> in the top-right address bar.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-rose-400 font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>
                      Tap <strong>Add to home screen</strong> and choose <strong>Install</strong> to add HR Trainer to your app drawer as a full-screen Chrome WebAPK (required for Web Bluetooth).
                    </span>
                  </li>
                </ol>
              )}

              <button
                onClick={() => setShowGuideModal(null)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowGuideModal('ios')}
          title="Install HR Trainer on iPhone or iPad"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-rose-400" />
          <span>Install</span>
        </button>

        {showGuideModal === 'ios' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Install on iPhone / iPad</h3>
                <button
                  onClick={() => setShowGuideModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <Share className="inline w-3.5 h-3.5 text-sky-400 align-text-bottom" /> <strong>Share</strong> button in the browser toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowGuideModal(null)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
