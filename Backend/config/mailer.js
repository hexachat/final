const nodemailer = require('nodemailer');
const { env } = require('./env');

const SMTP_USER = (env('SMTP_USER') || env('GMAIL_USER') || '').trim();
const SMTP_PASS = (env('SMTP_PASS') || env('GMAIL_APP_PASSWORD') || '').replace(/\s/g, '');
const RESEND_API_KEY = (env('RESEND_API_KEY') || '').trim();
const BREVO_API_KEY = (env('BREVO_API_KEY') || '').trim();

function isConfiguredKey(value) {
  return !!(value && !value.includes('REPLACE_ME') && value !== 'your_api_key_here');
}

function createTransporter() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: env('SMTP_HOST') || 'smtp.gmail.com',
    port: parseInt(env('SMTP_PORT') || '465', 10),
    secure: env('SMTP_SECURE') !== 'false',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000
  });
}

const transporter = createTransporter();

function isResendConfigured() {
  return isConfiguredKey(RESEND_API_KEY);
}

function isBrevoConfigured() {
  return isConfiguredKey(BREVO_API_KEY);
}

function isSmtpConfigured() {
  return !!(SMTP_USER && SMTP_PASS && transporter);
}

function getEmailProvider() {
  if (isResendConfigured()) return 'resend';
  if (isBrevoConfigured()) return 'brevo';
  if (isSmtpConfigured()) return 'gmail_smtp';
  return 'none';
}

function isEmailReady() {
  return isResendConfigured() || isBrevoConfigured();
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

async function sendViaResend(to, subject, html) {
  if (!isResendConfigured()) return { sent: false, reason: 'resend_not_configured' };

  const from = env('RESEND_FROM') || 'HexaChat <onboarding@resend.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { sent: false, reason: data.message || data.error || `Resend HTTP ${response.status}` };
    }
    console.log(`[OTP] Resend sent to ${to}`);
    return { sent: true, provider: 'resend' };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function sendViaBrevo(to, subject, html) {
  if (!isBrevoConfigured()) return { sent: false, reason: 'brevo_not_configured' };

  const senderEmail = env('BREVO_FROM_EMAIL') || SMTP_USER || 'knowledgeislamic8@gmail.com';
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

async function sendViaSmtp(to, subject, html) {
  if (!isSmtpConfigured()) return { sent: false, reason: 'smtp_not_configured' };

  const from = env('SMTP_FROM') || `HexaChat <${SMTP_USER}>`;
  const sendPromise = transporter.sendMail({ from, to, subject, html });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('SMTP connection timed out')), 8000);
  });

  try {
    await Promise.race([sendPromise, timeoutPromise]);
    console.log(`[OTP] Gmail SMTP sent to ${to}`);
    return { sent: true, provider: 'gmail_smtp' };
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

  const providers = [sendViaResend, sendViaBrevo];
  if (env('NODE_ENV') !== 'production') {
    providers.push(sendViaSmtp);
  }

  for (const provider of providers) {
    const result = await provider(to, subject, html);
    if (result.sent) return result;
    console.error(`[OTP] ${provider.name} failed for ${to}:`, result.reason);
  }

  console.error(`[OTP] All email providers failed for ${to}`);
  return { sent: false, reason: 'all_providers_failed' };
}

async function sendOTPEmailWithTimeout(to, otp, type = 'signup', timeoutMs = 12000) {
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
  isSmtpConfigured,
  isResendConfigured,
  isBrevoConfigured,
  getEmailProvider,
  isEmailReady
};
