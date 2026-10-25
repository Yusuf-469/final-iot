/**
 * Alert Engine
 * Turns live vital-sign readings into clinical alerts.
 *
 * Layers (evaluated on every reading):
 *   1. Early-warning score  - NEWS2 sub-scores for HR, SpO2, temperature (+ RR / systolic BP when present).
 *                             Fixed clinical thresholds: the safety floor. Never tuned by feedback.
 *   2. Adaptive baseline    - per-patient, per-vital exponentially weighted mean/variance (slow, ~6 h)
 *                             compared with a fast (~5 min) average. Flags drift away from the patient's
 *                             own normal before fixed thresholds are crossed.
 *   3. Signal quality       - implausible values (no finger contact) and frozen/stale data.
 *   4. Alert lifecycle      - confirmation delay, de-duplication, escalation, auto-resolve with
 *                             hysteresis, cooldown, and per-patient sensitivity learned from
 *                             clinician feedback ("useful" / "false alarm") on baseline alerts.
 *
 * Everything above `evaluateDevice` is pure (no I/O) so it can be unit-tested and safely re-run
 * inside a Realtime Database transaction. Engine state lives at /alertEngine/state/{patientId}.
 */

const ENGINE_VERSION = 'news2-adaptive-1.0';

const DEFAULT_CONFIG = {
    minIntervalSec: 5,          // ignore evaluations closer together than this
    historyIntervalSec: 60,     // store at most one reading per patient per minute in /healthData
    confirmSec: 30,             // a condition must persist this long before alerting...
    confirmCriticalSec: 10,     // ...or this long when critical
    clearAfterMin: 10,          // condition must be clear this long before auto-resolving
    cooldownMin: 15,            // after an alert closes, don't re-raise the same alert for this long
    staleAfterMin: 15,          // identical readings for this long => data is frozen
    signalLostAfterSec: 120,    // implausible readings for this long => sensor signal lost
    tempOffsetC: 0,             // add to device temperature (e.g. ~+2.5 for a fingertip skin sensor)
    baseline: {
        slowTauMin: 360,        // patient's normal: ~6 h memory
        fastTauMin: 5,          // current state: ~5 min memory
        warmupSamples: 20,
        warmupMin: 30,
        zThreshold: 3.5,
        clearRatio: 0.7,        // hysteresis: stays active until |z| < zThreshold * clearRatio
        sdFloor: { heartRate: 3, spo2: 0.8, temperature: 0.15 }
    }
};

const VITALS = {
    heartRate: { label: 'Heart rate', unit: 'bpm', digits: 0, valid: [25, 250], direction: 'both' },
    spo2: { label: 'SpO₂', unit: '%', digits: 0, valid: [50, 100], direction: 'low' },
    temperature: { label: 'Temperature', unit: '°C', digits: 1, valid: [25, 45], direction: 'both' }
};

const SEVERITY_RANK = { info: 1, warning: 2, critical: 3 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function mergeConfig(base, override) {
    const out = { ...base };
    for (const [k, v] of Object.entries(override || {})) {
        out[k] = isObject(v) && isObject(base[k]) ? mergeConfig(base[k], v) : v;
    }
    return out;
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(isObject(v) ? v.value : v);
    return Number.isFinite(n) ? n : null;
};

const fmt = (v, digits) => Number(v).toFixed(digits);

// Firebase keys cannot contain . # $ [ ] /
const slug = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);

/**
 * Normalise a raw device node into a reading. Converts Kelvin, applies the configured
 * temperature offset, and separates implausible values (sensor not in contact).
 */
function normalizeReading(raw, cfg) {
    const reading = { values: {}, invalid: [] };
    if (!raw) return reading;

    let temp = num(raw.temperature);
    if (temp !== null && temp > 100) temp -= 273.15; // some sensors report Kelvin
    if (temp !== null) temp += cfg.tempOffsetC || 0;

    const candidates = {
        heartRate: num(raw.heartRate),
        spo2: num(raw.spo2),
        temperature: temp
    };

    for (const [vital, value] of Object.entries(candidates)) {
        if (value === null) continue;
        const [lo, hi] = VITALS[vital].valid;
        if (value < lo || value > hi) reading.invalid.push(vital);
        else reading.values[vital] = value;
    }

    const rr = num(raw.respiratoryRate);
    if (rr !== null && rr > 0 && rr < 80) reading.values.respiratoryRate = rr;
    const sys = num(raw.bloodPressure && raw.bloodPressure.systolic);
    if (sys !== null && sys > 40 && sys < 300) reading.values.systolic = sys;

    // Device timestamp, if the firmware writes one (ms, seconds, or ISO string)
    const ts = raw.updatedAt ?? raw.timestamp;
    if (ts !== undefined && ts !== null) {
        const n = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
        if (Number.isFinite(n)) reading.sourceTime = n;
    }

    // Fingerprint used to detect frozen data (device stopped updating)
    reading.fingerprint = JSON.stringify([candidates.heartRate, candidates.spo2, candidates.temperature]);
    return reading;
}

// ---------------------------------------------------------------------------
// Layer 1: NEWS2 (Royal College of Physicians, 2017) - SpO2 scale 1
// ---------------------------------------------------------------------------

const NEWS2_BANDS = {
    heartRate: [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2], [Infinity, 3]],
    spo2: [[91, 3], [93, 2], [95, 1], [Infinity, 0]],
    temperature: [[35.0, 3], [36.0, 1], [38.0, 0], [39.0, 1], [Infinity, 2]],
    respiratoryRate: [[8, 3], [11, 1], [20, 0], [24, 2], [Infinity, 3]],
    systolic: [[90, 3], [100, 2], [110, 1], [219, 0], [Infinity, 3]]
};

const NEWS2_LABELS = {
    heartRate: ['HR', 'bpm', 0],
    spo2: ['SpO₂', '%', 0],
    temperature: ['Temp', '°C', 1],
    respiratoryRate: ['RR', '/min', 0],
    systolic: ['SBP', 'mmHg', 0]
};

function news2SubScore(vital, value) {
    // Bands are upper bounds (inclusive). Values are rounded the way they'd be charted.
    const v = vital === 'temperature' ? Math.round(value * 10) / 10 : Math.round(value);
    for (const [upper, score] of NEWS2_BANDS[vital]) {
        if (v <= upper) return score;
    }
    return 0;
}

function news2(values) {
    const parts = [];
    for (const vital of Object.keys(NEWS2_BANDS)) {
        if (values[vital] === undefined) continue;
        parts.push({ vital, value: values[vital], score: news2SubScore(vital, values[vital]) });
    }
    const total = parts.reduce((s, p) => s + p.score, 0);
    const maxSingle = parts.reduce((m, p) => Math.max(m, p.score), 0);

    // NEWS2 clinical risk: >=7 high, 5-6 medium, a single parameter scoring 3 is low-medium
    let risk = 'none';
    if (total >= 7) risk = 'high';
    else if (total >= 5) risk = 'medium';
    else if (maxSingle === 3) risk = 'low-medium';
    else if (total >= 1) risk = 'low';

    return { total, maxSingle, risk, parts };
}

function news2Condition(score) {
    if (!['high', 'medium', 'low-medium'].includes(score.risk)) {
        return { active: false, score: score.total };
    }
    const severity = score.risk === 'high' ? 'critical' : 'warning';
    const drivers = score.parts
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(p => {
            const [label, unit, digits] = NEWS2_LABELS[p.vital];
            return `${label} ${fmt(p.value, digits)} ${unit} (+${p.score})`;
        });
    const response = {
        high: 'Emergency assessment recommended now.',
        medium: 'Urgent clinical review recommended.',
        'low-medium': 'Prompt review of the flagged parameter recommended.'
    }[score.risk];

    return {
        active: true,
        severity,
        source: 'early_warning',
        type: 'early_warning_score',
        title: `Early warning score ${score.total} · ${score.risk === 'high' ? 'high' : score.risk === 'medium' ? 'medium' : 'single-parameter'} risk`,
        message: `NEWS2 score ${score.total}: ${drivers.join(', ')}. ${response}`,
        details: { score: score.total, risk: score.risk, parts: score.parts }
    };
}

// ---------------------------------------------------------------------------
// Layer 2: adaptive per-patient baseline (exponentially weighted mean/variance)
// ---------------------------------------------------------------------------

function ewUpdate(stat, x, dtMin, tauMin, weight = 1) {
    if (!stat || !Number.isFinite(stat.mean)) return { mean: x, var: 0 };
    const alpha = Math.min(1, (1 - Math.exp(-Math.max(dtMin, 0) / tauMin)) * weight);
    const diff = x - stat.mean;
    return {
        mean: stat.mean + alpha * diff,
        var: (1 - alpha) * (stat.var + alpha * diff * diff)
    };
}

/**
 * Update the baseline for one vital and return its anomaly z-score.
 * The slow baseline learns ten times slower while the patient is anomalous, so it doesn't
 * "chase" a deterioration and normalise it away.
 */
function updateBaseline(prev, x, now, cfg) {
    const b = cfg.baseline;
    const p = prev || { n: 0, since: now, updatedAt: now };
    const dtMin = p.updatedAt ? (now - p.updatedAt) / 60000 : 0;

    const fast = ewUpdate(p.fast, x, dtMin, b.fastTauMin);
    const sdFloor = b.sdFloor[p.vital] || 1;
    const slowSd = p.slow ? Math.max(Math.sqrt(p.slow.var), sdFloor) : sdFloor;
    const pointZ = p.slow ? (x - p.slow.mean) / slowSd : 0;
    const learnWeight = Math.abs(pointZ) >= b.zThreshold ? 0.1 : 1;
    const slow = ewUpdate(p.slow, x, dtMin, b.slowTauMin, learnWeight);

    const sd = Math.max(Math.sqrt(slow.var), sdFloor);
    const z = (fast.mean - slow.mean) / sd;
    const n = (p.n || 0) + 1;
    const warm = n >= b.warmupSamples && (now - (p.since || now)) >= b.warmupMin * 60000;

    return { vital: p.vital, n, since: p.since || now, updatedAt: now, fast, slow, z, sd, warm };
}

function anomalyCondition(vital, base, multiplier, cfg, wasOpen) {
    const meta = VITALS[vital];
    const threshold = cfg.baseline.zThreshold * (multiplier || 1);
    if (!base || !base.warm) return { active: false };

    const z = base.z;
    const relevant = meta.direction === 'both' || (meta.direction === 'low' && z < 0);
    const limit = wasOpen ? threshold * cfg.baseline.clearRatio : threshold;
    if (!relevant || Math.abs(z) < limit) return { active: false, z };

    const severity = Math.abs(z) >= threshold + 1.5 ? 'warning' : 'info';
    const dir = z > 0 ? 'above' : 'below';
    return {
        active: true,
        severity,
        source: 'ml_anomaly',
        type: 'baseline_deviation',
        title: `${meta.label} ${z > 0 ? 'rising' : 'falling'} vs. patient baseline`,
        message: `${meta.label} averaging ${fmt(base.fast.mean, meta.digits)} ${meta.unit} over the last few minutes, ` +
            `${fmt(Math.abs(z), 1)}σ ${dir} this patient's baseline of ${fmt(base.slow.mean, meta.digits)} ± ${fmt(base.sd, meta.digits || 1)} ${meta.unit}. ` +
            'Still inside fixed limits, but unusual for this patient.',
        details: { vital, z: Math.round(z * 100) / 100, threshold: Math.round(threshold * 100) / 100, baseline: base.slow.mean, current: base.fast.mean }
    };
}

// ---------------------------------------------------------------------------
// Layer 4: alert lifecycle
// ---------------------------------------------------------------------------

function reconcile(prevAlerts, conditions, now, cfg, ctx) {
    const alerts = { ...(prevAlerts || {}) };
    const actions = [];
    const keys = new Set([...Object.keys(alerts), ...Object.keys(conditions)]);

    for (const key of keys) {
        const cond = conditions[key] || { active: false };
        const st = { ...(alerts[key] || {}) };

        if (cond.active) {
            st.lastActiveAt = now;
            if (st.open) {
                if (SEVERITY_RANK[cond.severity] > SEVERITY_RANK[st.severity]) {
                    actions.push({ type: 'escalate', key, alertId: st.alertId, from: st.severity, condition: cond });
                    st.severity = cond.severity;
                }
            } else {
                const coolingDown = st.cooldownUntil && now < st.cooldownUntil &&
                    SEVERITY_RANK[cond.severity] <= SEVERITY_RANK[st.lastSeverity || 'info'];
                if (!st.pendingSince) st.pendingSince = now;
                const confirm = (cond.severity === 'critical' ? cfg.confirmCriticalSec : cfg.confirmSec) * 1000;

                if (!coolingDown && now - st.pendingSince >= confirm) {
                    const alertId = `ALT-${now}-${slug(ctx.patientId)}-${slug(key)}`;
                    actions.push({ type: 'create', key, alertId, condition: cond });
                    Object.assign(st, { open: true, alertId, openedAt: now, severity: cond.severity });
                    delete st.pendingSince;
                }
            }
        } else {
            delete st.pendingSince;
            if (st.open && now - (st.lastActiveAt || now) >= cfg.clearAfterMin * 60000) {
                actions.push({ type: 'resolve', key, alertId: st.alertId });
                alerts[key] = {
                    open: false,
                    closedAt: now,
                    lastSeverity: st.severity,
                    cooldownUntil: now + cfg.cooldownMin * 60000
                };
                continue;
            }
        }

        if (Object.keys(st).length) alerts[key] = st;
        else delete alerts[key];
    }
    return { alerts, actions };
}

// ---------------------------------------------------------------------------
// One evaluation step (pure)
// ---------------------------------------------------------------------------

/**
 * @param {object|null} prevState  engine state for this patient (null on first run)
 * @param {object} raw             raw device node, e.g. { heartRate, spo2, temperature }
 * @param {number} now             epoch ms
 * @param {object} cfg             merged config
 * @param {object} ctx             { patientId, patientName, deviceId }
 * @returns {{ state, actions, conditions, reading, score, storeHistory } | null}  null = skipped (too soon)
 */
function step(prevState, raw, now, cfg, ctx) {
    const state = prevState ? JSON.parse(JSON.stringify(prevState)) : {};
    if (state.lastEvaluatedAt && now - state.lastEvaluatedAt < cfg.minIntervalSec * 1000) return null;

    const reading = normalizeReading(raw, cfg);
    const tuning = state.tuning || {};
    const openKeys = Object.entries(state.alerts || {}).filter(([, a]) => a.open).map(([k]) => k);
    const conditions = {};

    // Frozen data: identical values for staleAfterMin
    if (reading.fingerprint !== state.fingerprint) {
        state.fingerprint = reading.fingerprint;
        state.lastChangedAt = now;
    }
    const staleMs = cfg.staleAfterMin * 60000;
    const tooOld = reading.sourceTime !== undefined && now - reading.sourceTime >= staleMs;
    const frozen = tooOld || now - (state.lastChangedAt || now) >= staleMs;
    const lastSeen = reading.sourceTime !== undefined ? Math.min(reading.sourceTime, now) : state.lastChangedAt;
    conditions['device:stale'] = frozen ? {
        active: true,
        severity: 'warning',
        source: 'device',
        type: 'device_stale',
        title: 'No new readings from device',
        message: `No new readings from ${ctx.deviceId} for ${Math.round((now - lastSeen) / 60000)} min. ` +
            'Check the device is powered, connected to Wi-Fi, and worn correctly.',
        details: { lastSeenAt: new Date(lastSeen).toISOString() }
    } : { active: false };

    // Signal lost: implausible values (e.g. finger off the sensor)
    const hasValid = Object.keys(reading.values).length > 0;
    if (reading.invalid.length && !hasValid) state.invalidSince = state.invalidSince || now;
    else delete state.invalidSince;
    const signalLost = state.invalidSince && now - state.invalidSince >= cfg.signalLostAfterSec * 1000;
    conditions['device:signal'] = signalLost ? {
        active: true,
        severity: 'warning',
        source: 'device',
        type: 'signal_lost',
        title: 'Sensor signal lost',
        message: `Implausible readings (${reading.invalid.join(', ')}) for ${Math.round((now - state.invalidSince) / 1000)} s. The sensor may not be in contact with the patient.`,
        details: { invalid: reading.invalid }
    } : { active: false };

    // Clinical scoring and baselines only use fresh, plausible data
    let score = null;
    if (hasValid && !frozen) {
        score = news2(reading.values);
        conditions.news2 = news2Condition(score);

        state.baselines = state.baselines || {};
        for (const vital of Object.keys(VITALS)) {
            if (reading.values[vital] === undefined) continue;
            const prev = state.baselines[vital] ? { ...state.baselines[vital], vital } : { vital };
            const base = updateBaseline(prev, reading.values[vital], now, cfg);
            state.baselines[vital] = base;
            const key = `anomaly:${vital}`;
            conditions[key] = anomalyCondition(vital, base, tuning[vital] && tuning[vital].multiplier,
                cfg, openKeys.includes(key));
        }
    } else {
        // Hold clinical alerts open (no auto-resolve) while we can't see the patient
        for (const key of openKeys) {
            if (key === 'news2' || key.startsWith('anomaly:')) {
                conditions[key] = { active: true, severity: state.alerts[key].severity, hold: true };
            }
        }
    }

    const { alerts, actions } = reconcile(state.alerts, conditions, now, cfg, ctx);
    state.alerts = alerts;
    state.lastEvaluatedAt = now;
    state.evaluations = (state.evaluations || 0) + 1;
    state.lastScore = score ? { total: score.total, risk: score.risk } : null;
    state.lastValues = reading.values;

    const storeHistory = hasValid && !frozen &&
        (!state.lastHistoryAt || now - state.lastHistoryAt >= cfg.historyIntervalSec * 1000);
    if (storeHistory) state.lastHistoryAt = now;

    // Held conditions carry no content; never use them to create alerts
    const filtered = actions.filter(a => !(a.condition && a.condition.hold));
    return { state, actions: filtered, conditions, reading, score, storeHistory };
}

/**
 * Clinician feedback on a baseline alert adjusts that patient's sensitivity for that vital.
 * False alarms make it less sensitive (x1.15, capped at 1.8x); useful alerts make it a bit more
 * sensitive (x0.95, floored at 0.85x). NEWS2 thresholds are never changed.
 */
function applyFeedback(prevTuning, feedback) {
    const t = { multiplier: 1, useful: 0, falseAlarms: 0, ...(prevTuning || {}) };
    if (feedback === 'false_alarm') {
        t.multiplier = Math.min(1.8, t.multiplier * 1.15);
        t.falseAlarms += 1;
    } else if (feedback === 'useful') {
        t.multiplier = Math.max(0.85, t.multiplier * 0.95);
        t.useful += 1;
    }
    t.multiplier = Math.round(t.multiplier * 1000) / 1000;
    return t;
}

// ---------------------------------------------------------------------------
// I/O: evaluate a device node against every patient linked to it
// ---------------------------------------------------------------------------

async function loadConfig(db) {
    const snap = await db.ref('alertEngine/config').once('value');
    return mergeConfig(DEFAULT_CONFIG, snap.val() || {});
}

async function linkedPatients(db, deviceId) {
    const snap = await db.ref('patients').once('value');
    const list = Object.entries(snap.val() || {})
        .filter(([, p]) => p && p.deviceId === deviceId)
        .map(([id, p]) => ({
            patientId: id,
            patientName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || id,
            contactEmail: p.contactEmail || null,
            contactPhone: p.contactPhone || null
        }));
    return list.length ? list : [{ patientId: `device_${deviceId}`, patientName: `${deviceId} device (unassigned)` }];
}

// Email/SMS the care team about a created or escalated alert, and record what happened on the
// alert itself. Notification problems are logged and never interrupt the engine.
async function notifyCareTeam(db, alert, event, ctx) {
    try {
        const { notifyAlert } = require('./notificationService');
        const users = (await db.ref('users').once('value')).val() || {};
        const accounts = Object.values(users)
            .filter(u => u && u.email && !u.isDemo && u.alertEmails !== false)
            .map(u => ({ email: u.email, name: u.firstName || '', criticalOnly: !!u.alertCriticalOnly }));
        const results = await notifyAlert(alert, { event, accounts, patient: { contactEmail: ctx.contactEmail, contactPhone: ctx.contactPhone } });
        await db.ref(`alerts/${alert.alertId}/notifications/${event}`).set(JSON.parse(JSON.stringify({ at: new Date().toISOString(), results })));
    } catch (error) {
        console.error('Alert notification error:', error.message);
    }
}

async function applyActions(db, result, ctx, now) {
    const iso = new Date(now).toISOString();
    const summary = [];

    for (const action of result.actions) {
        const ref = db.ref(`alerts/${action.alertId}`);
        const c = action.condition;

        if (action.type === 'create') {
            await ref.set(JSON.parse(JSON.stringify({
                alertId: action.alertId,
                patientId: ctx.patientId,
                patientName: ctx.patientName,
                deviceId: ctx.deviceId,
                engineKey: action.key,
                engineVersion: ENGINE_VERSION,
                type: c.type,
                source: c.source,
                severity: c.severity,
                title: c.title,
                message: c.message,
                details: c.details,
                vitals: result.reading.values,
                status: 'active',
                createdAt: iso,
                updatedAt: iso
            })));
            await notifyCareTeam(db, {
                alertId: action.alertId, patientId: ctx.patientId, patientName: ctx.patientName, deviceId: ctx.deviceId,
                severity: c.severity, title: c.title, message: c.message, vitals: result.reading.values, createdAt: iso
            }, 'created', ctx);
        } else if (action.type === 'escalate') {
            await ref.update(JSON.parse(JSON.stringify({
                severity: c.severity,
                title: c.title,
                message: c.message,
                details: c.details,
                vitals: result.reading.values,
                escalation: { from: action.from, to: c.severity, escalatedAt: iso, escalatedBy: 'alert-engine' },
                updatedAt: iso
            })));
            await notifyCareTeam(db, {
                alertId: action.alertId, patientId: ctx.patientId, patientName: ctx.patientName, deviceId: ctx.deviceId,
                severity: c.severity, title: c.title, message: c.message, vitals: result.reading.values, createdAt: iso
            }, 'escalated', ctx);
        } else if (action.type === 'resolve') {
            const current = (await ref.once('value')).val();
            if (current && current.status !== 'resolved') {
                await ref.update({
                    status: 'resolved',
                    resolvedBy: 'alert-engine',
                    resolvedAt: iso,
                    resolution: { method: 'auto', notes: 'Condition cleared and stayed clear.' },
                    updatedAt: iso
                });
            }
        }
        summary.push({ type: action.type, key: action.key, alertId: action.alertId, severity: c && c.severity });
    }

    if (result.storeHistory) {
        const bucket = Math.floor(now / 60000);
        await db.ref(`healthData/${slug(ctx.patientId)}_${bucket}`).set(JSON.parse(JSON.stringify({
            patientId: ctx.patientId,
            deviceId: ctx.deviceId,
            ...result.reading.values,
            status: result.score ? (result.score.risk === 'none' || result.score.risk === 'low' ? 'normal' : result.score.risk === 'high' ? 'critical' : 'warning') : 'normal',
            news2: result.score ? result.score.total : null,
            timestamp: now,
            createdAt: iso,
            source: 'alert-engine'
        })));
    }
    return summary;
}

/**
 * Evaluate the latest reading of a device node (e.g. /health) for every patient linked to it.
 * Safe to call concurrently from several places: state changes go through a transaction, and only
 * the evaluation that commits applies its alert actions.
 *
 * @param {object} db         firebase-admin database
 * @param {string} deviceId   device node name, e.g. 'health'
 * @param {object} [opts]     { now, dryRun }
 */
async function evaluateDevice(db, deviceId, opts = {}) {
    const now = opts.now || Date.now();
    const cfg = await loadConfig(db);
    const raw = (await db.ref(deviceId).once('value')).val();
    const patients = await linkedPatients(db, deviceId);
    const results = [];

    for (const p of patients) {
        const ctx = { ...p, deviceId };
        const stateRef = db.ref(`alertEngine/state/${slug(p.patientId)}`);

        if (opts.dryRun) {
            const prev = (await stateRef.once('value')).val();
            const r = step(prev, raw, now + cfg.minIntervalSec * 1000, cfg, ctx);
            results.push({ patientId: p.patientId, dryRun: true, score: r && r.score, conditions: r && r.conditions, actions: r ? r.actions.map(a => a.type + ':' + a.key) : [] });
            continue;
        }

        let outcome = null;
        const tx = await stateRef.transaction((current) => {
            outcome = null; // the transaction may retry; only the committed run counts
            const r = step(current, raw, now, cfg, ctx);
            if (!r) return undefined; // abort: evaluated too recently
            outcome = r;
            return r.state;
        });

        if (!tx.committed || !outcome) {
            results.push({ patientId: p.patientId, skipped: true });
            continue;
        }
        const actions = await applyActions(db, outcome, ctx, now);
        results.push({
            patientId: p.patientId,
            news2: outcome.score ? outcome.score.total : null,
            risk: outcome.score ? outcome.score.risk : null,
            actions
        });
    }
    return { deviceId, evaluatedAt: new Date(now).toISOString(), results };
}

/**
 * Record clinician feedback for an engine alert and clear its open state so a still-present
 * condition is re-raised after the cooldown instead of being silently dropped.
 */
async function recordResolution(db, alert, feedback, now = Date.now()) {
    if (!alert || !alert.engineKey || !alert.patientId) return null;
    const cfg = await loadConfig(db);
    const stateRef = db.ref(`alertEngine/state/${slug(alert.patientId)}`);

    let tuning = null;
    await stateRef.transaction((current) => {
        const state = current || {};
        state.alerts = state.alerts || {};
        const st = state.alerts[alert.engineKey];
        if (st && st.alertId === alert.alertId && st.open) {
            state.alerts[alert.engineKey] = {
                open: false,
                closedAt: now,
                lastSeverity: st.severity,
                cooldownUntil: now + cfg.cooldownMin * 60000
            };
        }
        if (feedback && alert.engineKey.startsWith('anomaly:')) {
            const vital = alert.engineKey.split(':')[1];
            state.tuning = state.tuning || {};
            state.tuning[vital] = applyFeedback(state.tuning[vital], feedback);
            tuning = state.tuning[vital];
        }
        return state;
    });
    return tuning;
}

async function engineStatus(db) {
    const [stateSnap, alertsSnap] = await Promise.all([
        db.ref('alertEngine/state').once('value'),
        db.ref('alerts').orderByChild('engineVersion').startAt('').once('value')
    ]);
    const states = Object.values(stateSnap.val() || {});
    const engineAlerts = Object.values(alertsSnap.val() || {});
    const lastEvaluatedAt = states.reduce((m, s) => Math.max(m, s.lastEvaluatedAt || 0), 0);

    return {
        engine: ENGINE_VERSION,
        patients: states.length,
        evaluations: states.reduce((s, x) => s + (x.evaluations || 0), 0),
        baselinesReady: states.reduce((s, x) => s + Object.values(x.baselines || {}).filter(b => b.warm).length, 0),
        activeAlerts: engineAlerts.filter(a => a.status !== 'resolved').length,
        totalAlerts: engineAlerts.length,
        lastEvaluatedAt: lastEvaluatedAt ? new Date(lastEvaluatedAt).toISOString() : null,
        live: !!lastEvaluatedAt && Date.now() - lastEvaluatedAt < 10 * 60000
    };
}

module.exports = {
    ENGINE_VERSION,
    DEFAULT_CONFIG,
    mergeConfig,
    normalizeReading,
    news2,
    news2SubScore,
    updateBaseline,
    reconcile,
    step,
    applyFeedback,
    evaluateDevice,
    recordResolution,
    engineStatus
};
