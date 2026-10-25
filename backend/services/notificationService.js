/**
 * Notification Service
 *
 * Sends email (SMTP via nodemailer) and SMS (Twilio REST API) when the alert engine
 * creates or escalates a warning or critical alert.
 *
 * Every channel is optional: if its credentials or recipients are missing, it is reported
 * as "skipped" (never as "sent"). A failure is reported as "failed" and never throws,
 * so notifications can't break the alert engine.
 *
 * Environment:
 *   ALERT_EMAIL_TO              comma-separated care-team email addresses
 *   ALERT_SMS_TO                comma-separated care-team phone numbers (E.164, e.g. +919876543210)
 *   ALERT_NOTIFY_SEVERITIES     severities that notify, default "warning,critical"
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, ALERT_EMAIL_FROM
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   FRONTEND_URL                used for the "open the dashboard" link
 * A patient record may also carry contactEmail / contactPhone, which are added to the recipients.
 */

const { logger } = require('../utils/logger');

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const unique = (arr) => [...new Set(arr)];

function notifySeverities() {
    const s = list(process.env.ALERT_NOTIFY_SEVERITIES);
    return s.length ? s : ['warning', 'critical'];
}

function recipients(patient = {}) {
    return {
        emails: unique([...list(process.env.ALERT_EMAIL_TO), ...list(patient.contactEmail)]),
        phones: unique([...list(process.env.ALERT_SMS_TO), ...list(patient.contactPhone)]),
    };
}

/** Plain-text content for an alert. SMS is kept short; email carries the details. */
function formatAlert(alert, event = 'created') {
    const sev = String(alert.severity || 'alert').toUpperCase();
    const who = alert.patientName || alert.patientId || 'Unknown patient';
    const verb = event === 'escalated' ? 'escalated to' : 'new';
    const link = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '*'
        ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/alerts.html`
        : '';
    const v = alert.vitals || {};
    const vitals = [
        v.heartRate != null ? `HR ${v.heartRate} bpm` : null,
        v.spo2 != null ? `SpO2 ${v.spo2}%` : null,
        v.temperature != null ? `Temp ${v.temperature} C` : null,
    ].filter(Boolean).join(', ');

    const subject = `[HealthMonitor] ${sev}${event === 'escalated' ? ' (escalated)' : ''}: ${alert.title || 'Alert'} - ${who}`;
    let sms = `HealthMonitor ${verb} ${sev}: ${alert.title || 'Alert'} for ${who}.${vitals ? ' ' + vitals + '.' : ''}`;
    if (link) sms += ` ${link}`;
    if (sms.length > 320) sms = sms.slice(0, 317) + '...';

    const text = [
        `${sev} alert ${event === 'escalated' ? '(escalated)' : ''} for ${who}`.replace(/\s+/g, ' ').trim(),
        '',
        alert.title || '',
        alert.message || '',
        vitals ? `Vitals: ${vitals}` : '',
        alert.deviceId ? `Device: ${alert.deviceId}` : '',
        alert.alertId ? `Alert ID: ${alert.alertId}` : '',
        link ? `Open the dashboard: ${link}` : '',
        '',
        'Sent automatically by the HealthMonitor alert engine. Not a medical device.',
    ].filter((line, i, all) => line !== '' || (all[i - 1] !== '' && i > 0)).join('\n');

    return { subject, text, sms };
}

// ---- email -----------------------------------------------------------------------------------

let transporter = null;
function getTransport() {
    if (!process.env.SMTP_HOST) return null;
    if (!transporter) {
        const nodemailer = require('nodemailer');
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        });
    }
    return transporter;
}

async function sendEmailNotification(to, alert, event = 'created') {
    const tos = Array.isArray(to) ? to : list(to);
    if (!tos.length) return { channel: 'email', status: 'skipped', reason: 'no recipients' };
    const transport = getTransport();
    if (!transport) return { channel: 'email', status: 'skipped', reason: 'SMTP not configured' };
    try {
        const { subject, text } = formatAlert(alert, event);
        const info = await transport.sendMail({
            from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
            to: tos.join(', '),
            subject,
            text,
        });
        return { channel: 'email', status: 'sent', recipients: tos.length, messageId: info && info.messageId };
    } catch (error) {
        logger.error('Alert email failed', { alertId: alert.alertId, error: error.message });
        return { channel: 'email', status: 'failed', error: error.message };
    }
}

// ---- SMS ---------------------------------------------------------------------------------------

async function sendSMSNotification(to, alert, event = 'created') {
    const tos = Array.isArray(to) ? to : list(to);
    if (!tos.length) return { channel: 'sms', status: 'skipped', reason: 'no recipients' };
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) return { channel: 'sms', status: 'skipped', reason: 'Twilio not configured' };

    const doFetch = typeof fetch === 'function' ? fetch : require('node-fetch');
    const { sms } = formatAlert(alert, event);
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const results = await Promise.all(tos.map(async (phone) => {
        try {
            const res = await doFetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
                method: 'POST',
                headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ To: phone, From: from, Body: sms }).toString(),
            });
            if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
            const data = await res.json().catch(() => ({}));
            return { ok: true, sid: data.sid };
        } catch (error) {
            logger.error('Alert SMS failed', { alertId: alert.alertId, error: error.message });
            return { ok: false, error: error.message };
        }
    }));
    const sent = results.filter((r) => r.ok).length;
    return sent === tos.length
        ? { channel: 'sms', status: 'sent', recipients: sent }
        : { channel: 'sms', status: sent ? 'partial' : 'failed', recipients: sent, error: (results.find((r) => !r.ok) || {}).error };
}

// ---- entry points -----------------------------------------------------------------------------

/**
 * Notify the care team about an alert the engine just created or escalated.
 * Returns one result per channel; never throws.
 */
async function notifyAlert(alert, { event = 'created', patient = {} } = {}) {
    if (!notifySeverities().includes(alert.severity)) {
        return [{ channel: 'all', status: 'skipped', reason: `severity ${alert.severity} does not notify` }];
    }
    const { emails, phones } = recipients(patient);
    const results = await Promise.all([
        sendEmailNotification(emails, alert, event),
        sendSMSNotification(phones, alert, event),
    ]);
    logger.info('Alert notifications', { alertId: alert.alertId, event, results: results.map((r) => `${r.channel}:${r.status}`) });
    return results;
}

// Kept for existing callers: notify one patient record about an alert.
const sendNotification = async (patient, alert, type = 'created') => notifyAlert(alert, { event: type, patient });

const sendPushNotification = async () => ({ channel: 'push', status: 'skipped', reason: 'push not implemented' });

module.exports = {
    notifyAlert,
    formatAlert,
    sendNotification,
    sendEmailNotification,
    sendSMSNotification,
    sendPushNotification,
    _reset: () => { transporter = null; },
};
