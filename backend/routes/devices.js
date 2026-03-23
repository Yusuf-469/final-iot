/**
 * Devices Routes - Firestore Version
 * Medical IoT Backend - Device management endpoints
 */

const express = require('express');
const router = express.Router();
const { db, COLLECTIONS } = require('../database');
const { formatDeviceData, validateDevice, isDeviceOnline, updateDeviceStatus, deviceHeartbeat, updateDeviceBattery } = require('../models/Device');
const { logger } = require('../utils/logger');

// Helper to format device document from Firestore
const formatDeviceDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    lastSeen: data.lastSeen ? data.lastSeen.toDate().toISOString() : null,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
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
    const { status, patientId, limit = 100, skip = 0 } = req.query;
    
    let query = db.collection(COLLECTIONS.DEVICES);
    
    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (patientId) {
      query = query.where('patientId', '==', patientId);
    }
    
    // Apply pagination
    query = query.orderBy('createdAt', 'desc')
                .limit(parseInt(limit))
                .offset(parseInt(skip));
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        devices: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      });
    }
    
    const devices = [];
    snapshot.forEach(doc => {
      devices.push(formatDeviceDoc(doc));
    });
    
    // Get total count (separate query for accuracy)
    let countQuery = db.collection(COLLECTIONS.DEVICES);
    
    if (status) {
      countQuery = countQuery.where('status', '==', status);
    }
    
    if (patientId) {
      countQuery = countQuery.where('patientId', '==', patientId);
    }
    
    const countSnapshot = await countQuery.get();
    const total = countSnapshot.size;
    
    res.json({
      devices,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
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
    const snapshot = await db.collection(COLLECTIONS.DEVICES).get();
    
    if (snapshot.empty) {
      return res.json({
        statusCounts: [],
        total: 0
      });
    }
    
    const statusCounts = {};
    let total = 0;
    
    snapshot.forEach(doc => {
      const status = doc.data().status || 'unknown';
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
    
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(formatDeviceDoc(doc));
  } catch (error) {
    logger.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// POST /api/devices - Create new device
router.post('/', async (req, res) => {
  try {
    const deviceData = req.body;
    
    // Validate device data
    const validation = validateDevice(deviceData);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors[0] });
    }
    
    // Generate device ID if not provided
    const deviceId = deviceData.deviceId || `DEV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Format data for Firestore
    const formattedData = formatDeviceData({
      ...deviceData,
      deviceId
    });
    
    // Add to Firestore
    const docRef = await db.collection(COLLECTIONS.DEVICES).doc(deviceId).set(formattedData);
    
    logger.info(`New device created: ${deviceId}`);
    
    res.status(201).json({
      id: deviceId,
      ...formattedData,
      lastSeen: formattedData.lastSeen ? formattedData.lastSeen.toDate().toISOString() : null,
      createdAt: formattedData.createdAt ? formattedData.createdAt.toDate().toISOString() : null,
      updatedAt: formattedData.updatedAt ? formattedData.updatedAt.toDate().toISOString() : null
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
    
    // Validate device ID exists
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Get current data
    const currentData = doc.data();
    
    // Merge updates with current data
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
    
    const docRef = db.collection(COLLECTIONS.DEVICES).doc(deviceId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Delete device document
    await docRef.delete();
    
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
