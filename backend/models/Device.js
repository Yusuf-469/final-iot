/**
 * Device Model - Firestore Version
 * Medical IoT Backend - IoT device information structure for Firestore
 */

// Firestore collection reference will be passed from service layer
const COLLECTIONS = {
  DEVICES: 'devices'
};

/**
 * Device validation and formatting
 * @param {Object} deviceData - Raw device data
 * @returns {Object} - Formatted device data for Firestore
 */
const formatDeviceData = (deviceData) => {
  const formatted = {
    deviceId: deviceData.deviceId || '',
    name: deviceData.name || 'Unknown Device',
    type: deviceData.type || 'ESP32',
    patientId: deviceData.patientId || '',
    status: deviceData.status || 'offline',
    firmware: deviceData.firmware || {
      version: '',
      lastUpdated: null,
      updateAvailable: false
    },
    sensors: deviceData.sensors || [
      { type: 'heartRate', model: '', enabled: true, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'temperature', model: '', enabled: true, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'spo2', model: '', enabled: true, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'bloodPressure', model: '', enabled: true, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'ecg', model: '', enabled: false, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'respiration', model: '', enabled: false, calibration: { offset: 0, scale: 1, lastCalibrated: null } },
      { type: 'accelerometer', model: '', enabled: false, calibration: { offset: 0, scale: 1, lastCalibrated: null } }
    ],
    connectivity: deviceData.connectivity || {
      network: 'wifi',
      wifi: { ssid: '', signalStrength: 0, ip: '' },
      gsm: { imei: '', signalStrength: 0, operator: '' }
    },
    power: deviceData.power || {
      source: 'battery',
      batteryLevel: 100,
      batteryHealth: 100,
      lastCharged: null,
      estimatedBatteryLife: 24
    },
    location: deviceData.location || {
      lat: 0,
      lng: 0,
      address: '',
      lastUpdated: null
    },
    settings: deviceData.settings || {
      samplingRate: 1,
      dataTransmissionInterval: 5,
      alertThreshold: {
        heartRate: { min: 60, max: 100 },
        temperature: { min: 36.1, max: 37.8 },
        spo2: { min: 95 }
      },
      storage: { enabled: false, maxEntries: 1000 }
    },
    lastSeen: deviceData.lastSeen ? new Date(deviceData.lastSeen) : null,
    lastData: deviceData.lastData || {
      timestamp: null,
      heartRate: null,
      temperature: null,
      spo2: null
    },
    maintenance: deviceData.maintenance || {
      lastMaintenance: null,
      nextMaintenance: null,
      maintenanceHistory: []
    },
    metadata: deviceData.metadata || {
      manufacturer: '',
      model: '',
      serialNumber: '',
      purchaseDate: null,
      warrantyExpiry: null,
      notes: ''
    },
    createdAt: deviceData.createdAt ? new Date(deviceData.createdAt) : new Date(),
    updatedAt: deviceData.updatedAt ? new Date(deviceData.updatedAt) : new Date()
  };

  // Remove null/undefined values for cleaner Firestore docs
  return Object.fromEntries(
    Object.entries(formatted).filter(([_, value]) => value !== null && value !== undefined)
  );
};

/**
 * Validate device data
 * @param {Object} deviceData - Device data to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
const validateDevice = (deviceData) => {
  const errors = [];

  if (!deviceData.deviceId || deviceData.deviceId.trim() === '') {
    errors.push('Device ID is required');
  }

  if (!deviceData.name || deviceData.name.trim() === '') {
    errors.push('Device name is required');
  }

  const validTypes = ['ESP32', 'Arduino', 'RaspberryPi', 'custom'];
  if (!deviceData.type || !validTypes.includes(deviceData.type)) {
    errors.push('Device type must be ESP32, Arduino, RaspberryPi, or custom');
  }

  const validStatuses = ['online', 'offline', 'maintenance', 'retired'];
  if (!deviceData.status || !validStatuses.includes(deviceData.status)) {
    errors.push('Device status must be online, offline, maintenance, or retired');
  }

  // Validate battery level if present
  if (deviceData.power && deviceData.power.batteryLevel !== undefined) {
    const level = deviceData.power.batteryLevel;
    if (typeof level !== 'number' || level < 0 || level > 100) {
      errors.push('Battery level must be a number between 0 and 100');
    }
  }

  // Validate battery health if present
  if (deviceData.power && deviceData.power.batteryHealth !== undefined) {
    const health = deviceData.power.batteryHealth;
    if (typeof health !== 'number' || health < 0 || health > 100) {
      errors.push('Battery health must be a number between 0 and 100');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if device is online based on last seen timestamp
 * @param {Object} device - Device document data
 * @param {number} thresholdMinutes - Minutes threshold for offline (default: 5)
 * @returns {boolean} - True if device is online
 */
const isDeviceOnline = (device, thresholdMinutes = 5) => {
  if (!device.lastSeen) return false;
  
  const lastSeen = new Date(device.lastSeen);
  const now = new Date();
  const diffMinutes = (now - lastSeen) / (1000 * 60);
  
  return device.status === 'online' && diffMinutes < thresholdMinutes;
};

/**
 * Update device status
 * @param {Object} device - Device document data
 * @param {string} status - New status
 * @returns {Object} - Updated device data
 */
const updateDeviceStatus = (device, status) => {
  return {
    ...device,
    status,
    lastSeen: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

/**
 * Update device heartbeat (sets status to online)
 * @param {Object} device - Device document data
 * @returns {Object} - Updated device data
 */
const deviceHeartbeat = (device) => {
  return {
    ...device,
    status: 'online',
    lastSeen: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

/**
 * Update device battery level
 * @param {Object} device - Device document data
 * @param {number} level - Battery level (0-100)
 * @returns {Object} - Updated device data
 */
const updateDeviceBattery = (device, level) => {
  const updated = {
    ...device,
    power: {
      ...device.power,
      batteryLevel: Math.max(0, Math.min(100, level))
    },
    lastSeen: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Check if low battery alert should be triggered
  const wasLow = device.power.batteryLevel < 20;
  const isLow = updated.power.batteryLevel < 20;
  
  // Return additional info for alert triggering
  return {
    device: updated,
    shouldTriggerLowBatteryAlert: !wasLow && isLow
  };
};

module.exports = {
  COLLECTIONS,
  formatDeviceData,
  validateDevice,
  isDeviceOnline,
  updateDeviceStatus,
  deviceHeartbeat,
  updateDeviceBattery
};
