/**
 * Patient Model - Firestore Version
 * Medical IoT Backend - Patient data structure for Firestore
 */

// Firestore collection reference will be passed from service layer
const COLLECTIONS = {
  PATIENTS: 'patients'
};

/**
 * Patient data validation and formatting
 * @param {Object} patientData - Raw patient data
 * @returns {Object} - Formatted patient data for Firestore
 */
const formatPatientData = (patientData) => {
  const formatted = {
    patientId: patientData.patientId || null,
    firstName: patientData.firstName || '',
    lastName: patientData.lastName || '',
    email: patientData.email?.toLowerCase() || '',
    phone: patientData.phone || '',
    dateOfBirth: patientData.dateOfBirth ? new Date(patientData.dateOfBirth) : null,
    gender: patientData.gender || 'other',
    address: patientData.address || {},
    emergencyContact: patientData.emergencyContact || {},
    medicalHistory: patientData.medicalHistory || [],
    medications: patientData.medications || [],
    assignedDevices: patientData.assignedDevices || [],
    alertSettings: patientData.alertSettings || {
      heartRate: { min: 60, max: 100 },
      temperature: { min: 36.1, max: 37.8 },
      spo2: { min: 95 },
      bloodPressure: { systolicMax: 140, diastolicMax: 90 },
      alertMethods: { email: true, sms: true, push: true }
    },
    caregivers: patientData.caregivers || [],
    status: patientData.status || 'active',
    lastReading: patientData.lastReading || null,
    createdAt: patientData.createdAt || new Date(),
    updatedAt: patientData.updatedAt || new Date()
  };

  // Remove null/undefined values for cleaner Firestore docs
  return Object.fromEntries(
    Object.entries(formatted).filter(([_, value]) => value !== null && value !== undefined)
  );
};

/**
 * Validate patient data
 * @param {Object} patientData - Patient data to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
const validatePatient = (patientData) => {
  const errors = [];

  if (!patientData.firstName || patientData.firstName.trim() === '') {
    errors.push('First name is required');
  }

  if (!patientData.lastName || patientData.lastName.trim() === '') {
    errors.push('Last name is required');
  }

  if (!patientData.email || !/\S+@\S+\.\S+/.test(patientData.email)) {
    errors.push('Valid email is required');
  }

  if (!patientData.phone || patientData.phone.trim() === '') {
    errors.push('Phone number is required');
  }

  if (!patientData.dateOfBirth) {
    errors.push('Date of birth is required');
  } else {
    const birthDate = new Date(patientData.dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      errors.push('Invalid date of birth');
    }
  }

  const validGenders = ['male', 'female', 'other'];
  if (!patientData.gender || !validGenders.includes(patientData.gender)) {
    errors.push('Gender must be male, female, or other');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if health reading is abnormal based on patient settings
 * @param {Object} patient - Patient document data
 * @param {Object} reading - Health reading to check
 * @returns {Array} - Array of alert objects
 */
const checkAbnormalReading = (patient, reading) => {
  const alerts = [];
  const alertSettings = patient.alertSettings || {
    heartRate: { min: 60, max: 100 },
    temperature: { min: 36.1, max: 37.8 },
    spo2: { min: 95 },
    bloodPressure: { systolicMax: 140, diastolicMax: 90 }
  };

  // Heart rate check
  if (reading.heartRate !== undefined) {
    if (reading.heartRate < alertSettings.heartRate.min || 
        reading.heartRate > alertSettings.heartRate.max) {
      alerts.push({
        type: 'heartRate',
        severity: 'critical',
        message: `Abnormal heart rate: ${reading.heartRate} bpm (normal: ${alertSettings.heartRate.min}-${alertSettings.heartRate.max})`
      });
    }
  }

  // Temperature check
  if (reading.temperature !== undefined) {
    if (reading.temperature < alertSettings.temperature.min || 
        reading.temperature > alertSettings.temperature.max) {
      alerts.push({
        type: 'temperature',
        severity: reading.temperature > 38 ? 'critical' : 'warning',
        message: `Abnormal temperature: ${reading.temperature}°C (normal: ${alertSettings.temperature.min}-${alertSettings.temperature.max})`
      });
    }
  }

  // SpO2 check
  if (reading.spo2 !== undefined) {
    if (reading.spo2 < alertSettings.spo2.min) {
      alerts.push({
        type: 'spo2',
        severity: 'critical',
        message: `Low blood oxygen: ${reading.spo2}% (minimum: ${alertSettings.spo2.min}%)`
      });
    }
  }

  // Blood pressure check
  if (reading.bloodPressure) {
    const bp = reading.bloodPressure;
    if (bp.systolic > alertSettings.bloodPressure.systolicMax || 
        bp.diastolic > alertSettings.bloodPressure.diastolicMax) {
      alerts.push({
        type: 'bloodPressure',
        severity: 'critical',
        message: `High blood pressure: ${bp.systolic}/${bp.diastolic} mmHg`
      });
    }
  }

  return alerts;
};

module.exports = {
  COLLECTIONS,
  formatPatientData,
  validatePatient,
  checkAbnormalReading
};
