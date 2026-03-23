/**
 * HealthData Model - Firestore Version
 * Medical IoT Backend - Health monitoring data structure for Firestore
 */

// Firestore collection reference will be passed from service layer
const COLLECTIONS = {
  HEALTH_DATA: 'healthData'
};

/**
 * Health data validation and formatting
 * @param {Object} healthData - Raw health data
 * @returns {Object} - Formatted health data for Firestore
 */
const formatHealthData = (healthData) => {
  const formatted = {
    patientId: healthData.patientId || '',
    deviceId: healthData.deviceId || '',
    timestamp: healthData.timestamp ? new Date(healthData.timestamp) : new Date(),
    heartRate: healthData.heartRate || {
      value: 0,
      unit: 'bpm',
      quality: 'poor'
    },
    temperature: healthData.temperature || {
      value: 0,
      unit: '°C',
      method: 'axillary'
    },
    spo2: healthData.spo2 || {
      value: 0,
      unit: '%',
      quality: 'poor'
    },
    bloodPressure: healthData.bloodPressure || {
      systolic: 0,
      diastolic: 0,
      unit: 'mmHg',
      method: 'oscillometric'
    },
    ecg: healthData.ecg || {
      leads: [],
      heartRate: 0,
      rrInterval: 0,
      prInterval: 0,
      qtInterval: 0,
      qrsDuration: 0
    },
    respiration: healthData.respiration || {
      rate: 0,
      unit: 'breaths/min'
    },
    device: healthData.device || {
      batteryLevel: 0,
      signalStrength: 0,
      firmware: ''
    },
    status: healthData.status || 'normal',
    alerts: healthData.alerts || [],
    metadata: healthData.metadata || {
      environment: {
        temperature: 0,
        humidity: 0
      },
      patientActivity: 'resting',
      notes: ''
    },
    createdAt: healthData.createdAt || new Date(),
    updatedAt: healthData.updatedAt || new Date()
  };

  // Remove null/undefined values for cleaner Firestore docs
  return Object.fromEntries(
    Object.entries(formatted).filter(([_, value]) => value !== null && value !== undefined)
  );
};

/**
 * Validate health data
 * @param {Object} healthData - Health data to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
const validateHealthData = (healthData) => {
  const errors = [];

  if (!healthData.patientId || healthData.patientId.trim() === '') {
    errors.push('Patient ID is required');
  }

  if (!healthData.deviceId || healthData.deviceId.trim() === '') {
    errors.push('Device ID is required');
  }

  // Validate heart rate if present
  if (healthData.heartRate && healthData.heartRate.value !== undefined) {
    const hr = healthData.heartRate.value;
    if (typeof hr !== 'number' || hr < 0 || hr > 250) {
      errors.push('Heart rate must be a number between 0 and 250');
    }
  }

  // Validate temperature if present
  if (healthData.temperature && healthData.temperature.value !== undefined) {
    const temp = healthData.temperature.value;
    if (typeof temp !== 'number' || temp < 30 || temp > 45) {
      errors.push('Temperature must be a number between 30 and 45');
    }
  }

  // Validate SpO2 if present
  if (healthData.spo2 && healthData.spo2.value !== undefined) {
    const spo2 = healthData.spo2.value;
    if (typeof spo2 !== 'number' || spo2 < 0 || spo2 > 100) {
      errors.push('SpO2 must be a number between 0 and 100');
    }
  }

  // Validate blood pressure if present
  if (healthData.bloodPressure) {
    const sys = healthData.bloodPressure.systolic;
    const dia = healthData.bloodPressure.diastolic;
    if (sys !== undefined && (typeof sys !== 'number' || sys < 60 || sys > 250)) {
      errors.push('Systolic blood pressure must be a number between 60 and 250');
    }
    if (dia !== undefined && (typeof dia !== 'number' || dia < 40 || dia > 150)) {
      errors.push('Diastolic blood pressure must be a number between 40 and 150');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Assess overall health status based on readings
 * @param {Object} healthData - Health data to assess
 * @returns {Object} - Status and alerts
 */
const assessHealthStatus = (healthData) => {
  const thresholds = {
    heartRate: { min: 60, max: 100, criticalMax: 120, criticalMin: 40 },
    temperature: { min: 36.1, max: 37.8, criticalMax: 38.5, criticalMin: 35 },
    spo2: { min: 95, criticalMin: 90 },
    bloodPressure: { systolicMax: 140, diastolicMax: 90, systolicCritical: 180, diastolicCritical: 120 }
  };

  let status = 'normal';
  const alerts = [];

  // Check heart rate
  const hr = healthData.heartRate?.value;
  if (hr !== undefined) {
    if (hr > thresholds.heartRate.criticalMax || hr < thresholds.heartRate.criticalMin) {
      status = 'critical';
      alerts.push({ type: 'heartRate', severity: 'critical', message: 'Critical heart rate detected' });
    } else if (hr > thresholds.heartRate.max || hr < thresholds.heartRate.min) {
      if (status !== 'critical') status = 'warning';
      alerts.push({ type: 'heartRate', severity: 'warning', message: 'Abnormal heart rate detected' });
    }
  }

  // Check temperature
  const temp = healthData.temperature?.value;
  if (temp !== undefined) {
    if (temp > thresholds.temperature.criticalMax || temp < thresholds.temperature.criticalMin) {
      status = 'critical';
      alerts.push({ type: 'temperature', severity: 'critical', message: 'Critical temperature detected' });
    } else if (temp > thresholds.temperature.max || temp < thresholds.temperature.min) {
      if (status !== 'critical') status = 'warning';
      alerts.push({ type: 'temperature', severity: 'warning', message: 'Abnormal temperature detected' });
    }
  }

  // Check SpO2
  const spo2 = healthData.spo2?.value;
  if (spo2 !== undefined) {
    if (spo2 < thresholds.spo2.criticalMin) {
      status = 'critical';
      alerts.push({ type: 'spo2', severity: 'critical', message: 'Critical oxygen saturation detected' });
    } else if (spo2 < thresholds.spo2.min) {
      if (status !== 'critical') status = 'warning';
      alerts.push({ type: 'spo2', severity: 'warning', message: 'Low oxygen saturation detected' });
    }
  }

  // Check blood pressure
  const bp = healthData.bloodPressure;
  if (bp) {
    const sys = bp.systolic;
    const dia = bp.diastolic;
    if ((sys !== undefined && (sys > thresholds.bloodPressure.systolicCritical || sys < 60)) ||
        (dia !== undefined && (dia > thresholds.bloodPressure.diastolicCritical || dia < 40))) {
      status = 'critical';
      alerts.push({ type: 'bloodPressure', severity: 'critical', message: 'Critical blood pressure detected' });
    } else if ((sys !== undefined && sys > thresholds.bloodPressure.systolicMax) ||
               (dia !== undefined && dia > thresholds.bloodPressure.diastolicMax)) {
      if (status !== 'critical') status = 'warning';
      alerts.push({ type: 'bloodPressure', severity: 'warning', message: 'High blood pressure detected' });
    }
  }

  return { status, alerts };
};

module.exports = {
  COLLECTIONS,
  formatHealthData,
  validateHealthData,
  assessHealthStatus
};
