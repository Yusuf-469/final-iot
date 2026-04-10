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

  console.log('Devices collection ref: available');

  try {
    const devices = [];

    for (const nodeId of KNOWN_DEVICE_NODES) {
      try {
        const snap = await db.ref(nodeId).once('value');
        const data = snap.val();

        // data will be null if the node doesn't exist yet — that's fine
        const deviceStatus = resolveDeviceStatus(data); // ← FIXED: was `status` (bare var)

        devices.push({
          id:          nodeId,
          deviceId:    nodeId,
          name:        nodeId.charAt(0).toUpperCase() + nodeId.slice(1) + ' Device',
          type:        'ESP32',
          status:      deviceStatus,          // ← FIXED: use resolved value, not bare `status`
          heartRate:   data?.heartRate   ?? null,
          temperature: data?.temperature ?? null,
          spo2:        data?.spo2        ?? null,
          updatedAt:   data?.updatedAt   ?? null,
          firmware:    data?.firmware    ?? '1.0.0',
        });
      } catch (nodeError) {
        console.warn(`Could not read device node /${nodeId}:`, nodeError.message);
        // Push a placeholder so the frontend still sees the device
        devices.push({
          id:       nodeId,
          deviceId: nodeId,
          name:     nodeId + ' Device',
          type:     'ESP32',
          status:   'Offline',
        });
      }
    }

    res.status(200).json({ success: true, data: devices });

  } catch (error) {
    console.error('Error fetching devices:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Failed to fetch devices', details: error.message });
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
