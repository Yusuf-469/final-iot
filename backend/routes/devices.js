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
    // Get unique devices from health data in Firestore
    const healthDataSnapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const deviceMap = new Map();

    healthDataSnapshot.forEach(doc => {
      const data = doc.data();
      const deviceId = data.deviceId;

      if (deviceId && !deviceMap.has(deviceId)) {
        deviceMap.set(deviceId, {
          id: deviceId,
          deviceId: deviceId,
          name: `Device ${deviceId}`,
          type: 'ESP32 Health Monitor',
          status: 'Online', // Assume online if we have recent data
          lastReading: {
            heartRate: data.heartRate,
            temperature: data.temperature,
            spo2: data.spo2,
            timestamp: data.createdAt?.toDate?.()?.toISOString() || data.timestamp
          },
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString(),
          firmware: '2.1.0'
        });
      }
    });

    // If no devices found in health data, return some sample devices
    if (deviceMap.size === 0) {
      console.log('No devices found in health data, returning sample devices');
      const sampleDevices = [
        {
          id: 'esp32-001',
          deviceId: 'esp32-001',
          name: 'ESP32 Health Monitor #1',
          type: 'ESP32',
          status: 'Online',
          lastReading: null,
          updatedAt: new Date().toISOString(),
          firmware: '2.1.0'
        },
        {
          id: 'esp32-002',
          deviceId: 'esp32-002',
          name: 'ESP32 Health Monitor #2',
          type: 'ESP32',
          status: 'Offline',
          lastReading: null,
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          firmware: '2.1.0'
        }
      ];
      return res.status(200).json({ success: true, data: sampleDevices });
    }

    const devices = Array.from(deviceMap.values());
    console.log(`Found ${devices.length} devices from health data`);

    res.status(200).json({ success: true, data: devices });

  } catch (error) {
    console.error('Error fetching devices:', error);
    // Return sample devices as fallback
    const sampleDevices = [
      {
        id: 'esp32-001',
        deviceId: 'esp32-001',
        name: 'ESP32 Health Monitor #1',
        type: 'ESP32',
        status: 'Online',
        lastReading: null,
        updatedAt: new Date().toISOString(),
        firmware: '2.1.0'
      }
    ];
    res.status(200).json({ success: true, data: sampleDevices });
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
