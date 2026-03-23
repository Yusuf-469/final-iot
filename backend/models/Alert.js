/**
 * Alert Model - Firestore Version
 * Medical IoT Backend - Health alerts structure for Firestore
 */

// Firestore collection reference will be passed from service layer
const COLLECTIONS = {
  ALERTS: 'alerts'
};

/**
 * Alert validation and formatting
 * @param {Object} alertData - Raw alert data
 * @returns {Object} - Formatted alert data for Firestore
 */
const formatAlertData = (alertData) => {
  const formatted = {
    alertId: alertData.alertId || `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    patientId: alertData.patientId || '',
    deviceId: alertData.deviceId || '',
    type: alertData.type || 'deviceError',
    severity: alertData.severity || 'info',
    status: alertData.status || 'active',
    title: alertData.title || 'Health Alert',
    message: alertData.message || '',
    data: alertData.data || {},
    triggeredBy: alertData.triggeredBy || {},
    notifications: alertData.notifications || [],
    assignedTo: alertData.assignedTo || {},
    resolution: alertData.resolution || {},
    escalation: alertData.escalation || {},
    metadata: alertData.metadata || {},
    createdAt: alertData.createdAt ? new Date(alertData.createdAt) : new Date(),
    updatedAt: alertData.updatedAt ? new Date(alertData.updatedAt) : new Date(),
    acknowledgedAt: alertData.acknowledgedAt ? new Date(alertData.acknowledgedAt) : null,
    resolvedAt: alertData.resolvedAt ? new Date(alertData.resolvedAt) : null,
    expiresAt: alertData.expiresAt ? new Date(alertData.expiresAt) : null
  };

  // Remove null/undefined values for cleaner Firestore docs
  return Object.fromEntries(
    Object.entries(formatted).filter(([_, value]) => value !== null && value !== undefined)
  );
};

/**
 * Validate alert data
 * @param {Object} alertData - Alert data to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
const validateAlert = (alertData) => {
  const errors = [];

  if (!alertData.patientId || alertData.patientId.trim() === '') {
    errors.push('Patient ID is required');
  }

  const validTypes = [
    'heartRate', 'temperature', 'spo2', 'bloodPressure', 'ecg',
    'respiration', 'deviceOffline', 'lowBattery', 'fallDetection',
    'deviceError', 'prediction'
  ];
  if (!alertData.type || !validTypes.includes(alertData.type)) {
    errors.push('Invalid alert type');
  }

  const validSeverities = ['info', 'warning', 'critical', 'emergency'];
  if (!alertData.severity || !validSeverities.includes(alertData.severity)) {
    errors.push('Invalid severity level');
  }

  const validStatuses = ['active', 'acknowledged', 'resolved', 'escalated'];
  if (!alertData.status || !validStatuses.includes(alertData.status)) {
    errors.push('Invalid status');
  }

  if (!alertData.title || alertData.title.trim() === '') {
    errors.push('Alert title is required');
  }

  if (!alertData.message || alertData.message.trim() === '') {
    errors.push('Alert message is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Acknowledge an alert
 * @param {Object} alert - Alert document data
 * @param {string} userId - User ID acknowledging the alert
 * @returns {Object} - Updated alert data
 */
const acknowledgeAlert = (alert, userId) => {
  return {
    ...alert,
    status: 'acknowledged',
    acknowledgedAt: new Date().toISOString(),
    assignedTo: {
      userId,
      assignedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  };
};

/**
 * Resolve an alert
 * @param {Object} alert - Alert document data
 * @param {string} userId - User ID resolving the alert
 * @param {string} method - Resolution method
 * @param {string} notes - Resolution notes
 * @returns {Object} - Updated alert data
 */
const resolveAlert = (alert, userId, method, notes = '') => {
  return {
    ...alert,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    resolution: {
      resolvedBy: userId,
      resolvedAt: new Date().toISOString(),
      method,
      notes
    },
    updatedAt: new Date().toISOString()
  };
};

/**
 * Escalate an alert
 * @param {Object} alert - Alert document data
 * @param {number} level - Escalation level
 * @param {string} escalatedTo - User/team escalated to
 * @param {string} reason - Reason for escalation
 * @returns {Object} - Updated alert data
 */
const escalateAlert = (alert, level, escalatedTo, reason) => {
  return {
    ...alert,
    status: 'escalated',
    severity: 'emergency',
    escalation: {
      level,
      escalatedAt: new Date().toISOString(),
      escalatedTo,
      reason
    },
    updatedAt: new Date().toISOString()
  };
};

module.exports = {
  COLLECTIONS,
  formatAlertData,
  validateAlert,
  acknowledgeAlert,
  resolveAlert,
  escalateAlert
};
