/**
 * Health Data Routes - Firestore Version
 * Medical IoT Backend - Health monitoring data endpoints
 */

const express = require('express');
const router = express.Router();
const { db, COLLECTIONS } = require('../database');
const { formatHealthData, validateHealthData, assessHealthStatus } = require('../models/HealthData');
const { logger } = require('../utils/logger');

// Helper to format health data document from Firestore
const formatHealthDataDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null
  };
};

// GET /api/health-data/:patientId - Get health data for patient
router.get('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 100, skip = 0, period } = req.query;
    
    let query = db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .orderBy('timestamp', 'desc');
    
    // Apply period filter if provided
    if (period) {
      const now = new Date();
      let startTime;
      
      switch (period) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
      }
      
      query = query.where('timestamp', '>=', startTime);
    }
    
    // Apply pagination
    query = query.limit(parseInt(limit)).offset(parseInt(skip));
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        data: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      });
    }
    
    const data = [];
    snapshot.forEach(doc => {
      data.push(formatHealthDataDoc(doc));
    });
    
    // Get total count (separate query for accuracy)
    let countQuery = db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId);
    
    if (period) {
      const now = new Date();
      let startTime;
      
      switch (period) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      
      countQuery = countQuery.where('timestamp', '>=', startTime);
    }
    
    const countSnapshot = await countQuery.get();
    const total = countSnapshot.size;
    
    res.json({
      data,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    logger.error('Error fetching health data:', error);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

// GET /api/health-data/:patientId/latest - Get latest reading
router.get('/:patientId/latest', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    const snapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'No health data found' });
    }
    
    const doc = snapshot.docs[0];
    res.json(formatHealthDataDoc(doc));
  } catch (error) {
    logger.error('Error fetching latest reading:', error);
    res.status(500).json({ error: 'Failed to fetch latest reading' });
  }
});

// GET /api/health-data/:patientId/summary - Get health summary
router.get('/:patientId/summary', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { period = '24h' } = req.query;
    
    const now = new Date();
    let startTime;
    
    switch (period) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }
    
    const snapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .where('timestamp', '>=', startTime)
      .get();
    
    if (snapshot.empty) {
      return res.json({
        period,
        summary: {
          readings: 0,
          heartRate: { average: 0, min: 0, max: 0 },
          temperature: { average: 0, min: 0, max: 0 },
          spo2: { average: 0, min: 0, max: 0 },
          bloodPressure: { systolic: 0, diastolic: 0 },
          status: { normal: 0, warning: 0, critical: 0 }
        }
      });
    }
    
    let totalHeartRate = 0;
    let totalTemperature = 0;
    let totalSpo2 = 0;
    let totalSystolic = 0;
    let totalDiastolic = 0;
    let minHeartRate = Infinity;
    let maxHeartRate = -Infinity;
    let minTemperature = Infinity;
    let maxTemperature = -Infinity;
    let minSpo2 = Infinity;
    let maxSpo2 = -Infinity;
    let normalCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let count = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      count++;
      
      // Heart rate
      if (data.heartRate && data.heartRate.value !== undefined) {
        const hr = data.heartRate.value;
        totalHeartRate += hr;
        if (hr < minHeartRate) minHeartRate = hr;
        if (hr > maxHeartRate) maxHeartRate = hr;
      }
      
      // Temperature
      if (data.temperature && data.temperature.value !== undefined) {
        const temp = data.temperature.value;
        totalTemperature += temp;
        if (temp < minTemperature) minTemperature = temp;
        if (temp > maxTemperature) maxTemperature = temp;
      }
      
      // SpO2
      if (data.spo2 && data.spo2.value !== undefined) {
        const spo2 = data.spo2.value;
        totalSpo2 += spo2;
        if (spo2 < minSpo2) minSpo2 = spo2;
        if (spo2 > maxSpo2) maxSpo2 = spo2;
      }
      
      // Blood pressure
      if (data.bloodPressure) {
        if (data.bloodPressure.systolic !== undefined) {
          totalSystolic += data.bloodPressure.systolic;
        }
        if (data.bloodPressure.diastolic !== undefined) {
          totalDiastolic += data.bloodPressure.diastolic;
        }
      }
      
      // Status counts
      const status = data.status || 'normal';
      if (status === 'normal') normalCount++;
      else if (status === 'warning') warningCount++;
      else if (status === 'critical') criticalCount++;
    });
    
    res.json({
      period,
      summary: {
        readings: count,
        heartRate: {
          average: count > 0 ? Math.round((totalHeartRate / count) * 10) / 10 : 0,
          min: minHeartRate === Infinity ? 0 : minHeartRate,
          max: maxHeartRate === -Infinity ? 0 : maxHeartRate
        },
        temperature: {
          average: count > 0 ? Math.round((totalTemperature / count) * 10) / 10 : 0,
          min: minTemperature === Infinity ? 0 : minTemperature,
          max: maxTemperature === -Infinity ? 0 : maxTemperature
        },
        spo2: {
          average: count > 0 ? Math.round((totalSpo2 / count) * 10) / 10 : 0,
          min: minSpo2 === Infinity ? 0 : minSpo2,
          max: maxSpo2 === -Infinity ? 0 : maxSpo2
        },
        bloodPressure: {
          systolic: count > 0 ? Math.round(totalSystolic / count) : 0,
          diastolic: count > 0 ? Math.round(totalDiastolic / count) : 0
        },
        status: {
          normal: normalCount,
          warning: warningCount,
          critical: criticalCount
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching health summary:', error);
    res.status(500).json({ error: 'Failed to fetch health summary' });
  }
});

// POST /api/health-data - Submit health data
router.post('/', async (req, res) => {
  try {
    const { patientId, deviceId, heartRate, temperature, spo2, bloodPressure, status } = req.body;
    
    // Validate required fields
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    // Format health data for Firestore
    const healthData = {
      patientId,
      deviceId,
      heartRate: heartRate || { value: 0, unit: 'bpm', quality: 'poor' },
      temperature: temperature || { value: 0, unit: '°C', method: 'axillary' },
      spo2: spo2 || { value: 0, unit: '%', quality: 'poor' },
      bloodPressure: bloodPressure || { systolic: 0, diastolic: 0, unit: 'mmHg', method: 'oscillometric' },
      status: status || 'normal',
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Validate health data
    const validation = validateHealthData(healthData);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    
    // Assess health status
    const { status: assessedStatus, alerts } = assessHealthStatus(healthData);
    healthData.status = assessedStatus;
    healthData.alerts = alerts;
    
    // Save to Firestore
    const docRef = await db.collection(COLLECTIONS.HEALTH_DATA).add(healthData);
    
    // Emit real-time update
    const io = req.app.get('io');
    io.to(`patient-${patientId}`).emit('healthData', {
      id: docRef.id,
      ...healthData,
      timestamp: healthData.timestamp.toISOString(),
      createdAt: healthData.createdAt.toISOString(),
      updatedAt: healthData.updatedAt.toISOString()
    });
    
    res.status(201).json({
      id: docRef.id,
      ...healthData,
      timestamp: healthData.timestamp.toISOString(),
      createdAt: healthData.createdAt.toISOString(),
      updatedAt: healthData.updatedAt.toISOString()
    });
  } catch (error) {
    logger.error('Error submitting health data:', error);
    res.status(500).json({ error: 'Failed to submit health data' });
  }
});

// POST /api/health-data/bulk - Submit multiple readings
router.post('/bulk', async (req, res) => {
  try {
    const { patientId, deviceId, readings } = req.body;
    
    if (!readings || readings.length === 0) {
      return res.status(400).json({ error: 'No readings provided' });
    }
    
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    const inserted = [];
    
    for (const reading of readings) {
      // Format health data for Firestore
      const healthData = {
        patientId,
        deviceId,
        heartRate: reading.heartRate || { value: 0, unit: 'bpm', quality: 'poor' },
        temperature: reading.temperature || { value: 0, unit: '°C', method: 'axillary' },
        spo2: reading.spo2 || { value: 0, unit: '%', quality: 'poor' },
        bloodPressure: reading.bloodPressure || { systolic: 0, diastolic: 0, unit: 'mmHg', method: 'oscillometric' },
        status: reading.status || 'normal',
        timestamp: reading.timestamp ? new Date(reading.timestamp) : new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Validate health data
      const validation = validateHealthData(healthData);
      if (!validation.isValid) {
        logger.warn(`Invalid health data skipped: ${validation.errors.join(', ')}`);
        continue; // Skip invalid readings
      }
      
      // Assess health status
      const { status: assessedStatus, alerts } = assessHealthStatus(healthData);
      healthData.status = assessedStatus;
      healthData.alerts = alerts;
      
      // Save to Firestore
      const docRef = await db.collection(COLLECTIONS.HEALTH_DATA).add(healthData);
      
      inserted.push({
        id: docRef.id,
        ...healthData,
        timestamp: healthData.timestamp.toISOString(),
        createdAt: healthData.createdAt.toISOString(),
        updatedAt: healthData.updatedAt.toISOString()
      });
    }
    
    // Emit real-time update for latest reading
    if (inserted.length > 0) {
      const latest = inserted[inserted.length - 1];
      const io = req.app.get('io');
      io.to(`patient-${patientId}`).emit('healthData', latest);
    }
    
    res.status(201).json({
      success: true,
      inserted: inserted.length,
      data: inserted
    });
  } catch (error) {
    logger.error('Error bulk inserting health data:', error);
    res.status(500).json({ error: 'Failed to bulk insert health data' });
  }
});

module.exports = router;
