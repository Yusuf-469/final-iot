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
  console.log('GET /api/patients called');
  console.log('Query params:', { limit: req.query.limit, skip: req.query.skip });

  const db = getDb();
  if (!db || !getDbConnected()) {
    console.warn('Firebase not connected — returning empty patients list');
    return res.status(200).json({ success: true, data: [], message: 'Database unavailable' });
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
  console.log('POST /api/patients called');
  console.log('Request body:', req.body);
  console.log('Content-Type:', req.headers['content-type']);

  const db = getDb();
  if (!db || !getDbConnected()) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const { firstName, lastName, age, deviceId } = req.body;

  // Validation
  if (!firstName || !lastName) {
    return res.status(400).json({ success: false, error: 'firstName and lastName are required' });
  }
  if (age === undefined || age === null || isNaN(parseInt(age))) {
    return res.status(400).json({ success: false, error: 'Valid age is required' });
  }

  const patientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  const patientData = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    age: parseInt(age),
    deviceId: deviceId || null,
    status: 'offline',        // device status default
    createdAt: now,
    updatedAt: now,
  };

  try {
    console.log('Saving patient data:', patientId, patientData);
    await db.ref(`patients/${patientId}`).set(patientData);
    console.log('Patient saved successfully:', patientId);

    res.status(201).json({
      success: true,
      data: { id: patientId, ...patientData },
    });

  } catch (error) {
    console.error('Error saving patient:', error.message, error.stack);
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

// GET /api/patients/stats - Get patient statistics
router.get('/stats', async (req, res) => {
  try {
    const patientsRef = collection(COLLECTIONS.PATIENTS);

    if (!patientsRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientsRef.once('value');
    const patientsData = snapshot.val() || {};

    const statusCounts = {};
    const ageGroups = {
      under_18: 0,
      '18-40': 0,
      '40-60': 0,
      '60+': 0
    };

    Object.values(patientsData).forEach(data => {
      // Count by status
      const status = data.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      // Count by age group
      if (data.dateOfBirth) {
        const birthDate = data.dateOfBirth.toDate();
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        if (age < 18) ageGroups.under_18++;
        else if (age < 40) ageGroups['18-40']++;
        else if (age < 60) ageGroups['40-60']++;
        else ageGroups['60+']++;
      }
    });
    
    res.json({
      statusCounts: Object.entries(statusCounts).map(([_id, count]) => ({ _id, count })),
      ageGroups: Object.entries(ageGroups).map(([_id, count]) => ({ _id, count }))
    });
  } catch (error) {
    logger.error('Error fetching patient stats:', error);
    res.status(500).json({ error: 'Failed to fetch patient statistics' });
  }
});

// GET /api/patients/:patientId - Get single patient
router.get('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const patientRef = collection(`${COLLECTIONS.PATIENTS}/${patientId}`);
    if (!patientRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientRef.once('value');
    const patientData = snapshot.val();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Format patient data
    const formattedPatient = formatPatientData(patientId, patientData);

    // Get devices for this patient (simplified - in Realtime DB we can't query by patientId easily)
    const devicesRef = collection(COLLECTIONS.DEVICES);
    const devicesSnapshot = await devicesRef.once('value');
    const allDevices = devicesSnapshot.val() || {};

    const devices = Object.keys(allDevices)
      .filter(key => allDevices[key].patientId === patientId)
      .map(key => ({
        id: key,
        ...allDevices[key]
      }));

    // Get recent health data (simplified - last 10 readings)
    const healthDataRef = collection(COLLECTIONS.HEALTH_DATA);
    const healthSnapshot = await healthDataRef.once('value');
    const allHealthData = healthSnapshot.val() || {};

    const recentData = Object.keys(allHealthData)
      .filter(key => allHealthData[key].patientId === patientId)
      .sort((a, b) => new Date(allHealthData[b].timestamp || 0) - new Date(allHealthData[a].timestamp || 0))
      .slice(0, 10)
      .map(key => ({
        id: key,
        ...allHealthData[key]
      }));

    res.json({
      patient: formattedPatient,
      devices,
      recentData
    });
    healthDataSnapshot.forEach(dataDoc => {
      recentData.push({
        id: dataDoc.id,
        ...dataDoc.data(),
        timestamp: dataDoc.data().timestamp ? dataDoc.data().timestamp.toDate().toISOString() : null
      });
    });
    
    res.json({
      patient: patientData,
      devices,
      recentData
    });
  } catch (error) {
    logger.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// POST /api/patients - Create new patient
router.post('/', async (req, res) => {
  console.log('POST /api/patients called with body:', req.body);
  try {
    const { firstName, lastName, age, deviceId } = req.body;

    if (!firstName || !lastName || !age || !deviceId) {
      console.error('Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'firstName, lastName, age, and deviceId are required'
      });
    }

    const patientsRef = collection(COLLECTIONS.PATIENTS);
    console.log('Patients collection ref:', patientsRef ? 'available' : 'null');

    if (!patientsRef) {
      console.error('Patients collection not available');
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    // Generate patient ID
    const patientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    console.log('Generated patient ID:', patientId);

    // Patient data
    const patientData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      age: parseInt(age),
      deviceId: deviceId.trim(),
      status: 'offline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('Saving patient data:', patientData);

    // Save to database
    await patientsRef.child(patientId).set(patientData);
    console.log('Patient saved successfully');

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      id: patientId
    });
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ success: false, error: 'Failed to create patient: ' + error.message });
  }
});

// PUT /api/patients/:patientId - Update patient
router.put('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const updates = req.body;

    // Check if patient exists
    const patientRef = collection(`${COLLECTIONS.PATIENTS}/${patientId}`);
    if (!patientRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Get current data and merge updates
    const currentData = snapshot.val();
    const updatedData = {
      ...currentData,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Save to Realtime Database
    await patientRef.set(updatedData);

    res.json({
      success: true,
      patient: {
        id: patientId,
        ...updatedData
      }
    });
  } catch (error) {
    logger.error('Error updating patient:', error);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// PUT /api/patients/:patientId/status - Update patient status
router.put('/:patientId/status', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'inactive', 'critical', 'discharged'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const docRef = db.collection(COLLECTIONS.PATIENTS).doc(patientId);
    // Check if patient exists
    const patientRef = collection(`${COLLECTIONS.PATIENTS}/${patientId}`);
    if (!patientRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Update status
    const currentData = snapshot.val();
    const updatedData = {
      ...currentData,
      status,
      updatedAt: new Date().toISOString()
    };

    await patientRef.set(updatedData);

    res.json({
      success: true,
      patient: {
        id: patientId,
        ...updatedData
      }
    });
  } catch (error) {
    logger.error('Error updating patient status:', error);
    res.status(500).json({ error: 'Failed to update patient status' });
  }
});

// DELETE /api/patients/:patientId - Delete patient
router.delete('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    // Check if patient exists
    const patientRef = collection(`${COLLECTIONS.PATIENTS}/${patientId}`);
    if (!patientRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Delete patient data
    await patientRef.remove();

    res.json({
      success: true,
      message: 'Patient deleted'
    });
  } catch (error) {
    logger.error('Error deleting patient:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;
