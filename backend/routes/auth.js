/**
 * Authentication Routes - Realtime Database Version
 * Medical IoT Backend - Login, signup, and token management
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, COLLECTIONS, getDb } = require('../database');
const { logger } = require('../utils/logger');

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Helper to get user by email (Realtime Database)
const getUserByEmail = async (email) => {
  const dbInstance = getDb();
  if (!dbInstance) {
    throw new Error('Database not connected');
  }

  const usersRef = dbInstance.ref(COLLECTIONS.USERS);
  const snapshot = await usersRef.orderByChild('email').equalTo(email.toLowerCase()).limitToFirst(1).once('value');
  
  if (!snapshot.exists()) {
    return null;
  }

  const userData = snapshot.val();
  const userId = Object.keys(userData)[0];
  const user = userData[userId];

  return {
    id: userId,
    ...user,
    createdAt: user.createdAt || null
  };
};

// Helper to create user (Realtime Database)
const createUser = async (userData) => {
  const dbInstance = getDb();
  if (!dbInstance) {
    throw new Error('Database not connected');
  }

  const { email, password, firstName, lastName, role, status, isDemo } = userData;
  
  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  const userDoc = {
    email: email.toLowerCase(),
    password: hashedPassword,
    firstName,
    lastName,
    role: role || 'viewer',
    status: status || 'active',
    isDemo: isDemo || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Add to Realtime Database
  const usersRef = dbInstance.ref(COLLECTIONS.USERS);
  const newUserRef = usersRef.push();
  await newUserRef.set(userDoc);
  
  return {
    id: newUserRef.key,
    email: userDoc.email,
    firstName: userDoc.firstName,
    lastName: userDoc.lastName,
    role: userDoc.role,
    status: userDoc.status,
    isDemo: userDoc.isDemo,
    createdAt: userDoc.createdAt
  };
};

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user in database
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is not active' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user);

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isDemo: user.isDemo
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/signup - User registration
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check password length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const user = await createUser({
      email,
      password,
      firstName,
      lastName,
      role: 'viewer',
      status: 'active',
      isDemo: false
    });

    // Generate token
    const token = generateToken(user);

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserByEmail(decoded.email);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
    
  } catch (error) {
    logger.error('Auth check error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/logout - Logout (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;