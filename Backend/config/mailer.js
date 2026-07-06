const nodemailer = require('nodemailer');
const { env } = require('./env');

const SMTP_USER = (env('SMTP_USER') || env('GMAIL_USER') || '').trim();
const SMTP_PASS = (env('SMTP_PASS') || env('GMAIL_APP_PASSWORD') || '').replace(/\s/g, '');

function createTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: env('SMTP_HOST') || 'smtp.gmail.com',
    port: parseInt(env('SMTP_PORT') || '465', 10),
    secure: env('SMTP_SECURE') !== 'false',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000,
    tls: { minVersion: 'TLSv1.2' }
  });
}

const transporter = createTransporter();

function isSmtpConfigured() {
  return !!(SMTP_USER && SMTP_PASS && transporter);
}

async function sendOTPEmail(to, otp, type = 'verification') {
  const subjects = {
    verification: 'HexaChat - Verify Your Email',
    signup: 'HexaChat - Verify Your Email',
    reset: 'HexaChat - Password Reset OTP',
    login: 'HexaChat - Login OTP'
  };

  const messages = {
    verification: 'Use this OTP to verify your HexaChat account:',
    signup: 'Use this OTP to verify your HexaChat account:',
    reset: 'Use this OTP to reset your HexaChat password:',
    login: 'Use this OTP to login to HexaChat:'
  };

  if (!isSmtpConfigured()) {
    console.warn(`[OTP] SMTP not configured — OTP for ${to}: ${otp}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const from = env('SMTP_FROM') || `HexaChat <${SMTP_USER}>`;
  const mailOptions = {
    from,
    to,
    subject: subjects[type] || subjects.verification,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #fff; border-radius: 16px;">
        <h1 style="color: #3b82f6; margin-bottom: 8px;">HexaChat</h1>
        <p style="color: #a1a1aa; margin-bottom: 24px;">${messages[type] || messages.verification}</p>
        <div style="background: #18181b; border: 1px solid #3b82f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #60a5fa;">${otp}</span>
        </div>
        <p style="color: #71717a; font-size: 14px;">This OTP expires in ${env('OTP_EXPIRY_MINUTES') || 10} minutes. Do not share it with anyone.</p>
      </div>
    `
  };

  const sendPromise = transporter.sendMail(mailOptions);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('SMTP connection timed out')), 8000);
  });

  try {
    await Promise.race([sendPromise, timeoutPromise]);
    console.log(`[OTP] Email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[OTP] Email failed for ${to}:`, err.message);
    console.warn(`[OTP] OTP code for ${to}: ${otp}`);
    return { sent: false, reason: err.message };
  }
}

async function sendOTPEmailWithTimeout(to, otp, type = 'signup', timeoutMs = 6000) {
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
  transporter,
  sendOTPEmail,
  sendOTPEmailWithTimeout,
  sendOTPEmailAsync,
  isSmtpConfigured
};
