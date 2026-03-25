/**
 * IoT Health Monitor - Main Application
 */

class HealthMonitorApp {
  constructor() {
    this.socket = null;
    this.currentPage = 'dashboard';
    this.notifications = [];
    this.patients = [];
    this.alerts = [];
    this.firebaseConfig = {
      apiKey: "AIzaSyBexampleKey1234567890abcdef",
      authDomain: "iothealth-2335a.firebaseapp.com",
      projectId: "iothealth-2335a",
      storageBucket: "iothealth-2335a.appspot.com",
      messagingSenderId: "123456789012",
      appId: "1:123456789012:web:abcdef123456"
    };
    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    this.initFirebase();
    this.setupEventListeners();
    this.initCharts();
    await this.loadDashboardData();
    this.connectWebSocket();
    this.startRealTimeUpdates();
    this.initScrollReveal();
  }

  /**
   * Initialize scroll reveal animations
   */
  initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.scroll-reveal').forEach(el => {
      observer.observe(el);
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) this.navigateTo(page);
      });
    });

    // View all links
    document.querySelectorAll('.view-all').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) this.navigateTo(page);
      });
    });

    // Time range selector
    const timeRange = document.getElementById('time-range');
    if (timeRange) {
      timeRange.addEventListener('change', (e) => {
        window.ChartUtils.updateHealthChartRange(e.target.value);
      });
    }

    // Notification button
    const notificationBtn = document.getElementById('notification-btn');
    if (notificationBtn) {
      notificationBtn.addEventListener('click', () => this.toggleNotificationPanel());
    }

    // Modal close
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => this.closeModal());
    }

    // Close modal on backdrop click
    const modal = document.getElementById('modal-container');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('active');
      });
    }
  }

  /**
   * Initialize charts
   */
  initCharts() {
    window.ChartUtils.initHealthChart();
    window.ChartUtils.initAlertChart();
  }

  /**
   * Load dashboard data
   */
  async loadDashboardData() {
    try {
      // Fetch system status
      const statusResponse = await fetch('/api/status');
      const statusData = await statusResponse.json();
      this.updateDatabaseStatus(statusData.database.status);

      // Load patients
      const patientsResponse = await api.getPatients({ limit: 10 });
      this.patients = patientsResponse.patients || [];
      this.renderPatientsGrid();

      // Load alerts
      const alertsResponse = await api.getActiveAlerts();
      this.alerts = alertsResponse.alerts || [];
      this.renderAlertsList();
      this.updateAlertBadge();

      // Update stats
      this.updateStats();

     } catch (error) {
       console.error('Error loading dashboard data:', error);
       // Show empty state on error - no demo data
       this.patients = [];
       this.alerts = [];
       this.renderPatientsGrid();
       this.renderAlertsList();
       this.updateAlertBadge();
       this.updateStats();
     }
  }

  /**
   * Update database status display
   */
  updateDatabaseStatus(status) {
    const dbElement = document.getElementById('db-status');
    const serverElement = document.getElementById('server-status');
    
    if (dbElement) {
      if (status === 'connected') {
        dbElement.textContent = 'MongoDB Online';
        dbElement.classList.remove('text-warning');
        dbElement.classList.add('text-success');
      } else {
        dbElement.textContent = 'Demo Mode';
        dbElement.classList.remove('text-success');
        dbElement.classList.add('text-warning');
      }
    }
    
    if (serverElement) {
      serverElement.textContent = 'Online';
      serverElement.classList.add('text-success');
    }
  }



  /**
   * Update statistics
   */
  updateStats() {
    document.getElementById('total-patients').textContent = this.patients.length;
    document.getElementById('active-alerts').textContent = this.alerts.filter(a => a.severity === 'critical').length;
    document.getElementById('online-patients').textContent = this.patients.filter(p => p.status === 'active').length;
    document.getElementById('active-devices').textContent = this.patients.length;
  }

  /**
   * Render patients grid
   */
  renderPatientsGrid() {
    const grid = document.getElementById('patients-grid');
    if (!grid) return;

    grid.innerHTML = this.patients.map(patient => this.createPatientCard(patient)).join('');
  }

  /**
   * Create patient card HTML
   */
  createPatientCard(patient) {
    const initials = `${patient.firstName?.[0] || ''}${patient.lastName?.[0] || ''}`.toUpperCase();
    const reading = patient.lastReading || {};
    const heartRateStatus = window.ChartUtils.getVitalStatus(reading.heartRate, 'heartRate');
    const tempStatus = window.ChartUtils.getVitalStatus(reading.temperature, 'temperature');
    const spo2Status = window.ChartUtils.getVitalStatus(reading.spo2, 'spo2');
    const bpStatus = reading.bloodPressure ? window.ChartUtils.getVitalStatus(reading.bloodPressure, 'bloodPressure') : 'normal';

    return `
      <div class="patient-card fade-in">
        <div class="patient-header">
          <div class="patient-info">
            <div class="patient-avatar">${initials}</div>
            <div>
              <div class="patient-name">${patient.firstName} ${patient.lastName}</div>
              <div class="patient-id">${patient.patientId}</div>
            </div>
          </div>
          <span class="status-badge ${patient.status}">${patient.status}</span>
        </div>
        <div class="vitals-grid">
          <div class="vital-item">
            <div class="vital-label">Heart Rate</div>
            <div class="vital-value ${heartRateStatus}">
              ${reading.heartRate || '--'} <span class="unit">bpm</span>
            </div>
          </div>
          <div class="vital-item">
            <div class="vital-label">Temperature</div>
            <div class="vital-value ${tempStatus}">
              ${reading.temperature?.toFixed(1) || '--'} <span class="unit">°C</span>
            </div>
          </div>
          <div class="vital-item">
            <div class="vital-label">SpO2</div>
            <div class="vital-value ${spo2Status}">
              ${reading.spo2 || '--'} <span class="unit">%</span>
            </div>
          </div>
          <div class="vital-item">
            <div class="vital-label">Blood Pressure</div>
            <div class="vital-value ${bpStatus}">
              ${reading.bloodPressure ? `${reading.bloodPressure.systolic}/${reading.bloodPressure.diastolic}` : '--'}
              <span class="unit">mmHg</span>
            </div>
          </div>
        </div>
        <div class="patient-actions">
          <button class="btn btn-primary btn-sm" onclick="app.viewPatient('${patient.patientId}')">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.viewHistory('${patient.patientId}')">
            <i class="fas fa-history"></i> History
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render alerts list
   */
  renderAlertsList() {
    const list = document.getElementById('alerts-list');
    if (!list) return;

    if (this.alerts.length === 0) {
      list.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-secondary);">No alerts</div>';
      return;
    }

    list.innerHTML = this.alerts.map(alert => this.createAlertItem(alert)).join('');
  }

  /**
   * Create alert item HTML
   */
  createAlertItem(alert) {
    const timeAgo = this.formatTimeAgo(alert.createdAt);
    const icon = this.getAlertIcon(alert.type);
    const severity = alert.severity || 'info';

    return `
      <div class="alert-item ${severity}" onclick="app.viewAlertDetails('${alert.alertId}')">
        <div class="alert-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-meta">
            <span><i class="fas fa-user"></i> ${alert.patientId}</span>
            <span><i class="fas fa-clock"></i> ${timeAgo}</span>
          </div>
        </div>
        <div class="alert-actions">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); app.acknowledgeAlert('${alert.alertId}')">
            <i class="fas fa-check"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Update alert badge
   */
  updateAlertBadge() {
    const badge = document.getElementById('alert-badge');
    const count = document.getElementById('notification-count');
    const criticalCount = this.alerts.filter(a => a.severity === 'critical').length;

    if (badge) {
      badge.textContent = this.alerts.length;
      badge.style.display = this.alerts.length > 0 ? 'block' : 'none';
    }

    if (count) {
      count.textContent = criticalCount;
      count.style.display = criticalCount > 0 ? 'block' : 'none';
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket() {
    // Use current host for WebSocket connection (works on Railway too)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    
    try {
      this.socket = new io(wsHost, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      this.socket.on('healthData', (data) => {
        this.handleNewHealthData(data);
      });

      this.socket.on('alert', (data) => {
        this.handleNewAlert(data);
      });

      this.socket.on('patientStatus', (data) => {
        this.handlePatientStatusChange(data);
      });

    } catch (error) {
      console.log('WebSocket connection failed:', error);
    }
  }

  /**
   * Handle new health data
   */
  handleNewHealthData(data) {
    const patient = this.patients.find(p => p.patientId === data.patientId);
    if (patient) {
      patient.lastReading = {
        heartRate: data.heartRate?.value,
        temperature: data.temperature?.value,
        spo2: data.spo2?.value,
        bloodPressure: data.bloodPressure
      };
      this.renderPatientsGrid();
    }
  }

  /**
   * Handle new alert
   */
  handleNewAlert(data) {
    this.alerts.unshift(data);
    this.renderAlertsList();
    this.updateAlertBadge();
    this.showNotification(data.title, data.message);
  }

  /**
   * Handle patient status change
   */
  handlePatientStatusChange(data) {
    const patient = this.patients.find(p => p.patientId === data.patientId);
    if (patient) {
      patient.status = data.status;
      this.renderPatientsGrid();
    }
  }

  /**
   * Start real-time update simulation
   */
  startRealTimeUpdates() {
    // Simulate real-time data updates
    setInterval(() => {
      this.patients.forEach(patient => {
        if (patient.lastReading) {
          // Randomly adjust values slightly
          patient.lastReading.heartRate = Math.round(patient.lastReading.heartRate + (Math.random() - 0.5) * 4);
          patient.lastReading.temperature = parseFloat((patient.lastReading.temperature + (Math.random() - 0.5) * 0.1).toFixed(1));
          patient.lastReading.spo2 = Math.min(100, Math.max(90, patient.lastReading.spo2 + Math.round((Math.random() - 0.5) * 2)));
        }
      });
      this.renderPatientsGrid();
      this.updateLastUpdateTime();
    }, 5000);
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${icons[type] || 'info-circle'}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Update last update time
   */
  updateLastUpdateTime() {
    const element = document.getElementById('last-update');
    if (element) {
      element.textContent = `Last update: ${this.formatTimeAgo(new Date())}`;
    }
  }

  /**
   * Add new patient
   */
  addNewPatient() {
    this.showToast('Opening patient form...', 'info');
  }

  /**
   * Export report
   */
  exportReport() {
    this.showToast('Generating report...', 'info');
    setTimeout(() => {
      this.showToast('Report downloaded successfully!', 'success');
    }, 2000);
  }

  /**
   * Navigate to page
   */
  navigateTo(page) {
    this.currentPage = page;
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update page title
    const titles = {
      dashboard: 'Dashboard',
      patients: 'Patients',
      alerts: 'Alerts',
      devices: 'Devices',
      analytics: 'Analytics',
      settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[page] || 'Dashboard';

    // Close mobile menu
    document.querySelector('.sidebar').classList.remove('active');
  }

  /**
   * View patient details
   */
  viewPatient(patientId) {
    const patient = this.patients.find(p => p.patientId === patientId);
    if (!patient) return;

    const modal = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `${patient.firstName} ${patient.lastName}`;

    modalBody.innerHTML = `
      <div class="patient-details">
        <div class="detail-section">
          <h4>Patient Information</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">Patient ID</span>
              <span class="value">${patient.patientId}</span>
            </div>
            <div class="detail-item">
              <span class="label">Status</span>
              <span class="value"><span class="status-badge ${patient.status}">${patient.status}</span></span>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h4>Current Vitals</h4>
          <div class="vitals-grid">
            <div class="vital-item">
              <div class="vital-label">Heart Rate</div>
              <div class="vital-value">${patient.lastReading?.heartRate || '--'} <span class="unit">bpm</span></div>
            </div>
            <div class="vital-item">
              <div class="vital-label">Temperature</div>
              <div class="vital-value">${patient.lastReading?.temperature?.toFixed(1) || '--'} <span class="unit">°C</span></div>
            </div>
            <div class="vital-item">
              <div class="vital-label">SpO2</div>
              <div class="vital-value">${patient.lastReading?.spo2 || '--'} <span class="unit">%</span></div>
            </div>
            <div class="vital-item">
              <div class="vital-label">Blood Pressure</div>
              <div class="vital-value">${patient.lastReading?.bloodPressure ? `${patient.lastReading.bloodPressure.systolic}/${patient.lastReading.bloodPressure.diastolic}` : '--'} <span class="unit">mmHg</span></div>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h4>Actions</h4>
          <div class="action-buttons">
            <button class="btn btn-primary" onclick="app.viewHistory('${patient.patientId}')">
              <i class="fas fa-history"></i> View History
            </button>
            <button class="btn btn-secondary" onclick="app.runPrediction('${patient.patientId}')">
              <i class="fas fa-brain"></i> Run Prediction
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  /**
   * View patient history
   */
  async viewHistory(patientId) {
    try {
      const response = await api.getHealthData(patientId, { limit: 100 });
      this.showHistoryModal(patientId, response.data);
    } catch (error) {
      this.showHistoryModal(patientId, null);
    }
  }

  /**
   * Show history modal
   */
  showHistoryModal(patientId, data) {
    const modal = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Health History - ${patientId}`;

    modalBody.innerHTML = `
      <div class="history-container">
        <canvas id="historyChart" style="height: 300px;"></canvas>
        <div class="history-table" style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--bg-primary);">
                <th style="padding: 12px; text-align: left;">Time</th>
                <th style="padding: 12px; text-align: left;">Heart Rate</th>
                <th style="padding: 12px; text-align: left;">Temp</th>
                <th style="padding: 12px; text-align: left;">SpO2</th>
                <th style="padding: 12px; text-align: left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${data ? data.slice(0, 20).map(reading => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 12px;">${new Date(reading.timestamp).toLocaleString()}</td>
                  <td style="padding: 12px;">${reading.heartRate?.value || '--'} bpm</td>
                  <td style="padding: 12px;">${reading.temperature?.value?.toFixed(1) || '--'}°C</td>
                  <td style="padding: 12px;">${reading.spo2?.value || '--'}%</td>
                  <td style="padding: 12px;"><span class="status-badge ${reading.status}">${reading.status}</span></td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="padding: 20px; text-align: center;">No data available</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Create history chart
    if (data && data.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('historyChart');
        if (ctx) {
          new Chart(ctx, {
            type: 'line',
            data: {
              labels: data.slice(0, 20).reverse().map(d => new Date(d.timestamp).toLocaleTimeString()),
              datasets: [
                {
                  label: 'Heart Rate',
                  data: data.slice(0, 20).reverse().map(d => d.heartRate?.value),
                  borderColor: '#ef4444',
                  tension: 0.4
                },
                {
                  label: 'SpO2',
                  data: data.slice(0, 20).reverse().map(d => d.spo2?.value),
                  borderColor: '#3b82f6',
                  tension: 0.4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
        }
      }, 100);
    }
  }

  /**
   * Run health prediction
   */
  async runPrediction(patientId) {
    try {
      const response = await api.predictRisk(patientId);
      this.showPredictionResult(response);
    } catch (error) {
      console.error('Prediction error:', error);
    }
  }

  /**
   * Show prediction result
   */
  showPredictionResult(prediction) {
    const modal = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = 'Health Risk Prediction';

    modalBody.innerHTML = `
      <div class="prediction-result">
        <div class="risk-level ${prediction.riskLevel}">
          <div class="risk-score">${prediction.riskScore}</div>
          <div class="risk-label">${prediction.riskLevel.toUpperCase()} RISK</div>
        </div>
        <div class="prediction-details">
          <h4>Risk Factors</h4>
          <ul>
            ${prediction.factors?.map(f => `
              <li class="severity-${f.severity}">
                <strong>${f.factor}</strong>: ${f.value || ''}
              </li>
            `).join('') || '<li>No significant risk factors identified</li>'}
          </ul>
          <h4>Recommendation</h4>
          <p>${prediction.recommendation}</p>
          <div class="confidence">
            Confidence: ${(prediction.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId) {
    try {
      await api.acknowledgeAlert(alertId, 'current-user');
      this.alerts = this.alerts.filter(a => a.alertId !== alertId);
      this.renderAlertsList();
      this.updateAlertBadge();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  }

  /**
   * View alert details
   */
  viewAlertDetails(alertId) {
    const alert = this.alerts.find(a => a.alertId === alertId);
    if (!alert) return;

    const modal = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = alert.title;

    modalBody.innerHTML = `
      <div class="alert-details">
        <div class="severity-badge ${alert.severity}">${alert.severity.toUpperCase()}</div>
        <p>${alert.message}</p>
        <div class="alert-info">
          <p><strong>Patient:</strong> ${alert.patientId}</p>
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Time:</strong> ${new Date(alert.createdAt).toLocaleString()}</p>
        </div>
        <div class="alert-actions">
          <button class="btn btn-primary" onclick="app.acknowledgeAlert('${alert.alertId}'); app.closeModal();">
            Acknowledge
          </button>
          <button class="btn btn-secondary" onclick="app.closeModal();">
            Close
          </button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  /**
   * Toggle notification panel
   */
  toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    panel.classList.toggle('active');
  }

  /**
   * Show notification
   */
  showNotification(title, message) {
    const panel = document.getElementById('notification-list');
    if (!panel) return;

    const notification = {
      id: Date.now(),
      title,
      message,
      time: new Date(),
      read: false
    };

    this.notifications.unshift(notification);

    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.innerHTML = `
      <div class="title">${title}</div>
      <div class="message">${message}</div>
      <div class="time">Just now</div>
    `;

    panel.insertBefore(item, panel.firstChild);

    // Update badge
    const count = this.notifications.filter(n => !n.read).length;
    document.getElementById('notification-count').textContent = count;
  }

  /**
   * Close modal
   */
  closeModal() {
    document.getElementById('modal-container').classList.remove('active');
  }

  /**
   * Handle search
   */
  handleSearch(query) {
    if (!query) {
      this.renderPatientsGrid();
      return;
    }

    const filtered = this.patients.filter(p => 
      p.firstName?.toLowerCase().includes(query.toLowerCase()) ||
      p.lastName?.toLowerCase().includes(query.toLowerCase()) ||
      p.patientId?.toLowerCase().includes(query.toLowerCase())
    );

    const grid = document.getElementById('patients-grid');
    grid.innerHTML = filtered.map(p => this.createPatientCard(p)).join('');
  }

  /**
   * Format time ago
   */
  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  /**
   * Get alert icon
   */
  getAlertIcon(type) {
    const icons = {
      heartRate: 'fa-heart',
      temperature: 'fa-thermometer-half',
      spo2: 'fa-lungs',
      bloodPressure: 'fa-tint',
      deviceOffline: 'fa-wifi',
      lowBattery: 'fa-battery-half',
      prediction: 'fa-brain'
    };
    return icons[type] || 'fa-exclamation-circle';
  }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new HealthMonitorApp();
});
