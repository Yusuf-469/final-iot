/**
 * Analytics Routes - Firebase Realtime Database
 * Medical IoT Backend - Analytics and historical data endpoints
 */

const express = require('express');
const router = express.Router();
const { getDb, getDbConnected } = require('../database');

// GET /api/analytics/readings - Get historical health readings for analytics
router.get('/readings', async (req, res) => {
  try {
    const db = getDb();
    if (!db || !getDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const { range = '7d', patientId } = req.query;

    // Calculate time range
    const now = Date.now();
    let startTime;
    let groupByHours;

    switch (range) {
      case '7d':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        groupByHours = 24; // Daily aggregation
        break;
      case '30d':
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        groupByHours = 24 * 7; // Weekly aggregation
        break;
      case '90d':
        startTime = now - (90 * 24 * 60 * 60 * 1000);
        groupByHours = 24 * 7; // Weekly aggregation
        break;
      default:
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        groupByHours = 24;
    }

    // For now, since we don't have historical data, let's aggregate from current patients
    // In production, this would read from a dedicated analytics/history node

    const patientsSnap = await db.ref('patients').once('value');
    const patientsData = patientsSnap.val() || {};

    const readings = [];

    // Collect readings from all patients (simulating historical data)
    Object.entries(patientsData).forEach(([pid, patient]) => {
      if (patientId && pid !== patientId) return; // Filter by patient if specified

      // Create mock historical readings based on patient data
      // In production, this would read from actual historical data
      const baseHeartRate = 35 + Math.random() * 10; // 35-45 BPM range
      const baseTemp = 25 + Math.random() * 20; // 25-45°C range
      const baseSpo2 = 95 + Math.random() * 5; // Keep 90-100% range

      for (let i = 25; i <= 45; i++) { // Generate readings from 25 to 45
        const timestamp = startTime + ((i - 25) * (now - startTime) / 21); // Distribute over time range
        readings.push({
          id: `${pid}_${i}`,
          patientId: pid,
          heartRate: Math.round(baseHeartRate + (Math.random() - 0.5) * 5), // +/- 5 variation
          temperature: Math.round((baseTemp + (Math.random() - 0.5) * 5) * 10) / 10, // +/- 5°C variation
          spo2: Math.round(baseSpo2 + (Math.random() - 0.5) * 5), // +/- 5% variation
          timestamp: timestamp
        });
      }
    });

    // Group readings by time period
    const groupedData = groupReadingsByTime(readings, groupByHours);

    res.json({
      success: true,
      data: {
        readings: groupedData,
        range,
        totalReadings: readings.length
      }
    });

  } catch (error) {
    console.error('Analytics readings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics data' });
  }
});

// Helper function to group readings by time periods
function groupReadingsByTime(readings, hoursInterval) {
  const groups = {};
  const intervalMs = hoursInterval * 60 * 60 * 1000;

  readings.forEach(reading => {
    const groupKey = Math.floor(reading.timestamp / intervalMs) * intervalMs;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        timestamp: groupKey,
        heartRate: [],
        temperature: [],
        spo2: [],
        count: 0
      };
    }

    if (reading.heartRate !== undefined) groups[groupKey].heartRate.push(reading.heartRate);
    if (reading.temperature !== undefined) groups[groupKey].temperature.push(reading.temperature);
    if (reading.spo2 !== undefined) groups[groupKey].spo2.push(reading.spo2);
    groups[groupKey].count++;
  });

  // Calculate averages for each group
  return Object.values(groups).map(group => ({
    timestamp: group.timestamp,
    date: new Date(group.timestamp).toISOString().split('T')[0],
    heartRate: group.heartRate.length > 0 ? Math.round(group.heartRate.reduce((a, b) => a + b, 0) / group.heartRate.length) : null,
    temperature: group.temperature.length > 0 ? Math.round((group.temperature.reduce((a, b) => a + b, 0) / group.temperature.length) * 10) / 10 : null,
    spo2: group.spo2.length > 0 ? Math.round(group.spo2.reduce((a, b) => a + b, 0) / group.spo2.length) : null,
    count: group.count
  })).sort((a, b) => a.timestamp - b.timestamp);
}

module.exports = router;