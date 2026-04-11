/**
 * Logger Utility
 * Vercel-compatible: No file logging on serverless functions
 */

const winston = require('winston');

// Detect Vercel environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const isProduction = process.env.NODE_ENV === 'production';

const transports = [];

// Only add file transports if NOT on Vercel
if (!isVercel) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  );
}

// Always add console transport for all environments (including Vercel)
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isVercel ? winston.format.simple() : winston.format.json() // JSON for files, simple for console
  ),
  defaultMeta: { service: 'iot-health-monitor' },
  transports
});

module.exports = { logger };
