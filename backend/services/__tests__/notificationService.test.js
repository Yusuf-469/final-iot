jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: mockSendMail })) }));

const notifications = require('../notificationService');
const { notifyAlert, formatAlert, _reset } = notifications;

const ALERT = {
    alertId: 'ALT-1',
    patientId: 'p1',
    patientName: 'Asha Rao',
    deviceId: 'health',
    severity: 'critical',
    title: 'NEWS2 score 7',
    message: 'SpO2 91% (+3), HR 131 bpm (+3), Temp 38.2 C (+1). Emergency assessment recommended.',
    vitals: { heartRate: 131, spo2: 91, temperature: 38.2 },
};

const ENV_KEYS = ['ALERT_EMAIL_TO', 'ALERT_SMS_TO', 'ALERT_NOTIFY_SEVERITIES', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
    'ALERT_EMAIL_FROM', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'FRONTEND_URL'];
const saved = {};

beforeEach(() => {
    ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
    mockSendMail.mockReset();
    global.fetch = jest.fn();
    _reset();
});
afterEach(() => {
    ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
});

describe('notifyAlert', () => {
    test('reports every channel as skipped (never "sent") when nothing is configured', async () => {
        const results = await notifyAlert(ALERT);
        expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped']);
        expect(mockSendMail).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('does not notify for info-level alerts', async () => {
        process.env.ALERT_EMAIL_TO = 'ward@example.com';
        process.env.SMTP_HOST = 'smtp.example.com';
        const [r] = await notifyAlert({ ...ALERT, severity: 'info' });
        expect(r.status).toBe('skipped');
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    test('emails the care team plus the patient contact, without duplicates', async () => {
        process.env.ALERT_EMAIL_TO = 'ward@example.com, nurse@example.com';
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'alerts@example.com';
        mockSendMail.mockResolvedValue({ messageId: 'm-1' });

        const results = await notifyAlert(ALERT, { patient: { contactEmail: 'family@example.com, ward@example.com' } });
        const email = results.find((r) => r.channel === 'email');
        expect(email).toMatchObject({ status: 'sent', recipients: 3 });
        // one message per recipient, so nobody sees the other addresses
        expect(mockSendMail.mock.calls.map(([m]) => m.to)).toEqual(['ward@example.com', 'nurse@example.com', 'family@example.com']);
        const mail = mockSendMail.mock.calls[0][0];
        expect(mail.from).toBe('"HealthMonitor" <alerts@example.com>');
        expect(mail.headers['Auto-Submitted']).toBe('auto-generated');
        expect(mail.subject).toContain('CRITICAL');
        expect(mail.text).toContain('Asha Rao');
        expect(mail.text).toContain('HR 131 bpm');
        expect(mail.text).toContain('Your HealthMonitor team');
        expect(mail.html).toContain('Asha Rao');
    });

    test('sends SMS through the Twilio REST API with basic auth', async () => {
        Object.assign(process.env, { ALERT_SMS_TO: '+919800000001', TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550001111' });
        global.fetch.mockResolvedValue({ ok: true, json: async () => ({ sid: 'SM1' }) });

        const results = await notifyAlert(ALERT, { event: 'escalated' });
        expect(results.find((r) => r.channel === 'sms')).toMatchObject({ status: 'sent', recipients: 1 });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
        expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('AC123:tok').toString('base64')}`);
        const body = new URLSearchParams(init.body);
        expect(body.get('To')).toBe('+919800000001');
        expect(body.get('From')).toBe('+15550001111');
        expect(body.get('Body')).toContain('escalated to CRITICAL');
    });

    test('a provider failure is reported as failed and never throws', async () => {
        Object.assign(process.env, { ALERT_EMAIL_TO: 'ward@example.com', SMTP_HOST: 'smtp.example.com',
            ALERT_SMS_TO: '+919800000001', TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550001111' });
        mockSendMail.mockRejectedValue(new Error('SMTP down'));
        global.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

        const results = await notifyAlert(ALERT);
        expect(results.find((r) => r.channel === 'email')).toMatchObject({ status: 'failed', error: 'SMTP down' });
        expect(results.find((r) => r.channel === 'sms')).toMatchObject({ status: 'failed' });
    });

    test('emails signed-up accounts; critical-only accounts skip warnings', async () => {
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'noreply.healthmonitor@example.com';
        mockSendMail.mockResolvedValue({});
        const accounts = [{ email: 'Doctor@Example.com', name: 'Meera' }, { email: 'nurse@example.com', criticalOnly: true }];

        await notifyAlert({ ...ALERT, severity: 'warning' }, { accounts });
        expect(mockSendMail.mock.calls.map(([m]) => m.to)).toEqual(['doctor@example.com']);
        expect(mockSendMail.mock.calls[0][0].text.startsWith('Hello Meera,')).toBe(true);

        mockSendMail.mockClear();
        await notifyAlert(ALERT, { accounts });
        expect(mockSendMail.mock.calls.map(([m]) => m.to)).toEqual(['doctor@example.com', 'nurse@example.com']);
        expect(mockSendMail.mock.calls[1][0].text.startsWith('Hello there,')).toBe(true);
    });

    test('escapes patient text in the HTML email', async () => {
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.ALERT_EMAIL_TO = 'ward@example.com';
        mockSendMail.mockResolvedValue({});
        await notifyAlert({ ...ALERT, patientName: '<b>Eve</b>' });
        const { html } = mockSendMail.mock.calls[0][0];
        expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
        expect(html).not.toContain('<b>Eve</b>');
    });

    test('respects ALERT_NOTIFY_SEVERITIES', async () => {
        process.env.ALERT_NOTIFY_SEVERITIES = 'critical';
        process.env.ALERT_EMAIL_TO = 'ward@example.com';
        process.env.SMTP_HOST = 'smtp.example.com';
        mockSendMail.mockResolvedValue({});
        const [skipped] = await notifyAlert({ ...ALERT, severity: 'warning' });
        expect(skipped.status).toBe('skipped');
        await notifyAlert(ALERT);
        expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
});

describe('formatAlert', () => {
    test('keeps SMS short and includes the dashboard link', () => {
        process.env.FRONTEND_URL = 'https://final-iot-delta.vercel.app/';
        const { sms, subject } = formatAlert({ ...ALERT, title: 'x'.repeat(500) });
        expect(sms.length).toBeLessThanOrEqual(320);
        expect(subject.startsWith('[HealthMonitor] CRITICAL')).toBe(true);
        expect(formatAlert(ALERT).sms).toContain('https://final-iot-delta.vercel.app/alerts.html');
    });
});
