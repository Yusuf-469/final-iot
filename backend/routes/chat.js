/**
 * Dr. AI Chat Route
 * Answers questions using the patient's live vitals from /health.
 * Uses OpenRouter when OPENROUTER_API_KEY is set; otherwise falls back to a rule-based assistant.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { logger } = require('../utils/logger');

const MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = [
  'You are Dr. AI, the assistant inside the HealthMonitor IoT patient-monitoring dashboard.',
  'You explain vital signs (heart rate, temperature, SpO2, blood pressure) clearly and briefly.',
  'Use the live readings provided when they are relevant. Normal adult ranges: HR 60-100 bpm,',
  'temperature 36.1-37.5 °C, SpO2 >= 95%.',
  'You are not a doctor: never diagnose. For concerning values, advise contacting a clinician,',
  'and for emergencies tell the user to call local emergency services. Keep answers under 120 words.',
  'Reply in plain text only: no markdown, no asterisks, no headings.'
].join(' ');

const getLiveVitals = async () => {
  try {
    const db = getDb();
    if (!db) return null;
    return (await db.ref('health').once('value')).val();
  } catch (error) {
    logger.warn(`Chat could not read live vitals: ${error.message}`);
    return null;
  }
};

const describeVitals = (v) => {
  if (!v) return 'No live readings are available right now.';
  const parts = [];
  if (v.heartRate != null) parts.push(`heart rate ${Math.round(v.heartRate)} bpm`);
  if (v.temperature != null) parts.push(`temperature ${Number(v.temperature).toFixed(1)} °C`);
  if (v.spo2 != null) parts.push(`SpO2 ${Math.round(v.spo2)}%`);
  if (v.bloodPressure?.systolic) parts.push(`blood pressure ${v.bloodPressure.systolic}/${v.bloodPressure.diastolic} mmHg`);
  return parts.length ? `Latest readings: ${parts.join(', ')}.` : 'No live readings are available right now.';
};

const ruleBasedReply = (message, vitals) => {
  const m = message.toLowerCase();
  const summary = describeVitals(vitals);

  if (/\b(hi|hello|hey)\b/.test(m)) {
    return `Hello! I'm Dr. AI. ${summary} Ask me about any of your vitals, trends, or alerts.`;
  }
  if (/heart|pulse|bpm/.test(m)) {
    const hr = vitals?.heartRate;
    if (hr == null) return 'I don\'t have a live heart-rate reading yet. Check that the device is connected.';
    const verdict = hr < 60 ? 'below the typical resting range (60–100 bpm)' : hr > 100 ? 'above the typical resting range (60–100 bpm)' : 'within the normal resting range (60–100 bpm)';
    return `Your heart rate is ${Math.round(hr)} bpm, which is ${verdict}.${hr < 50 || hr > 120 ? ' If you feel unwell, please contact a clinician.' : ''}`;
  }
  if (/temp|fever/.test(m)) {
    const t = vitals?.temperature;
    if (t == null) return 'I don\'t have a live temperature reading yet.';
    const verdict = t > 37.5 ? 'slightly elevated — this can indicate a fever' : t < 36.1 ? 'below the typical range' : 'normal';
    return `Your temperature is ${Number(t).toFixed(1)} °C, which is ${verdict}.`;
  }
  if (/spo2|oxygen|saturation/.test(m)) {
    const s = vitals?.spo2;
    if (s == null) return 'I don\'t have a live SpO2 reading yet.';
    return s >= 95
      ? `Your blood oxygen is ${Math.round(s)}%, which is healthy (95% or higher).`
      : `Your blood oxygen is ${Math.round(s)}%, below the healthy 95% threshold. If it stays low or you feel short of breath, contact a clinician.`;
  }
  if (/status|how am i|overall|summary|health/.test(m)) {
    return `${summary} I'll flag anything outside normal ranges on the Alerts page.`;
  }
  if (/alert|concern|warning/.test(m)) {
    return 'Open the Alerts page to see active alerts. I flag heart rate outside 60–100 bpm, temperature outside 36.1–37.5 °C, and SpO2 below 95%.';
  }
  if (/recommend|advice|tip/.test(m)) {
    return 'Stay hydrated, keep regular sleep and activity, and keep the sensor snug for accurate readings. For anything specific to your health, please speak with a clinician.';
  }
  return `I can help with heart rate, temperature, SpO2, blood pressure, and alerts. ${summary}`;
};

const askLLM = async (message, history, vitals) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'HealthMonitor Dr. AI'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${describeVitals(vitals)}` },
          ...history,
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    clearTimeout(timer);
  }
};

// POST /api/chat  { message, history?: [{role, content}] }
router.post('/', async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 2000);
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const history = Array.isArray(req.body.history)
    ? req.body.history
      .filter(h => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string')
      .slice(-8)
      .map(h => ({ role: h.role, content: h.content.slice(0, 2000) }))
    : [];

  const vitals = await getLiveVitals();

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const reply = await askLLM(message, history, vitals);
      if (reply) return res.json({ response: reply, source: 'llm' });
    } catch (error) {
      logger.warn(`Dr. AI LLM unavailable, using rule-based reply: ${error.message}`);
    }
  }

  res.json({ response: ruleBasedReply(message, vitals), source: 'rules' });
});

module.exports = router;
