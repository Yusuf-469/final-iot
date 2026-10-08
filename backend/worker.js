/**
 * Alert worker - real-time alert evaluation
 *
 * ESP32 devices write straight to Firebase (/health), so no HTTP request ever reaches the API
 * when a reading arrives. This always-on process listens to the device nodes and runs the alert
 * engine on every change, plus a periodic sweep so frozen/offline devices are still detected.
 *
 * Run:  npm run worker      (any always-on host: Railway, Render, a VM, a Raspberry Pi)
 *
 * Env:  same Firebase credentials as the API
 *       ALERT_DEVICE_NODES  comma-separated device nodes to watch (default: health)
 *       ALERT_SWEEP_SEC     periodic re-evaluation interval (default: 60)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getDb } = require('./database');
const { evaluateDevice, ENGINE_VERSION } = require('./services/alertEngine');

const DEVICE_NODES = (process.env.ALERT_DEVICE_NODES || 'health').split(',').map(s => s.trim()).filter(Boolean);
const SWEEP_MS = Math.max(15, Number(process.env.ALERT_SWEEP_SEC) || 60) * 1000;
const DEBOUNCE_MS = 2000; // devices can write several fields in quick succession

const db = getDb();
if (!db) {
    console.error('❌ Firebase is not configured; the alert worker cannot start.');
    process.exit(1);
}

const timers = {};
const running = {};
const rerun = {};

function describe(result) {
    return result.results.map(r => {
        if (r.skipped) return `${r.patientId}: skipped`;
        const acts = r.actions.length ? ' → ' + r.actions.map(a => `${a.type} ${a.key}${a.severity ? ` (${a.severity})` : ''}`).join(', ') : '';
        return `${r.patientId}: NEWS2 ${r.news2 ?? '-'} ${r.risk ?? ''}${acts}`;
    }).join(' | ');
}

async function evaluate(deviceId, reason) {
    // Never run two evaluations of the same device at once; coalesce into one follow-up run
    if (running[deviceId]) {
        rerun[deviceId] = true;
        return;
    }
    running[deviceId] = true;
    try {
        const result = await evaluateDevice(db, deviceId);
        const line = describe(result);
        const acted = result.results.some(r => r.actions && r.actions.length);
        if (acted || reason === 'start') console.log(`[${new Date().toISOString()}] ${deviceId} (${reason}) ${line}`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ${deviceId} evaluation failed:`, error.message);
    } finally {
        running[deviceId] = false;
        if (rerun[deviceId]) {
            rerun[deviceId] = false;
            schedule(deviceId, 'change');
        }
    }
}

function schedule(deviceId, reason) {
    clearTimeout(timers[deviceId]);
    timers[deviceId] = setTimeout(() => evaluate(deviceId, reason), DEBOUNCE_MS);
}

console.log(`🚑 Alert worker (${ENGINE_VERSION}) watching: ${DEVICE_NODES.map(n => '/' + n).join(', ')}; sweep every ${SWEEP_MS / 1000}s`);

for (const node of DEVICE_NODES) {
    let first = true;
    db.ref(node).on('value', () => {
        schedule(node, first ? 'start' : 'change');
        first = false;
    }, (error) => console.error(`Listener for /${node} cancelled:`, error.message));
}

const sweep = setInterval(() => DEVICE_NODES.forEach(node => evaluate(node, 'sweep')), SWEEP_MS);

function shutdown(signal) {
    console.log(`${signal} received, stopping alert worker`);
    clearInterval(sweep);
    DEVICE_NODES.forEach(node => db.ref(node).off());
    setTimeout(() => process.exit(0), 500);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection in worker:', reason));
