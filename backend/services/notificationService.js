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
 * Recipients: every HealthMonitor account (unless the user turned email alerts off or chose
 * critical-only in Settings), plus ALERT_EMAIL_TO / ALERT_SMS_TO and the patient's own contacts.
 * Each recipient gets their own email, greeted by name, sent as "HealthMonitor" from the
 * SMTP account (use a dedicated no-reply mailbox).
 *
 * Environment:
 *   ALERT_EMAIL_TO              extra comma-separated email addresses that always receive alerts
 *   ALERT_SMS_TO                comma-separated care-team phone numbers (E.164, e.g. +919876543210)
 *   ALERT_NOTIFY_SEVERITIES     severities that notify, default "warning,critical"
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
 *   ALERT_EMAIL_FROM            sender, default "HealthMonitor" <SMTP_USER>
 *   ALERT_EMAIL_REPLY_TO        optional Reply-To address
 *   ALERT_TIMEZONE              time zone for the alert time in emails, default Asia/Kolkata
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

// accounts: [{ email, name, criticalOnly }] from /users; critical-only accounts skip warnings.
// Emails are { email, name } so each message can greet its reader by name.
function recipients(patient = {}, accounts = [], severity) {
    const emails = [];
    const add = (email, name) => {
        const e = String(email || '').trim().toLowerCase();
        if (e && !emails.some((r) => r.email === e)) emails.push({ email: e, name: name || '' });
    };
    list(process.env.ALERT_EMAIL_TO).forEach((e) => add(e));
    accounts
        .filter((a) => a && a.email && (!a.criticalOnly || severity === 'critical'))
        .forEach((a) => add(a.email, a.name));
    list(patient.contactEmail).forEach((e) => add(e));
    return {
        emails,
        phones: unique([...list(process.env.ALERT_SMS_TO), ...list(patient.contactPhone)]),
    };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
const SEVERITY_COLOR = { critical: '#c62828', warning: '#ef6c00' };

/**
 * Content for an alert. SMS is kept short; the email follows the same shape as the
 * Firebase Auth emails: greeting, what happened, a link, and a team sign-off.
 */
function formatAlert(alert, event = 'created', name = '') {
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
    const when = new Date(alert.createdAt || Date.now()).toLocaleString('en-IN', {
        timeZone: process.env.ALERT_TIMEZONE || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
    });

    const subject = `[HealthMonitor] ${sev}${event === 'escalated' ? ' (escalated)' : ''}: ${alert.title || 'Alert'} - ${who}`;
    let sms = `HealthMonitor ${verb} ${sev}: ${alert.title || 'Alert'} for ${who}.${vitals ? ' ' + vitals + '.' : ''}`;
    if (link) sms += ` ${link}`;
    if (sms.length > 320) sms = sms.slice(0, 317) + '...';

    const greeting = `Hello ${name || 'there'},`;
    const lead = event === 'escalated'
        ? `An alert for ${who} has been escalated to ${sev}.`
        : `A ${sev} alert has been raised for ${who}.`;
    const footer = 'You are receiving this because you have a HealthMonitor account. To stop these emails, turn off Email Notifications in Settings. This is an automated message; replies to this address are not monitored.';

    const text = [
        greeting,
        '',
        lead,
        '',
        alert.title || '',
        alert.message || '',
        vitals ? `Vitals: ${vitals}` : '',
        `Time: ${when}`,
        alert.deviceId ? `Device: ${alert.deviceId}` : '',
        '',
        link ? 'Follow this link to open the alert:' : '',
        link,
        '',
        footer,
        '',
        'Thanks,',
        '',
        'Your HealthMonitor team',
    ].filter((line, i, all) => line !== '' || (all[i - 1] !== '' && i > 0)).join('\n');

    const color = SEVERITY_COLOR[alert.severity] || '#0b6b78';
    const row = (k, val) => (val ? `<tr><td style="padding:2px 12px 2px 0;color:#666">${k}</td><td style="padding:2px 0">${escapeHtml(val)}</td></tr>` : '');
    const button = link
        ? `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0b6b78;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Open the alert</a></p>
<p style="margin:0 0 20px;font-size:12px;color:#666">Or follow this link: <a href="${escapeHtml(link)}" style="color:#0b6b78">${escapeHtml(link)}</a></p>`
        : '';
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f7;font-family:Arial,Helvetica,sans-serif;color:#202124;font-size:14px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e3e5e8">
<div style="height:4px;background:${color}"></div>
<div style="padding:24px 28px">
<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">${escapeHtml(lead)}</p>
<div style="border-left:3px solid ${color};padding:8px 14px;background:#fafafa;margin:0 0 16px">
<div style="font-weight:bold;color:${color}">${escapeHtml(alert.title || 'Alert')}</div>
${alert.message ? `<div style="margin-top:4px">${escapeHtml(alert.message)}</div>` : ''}
</div>
<table style="border-collapse:collapse;font-size:13px;margin:0 0 20px">${row('Vitals', vitals)}${row('Time', when)}${row('Device', alert.deviceId)}</table>
${button}
<p style="margin:0">Thanks,</p>
<p style="margin:0 0 20px">Your HealthMonitor team</p>
<p style="margin:0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:14px">${escapeHtml(footer)} HealthMonitor is a monitoring aid, not a medical device.</p>
</div></div></body></html>`;

    return { subject, text, html, sms };
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

// One message per recipient, so each is greeted by name and sees only their own address
async function sendEmailNotification(to, alert, event = 'created') {
    const tos = (Array.isArray(to) ? to : list(to)).map((r) => (typeof r === 'string' ? { email: r, name: '' } : r));
    if (!tos.length) return { channel: 'email', status: 'skipped', reason: 'no recipients' };
    const transport = getTransport();
    if (!transport) return { channel: 'email', status: 'skipped', reason: 'SMTP not configured' };

    const from = process.env.ALERT_EMAIL_FROM || `"HealthMonitor" <${process.env.SMTP_USER}>`;
    const results = await Promise.all(tos.map(async ({ email, name }) => {
        try {
            const { subject, text, html } = formatAlert(alert, event, name);
            const info = await transport.sendMail({
                from,
                to: email,
                replyTo: process.env.ALERT_EMAIL_REPLY_TO || undefined,
                headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
                subject,
                text,
                html,
            });
            return { ok: true, messageId: info && info.messageId };
        } catch (error) {
            logger.error('Alert email failed', { alertId: alert.alertId, error: error.message });
            return { ok: false, error: error.message };
        }
    }));
    const sent = results.filter((r) => r.ok).length;
    return sent === tos.length
        ? { channel: 'email', status: 'sent', recipients: sent }
        : { channel: 'email', status: sent ? 'partial' : 'failed', recipients: sent, error: (results.find((r) => !r.ok) || {}).error };
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
async function notifyAlert(alert, { event = 'created', patient = {}, accounts = [] } = {}) {
    if (!notifySeverities().includes(alert.severity)) {
        return [{ channel: 'all', status: 'skipped', reason: `severity ${alert.severity} does not notify` }];
    }
    const { emails, phones } = recipients(patient, accounts, alert.severity);
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
