# VortexHR

A web application that controls a **Tacx Vortex Smart** cycling trainer in real time using live heart rate data from a Bluetooth heart rate monitor or broadcasting Garmin watch.

## Features

- **Closed-Loop Cardiac Resistance Control**: Dynamically adjusts trainer resistance (FTMS `0x1826` / Tacx FE-C) to hold your target heart rate zone, with configurable deadband, responsiveness, and emergency max-HR safety cutback.
- **Structured Workouts & Custom Builder**: Includes preset Endurance, Threshold, Tempo, and Recovery workouts plus a custom interval builder and live handlebar-friendly mobile HUD.
- **Auto-Calibration & Data Log**: Guided coast-down **Spindown Calibration** wizard, watch speed ratio matching, and a live **Trainer Communication Log** (raw hex TX/RX packets with CSV/JSON export).
- **Garmin Watch Integration**: Supports Garmin wrist HR broadcast over BLE as well as `.TCX` and `.CSV` workout import/export.
- **Built-in Simulator**: Test workouts, calibration, and closed-loop heart rate regulation without physical hardware connected.

## Browser Requirements

Web Bluetooth is required for pairing physical hardware:
- **Desktop**: Chrome or Edge
- **Mobile**: Chrome on Android, or **Bluefy** browser on iOS

> **Note**: Web Bluetooth requires HTTPS and top-level window access (GitHub Pages works out of the box).

## Local Development

```bash
npm install --legacy-peer-deps
npm run dev
```

Build for production:

```bash
npm run build
```

## GitHub Pages Deployment

This repository includes `.github/workflows/deploy.yml` for automatic static deployment:

1. Push to `main` (or `master`).
2. Open **Settings → Pages** in your GitHub repository.
3. Set **Source** to **GitHub Actions**.
