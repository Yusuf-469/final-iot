const engine = require('../alertEngine');

const { DEFAULT_CONFIG: CFG, news2SubScore, news2, step, applyFeedback, normalizeReading } = engine;
const CTX = { patientId: 'p1', patientName: 'Test Patient', deviceId: 'health' };
const MIN = 60000;
const T0 = Date.UTC(2026, 0, 1, 8, 0, 0);

/** Feed readings at a fixed cadence and collect every action taken. */
function run(state, readings, { start = T0, everySec = 30 } = {}) {
    let now = start;
    const actions = [];
    for (const raw of readings) {
        const r = step(state, raw, now, CFG, CTX);
        if (r) {
            state = r.state;
            r.actions.forEach(a => actions.push({ ...a, at: now }));
        }
        now += everySec * 1000;
    }
    return { state, actions, now };
}

const repeat = (raw, n) => Array.from({ length: n }, (_, i) => (typeof raw === 'function' ? raw(i) : raw));
// Small deterministic wobble so values aren't "frozen"
const normal = (i) => ({ heartRate: 70 + (i % 5) - 2, spo2: 97 + (i % 2), temperature: 36.8 + ((i % 3) - 1) * 0.1 });

describe('NEWS2 scoring', () => {
    test.each([
        ['heartRate', 40, 3], ['heartRate', 41, 1], ['heartRate', 50, 1], ['heartRate', 51, 0],
        ['heartRate', 90, 0], ['heartRate', 91, 1], ['heartRate', 111, 2], ['heartRate', 131, 3],
        ['spo2', 91, 3], ['spo2', 92, 2], ['spo2', 94, 1], ['spo2', 96, 0],
        ['temperature', 35.0, 3], ['temperature', 35.1, 1], ['temperature', 36.1, 0],
        ['temperature', 38.0, 0], ['temperature', 38.1, 1], ['temperature', 39.1, 2]
    ])('%s %p scores %p', (vital, value, expected) => {
        expect(news2SubScore(vital, value)).toBe(expected);
    });

    test('aggregates risk bands', () => {
        expect(news2({ heartRate: 72, spo2: 98, temperature: 36.8 }).risk).toBe('none');
        expect(news2({ heartRate: 95, spo2: 95, temperature: 36.8 }).risk).toBe('low');
        expect(news2({ heartRate: 72, spo2: 90, temperature: 36.8 }).risk).toBe('low-medium');
        expect(news2({ heartRate: 115, spo2: 93, temperature: 38.5 }).risk).toBe('medium'); // 2+2+1
        expect(news2({ heartRate: 135, spo2: 90, temperature: 39.5 }).risk).toBe('high');   // 3+3+2
    });
});

describe('reading normalisation', () => {
    test('converts Kelvin and applies temperature offset', () => {
        const r = normalizeReading({ temperature: 310.15 }, { ...CFG, tempOffsetC: 0.5 });
        expect(r.values.temperature).toBeCloseTo(37.5, 5);
    });

    test('drops implausible values as invalid', () => {
        const r = normalizeReading({ heartRate: 0, spo2: 0, temperature: 36.5 }, CFG);
        expect(r.values).toEqual({ temperature: 36.5 });
        expect(r.invalid).toEqual(['heartRate', 'spo2']);
    });
});

describe('early-warning alerts', () => {
    test('stable patient never alerts', () => {
        const { actions } = run(null, repeat(normal, 240)); // 2 hours
        expect(actions).toEqual([]);
    });

    test('a single-reading spike does not alert', () => {
        const readings = [...repeat(normal, 10), { heartRate: 150, spo2: 97, temperature: 36.8 }, ...repeat(normal, 10)];
        expect(run(null, readings).actions).toEqual([]);
    });

    test('sustained low SpO2 raises one warning after the confirmation delay', () => {
        const low = (i) => ({ heartRate: 72 + (i % 3), spo2: 90, temperature: 36.8 });
        const { actions } = run(null, [...repeat(normal, 5), ...repeat(low, 20)]);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({ type: 'create', key: 'news2' });
        expect(actions[0].condition.severity).toBe('warning');
        expect(actions[0].condition.message).toMatch(/SpO₂ 90 % \(\+3\)/);
        // created on the second abnormal reading (30 s confirmation), not the first
        expect(actions[0].at).toBe(T0 + 6 * 30000);
    });

    test('escalates from warning to critical instead of creating a duplicate', () => {
        const warn = (i) => ({ heartRate: 72 + (i % 3), spo2: 90, temperature: 36.8 });
        const crit = (i) => ({ heartRate: 135 + (i % 3), spo2: 89, temperature: 39.5 });
        const { actions } = run(null, [...repeat(warn, 6), ...repeat(crit, 6)]);
        expect(actions.map(a => a.type)).toEqual(['create', 'escalate']);
        expect(actions[1].alertId).toBe(actions[0].alertId);
        expect(actions[1].condition.severity).toBe('critical');
    });

    test('auto-resolves after staying clear, then respects the cooldown', () => {
        const low = (i) => ({ heartRate: 72 + (i % 3), spo2: 90, temperature: 36.8 });
        // abnormal 3 min, normal 12 min (resolves), abnormal again within cooldown
        const { actions } = run(null, [...repeat(low, 6), ...repeat(normal, 24), ...repeat(low, 6)]);
        expect(actions.map(a => a.type)).toEqual(['create', 'resolve']);
    });

    test('re-alerts during cooldown if severity is higher than before', () => {
        const low = (i) => ({ heartRate: 72 + (i % 3), spo2: 90, temperature: 36.8 });
        const crit = (i) => ({ heartRate: 135 + (i % 3), spo2: 89, temperature: 39.5 });
        const { actions } = run(null, [...repeat(low, 6), ...repeat(normal, 24), ...repeat(crit, 4)]);
        expect(actions.map(a => a.type)).toEqual(['create', 'resolve', 'create']);
        expect(actions[2].condition.severity).toBe('critical');
    });
});

describe('adaptive baseline', () => {
    const drift = (hr) => (i) => ({ heartRate: hr + (i % 3) - 1, spo2: 97 + (i % 2), temperature: 36.8 });

    test('flags a sustained rise that is still inside NEWS2 limits', () => {
        // 1 h of HR ~70, then HR ~88 (NEWS2 still 0) for 15 min
        const { actions } = run(null, [...repeat(drift(70), 120), ...repeat(drift(88), 30)]);
        const created = actions.filter(a => a.type === 'create');
        expect(created).toHaveLength(1);
        expect(created[0].key).toBe('anomaly:heartRate');
        expect(created[0].condition.source).toBe('ml_anomaly');
        expect(created[0].condition.message).toMatch(/above this patient's baseline/);
    });

    test('does not alert before the baseline has warmed up', () => {
        const { actions } = run(null, [...repeat(drift(70), 10), ...repeat(drift(88), 30)]);
        expect(actions.filter(a => a.key === 'anomaly:heartRate')).toEqual([]);
    });

    test('ignores SpO2 rising (only drops matter)', () => {
        const spo2Up = (v) => (i) => ({ heartRate: 70 + (i % 3), spo2: v, temperature: 36.8 });
        const base = repeat((i) => ({ heartRate: 70 + (i % 3), spo2: 94 + (i % 2), temperature: 36.8 }), 120);
        const { actions } = run(null, [...base, ...repeat(spo2Up(99), 30)]);
        expect(actions.filter(a => a.key === 'anomaly:spo2')).toEqual([]);
    });

    test('clinician false-alarm feedback reduces sensitivity for that patient', () => {
        let warm = run(null, repeat(drift(70), 120));
        const mild = repeat(drift(84), 30);

        const before = run(warm.state, mild, { start: warm.now });
        expect(before.actions.some(a => a.key === 'anomaly:heartRate')).toBe(true);

        let tuning;
        for (let i = 0; i < 4; i++) tuning = applyFeedback(tuning, 'false_alarm');
        expect(tuning.multiplier).toBeGreaterThan(1.7);
        warm.state.tuning = { heartRate: tuning };

        const after = run(warm.state, mild, { start: warm.now });
        expect(after.actions.some(a => a.key === 'anomaly:heartRate')).toBe(false);
    });

    test('feedback multiplier is bounded', () => {
        let t;
        for (let i = 0; i < 50; i++) t = applyFeedback(t, 'false_alarm');
        expect(t.multiplier).toBe(1.8);
        for (let i = 0; i < 100; i++) t = applyFeedback(t, 'useful');
        expect(t.multiplier).toBe(0.85);
    });
});

describe('device problems', () => {
    test('frozen readings raise a stale-device alert and hold clinical alerts open', () => {
        const low = { heartRate: 72, spo2: 90, temperature: 36.8 };
        // same exact values for 20 min
        const { actions } = run(null, repeat(low, 40));
        const types = actions.map(a => `${a.type}:${a.key}`);
        expect(types).toContain('create:news2');
        expect(types).toContain('create:device:stale');
        expect(types).not.toContain('resolve:news2');
    });

    test('an old device timestamp is treated as stale immediately (no clinical alert on old data)', () => {
        const old = { heartRate: 72, spo2: 90, temperature: 34.8, updatedAt: T0 - 60 * MIN };
        const { actions } = run(null, repeat(old, 4));
        expect(actions.map(a => a.key)).toEqual(['device:stale']);
    });

    test('device timestamps in seconds are understood', () => {
        const fresh = { ...normal(0), timestamp: Math.floor(T0 / 1000) };
        expect(normalizeReading(fresh, CFG).sourceTime).toBe(T0);
    });

    test('implausible readings for 2 minutes raise signal-lost', () => {
        const off = { heartRate: 0, spo2: 0, temperature: 20 };
        const { actions } = run(null, [...repeat(normal, 4), ...repeat(off, 6)]);
        expect(actions.map(a => a.key)).toEqual(['device:signal']);
    });
});

test('evaluations closer than minIntervalSec are skipped', () => {
    const first = step(null, normal(0), T0, CFG, CTX);
    expect(step(first.state, normal(1), T0 + 1000, CFG, CTX)).toBeNull();
    expect(step(first.state, normal(1), T0 + CFG.minIntervalSec * 1000, CFG, CTX)).not.toBeNull();
});

// ---------------------------------------------------------------------------
// Integration with an in-memory stand-in for firebase-admin's database API
// ---------------------------------------------------------------------------

function fakeDb(initial) {
    const root = JSON.parse(JSON.stringify(initial));
    const parts = (p) => p.split('/').filter(Boolean);
    const get = (p) => parts(p).reduce((n, k) => (n == null ? undefined : n[k]), root);
    const put = (p, v) => {
        const ks = parts(p);
        let n = root;
        ks.slice(0, -1).forEach(k => { n[k] = n[k] || {}; n = n[k]; });
        if (v === null || v === undefined) delete n[ks[ks.length - 1]];
        else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    const snap = (v) => ({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined });
    return {
        root,
        ref: (p) => ({
            once: async () => snap(get(p)),
            set: async (v) => put(p, v),
            update: async (v) => Object.entries(v).forEach(([k, val]) => put(`${p}/${k}`, val)),
            transaction: async (fn) => {
                const next = fn(get(p) === undefined ? null : JSON.parse(JSON.stringify(get(p))));
                if (next === undefined) return { committed: false };
                put(p, next);
                return { committed: true };
            }
        })
    };
}

describe('evaluateDevice', () => {
    test('creates an alert record and history for the linked patient', async () => {
        const db = fakeDb({
            patients: { pat_1: { firstName: 'Ada', lastName: 'L', deviceId: 'health' } },
            health: { heartRate: 72, spo2: 90, temperature: 36.8 }
        });

        await engine.evaluateDevice(db, 'health', { now: T0 });
        db.root.health.heartRate = 74; // keep it changing
        const out = await engine.evaluateDevice(db, 'health', { now: T0 + 40000 });

        expect(out.results[0].actions).toEqual([expect.objectContaining({ type: 'create', key: 'news2', severity: 'warning' })]);
        const alerts = Object.values(db.root.alerts);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ patientId: 'pat_1', patientName: 'Ada L', status: 'active', engineKey: 'news2' });
        expect(Object.keys(db.root.healthData)).toHaveLength(1); // one per minute, not per call

        // A clinician resolves it as a false alarm: engine state closes and cooldown starts
        await engine.recordResolution(db, alerts[0], 'false_alarm', T0 + 60000);
        expect(db.root.alertEngine.state.pat_1.alerts.news2.open).toBe(false);
        // NEWS2 is never tuned by feedback
        expect(db.root.alertEngine.state.pat_1.tuning).toBeUndefined();
    });

    test('unassigned device is evaluated under a device pseudo-patient', async () => {
        const db = fakeDb({ health: { heartRate: 72, spo2: 98, temperature: 36.8 } });
        const out = await engine.evaluateDevice(db, 'health', { now: T0 });
        expect(out.results[0].patientId).toBe('device_health');
    });

    test('dry run does not write anything', async () => {
        const db = fakeDb({ health: { heartRate: 72, spo2: 90, temperature: 36.8 } });
        const out = await engine.evaluateDevice(db, 'health', { now: T0, dryRun: true });
        expect(out.results[0].dryRun).toBe(true);
        expect(db.root.alertEngine).toBeUndefined();
        expect(db.root.alerts).toBeUndefined();
    });
});
