const nodemailer = require('nodemailer');
const { env } = require('./env');

const SMTP_USER = (env('SMTP_USER') || env('GMAIL_USER') || '').trim();
const SMTP_PASS = (env('SMTP_PASS') || env('GMAIL_APP_PASSWORD') || '').replace(/\s/g, '');

const GMAIL_ATTEMPTS = [
  {
    name: 'gmail-service',
    options: {
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000
    }
  },
  {
    name: 'gmail-465',
    options: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      tls: { minVersion: 'TLSv1.2' }
    }
  },
  {
    name: 'gmail-587',
    options: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      tls: { minVersion: 'TLSv1.2' }
    }
  }
];

function isSmtpConfigured() {
  return !!(SMTP_USER && SMTP_PASS);
}

function getEmailProvider() {
  return isSmtpConfigured() ? 'gmail' : 'none';
}

function isEmailReady() {
  return isSmtpConfigured();
}

function buildOtpHtml(otp, type) {
  const messages = {
    verification: 'Use this OTP to verify your HexaChat account:',
    signup: 'Use this OTP to verify your HexaChat account:',
    reset: 'Use this OTP to reset your HexaChat password:',
    login: 'Use this OTP to login to HexaChat:'
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #fff; border-radius: 16px;">
      <h1 style="color: #3b82f6; margin-bottom: 8px;">HexaChat</h1>
      <p style="color: #a1a1aa; margin-bottom: 24px;">${messages[type] || messages.verification}</p>
      <div style="background: #18181b; border: 1px solid #3b82f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #60a5fa;">${otp}</span>
      </div>
      <p style="color: #71717a; font-size: 14px;">This OTP expires in ${env('OTP_EXPIRY_MINUTES') || 10} minutes. Do not share it with anyone.</p>
    </div>
  `;
}

async function trySendWithTransport(transport, mailOptions, timeoutMs = 15000) {
  const sendPromise = transport.sendMail(mailOptions);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('SMTP connection timed out')), timeoutMs);
  });
  await Promise.race([sendPromise, timeoutPromise]);
}

async function sendViaGmail(to, subject, html) {
  if (!isSmtpConfigured()) {
    console.error('[OTP] Gmail SMTP not configured');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const from = env('SMTP_FROM') || `HexaChat <${SMTP_USER}>`;
  const mailOptions = { from, to, subject, html };

  for (const attempt of GMAIL_ATTEMPTS) {
    let transport;
    try {
      transport = nodemailer.createTransport(attempt.options);
      await trySendWithTransport(transport, mailOptions, 15000);
      console.log(`[OTP] Gmail sent to ${to} via ${attempt.name}`);
      return { sent: true, provider: attempt.name };
    } catch (err) {
      console.error(`[OTP] ${attempt.name} failed for ${to}:`, err.message);
    } finally {
      if (transport) transport.close();
    }
  }

  return { sent: false, reason: 'gmail_all_attempts_failed' };
}

async function sendOTPEmail(to, otp, type = 'verification') {
  const subjects = {
    verification: 'HexaChat - Verify Your Email',
    signup: 'HexaChat - Verify Your Email',
    reset: 'HexaChat - Password Reset OTP',
    login: 'HexaChat - Login OTP'
  };

  return sendViaGmail(to, subjects[type] || subjects.verification, buildOtpHtml(otp, type));
}

async function sendOTPEmailWithTimeout(to, otp, type = 'signup', timeoutMs = 20000) {
  return Promise.race([
    sendOTPEmail(to, otp, type),
    new Promise((resolve) => {
      setTimeout(() => resolve({ sent: false, reason: 'timeout' }), timeoutMs);
    })
  ]);
}

function sendOTPEmailAsync(to, otp, type = 'signup') {
  sendOTPEmail(to, otp, type).catch((err) => {
    console.error(`[OTP] Background send error for ${to}:`, err.message);
  });
}

module.exports = {
  sendOTPEmail,
  sendOTPEmailWithTimeout,
  sendOTPEmailAsync,
  isSmtpConfigured,
  getEmailProvider,
  isEmailReady
};
