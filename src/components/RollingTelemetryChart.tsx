/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { TelemetrySample, HeartRateZone } from '../types/workout';

interface RollingTelemetryChartProps {
  samples: TelemetrySample[];
  targetHr: number;
  zones: HeartRateZone[];
  windowSec?: number; // rolling window, default 240 seconds (4 min)
  showPower?: boolean;
}

export const RollingTelemetryChart: React.FC<RollingTelemetryChartProps> = ({
  samples,
  targetHr,
  zones,
  windowSec = 240,
  showPower = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Filter samples for rolling window
    const now = samples.length > 0 ? samples[samples.length - 1].elapsedSec : 0;
    const windowStart = Math.max(0, now - windowSec);
    const visibleSamples = samples.filter(s => s.elapsedSec >= windowStart);

    // Coordinate boundaries (responsive padding for small mobile screens)
    const isMobile = width < 500;
    const padding = {
      top: isMobile ? 15 : 20,
      right: isMobile ? 32 : 45,
      bottom: isMobile ? 20 : 25,
      left: isMobile ? 32 : 45,
    };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // HR Y-Scale bounds (min 80, max 200 or based on zones)
    const minHr = Math.min(80, Math.min(...visibleSamples.map(s => s.hr), targetHr - 15));
    const maxHr = Math.max(190, Math.max(...visibleSamples.map(s => s.hr), targetHr + 15));

    const getYForHr = (hr: number) => {
      const norm = (hr - minHr) / (maxHr - minHr);
      return padding.top + chartH * (1 - norm);
    };

    const getYForResistance = (res: number) => {
      // 0 to 100%
      const norm = res / 100;
      return padding.top + chartH * (1 - norm);
    };

    const getXForTime = (timeSec: number) => {
      if (now <= windowStart) return padding.left;
      const progress = (timeSec - windowStart) / (now - windowStart || 1);
      return padding.left + chartW * Math.max(0, Math.min(1, progress));
    };

    // 1. Draw Zone background bands
    zones.forEach(z => {
      const topY = getYForHr(z.maxBpm);
      const bottomY = getYForHr(z.minBpm);
      const bandHeight = Math.max(1, bottomY - topY);

      let bandColor = 'rgba(56, 189, 248, 0.03)';
      if (z.zone === 2) bandColor = 'rgba(52, 211, 153, 0.04)';
      if (z.zone === 3) bandColor = 'rgba(251, 191, 36, 0.04)';
      if (z.zone === 4) bandColor = 'rgba(251, 146, 60, 0.04)';
      if (z.zone === 5) bandColor = 'rgba(244, 63, 94, 0.05)';

      ctx.fillStyle = bandColor;
      ctx.fillRect(padding.left, Math.max(padding.top, topY), chartW, bandHeight);
    });

    // 2. Grid lines & HR Y-Axis labels (left)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

    const hrSteps = [100, 120, 140, 160, 180];
    hrSteps.forEach(hr => {
      if (hr >= minHr && hr <= maxHr) {
        const y = getYForHr(hr);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillText(`${hr}`, padding.left - 8, y + 3);
      }
    });

    // Right Y-Axis labels (Resistance %)
    ctx.fillStyle = 'rgba(34, 211, 238, 0.6)'; // cyan
    ctx.textAlign = 'left';
    [25, 50, 75].forEach(res => {
      const y = getYForResistance(res);
      ctx.fillText(`${res}%`, width - padding.right + 8, y + 3);
    });

    // 3. Draw Target Heart Rate dashed line
    if (targetHr > 0) {
      const targetY = getYForHr(targetHr);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)'; // amber / gold
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, targetY);
      ctx.lineTo(width - padding.right, targetY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.textAlign = 'right';
      ctx.fillText(`Target ${targetHr}`, width - padding.right - 10, targetY - 6);
      ctx.restore();
    }

    if (visibleSamples.length < 2) {
      // Empty state prompt
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'center';
      ctx.font = '12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Live telemetry stream recording... Start pedaling or enable simulator', width / 2, height / 2);
      return;
    }

    // 4. Draw Trainer Resistance Curve (Cyan line)
    ctx.save();
    ctx.strokeStyle = '#06b6d4'; // cyan-500
    ctx.lineWidth = 2;
    ctx.beginPath();
    visibleSamples.forEach((sample, i) => {
      const x = getXForTime(sample.elapsedSec);
      const y = getYForResistance(sample.resistancePercent);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // 5. Draw Heart Rate Curve (Rose line with subtle gradient fill)
    ctx.save();
    const hrGrad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    hrGrad.addColorStop(0, 'rgba(244, 63, 94, 0.25)'); // rose-500
    hrGrad.addColorStop(1, 'rgba(244, 63, 94, 0.0)');

    ctx.beginPath();
    visibleSamples.forEach((sample, i) => {
      const x = getXForTime(sample.elapsedSec);
      const y = getYForHr(sample.hr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Close path for area gradient
    const lastX = getXForTime(visibleSamples[visibleSamples.length - 1].elapsedSec);
    const firstX = getXForTime(visibleSamples[0].elapsedSec);
    const baseY = height - padding.bottom;
    ctx.lineTo(lastX, baseY);
    ctx.lineTo(firstX, baseY);
    ctx.closePath();
    ctx.fillStyle = hrGrad;
    ctx.fill();

    // Stroke the HR line
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e'; // rose-500
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(244, 63, 94, 0.4)';
    ctx.shadowBlur = 6;
    visibleSamples.forEach((sample, i) => {
      const x = getXForTime(sample.elapsedSec);
      const y = getYForHr(sample.hr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // 6. Draw current pulse dot at the leading edge
    const latest = visibleSamples[visibleSamples.length - 1];
    const latestX = getXForTime(latest.elapsedSec);
    const latestY = getYForHr(latest.hr);

    ctx.beginPath();
    ctx.arc(latestX, latestY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Resistance leading dot
    const resY = getYForResistance(latest.resistancePercent);
    ctx.beginPath();
    ctx.arc(latestX, resY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();
    ctx.stroke();

  }, [samples, targetHr, zones, windowSec, showPower]);

  return (
    <div className="relative w-full h-full bg-slate-900/60 rounded-2xl border border-slate-800/80 p-3 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-slate-400 mb-2 px-1">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
            <span className="font-medium text-slate-200">
              <span className="sm:hidden">HR</span>
              <span className="hidden sm:inline">Heart Rate (BPM)</span>
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-sm bg-cyan-500 shadow-sm shadow-cyan-500/50" />
            <span className="font-medium text-slate-200">
              <span className="sm:hidden">Resistance</span>
              <span className="hidden sm:inline">Tacx Resistance (%)</span>
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="w-2.5 sm:w-3 h-0.5 border-t border-dashed border-amber-400" />
            <span className="font-medium text-amber-300">
              <span className="sm:hidden">Target</span>
              <span className="hidden sm:inline">Target HR</span>
            </span>
          </div>
        </div>
        <div className="text-[10px] sm:text-[11px] font-mono text-slate-400">
          Last {Math.round(windowSec / 60)}m
        </div>
      </div>
      <div className="relative flex-1 min-h-[160px] w-full">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
