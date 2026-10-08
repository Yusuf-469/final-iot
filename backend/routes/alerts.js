/**
 * Alerts Routes - Realtime Database Version
 * Medical IoT Backend - Alerts management endpoints
 *
 * Alerts are raised automatically by services/alertEngine.js from live device readings.
 * The engine runs from backend/worker.js (real time), POST /api/alerts/evaluate, or the dashboard.
 */

const express = require('express');
const router = express.Router();
const { collection, COLLECTIONS, getDb } = require('../database');
const { logger } = require('../utils/logger');
const alertEngine = require('../services/alertEngine');

// Device nodes the engine evaluates (top-level RTDB nodes written by ESP32s)
const DEVICE_NODES = (process.env.ALERT_DEVICE_NODES || 'health').split(',').map(s => s.trim()).filter(Boolean);

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

const evaluateAll = async ({ dryRun = false, deviceId } = {}) => {
  const db = getDb();
  if (!db) {
    const error = new Error('Database unavailable');
    error.status = 503;
    throw error;
  }
  const nodes = deviceId ? [deviceId] : DEVICE_NODES;
  const out = [];
  for (const node of nodes) {
    out.push(await alertEngine.evaluateDevice(db, node, { dryRun }));
  }
  return out;
};

// Read every alert as an array (Realtime Database has no compound queries, so filter in memory)
const getAllAlerts = async () => {
  const alertsRef = collection(COLLECTIONS.ALERTS);
  if (!alertsRef) return null;
  const snapshot = await alertsRef.once('value');
  return Object.entries(snapshot.val() || {}).map(([key, data]) => formatAlertData(key, data));
};

const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

// Load one alert, apply changes, persist, and return the merged result
const updateAlert = async (alertId, buildChanges) => {
  const ref = collection(`${COLLECTIONS.ALERTS}/${alertId}`);
  if (!ref) return { status: 503, error: 'Database unavailable' };

  const snapshot = await ref.once('value');
  if (!snapshot.exists()) return { status: 404, error: 'Alert not found' };

  const current = snapshot.val();
  const changes = buildChanges(current);
  if (changes.error) return changes;

  changes.updatedAt = new Date().toISOString();
  await ref.update(changes);
  return { alert: formatAlertData(alertId, { ...current, ...changes }) };
};

const sendUpdate = (res, result) => {
  if (result.error) return res.status(result.status || 400).json({ success: false, error: result.error });
  res.json({ success: true, alert: result.alert });
};

// GET /api/alerts - Get all alerts (filters: status, severity, patientId; paging: limit, skip)
router.get('/', async (req, res) => {
  try {
    const { status, severity, patientId, limit, skip } = req.query;
    const alerts = await getAllAlerts();

    if (!alerts) {
      return res.status(200).json({ alerts: [], count: { total: 0, active: 0 }, pagination: { limit: 0, skip: 0 } });
    }

    let filtered = alerts;
    if (status) filtered = filtered.filter(a => a.status === status);
    if (severity) filtered = filtered.filter(a => a.severity === severity);
    if (patientId) filtered = filtered.filter(a => a.patientId === patientId);
    filtered.sort(byNewest);

    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const skipNum = parseInt(skip) || 0;

    res.json({
      alerts: filtered.slice(skipNum, skipNum + limitNum),
      count: {
        total: filtered.length,
        active: filtered.filter(a => a.status === 'active').length
      },
      pagination: { limit: limitNum, skip: skipNum }
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/alerts/active - Get active alerts
router.get('/active', async (req, res) => {
  try {
    const alerts = (await getAllAlerts()) || [];
    const active = alerts.filter(a => a.status === 'active').sort(byNewest);
    res.json({ alerts: active, count: active.length });
  } catch (error) {
    logger.error('Error fetching active alerts:', error);
    res.status(500).json({ error: 'Failed to fetch active alerts' });
  }
});

// POST /api/alerts/evaluate - run the alert engine on the latest device readings
// Body: { deviceId?, dryRun? }. Called by the worker, a scheduler, or an open dashboard.
router.post('/evaluate', async (req, res) => {
  try {
    const deviceId = req.body.deviceId;
    if (deviceId !== undefined && !DEVICE_NODES.includes(deviceId)) {
      return res.status(400).json({ success: false, error: 'Unknown device' });
    }
    const results = await evaluateAll({ deviceId, dryRun: req.body.dryRun === true });
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Alert evaluation failed:', error);
    res.status(error.status || 500).json({ success: false, error: 'Alert evaluation failed' });
  }
});

// POST /api/alerts/generate-predictions - "Run Analysis" button: evaluate now
router.post('/generate-predictions', async (req, res) => {
  try {
    const devices = await evaluateAll();
    const results = devices.flatMap(d => d.results);
    const created = results.flatMap(r => (r.actions || []).filter(a => a.type === 'create' || a.type === 'escalate'));

    res.json({
      success: true,
      message: `Analysis complete: ${created.length} new or escalated alert(s)`,
      alertsCreated: created.length,
      timestamp: new Date().toISOString(),
      analysis: {
        patientsAnalyzed: results.length,
        alertsGenerated: created.length,
        riskLevels: created.reduce((acc, a) => {
          acc[a.severity] = (acc[a.severity] || 0) + 1;
          return acc;
        }, {}),
        scores: results.map(r => ({ patientId: r.patientId, news2: r.news2 ?? null, risk: r.risk ?? null, skipped: !!r.skipped }))
      }
    });
  } catch (error) {
    logger.error('❌ Error running alert analysis:', error);
    res.status(error.status || 500).json({ success: false, error: 'Failed to run alert analysis' });
  }
});

// GET /api/alerts/predictions/status - alert engine status
router.get('/predictions/status', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
    const s = await alertEngine.engineStatus(db);

    res.json({
      success: true,
      status: {
        patients: s.patients,
        totalAlerts: s.evaluations,       // shown as "risk assessments"
        predictionAlerts: s.activeAlerts, // shown as "active AI alerts"
        baselinesReady: s.baselinesReady,
        systemActive: s.live,
        lastCheck: s.lastEvaluatedAt,
        aiModel: s.engine
      }
    });
  } catch (error) {
    logger.error('Error getting alert engine status:', error);
    res.status(500).json({ success: false, error: 'Failed to get alert engine status' });
  }
});

// GET /api/alerts/statistics - Get alert statistics
router.get('/statistics', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = { '24h': 1, '7d': 7, '30d': 30 }[period] || 7;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const alerts = ((await getAllAlerts()) || [])
      .filter(a => new Date(a.createdAt).getTime() >= startTime);

    const countBy = (field, fallback) => {
      const counts = {};
      alerts.forEach(a => {
        const key = a[field] || fallback;
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts).map(([_id, count]) => ({ _id, count }));
    };

    res.json({
      period,
      total: alerts.length,
      bySeverity: countBy('severity', 'info'),
      byStatus: countBy('status', 'active'),
      byType: countBy('type', 'deviceError')
    });
  } catch (error) {
    logger.error('Error fetching alert statistics:', error);
    res.status(500).json({ error: 'Failed to fetch alert statistics' });
  }
});

// POST /api/alerts - Create new alert
router.post('/', async (req, res) => {
  try {
    if (!collection(COLLECTIONS.ALERTS)) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { title, message, severity, type, patientId, patientName } = req.body;
    if (!title && !message) {
      return res.status(400).json({ error: 'title or message is required' });
    }

    const alertId = `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const alertData = {
      alertId,
      title: title || message,
      message: message || title,
      severity: ['critical', 'high', 'medium', 'low', 'info'].includes(severity) ? severity : 'info',
      type: type || 'manual',
      patientId: patientId || null,
      patientName: patientName || null,
      status: 'active',
      source: req.device ? 'device' : 'manual',
      createdBy: req.user?.email || null,
      createdAt: now,
      updatedAt: now
    };

    await collection(`${COLLECTIONS.ALERTS}/${alertId}`).set(alertData);
    logger.info(`New alert created: ${alertId}`);

    res.status(201).json({ id: alertId, ...alertData });
  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PUT /api/alerts/:alertId/acknowledge - Acknowledge alert
router.put('/:alertId/acknowledge', async (req, res) => {
  try {
    const result = await updateAlert(req.params.alertId, (alert) => {
      if (alert.status !== 'active') return { status: 400, error: 'Alert is not active' };
      return {
        status: 'acknowledged',
        acknowledgedBy: req.user?.email || req.body.userId || 'unknown',
        acknowledgedAt: new Date().toISOString()
      };
    });
    sendUpdate(res, result);
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// PUT /api/alerts/:alertId/resolve - Resolve alert
router.put('/:alertId/resolve', async (req, res) => {
  try {
    const { method, notes } = req.body;
    // Clinician feedback teaches the engine this patient's sensitivity: 'useful' | 'false_alarm'
    const feedback = ['useful', 'false_alarm'].includes(req.body.feedback) ? req.body.feedback : null;

    const result = await updateAlert(req.params.alertId, (alert) => {
      if (alert.status === 'resolved') return { status: 400, error: 'Alert is already resolved' };
      return {
        status: 'resolved',
        resolvedBy: req.user?.email || req.body.userId || 'unknown',
        resolvedAt: new Date().toISOString(),
        resolution: { method: method || 'manual', notes: notes || '', feedback }
      };
    });

    if (!result.error && result.alert.engineKey) {
      try {
        const tuning = await alertEngine.recordResolution(getDb(), result.alert, feedback);
        if (tuning) result.alert.tuning = tuning;
      } catch (error) {
        logger.warn(`Could not record alert feedback: ${error.message}`);
      }
    }
    sendUpdate(res, result);
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// PUT /api/alerts/:alertId/escalate - Escalate alert
router.put('/:alertId/escalate', async (req, res) => {
  try {
    const { level, escalatedTo, reason } = req.body;
    if (!level || !escalatedTo || !reason) {
      return res.status(400).json({ error: 'Level, escalatedTo, and reason are required' });
    }

    const result = await updateAlert(req.params.alertId, (alert) => {
      if (alert.status === 'resolved') return { status: 400, error: 'Resolved alerts cannot be escalated' };
      return {
        status: 'escalated',
        escalation: { level, escalatedTo, reason, escalatedAt: new Date().toISOString(), escalatedBy: req.user?.email || null }
      };
    });
    sendUpdate(res, result);
  } catch (error) {
    logger.error('Error escalating alert:', error);
    res.status(500).json({ error: 'Failed to escalate alert' });
  }
});

module.exports = router;
