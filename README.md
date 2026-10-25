# HealthMonitor: IoT Patient Monitoring & Alert System

Real-time vital-sign monitoring for ESP32-based wearables. The device posts heart rate, SpO₂ and temperature to an Express API that stores them in Firebase, a web dashboard shows them live, and an alert engine combines a clinical early-warning score with per-patient machine learning to flag deterioration early.

**Live:** https://final-iot-delta.vercel.app (use **Explore the live demo** on the sign-in page for a read-only tour)

---

## Features

- **Live dashboard:** vitals update in real time from Firebase; patients, devices, alerts and analytics pages.
- **Alert engine:**
  - NEWS2 early-warning scoring.
  - Adaptive per-patient baselines that catch drift before fixed thresholds are crossed.
  - Device-fault detection.
  - Alerts are de-duplicated, escalated, and auto-resolved.
  - Learns each patient's sensitivity from clinician feedback.
- **Analytics:** heart rate, temperature and SpO₂ trends over 7, 30 or 90 days, plus automated health insights.
- **Dr. AI:** a 3D assistant that answers questions about the patient's current vitals (LLM via OpenRouter, with a built-in fallback).
- **Email and SMS alerts:** warning and critical alerts are emailed (SMTP) and texted (Twilio) to every signed-up account (each can turn them off or choose critical-only in Settings) when they are created or escalated. Emails come from a no-reply sender. Each send is recorded on the alert as sent, skipped or failed.
- **Accounts:**
  - Email/password sign-up and sign-in, plus Google and GitHub sign-in.
  - Expiring JWT sessions.
  - A read-only demo account.
- **Security:**
  - Every data API requires a valid session.
  - Login is rate limited.
  - Security headers via Helmet.
  - Password hashes are never returned.
  - Devices can be required to present an API key.

---

## Architecture

```
 ESP32 + MAX30102 / DS18B20
   │  HTTP POST over Wi-Fi (JSON, optional X-Device-Key)
   │    /api/health-data      one reading
   │    /api/devices/heartbeat
   │    /api/alerts           device-raised alert (button / local threshold)
   ▼
 Express API (Vercel serverless, api/server.js → backend/server.js)
   validates the reading, stores history in /healthData,
   updates the live /health node
   auth · patients · devices · alerts · analytics · chat
   ▼
 Firebase Realtime Database
   /health  /healthData  /patients  /devices  /alerts  /alertEngine
   │  live listener + 1-minute sweep
   ▼
 Alert worker (npm run worker)
   runs the alert engine: NEWS2, per-patient baselines, device faults
   writes /alerts and /alertEngine/state
   new or escalated warning/critical alert → email (SMTP) + SMS (Twilio),
   result recorded at /alerts/{id}/notifications/{event}
   ▼
 Web dashboard (static HTML/CSS/JS in frontend/)
   reads live vitals and alerts from Firebase, everything else via the API
```

1. The ESP32 reads the sensors and POSTs a JSON reading to `/api/health-data`. It also sends heartbeats and can raise its own alert.
2. The API checks the device key (when `DEVICE_API_KEY` is set) and validates the reading. It appends the reading to the history and updates `/health`.
3. The alert worker sees the change and evaluates that patient. The engine opens, escalates or resolves alerts and notifies the care team.
4. The dashboard subscribes to `/health` and `/alerts` for live updates, and calls the API (with a JWT session) for everything else.

- **Backend:** Node.js 18+, Express, `firebase-admin` (Realtime Database and ID-token verification), `jsonwebtoken`, `bcryptjs`.
- **Frontend:** plain HTML/CSS/JS, Chart.js, Firebase Web SDK v8 (live data and social sign-in), Three.js (Dr. AI model).
- **Hosting:** Vercel serves the frontend and runs the API as a serverless function. The alert worker is a separate always-on Node process.

---

## Project structure

```
api/server.js                 Vercel entry point (wraps backend/server.js)
backend/
  server.js                   Express app: security, routing, static frontend
  worker.js                   Always-on alert worker (watches device nodes)
  database.js                 Realtime Database helpers
  firebase-config.js          firebase-admin initialisation
  middleware/auth.js          JWT sessions, device-key check, demo read-only rule
  routes/
    auth.js                   signup, login, social sign-in, demo, /me
    patients.js               patient records merged with live device readings
    devices.js                device list, status, ESP32 heartbeat
    healthData.js             reading ingestion and history
    alerts.js                 alert list, actions, feedback, engine trigger and status
    analytics.js              trends and insights
    chat.js                   Dr. AI chat
  services/
    alertEngine.js            The alert engine (see below)
    notificationService.js    Email (SMTP) and SMS (Twilio) alerts to the care team
    __tests__/                Jest tests for the alert engine and notifications
  models/HealthData.js        Reading validation and status assessment
frontend/
  index.html                  Landing page
  login.html, signup.html     Authentication (css/auth.css, js/auth-ui.js)
  dashboard.html, patients.html, devices.html, alerts.html,
  analytics.html, settings.html, dr-ai.html
  js/session.js               Session guard and auth header for every API call (load first)
  js/auth.js                  Google/GitHub sign-in via Firebase Auth
  js/firebase-realtime.js     Live listeners on the Realtime Database
  models/                     Dr. AI 3D model (.glb)
hardware/esp32_health_monitor/
  esp32_health_monitor.ino    ESP32 firmware
vercel.json                   Vercel build and routing
```

---

## Getting started

### Prerequisites

- Node.js 18 or newer
- A Firebase project with:
  - **Realtime Database** enabled
  - a **service account** key (Project settings → Service accounts → Generate new private key)
  - optionally, **Authentication** with the Google and/or GitHub providers enabled (for social sign-in)

### Install and run

```bash
git clone https://github.com/Yusuf-469/final-iot.git
cd final-iot
npm install
cp .env.example .env        # then fill in the values below
npm run dev                 # API + frontend on http://localhost:3000
```

In a second terminal, start the alert worker:

```bash
npm run worker
```

Open http://localhost:3000, create an account, and add a patient whose **device ID** is `health`. That links the patient to the live `/health` node.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_PROJECT_ID` | yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | yes | Service-account client email |
| `FIREBASE_PRIVATE_KEY` | yes | Service-account private key (`\n` escapes are accepted) |
| `FIREBASE_DATABASE_URL` | yes | e.g. `https://<project>-default-rtdb.firebaseio.com` |
| `JWT_SECRET` | yes | Long random string used to sign sessions. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it signs everyone out. |
| `JWT_EXPIRES_IN` | no | Session lifetime, default `7d` |
| `PORT` | no | Local port, default `8080` |
| `FRONTEND_URL` | no | Allowed CORS origin, default `*` |
| `DEVICE_API_KEY` | no | If set, devices must send `X-Device-Key: <value>` when posting readings, alerts or heartbeats |
| `OPENROUTER_API_KEY` | no | Enables LLM answers in Dr. AI; without it Dr. AI uses built-in answers |
| `OPENROUTER_MODEL` | no | OpenRouter model ID, default `openrouter/free` |
| `ALERT_DEVICE_NODES` | no | Comma-separated device nodes the alert engine watches, default `health` |
| `ALERT_SWEEP_SEC` | no | How often the worker re-checks every device, default `60` |
| `ALERT_EMAIL_TO` | no | Extra emails that always get alerts. Every signed-up account already gets them unless it turns them off in Settings |
| `ALERT_SMS_TO` | no | Comma-separated care-team phone numbers (E.164, e.g. `+919876543210`) |
| `ALERT_NOTIFY_SEVERITIES` | no | Severities that notify, default `warning,critical` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `ALERT_EMAIL_FROM` | no | SMTP server for alert emails; email is skipped if `SMTP_HOST` is unset. The sender defaults to "HealthMonitor (No-Reply)" <SMTP_USER> |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | no | Twilio credentials and sender number for alert SMS; SMS is skipped if unset |

A patient record can also carry `contactEmail` and `contactPhone`; they are added to that patient's alert recipients.

---

## Alert engine

`backend/services/alertEngine.js` evaluates the latest reading of each device node for every patient linked to it. It has four layers:

1. **Early-warning score (NEWS2).** Heart rate, SpO₂ (scale 1) and temperature are scored with the Royal College of Physicians NEWS2 bands. Respiratory rate and systolic blood pressure are included when the device sends them. Results map to alerts as follows:

   | NEWS2 result | Alert |
   |---|---|
   | Total of 7 or more | **critical** |
   | Total of 5–6 | **warning** |
   | Any single parameter scoring 3 | **warning** |

   These thresholds are fixed, are the system's safety floor, and are never changed by feedback.
2. **Adaptive baseline (ML).**
   - For each patient and each vital, the engine keeps a slow exponentially weighted mean and variance (about 6 hours of memory) and a fast average (about 5 minutes).
   - It alerts when the fast average moves more than 3.5 standard deviations from the patient's own baseline. This catches changes that are still "normal" on paper, such as a resting heart rate climbing from 68 to 88.
   - Alerts only start after about 30 minutes of data.
   - The baseline learns ten times slower while the patient looks abnormal, so it doesn't absorb a deterioration as the new normal.
   - SpO₂ only alerts on drops.
3. **Signal quality.**
   - **Sensor signal lost:** implausible values (for example 0 bpm with no finger on the sensor) for 2 minutes.
   - **No new readings:** identical values for 15 minutes, or a device timestamp older than 15 minutes.
   - While the data can't be trusted, clinical alerts are held open rather than auto-resolved.
4. **Alert lifecycle.**
   - A condition must persist before it alerts: 10 seconds if critical, 30 seconds otherwise. One glitchy reading never alerts.
   - One alert per problem. If the problem worsens, the existing alert is escalated rather than duplicated.
   - Alerts auto-resolve after 10 minutes clear.
   - After an alert closes, the same alert isn't raised again for 15 minutes, unless the new one is more severe.

**Learning from feedback.** On the Alerts page, clinicians resolve an alert as 👍 *useful* or 👎 *false alarm*. For adaptive-baseline alerts this adjusts that patient's sensitivity for that vital:
- *false alarm* multiplies the threshold by 1.15, up to a maximum of 1.8×;
- *useful* multiplies it by 0.95, down to a minimum of 0.85×.

Every alert carries a plain-language explanation and a snapshot of the vitals, for example: *"NEWS2 score 5: SpO₂ 92 % (+2), HR 112 bpm (+2), Temp 38.2 °C (+1). Urgent clinical review recommended."*

### How the engine is triggered

The engine runs whenever any of these call it. State is updated in Firebase transactions, so it's safe for several to run at once.

| Trigger | When to use |
|---|---|
| `npm run worker` | **Recommended.** An always-on process that listens to device nodes in real time and re-checks every minute. Run it on any always-on host. |
| Open dashboard | Fallback. While a signed-in, non-demo user has the dashboard open, a change to `/health` triggers an evaluation (at most every 20 seconds). |
| `POST /api/alerts/evaluate` | For an external scheduler, or for manual checks. Send `{"dryRun": true}` to preview the result without writing anything. |
| **Run Analysis** button (Alerts page) | Evaluate immediately. |

### Configuration

Defaults live in `DEFAULT_CONFIG` in `alertEngine.js`. Override any of them at runtime by writing to `/alertEngine/config` in the Realtime Database; no redeploy is needed. For example:

```json
{
  "tempOffsetC": 2.5,
  "cooldownMin": 20,
  "baseline": { "zThreshold": 4 }
}
```

> **Temperature sensors:** a fingertip or skin sensor reads 2–4 °C below core body temperature. NEWS2 scores readings of 35.0 °C or below as hypothermia. If your sensor measures skin temperature, set `tempOffsetC` so the engine estimates core temperature. The right value is a clinical decision for your sensor and placement.

---

## Data model (Realtime Database)

| Path | Contents | Written by |
|---|---|---|
| `/health` | Latest live reading: `heartRate`, `spo2`, `temperature` (optional `updatedAt`, `bloodPressure`, `respiratoryRate`) | API (from `POST /api/health-data`) |
| `/patients/{id}` | `firstName`, `lastName`, `age`, `deviceId` (the device node, e.g. `health`) | API |
| `/devices/{id}` | Device metadata and `lastHeartbeat` | API |
| `/healthData/{id}` | Reading history: one entry per patient per minute, plus readings posted to the API | Alert engine, API |
| `/alerts/{id}` | Alert records: severity, status, explanation, vitals, resolution, feedback and `notifications/{event}` send results | Alert engine, API |
| `/alertEngine/state/{patientId}` | Baselines, open alerts, cooldowns, learned sensitivity | Alert engine |
| `/alertEngine/config` | Optional threshold overrides | You |
| `/users/{id}` | Accounts (bcrypt password hashes) | API |

### Recommended database rules

The dashboard reads `/health`, `/patients`, `/alerts` and `/devices` directly from the browser. `/users` and `/alertEngine` must only be reachable through the server (the Admin SDK bypasses rules). The example below keeps the four dashboard paths publicly readable; restrict them further if your deployment needs that.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "health":     { ".read": true, ".write": true },
    "patients":   { ".read": true },
    "alerts":     { ".read": true, ".indexOn": ["engineVersion"] },
    "devices":    { ".read": true },
    "users":      { ".indexOn": ["email"] },
    "healthData": { ".indexOn": ["timestamp", "patientId"] }
  }
}
```

`"health": { ".write": true }` lets any client write vitals, which is the simplest setup for an ESP32 writing directly to Firebase. For production, give the device its own Firebase Auth identity and restrict writes to it.

---

## API reference

Every endpoint except the public ones requires `Authorization: Bearer <token>`. Tokens come from the auth endpoints. Demo sessions are read-only, except for chat.

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/health`, `/ping`, `/ready` | Liveness checks |
| GET | `/api` | API info |
| GET | `/api/config/firebase` | Public Firebase web config |

### Auth: `/api/auth`

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/signup` | `firstName, lastName, email, password` | Create an account (password of 8+ characters) |
| POST | `/login` | `email, password` | Sign in |
| POST | `/firebase` | `idToken` | Exchange a Firebase (Google/GitHub) ID token for a session |
| POST | `/demo` | | Read-only demo session |
| GET | `/me` | | Current user |
| POST | `/logout` | | Ends the session (client discards the token) |

Login, signup, social sign-in and demo are limited to 20 attempts per 15 minutes per IP address.

### Data

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Live `/health` reading |
| GET, POST | `/api/patients` | List patients (merged with live readings), or create one |
| GET, PUT, DELETE | `/api/patients/:id` | Read, update or delete a patient |
| GET | `/api/devices`, `/api/devices/:id` | Devices and their online/stale/offline status |
| POST | `/api/devices/heartbeat` | Device heartbeat `{ deviceId }` (device key) |
| POST | `/api/health-data` | Submit a reading (device key): `{ patientId, deviceId, heartRate, temperature, spo2, bloodPressure? }` |
| POST | `/api/health-data/bulk` | Submit up to 500 readings |
| GET | `/api/health-data/:patientId` | Reading history (`period`, `limit`, `skip` query parameters) |
| GET | `/api/health-data/:patientId/latest`, `/summary` | Latest reading, or aggregates over a period |
| GET | `/api/analytics/readings?range=7d\|30d\|90d` | Trend data (`sample: true` when no history exists yet) |
| GET | `/api/analytics/insights` | Automated health insights |
| POST | `/api/chat` | Dr. AI: `{ message, history? }` |

### Alerts: `/api/alerts`

| Method | Path | Description |
|---|---|---|
| GET | `/` | List alerts (`status`, `severity`, `patientId`, `limit`, `skip` query parameters) |
| GET | `/active`, `/statistics` | Active alerts, or counts by severity/status/type |
| POST | `/` | Create a manual or device alert |
| PUT | `/:id/acknowledge` | Acknowledge |
| PUT | `/:id/resolve` | Resolve: `{ method?, notes?, feedback?: "useful" \| "false_alarm" }` |
| PUT | `/:id/escalate` | Escalate: `{ level, escalatedTo, reason }` |
| POST | `/evaluate` | Run the alert engine: `{ deviceId?, dryRun? }` |
| POST | `/generate-predictions` | Run the engine now (used by **Run Analysis**) |
| GET | `/predictions/status` | Engine status: patients, evaluations, baselines learned, last run |

---

## Hardware

`hardware/esp32_health_monitor/esp32_health_monitor.ino` targets an ESP32 with:

- **MAX30102** for heart rate and SpO₂ (I²C)
- **DS18B20** for temperature (GPIO 4)
- a buzzer (GPIO 2), an LED (GPIO 32) and a button (GPIO 35) for local alerts

Before flashing, set `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL` (your deployment's `/api/health-data` URL), `DEVICE_ID` and `PATIENT_ID`. If `DEVICE_API_KEY` is set on the server, also add the `X-Device-Key` header in `transmitHealthData()` and `sendHeartbeat()`.

The firmware sends each reading to `SERVER_URL` and derives the heartbeat (`/api/devices/heartbeat`) and alert (`/api/alerts`) URLs from it. The API, not the device, writes to Firebase, so the device needs no Firebase credentials.

---

## Deployment (Vercel)

1. Import the repository into Vercel. `vercel.json` serves `frontend/` as static files and routes `/api/*`, `/health`, `/ping` and `/ready` to `api/server.js`.
2. Add the environment variables listed above in **Project → Settings → Environment Variables**. At minimum, set the four `FIREBASE_*` variables and `JWT_SECRET`.
3. For Google/GitHub sign-in, add your Vercel domain under Firebase **Authentication → Settings → Authorized domains**.
4. Run `npm run worker` on an always-on host with the same Firebase variables, so alerts are raised around the clock. Vercel functions can't hold a live listener.

---

## Development

```bash
npm run dev       # API with auto-reload
npm run worker    # alert worker
npm test          # Jest tests (alert engine: scoring, baselines, lifecycle, feedback, device faults; notifications)
npm run lint      # ESLint
```

---

## Disclaimer

HealthMonitor is a monitoring aid. It does not diagnose and it is not a certified medical device. Alerts support clinical judgement; they don't replace it.
