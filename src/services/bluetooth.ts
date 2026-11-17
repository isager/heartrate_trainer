/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FecControlMode, HeartRateData, TrainerData } from '../types/workout';
import { trainerLogger, dataViewToHex } from './trainerLogger';

// Standard Bluetooth SIG UUIDs
export const BLE_SERVICES = {
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb', // 0x180D
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb', // 0x1826 FTMS
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb', // 0x1818 CPS
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  BATTERY_SERVICE: '0000180f-0000-1000-8000-00805f9b34fb',
  // Tacx Legacy FE-C over BLE
  TACX_FEC_SERVICE: '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',
};

export const BLE_CHARS = {
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb', // 0x2A37
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
  // FTMS Characteristics
  FITNESS_MACHINE_CONTROL_POINT: '00002ad9-0000-1000-8000-00805f9b34fb', // 0x2AD9
  INDOOR_BIKE_DATA: '00002ad2-0000-1000-8000-00805f9b34fb', // 0x2AD2
  FITNESS_MACHINE_STATUS: '00002ad3-0000-1000-8000-00805f9b34fb', // 0x2AD3
  FITNESS_MACHINE_FEATURE: '00002acc-0000-1000-8000-00805f9b34fb', // 0x2ACC
  // CPS & CSC Characteristics
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb', // 0x2A63
  CSC_MEASUREMENT: '00002a5b-0000-1000-8000-00805f9b34fb', // 0x2A5B
  // Tacx Legacy FE-C over BLE (Nordic UART-like service 6e40fec1)
  // 6e40fec2 = Notify (Trainer -> App, RX)
  // 6e40fec3 = Write / WriteWithoutResponse (App -> Trainer, TX)
  TACX_FEC_READ: '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',
  TACX_FEC_WRITE: '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e',
};

export interface FtmsSpindownEvent {
  status: 'requested' | 'success' | 'error' | 'stop_pedaling' | 'unsupported';
  targetSpeedLowKmh?: number;
  targetSpeedHighKmh?: number;
  message: string;
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isBluetoothAllowedByPolicy(): boolean {
  if (typeof document === 'undefined') return true;
  const doc = document as unknown as {
    permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
    featurePolicy?: { allowsFeature: (feature: string) => boolean };
  };
  try {
    if (doc.permissionsPolicy?.allowsFeature) {
      return doc.permissionsPolicy.allowsFeature('bluetooth');
    }
    if (doc.featurePolicy?.allowsFeature) {
      return doc.featurePolicy.allowsFeature('bluetooth');
    }
  } catch {
    // ignore
  }
  return true;
}

// Check Web Bluetooth availability
export function getWebBluetoothSupport(): { supported: boolean; isIframe: boolean; reason?: string } {
  if (typeof window === 'undefined') {
    return { supported: false, isIframe: false, reason: 'Server environment' };
  }
  const isIframe = isRunningInIframe();

  if (!navigator.bluetooth) {
    return {
      supported: false,
      isIframe,
      reason: 'Web Bluetooth API is not supported by this browser. Chrome, Edge, or Bluefy (iOS) is required.',
    };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      isIframe,
      reason: 'Web Bluetooth requires a Secure Context (HTTPS or localhost).',
    };
  }
  if (!isBluetoothAllowedByPolicy()) {
    return {
      supported: false,
      isIframe: true,
      reason: 'Bluetooth is disallowed by iframe permissions policy. Open the app directly in a full browser tab to pair devices.',
    };
  }
  return { supported: true, isIframe };
}

export function formatBluetoothError(err: unknown): string {
  if (!err) return 'Unknown Bluetooth error';
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (
    name === 'SecurityError' ||
    msg.toLowerCase().includes('permissions policy') ||
    msg.toLowerCase().includes('disallowed by permissions policy')
  ) {
    return 'Web Bluetooth is blocked inside the embedded preview frame by browser permissions policy. Please open the app in a dedicated browser tab (via the "Open in Dedicated Tab" link) to pair your Bluetooth hardware directly.';
  }

  if (name === 'NotFoundError' || msg.toLowerCase().includes('cancelled') || msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('user cancelled')) {
    return 'Pairing dialog was cancelled. Make sure your sensor/trainer is powered on and within range, then try again.';
  }

  if (name === 'NetworkError' || msg.toLowerCase().includes('connection failed')) {
    return 'Bluetooth connection failed or device was disconnected. Verify the trainer is awake and not paired to another app.';
  }

  return msg;
}


class BluetoothManager {
  private hrDevice: BluetoothDevice | null = null;
  private trainerDevice: BluetoothDevice | null = null;

  private hrChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ftmsControlChar: BluetoothRemoteGATTCharacteristic | null = null;
  private indoorBikeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ftmsStatusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private tacxFecWriteChar: BluetoothRemoteGATTCharacteristic | null = null;
  private tacxFecReadChar: BluetoothRemoteGATTCharacteristic | null = null;
  private cyclingPowerChar: BluetoothRemoteGATTCharacteristic | null = null;
  private cscChar: BluetoothRemoteGATTCharacteristic | null = null;

  private onHeartRateCallback: ((data: HeartRateData) => void) | null = null;
  private onTrainerDataCallback: ((data: Partial<TrainerData>) => void) | null = null;
  private onHrDisconnectCallback: (() => void) | null = null;
  private onTrainerDisconnectCallback: (() => void) | null = null;
  private onSpindownCallback: ((evt: FtmsSpindownEvent) => void) | null = null;

  // Cached telemetry & controller state
  private lastReportedWatts: number = 0;
  private lastReportedCadence: number = 0;
  private lastReportedSpeed: number = 0;
  private currentSetResistance: number = 20;
  private currentTargetPowerWatts: number = 135;
  private wheelCircumferenceM: number = 2.096;
  private riderWeightKg: number = 72;
  private ftpWatts: number = 240;
  private fecControlMode: FecControlMode = 'simulation';
  private lastFecPacketAt: number = 0;
  private lastTrainerFlagsHex: string = '';
  private lastControlAckLabel: string = '';

  // FE-C transport, keepalive & diagnostics
  private fecKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private fecWriteQueue: Promise<void> = Promise.resolve();
  private fecSimulationInitialized: boolean = false;
  private lastFecTxAt: number = 0;
  private lastFecKeepaliveLogAt: number = 0;
  private lastFecAckPollAt: number = 0;
  private lastSentControlValue: number = -1;
  private lastFecRxHex: string = '';
  private lastFecRxAt: number = 0;
  private hasLoggedWriteMode: boolean = false;
  private hasLoggedUndeterminedHint: boolean = false;
  private hasLoggedExternalFcHint: boolean = false;
  private undeterminedPedalTicks: number = 0;

  // Bound BLE characteristic listeners to prevent duplicate subscriptions across reconnects
  private readonly handleHrValueChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (!target?.value) return;
    const parsed = this.parseHeartRateMeasurement(target.value);
    if (this.onHeartRateCallback) {
      this.onHeartRateCallback(parsed);
    }
  };
  private readonly handleFtmsControlChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseFtmsControlPointResponse(target.value);
  };
  private readonly handleFtmsStatusChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseFtmsStatus(target.value);
  };
  private readonly handleIndoorBikeChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseIndoorBikeData(target.value);
  };
  private readonly handleTacxFecReadChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseTacxFecData(target.value);
  };
  private readonly handleCpsChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseCyclingPowerMeasurement(target.value);
  };
  private readonly handleCscChanged = (e: Event) => {
    const target = e.target as unknown as { value: DataView };
    if (target?.value) this.parseCscMeasurement(target.value);
  };

  // Delta revolution trackers for CPS (0x2A63) & CSC (0x2A5B)
  private lastCpsWheel: { revs: number; time2048: number; updatedAt: number } | null = null;
  private lastCpsCrank: { revs: number; time1024: number; updatedAt: number } | null = null;
  private lastCscWheel: { revs: number; time1024: number; updatedAt: number } | null = null;
  private lastCscCrank: { revs: number; time1024: number; updatedAt: number } | null = null;

  public setWheelCircumferenceMm(mm: number): void {
    if (mm >= 1000 && mm <= 3500) {
      this.wheelCircumferenceM = mm / 1000;
    }
  }

  public setFecControlMode(mode: FecControlMode): void {
    if (this.fecControlMode === mode) return;
    this.fecControlMode = mode;
    this.fecSimulationInitialized = false;
    this.lastSentControlValue = -1;
    trainerLogger.log('INFO', 'TACX_FEC', `Switched Tacx FE-C control protocol to: ${mode.toUpperCase()}`);
    if (this.isTrainerConnected()) {
      void this.setResistancePercent(this.currentSetResistance);
    }
  }

  public setRiderConfig(riderWeightKg: number, ftpWatts: number, wheelCircumferenceMm?: number): void {
    const validWeight = riderWeightKg >= 40 && riderWeightKg <= 160 ? riderWeightKg : 72;
    const validFtp = ftpWatts >= 80 && ftpWatts <= 600 ? ftpWatts : 240;
    const weightChanged = Math.abs(validWeight - this.riderWeightKg) >= 0.5;
    this.riderWeightKg = validWeight;
    this.ftpWatts = validFtp;
    if (wheelCircumferenceMm) {
      this.setWheelCircumferenceMm(wheelCircumferenceMm);
    }
    if (weightChanged && this.tacxFecWriteChar && this.fecControlMode === 'simulation') {
      this.fecSimulationInitialized = false;
    }
  }

  private resetTrainerState(): void {
    this.stopFecKeepalive();
    this.lastReportedWatts = 0;
    this.lastReportedCadence = 0;
    this.lastReportedSpeed = 0;
    this.currentSetResistance = 20;
    this.currentTargetPowerWatts = 135;
    this.lastFecPacketAt = 0;
    this.lastTrainerFlagsHex = '';
    this.lastControlAckLabel = '';
    this.fecSimulationInitialized = false;
    this.lastFecTxAt = 0;
    this.lastFecKeepaliveLogAt = 0;
    this.lastFecAckPollAt = 0;
    this.lastSentControlValue = -1;
    this.lastFecRxHex = '';
    this.lastFecRxAt = 0;
    this.hasLoggedWriteMode = false;
    this.hasLoggedUndeterminedHint = false;
    this.hasLoggedExternalFcHint = false;
    this.undeterminedPedalTicks = 0;
    this.lastCpsWheel = null;
    this.lastCpsCrank = null;
    this.lastCscWheel = null;
    this.lastCscCrank = null;
  }

  private clearTrainerChars(): void {
    this.stopFecKeepalive();
    this.ftmsControlChar?.removeEventListener('characteristicvaluechanged', this.handleFtmsControlChanged);
    this.ftmsStatusChar?.removeEventListener('characteristicvaluechanged', this.handleFtmsStatusChanged);
    this.indoorBikeChar?.removeEventListener('characteristicvaluechanged', this.handleIndoorBikeChanged);
    this.tacxFecReadChar?.removeEventListener('characteristicvaluechanged', this.handleTacxFecReadChanged);
    this.cyclingPowerChar?.removeEventListener('characteristicvaluechanged', this.handleCpsChanged);
    this.cscChar?.removeEventListener('characteristicvaluechanged', this.handleCscChanged);
    this.ftmsControlChar = null;
    this.indoorBikeChar = null;
    this.ftmsStatusChar = null;
    this.tacxFecWriteChar = null;
    this.tacxFecReadChar = null;
    this.cyclingPowerChar = null;
    this.cscChar = null;
  }

  /**
   * Connect to standard Bluetooth Heart Rate Monitor (Polar, Garmin, Wahoo, Scosche, etc.)
   */
  public async connectHeartRate(
    onData: (data: HeartRateData) => void,
    onDisconnect: () => void
  ): Promise<string> {
    const support = getWebBluetoothSupport();
    if (!support.supported) {
      throw new Error(support.reason || 'Web Bluetooth unsupported');
    }

    this.onHeartRateCallback = onData;
    this.onHrDisconnectCallback = onDisconnect;

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }],
      optionalServices: ['heart_rate', 'battery_service'],
    });

    this.hrDevice = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.hrChar = null;
      trainerLogger.log('INFO', 'HRM', `Heart rate monitor disconnected (${device.name || 'HRM'})`);
      if (this.onHrDisconnectCallback) this.onHrDisconnectCallback();
    });

    if (!device.gatt) throw new Error('Device GATT is null');
    const server = await device.gatt.connect();

    this.hrChar?.removeEventListener('characteristicvaluechanged', this.handleHrValueChanged);
    const hrService = await server.getPrimaryService('heart_rate');
    const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
    this.hrChar = hrChar;

    hrChar.removeEventListener('characteristicvaluechanged', this.handleHrValueChanged);
    hrChar.addEventListener('characteristicvaluechanged', this.handleHrValueChanged);
    await hrChar.startNotifications();
    trainerLogger.log('INFO', 'HRM', `Connected to Heart Rate Monitor: ${device.name || 'HRM'}`);

    return device.name || 'Bluetooth Heart Rate Monitor';
  }

  /**
   * Parse BLE Heart Rate Measurement (0x2A37)
   */
  private parseHeartRateMeasurement(value: DataView): HeartRateData {
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const contactSensorSupported = (flags & 0x04) !== 0;
    const contactDetected = contactSensorSupported ? (flags & 0x02) !== 0 : true;

    let offset = 1;
    let bpm = 0;

    if (is16Bit) {
      bpm = value.getUint16(offset, true);
      offset += 2;
    } else {
      bpm = value.getUint8(offset);
      offset += 1;
    }

    // Energy expended present
    const energyExpendedPresent = (flags & 0x08) !== 0;
    if (energyExpendedPresent) {
      offset += 2;
    }

    // RR intervals present
    const rrIntervalPresent = (flags & 0x10) !== 0;
    const rrIntervals: number[] = [];
    if (rrIntervalPresent) {
      while (offset + 1 < value.byteLength) {
        const rr = value.getUint16(offset, true); // in 1/1024 seconds
        rrIntervals.push(Math.round((rr / 1024) * 1000)); // convert to ms
        offset += 2;
      }
    }

    return {
      bpm,
      contactDetected,
      rrIntervals: rrIntervals.length > 0 ? rrIntervals : undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * Connect to Tacx Vortex Smart or FTMS Smart Trainer
   */
  public async connectTrainer(
    onData: (data: Partial<TrainerData>) => void,
    onDisconnect: () => void
  ): Promise<string> {
    const support = getWebBluetoothSupport();
    if (!support.supported) {
      throw new Error(support.reason || 'Web Bluetooth unsupported');
    }

    this.onTrainerDataCallback = onData;
    this.onTrainerDisconnectCallback = onDisconnect;
    this.resetTrainerState();
    this.clearTrainerChars();

    // Tacx Vortex Smart advertises Fitness Machine (0x1826), Cycling Power (0x1818),
    // Cycling Speed & Cadence (0x1816), and/or legacy Tacx FE-C over BLE (6e40fec1).
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [BLE_SERVICES.FITNESS_MACHINE] },
        { services: ['fitness_machine'] },
        { services: [BLE_SERVICES.TACX_FEC_SERVICE] },
        { services: [BLE_SERVICES.CYCLING_POWER] },
        { namePrefix: 'Tacx' },
        { namePrefix: 'TACX' },
        { namePrefix: 'Vortex' },
        { namePrefix: 'Trainer' },
      ],
      optionalServices: [
        BLE_SERVICES.FITNESS_MACHINE,
        'fitness_machine',
        BLE_SERVICES.CYCLING_POWER,
        'cycling_power',
        BLE_SERVICES.CYCLING_SPEED_CADENCE,
        'cycling_speed_and_cadence',
        BLE_SERVICES.TACX_FEC_SERVICE,
      ],
    });

    this.trainerDevice = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.clearTrainerChars();
      this.resetTrainerState();
      trainerLogger.log('INFO', 'FTMS_STATUS', `Trainer disconnected (${device.name || 'Tacx'})`);
      if (this.onTrainerDisconnectCallback) this.onTrainerDisconnectCallback();
    });

    if (!device.gatt) throw new Error('Trainer GATT is null');
    const server = await device.gatt.connect();
    trainerLogger.log('INFO', 'FTMS_STATUS', `GATT connected to ${device.name || 'Smart Trainer'}`);

    // Log discovered GATT services for hardware diagnostics
    try {
      const services = await server.getPrimaryServices();
      const serviceList = services.map((s) => s.uuid.slice(0, 8)).join(', ');
      if (serviceList) {
        trainerLogger.log('INFO', 'FTMS_STATUS', `Discovered BLE services: ${serviceList}`);
      }
    } catch {
      // getPrimaryServices() may be restricted on some browsers
    }

    // 1. Try standard FTMS service (0x1826) first
    try {
      const ftmsService = await server.getPrimaryService(BLE_SERVICES.FITNESS_MACHINE);

      // Read Fitness Machine Feature (0x2ACC) to inspect supported capabilities
      try {
        const featureChar = await ftmsService.getCharacteristic(BLE_CHARS.FITNESS_MACHINE_FEATURE);
        const featVal = await featureChar.readValue();
        const rawHex = dataViewToHex(featVal);
        const machineFeat = featVal.byteLength >= 4 ? featVal.getUint32(0, true) : 0;
        const targetFeat = featVal.byteLength >= 8 ? featVal.getUint32(4, true) : 0;
        const supportsSpinDown = (targetFeat & 0x0400) !== 0 || (targetFeat & 0x1000) !== 0;
        trainerLogger.log(
          'RX',
          'FTMS_FEATURE',
          `FTMS Features: Machine=0x${machineFeat.toString(16).padStart(8, '0')} Target=0x${targetFeat.toString(16).padStart(8, '0')} (SpinDownBit=${supportsSpinDown})`,
          rawHex
        );
      } catch {
        // Feature char optional
      }

      // Control Point for resistance, ERG target watts, and spindown
      try {
        const controlPoint = await ftmsService.getCharacteristic(BLE_CHARS.FITNESS_MACHINE_CONTROL_POINT);
        this.ftmsControlChar = controlPoint;

        // Subscribe to Control Point indications BEFORE sending commands
        try {
          controlPoint.removeEventListener('characteristicvaluechanged', this.handleFtmsControlChanged);
          controlPoint.addEventListener('characteristicvaluechanged', this.handleFtmsControlChanged);
          await controlPoint.startNotifications();
          trainerLogger.log('INFO', 'FTMS_CTRL', 'Subscribed to FTMS Control Point (0x2AD9) indications');
        } catch (indErr) {
          trainerLogger.log('ERR', 'FTMS_CTRL', `Could not enable 0x2AD9 indications: ${String(indErr)}`);
        }

        // Request Control Opcode: 0x00
        await this.sendFtmsCommand(new Uint8Array([0x00]), 'Request Control (0x00)');
      } catch (cpErr) {
        trainerLogger.log('ERR', 'FTMS_CTRL', `FTMS control point unavailable: ${String(cpErr)}`);
      }

      // Fitness Machine Status (0x2AD3) notifications (important for Spin Down prompts)
      try {
        const statusChar = await ftmsService.getCharacteristic(BLE_CHARS.FITNESS_MACHINE_STATUS);
        this.ftmsStatusChar = statusChar;
        statusChar.removeEventListener('characteristicvaluechanged', this.handleFtmsStatusChanged);
        statusChar.addEventListener('characteristicvaluechanged', this.handleFtmsStatusChanged);
        await statusChar.startNotifications();
        trainerLogger.log('INFO', 'FTMS_STATUS', 'Subscribed to FTMS Status (0x2AD3) notifications');
      } catch {
        // Status char optional
      }

      // Indoor Bike Data for live Speed, Cadence, Power
      try {
        const bikeDataChar = await ftmsService.getCharacteristic(BLE_CHARS.INDOOR_BIKE_DATA);
        this.indoorBikeChar = bikeDataChar;
        bikeDataChar.removeEventListener('characteristicvaluechanged', this.handleIndoorBikeChanged);
        bikeDataChar.addEventListener('characteristicvaluechanged', this.handleIndoorBikeChanged);
        await bikeDataChar.startNotifications();
        trainerLogger.log('INFO', 'FTMS_DATA', 'Subscribed to FTMS Indoor Bike Data (0x2AD2) stream');
      } catch (ibErr) {
        trainerLogger.log('ERR', 'FTMS_DATA', `Indoor bike data char not available: ${String(ibErr)}`);
      }
    } catch {
      trainerLogger.log('INFO', 'FTMS_STATUS', 'FTMS service not found, trying Tacx FE-C legacy service...');
    }

    // 2. If FTMS control point wasn't acquired, try Tacx FE-C legacy service (6e40fec1)
    if (!this.ftmsControlChar) {
      try {
        const tacxFecService = await server.getPrimaryService(BLE_SERVICES.TACX_FEC_SERVICE);

        // Subscribe to Notify characteristic FIRST (6e40fec2 = Trainer -> App)
        try {
          const readChar = await tacxFecService.getCharacteristic(BLE_CHARS.TACX_FEC_READ);
          this.tacxFecReadChar = readChar;
          readChar.removeEventListener('characteristicvaluechanged', this.handleTacxFecReadChanged);
          readChar.addEventListener('characteristicvaluechanged', this.handleTacxFecReadChanged);
          await readChar.startNotifications();
          trainerLogger.log('INFO', 'TACX_FEC', 'Subscribed to Tacx FE-C Notify stream (6e40fec2)');
        } catch (readErr) {
          trainerLogger.log('ERR', 'TACX_FEC', `Could not subscribe to Tacx FE-C Notify (6e40fec2): ${String(readErr)}`);
        }

        // Acquire Write characteristic (6e40fec3 = App -> Trainer)
        const writeChar = await tacxFecService.getCharacteristic(BLE_CHARS.TACX_FEC_WRITE);
        this.tacxFecWriteChar = writeChar;
        trainerLogger.log(
          'INFO',
          'TACX_FEC',
          `Acquired Tacx FE-C Write characteristic (6e40fec3, write=${writeChar.properties.write}, noResp=${writeChar.properties.writeWithoutResponse})`
        );

        // Request initial FE-C status & capabilities (Page 54, Page 17, Page 71) and start 1 Hz keepalive
        await this.initializeTacxFecSession();
      } catch (fecErr) {
        trainerLogger.log('ERR', 'TACX_FEC', `Tacx FE-C service unavailable: ${String(fecErr)}`);
      }
    }

    // 3. Fallback / supplementary BLE sensors when FTMS Indoor Bike Data (0x2AD2) is absent
    if (!this.indoorBikeChar) {
      // 3a. Cycling Power Service (0x1818 / 0x2A63)
      try {
        const cpsService = await server.getPrimaryService(BLE_SERVICES.CYCLING_POWER);
        const cpsChar = await cpsService.getCharacteristic(BLE_CHARS.CYCLING_POWER_MEASUREMENT);
        this.cyclingPowerChar = cpsChar;
        cpsChar.removeEventListener('characteristicvaluechanged', this.handleCpsChanged);
        cpsChar.addEventListener('characteristicvaluechanged', this.handleCpsChanged);
        await cpsChar.startNotifications();
        trainerLogger.log('INFO', 'CPS', 'Subscribed to Cycling Power Measurement (0x2A63) stream');
      } catch {
        // CPS not exposed or optional
      }

      // 3b. Cycling Speed & Cadence Service (0x1816 / 0x2A5B)
      try {
        const cscService = await server.getPrimaryService(BLE_SERVICES.CYCLING_SPEED_CADENCE);
        const cscChar = await cscService.getCharacteristic(BLE_CHARS.CSC_MEASUREMENT);
        this.cscChar = cscChar;
        cscChar.removeEventListener('characteristicvaluechanged', this.handleCscChanged);
        cscChar.addEventListener('characteristicvaluechanged', this.handleCscChanged);
        await cscChar.startNotifications();
        trainerLogger.log('INFO', 'CSC', 'Subscribed to Cycling Speed & Cadence (0x2A5B) stream');
      } catch {
        // CSC not exposed or optional
      }
    }

    return device.name || 'Tacx Vortex Smart Trainer';
  }

  /**
   * Build 13-byte ANT+ serial frame for Tacx FE-C over BLE:
   * [0xA4, 0x09, msgId (0x4F=Ack / 0x4E=Broadcast), channel (0x05), ...8-byte page..., xorChecksum]
   */
  private buildAntFecFrame(pageBytes: number[], messageId = 0x4f, channel = 0x05): Uint8Array {
    const frame = new Uint8Array(13);
    frame[0] = 0xa4;
    frame[1] = 0x09;
    frame[2] = messageId;
    frame[3] = channel;
    for (let i = 0; i < 8; i++) {
      frame[4 + i] = (pageBytes[i] ?? 0xff) & 0xff;
    }
    let checksum = 0;
    for (let i = 0; i < 12; i++) {
      checksum ^= frame[i];
    }
    frame[12] = checksum & 0xff;
    return frame;
  }

  private enqueueFecWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.fecWriteQueue.then(task, task);
    this.fecWriteQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async sendTacxFecFrame(frame: Uint8Array, label: string, logTx: boolean = true): Promise<void> {
    return this.enqueueFecWrite(async () => {
      if (!this.tacxFecWriteChar) return;
      const hex = dataViewToHex(frame);
      if (logTx) {
        trainerLogger.log('TX', 'TACX_FEC', label, hex);
      }
      const bufferSource = frame as unknown as BufferSource;

      const props = this.tacxFecWriteChar.properties;
      const preferWithoutResponse = props.writeWithoutResponse && !props.write;

      if (preferWithoutResponse) {
        await this.tacxFecWriteChar.writeValueWithoutResponse(bufferSource);
        if (!this.hasLoggedWriteMode) {
          this.hasLoggedWriteMode = true;
          trainerLogger.log('INFO', 'TACX_FEC', 'BLE TX write mode: writeWithoutResponse');
        }
        this.lastFecTxAt = Date.now();
        return;
      }

      try {
        await this.tacxFecWriteChar.writeValueWithResponse(bufferSource);
        if (!this.hasLoggedWriteMode) {
          this.hasLoggedWriteMode = true;
          trainerLogger.log('INFO', 'TACX_FEC', 'BLE TX write mode: writeWithResponse');
        }
        this.lastFecTxAt = Date.now();
      } catch (err) {
        if (props.writeWithoutResponse) {
          await this.tacxFecWriteChar.writeValueWithoutResponse(bufferSource);
          if (!this.hasLoggedWriteMode) {
            this.hasLoggedWriteMode = true;
            trainerLogger.log('INFO', 'TACX_FEC', `BLE TX fallback to writeWithoutResponse (${String(err)})`);
          }
          this.lastFecTxAt = Date.now();
        } else {
          throw err;
        }
      }
    });
  }

  private async requestFecPage(pageNumber: number, label: string): Promise<void> {
    if (!this.tacxFecWriteChar) return;
    const req = this.buildAntFecFrame([0x46, 0xff, 0xff, 0xff, 0xff, 0x80, pageNumber & 0xff, 0x01]);
    await this.sendTacxFecFrame(req, label, true);
  }

  private async sendSimulationConfig(): Promise<void> {
    if (!this.tacxFecWriteChar) return;
    // Page 55 (0x37): User Configuration
    const userWeightRaw = Math.max(4000, Math.min(16000, Math.round(this.riderWeightKg * 100))); // 0.01 kg
    const bikeWeightRaw = 200; // 10.0 kg in 0.05 kg units (12-bit: low 4 bits in byte4 upper nibble, high 8 bits in byte5)
    const wheelDiameterCm = Math.max(50, Math.min(80, Math.round((this.wheelCircumferenceM / Math.PI) * 100)));
    const page55 = this.buildAntFecFrame([
      0x37,
      userWeightRaw & 0xff,
      (userWeightRaw >> 8) & 0xff,
      0xff,
      ((bikeWeightRaw & 0x0f) << 4) | 0x0f, // 0x0F = wheel diameter offset not used
      (bikeWeightRaw >> 4) & 0xff,
      wheelDiameterCm & 0xff,
      0x00,
    ]);
    await this.sendTacxFecFrame(page55, `FE-C User Config (Weight=${this.riderWeightKg}kg, Wheel=${wheelDiameterCm}cm)`);

    // Page 50 (0x32): Wind Resistance (CdA=0.51 kg/m -> 51, Wind=0 km/h -> 127, Draft=1.0 -> 100)
    const page50 = this.buildAntFecFrame([0x32, 0xff, 0xff, 0xff, 0xff, 0x33, 0x7f, 0x64]);
    await this.sendTacxFecFrame(page50, 'FE-C Wind Resistance (0.51 kg/m, 0 km/h wind)');
    this.fecSimulationInitialized = true;
  }

  private async initializeTacxFecSession(): Promise<void> {
    try {
      await this.requestFecPage(0x36, 'Request FE-C Capabilities (Page 54)');
      await this.requestFecPage(0x47, 'Request FE-C Command Status (Page 71)');
      await this.requestFecPage(0x11, 'Request FE-C General Settings (Page 17)');
    } catch {
      // Optional diagnostic polls
    }

    await this.applyTacxFecControl(this.currentSetResistance, true);
    this.startFecKeepalive();
  }

  private startFecKeepalive(): void {
    this.stopFecKeepalive();
    if (!this.tacxFecWriteChar) return;
    // Tacx Vortex FE-C watchdog expects periodic (~1 Hz) control updates so resistance doesn't drop or reset
    this.fecKeepaliveTimer = setInterval(() => {
      if (!this.tacxFecWriteChar || !this.isTrainerConnected() || this.ftmsControlChar) {
        return;
      }
      const now = Date.now();
      if (now - this.lastFecTxAt >= 900) {
        const shouldLogKeepalive = now - this.lastFecKeepaliveLogAt >= 10000;
        if (shouldLogKeepalive) {
          this.lastFecKeepaliveLogAt = now;
        }
        void this.applyTacxFecControl(this.currentSetResistance, shouldLogKeepalive).catch((err) => {
          trainerLogger.log('ERR', 'TACX_FEC', `Keepalive TX failed: ${String(err)}`);
        });
      }
    }, 1000);
  }

  private stopFecKeepalive(): void {
    if (this.fecKeepaliveTimer) {
      clearInterval(this.fecKeepaliveTimer);
      this.fecKeepaliveTimer = null;
    }
  }

  private async applyTacxFecControl(percent: number, forceLog: boolean): Promise<boolean> {
    if (!this.tacxFecWriteChar) return false;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const valueChanged = clamped !== this.lastSentControlValue;
    const shouldLog = forceLog || valueChanged;

    if (this.fecControlMode === 'simulation') {
      if (!this.fecSimulationInitialized) {
        await this.sendSimulationConfig();
      }
      // Map 0..100% control level cleanly to 0.0% .. +5.0% uphill road grade
      // (avoids negative-grade downhill dead zone on wheel-on electro-brake trainers; 20% = +1.0%, 40% = +2.0%, 60% = +3.0%)
      const gradePercent = Math.round(clamped * 0.05 * 100) / 100;
      const gradeRaw = Math.max(0, Math.min(40000, Math.round((gradePercent + 200) * 100)));
      const lowByte = gradeRaw & 0xff;
      const highByte = (gradeRaw >> 8) & 0xff;
      const crrRaw = 0x50; // 80 * 0.00005 = 0.0040 (asphalt)
      const frame = this.buildAntFecFrame([0x33, 0xff, 0xff, 0xff, 0xff, lowByte, highByte, crrRaw]);
      await this.sendTacxFecFrame(
        frame,
        `FE-C Track Grade +${gradePercent.toFixed(2)}% (Level ${clamped}%)`,
        shouldLog
      );
    } else if (this.fecControlMode === 'erg') {
      const targetWatts = Math.max(
        50,
        Math.min(600, Math.round((0.35 + (clamped / 100) * 0.95) * this.ftpWatts))
      );
      this.currentTargetPowerWatts = targetWatts;
      const rawQuarterWatts = Math.min(16000, Math.round(targetWatts * 4));
      const lowByte = rawQuarterWatts & 0xff;
      const highByte = (rawQuarterWatts >> 8) & 0xff;
      const frame = this.buildAntFecFrame([0x31, 0xff, 0xff, 0xff, 0xff, 0xff, lowByte, highByte]);
      await this.sendTacxFecFrame(
        frame,
        `FE-C Target Power ${targetWatts} W (Level ${clamped}%)`,
        shouldLog
      );
    } else {
      const rawRes = Math.min(200, Math.round((clamped / 100) * 200));
      const frame = this.buildAntFecFrame([0x30, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, rawRes]);
      await this.sendTacxFecFrame(
        frame,
        `FE-C Basic Resistance ${clamped}% (raw ${rawRes})`,
        shouldLog
      );
    }

    this.lastSentControlValue = clamped;

    // Rate-limited Command Status (Page 71) verification after value changes or every 15s
    const now = Date.now();
    if ((valueChanged && now - this.lastFecAckPollAt >= 4500) || now - this.lastFecAckPollAt >= 15000) {
      this.lastFecAckPollAt = now;
      setTimeout(() => {
        if (this.tacxFecWriteChar && this.isTrainerConnected()) {
          void this.requestFecPage(0x47, 'Verify Command Status (Page 71)').catch(() => {});
        }
      }, 300);
    }

    return true;
  }

  /**
   * Parse incoming Tacx FE-C over BLE notifications (6e40fec2)
   * Supports framed ANT+ messages ([0xA4, len, msgId, channel, d0..d7, xor]) as well as unframed 8-byte pages.
   */
  private parseTacxFecData(value: DataView) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const fullHex = dataViewToHex(value);
    const now = Date.now();
    if (fullHex === this.lastFecRxHex && now - this.lastFecRxAt < 25) {
      return;
    }
    this.lastFecRxHex = fullHex;
    this.lastFecRxAt = now;
    const pages: Uint8Array[] = [];

    if (bytes.length >= 13 && bytes[0] === 0xa4) {
      let offset = 0;
      while (offset + 4 < bytes.length && bytes[offset] === 0xa4) {
        const msgLen = bytes[offset + 1];
        const frameTotal = msgLen + 4; // sync + len + msgId + payload(msgLen) + checksum
        if (offset + frameTotal > bytes.length) break;

        // Extract 8-byte ANT data page (skipping channel byte at offset + 3)
        if (msgLen >= 9) {
          pages.push(bytes.slice(offset + 4, offset + 12));
        } else if (msgLen === 8) {
          pages.push(bytes.slice(offset + 3, offset + 11));
        }
        offset += frameTotal;
      }
    } else if (bytes.length === 8) {
      pages.push(bytes);
    }

    if (pages.length === 0) {
      trainerLogger.log('RX', 'TACX_FEC', `Unrecognized FE-C frame (${bytes.length} bytes)`, fullHex);
      return;
    }

    for (const page of pages) {
      const pageNum = page[0];

      // Page 16 (0x10): General FE Data -> Speed (uint16 LE at bytes 4..5 in 0.001 m/s)
      if (pageNum === 0x10) {
        const rawSpeedMmPerSec = page[4] | (page[5] << 8);
        if (rawSpeedMmPerSec !== 0xffff) {
          // 0.001 m/s * 3.6 = 0.0036 km/h
          this.lastReportedSpeed = Math.round(rawSpeedMmPerSec * 0.0036 * 100) / 100;
        }
        this.lastFecPacketAt = Date.now();

        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 16 (General FE) | Speed: ${this.lastReportedSpeed.toFixed(1)} km/h | Cad: ${this.lastReportedCadence} rpm | Pwr: ${this.lastReportedWatts} W`,
          fullHex,
          {
            rawSpeedKmh: this.lastReportedSpeed,
            speedKmh: this.lastReportedSpeed,
            cadenceRpm: this.lastReportedCadence,
            powerWatts: this.lastReportedWatts,
            resistancePercent: this.currentSetResistance,
            flagsHex: '0x10',
          }
        );

        this.emitTrainerData();
        continue;
      }

      // Page 25 (0x19): Specific Trainer Data -> Cadence (byte 2), Instantaneous Power (12-bit), Flags (byte 7)
      if (pageNum === 0x19) {
        const rawCadence = page[2];
        if (rawCadence !== 0xff) {
          this.lastReportedCadence = rawCadence;
        }
        const rawPower = page[5] | ((page[6] & 0x0f) << 8);
        if (rawPower !== 0xfff) {
          this.lastReportedWatts = rawPower;
        }
        const statusByte = page[7];
        const statusHex = `0x${statusByte.toString(16).padStart(2, '0').toUpperCase()}`;
        this.lastTrainerFlagsHex = statusHex;
        const limitBits = statusByte & 0x03;

        // Note: On Tacx Vortex, limitBits === 0x03 (0x33) also occurs naturally at low resistance <= ~32% Basic
        // (minimum mechanical roller drag floor). Only warn about watch/app contention if commanded above the floor.
        const aboveMinimumBrakeFloor =
          this.fecControlMode === 'basic'
            ? this.currentSetResistance >= 34
            : this.currentSetResistance >= 15;

        if (
          this.lastReportedSpeed > 5 &&
          this.lastReportedCadence > 20 &&
          limitBits === 0x03 &&
          aboveMinimumBrakeFloor
        ) {
          this.undeterminedPedalTicks += 1;
          if (
            this.undeterminedPedalTicks >= 24 &&
            this.lastSentControlValue >= 0 &&
            !this.hasLoggedUndeterminedHint
          ) {
            this.hasLoggedUndeterminedHint = true;
            trainerLogger.log(
              'INFO',
              'TACX_FEC',
              `Trainer reporting Page 25 status ${statusHex} (Limit=Undetermined) at ${this.currentSetResistance}% resistance. Ensure no Garmin watch Indoor Bike activity or phone app holds ANT+/BLE control; power-cycle trainer if brake stays unresponsive.`
            );
          }
        } else if (limitBits === 0x00 || !aboveMinimumBrakeFloor) {
          this.undeterminedPedalTicks = 0;
        }

        this.lastFecPacketAt = Date.now();

        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 25 (Trainer) | Pwr: ${this.lastReportedWatts} W | Cad: ${this.lastReportedCadence} rpm | Speed: ${this.lastReportedSpeed.toFixed(1)} km/h | Flags: ${statusHex}`,
          fullHex,
          {
            rawSpeedKmh: this.lastReportedSpeed,
            speedKmh: this.lastReportedSpeed,
            cadenceRpm: this.lastReportedCadence,
            powerWatts: this.lastReportedWatts,
            resistancePercent: this.currentSetResistance,
            flagsHex: '0x19',
          }
        );

        this.emitTrainerData();
        continue;
      }

      // Page 17 (0x11): General Settings (Resistance level at byte 6 in 0.5%)
      if (pageNum === 0x11) {
        const resPct = page[6] !== 0xff ? page[6] * 0.5 : undefined;
        const cycleLenCm = page[3] !== 0xff ? page[3] : undefined;
        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 17 (Settings)${resPct !== undefined ? ` | Brake Resistance: ${resPct.toFixed(1)}%` : ''}${cycleLenCm ? ` | Wheel: ${(cycleLenCm * 0.01).toFixed(2)}m` : ''}`,
          fullHex,
          { flagsHex: '0x11', resistancePercent: resPct ?? this.currentSetResistance }
        );
        continue;
      }

      // Page 71 (0x47): Command Status
      if (pageNum === 0x47) {
        const lastCmdPage = page[1];
        const seq = page[2];
        const statusCode = page[3];
        const statusNames: Record<number, string> = {
          0x00: 'Pass',
          0x01: 'Fail',
          0x02: 'Not Supported',
          0x03: 'Rejected',
          0x04: 'Pending',
          0xff: 'Uninitialized',
        };
        const statusLabel = statusNames[statusCode] || `Status 0x${statusCode.toString(16)}`;
        const cmdHex = `0x${lastCmdPage.toString(16).padStart(2, '0')}`;
        this.lastControlAckLabel = `${cmdHex}: ${statusLabel}`;

        if (lastCmdPage === 0xfc && statusCode === 0x02 && !this.hasLoggedExternalFcHint) {
          this.hasLoggedExternalFcHint = true;
          trainerLogger.log(
            'INFO',
            'TACX_FEC',
            'Trainer Page 71 reported command 0xFC (Not Supported) — typically an internal poll or a secondary ANT+ device (e.g., Garmin watch paired as a Smart Trainer).'
          );
        }

        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 71 Command Ack for Page ${cmdHex} (seq=${seq}): ${statusLabel}`,
          fullHex,
          { flagsHex: '0x47' }
        );
        this.emitTrainerData();
        continue;
      }

      // Page 54 (0x36): FE Capabilities (Max Resistance uint16 at bytes 5..6, mode bitmask at byte 7)
      if (pageNum === 0x36) {
        const maxResN = page[5] | (page[6] << 8);
        const capBits = page[7];
        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 54 (FE Capabilities | MaxRes=${maxResN === 0xffff ? 'N/A' : `${maxResN}N`} Caps=0x${capBits.toString(16).padStart(2, '0')} [Basic=${(capBits & 1) !== 0}, ERG=${(capBits & 2) !== 0}, Sim=${(capBits & 4) !== 0}])`,
          fullHex,
          { flagsHex: '0x36' }
        );
        continue;
      }

      // Page 80 (0x50): Manufacturer Info
      if (pageNum === 0x50) {
        const hwRev = page[3];
        const mfgId = page[4] | (page[5] << 8);
        const modelNum = page[6] | (page[7] << 8);
        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 80 (Manufacturer=${mfgId === 89 ? 'Tacx' : mfgId} Model=${modelNum} HW=${hwRev})`,
          fullHex,
          { flagsHex: '0x50' }
        );
        continue;
      }

      // Page 81 (0x51): Product Info
      if (pageNum === 0x51) {
        const swSupp = page[2];
        const swMain = page[3];
        const serial = ((page[4] | (page[5] << 8) | (page[6] << 16) | (page[7] << 24)) >>> 0);
        trainerLogger.log(
          'RX',
          'TACX_FEC',
          `Page 81 (Firmware=${swMain}.${swSupp} Serial=${serial})`,
          fullHex,
          { flagsHex: '0x51' }
        );
        continue;
      }

      // Page 240 (0xF0): Tacx proprietary keepalive / status page
      if (pageNum === 0xf0) {
        trainerLogger.log('RX', 'TACX_FEC', 'Page 240 (Tacx Keepalive / Status)', fullHex, {
          flagsHex: '0xf0',
        });
        continue;
      }

      trainerLogger.log('RX', 'TACX_FEC', `Page ${pageNum} (0x${pageNum.toString(16).padStart(2, '0')})`, fullHex, {
        flagsHex: `0x${pageNum.toString(16)}`,
      });
    }
  }

  /**
   * Parse BLE Cycling Power Measurement (0x2A63) fallback/supplementary telemetry
   */
  private parseCyclingPowerMeasurement(value: DataView) {
    if (value.byteLength < 4) return;
    const rawHex = dataViewToHex(value);
    const flags = value.getUint16(0, true);
    const flagsHex = `0x${flags.toString(16).padStart(4, '0').toUpperCase()}`;
    const instPower = value.getInt16(2, true);
    let offset = 4;

    // Optional fields per GATT Cycling Power Measurement spec
    if ((flags & 0x0001) !== 0) offset += 1; // Pedal Power Balance
    if ((flags & 0x0004) !== 0) offset += 2; // Accumulated Torque

    const now = Date.now();
    const hasFreshFec = now - this.lastFecPacketAt < 2500;

    // Bit 4: Wheel Revolution Data (uint32 cum revs + uint16 last wheel event time in 1/2048s)
    if ((flags & 0x0010) !== 0 && offset + 6 <= value.byteLength) {
      const revs = value.getUint32(offset, true);
      const time2048 = value.getUint16(offset + 4, true);
      offset += 6;

      if (this.lastCpsWheel) {
        const dRevs = (revs - this.lastCpsWheel.revs + 0x100000000) % 0x100000000;
        const dTime = (time2048 - this.lastCpsWheel.time2048 + 65536) % 65536;
        if (dRevs > 0 && dTime > 0 && !hasFreshFec) {
          const dtSec = dTime / 2048;
          const speedKmh = ((dRevs * this.wheelCircumferenceM) / dtSec) * 3.6;
          if (speedKmh >= 0 && speedKmh < 110) {
            this.lastReportedSpeed = Math.round(speedKmh * 100) / 100;
          }
          this.lastCpsWheel = { revs, time2048, updatedAt: now };
        } else if (now - this.lastCpsWheel.updatedAt > 2500 && !hasFreshFec) {
          this.lastReportedSpeed = 0;
        }
      } else {
        this.lastCpsWheel = { revs, time2048, updatedAt: now };
      }
    }

    // Bit 5: Crank Revolution Data (uint16 cum crank revs + uint16 last crank event time in 1/1024s)
    if ((flags & 0x0020) !== 0 && offset + 4 <= value.byteLength) {
      const revs = value.getUint16(offset, true);
      const time1024 = value.getUint16(offset + 2, true);
      offset += 4;

      if (this.lastCpsCrank) {
        const dRevs = (revs - this.lastCpsCrank.revs + 65536) % 65536;
        const dTime = (time1024 - this.lastCpsCrank.time1024 + 65536) % 65536;
        if (dRevs > 0 && dTime > 0 && !hasFreshFec) {
          const rpm = (dRevs / (dTime / 1024)) * 60;
          if (rpm >= 0 && rpm < 220) {
            this.lastReportedCadence = Math.round(rpm);
          }
          this.lastCpsCrank = { revs, time1024, updatedAt: now };
        } else if (now - this.lastCpsCrank.updatedAt > 2500 && !hasFreshFec) {
          this.lastReportedCadence = 0;
        }
      } else {
        this.lastCpsCrank = { revs, time1024, updatedAt: now };
      }
    }

    if (!hasFreshFec) {
      this.lastReportedWatts = Math.max(0, instPower);
      trainerLogger.log(
        'RX',
        'CPS',
        `CPS | Pwr: ${this.lastReportedWatts} W | Speed: ${this.lastReportedSpeed.toFixed(1)} km/h | Cad: ${this.lastReportedCadence} rpm`,
        rawHex,
        {
          rawSpeedKmh: this.lastReportedSpeed,
          speedKmh: this.lastReportedSpeed,
          cadenceRpm: this.lastReportedCadence,
          powerWatts: this.lastReportedWatts,
          resistancePercent: this.currentSetResistance,
          flagsHex,
        }
      );
      this.emitTrainerData();
    }
  }

  /**
   * Parse BLE Cycling Speed & Cadence Measurement (0x2A5B) fallback telemetry
   */
  private parseCscMeasurement(value: DataView) {
    if (value.byteLength < 1) return;
    const rawHex = dataViewToHex(value);
    const flags = value.getUint8(0);
    const flagsHex = `0x${flags.toString(16).padStart(2, '0').toUpperCase()}`;
    let offset = 1;

    const now = Date.now();
    const hasFreshFec = now - this.lastFecPacketAt < 2500;
    let updated = false;

    // Bit 0: Wheel Revolution Data (uint32 + uint16 in 1/1024s)
    if ((flags & 0x01) !== 0 && offset + 6 <= value.byteLength) {
      const revs = value.getUint32(offset, true);
      const time1024 = value.getUint16(offset + 4, true);
      offset += 6;

      if (this.lastCscWheel) {
        const dRevs = (revs - this.lastCscWheel.revs + 0x100000000) % 0x100000000;
        const dTime = (time1024 - this.lastCscWheel.time1024 + 65536) % 65536;
        if (dRevs > 0 && dTime > 0 && !hasFreshFec) {
          const speedKmh = ((dRevs * this.wheelCircumferenceM) / (dTime / 1024)) * 3.6;
          if (speedKmh >= 0 && speedKmh < 110) {
            this.lastReportedSpeed = Math.round(speedKmh * 100) / 100;
            updated = true;
          }
          this.lastCscWheel = { revs, time1024, updatedAt: now };
        } else if (now - this.lastCscWheel.updatedAt > 2500 && !hasFreshFec) {
          this.lastReportedSpeed = 0;
          updated = true;
        }
      } else {
        this.lastCscWheel = { revs, time1024, updatedAt: now };
      }
    }

    // Bit 1: Crank Revolution Data (uint16 + uint16 in 1/1024s)
    if ((flags & 0x02) !== 0 && offset + 4 <= value.byteLength) {
      const revs = value.getUint16(offset, true);
      const time1024 = value.getUint16(offset + 2, true);
      offset += 4;

      if (this.lastCscCrank) {
        const dRevs = (revs - this.lastCscCrank.revs + 65536) % 65536;
        const dTime = (time1024 - this.lastCscCrank.time1024 + 65536) % 65536;
        if (dRevs > 0 && dTime > 0 && !hasFreshFec) {
          const rpm = (dRevs / (dTime / 1024)) * 60;
          if (rpm >= 0 && rpm < 220) {
            this.lastReportedCadence = Math.round(rpm);
            updated = true;
          }
          this.lastCscCrank = { revs, time1024, updatedAt: now };
        } else if (now - this.lastCscCrank.updatedAt > 2500 && !hasFreshFec) {
          this.lastReportedCadence = 0;
          updated = true;
        }
      } else {
        this.lastCscCrank = { revs, time1024, updatedAt: now };
      }
    }

    if (updated && !hasFreshFec) {
      trainerLogger.log(
        'RX',
        'CSC',
        `CSC | Speed: ${this.lastReportedSpeed.toFixed(1)} km/h | Cad: ${this.lastReportedCadence} rpm`,
        rawHex,
        {
          rawSpeedKmh: this.lastReportedSpeed,
          speedKmh: this.lastReportedSpeed,
          cadenceRpm: this.lastReportedCadence,
          powerWatts: this.lastReportedWatts,
          resistancePercent: this.currentSetResistance,
          flagsHex,
        }
      );
      this.emitTrainerData();
    }
  }

  private emitTrainerData(): void {
    if (!this.onTrainerDataCallback) return;
    this.onTrainerDataCallback({
      speedKmh: this.lastReportedSpeed,
      rawSpeedKmh: this.lastReportedSpeed,
      cadenceRpm: this.lastReportedCadence,
      powerWatts: this.lastReportedWatts,
      rawPowerWatts: this.lastReportedWatts,
      resistancePercent: this.currentSetResistance,
      targetPowerWatts: this.currentTargetPowerWatts,
      trainerFlagsHex: this.lastTrainerFlagsHex || undefined,
      controlAckLabel: this.lastControlAckLabel || undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Parse FTMS Control Point Response (0x2AD9)
   */
  private parseFtmsControlPointResponse(value: DataView) {
    const rawHex = dataViewToHex(value);
    const opcode = value.byteLength > 0 ? value.getUint8(0) : 0;
    if (opcode === 0x80 && value.byteLength >= 3) {
      const reqOpcode = value.getUint8(1);
      const resultCode = value.getUint8(2);
      const resultNames: Record<number, string> = {
        0x01: 'Success',
        0x02: 'Op Code Not Supported',
        0x03: 'Invalid Parameter',
        0x04: 'Operation Failed',
        0x05: 'Control Not Permitted',
      };
      const resultLabel = resultNames[resultCode] || `Code 0x${resultCode.toString(16)}`;
      let extra = '';

      // If response to Spin Down Start (0x13), FTMS includes Target Speed Low & High (uint16 0.01 km/h)
      if (reqOpcode === 0x13 && resultCode === 0x01 && value.byteLength >= 7) {
        const lowKmh = Math.round(value.getUint16(3, true) * 0.01 * 10) / 10;
        const highKmh = Math.round(value.getUint16(5, true) * 0.01 * 10) / 10;
        extra = ` | Target Speed Window: ${lowKmh}-${highKmh} km/h`;
        this.onSpindownCallback?.({
          status: 'requested',
          targetSpeedLowKmh: lowKmh,
          targetSpeedHighKmh: highKmh,
          message: `Trainer accepted FTMS Spin Down (target ${lowKmh}-${highKmh} km/h)`,
        });
      } else if (reqOpcode === 0x13 && resultCode !== 0x01) {
        this.onSpindownCallback?.({
          status: 'unsupported',
          message: `Trainer returned ${resultLabel} for FTMS Spin Down — using software coast-down calibration`,
        });
      }

      trainerLogger.log(
        'RX',
        'FTMS_CTRL',
        `Control Response to 0x${reqOpcode.toString(16).padStart(2, '0')}: ${resultLabel}${extra}`,
        rawHex
      );
    } else {
      trainerLogger.log('RX', 'FTMS_CTRL', `Control Point Indication (opcode 0x${opcode.toString(16)})`, rawHex);
    }
  }

  /**
   * Parse FTMS Fitness Machine Status (0x2AD3)
   */
  private parseFtmsStatus(value: DataView) {
    const rawHex = dataViewToHex(value);
    const opcode = value.byteLength > 0 ? value.getUint8(0) : 0;

    if (opcode === 0x14 && value.byteLength >= 2) {
      // Spin Down Status
      const sdStatus = value.getUint8(1);
      if (sdStatus === 0x01) {
        trainerLogger.log('RX', 'FTMS_STATUS', 'Spin Down Status: Requested', rawHex);
        this.onSpindownCallback?.({ status: 'requested', message: 'Spin down requested by trainer' });
      } else if (sdStatus === 0x02) {
        trainerLogger.log('RX', 'FTMS_STATUS', 'Spin Down Status: SUCCESS (Hardware Calibrated)', rawHex);
        this.onSpindownCallback?.({ status: 'success', message: 'Hardware spin down succeeded!' });
      } else if (sdStatus === 0x03) {
        trainerLogger.log('RX', 'FTMS_STATUS', 'Spin Down Status: Error', rawHex);
        this.onSpindownCallback?.({ status: 'error', message: 'Hardware spin down reported an error' });
      } else if (sdStatus === 0x04) {
        trainerLogger.log('RX', 'FTMS_STATUS', 'Spin Down Status: STOP PEDALING', rawHex);
        this.onSpindownCallback?.({ status: 'stop_pedaling', message: 'Trainer signaled: Stop Pedaling!' });
      }
      return;
    }

    trainerLogger.log('RX', 'FTMS_STATUS', `Status OpCode 0x${opcode.toString(16).padStart(2, '0')}`, rawHex);
  }

  /**
   * Parse FTMS Indoor Bike Data (0x2AD2)
   */
  private parseIndoorBikeData(value: DataView) {
    const rawHex = dataViewToHex(value);
    let offset = 2; // Flags is 16-bit
    const flags = value.getUint16(0, true);
    const flagsHex = `0x${flags.toString(16).padStart(4, '0').toUpperCase()}`;

    const moreData = (flags & 0x0001) !== 0;
    const avgSpeedPresent = (flags & 0x0002) !== 0;
    const instCadencePresent = (flags & 0x0004) !== 0;
    const avgCadencePresent = (flags & 0x0008) !== 0;
    const totalDistancePresent = (flags & 0x0010) !== 0;
    const resistancePresent = (flags & 0x0020) !== 0;
    const instPowerPresent = (flags & 0x0040) !== 0;
    const avgPowerPresent = (flags & 0x0080) !== 0;

    let speedKmh = this.lastReportedSpeed;
    let cadenceRpm = this.lastReportedCadence;
    let powerWatts = this.lastReportedWatts;
    let reportedResistance: number | undefined = undefined;

    // Instantaneous Speed: uint16 in 0.01 km/h
    if (!moreData && offset + 2 <= value.byteLength) {
      const rawSpeed = value.getUint16(offset, true);
      speedKmh = Math.round((rawSpeed * 0.01) * 100) / 100;
      offset += 2;
    }

    if (avgSpeedPresent && offset + 2 <= value.byteLength) offset += 2;

    // Instantaneous Cadence: uint16 in 0.5 rpm
    if (instCadencePresent && offset + 2 <= value.byteLength) {
      const rawCadence = value.getUint16(offset, true);
      cadenceRpm = Math.round(rawCadence * 0.5);
      offset += 2;
    }

    if (avgCadencePresent && offset + 2 <= value.byteLength) offset += 2;
    if (totalDistancePresent && offset + 3 <= value.byteLength) offset += 3;

    // Resistance Level: sint16 (unitless 0.1 or 1 depending on trainer)
    if (resistancePresent && offset + 2 <= value.byteLength) {
      reportedResistance = value.getInt16(offset, true);
      offset += 2;
    }

    // Instantaneous Power: sint16 in watts
    if (instPowerPresent && offset + 2 <= value.byteLength) {
      powerWatts = value.getInt16(offset, true);
      offset += 2;
    }

    if (avgPowerPresent && offset + 2 <= value.byteLength) offset += 2;

    this.lastReportedSpeed = speedKmh;
    this.lastReportedCadence = cadenceRpm;
    this.lastReportedWatts = powerWatts;

    const summaryParts = [
      `Flags ${flagsHex}`,
      `Speed: ${speedKmh.toFixed(1)} km/h`,
      `Cad: ${cadenceRpm} rpm`,
      `Pwr: ${powerWatts} W`,
    ];
    if (reportedResistance !== undefined) {
      summaryParts.push(`ResRaw: ${reportedResistance}`);
    }

    trainerLogger.log('RX', 'FTMS_DATA', summaryParts.join(' | '), rawHex, {
      rawSpeedKmh: speedKmh,
      speedKmh,
      cadenceRpm,
      powerWatts,
      resistancePercent: this.currentSetResistance,
      flagsHex,
    });

    this.emitTrainerData();
  }

  /**
   * Set Tacx Vortex resistance level (0 to 100%)
   */
  public async setResistancePercent(percent: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.currentSetResistance = clamped;

    // 1. FTMS Set Target Resistance Level (0x04) or ERG Target Power (0x05)
    if (this.ftmsControlChar) {
      try {
        if (this.fecControlMode === 'erg') {
          const watts = Math.max(
            50,
            Math.min(600, Math.round((0.35 + (clamped / 100) * 0.95) * this.ftpWatts))
          );
          this.currentTargetPowerWatts = watts;
          const command = new Uint8Array([0x05, watts & 0xff, (watts >> 8) & 0xff]);
          await this.sendFtmsCommand(command, `Set FTMS ERG Power ${watts} W (Level ${clamped}%)`);
          return true;
        }
        const resistanceValue = Math.min(200, Math.round(clamped * 2)); // 0.5 step
        const command = new Uint8Array([0x04, resistanceValue]);
        await this.sendFtmsCommand(command, `Set Resistance ${clamped}% (raw ${resistanceValue})`);
        return true;
      } catch (err) {
        trainerLogger.log('ERR', 'FTMS_CTRL', `Failed to send FTMS resistance: ${String(err)}`);
      }
    }

    // 2. Tacx FE-C over BLE (Simulation Page 51 / ERG Page 49 / Basic Page 48)
    if (this.tacxFecWriteChar) {
      try {
        return await this.applyTacxFecControl(clamped, true);
      } catch (fecErr) {
        trainerLogger.log('ERR', 'TACX_FEC', `Failed to send Tacx FE-C resistance: ${String(fecErr)}`);
      }
    }

    return false;
  }

  /**
   * Set Tacx Vortex Target Power in ERG mode (Watts)
   */
  public async setTargetPowerWatts(watts: number): Promise<boolean> {
    const clampedWatts = Math.max(50, Math.min(800, Math.round(watts)));

    // 1. FTMS Opcode 0x05: Set Target Power (sint16 in 1W resolution)
    if (this.ftmsControlChar) {
      try {
        const lowByte = clampedWatts & 0xff;
        const highByte = (clampedWatts >> 8) & 0xff;
        const command = new Uint8Array([0x05, lowByte, highByte]);
        await this.sendFtmsCommand(command, `Set ERG Target Power ${clampedWatts} W`);
        return true;
      } catch (err) {
        trainerLogger.log('ERR', 'FTMS_CTRL', `Failed to send FTMS target power: ${String(err)}`);
      }
    }

    // 2. Tacx FE-C Page 49 (0x31 - Target Power in 0.25W units)
    if (this.tacxFecWriteChar) {
      try {
        const rawQuarterWatts = Math.min(16000, Math.round(clampedWatts * 4));
        const lowByte = rawQuarterWatts & 0xff;
        const highByte = (rawQuarterWatts >> 8) & 0xff;
        const fecPayload = this.buildAntFecFrame([0x31, 0xff, 0xff, 0xff, 0xff, 0xff, lowByte, highByte]);
        await this.sendTacxFecFrame(fecPayload, `FE-C Target Power ${clampedWatts} W (raw ${rawQuarterWatts})`);
        return true;
      } catch (fecErr) {
        trainerLogger.log('ERR', 'TACX_FEC', `Failed to send Tacx FE-C target power: ${String(fecErr)}`);
      }
    }

    // Fallback: translate target power into approximate resistance %
    const estimatedPercent = Math.min(95, Math.max(5, Math.round(clampedWatts / 4)));
    return this.setResistancePercent(estimatedPercent);
  }

  /**
   * Trigger FTMS Spin Down Calibration (Opcode 0x13, Param 0x01 Start)
   */
  public async startFtmsSpindown(onEvent?: (evt: FtmsSpindownEvent) => void): Promise<boolean> {
    this.onSpindownCallback = onEvent || null;
    if (!this.ftmsControlChar) {
      return false;
    }
    try {
      const command = new Uint8Array([0x13, 0x01]);
      await this.sendFtmsCommand(command, 'Start FTMS Spin Down Control (0x13 0x01)');
      return true;
    } catch (err) {
      trainerLogger.log('ERR', 'FTMS_CTRL', `Failed to start FTMS Spin Down: ${String(err)}`);
      return false;
    }
  }

  /**
   * Ignore / Cancel FTMS Spin Down Calibration (Opcode 0x13, Param 0x02 Ignore)
   */
  public async stopFtmsSpindown(): Promise<void> {
    this.onSpindownCallback = null;
    if (!this.ftmsControlChar) return;
    try {
      const command = new Uint8Array([0x13, 0x02]);
      await this.sendFtmsCommand(command, 'Stop/Ignore FTMS Spin Down Control (0x13 0x02)');
    } catch {
      // ignore
    }
  }

  private async sendFtmsCommand(command: Uint8Array, label?: string): Promise<void> {
    if (!this.ftmsControlChar) return;
    const hex = dataViewToHex(command);
    trainerLogger.log('TX', 'FTMS_CTRL', label || `FTMS Command 0x${command[0].toString(16)}`, hex);
    const bufferSource = command as unknown as BufferSource;
    try {
      await this.ftmsControlChar.writeValueWithResponse(bufferSource);
    } catch {
      // Fallback for devices supporting only writeValueWithoutResponse
      await this.ftmsControlChar.writeValueWithoutResponse(bufferSource);
    }
  }

  public disconnectHeartRate(): void {
    if (this.hrDevice && this.hrDevice.gatt?.connected) {
      this.hrDevice.gatt.disconnect();
    }
    this.hrDevice = null;
    this.hrChar = null;
    if (this.onHrDisconnectCallback) this.onHrDisconnectCallback();
  }

  public disconnectTrainer(): void {
    if (this.trainerDevice && this.trainerDevice.gatt?.connected) {
      this.trainerDevice.gatt.disconnect();
    }
    this.trainerDevice = null;
    this.clearTrainerChars();
    this.resetTrainerState();
    if (this.onTrainerDisconnectCallback) this.onTrainerDisconnectCallback();
  }

  public disconnectAll(): void {
    this.disconnectHeartRate();
    this.disconnectTrainer();
  }

  public isHeartRateConnected(): boolean {
    return Boolean(this.hrDevice?.gatt?.connected);
  }

  public isTrainerConnected(): boolean {
    return Boolean(this.trainerDevice?.gatt?.connected);
  }
}

export const bluetoothService = new BluetoothManager();
