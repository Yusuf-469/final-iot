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
    const devices = [];

    // Read devices from RTDB /devices/ path
    const devicesRef = db.ref('devices');
    const devicesSnapshot = await devicesRef.once('value');
    const devicesData = devicesSnapshot.val() || {};

    console.log('Devices data from RTDB:', Object.keys(devicesData));

    // Process each device from RTDB
    for (const [deviceId, deviceData] of Object.entries(devicesData)) {
      const deviceStatus = resolveDeviceStatus(deviceData);

      devices.push({
        id: deviceId,
        deviceId: deviceId,
        name: deviceData.name || `${deviceId} Device`,
        type: deviceData.type || 'ESP32',
        status: deviceStatus,
        heartRate: deviceData.heartRate || null,
        temperature: deviceData.temperature || null,
        spo2: deviceData.spo2 || null,
        updatedAt: deviceData.updatedAt || deviceData.timestamp || null,
        firmware: deviceData.firmware || '1.0.0',
        battery: deviceData.battery || deviceData.power?.batteryLevel || 100
      });
    }

    // If no devices in RTDB, try to extract from health data in RTDB
    if (devices.length === 0) {
      console.log('No devices in /devices/, checking /health/ for device data');

      for (const nodeId of ['health']) {
        try {
          const snap = await db.ref(nodeId).once('value');
          const data = snap.val();

          if (data) {
            const deviceStatus = resolveDeviceStatus(data);

            devices.push({
              id: nodeId,
              deviceId: nodeId,
              name: `${nodeId.charAt(0).toUpperCase() + nodeId.slice(1)} Device`,
              type: 'ESP32',
              status: deviceStatus,
              heartRate: data.heartRate || null,
              temperature: data.temperature || null,
              spo2: data.spo2 || null,
              updatedAt: data.updatedAt || data.timestamp || null,
              firmware: data.firmware || '1.0.0',
              battery: data.battery || data.power?.batteryLevel || 100
            });

            console.log(`Found device ${nodeId} in /${nodeId}/`);
          }
        } catch (nodeError) {
          console.warn(`Could not read device node /${nodeId}:`, nodeError.message);
        }
      }
    }

    console.log(`Returning ${devices.length} devices`);
    res.status(200).json({ success: true, data: devices });

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
