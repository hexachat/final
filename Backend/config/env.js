require('dotenv').config();
const defaults = require('./defaults');

function env(key) {
  return process.env[key] || defaults[key];
}

module.exports = { env, defaults };
