const crypto = require('crypto');

function generateOTP(length = 6) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
}

function getOTPExpiry() {
  const { env } = require('../config/env');
  const minutes = parseInt(env('OTP_EXPIRY_MINUTES') || '10', 10);
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = { generateOTP, getOTPExpiry };
