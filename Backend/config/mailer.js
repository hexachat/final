const nodemailer = require('nodemailer');
const { env } = require('./env');

const SMTP_USER = (env('SMTP_USER') || env('GMAIL_USER') || '').trim();
const SMTP_PASS = (env('SMTP_PASS') || env('GMAIL_APP_PASSWORD') || '').replace(/\s/g, '');
const BREVO_API_KEY = (env('BREVO_API_KEY') || '').trim();

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

function hasKey(value) {
  return !!(value && !value.includes('REPLACE_ME'));
}

function isSmtpConfigured() {
  return !!(SMTP_USER && SMTP_PASS);
}

function isBrevoConfigured() {
  return hasKey(BREVO_API_KEY);
}

function getEmailProvider() {
  if (isSmtpConfigured()) return 'gmail';
  if (isBrevoConfigured()) return 'brevo';
  return 'none';
}

function isEmailReady() {
  return isSmtpConfigured() || isBrevoConfigured();
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
  if (!isSmtpConfigured()) return { sent: false, reason: 'smtp_not_configured' };

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

async function sendViaBrevo(to, subject, html) {
  if (!isBrevoConfigured()) return { sent: false, reason: 'brevo_not_configured' };

  const senderEmail = env('BREVO_FROM_EMAIL') || SMTP_USER;
  const senderName = env('BREVO_FROM_NAME') || 'HexaChat';

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html
      }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { sent: false, reason: data.message || `Brevo HTTP ${response.status}` };
    }
    console.log(`[OTP] Brevo sent to ${to}`);
    return { sent: true, provider: 'brevo' };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function sendOTPEmail(to, otp, type = 'verification') {
  const subjects = {
    verification: 'HexaChat - Verify Your Email',
    signup: 'HexaChat - Verify Your Email',
    reset: 'HexaChat - Password Reset OTP',
    login: 'HexaChat - Login OTP'
  };

  const subject = subjects[type] || subjects.verification;
  const html = buildOtpHtml(otp, type);

  const gmailResult = await sendViaGmail(to, subject, html);
  if (gmailResult.sent) return gmailResult;

  if (isBrevoConfigured()) {
    console.warn(`[OTP] Gmail failed, trying Brevo for ${to}`);
    return sendViaBrevo(to, subject, html);
  }

  return gmailResult;
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
  isBrevoConfigured,
  getEmailProvider,
  isEmailReady
};
