/**
 * Predictions Routes - Firestore Version
 * Medical IoT Backend - AI-based health risk predictions
 */

const express = require('express');
const router = express.Router();
const { db, COLLECTIONS } = require('../database');
const { logger } = require('../utils/logger');

// Simple risk prediction based on health data
const calculateRiskScore = (healthData) => {
  let riskScore = 0;
  const factors = [];
  
  // Heart rate analysis
  if (healthData.heartRate > 100) {
    riskScore += 30;
    factors.push({ factor: 'High Heart Rate', weight: 30, value: healthData.heartRate });
  } else if (healthData.heartRate > 90) {
    riskScore += 15;
    factors.push({ factor: 'Elevated Heart Rate', weight: 15, value: healthData.heartRate });
  } else if (healthData.heartRate < 50) {
    riskScore += 20;
    factors.push({ factor: 'Low Heart Rate', weight: 20, value: healthData.heartRate });
  }
  
  // Temperature analysis
  if (healthData.temperature > 38) {
    riskScore += 25;
    factors.push({ factor: 'Fever', weight: 25, value: healthData.temperature });
  } else if (healthData.temperature > 37.5) {
    riskScore += 10;
    factors.push({ factor: 'Slight Fever', weight: 10, value: healthData.temperature });
  }
  
  // SpO2 analysis
  if (healthData.spo2 < 90) {
    riskScore += 35;
    factors.push({ factor: 'Low Oxygen', weight: 35, value: healthData.spo2 });
  } else if (healthData.spo2 < 95) {
    riskScore += 15;
    factors.push({ factor: 'Below Normal Oxygen', weight: 15, value: healthData.spo2 });
  }
  
  // Blood pressure analysis
  if (healthData.bloodPressure) {
    if (healthData.bloodPressure.systolic > 140) {
      riskScore += 20;
      factors.push({ factor: 'High Systolic BP', weight: 20, value: healthData.bloodPressure.systolic });
    }
    if (healthData.bloodPressure.diastolic > 90) {
      riskScore += 15;
      factors.push({ factor: 'High Diastolic BP', weight: 15, value: healthData.bloodPressure.diastolic });
    }
  }
  
  // Determine risk level
  let riskLevel = 'low';
  if (riskScore >= 70) {
    riskLevel = 'critical';
  } else if (riskScore >= 40) {
    riskLevel = 'high';
  } else if (riskScore >= 20) {
    riskLevel = 'moderate';
  }
  
  return {
    score: Math.min(riskScore, 100),
    level: riskLevel,
    factors
  };
};

// POST /api/predictions/risk - Predict health risk
router.post('/risk', async (req, res) => {
  try {
    const { patientId, historicalData: useHistorical = true } = req.body;
    
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }
    
    // Get latest health data from Firestore
    const latestSnapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (latestSnapshot.empty) {
      return res.status(404).json({ error: 'No health data found for patient' });
    }
    
    const latestDoc = latestSnapshot.docs[0];
    const healthData = latestDoc.data();
    
    // Format health data for risk calculation
    const formattedHealthData = {
      heartRate: healthData.heartRate?.value || 0,
      temperature: healthData.temperature?.value || 0,
      spo2: healthData.spo2?.value || 0,
      bloodPressure: healthData.bloodPressure ? {
        systolic: healthData.bloodPressure.systolic || 0,
        diastolic: healthData.bloodPressure.diastolic || 0
      } : null
    };
    
    // Calculate risk
    const risk = calculateRiskScore(formattedHealthData);
    
    // Get patient info
    const patientSnapshot = await db.collection(COLLECTIONS.PATIENTS)
      .doc(patientId)
      .get();
    
    let patientName = 'Unknown';
    if (patientSnapshot.exists) {
      const patientData = patientSnapshot.data();
      patientName = `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim();
      if (!patientName) patientName = 'Unknown';
    }
    
    const prediction = {
      patientId,
      patientName: patientName || 'Unknown',
      timestamp: new Date().toISOString(),
      risk: {
        score: risk.score,
        level: risk.level,
        factors: risk.factors,
        recommendation: getRecommendation(risk.level)
      },
      latestData: formattedHealthData
    };
    
    logger.info(`Risk prediction for ${patientId}: ${risk.level}`);
    
    res.json(prediction);
    
  } catch (error) {
    logger.error('Error predicting risk:', error);
    res.status(500).json({ error: 'Failed to predict risk' });
  }
});

// GET /api/predictions/:patientId/history - Get prediction history
router.get('/:patientId/history', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 50 } = req.query;
    
    // Get recent health data from Firestore
    const healthDataSnapshot = await db.collection(COLLECTIONS.HEALTH_DATA)
      .where('patientId', '==', patientId)
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();
    
    if (healthDataSnapshot.empty) {
      return res.json({
        patientId,
        predictions: [],
        count: 0
      });
    }
    
    const predictions = [];
    healthDataSnapshot.forEach(doc => {
      const healthData = doc.data();
      
      // Format health data for risk calculation
      const formattedHealthData = {
        heartRate: healthData.heartRate?.value || 0,
        temperature: healthData.temperature?.value || 0,
        spo2: healthData.spo2?.value || 0,
        bloodPressure: healthData.bloodPressure ? {
          systolic: healthData.bloodPressure.systolic || 0,
          diastolic: healthData.bloodPressure.diastolic || 0
        } : null
      };
      
      const risk = calculateRiskScore(formattedHealthData);
      
      predictions.push({
        patientId,
        timestamp: healthData.timestamp ? healthData.timestamp.toDate().toISOString() : new Date().toISOString(),
        risk: {
          score: risk.score,
          level: risk.level
        },
        healthData: formattedHealthData
      });
    });
    
    res.json({
      patientId,
      predictions: predictions.reverse(), // Most recent first
      count: predictions.length
    });
    
  } catch (error) {
    logger.error('Error fetching prediction history:', error);
    res.status(500).json({ error: 'Failed to fetch prediction history' });
  }
});

// Helper to get recommendation based on risk level
function getRecommendation(level) {
  const recommendations = {
    critical: 'IMMEDIATE ATTENTION REQUIRED. Contact healthcare provider immediately.',
    high: 'Elevated risk detected. Monitor closely and consider consulting a doctor.',
    moderate: 'Some risk factors present. Continue monitoring and maintain healthy habits.',
    low: 'Health parameters within normal range. Keep up the good work!'
  };
  
  return recommendations[level] || 'Unable to assess risk level.';
}

module.exports = router;
