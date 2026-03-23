/**
 * Patients Routes - Firestore Version
 * Medical IoT Backend - Patient management endpoints
 */

const express = require('express');
const router = express.Router();
const { db, COLLECTIONS } = require('../database');
const { formatPatientData, validatePatient } = require('../models/Patient');
const { logger } = require('../utils/logger');

// Helper to format patient document from Firestore
const formatPatientDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toDate().toISOString() : null
  };
};

// GET /api/patients - Get all patients
router.get('/', async (req, res) => {
  try {
    const { status, search, limit = 50, skip = 0 } = req.query;
    
    let query = db.collection(COLLECTIONS.PATIENTS);
    
    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (search) {
      // Firestore doesn't support ILIKE, we'll need to handle this differently
      // For now, we'll get all and filter client-side for demo
      // In production, you'd use Algolia or similar for text search
    }
    
    // Apply pagination
    query = query.limit(parseInt(limit)).offset(parseInt(skip));
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        patients: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: false
        }
      });
    }
    
    const patients = [];
    snapshot.forEach(doc => {
      patients.push(formatPatientDoc(doc));
    });
    
    // Get total count (separate query for accuracy)
    const countQuery = db.collection(COLLECTIONS.PATIENTS);
    if (status) {
      countQuery.where('status', '==', status);
    }
    const countSnapshot = await countQuery.get();
    const total = countSnapshot.size;
    
    res.json({
      patients,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + parseInt(limit) < total
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
    const patientsSnapshot = await db.collection(COLLECTIONS.PATIENTS).get();
    
    const statusCounts = {};
    const ageGroups = {
      under_18: 0,
      '18-40': 0,
      '40-60': 0,
      '60+': 0
    };
    
    patientsSnapshot.forEach(doc => {
      const data = doc.data();
      
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
    
    const docRef = db.collection(COLLECTIONS.PATIENTS).doc(patientId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const patientData = formatPatientDoc(doc);
    
    // Get devices for this patient
    const devicesSnapshot = await db.collection(COLLECTIONS.DEVICES)
      .where('patientId', '==', patientId)
      .get();
    
    const devices = [];
    devicesSnapshot.forEach(deviceDoc => {
      devices.push({
        id: deviceDoc.id,
        ...deviceDoc.data()
      });
    });
    
    // Get recent health data (last 10 readings)
    const healthDataSnapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    const recentData = [];
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
    
    // Validate patient data
    const validation = validatePatient(patientData);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    
    // Generate patient ID if not provided
    const patientId = patientData.patientId || `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Format data for Firestore
    const formattedData = formatPatientData({
      ...patientData,
      patientId
    });
    
    // Save to Firestore
    await db.collection(COLLECTIONS.PATIENTS).doc(patientId).set(formattedData);
    
    logger.info(`New patient created: ${patientId}`);
    
    res.status(201).json({
      id: patientId,
      ...formattedData,
      createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
      updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null,
      dateOfBirth: formattedData.dateOfBirth ? formattedData.dateOfBirth.toDate().toISOString() : null
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
    
    // Validate patient ID exists
    const docRef = db.collection(COLLECTIONS.PATIENTS).doc(patientId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Get current data
    const currentData = doc.data();
    
    // Merge updates with current data
    const updatedData = {
      ...currentData,
      ...updates,
      updatedAt: new Date()
    };
    
    // Format for Firestore
    const formattedData = formatPatientData(updatedData);
    
    // Save to Firestore
    await docRef.set(formattedData);
    
    res.json({
      success: true,
      patient: {
        id: patientId,
        ...formattedData,
        createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
        updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null,
        dateOfBirth: formattedData.dateOfBirth ? formattedData.dateOfBirth.toDate().toISOString() : null
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
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Update status
    await docRef.update({
      status,
      updatedAt: new Date()
    });
    
    // Emit real-time status update
    const io = req.app.get('io');
    io.to(`patient-${patientId}`).emit('patientStatus', {
      patientId,
      status
    });
    
    const updatedDoc = await docRef.get();
    const updatedData = formatPatientDoc(updatedDoc);
    
    res.json({
      success: true,
      patient: updatedData
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
    
    const docRef = db.collection(COLLECTIONS.PATIENTS).doc(patientId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Delete patient document
    await docRef.delete();
    
    // Optionally delete related data (devices, health data, alerts)
    // For now, we'll keep them for historical purposes
    
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
