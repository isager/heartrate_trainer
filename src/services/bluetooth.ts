/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeartRateData, TrainerData } from '../types/workout';

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
  FITNESS_MACHINE_STATUS: '00002ad3-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_FEATURE: '00002acc-0000-1000-8000-00805f9b34fb',
  // CPS Characteristics
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb', // 0x2A63
  // Tacx Legacy FE-C Write
  TACX_FEC_WRITE: '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',
};

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
  private tacxFecWriteChar: BluetoothRemoteGATTCharacteristic | null = null;

  private onHeartRateCallback: ((data: HeartRateData) => void) | null = null;
  private onTrainerDataCallback: ((data: Partial<TrainerData>) => void) | null = null;
  private onHrDisconnectCallback: (() => void) | null = null;
  private onTrainerDisconnectCallback: (() => void) | null = null;

  // Cached state
  private lastReportedWatts: number = 0;
  private lastReportedCadence: number = 0;
  private lastReportedSpeed: number = 0;
  private currentSetResistance: number = 25;

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
      if (this.onHrDisconnectCallback) this.onHrDisconnectCallback();
    });

    if (!device.gatt) throw new Error('Device GATT is null');
    const server = await device.gatt.connect();

    const hrService = await server.getPrimaryService('heart_rate');
    const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
    this.hrChar = hrChar;

    await hrChar.startNotifications();
    hrChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const target = e.target as unknown as { value: DataView };
      if (!target?.value) return;
      const dataView = target.value;
      const parsed = this.parseHeartRateMeasurement(dataView);
      if (this.onHeartRateCallback) {
        this.onHeartRateCallback(parsed);
      }
    });

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

    // Tacx Vortex Smart advertises Fitness Machine (0x1826) and Cycling Power (0x1818),
    // or legacy Tacx FE-C over BLE (6e40fec1-b5a3-f393-e0a9-e50e24dcca9e).
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [BLE_SERVICES.FITNESS_MACHINE] },
        { services: ['fitness_machine'] },
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
        BLE_SERVICES.TACX_FEC_SERVICE,
      ],
    });

    this.trainerDevice = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.ftmsControlChar = null;
      this.indoorBikeChar = null;
      this.tacxFecWriteChar = null;
      if (this.onTrainerDisconnectCallback) this.onTrainerDisconnectCallback();
    });

    if (!device.gatt) throw new Error('Trainer GATT is null');
    const server = await device.gatt.connect();

    // 1. Try standard FTMS service first
    try {
      const ftmsService = await server.getPrimaryService(BLE_SERVICES.FITNESS_MACHINE);
      
      // Control Point for resistance and ERG target watts
      try {
        const controlPoint = await ftmsService.getCharacteristic(BLE_CHARS.FITNESS_MACHINE_CONTROL_POINT);
        this.ftmsControlChar = controlPoint;
        
        // Request Control Opcode: 0x00
        await this.sendFtmsCommand(new Uint8Array([0x00]));
      } catch (cpErr) {
        console.warn('FTMS control point not directly accessible:', cpErr);
      }

      // Indoor Bike Data for live Speed, Cadence, Power
      try {
        const bikeDataChar = await ftmsService.getCharacteristic(BLE_CHARS.INDOOR_BIKE_DATA);
        this.indoorBikeChar = bikeDataChar;
        await bikeDataChar.startNotifications();
        bikeDataChar.addEventListener('characteristicvaluechanged', (e: Event) => {
          const target = e.target as unknown as { value: DataView };
          if (!target?.value) return;
          this.parseIndoorBikeData(target.value);
        });
      } catch (ibErr) {
        console.warn('Indoor bike data char not available:', ibErr);
      }
    } catch {
      console.log('FTMS standard service not found, trying Tacx FE-C / Cycling Power...');
    }

    // 2. If FTMS control point wasn't acquired, try Tacx FE-C legacy service
    if (!this.ftmsControlChar) {
      try {
        const tacxFecService = await server.getPrimaryService(BLE_SERVICES.TACX_FEC_SERVICE);
        const writeChar = await tacxFecService.getCharacteristic(BLE_CHARS.TACX_FEC_WRITE);
        this.tacxFecWriteChar = writeChar;
      } catch (fecErr) {
        console.log('Tacx FE-C service unavailable:', fecErr);
      }
    }

    return device.name || 'Tacx Vortex Smart Trainer';
  }

  /**
   * Parse FTMS Indoor Bike Data (0x2AD2)
   */
  private parseIndoorBikeData(value: DataView) {
    let offset = 2; // Flags is 16-bit
    const flags = value.getUint16(0, true);

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

    // Instantaneous Speed: uint16 in 0.01 km/h
    if (!moreData && offset + 2 <= value.byteLength) {
      const rawSpeed = value.getUint16(offset, true);
      speedKmh = Math.round((rawSpeed * 0.01) * 10) / 10;
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
    if (resistancePresent && offset + 2 <= value.byteLength) offset += 2;

    // Instantaneous Power: sint16 in watts
    if (instPowerPresent && offset + 2 <= value.byteLength) {
      powerWatts = value.getInt16(offset, true);
      offset += 2;
    }

    this.lastReportedSpeed = speedKmh;
    this.lastReportedCadence = cadenceRpm;
    this.lastReportedWatts = powerWatts;

    if (this.onTrainerDataCallback) {
      this.onTrainerDataCallback({
        speedKmh,
        cadenceRpm,
        powerWatts,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Set Tacx Vortex resistance level (0 to 100%)
   */
  public async setResistancePercent(percent: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.currentSetResistance = clamped;

    // 1. FTMS Set Target Resistance Level: Opcode 0x04
    // Param: sint8 in units of 0.1 resistance level (or 0-100)
    if (this.ftmsControlChar) {
      try {
        // FTMS expects opcode 0x04 followed by resistance level (unit 0.1)
        // For wheel-on trainers like Tacx Vortex, 0 to 100 translates to 0..100 (or 0..200 0.5 increments)
        const resistanceValue = Math.min(200, Math.round(clamped * 2)); // 0.5 step
        const command = new Uint8Array([0x04, resistanceValue]);
        await this.sendFtmsCommand(command);
        return true;
      } catch (err) {
        console.warn('Failed to send FTMS resistance:', err);
      }
    }

    // 2. Tacx FE-C over BLE: Page 48 (Basic Resistance)
    if (this.tacxFecWriteChar) {
      try {
        // Page 48: [SYNC, LENGTH=8, MSG_ID=0x4E, CHANNEL, PAGE=0x48, FF, FF, FF, FF, FF, FF, RESISTANCE (0-200)]
        const rawRes = Math.min(200, Math.round((clamped / 100) * 200));
        const fecPayload = new Uint8Array([0xa4, 0x09, 0x4f, 0x05, 0x30, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, rawRes, 0x00]);
        await this.tacxFecWriteChar.writeValueWithoutResponse(fecPayload as unknown as BufferSource);
        return true;
      } catch (fecErr) {
        console.warn('Failed to send Tacx FEC resistance:', fecErr);
      }
    }

    return false;
  }

  /**
   * Set Tacx Vortex Target Power in ERG mode (Watts)
   */
  public async setTargetPowerWatts(watts: number): Promise<boolean> {
    const clampedWatts = Math.max(50, Math.min(800, Math.round(watts)));

    // FTMS Opcode 0x05: Set Target Power (sint16 in 1W resolution)
    if (this.ftmsControlChar) {
      try {
        const lowByte = clampedWatts & 0xff;
        const highByte = (clampedWatts >> 8) & 0xff;
        const command = new Uint8Array([0x05, lowByte, highByte]);
        await this.sendFtmsCommand(command);
        return true;
      } catch (err) {
        console.warn('Failed to send FTMS target power:', err);
      }
    }

    // Fallback: translate target power into approximate resistance %
    const estimatedPercent = Math.min(95, Math.max(5, Math.round(clampedWatts / 4)));
    return this.setResistancePercent(estimatedPercent);
  }

  private async sendFtmsCommand(command: Uint8Array): Promise<void> {
    if (!this.ftmsControlChar) return;
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
    this.ftmsControlChar = null;
    this.indoorBikeChar = null;
    this.tacxFecWriteChar = null;
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
