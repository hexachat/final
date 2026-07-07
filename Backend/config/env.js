require('dotenv').config();
const defaults = require('./defaults');

const RAILWAY_KEYS = new Set(['PORT', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']);

function isUsableEnvValue(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (text.includes('REPLACE_ME')) return false;
  return true;
}

function fromRailway(key) {
  if (!RAILWAY_KEYS.has(key)) return null;
  const val = process.env[key];
  return isUsableEnvValue(val) ? String(val).trim() : null;
}

function env(key) {
  if (key === 'PORT') {
    return fromRailway('PORT') || defaults.PORT;
  }

  if (key === 'GMAIL_USER' || key === 'SMTP_USER') {
    return fromRailway('GMAIL_USER') || defaults.GMAIL_USER;
  }

  if (key === 'GMAIL_APP_PASSWORD' || key === 'SMTP_PASS') {
    const pass = fromRailway('GMAIL_APP_PASSWORD') || defaults.GMAIL_APP_PASSWORD;
    return String(pass || '').replace(/\s/g, '');
  }

  if (key === 'SMTP_FROM') {
    return `HexaChat <${env('GMAIL_USER')}>`;
  }

  return defaults[key];
}

module.exports = { env, defaults, RAILWAY_KEYS };
