/**
 * Patients Routes - Realtime Database Version
 * Medical IoT Backend - Patient management endpoints
 */

const express = require('express');
const router = express.Router();
const { collection, COLLECTIONS } = require('../database');
const { formatPatientData, validatePatient } = require('../models/Patient');
const { logger } = require('../utils/logger');

// Helper to format patient data from Realtime Database
const formatPatientData = (key, data) => {
  return {
    id: key,
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
};

// GET /api/patients - Get all patients
router.get('/', async (req, res) => {
  try {
    const patientsRef = collection(COLLECTIONS.PATIENTS);

    if (!patientsRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await patientsRef.once('value');
    const patientsData = snapshot.val() || {};

    const patients = Object.keys(patientsData).map(key => {
      return formatPatientData(key, patientsData[key]);
    });
    
    // Apply pagination
    const limitNum = parseInt(limit) || 50;
    const skipNum = parseInt(skip) || 0;
    const paginatedPatients = patients.slice(skipNum, skipNum + limitNum);

    res.json({
      patients: paginatedPatients,
      pagination: {
        total: patients.length,
        limit: limitNum,
        skip: skipNum,
        hasMore: skipNum + limitNum < patients.length
      }
    });
  } catch (error) {
    logger.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
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
  try {
    const patientData = req.body;

    // Generate patient ID if not provided
    const patientId = patientData.patientId || `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Format data for Realtime Database
    const formattedData = {
      ...patientData,
      patientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: patientData.status || 'active'
    };

    // Save to Realtime Database
    const patientRef = collection(`${COLLECTIONS.PATIENTS}/${patientId}`);
    if (!patientRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    await patientRef.set(formattedData);

    logger.info(`New patient created: ${patientId}`);

    res.status(201).json({
      id: patientId,
      ...formattedData
    });
  } catch (error) {
    logger.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient' });
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
