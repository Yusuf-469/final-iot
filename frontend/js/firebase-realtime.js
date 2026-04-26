/**
 * Frontend Firebase Configuration
 * Real-time database listeners for live data streaming
 */

// Firebase configuration (will be loaded from API)

// Global Firebase app instance
let firebaseApp = null;
let database = null;
let realtimeListeners = {};

// Initialize Firebase for real-time data
async function initFirebaseRealtime() {
  try {
    console.log('🔄 Initializing Firebase real-time listeners...');

    // Get Firebase config from backend API
    const response = await fetch('/api/config/firebase');
    if (!response.ok) {
      throw new Error('Failed to get Firebase config');
    }

    const config = await response.json();
    if (!config.success || !config.data) {
      throw new Error('Invalid Firebase config');
    }

    // Update config with real values
    firebaseConfig.databaseURL = config.data.databaseURL;
    firebaseConfig.projectId = config.data.projectId;

    // Initialize Firebase if not already done
    if (!firebaseApp && typeof firebase !== 'undefined') {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      database = firebase.database();
      console.log('✅ Firebase real-time initialized');
    }

    // Setup real-time listeners
    setupRealtimeListeners();

    return true;
  } catch (error) {
    console.error('❌ Firebase real-time initialization failed:', error);
    return false;
  }
}

// Setup real-time database listeners
function setupRealtimeListeners() {
  if (!database) return;

  console.log('📡 Setting up real-time listeners...');

  // Health data listener
  realtimeListeners.health = database.ref('health').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      console.log('💓 Health data updated:', data);
      updateHealthDisplays(data);
      updateDashboardHealth(data);
      updateDrAIHealth(data);
    }
  });

  // Patients data listener
  realtimeListeners.patients = database.ref('patients').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      console.log('👥 Patients data updated:', Object.keys(data).length, 'patients');
      updatePatientsList(data);
      updateDashboardStats(data);
    }
  });

  // Alerts listener
  realtimeListeners.alerts = database.ref('alerts').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      console.log('🚨 Alerts updated:', Object.keys(data).length, 'alerts');
      updateAlertsList(data);
      updateAlertBadges(data);
    }
  });

  // Device status listener
  realtimeListeners.devices = database.ref('devices').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      console.log('🔧 Devices updated:', Object.keys(data).length, 'devices');
      updateDevicesList(data);
    }
  });
}

// Update health displays across all pages
function updateHealthDisplays(healthData) {
  // Update dashboard health display
  if (typeof window.dashboardApp !== 'undefined' && window.dashboardApp.updateLiveHealthDisplay) {
    window.dashboardApp.updateLiveHealthDisplay(healthData);
  }

  // Update Dr. AI health indicators
  updateDrAIHealth(healthData);

  // Dispatch custom event for other components
  const event = new CustomEvent('healthDataUpdate', { detail: healthData });
  document.dispatchEvent(event);
}

// Update dashboard health data
function updateDashboardHealth(healthData) {
  if (typeof window.dashboardApp !== 'undefined') {
    // Update charts with real-time data
    if (window.dashboardApp.updateHealthChart) {
      window.dashboardApp.updateHealthChart(healthData);
    }
  }
}

// Update Dr. AI health indicators
function updateDrAIHealth(healthData) {
  const hrEl = document.getElementById('dr-ai-hr');
  const tempEl = document.getElementById('dr-ai-temp');
  const spo2El = document.getElementById('dr-ai-spo2');

  if (hrEl && healthData.heartRate) {
    hrEl.textContent = healthData.heartRate;
    hrEl.className = 'dr-ai-health-value ' + getHealthClass(healthData.heartRate, 60, 100);
  }

  if (tempEl && healthData.temperature) {
    tempEl.textContent = healthData.temperature + '°C';
    tempEl.className = 'dr-ai-health-value ' + getHealthClass(healthData.temperature, 36.1, 37.5);
  }

  if (spo2El && healthData.spo2) {
    spo2El.textContent = healthData.spo2 + '%';
    spo2El.className = 'dr-ai-health-value ' + getHealthClass(healthData.spo2, 95, 100);
  }
}

// Get health status class
function getHealthClass(value, min, max) {
  if (value < min || value > max) return 'danger';
  if (value < min * 1.1 || value > max * 0.9) return 'warning';
  return '';
}

// Update patients list
function updatePatientsList(patientsData) {
  // Update dashboard patients
  if (typeof window.dashboardApp !== 'undefined' && window.dashboardApp.updatePatientsList) {
    window.dashboardApp.updatePatientsList(patientsData);
  }

  // Update patients page
  if (typeof window.loadPatientsPage === 'function') {
    // Trigger refresh of patients page data
    const event = new CustomEvent('patientsDataUpdate', { detail: patientsData });
    document.dispatchEvent(event);
  }
}

// Update dashboard stats
function updateDashboardStats(patientsData) {
  if (typeof window.dashboardApp !== 'undefined' && window.dashboardApp.renderStats) {
    // Recalculate stats with new data
    const patients = Object.values(patientsData || {});
    window.dashboardApp.data.patients = patients;
    window.dashboardApp.renderStats();
  }
}

// Update alerts list
function updateAlertsList(alertsData) {
  // Update alerts page
  if (typeof window.loadAlertsPage === 'function') {
    const event = new CustomEvent('alertsDataUpdate', { detail: alertsData });
    document.dispatchEvent(event);
  }
}

// Update alert badges
function updateAlertBadges(alertsData) {
  const alerts = Object.values(alertsData || {});
  const activeAlerts = alerts.filter(a => a.status === 'active').length;

  // Update sidebar badge
  const sidebarBadge = document.getElementById('sidebar-alert-badge');
  if (sidebarBadge) {
    sidebarBadge.textContent = activeAlerts;
    sidebarBadge.style.display = activeAlerts > 0 ? 'inline' : 'none';
  }
}

// Update devices list
function updateDevicesList(devicesData) {
  // Update devices page
  if (typeof window.loadDevicesPage === 'function') {
    const event = new CustomEvent('devicesDataUpdate', { detail: devicesData });
    document.dispatchEvent(event);
  }
}

// Cleanup listeners when page unloads
window.addEventListener('beforeunload', () => {
  if (database && realtimeListeners) {
    Object.values(realtimeListeners).forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  }
});

// Export functions for global use
window.initFirebaseRealtime = initFirebaseRealtime;
window.firebaseApp = firebaseApp;
window.database = database;