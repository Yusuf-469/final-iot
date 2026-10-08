/**
 * Health Data Routes - Realtime Database Version
 * Medical IoT Backend - Health monitoring data endpoints
 *
 * Readings are stored at /healthData/{pushId} as flat numbers:
 *   { patientId, deviceId, heartRate, temperature, spo2, bloodPressure, status, alerts, timestamp, createdAt }
 * Each new reading also refreshes the live /health node the dashboard listens to.
 */

const express = require('express');
const router = express.Router();
const { getDb, COLLECTIONS } = require('../database');
const { validateHealthData, assessHealthStatus } = require('../models/HealthData');
const { logger } = require('../utils/logger');

const PERIODS_MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

// Devices send plain numbers; older clients send { value, unit }. Accept both.
const toNumber = (v) => {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'object' ? Number(v.value) : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeReading = (body, defaults = {}) => {
  const reading = {
    patientId: String(body.patientId || defaults.patientId || '').trim(),
    deviceId: String(body.deviceId || defaults.deviceId || '').trim(),
    heartRate: toNumber(body.heartRate),
    temperature: toNumber(body.temperature),
    spo2: toNumber(body.spo2)
  };
  if (body.bloodPressure) {
    reading.bloodPressure = {
      systolic: toNumber(body.bloodPressure.systolic),
      diastolic: toNumber(body.bloodPressure.diastolic)
    };
  }
  const ts = body.timestamp ? new Date(body.timestamp).getTime() : Date.now();
  reading.timestamp = Number.isFinite(ts) ? ts : Date.now();
  return reading;
};

// The model helpers expect { value } wrappers
const asModelShape = (r) => ({
  patientId: r.patientId,
  deviceId: r.deviceId,
  heartRate: r.heartRate !== undefined ? { value: r.heartRate } : undefined,
  temperature: r.temperature !== undefined ? { value: r.temperature } : undefined,
  spo2: r.spo2 !== undefined ? { value: r.spo2 } : undefined,
  bloodPressure: r.bloodPressure
});

// Strip undefined values - Realtime Database rejects them
const clean = (obj) => JSON.parse(JSON.stringify(obj));

const getReadings = async (patientId, period) => {
  const db = getDb();
  if (!db) return null;

  const snapshot = await db.ref(COLLECTIONS.HEALTH_DATA)
    .orderByChild('patientId').equalTo(patientId).once('value');

  const since = period ? Date.now() - (PERIODS_MS[period] || PERIODS_MS['24h']) : 0;
  return Object.entries(snapshot.val() || {})
    .map(([id, data]) => ({ id, ...data }))
    .filter(r => (r.timestamp || 0) >= since)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
};

const stats = (values) => {
  const nums = values.filter(v => typeof v === 'number');
  if (!nums.length) return { average: 0, min: 0, max: 0 };
  return {
    average: Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10,
    min: Math.min(...nums),
    max: Math.max(...nums)
  };
};

const saveReading = async (db, reading) => {
  const validation = validateHealthData(asModelShape(reading));
  if (!validation.isValid) {
    return { error: validation.errors[0] };
  }

  const { status, alerts } = assessHealthStatus(asModelShape(reading));
  const record = clean({ ...reading, status, alerts, createdAt: new Date().toISOString() });

  const ref = db.ref(COLLECTIONS.HEALTH_DATA).push();
  await ref.set(record);
  return { record: { id: ref.key, ...record } };
};

// GET /api/health-data/:patientId - readings for a patient (newest first)
router.get('/:patientId', async (req, res) => {
  try {
    const { limit = 100, skip = 0, period } = req.query;
    const readings = await getReadings(req.params.patientId, period);
    if (!readings) return res.status(503).json({ error: 'Database unavailable' });

    const limitNum = Math.min(parseInt(limit) || 100, 1000);
    const skipNum = parseInt(skip) || 0;

    res.json({
      data: readings.slice(skipNum, skipNum + limitNum),
      pagination: { total: readings.length, limit: limitNum, skip: skipNum }
    });
  } catch (error) {
    logger.error('Error fetching health data:', error);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

// GET /api/health-data/:patientId/latest - most recent reading
router.get('/:patientId/latest', async (req, res) => {
  try {
    const readings = await getReadings(req.params.patientId);
    if (!readings) return res.status(503).json({ error: 'Database unavailable' });
    if (!readings.length) return res.status(404).json({ error: 'No health data found' });
    res.json(readings[0]);
  } catch (error) {
    logger.error('Error fetching latest reading:', error);
    res.status(500).json({ error: 'Failed to fetch latest reading' });
  }
});

// GET /api/health-data/:patientId/summary - aggregate stats for a period
router.get('/:patientId/summary', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    const readings = await getReadings(req.params.patientId, period);
    if (!readings) return res.status(503).json({ error: 'Database unavailable' });

    const statusCounts = { normal: 0, warning: 0, critical: 0 };
    readings.forEach(r => { statusCounts[r.status || 'normal'] = (statusCounts[r.status || 'normal'] || 0) + 1; });

    const sys = stats(readings.map(r => r.bloodPressure?.systolic));
    const dia = stats(readings.map(r => r.bloodPressure?.diastolic));

    res.json({
      period,
      summary: {
        readings: readings.length,
        heartRate: stats(readings.map(r => r.heartRate)),
        temperature: stats(readings.map(r => r.temperature)),
        spo2: stats(readings.map(r => r.spo2)),
        bloodPressure: { systolic: Math.round(sys.average), diastolic: Math.round(dia.average) },
        status: statusCounts
      }
    });
  } catch (error) {
    logger.error('Error fetching health summary:', error);
    res.status(500).json({ error: 'Failed to fetch health summary' });
  }
});

// POST /api/health-data - submit one reading (used by the ESP32)
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const reading = normalizeReading(req.body);
    if (!reading.patientId) return res.status(400).json({ error: 'Patient ID is required' });
    if (!reading.deviceId) return res.status(400).json({ error: 'Device ID is required' });

    const { record, error } = await saveReading(db, reading);
    if (error) return res.status(400).json({ error });

    // Keep the live node the dashboard subscribes to in sync
    await db.ref('health').update(clean({
      heartRate: record.heartRate,
      temperature: record.temperature,
      spo2: record.spo2,
      bloodPressure: record.bloodPressure,
      patientId: record.patientId,
      deviceId: record.deviceId,
      status: record.status,
      updatedAt: new Date(record.timestamp).toISOString()
    }));

    res.status(201).json(record);
  } catch (error) {
    logger.error('Error submitting health data:', error);
    res.status(500).json({ error: 'Failed to submit health data' });
  }
});

// POST /api/health-data/bulk - submit multiple readings
router.post('/bulk', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { patientId, deviceId, readings } = req.body;
    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'No readings provided' });
    }
    if (!patientId) return res.status(400).json({ error: 'Patient ID is required' });
    if (!deviceId) return res.status(400).json({ error: 'Device ID is required' });
    if (readings.length > 500) return res.status(400).json({ error: 'Maximum 500 readings per request' });

    const inserted = [];
    let skipped = 0;
    for (const raw of readings) {
      const { record, error } = await saveReading(db, normalizeReading(raw, { patientId, deviceId }));
      if (error) {
        skipped++;
        logger.warn(`Invalid health reading skipped: ${error}`);
      } else {
        inserted.push(record);
      }
    }

    res.status(201).json({ success: true, inserted: inserted.length, skipped, data: inserted });
  } catch (error) {
    logger.error('Error bulk inserting health data:', error);
    res.status(500).json({ error: 'Failed to bulk insert health data' });
  }
});

module.exports = router;
