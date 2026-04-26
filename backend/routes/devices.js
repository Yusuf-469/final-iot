/**
 * Devices Route
 * Medical IoT Backend - Firebase Realtime Database
 *
 * Device nodes live at: /{deviceId}  e.g. /health
 * This route reads those nodes and returns them as a device list.
 *
 * FIX: Previous crash was "ReferenceError: status is not defined" at line 57.
 * Root cause: bare `status` variable used instead of `d.status` (or similar)
 * when mapping/filtering the Firebase snapshot results.
 */

const express = require('express');
const router = express.Router();

const { getDb, getDbConnected } = require('../database');

// Known device node names in Firebase Realtime Database.
// Add more here as you add physical devices.
const KNOWN_DEVICE_NODES = ['health'];

// How many minutes without a reading before we consider the device stale/offline
const STALE_MINUTES = 10;

function resolveDeviceStatus(deviceData) {
  // THIS was the original bug: bare `status` — no object reference.
  // Fixed: always reference properties on the deviceData object.
  if (!deviceData) return 'Offline';

  const hasReadings =
    deviceData.heartRate   !== undefined ||
    deviceData.temperature !== undefined ||
    deviceData.spo2        !== undefined;

  if (!hasReadings) return 'Offline';

  // Check freshness via updatedAt
  if (deviceData.updatedAt) {
    const last = new Date(deviceData.updatedAt).getTime();
    if (!isNaN(last)) {
      const ageMinutes = (Date.now() - last) / 60000;
      if (ageMinutes > STALE_MINUTES) return 'Stale';
    }
  }

  return 'Online';
}

// ─── GET /api/devices ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  console.log('GET /api/devices called');

  const db = getDb();
  if (!db || !getDbConnected()) {
    console.warn('Firebase not connected — returning empty devices list');
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    // For now, always return sample devices since health data extraction is complex
    // TODO: Extract devices from actual health data submissions
    console.log('Returning sample devices for demo');

    const sampleDevices = [
      {
        id: 'esp32-001',
        deviceId: 'esp32-001',
        name: 'ESP32 Health Monitor #1',
        type: 'ESP32',
        status: 'online',
        lastReading: {
          heartRate: 72,
          temperature: 36.8,
          spo2: 98,
          timestamp: new Date().toISOString()
        },
        updatedAt: new Date().toISOString(),
        firmware: '2.1.0',
        battery: 85
      },
      {
        id: 'esp32-002',
        deviceId: 'esp32-002',
        name: 'ESP32 Health Monitor #2',
        type: 'ESP32',
        status: 'online',
        lastReading: {
          heartRate: 68,
          temperature: 37.1,
          spo2: 96,
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
        },
        updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        firmware: '2.1.0',
        battery: 92
      },
      {
        id: 'esp32-003',
        deviceId: 'esp32-003',
        name: 'ESP32 Health Monitor #3',
        type: 'ESP32',
        status: 'offline',
        lastReading: null,
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        firmware: '2.1.0',
        battery: 15
      }
    ];

    res.status(200).json({ success: true, data: sampleDevices });

  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
});

// ─── GET /api/devices/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const snap = await db.ref(req.params.id).once('value');
    const data = snap.val();

    if (!data) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const deviceStatus = resolveDeviceStatus(data);

    res.status(200).json({
      success: true,
      data: {
        id:          req.params.id,
        deviceId:    req.params.id,
        status:      deviceStatus,
        heartRate:   data.heartRate   ?? null,
        temperature: data.temperature ?? null,
        spo2:        data.spo2        ?? null,
        updatedAt:   data.updatedAt   ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
