/**
 * Alerts Routes - Firestore Version
 * Medical IoT Backend - Alerts management endpoints
 */

const express = require('express');
const router = express.Router();
const { db, COLLECTIONS } = require('../database');
const { formatAlertData, validateAlert, acknowledgeAlert, resolveAlert, escalateAlert } = require('../models/Alert');
const { logger } = require('../utils/logger');

// Helper to format alert document from Firestore
const formatAlertDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
    acknowledgedAt: data.acknowledgedAt ? data.acknowledgedAt.toDate().toISOString() : null,
    resolvedAt: data.resolvedAt ? data.resolvedAt.toDate().toISOString() : null,
    escalatedAt: data.escalation?.escalatedAt ? data.escalation.escalatedAt.toDate().toISOString() : null
  };
};

// GET /api/alerts - Get all alerts
router.get('/', async (req, res) => {
  try {
    const { status, severity, patientId, limit = 100, skip = 0 } = req.query;
    
    let query = db.collection(COLLECTIONS.ALERTS);
    
    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (severity) {
      query = query.where('severity', '==', severity);
    }
    
    if (patientId) {
      query = query.where('patientId', '==', patientId);
    }
    
    // Apply ordering and pagination
    query = query.orderBy('createdAt', 'desc')
                .limit(parseInt(limit))
                .offset(parseInt(skip));
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        alerts: [],
        count: {
          total: 0,
          active: 0
        },
        pagination: {
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      });
    }
    
    const alerts = [];
    let activeCount = 0;
    
    snapshot.forEach(doc => {
      const alert = formatAlertDoc(doc);
      alerts.push(alert);
      if (alert.status === 'active') {
        activeCount++;
      }
    });
    
    res.json({
      alerts,
      count: {
        total: alerts.length,
        active: activeCount
      },
      pagination: {
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
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
    
    // Validate alert data
    const validation = validateAlert(alertData);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    
    // Format data for Firestore
    const formattedData = formatAlertData(alertData);
    
    // Add to Firestore
    const docRef = await db.collection(COLLECTIONS.ALERTS).add(formattedData);
    
    logger.info(`New alert created: ${docRef.id}`);
    
    // Emit real-time alert
    const io = req.app.get('io');
    io.emit('newAlert', {
      id: docRef.id,
      ...formattedData,
      createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
      updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null
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
