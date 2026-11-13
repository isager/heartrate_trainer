/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutSessionSummary } from '../types/workout';

const SESSIONS_KEY = 'vortexhr_workout_sessions';
const SETTINGS_KEY = 'vortexhr_user_settings';

export function saveWorkoutSession(session: WorkoutSessionSummary): void {
  try {
    const existing = getSavedWorkoutSessions();
    const updated = [session, ...existing.filter(s => s.id !== session.id)].slice(0, 50);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save workout session:', err);
  }
}

export function getSavedWorkoutSessions(): WorkoutSessionSummary[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function deleteWorkoutSession(id: string): void {
  try {
    const existing = getSavedWorkoutSessions();
    const updated = existing.filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete workout session:', err);
  }
}

/**
 * Generate standard Garmin / Strava compatible TCX (Training Center XML) file
 */
export function exportWorkoutToTcx(session: WorkoutSessionSummary): void {
  const startDate = new Date(session.startTime).toISOString();
  let trackpointsXml = '';
  let cumulativeDistanceMeters = 0;

  session.samples.forEach((sample, idx) => {
    const ptDate = new Date(session.startTime + sample.elapsedSec * 1000).toISOString();
    // approximate distance progression
    cumulativeDistanceMeters += (sample.speedKmh / 3.6) * 1; // 1 second interval

    trackpointsXml += `
      <Trackpoint>
        <Time>${ptDate}</Time>
        <DistanceMeters>${cumulativeDistanceMeters.toFixed(1)}</DistanceMeters>
        <HeartRateBpm>
          <Value>${sample.hr}</Value>
        </HeartRateBpm>
        <Cadence>${sample.cadenceRpm}</Cadence>
        <Extensions>
          <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
            <Speed>${(sample.speedKmh / 3.6).toFixed(2)}</Speed>
            <Watts>${sample.powerWatts}</Watts>
          </TPX>
        </Extensions>
      </Trackpoint>`;
  });

  const tcxContent = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startDate}</Id>
      <Lap StartTime="${startDate}">
        <TotalTimeSeconds>${session.durationSec}</TotalTimeSeconds>
        <DistanceMeters>${(session.distanceKm * 1000).toFixed(1)}</DistanceMeters>
        <MaximumSpeed>${(Math.max(...session.samples.map(s => s.speedKmh), 0) / 3.6).toFixed(2)}</MaximumSpeed>
        <Calories>${session.estimatedCalories}</Calories>
        <AverageHeartRateBpm>
          <Value>${session.avgHr}</Value>
        </AverageHeartRateBpm>
        <MaximumHeartRateBpm>
          <Value>${session.maxHr}</Value>
        </MaximumHeartRateBpm>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          ${trackpointsXml}
        </Track>
      </Lap>
      <Notes>Recorded with VortexHR Tacx Smart Trainer HR Controller (${session.workoutName})</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  downloadFile(tcxContent, `vortexhr-${session.workoutName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${session.date}.tcx`, 'application/vnd.garmin.tcx+xml');
}

/**
 * Generate CSV file
 */
export function exportWorkoutToCsv(session: WorkoutSessionSummary): void {
  const headers = ['Elapsed_Sec', 'Heart_Rate_BPM', 'Target_HR_BPM', 'Resistance_Percent', 'Power_Watts', 'Cadence_RPM', 'Speed_KMH'];
  const rows = session.samples.map(s => [
    s.elapsedSec,
    s.hr,
    s.targetHr,
    s.resistancePercent,
    s.powerWatts,
    s.cadenceRpm,
    s.speedKmh.toFixed(1),
  ].join(','));

  const csvContent = [headers.join(','), ...rows].join('\n');
  downloadFile(csvContent, `vortexhr-workout-${session.date}.csv`, 'text/csv');
}

/**
 * Parse a standard Garmin TCX file into a WorkoutSessionSummary
 */
export function parseTcxWorkoutSession(tcxXmlString: string): WorkoutSessionSummary | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(tcxXmlString, 'text/xml');
    
    // Check for parse error
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error('TCX parse error:', parseError[0].textContent);
      return null;
    }

    const activity = xmlDoc.getElementsByTagName('Activity')[0];
    const lap = xmlDoc.getElementsByTagName('Lap')[0];
    const trackpoints = Array.from(xmlDoc.getElementsByTagName('Trackpoint'));

    const sport = activity?.getAttribute('Sport') || 'Biking';
    const rawStartTime = lap?.getAttribute('StartTime') || new Date().toISOString();
    const startTime = new Date(rawStartTime).getTime();

    const durationSec = lap ? Math.round(parseFloat(lap.getElementsByTagName('TotalTimeSeconds')[0]?.textContent || '0')) : 0;
    const distanceMeters = lap ? parseFloat(lap.getElementsByTagName('DistanceMeters')[0]?.textContent || '0') : 0;
    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
    const estimatedCalories = lap ? parseInt(lap.getElementsByTagName('Calories')[0]?.textContent || '0', 10) : 0;

    let sumHr = 0;
    let countHr = 0;
    let maxHr = 0;
    let sumWatts = 0;
    let countWatts = 0;
    let maxWatts = 0;
    let sumCadence = 0;
    let countCadence = 0;

    const samples: WorkoutSessionSummary['samples'] = [];

    trackpoints.forEach((tp, idx) => {
      const timeStr = tp.getElementsByTagName('Time')[0]?.textContent;
      const tpTime = timeStr ? new Date(timeStr).getTime() : startTime + idx * 1000;
      const elapsedSec = Math.max(0, Math.round((tpTime - startTime) / 1000));

      const hrEl = tp.getElementsByTagName('HeartRateBpm')[0];
      const hrVal = hrEl ? parseInt(hrEl.getElementsByTagName('Value')[0]?.textContent || '0', 10) : 0;

      const cadEl = tp.getElementsByTagName('Cadence')[0];
      const cadVal = cadEl ? parseInt(cadEl.textContent || '0', 10) : 0;

      // Extensions (Speed, Watts)
      const speedEl = tp.getElementsByTagName('Speed')[0];
      const speedMps = speedEl ? parseFloat(speedEl.textContent || '0') : 0;
      const speedKmh = Math.round(speedMps * 3.6 * 10) / 10;

      const wattsEl = tp.getElementsByTagName('Watts')[0];
      const wattsVal = wattsEl ? parseInt(wattsEl.textContent || '0', 10) : 0;

      if (hrVal > 0) {
        sumHr += hrVal;
        countHr++;
        if (hrVal > maxHr) maxHr = hrVal;
      }
      if (wattsVal > 0) {
        sumWatts += wattsVal;
        countWatts++;
        if (wattsVal > maxWatts) maxWatts = wattsVal;
      }
      if (cadVal > 0) {
        sumCadence += cadVal;
        countCadence++;
      }

      samples.push({
        timestamp: tpTime,
        elapsedSec,
        hr: hrVal,
        targetHr: 135,
        resistancePercent: 20,
        powerWatts: wattsVal,
        cadenceRpm: cadVal,
        speedKmh: speedKmh,
        intervalIndex: 0,
      });
    });

    const avgHr = countHr > 0 ? Math.round(sumHr / countHr) : (lap ? parseInt(lap.getElementsByTagName('AverageHeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent || '0', 10) : 0);
    const calculatedMaxHr = maxHr > 0 ? maxHr : (lap ? parseInt(lap.getElementsByTagName('MaximumHeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent || '0', 10) : 0);
    const avgPower = countWatts > 0 ? Math.round(sumWatts / countWatts) : 0;
    const avgCadence = countCadence > 0 ? Math.round(sumCadence / countCadence) : 0;

    const session: WorkoutSessionSummary = {
      id: `garmin_tcx_${Date.now()}`,
      workoutName: `Garmin ${sport} (${distanceKm} km)`,
      date: new Date(startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      startTime,
      durationSec: durationSec || (samples.length > 0 ? samples[samples.length - 1].elapsedSec : 1800),
      avgHr,
      maxHr: calculatedMaxHr,
      avgPower,
      maxPower: maxWatts,
      avgCadence,
      distanceKm,
      estimatedCalories,
      timeInZonesSec: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      samples,
    };

    return session;
  } catch (err) {
    console.error('Failed to parse TCX file:', err);
    return null;
  }
}

function downloadFile(content: string, filename: string, mimeType: string) {
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
