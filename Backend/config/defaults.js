// Built-in defaults — Railway Variables override these when set.
module.exports = {
  PORT: '5000',
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://hexachat2.netlify.app',

  JWT_SECRET: 'hexachat_super_secret_jwt_key_2026_secure_min_32',
  JWT_EXPIRES_IN: '7d',

  SUPABASE_URL: 'https://tyhcvjyhlgpernuvcxuq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5aGN2anlobGdwZXJudXZjeHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTczMTIsImV4cCI6MjA5NzI5MzMxMn0.zK_shkr7l8twXiClkLR5SCPqcoQiLk3qy1I1dp9H9t8',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5aGN2anlobGdwZXJudXZjeHVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTcxNzMxMiwiZXhwIjoyMDk3MjkzMzEyfQ.zKwrvIqANgTkGKyKZsjUvRYKeZlS_bSbUxePW-bPtnc',

  // OTP email — Railway blocks Gmail SMTP. Use Brevo OR Resend (add ONE key on Railway):
  BREVO_API_KEY: '',
  BREVO_FROM_EMAIL: 'knowledgeislamic8@gmail.com',
  BREVO_FROM_NAME: 'HexaChat',

  RESEND_API_KEY: '',
  RESEND_FROM: 'HexaChat <onboarding@resend.dev>',

  // Gmail SMTP — local dev only (not Railway)
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'knowledgeislamic8@gmail.com',
  SMTP_PASS: 'nfxxkezensveaqvd',
  GMAIL_USER: 'knowledgeislamic8@gmail.com',
  GMAIL_APP_PASSWORD: 'nfxxkezensveaqvd',
  SMTP_FROM: 'HexaChat <knowledgeislamic8@gmail.com>',

  OTP_EXPIRY_MINUTES: '10',
  MAX_FILE_SIZE_MB: '50'
};
