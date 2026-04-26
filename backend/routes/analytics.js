/**
 * Analytics Routes - Firebase Realtime Database
 * Medical IoT Backend - Analytics and historical data endpoints
 */

const express = require('express');
const router = express.Router();
const { getDb, getDbConnected } = require('../database');
const aiInsightsService = require('../services/aiInsightsService');

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
      const baseHeartRate = Math.random() * 60; // 0-60 BPM range
      const baseTemp = 25 + Math.random() * 20; // 25-45°C range
      const baseSpo2 = 95 + Math.random() * 5; // Keep 90-100% range

      for (let i = 25; i <= 45; i++) { // Generate readings from 25 to 45
        const timestamp = startTime + ((i - 25) * (now - startTime) / 21); // Distribute over time range
        readings.push({
          id: `${pid}_${i}`,
          patientId: pid,
          heartRate: Math.round(baseHeartRate + (Math.random() - 0.5) * 10), // +/- 10 variation, stays within 0-70
          temperature: Math.round((baseTemp + (Math.random() - 0.5) * 5) * 10) / 10, // +/- 5°C variation
          spo2: Math.round(baseSpo2 + (Math.random() - 0.5) * 5), // +/- 5% variation
          timestamp: timestamp
        });
  }
};

// GET /api/analytics/insights - Generate AI-powered insights
router.get('/insights', async (req, res) => {
  try {
    const { range = '7d' } = req.query;

    console.log('Generating AI insights for range:', range);

    // First get the analytics data
    const patientsSnap = await db.ref('patients').once('value');
    const patientsData = patientsSnap.val() || {};

    const readings = [];

    // Generate mock historical readings for AI analysis
    Object.entries(patientsData).forEach(([pid, patient]) => {
      const baseHeartRate = 35 + Math.random() * 10;
      const baseTemp = 25 + Math.random() * 20;
      const baseSpo2 = 95 + Math.random() * 5;

      for (let i = 25; i <= 45; i++) {
        readings.push({
          id: `${pid}_${i}`,
          patientId: pid,
          heartRate: Math.round(baseHeartRate + (Math.random() - 0.5) * 5),
          temperature: Math.round((baseTemp + (Math.random() - 0.5) * 5) * 10) / 10,
          spo2: Math.round(baseSpo2 + (Math.random() - 0.5) * 5),
          timestamp: Date.now() - ((45 - i) * 60 * 60 * 1000) // Spread over time
        });
      }
    });

    // Group readings by time period
    const groupedData = groupReadingsByTime(readings, range === '7d' ? 24 : range === '30d' ? 24 * 7 : 24 * 7);

    // Generate AI insights
    const insights = await aiInsightsService.generateInsights({
      readings: groupedData,
      range,
      totalReadings: readings.length
    }, range);

    res.json({
      success: true,
      data: {
        insights: insights.insights,
        source: insights.source,
        confidence: insights.confidence,
        timestamp: insights.timestamp,
        range
      }
    });

  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI insights',
      fallback: 'AI insights service temporarily unavailable. Basic analytics still functional.'
    });
  }
});

module.exports = router;