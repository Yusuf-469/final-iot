/**
 * Devices Routes - Realtime Database Version
 * Medical IoT Backend - Device management endpoints
 */

const express = require('express');
const router = express.Router();
const { collection, COLLECTIONS } = require('../database');
const { logger } = require('../utils/logger');

// Helper to format device data from Realtime Database
const formatDeviceData = (key, data) => {
  return {
    id: key,
    ...data,
    lastSeen: data.lastSeen || new Date().toISOString(),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    firmware: data.firmware || {},
    power: data.power || {},
    connectivity: data.connectivity || {},
    location: data.location || {},
    settings: data.settings || {},
    maintenance: data.maintenance || {},
    metadata: data.metadata || {}
  };
};

// GET /api/devices - Get all devices
router.get('/', async (req, res) => {
  try {
    const devicesRef = collection(COLLECTIONS.DEVICES);

    if (!devicesRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await devicesRef.once('value');
    const devicesData = snapshot.val() || {};

    const devices = Object.keys(devicesData).map(key => {
      return formatDeviceData(key, devicesData[key]);
    });
    
    // Apply basic filtering (Realtime DB doesn't support complex queries)
    let filteredDevices = devices;
    if (status) {
      filteredDevices = filteredDevices.filter(d => d.status === status);
    }
    if (patientId) {
      filteredDevices = filteredDevices.filter(d => d.patientId === patientId);
    }

    // Apply pagination
    const limitNum = parseInt(limit) || 100;
    const skipNum = parseInt(skip) || 0;
    const paginatedDevices = filteredDevices.slice(skipNum, skipNum + limitNum);

    res.json({
      devices: paginatedDevices,
      pagination: {
        total: filteredDevices.length,
        limit: limitNum,
        skip: skipNum
      }
    });
  } catch (error) {
    logger.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/devices/stats - Get device statistics
router.get('/stats', async (req, res) => {
  try {
    const devicesRef = collection(COLLECTIONS.DEVICES);

    if (!devicesRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await devicesRef.once('value');
    const devicesData = snapshot.val() || {};
    
    if (snapshot.empty) {
      return res.json({
        statusCounts: [],
        total: 0
      });
    }
    
    const statusCounts = {};
    let total = 0;
    
    // Calculate statistics
    const statusCounts = {};
    let total = 0;

    Object.values(devicesData).forEach(device => {
      const status = device.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      total++;
    });

    res.json({
      statusCounts: Object.entries(statusCounts).map(([_id, count]) => ({ _id, count })),
      total
    });
  } catch (error) {
    logger.error('Error fetching device stats:', error);
    res.status(500).json({ error: 'Failed to fetch device statistics' });
  }
});

// GET /api/devices/:deviceId - Get single device
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const deviceRef = collection(`${COLLECTIONS.DEVICES}/${deviceId}`);
    if (!deviceRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await deviceRef.once('value');
    const deviceData = snapshot.val();

    if (!deviceData) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(formatDeviceData(deviceId, deviceData));
  } catch (error) {
    logger.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// POST /api/devices - Create new device
router.post('/', async (req, res) => {
  try {
    const deviceData = req.body;

    // Generate device ID if not provided
    const deviceId = deviceData.deviceId || `DEV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Format data for Realtime Database
    const formattedData = {
      ...deviceData,
      deviceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      status: deviceData.status || 'offline',
      power: deviceData.power || { batteryLevel: 100 },
      connectivity: deviceData.connectivity || { signalStrength: 'good' }
    };

    // Save to Realtime Database
    const deviceRef = collection(`${COLLECTIONS.DEVICES}/${deviceId}`);
    if (!deviceRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    await deviceRef.set(formattedData);

    logger.info(`New device created: ${deviceId}`);

    res.status(201).json({
      id: deviceId,
      ...formattedData
    });
  } catch (error) {
    logger.error('Error creating device:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// PUT /api/devices/:deviceId - Update device
router.put('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const updates = req.body;

    // Check if device exists
    const deviceRef = collection(`${COLLECTIONS.DEVICES}/${deviceId}`);
    if (!deviceRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await deviceRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Get current data and merge updates
    const currentData = snapshot.val();
    const updatedData = {
      ...currentData,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Save to Realtime Database
    await deviceRef.set(updatedData);

    res.json({
      success: true,
      device: {
        id: deviceId,
        ...updatedData
      }
    });
  } catch (error) {
    logger.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});
    const updatedData = {
      ...currentData,
      ...updates,
      updatedAt: new Date()
    };
    
    // Format for Firestore
    const formattedData = formatDeviceData(updatedData);
    
    // Save to Firestore
    await docRef.set(formattedData);
    
    res.json({
      success: true,
      device: {
        id: deviceId,
        ...formattedData,
        lastSeen: formattedData.lastSeen ? formattedData.lastSeen.toDate().toISOString() : null,
        createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
        updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null
      }
    });
  } catch (error) {
    logger.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// PUT /api/devices/:deviceId/status - Update device status
router.put('/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['online', 'offline', 'maintenance', 'retired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Update device status
    const deviceData = doc.data();
    const updatedData = updateDeviceStatus(deviceData, status);
    
    // Save to Firestore
    await docRef.update(updatedData);
    
    // Emit real-time status update
    const io = req.app.get('io');
    io.to(`device-${deviceId}`).emit('deviceStatus', {
      deviceId,
      status
    });
    
    const updatedDoc = await docRef.get();
    res.json({
      success: true,
      device: formatDeviceDoc(updatedDoc)
    });
  } catch (error) {
    logger.error('Error updating device status:', error);
    res.status(500).json({ error: 'Failed to update device status' });
  }
});

// PUT /api/devices/:deviceId/heartbeat - Update device heartbeat
router.put('/:deviceId/heartbeat', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Update device heartbeat
    const deviceData = doc.data();
    const updatedData = deviceHeartbeat(deviceData);
    
    // Save to Firestore
    await docRef.update(updatedData);
    
    // Emit real-time status update
    const io = req.app.get('io');
    io.to(`device-${deviceId}`).emit('deviceStatus', {
      deviceId,
      status: 'online'
    });
    
    const updatedDoc = await docRef.get();
    res.json({
      success: true,
      device: formatDeviceDoc(updatedDoc)
    });
  } catch (error) {
    logger.error('Error updating device heartbeat:', error);
    res.status(500).json({ error: 'Failed to update device heartbeat' });
  }
});

// PUT /api/devices/:deviceId/battery - Update device battery level
router.put('/:deviceId/battery', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { level } = req.body;
    
    if (level === undefined) {
      return res.status(400).json({ error: 'Battery level is required' });
    }
    
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Update device battery
    const deviceData = doc.data();
    const result = updateDeviceBattery(deviceData, level);
    
    // Save to Firestore
    await docRef.update(result.device);
    
    // Emit real-time status update
    const io = req.app.get('io');
    io.to(`device-${deviceId}`).emit('deviceStatus', {
      deviceId,
      status: result.device.status
    });
    
    // If low battery alert should be triggered, we could emit that here
    // For now, we'll just return the updated device
    
    const updatedDoc = await docRef.get();
    res.json({
      success: true,
      device: formatDeviceDoc(updatedDoc),
      shouldTriggerLowBatteryAlert: result.shouldTriggerLowBatteryAlert
    });
  } catch (error) {
    logger.error('Error updating device battery:', error);
    res.status(500).json({ error: 'Failed to update device battery' });
  }
});

// DELETE /api/devices/:deviceId - Delete device
router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Check if device exists
    const deviceRef = collection(`${COLLECTIONS.DEVICES}/${deviceId}`);
    if (!deviceRef) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const snapshot = await deviceRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Delete device data
    await deviceRef.remove();

    res.json({
      success: true,
      message: 'Device deleted'
    });
  } catch (error) {
    logger.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

module.exports = router;
