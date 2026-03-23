/**
 * Charts Module
 * Handles Chart.js initialization and updates
 */

// Chart instances
let healthChart = null;
let alertChart = null;
let patientCharts = {};

// Chart.js default configuration
Chart.defaults.font.family = '\'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif';
Chart.defaults.color = '#6b7280';
Chart.defaults.plugins.legend.labels.usePointStyle = true;

// Color palette
const colors = {
  primary: '#4f46e5',
  primaryLight: '#818cf8',
  secondary: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  heartRate: '#ef4444',
  temperature: '#f59e0b',
  spo2: '#3b82f6',
  bloodPressure: '#8b5cf6'
};

/**
 * Initialize Health Overview Chart
 */
function initHealthChart() {
  const ctx = document.getElementById('healthChart');
  if (!ctx) return;

  const labels = generateTimeLabels(24);

  healthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Heart Rate (BPM)',
          data: generateRandomData(24, 60, 100),
          borderColor: colors.heartRate,
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 6
        },
        {
          label: 'Temperature (°C)',
          data: generateRandomData(24, 36.1, 37.8),
          borderColor: colors.temperature,
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 6,
          yAxisID: 'y1'
        },
        {
          label: 'SpO2 (%)',
          data: generateRandomData(24, 95, 100),
          borderColor: colors.spo2,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 6,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 12
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Heart Rate (BPM)'
          },
          min: 40,
          max: 120
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Temperature (°C)'
          },
          min: 35,
          max: 40,
          grid: {
            drawOnChartArea: false
          }
        },
        y2: {
          type: 'linear',
          display: false,
          min: 90,
          max: 100
        }
      }
    }
  });

  return healthChart;
}

/**
 * Initialize Alert Distribution Chart
 */
function initAlertChart() {
  const ctx = document.getElementById('alertChart');
  if (!ctx) return;

  alertChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Critical', 'Warning', 'Info', 'Resolved'],
      datasets: [{
        data: [5, 12, 8, 45],
        backgroundColor: [
          colors.danger,
          colors.warning,
          colors.info,
          colors.secondary
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
          position: 'bottom'
        }
      }
    }
  });

  return alertChart;
}

/**
 * Update Health Chart with new data
 */
function updateHealthChart(data) {
  if (!healthChart) return;

  healthChart.data.datasets.forEach((dataset, index) => {
    if (data[index]) {
      dataset.data = data[index];
    }
  });

  healthChart.update('none');
}

/**
 * Update Health Chart time range
 */
function updateHealthChartRange(range) {
  if (!healthChart) return;

  let points;
  switch (range) {
    case '1h':
      points = 60;
      break;
    case '6h':
      points = 36;
      break;
    case '7d':
      points = 168;
      break;
    default:
      points = 24;
  }

  const labels = generateTimeLabels(range);
  healthChart.data.labels = labels;
  healthChart.data.datasets.forEach(dataset => {
    dataset.data = generateRandomData(points, 
      dataset.label.includes('Heart') ? 60 : (dataset.label.includes('Temp') ? 36.1 : 95),
      dataset.label.includes('Heart') ? 100 : (dataset.label.includes('Temp') ? 37.8 : 100)
    );
  });

  healthChart.update();
}

/**
 * Create individual patient vital chart
 */
function createPatientVitalsChart(patientId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const ctx = document.createElement('canvas');
  ctx.id = `vitals-${patientId}`;
  container.appendChild(ctx);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: generateTimeLabels(10),
      datasets: [
        {
          label: 'Heart Rate',
          data: generateRandomData(10, 60, 100),
          borderColor: colors.heartRate,
          tension: 0.4,
          pointRadius: 2
        },
        {
          label: 'SpO2',
          data: generateRandomData(10, 95, 100),
          borderColor: colors.spo2,
          tension: 0.4,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          min: 50,
          max: 110
        }
      }
    }
  });

  patientCharts[patientId] = chart;
  return chart;
}

/**
 * Update patient vitals chart
 */
function updatePatientVitalsChart(patientId, data) {
  const chart = patientCharts[patientId];
  if (!chart) return;

  chart.data.datasets.forEach((dataset, index) => {
    if (data[index]) {
      dataset.data.push(data[index]);
      if (dataset.data.length > 10) {
        dataset.data.shift();
      }
    }
  });

  chart.update('none');
}

/**
 * Destroy all charts
 */
function destroyAllCharts() {
  if (healthChart) {
    healthChart.destroy();
    healthChart = null;
  }
  if (alertChart) {
    alertChart.destroy();
    alertChart = null;
  }
  Object.values(patientCharts).forEach(chart => {
    if (chart) chart.destroy();
  });
  patientCharts = {};
}

/**
 * Generate time labels
 */
function generateTimeLabels(range) {
  const labels = [];
  const now = new Date();
  
  let points;
  let interval;
  
  switch (range) {
    case '1h':
      points = 60;
      interval = 60 * 1000; // 1 minute
      break;
    case '6h':
      points = 36;
      interval = 10 * 60 * 1000; // 10 minutes
      break;
    case '7d':
      points = 168;
      interval = 60 * 60 * 1000; // 1 hour
      break;
    default:
      points = 24;
      interval = 60 * 60 * 1000; // 1 hour
  }

  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - (i * interval));
    labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
  }

  return labels;
}

/**
 * Generate random data within range
 */
function generateRandomData(points, min, max) {
  const data = [];
  for (let i = 0; i < points; i++) {
    const value = min + Math.random() * (max - min);
    data.push(parseFloat(value.toFixed(1)));
  }
  return data;
}

/**
 * Get vital status class
 */
function getVitalStatus(value, type) {
  switch (type) {
    case 'heartRate':
      if (value < 60 || value > 100) return 'critical';
      if (value < 65 || value > 95) return 'warning';
      return 'normal';
    case 'temperature':
      if (value < 36.1 || value > 37.8) return 'critical';
      if (value < 36.5 || value > 37.5) return 'warning';
      return 'normal';
    case 'spo2':
      if (value < 92) return 'critical';
      if (value < 95) return 'warning';
      return 'normal';
    case 'bloodPressure':
      if (value.systolic > 140 || value.diastolic > 90) return 'warning';
      return 'normal';
    default:
      return 'normal';
  }
}

// Export functions
window.ChartUtils = {
  initHealthChart,
  initAlertChart,
  updateHealthChart,
  updateHealthChartRange,
  createPatientVitalsChart,
  updatePatientVitalsChart,
  destroyAllCharts,
  getVitalStatus
};
