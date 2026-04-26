/**
 * API Service
 * Handles all API communications - Railway Optimized
 */

// Detect environment and set API URL accordingly
const getApiBaseUrl = () => {
  // Check for Vercel environment (client-side detection)
  if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('now.sh')) {
    return '/api';
  }

  // Check for local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }

  // Default to relative API path for production
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = localStorage.getItem('authToken');
  }

  // Generic fetch wrapper
  async fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Patients API
  async getPatients(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.fetch(`/patients${queryString ? `?${queryString}` : ''}`);
  }

  async getPatient(patientId) {
    return this.fetch(`/patients/${patientId}`);
  }

  async createPatient(data) {
    return this.fetch('/patients', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updatePatient(patientId, data) {
    return this.fetch(`/patients/${patientId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deletePatient(patientId) {
    return this.fetch(`/patients/${patientId}`, {
      method: 'DELETE'
    });
  }

  // Health Data API
  async getHealthData(patientId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.fetch(`/health-data/${patientId}${queryString ? `?${queryString}` : ''}`);
  }

  async getLatestReading(patientId) {
    return this.fetch(`/health-data/${patientId}/latest`);
  }

  async getHealthSummary(patientId, period = '24h') {
    return this.fetch(`/health-data/${patientId}/summary?period=${period}`);
  }

  async sendHealthData(data) {
    return this.fetch('/health-data', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Alerts API
  async getAlerts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.fetch(`/alerts${queryString ? `?${queryString}` : ''}`);
  }

  async getActiveAlerts() {
    return this.fetch('/alerts/active');
  }

  async acknowledgeAlert(alertId, userId) {
    return this.fetch(`/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
      body: JSON.stringify({ userId })
    });
  }

  async resolveAlert(alertId, userId, method, notes) {
    return this.fetch(`/alerts/${alertId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ userId, method, notes })
    });
  }

  async getAlertStatistics(period = '7d') {
    return this.fetch(`/alerts/statistics?period=${period}`);
  }

  // Predictions API
  async predictRisk(patientId, historicalData = true) {
    return this.fetch('/predictions/risk', {
      method: 'POST',
      body: JSON.stringify({ patientId, historicalData })
    });
  }

  async getPredictionHistory(patientId, limit = 50) {
    return this.fetch(`/predictions/${patientId}/history?limit=${limit}`);
  }

  async detectAnomalies(patientId, threshold = 0.7) {
    return this.fetch(`/predictions/anomaly/${patientId}?threshold=${threshold}`);
  }

  // Devices API
  async getDevices(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.fetch(`/devices${queryString ? `?${queryString}` : ''}`);
  }

  async getDevice(deviceId) {
    return this.fetch(`/devices/${deviceId}`);
  }

  // Auth API
  async login(email, password) {
    return this.fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async signup(email, password, firstName, lastName) {
    return this.fetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName })
    });
  }

  // Dashboard Stats
  async getDashboardStats() {
    const [patients, alerts] = await Promise.all([
      this.getPatients({ status: 'active' }),
      this.getActiveAlerts()
    ]);
    
    return {
      totalPatients: patients.pagination?.total || 0,
      activeAlerts: alerts.count || 0,
      onlinePatients: patients.patients?.filter(p => p.status === 'active').length || 0
    };
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  // Clear authentication token
  clearToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  // Chat API
  async sendChatMessage(message) {
    return this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }


}

// Export singleton instance
const api = new ApiService();
window.api = api;
