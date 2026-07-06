require('dotenv').config();
const defaults = require('./defaults');

function isUsableEnvValue(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (text.includes('REPLACE_ME')) return false;
  return true;
}

function env(key) {
  const fromEnv = process.env[key];
  if (isUsableEnvValue(fromEnv)) return String(fromEnv).trim();
  return defaults[key];
}

module.exports = { env, defaults };
