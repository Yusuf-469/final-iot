/**
 * Patients Route
 * Medical IoT Backend - Firebase Realtime Database
 *
 * Patient records live at: /patients/{id}
 * Live sensor data lives at: /health  (the ESP32 device node)
 *
 * This route ONLY manages patient records.
 * Merging with live device readings is done on the frontend
 * (or in GET /api/patients below, for convenience).
 */

const express = require('express');
const router = express.Router();

// Always pull db via getDb() so we get the live reference, not a cached null
const { getDb, getDbConnected } = require('../database');

// ─── Thresholds used for Stable / Poor / Bad ────────────────────────────────
//  Heart Rate : 60–100 BPM  → outside = 1 issue
//  Temperature: 36.1–37.5 °C → outside = 1 issue
//  SpO2       : ≥ 95 %       → below   = 1 issue
//
//  0 issues → Stable
//  1 issue  → Poor
//  2+ issues → Bad
// ────────────────────────────────────────────────────────────────────────────

function calculateCondition(hr, temp, spo2) {
  if (!hr && !temp && !spo2) return 'Unknown';

  let issues = 0;

  const hrN = parseFloat(hr);
  if (!isNaN(hrN) && (hrN < 60 || hrN > 100)) issues++;

  // Sensor may send Kelvin; convert if > 100
  const tempRaw = parseFloat(temp);
  const tempC = !isNaN(tempRaw) ? (tempRaw > 100 ? tempRaw - 273.15 : tempRaw) : null;
  if (tempC !== null && (tempC < 36.1 || tempC > 37.5)) issues++;

  const spo2N = parseFloat(spo2);
  if (!isNaN(spo2N) && spo2N < 95) issues++;

  if (issues === 0) return 'Stable';
  if (issues === 1) return 'Poor';
  return 'Bad';
}

function isDeviceOnline(updatedAt, staleMinutes = 10) {
  if (!updatedAt) return false;
  const last = new Date(updatedAt).getTime();
  if (isNaN(last)) return false;
  return Date.now() - last < staleMinutes * 60 * 1000;
}

// ─── GET /api/patients ───────────────────────────────────────────────────────
// Returns all patient records merged with live device readings.
router.get('/', async (req, res) => {
  console.log('🚀 GET /api/patients called');
  console.log('📋 Query params:', { limit: req.query.limit, skip: req.query.skip });
  console.log('🌐 Environment:', { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV });

  const db = getDb();
  const dbConnected = getDbConnected();

  console.log('💾 Database status:', { db: !!db, dbConnected });

  if (!db || !dbConnected) {
    console.warn('⚠️  Firebase not connected — returning empty patients list');
    return res.status(200).json({
      success: true,
      data: [],
      message: 'Database unavailable',
      debug: { db: !!db, dbConnected, environment: process.env.NODE_ENV }
    });
  }

  try {
    // 1. Fetch all patient records
    const patientsSnap = await db.ref('patients').once('value');
    const patientsRaw = patientsSnap.val();

    // Firebase returns null if the node is empty
    if (!patientsRaw) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Convert Firebase object → array  (this was the likely crash point)
    const patientsList = Object.entries(patientsRaw).map(([id, data]) => ({
      id,
      ...data,
    }));

    console.log('Patients collection ref: available');

    // 2. Fetch the live health device node once (for server-side merge)
    let liveHealth = {};
    try {
      const healthSnap = await db.ref('health').once('value');
      liveHealth = healthSnap.val() || {};
    } catch (e) {
      console.warn('Could not read /health node:', e.message);
    }

    // 3. Merge patient records with device readings
    const merged = patientsList.map(patient => {
      const result = { ...patient };

      if (patient.deviceId && patient.deviceId === 'health') {
        // Pull live readings from the linked device node
        result.heartRate    = liveHealth.heartRate    ?? null;
        result.temperature  = liveHealth.temperature  ?? null;
        result.spo2         = liveHealth.spo2         ?? null;

        // Device status: Online if data exists and is fresh (within 10 min)
        const hasData = result.heartRate !== null || result.temperature !== null || result.spo2 !== null;
        const fresh   = isDeviceOnline(liveHealth.updatedAt, 10);
        result.deviceStatus = hasData && fresh ? 'Online' : (hasData ? 'Stale' : 'Offline');

        // Condition label
        result.actionStatus = calculateCondition(result.heartRate, result.temperature, result.spo2);

      } else if (patient.deviceId) {
        // Future: fetch from /devices/{patient.deviceId} node
        result.heartRate    = null;
        result.temperature  = null;
        result.spo2         = null;
        result.deviceStatus = 'Unknown';
        result.actionStatus = 'Unknown';
      } else {
        result.deviceStatus = 'Offline';
        result.actionStatus = 'Unknown';
      }

      return result;
    });

    res.status(200).json({ success: true, data: merged });

  } catch (error) {
    console.error('Error fetching patients:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Failed to fetch patients', details: error.message });
  }
});

// ─── POST /api/patients ──────────────────────────────────────────────────────
// Creates a new patient record in Firebase.
router.post('/', async (req, res) => {
  console.log('🚀 POST /api/patients called');
  console.log('📋 Request body:', req.body);
  console.log('📄 Content-Type:', req.headers['content-type']);
  console.log('🌐 Environment:', { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV });

  try {
    const db = getDb();
    const dbConnected = getDbConnected();
    console.log('💾 Database status:', { db: !!db, dbConnected });

    if (!db || !dbConnected) {
      console.error('❌ Database not available for POST operation');
      return res.status(503).json({
        success: false,
        error: 'Database unavailable',
        debug: { db: !!db, dbConnected, environment: process.env.NODE_ENV }
      });
    }

    const { firstName, lastName, age, deviceId } = req.body;
    console.log('Parsed data:', { firstName, lastName, age, deviceId });

    // Validation
    if (!firstName) {
      console.log('Validation failed: firstName missing');
      return res.status(400).json({ success: false, error: 'firstName is required' });
    }
    if (age === undefined || age === null || isNaN(parseInt(age))) {
      console.log('Validation failed: age invalid');
      return res.status(400).json({ success: false, error: 'Valid age is required' });
    }

    const patientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    console.log('Generated patientId:', patientId);

    const patientData = {
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : '',
      age: parseInt(age),
      deviceId: deviceId || null,
      status: 'offline',        // device status default
      createdAt: now,
      updatedAt: now,
    };

    console.log('About to save patient data to Firebase');
    await db.ref(`patients/${patientId}`).set(patientData);
    console.log('Patient saved successfully to Firebase');

    const response = {
      success: true,
      data: { id: patientId, ...patientData },
    };
    console.log('Sending response:', response);

    res.status(201).json(response);

  } catch (error) {
    console.error('Error in POST /api/patients:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Failed to save patient', details: error.message });
  }
});

// ─── GET /api/patients/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const snap = await db.ref(`patients/${req.params.id}`).once('value');
    const data = snap.val();
    if (!data) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    res.status(200).json({ success: true, data: { id: req.params.id, ...data } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/patients/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await db.ref(`patients/${req.params.id}`).update(updates);
    res.status(200).json({ success: true, data: { id: req.params.id, ...updates } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/patients/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    await db.ref(`patients/${req.params.id}`).remove();
    res.status(200).json({ success: true, message: 'Patient deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/patients/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const snap = await db.ref(`patients/${req.params.id}`).once('value');
    const data = snap.val();
    if (!data) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    res.status(200).json({ success: true, data: { id: req.params.id, ...data } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/patients/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await db.ref(`patients/${req.params.id}`).update(updates);
    res.status(200).json({ success: true, data: { id: req.params.id, ...updates } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/patients/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  try {
    await db.ref(`patients/${req.params.id}`).remove();
    res.status(200).json({ success: true, message: 'Patient deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
