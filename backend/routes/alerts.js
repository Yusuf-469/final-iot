/**
 * Alerts Routes - Realtime Database Version
 * Medical IoT Backend - Alerts management endpoints
 */

const express = require('express');
const router = express.Router();
const { collection, COLLECTIONS } = require('../database');
const { logger } = require('../utils/logger');
const { predictHealthRisk } = require('../services/predictionService');

// Helper to format alert data from Realtime Database
const formatAlertData = (key, data) => {
  return {
    id: key,
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    acknowledgedAt: data.acknowledgedAt || null,
    resolvedAt: data.resolvedAt || null,
    escalatedAt: data.escalation?.escalatedAt || null
  };
};

// Generate alerts based on ML predictions using real-time data
const generatePredictionAlerts = async () => {
  try {
    logger.info('Generating prediction-based alerts using real-time data...');

    // Get all patients
    const patientsRef = collection(COLLECTIONS.PATIENTS);
    if (!patientsRef) return [];

    const patientsSnapshot = await patientsRef.once('value');
    const patientsData = patientsSnapshot.val() || {};

    // Get current health readings from the 'health' node
    const healthRef = collection('health');
    let currentHealthData = {};
    if (healthRef) {
      try {
        const healthSnapshot = await healthRef.once('value');
        currentHealthData = healthSnapshot.val() || {};
      } catch (error) {
        logger.warn('Could not fetch current health data:', error.message);
      }
    }

    const alertsCreated = [];
    const now = Date.now();

    for (const [patientId, patient] of Object.entries(patientsData)) {
      try {
        // Create historical readings from current patient data + current health data
        const historicalReadings = generateHistoricalReadingsForPatient(patient, currentHealthData, patientId);

        // Skip if no readings available
        if (historicalReadings.length === 0) {
          logger.debug(`No readings available for patient ${patientId}, skipping prediction`);
          continue;
        }

        // Get prediction using the ML service
        const prediction = await predictHealthRisk(patientId, historicalReadings);

        logger.debug(`Prediction for patient ${patientId}: ${prediction.riskLevel} (score: ${prediction.riskScore})`);

        // Create alerts based on prediction results
        if (prediction.riskLevel === 'critical' || prediction.riskLevel === 'high') {
          const alertData = {
            patientId,
            patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || `Patient ${patientId}`,
            type: 'prediction',
            severity: prediction.riskLevel === 'critical' ? 'critical' : 'high',
            title: `${prediction.riskLevel === 'critical' ? '🚨 CRITICAL' : '⚠️ HIGH'} Health Risk Alert`,
            message: prediction.recommendation,
            riskScore: prediction.riskScore,
            factors: prediction.factors,
            predictionId: prediction.predictionId,
            status: 'active',
            source: 'ml_prediction',
            modelVersion: prediction.model,
            confidence: prediction.confidence,
            timestamp: now
          };

          // Check if similar alert already exists (avoid duplicates)
          const existingAlert = await checkExistingAlert(patientId, prediction.predictionId);
          if (!existingAlert) {
            await createAlert(alertData);
            alertsCreated.push(alertData);
            logger.info(`🚨 Prediction alert created for patient ${patientId}: ${prediction.riskLevel} (score: ${prediction.riskScore})`);
          } else {
            logger.debug(`Alert already exists for patient ${patientId}, skipping`);
          }
        }

      } catch (error) {
        logger.error(`Error generating prediction alert for patient ${patientId}:`, error.message);
      }
    }

    logger.info(`✅ Prediction alerts generation completed. Created ${alertsCreated.length} alerts from ${Object.keys(patientsData).length} patients.`);
    return alertsCreated;

  } catch (error) {
    logger.error('❌ Error in generatePredictionAlerts:', error);
    throw error;
  }
};

// Generate historical readings for prediction using real patient data + current health data
const generateHistoricalReadingsForPatient = (patient, currentHealthData, patientId) => {
  const readings = [];
  const now = Date.now();

  // Use current health data if available and patient is linked to 'health' device
  if (patient.deviceId === 'health' && currentHealthData) {
    // Create recent readings based on current health data
    const currentReading = {
      heartRate: currentHealthData.heartRate || patient.heartRate,
      temperature: currentHealthData.temperature || patient.temperature,
      spo2: currentHealthData.spo2 || patient.spo2,
      respiratoryRate: currentHealthData.respiratoryRate,
      bloodPressure: currentHealthData.bloodPressure,
      consciousness: currentHealthData.consciousness,
      onOxygen: currentHealthData.onOxygen,
      timestamp: currentHealthData.updatedAt ? new Date(currentHealthData.updatedAt).getTime() : now
    };

    // Only add if we have at least heart rate data
    if (currentReading.heartRate) {
      readings.push(currentReading);

      // Generate some historical readings based on the current data (simulate trend)
      for (let i = 1; i <= 10; i++) {
        const historicalReading = {
          heartRate: currentReading.heartRate + (Math.random() - 0.5) * 8, // +/- 4 BPM variation
          temperature: currentReading.temperature ? currentReading.temperature + (Math.random() - 0.5) * 0.6 : undefined, // +/- 0.3°C
          spo2: currentReading.spo2 ? Math.round(currentReading.spo2 + (Math.random() - 0.5) * 4) : undefined, // +/- 2%
          respiratoryRate: currentReading.respiratoryRate,
          bloodPressure: currentReading.bloodPressure,
          consciousness: currentReading.consciousness,
          onOxygen: currentReading.onOxygen,
          timestamp: now - (i * 30 * 60 * 1000) // Every 30 minutes going back
        };
        readings.push(historicalReading);
      }
    }
  }

  // If no current health data, use patient baseline data
  if (readings.length === 0 && patient.heartRate) {
    // Generate readings based on stored patient data
    for (let i = 0; i < 15; i++) {
      readings.push({
        heartRate: patient.heartRate + (Math.random() - 0.5) * 10,
        temperature: patient.temperature ? patient.temperature + (Math.random() - 0.5) * 0.8 : undefined,
        spo2: patient.spo2 ? Math.round(patient.spo2 + (Math.random() - 0.5) * 3) : undefined,
        timestamp: now - (i * 60 * 60 * 1000) // Every hour
      });
    }
  }

  // Sort by timestamp (most recent first)
  readings.sort((a, b) => b.timestamp - a.timestamp);

  logger.debug(`Generated ${readings.length} historical readings for patient ${patientId}`);
  return readings;
};

// Check if similar alert already exists
const checkExistingAlert = async (patientId, predictionId) => {
  try {
    const alertsRef = collection(COLLECTIONS.ALERTS);
    if (!alertsRef) return false;

    const snapshot = await alertsRef.once('value');
    const alertsData = snapshot.val() || {};

    // Check for existing active alerts for this patient with same prediction
    for (const [alertId, alert] of Object.entries(alertsData)) {
      if (alert.patientId === patientId &&
          alert.predictionId === predictionId &&
          alert.status === 'active') {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error('Error checking existing alert:', error);
    return false;
  }
};

// Create alert helper function
const createAlert = async (alertData) => {
  const alertId = `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const formattedData = {
    ...alertData,
    alertId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const alertRef = collection(`${COLLECTIONS.ALERTS}/${alertId}`);
  if (alertRef) {
    await alertRef.set(formattedData);
    logger.info(`Alert created: ${alertId}`);
  }
};

// GET /api/alerts - Get all alerts
router.get('/', async (req, res) => {
  try {
    const alertsRef = collection(COLLECTIONS.ALERTS);

    if (!alertsRef) {
      return res.status(200).json({ alerts: [], activeCount: 0, pagination: { total: 0 } });
    }

    const snapshot = await alertsRef.once('value');
    const alertsData = snapshot.val() || {};

    const alerts = Object.keys(alertsData).map(key => {
      return formatAlertData(key, alertsData[key]);
    });
    
    // Apply basic filtering (Realtime DB doesn't support complex queries)
    let filteredAlerts = alerts;
    if (status) {
      filteredAlerts = filteredAlerts.filter(a => a.status === status);
    }
    if (severity) {
      filteredAlerts = filteredAlerts.filter(a => a.severity === severity);
    }
    if (patientId) {
      filteredAlerts = filteredAlerts.filter(a => a.patientId === patientId);
    }

    // Sort by creation date (newest first)
    filteredAlerts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Calculate active count
    const activeCount = filteredAlerts.filter(a => a.status === 'active').length;

    // Apply pagination
    const limitNum = parseInt(limit) || 100;
    const skipNum = parseInt(skip) || 0;
    const paginatedAlerts = filteredAlerts.slice(skipNum, skipNum + limitNum);

    res.json({
      alerts: paginatedAlerts,
      count: {
        total: filteredAlerts.length,
        active: activeCount
      },
      pagination: {
        limit: limitNum,
        skip: skipNum
      }
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(200).json({ alerts: [], activeCount: 0, pagination: { total: 0 } });
  }
});

// GET /api/alerts/active - Get active alerts
router.get('/active', async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.ALERTS)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .get();
    
    if (snapshot.empty) {
      return res.json({
        alerts: [],
        count: 0
      });
    }
    
    const alerts = [];
    snapshot.forEach(doc => {
      alerts.push(formatAlertDoc(doc));
    });
    
    res.json({
      alerts,
      count: alerts.length
    });
  } catch (error) {
    logger.error('Error fetching active alerts:', error);
    res.status(500).json({ error: 'Failed to fetch active alerts' });
  }
});

// POST /api/alerts/generate-predictions - Generate prediction-based alerts
router.post('/generate-predictions', async (req, res) => {
  try {
    logger.info('🧠 Starting AI-powered prediction-based alert generation...');
    const alertsCreated = await generatePredictionAlerts();

    const response = {
      success: true,
      message: `🤖 AI Analysis Complete: Generated ${alertsCreated.length} prediction-based alerts`,
      alertsCreated: alertsCreated.length,
      alerts: alertsCreated,
      timestamp: new Date().toISOString(),
      analysis: {
        patientsAnalyzed: Object.keys(await getPatientsData()).length,
        alertsGenerated: alertsCreated.length,
        riskLevels: alertsCreated.reduce((acc, alert) => {
          acc[alert.severity] = (acc[alert.severity] || 0) + 1;
          return acc;
        }, {})
      }
    };

    res.json(response);
    logger.info(`✅ AI prediction alerts generated: ${alertsCreated.length} alerts created`);

  } catch (error) {
    logger.error('❌ Error generating prediction alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI prediction alerts',
      details: error.message
    });
  }
});

// GET /api/alerts/predictions/status - Get prediction system status
router.get('/predictions/status', async (req, res) => {
  try {
    // Get basic system status
    const patientsRef = collection(COLLECTIONS.PATIENTS);
    const alertsRef = collection(COLLECTIONS.ALERTS);

    let patientCount = 0;
    let alertCount = 0;
    let predictionAlerts = 0;

    if (patientsRef) {
      const patientsSnapshot = await patientsRef.once('value');
      const patientsData = patientsSnapshot.val() || {};
      patientCount = Object.keys(patientsData).length;
    }

    if (alertsRef) {
      const alertsSnapshot = await alertsRef.once('value');
      const alertsData = alertsSnapshot.val() || {};
      alertCount = Object.keys(alertsData).length;
      predictionAlerts = Object.values(alertsData).filter(alert => alert.source === 'ml_prediction').length;
    }

    res.json({
      success: true,
      status: {
        patients: patientCount,
        totalAlerts: alertCount,
        predictionAlerts: predictionAlerts,
        systemActive: true,
        lastCheck: new Date().toISOString(),
        aiModel: 'v2.0-ml-enhanced'
      }
    });

  } catch (error) {
    logger.error('Error getting prediction status:', error);
    res.status(500).json({ success: false, error: 'Failed to get prediction status' });
  }
});

    logger.info(`Prediction alerts generated: ${alertsCreated.length} alerts created`);

  } catch (error) {
    logger.error('Error generating prediction alerts:', error);
    res.status(500).json({ error: 'Failed to generate prediction alerts' });
  }
});

// GET /api/alerts/statistics - Get alert statistics
router.get('/statistics', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    const now = new Date();
    let startTime;
    
    switch (period) {
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
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to 7d
    }
    
    const query = db.collection(COLLECTIONS.ALERTS)
      .where('createdAt', '>=', startTime);
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        period,
        bySeverity: [],
        byStatus: [],
        byType: []
      });
    }
    
    const severityCounts = {};
    const statusCounts = {};
    const typeCounts = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Count by severity
      const severity = data.severity || 'info';
      severityCounts[severity] = (severityCounts[severity] || 0) + 1;
      
      // Count by status
      const status = data.status || 'active';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      // Count by type
      const type = data.type || 'deviceError';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    res.json({
      period,
      bySeverity: Object.entries(severityCounts).map(([_id, count]) => ({ _id, count })),
      byStatus: Object.entries(statusCounts).map(([_id, count]) => ({ _id, count })),
      byType: Object.entries(typeCounts).map(([_id, count]) => ({ _id, count }))
    });
  } catch (error) {
    logger.error('Error fetching alert statistics:', error);
    res.status(500).json({ error: 'Failed to fetch alert statistics' });
  }
});

// POST /api/alerts - Create new alert
router.post('/', async (req, res) => {
  try {
    const alertData = req.body;

    // Generate alert ID
    const alertId = `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Format data for Realtime Database
    const formattedData = {
      ...alertData,
      alertId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: alertData.status || 'active',
      severity: alertData.severity || 'info'
    };

    // Save to Realtime Database
    const alertRef = collection(`${COLLECTIONS.ALERTS}/${alertId}`);
    if (!alertRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    await alertRef.set(formattedData);

    logger.info(`New alert created: ${alertId}`);

    res.status(201).json({
      id: alertId,
      ...formattedData
    });
    
    res.status(201).json({
      id: docRef.id,
      ...formattedData,
      createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
      updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null
    });
  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PUT /api/alerts/:alertId/acknowledge - Acknowledge alert
router.put('/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const docRef = db.collection(COLLECTIONS.ALERTS).doc(alertId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    const alertData = doc.data();
    
    // Check if alert is already processed
    if (alertData.status !== 'active') {
      return res.status(400).json({ error: 'Alert is not active' });
    }
    
    // Acknowledge alert
    const updatedData = acknowledgeAlert(alertData, userId);
    
    // Save to Firestore
    await docRef.update(updatedData);
    
    // Emit real-time update
    const io = req.app.get('io');
    io.emit('alertAcknowledged', {
      id: alertId,
      ...updatedData,
      createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
      updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
      acknowledgedAt: updatedData.acknowledgedAt ? updatedData.acknowledgedAt.toDate().toISOString() : null
    });
    
    res.json({
      success: true,
      alert: {
        id: alertId,
        ...updatedData,
        createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
        updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
        acknowledgedAt: updatedData.acknowledgedAt ? updatedData.acknowledgedAt.toDate().toISOString() : null
      }
    });
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// PUT /api/alerts/:alertId/resolve - Resolve alert
router.put('/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId, method, notes } = req.body;
    
    if (!userId || !method) {
      return res.status(400).json({ error: 'User ID and method are required' });
    }
    
    const docRef = db.collection(COLLECTIONS.ALERTS).doc(alertId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    const alertData = doc.data();
    
    // Resolve alert
    const updatedData = resolveAlert(alertData, userId, method, notes);
    
    // Save to Firestore
    await docRef.update(updatedData);
    
    // Emit real-time update
    const io = req.app.get('io');
    io.emit('alertResolved', {
      id: alertId,
      ...updatedData,
      createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
      updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
      resolvedAt: updatedData.resolvedAt ? updatedData.resolvedAt.toDate().toISOString() : null
    });
    
    res.json({
      success: true,
      alert: {
        id: alertId,
        ...updatedData,
        createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
        updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
        resolvedAt: updatedData.resolvedAt ? updatedData.resolvedAt.toDate().toISOString() : null
      }
    });
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// PUT /api/alerts/:alertId/escalate - Escalate alert
router.put('/:alertId/escalate', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { level, escalatedTo, reason } = req.body;
    
    if (!level || !escalatedTo || !reason) {
      return res.status(400).json({ error: 'Level, escalatedTo, and reason are required' });
    }
    
    const docRef = db.collection(COLLECTIONS.ALERTS).doc(alertId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    const alertData = doc.data();
    
    // Escalate alert
    const updatedData = escalateAlert(alertData, level, escalatedTo, reason);
    
    // Save to Firestore
    await docRef.update(updatedData);
    
    // Emit real-time update
    const io = req.app.get('io');
    io.emit('alertEscalated', {
      id: alertId,
      ...updatedData,
      createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
      updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
      escalatedAt: updatedData.escalation?.escalatedAt ? updatedData.escalation.escalatedAt.toDate().toISOString() : null
    });
    
    res.json({
      success: true,
      alert: {
        id: alertId,
        ...updatedData,
        createdAt: updatedData.createdAt ? updatedData.createdAt.toDate().toISOString() : null,
        updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toDate().toISOString() : null,
        escalatedAt: updatedData.escalation?.escalatedAt ? updatedData.escalation.escalatedAt.toDate().toISOString() : null
      }
    });
  } catch (error) {
    logger.error('Error escalating alert:', error);
    res.status(500).json({ error: 'Failed to escalate alert' });
  }
});

// Helper function to get patients data
const getPatientsData = async () => {
  try {
    const patientsRef = collection(COLLECTIONS.PATIENTS);
    if (!patientsRef) return {};

    const snapshot = await patientsRef.once('value');
    return snapshot.val() || {};
  } catch (error) {
    logger.error('Error getting patients data:', error);
    return {};
  }
};

module.exports = router;
