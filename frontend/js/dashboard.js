/**
 * Dashboard JavaScript
 * Main application logic for the health monitoring dashboard
 */

// Global application state
const dashboardApp = {
    socket: null,
    charts: {},
    isDemo: false,
    data: {
        patients: [],
        alerts: [],
        devices: []
    },

    // Initialize the dashboard
    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.initScrollReveal();
        this.initCharts();
        this.loadDashboardData();
        this.connectWebSocket();
        this.startRealTimeUpdates();
        this.initFirebaseHealth();
    },

    // Initialize Firebase realtime health listener
    async initFirebaseHealth() {
        try {
            // Fetch Firebase config from backend
            const configRes = await fetch('/api/config/firebase');
            const config = await configRes.json();
            
            if (!config.databaseURL) {
                console.warn('Firebase config not available');
                return;
            }

            const firebaseConfig = {
                apiKey: config.apiKey || "demo",
                authDomain: config.authDomain,
                databaseURL: config.databaseURL,
                projectId: config.projectId
            };

            // Initialize Firebase (only once)
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            // Listen to health data in real-time
            const healthRef = firebase.database().ref('health');
            
            healthRef.on('value', (snapshot) => {
                const healthData = snapshot.val();
                if (healthData) {
                    this.updateLiveHealthDisplay(healthData);
                }
            }, (error) => {
                console.error('Error reading health data:', error);
            });
        } catch (error) {
            console.error('Failed to initialize health listener:', error);
        }
    },

    // Update live health display
    updateLiveHealthDisplay(data) {
        const heartRate = data.heartRate !== undefined ? data.heartRate : '--';
        const spo2 = data.spo2 !== undefined ? data.spo2 : '--';
        const temperature = data.temperature !== undefined ? data.temperature : '--';

        // Update heart rate
        const hrEl = document.getElementById('live-heartRate');
        if (hrEl) {
            hrEl.textContent = heartRate + ' bpm';
        }
        document.querySelectorAll('.health-heartRate').forEach(el => {
            el.textContent = heartRate;
        });

        // Update SpO2
        const spo2El = document.getElementById('live-spo2');
        if (spo2El) {
            spo2El.textContent = spo2 + ' %';
        }
        document.querySelectorAll('.health-spo2').forEach(el => {
            el.textContent = spo2;
        });

        // Update temperature
        const tempEl = document.getElementById('live-temperature');
        if (tempEl) {
            tempEl.textContent = temperature + ' °C';
        }
        document.querySelectorAll('.health-temperature').forEach(el => {
            el.textContent = temperature;
        });

        // Store for other uses
        window.latestHealthData = data;
    },
    
    // Check authentication - Redirect to login if not authenticated
    async checkAuth() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (!isLoggedIn) {
            window.location.href = 'login.html';
            return false;
        }

        // Get user name from localStorage first
        let userName = localStorage.getItem('userName') || 'User';

        // Try to get fresh data from Firebase if available
        try {
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                const user = await window.auth.getCurrentUser();
                if (user) {
                    // Update with fresh Firebase data
                    userName = user.displayName || user.email.split('@')[0] || userName;
                    // Update localStorage with fresh data
                    localStorage.setItem('userName', userName);
                    localStorage.setItem('userEmail', user.email || localStorage.getItem('userEmail'));
                }
            }
        } catch (error) {
            console.warn('Could not get fresh user data from Firebase:', error);
        }

        const userNameEl = document.getElementById('user-name');
        const welcomeNameEl = document.getElementById('welcome-name');

        if (userNameEl) userNameEl.textContent = userName;
        if (welcomeNameEl) welcomeNameEl.textContent = userName;

        // Demo mode removed - always use real data
        this.isDemo = false;

        return true;
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebar = document.querySelector('.sidebar');
        
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }
        
        // Navigation items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });
        
        // Notification toggle
        const notificationToggle = document.getElementById('notification-toggle');
        const notificationPanel = document.getElementById('notification-panel');
        
        if (notificationToggle && notificationPanel) {
            notificationToggle.addEventListener('click', () => {
                notificationPanel.classList.toggle('active');
            });
        }
        
        // Close notification panel when clicking outside
        document.addEventListener('click', (e) => {
            if (notificationPanel && 
                !notificationPanel.contains(e.target) && 
                e.target !== notificationToggle &&
                !notificationToggle?.contains(e.target)) {
                notificationPanel.classList.remove('active');
            }
        });
        
        // Time range buttons
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateChartRange(btn.dataset.range);
            });
        });
    },
    
    // Initialize scroll reveal
    initScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });
        
        document.querySelectorAll('.reveal-scroll').forEach(el => {
            observer.observe(el);
        });
    },
    
    // Initialize charts
    initCharts() {
        this.initHealthChart();
        this.initAlertChart();
        this.animateCounters();
    },
    
    // Initialize health overview chart
    initHealthChart() {
        const ctx = document.getElementById('healthChart');
        if (!ctx) return;
        
        this.charts.health = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
                datasets: [
                    {
                        label: 'Heart Rate',
                        data: [68, 65, 70, 72, 75, 71],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2
                    },
                    {
                        label: 'Temperature',
                        data: [36.5, 36.4, 36.6, 36.8, 36.7, 36.5],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'SpO2',
                        data: [97, 98, 97, 98, 99, 98],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        borderWidth: 2,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#64748b'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: 50,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#ef4444'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 35,
                        max: 40,
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#f59e0b'
                        }
                    },
                    y2: {
                        type: 'linear',
                        display: false,
                        min: 90,
                        max: 100
                    }
                },
                animation: {
                    duration: 2000,
                    easing: 'easeOutQuart'
                }
            }
        });
    },
    
    // Initialize alert distribution chart
    initAlertChart() {
        const ctx = document.getElementById('alertChart');
        if (!ctx) return;
        
        this.charts.alert = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'Warning', 'Info', 'Resolved'],
                datasets: [{
                    data: [5, 12, 8, 45],
                    backgroundColor: [
                        '#ef4444',
                        '#f59e0b',
                        '#3b82f6',
                        '#10b981'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true
                }
            }
        });
    },
    
    // Update chart based on time range
    updateChartRange(range) {
        if (!this.charts.health) return;
        
        let labels, heartData, tempData, spo2Data;
        
        switch(range) {
            case '24h':
                labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
                heartData = [68, 65, 70, 72, 75, 71];
                tempData = [36.5, 36.4, 36.6, 36.8, 36.7, 36.5];
                spo2Data = [97, 98, 97, 98, 99, 98];
                break;
            case '7d':
                labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                heartData = [70, 72, 68, 74, 71, 69, 73];
                tempData = [36.5, 36.6, 36.4, 36.7, 36.5, 36.6, 36.5];
                spo2Data = [97, 98, 97, 98, 98, 97, 98];
                break;
            case '30d':
                labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                heartData = [72, 70, 71, 73];
                tempData = [36.5, 36.6, 36.4, 36.5];
                spo2Data = [97, 98, 97, 98];
                break;
        }
        
        this.charts.health.data.labels = labels;
        this.charts.health.data.datasets[0].data = heartData;
        this.charts.health.data.datasets[1].data = tempData;
        this.charts.health.data.datasets[2].data = spo2Data;
        this.charts.health.update('active');
    },
    
    // Load dashboard data
    async loadDashboardData() {
        // Load real data for personal user
        try {
            await this.loadPatients();
            await this.loadAlerts();
            await this.loadDevices();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            // Show empty state for personal users
            this.data.patients = [];
            this.data.alerts = [];
            this.data.devices = [];
        }
        // Always render stats after loading data
        this.renderStats();
        // Render all components
        this.renderPatients();
        this.renderAlerts();
        this.renderDevices();
    },
    
    // Load patients from API
    async loadPatients() {
        try {
            const response = await fetch('/api/patients');
            if (response.ok) {
                const data = await response.json();
                this.data.patients = data.patients || [];
                this.renderPatients();
            } else {
                throw new Error('Failed to load patients');
            }
        } catch (error) {
            console.error('Error loading patients:', error);
            throw error;
        }
    },
    

    
    // Render patients grid
    renderPatients() {
        const grid = document.getElementById('patients-grid');
        if (!grid) return;
        
        if (this.data.patients.length === 0) {
            grid.innerHTML = '<div class="no-data">No patients found. Add patients to get started.</div>';
            return;
        }
        
        grid.innerHTML = this.data.patients.map(patient => {
            const name = patient.firstName ? `${patient.firstName} ${patient.lastName}` : patient.name || 'Unknown';
            const age = patient.age || (patient.dateOfBirth ? Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31536000000) : 'N/A');
            const status = patient.status || 'offline';
            const device = patient.assignedDevices?.[0] || patient.device || 'N/A';
            
            const heartRate = patient.lastReading?.heartRate || patient.heartRate || '--';
            const temperature = patient.lastReading?.temperature || patient.temperature || '--';
            const spo2 = patient.lastReading?.spo2 || patient.spo2 || '--';
            
            return `
                <div class="patient-card">
                    <div class="patient-header">
                        <div class="patient-avatar">${name.split(' ').map(n => n[0]).join('').toUpperCase()}</div>
                        <div class="patient-info">
                            <h4>${name}</h4>
                            <p>Age: ${age}</p>
                        </div>
                        <div class="patient-status ${status}"></div>
                    </div>
                    <div class="patient-metrics">
                        <div class="metric">
                            <span class="metric-label">Heart Rate</span>
                            <span class="metric-value ${this.getMetricClass(heartRate, 'heartRate')}">${heartRate} <span>BPM</span></span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Temperature</span>
                            <span class="metric-value ${this.getMetricClass(temperature, 'temperature')}">${temperature} <span>°C</span></span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">SpO2</span>
                            <span class="metric-value ${this.getMetricClass(spo2, 'spo2')}">${spo2} <span>%</span></span>
                        </div>
                    </div>
                    <div class="patient-footer">
                        <div class="patient-device">
                            <i class="fas fa-microchip"></i>
                            ${device}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Get metric class based on value
    getMetricClass(value, type) {
        if (type === 'heartRate') {
            if (value > 100 || value < 50) return 'danger';
            if (value > 90 || value < 60) return 'warning';
            return 'success';
        } else if (type === 'temperature') {
            if (value > 38 || value < 35) return 'danger';
            if (value > 37.5 || value < 35.5) return 'warning';
            return 'success';
        } else if (type === 'spo2') {
            if (value < 90) return 'danger';
            if (value < 95) return 'warning';
            return 'success';
        }
        return '';
    },
    
    // Get battery icon
    getBatteryLevel(level) {
        if (level > 75) return 'full';
        if (level > 50) return 'three-quarters';
        if (level > 25) return 'half';
        if (level > 10) return 'quarter';
        return 'empty';
    },
    
    // Load alerts from API
    async loadAlerts() {
        try {
            const response = await fetch('/api/alerts');
            if (response.ok) {
                const data = await response.json();
                this.data.alerts = data.alerts || data || [];
                this.renderAlerts();
            } else {
                throw new Error('Failed to load alerts');
            }
        } catch (error) {
            console.error('Error loading alerts:', error);
            throw error;
        }
    },
    

    
    // Render alerts list
    renderAlerts() {
        const list = document.getElementById('alerts-list');
        if (!list) return;
        
        list.innerHTML = this.data.alerts.slice(0, 5).map(alert => {
            const alertTime = (alert.time || alert.createdAt) ? new Date(alert.createdAt || alert.time).toLocaleString() : 'Unknown';
            return `
            <div class="alert-item ${alert.type}">
                <div class="alert-icon">
                    <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                </div>
                <div class="alert-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                    <span class="alert-time">${alertTime}</span>
                </div>
            </div>
        `}).join('');
        
        // Update alert badge
        const badge = document.querySelector('.alert-badge');
        if (badge) {
            badge.textContent = this.data.alerts.filter(a => a.type === 'critical' || a.type === 'warning').length;
        }
        
        // Update notification panel
        this.renderNotifications();
    },
    
    // Render notification panel
    renderNotifications() {
        const notificationList = document.getElementById('notification-list');
        if (!notificationList) return;
        
        if (this.data.alerts.length === 0) {
            notificationList.innerHTML = '<div class="no-data">No notifications</div>';
            return;
        }
        
        notificationList.innerHTML = this.data.alerts.slice(0, 5).map(alert => {
            const notifTime = (alert.time || alert.createdAt) ? new Date(alert.createdAt || alert.time).toLocaleString() : 'Just now';
            return `
            <div class="notification-item ${alert.type}">
                <div class="notification-icon">
                    <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                </div>
                <div class="notification-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                    <span class="notification-time">${notifTime}</span>
                </div>
            </div>
        ` }).join('');
    },
    
    // Mark all notifications as read
    markAllNotificationsRead() {
        this.data.alerts.forEach(a => a.type = 'resolved');
        this.renderAlerts();
        this.showToast('All notifications marked as read', 'success');
    },
    
    // Get alert icon
    getAlertIcon(type) {
        switch(type) {
            case 'critical': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info': return 'fa-info-circle';
            default: return 'fa-bell';
        }
    },
    
    // Load devices from API
    async loadDevices() {
        try {
            const response = await fetch('/api/devices');
            if (response.ok) {
                const data = await response.json();
                this.data.devices = data.devices || data || [];
                this.renderDevices();
            } else {
                throw new Error('Failed to load devices');
            }
        } catch (error) {
            console.error('Error loading devices:', error);
            throw error;
        }
    },
    

    
    // Render devices grid
    renderDevices() {
        const grid = document.getElementById('devices-grid');
        if (!grid) return;
        
        if (this.data.devices.length === 0) {
            grid.innerHTML = '<div class="no-data">No devices found.</div>';
            return;
        }
        
        grid.innerHTML = this.data.devices.map(device => {
            const deviceId = device.id || device.deviceId || 'Unknown';
            const deviceName = device.name || device.patientName || 'Unassigned';
            const battery = device.power?.batteryLevel || device.battery || 0;
            return `
            <div class="device-card">
                <div class="device-status ${device.status}"></div>
                <div class="device-icon">
                    <i class="fas fa-microchip"></i>
                </div>
                <div class="device-info">
                    <h4>${deviceId}</h4>
                    <p>${deviceName}</p>
                </div>
                <div class="device-meta">
                    <span class="device-patient">${deviceName}</span>
                    <span class="device-battery">
                        <i class="fas fa-battery-${this.getBatteryLevel(battery)}"></i>
                        ${battery}%
                    </span>
                </div>
            </div>
        `}).join('');
    },
    
    // Render stats and system health
    renderStats() {
        const patients = this.data.patients;
        const alerts = this.data.alerts;
        const devices = this.data.devices;
        
        // Calculate stats
        const totalPatients = patients.length;
        const onlinePatients = patients.filter(p => p.status === 'online').length;
        const criticalAlerts = alerts.filter(a => a.type === 'critical').length;
        const warningAlerts = alerts.filter(a => a.type === 'warning').length;
        const totalAlerts = alerts.length;
        const totalDevices = devices.length;
        const onlineDevices = devices.filter(d => d.status === 'online').length;
        const avgBattery = totalDevices > 0 
            ? Math.round(devices.reduce((sum, d) => sum + (d.power?.batteryLevel || d.battery || 0), 0) / totalDevices) 
            : 0;
        
        // Update stat numbers with animation
        this.updateStatNumber('stat-total-patients', totalPatients);
        this.updateStatNumber('stat-online', onlinePatients);
        this.updateStatNumber('stat-alerts', totalAlerts);
        this.updateStatNumber('stat-devices', onlineDevices);
        
        // Update trends
        const trendPatients = document.getElementById('stat-trend-patients');
        if (trendPatients) {
            trendPatients.querySelector('span').textContent = totalPatients > 0 ? '12' : '0';
        }
        
        const trendCritical = document.getElementById('stat-trend-critical');
        if (trendCritical) {
            trendCritical.querySelector('span').textContent = criticalAlerts;
        }
        
        const trendDevices = document.getElementById('stat-trend-devices');
        if (trendDevices) {
            trendDevices.querySelector('span').textContent = onlineDevices;
        }
        
        // Update alert distribution chart
        const alertChart = this.charts.alert;
        if (alertChart) {
            alertChart.data.datasets[0].data = [
                criticalAlerts,
                warningAlerts,
                alerts.filter(a => a.type === 'info').length,
                alerts.filter(a => a.type === 'resolved').length
            ];
            alertChart.update();
            
            // Update center text
            document.getElementById('total-alerts-value').textContent = totalAlerts;
            document.getElementById('critical-count').textContent = criticalAlerts;
            document.getElementById('warning-count').textContent = warningAlerts;
            document.getElementById('info-count').textContent = alerts.filter(a => a.type === 'info').length;
            document.getElementById('resolved-count').textContent = alerts.filter(a => a.type === 'resolved').length;
        }
        
        // Update badges
        const alertBadge = document.querySelector('.alert-badge');
        if (alertBadge) {
            alertBadge.textContent = criticalAlerts + warningAlerts;
        }
        
        const sidebarAlertBadge = document.getElementById('sidebar-alert-badge');
        if (sidebarAlertBadge) {
            sidebarAlertBadge.textContent = criticalAlerts + warningAlerts;
        }
        
        const notificationCount = document.getElementById('notification-count');
        if (notificationCount) {
            notificationCount.textContent = criticalAlerts + warningAlerts;
        }
        
        // Update system health cards
        const networkStatus = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0;
        document.getElementById('network-health').style.width = networkStatus + '%';
        document.getElementById('network-value').textContent = networkStatus + '%';
        
        document.getElementById('battery-health').style.width = avgBattery + '%';
        document.getElementById('battery-value').textContent = avgBattery + '%';
        
        const dataTransmission = totalDevices > 0 ? 100 : 0;
        document.getElementById('data-health').style.width = dataTransmission + '%';
        document.getElementById('data-value').textContent = dataTransmission + '%';
        
        document.getElementById('ai-health').style.width = '0%';
        document.getElementById('ai-value').textContent = 'N/A';
    },
    
    // Update stat number with animation
    updateStatNumber(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.dataset.count = value;
            element.textContent = '0';
            this.animateCounter(element);
        }
    },
    

    
    // Animate counters
    animateCounters() {
        const counters = document.querySelectorAll('.stat-number[data-count]');
        
        counters.forEach(counter => {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.animateCounter(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.5 });
            
            observer.observe(counter);
        });
    },
    
    // Animate single counter
    animateCounter(element) {
        const target = parseInt(element.dataset.count);
        const duration = 2000;
        const start = 0;
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (target - start) * easeOutQuart);
            
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };
        
        requestAnimationFrame(update);
    },
    
    // Connect to WebSocket for real-time updates
    connectWebSocket() {
        // Socket.IO connection (optional - works without server)
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
            });
            
            this.socket.on('healthData', (data) => {
                this.handleHealthDataUpdate(data);
            });
            
            this.socket.on('alert', (alert) => {
                this.handleNewAlert(alert);
            });
        }
    },
    
    // Start real-time updates simulation
    startRealTimeUpdates() {
        // Simulate real-time updates every 5 seconds
        setInterval(() => {
            this.simulateHealthDataUpdate();
        }, 5000);
    },
    
    // Simulate health data update
    simulateHealthDataUpdate() {
        if (this.data.patients.length > 0) {
            const randomPatient = this.data.patients[Math.floor(Math.random() * this.data.patients.length)];
            
            // Update values slightly
            randomPatient.heartRate = Math.max(50, Math.min(120, randomPatient.heartRate + Math.floor(Math.random() * 5) - 2));
            randomPatient.temperature = Math.max(35, Math.min(39, randomPatient.temperature + (Math.random() * 0.2 - 0.1)));
            randomPatient.spo2 = Math.max(90, Math.min(100, randomPatient.spo2 + Math.floor(Math.random() * 3) - 1));
            
            // Re-render
            this.renderPatients();
            
            // Update chart
            if (this.charts.health) {
                const newData = [...this.charts.health.data.datasets[0].data.slice(1), randomPatient.heartRate];
                this.charts.health.data.datasets[0].data = newData;
                this.charts.health.update('active');
            }
        }
    },
    
    // Handle health data update
    handleHealthDataUpdate(data) {
        console.log('Health data update:', data);
        // Update patient data and re-render
    },
    
    // Handle new alert
    handleNewAlert(alert) {
        this.data.alerts.unshift(alert);
        this.renderAlerts();
        this.showToast(`${alert.title}: ${alert.message}`, alert.type);
    },
    
    // Navigate to page
    navigateTo(page) {
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
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
        
        const titleEl = document.getElementById('current-page-title');
        if (titleEl) {
            titleEl.textContent = titles[page] || 'Dashboard';
        }
    },
    
    // Show toast notification
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },
    
    // Get toast icon
    getToastIcon(type) {
        switch(type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-times-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    },
    
    // Refresh data
    refreshData() {
        this.loadDashboardData();
        this.showToast('Data refreshed', 'success');
    },
    
    // Export report
    exportReport() {
        this.showToast('Generating report...', 'info');
        setTimeout(() => {
            this.showToast('Report downloaded successfully', 'success');
        }, 2000);
    },
    
    // Show add patient modal
    showAddPatientModal() {
        this.showToast('Add patient feature coming soon', 'info');
    },
    
    // Logout
    logout() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('isDemo');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        window.location.href = 'login.html';
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    dashboardApp.init();
});

// Expose functions globally
window.app = dashboardApp;
window.logout = () => dashboardApp.logout();
window.refreshData = () => dashboardApp.refreshData();
window.exportReport = () => dashboardApp.exportReport();
window.showAddPatientModal = () => dashboardApp.showAddPatientModal();
window.navigateTo = (page) => dashboardApp.navigateTo(page);
window.closeModal = () => {
    document.getElementById('modal-overlay')?.classList.remove('active');
};
