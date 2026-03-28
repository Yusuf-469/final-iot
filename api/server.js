// Vercel serverless function entry point
// This delegates to the backend Express server

const { default: app } = require('../backend/server');

module.exports = app;