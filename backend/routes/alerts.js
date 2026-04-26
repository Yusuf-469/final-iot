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

// Generate alerts based on ML predictions
const generatePredictionAlerts = async () => {
  try {
    logger.info('Generating prediction-based alerts...');

    // Get all patients
    const patientsRef = collection(COLLECTIONS.PATIENTS);
    if (!patientsRef) return;

    const patientsSnapshot = await patientsRef.once('value');
    const patientsData = patientsSnapshot.val() || {};

    const alertsCreated = [];

    for (const [patientId, patient] of Object.entries(patientsData)) {
      try {
        // Get recent health readings for this patient
        // For now, we'll use mock historical data based on current patient data
        const mockReadings = generateMockReadingsForPatient(patient);

        // Get prediction
        const prediction = await predictHealthRisk(patientId, mockReadings);

        // Create alerts based on prediction results
        if (prediction.riskLevel === 'critical' || prediction.riskLevel === 'high') {
          const alertData = {
            patientId,
            patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patientId,
            type: 'prediction',
            severity: prediction.riskLevel === 'critical' ? 'critical' : 'high',
            title: `Health Risk Alert: ${prediction.riskLevel.toUpperCase()}`,
            message: prediction.recommendation,
            riskScore: prediction.riskScore,
            factors: prediction.factors,
            predictionId: prediction.predictionId,
            status: 'active',
            source: 'ml_prediction'
          };

          // Check if similar alert already exists (avoid duplicates)
          const existingAlert = await checkExistingAlert(patientId, prediction.predictionId);
          if (!existingAlert) {
            await createAlert(alertData);
            alertsCreated.push(alertData);
            logger.info(`Prediction alert created for patient ${patientId}: ${prediction.riskLevel}`);
          }
        }

      } catch (error) {
        logger.error(`Error generating prediction alert for patient ${patientId}:`, error);
      }
    }

    logger.info(`Prediction alerts generation completed. Created ${alertsCreated.length} alerts.`);
    return alertsCreated;

  } catch (error) {
    logger.error('Error in generatePredictionAlerts:', error);
    throw error;
  }
};

// Generate mock historical readings for prediction (in production, get from actual history)
const generateMockReadingsForPatient = (patient) => {
  const readings = [];
  const baseHR = patient.heartRate || 75;
  const baseTemp = patient.temperature || 37.0;
  const baseSpo2 = patient.spo2 || 98;

  // Generate 20 readings over last few hours
  for (let i = 0; i < 20; i++) {
    readings.push({
      heartRate: baseHR + (Math.random() - 0.5) * 10,
      temperature: baseTemp + (Math.random() - 0.5) * 0.5,
      spo2: baseSpo2 + (Math.random() - 0.5) * 2,
      timestamp: Date.now() - (i * 15 * 60 * 1000) // Every 15 minutes
    });
  }

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
    console.log('POST /api/alerts/generate-predictions called');
    logger.info('Starting prediction-based alert generation...');
    const alertsCreated = await generatePredictionAlerts();
    console.log('Alerts created:', alertsCreated.length);

    res.json({
      success: true,
      message: `Generated ${alertsCreated.length} prediction-based alerts`,
      alertsCreated: alertsCreated.length,
      alerts: alertsCreated
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

module.exports = router;
