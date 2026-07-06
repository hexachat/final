const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const JWT_SECRET = env('JWT_SECRET');
const JWT_EXPIRES_IN = env('JWT_EXPIRES_IN') || '7d';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = { generateToken, verifyToken, decodeToken };
