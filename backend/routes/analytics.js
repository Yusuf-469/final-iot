/**
 * Analytics Routes - Firebase Realtime Database
 * Medical IoT Backend - Analytics and historical data endpoints
 */

const express = require('express');
const router = express.Router();
const { getDb, getDbConnected } = require('../database');

// Read stored device readings newer than startTime (flat numbers, see routes/healthData.js)
async function loadReadings(db, startTime, patientId, max) {
  const snapshot = await db.ref('healthData')
    .orderByChild('timestamp').startAt(startTime).limitToLast(max).once('value');

  return Object.values(snapshot.val() || {})
    .filter(r => !patientId || r.patientId === patientId)
    .map(r => ({
      patientId: r.patientId,
      heartRate: typeof r.heartRate === 'object' ? r.heartRate?.value : r.heartRate,
      temperature: typeof r.temperature === 'object' ? r.temperature?.value : r.temperature,
      spo2: typeof r.spo2 === 'object' ? r.spo2?.value : r.spo2,
      timestamp: r.timestamp
    }));
}

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
        groupByHours = 24;
        break;
      case '30d':
        startTime = now - (30 * 24 * 60 * 60 * 1000);
        groupByHours = 24 * 7;
        break;
      case '90d':
        startTime = now - (90 * 24 * 60 * 60 * 1000);
        groupByHours = 24 * 7;
        break;
      default:
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        groupByHours = 24;
    }

    // Real readings recorded by devices
    const readings = await loadReadings(db, startTime, patientId, 5000);
    let isSample = false;

    // No device history yet: show clearly-labelled sample trends so the charts aren't empty
    if (readings.length === 0) {
      isSample = true;
      const patientsSnap = await db.ref('patients').once('value');
      const patientsData = patientsSnap.val() || { demo_patient: {} };

      Object.keys(patientsData).forEach((pid) => {
        if (patientId && pid !== patientId) return;

        const baseHeartRate = 70 + Math.random() * 20;
        const baseTemp = 36.5 + Math.random() * 0.6;
        const baseSpo2 = 96 + Math.random() * 3;
        const dataPoints = range === '7d' ? 168 : range === '30d' ? 30 : 12;

        for (let i = 0; i < dataPoints; i++) {
          readings.push({
            patientId: pid,
            heartRate: Math.round(baseHeartRate + (Math.random() - 0.5) * 10),
            temperature: Math.round((baseTemp + (Math.random() - 0.5) * 0.5) * 10) / 10,
            spo2: Math.min(100, Math.round(baseSpo2 + (Math.random() - 0.5) * 2)),
            timestamp: startTime + (i * (now - startTime) / dataPoints)
          });
        }
      });
    }

    // Group readings by time period
    const groupedData = groupReadingsByTime(readings, groupByHours);

    res.json({
      success: true,
      data: {
        readings: groupedData,
        range,
        totalReadings: readings.length,
        sample: isSample
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

  readings.forEach(function(reading) {
    const groupKey = Math.floor(reading.timestamp / intervalMs) * intervalMs;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        timestamp: groupKey,
        date: new Date(groupKey).toISOString().split('T')[0],
        heartRate: [],
        temperature: [],
        spo2: [],
        count: 0
      };
    }

    if (reading.heartRate != null) {
      groups[groupKey].heartRate.push(reading.heartRate);
    }
    if (reading.temperature != null) {
      groups[groupKey].temperature.push(reading.temperature);
    }
    if (reading.spo2 != null) {
      groups[groupKey].spo2.push(reading.spo2);
    }
    groups[groupKey].count++;
  });

  // Calculate averages for each group
  const result = [];
  Object.keys(groups).forEach(function(key) {
    const group = groups[key];
    result.push({
      timestamp: group.timestamp,
      date: group.date,
      heartRate: group.heartRate.length > 0 ? Math.round(group.heartRate.reduce(function(a, b) { return a + b; }, 0) / group.heartRate.length) : null,
      temperature: group.temperature.length > 0 ? Math.round((group.temperature.reduce(function(a, b) { return a + b; }, 0) / group.temperature.length) * 10) / 10 : null,
      spo2: group.spo2.length > 0 ? Math.round(group.spo2.reduce(function(a, b) { return a + b; }, 0) / group.spo2.length) : null,
      count: group.count
    });
  });

  result.sort(function(a, b) {
    return a.timestamp - b.timestamp;
  });

  return result;
}

// GET /api/analytics/insights - Get AI-powered health insights
router.get('/insights', async (req, res) => {
  try {
    const db = getDb();
    if (!db || !getDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const { range = '7d', patientId } = req.query;

    // Get historical data
    const days = { '7d': 7, '30d': 30, '90d': 90 }[range] || 7;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const readings = await loadReadings(db, startTime, patientId, 1000);

    // No stored history: fall back to the live device node so insights reflect current vitals
    if (readings.length === 0) {
      const live = (await db.ref('health').once('value')).val();
      if (live) readings.push({ heartRate: live.heartRate, temperature: live.temperature, spo2: live.spo2, timestamp: Date.now() });
    }

    // Generate AI insights
    const insights = generateAIInsights(readings);

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Analytics insights error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

// Generate AI-powered health insights
function generateAIInsights(readings) {
  if (!readings || readings.length === 0) {
    return {
      insights: "No health data available for analysis.\nPlease ensure your health monitoring device is connected and collecting data.",
      confidence: 1.0,
      source: "System Check"
    };
  }

  // Calculate basic statistics
  const heartRates = readings.map(r => r.heartRate).filter(v => v != null && v > 0);
  const temperatures = readings.map(r => r.temperature).filter(v => v != null && v > 0);
  const spo2s = readings.map(r => r.spo2).filter(v => v != null && v > 0);

  const avgHR = heartRates.length > 0 ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length : 0;
  const avgTemp = temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : 0;
  const avgSpo2 = spo2s.length > 0 ? spo2s.reduce((a, b) => a + b, 0) / spo2s.length : 0;

  // Generate insights based on data patterns
  let insights = [];
  let confidence = 0.85;

  // Heart Rate Analysis
  if (heartRates.length > 0) {
    if (avgHR < 60) {
      insights.push("Heart rate is below normal range (60-100 BPM). Consider consulting a healthcare provider.");
      confidence = Math.min(confidence, 0.9);
    } else if (avgHR > 100) {
      insights.push("Heart rate is elevated. This could indicate stress, exercise, or other factors.");
      confidence = Math.min(confidence, 0.9);
    } else {
      insights.push("Heart rate is within normal range, indicating good cardiovascular health.");
    }
  }

  // Temperature Analysis
  if (temperatures.length > 0) {
    if (avgTemp < 36.1) {
      insights.push("Body temperature is below normal range. This could indicate hypothermia or monitoring issues.");
      confidence = Math.min(confidence, 0.8);
    } else if (avgTemp > 37.5) {
      insights.push("Body temperature is elevated. This could indicate fever, infection, or environmental factors.");
      confidence = Math.min(confidence, 0.8);
    } else {
      insights.push("Body temperature is within normal range, indicating good thermal regulation.");
    }
  }

  // SpO2 Analysis
  if (spo2s.length > 0) {
    if (avgSpo2 < 95) {
      insights.push("Blood oxygen saturation is below normal range (<95%). This requires medical attention.");
      confidence = Math.min(confidence, 0.95);
    } else {
      insights.push("Blood oxygen saturation is within normal range, indicating good respiratory function.");
    }
  }

  // Trend Analysis
  if (readings.length > 10) {
    const recent = readings.slice(-10);
    const older = readings.slice(-20, -10);

    const recentAvgHR = recent.filter(r => r.heartRate).reduce((a, b) => a + b.heartRate, 0) / recent.filter(r => r.heartRate).length;
    const olderAvgHR = older.filter(r => r.heartRate).reduce((a, b) => a + b.heartRate, 0) / older.filter(r => r.heartRate).length;

    if (recentAvgHR && olderAvgHR) {
      const change = ((recentAvgHR - olderAvgHR) / olderAvgHR) * 100;
      if (Math.abs(change) > 10) {
        insights.push(`Heart rate has ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% recently.`);
        confidence = Math.min(confidence, 0.85);
      }
    }
  }

  // Overall Assessment
  const normalRanges = [
    heartRates.length > 0 && avgHR >= 60 && avgHR <= 100,
    temperatures.length > 0 && avgTemp >= 36.1 && avgTemp <= 37.5,
    spo2s.length > 0 && avgSpo2 >= 95
  ].filter(Boolean).length;

  const totalChecks = [heartRates.length > 0, temperatures.length > 0, spo2s.length > 0].filter(Boolean).length;

  if (totalChecks === 0) {
    insights.unshift("Unable to analyze health data - no valid readings found.");
    confidence = 0.0;
  } else if (normalRanges === totalChecks) {
    insights.unshift("All monitored health parameters are within normal ranges. Continue regular monitoring.");
  } else {
    insights.unshift("Some health parameters are outside normal ranges. Review the specific concerns below.");
    confidence = Math.min(confidence, 0.7);
  }

  return {
    insights: insights.join('\n'),
    confidence: confidence,
    source: "AI Health Analysis Engine"
  };
}

module.exports = router;