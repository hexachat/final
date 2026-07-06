const supabase = require('../config/database');
const { sendOTPEmailWithTimeout, sendOTPEmailAsync } = require('../config/mailer');
const { generateOTP, getOTPExpiry } = require('../utils/otp');
const { hashPassword, comparePassword, sanitizeInput, formatPhone } = require('../utils/helpers');
const { generateToken } = require('../utils/jwt');

async function saveAndSendOtp(cleanEmail, otp, type) {
  const expiresAt = getOTPExpiry();

  await supabase.from('otp_codes').delete().eq('email', cleanEmail).eq('type', type);

  const { error: otpError } = await supabase.from('otp_codes').insert({
    email: cleanEmail,
    code: otp,
    type,
    expires_at: expiresAt.toISOString(),
    used: false
  });

  if (otpError) {
    throw new Error(otpError.message || 'Could not save OTP');
  }

  const emailResult = await sendOTPEmailWithTimeout(cleanEmail, otp, type, 20000);
  if (!emailResult.sent) sendOTPEmailAsync(cleanEmail, otp, type);

  return emailResult;
}

function emailMessage(sent, successMsg, failMsg) {
  return sent ? successMsg : failMsg;
}

async function signup({ name, email, phone_number, password }) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanPhone = formatPhone(phone_number);
  const cleanName = sanitizeInput(name);

  const { data: existing } = await supabase
    .from('users')
    .select('id, is_verified')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (existing?.is_verified) {
    throw new Error('Email already registered');
  }

  const passwordHash = await hashPassword(password);
  const otp = generateOTP();

  if (existing) {
    const { error: updateError } = await supabase.from('users').update({
      name: cleanName,
      phone_number: cleanPhone,
      password_hash: passwordHash,
      is_verified: false,
      updated_at: new Date().toISOString()
    }).eq('id', existing.id);
    if (updateError) throw new Error(updateError.message || 'Could not update account');
  } else {
    const { error: userError } = await supabase.from('users').insert({
      name: cleanName,
      email: cleanEmail,
      phone_number: cleanPhone,
      password_hash: passwordHash,
      is_verified: false
    });
    if (userError) throw new Error(userError.message || 'Could not create account');
  }

  const emailResult = await saveAndSendOtp(cleanEmail, otp, 'signup');

  return {
    message: emailMessage(
      emailResult.sent,
      'OTP sent to your email. Check inbox and spam folder.',
      'Account created. Tap Resend OTP if email does not arrive.'
    ),
    email: cleanEmail,
    emailSent: !!emailResult.sent
  };
}

async function verifyOTP(email, otp, type = 'signup') {
  const cleanEmail = email.toLowerCase().trim();
  const cleanOtp = String(otp || '').replace(/\D/g, '');

  if (cleanOtp.length !== 6) {
    throw new Error('OTP must be 6 digits');
  }

  const { data: otpRecord, error } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', cleanEmail)
    .eq('code', cleanOtp)
    .eq('type', type)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !otpRecord) {
    throw new Error('Invalid OTP');
  }

  if (new Date(otpRecord.expires_at) < new Date()) {
    throw new Error('OTP has expired');
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

  if (type === 'signup') {
    const { data: user, error: userError } = await supabase
      .from('users')
      .update({ is_verified: true, updated_at: new Date().toISOString() })
      .eq('email', cleanEmail)
      .select('id, name, email, phone_number, profile_photo, bio, about, is_online, last_seen')
      .single();

    if (userError) throw userError;

    await supabase.from('user_settings').upsert({
      user_id: user.id,
      dark_theme: true,
      notifications_enabled: true,
      sound_enabled: true,
      read_receipts: true,
      last_seen_visible: true
    }, { onConflict: 'user_id' });

    const token = generateToken({ userId: user.id, email: user.email });
    return { user, token, message: 'Account verified successfully' };
  }

  return { message: 'OTP verified successfully', verified: true };
}

async function resendOTP(email, type = 'signup') {
  const cleanEmail = email.toLowerCase().trim();

  const { data: user } = await supabase
    .from('users')
    .select('id, is_verified')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (!user) throw new Error('User not found');
  if (type === 'signup' && user.is_verified) throw new Error('Account already verified');

  const otp = generateOTP();
  const emailResult = await saveAndSendOtp(cleanEmail, otp, type);

  return {
    message: emailMessage(
      emailResult.sent,
      'OTP sent to your email',
      'Could not send email. Try Resend OTP again.'
    ),
    emailSent: !!emailResult.sent
  };
}

async function login(email, password) {
  const cleanEmail = email.toLowerCase().trim();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', cleanEmail)
    .single();

  if (error || !user) throw new Error('Invalid email or password');

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) throw new Error('Invalid email or password');

  if (!user.is_verified) {
    const otp = generateOTP();
    const emailResult = await saveAndSendOtp(cleanEmail, otp, 'signup');
    return {
      requiresVerification: true,
      email: cleanEmail,
      message: emailMessage(
        emailResult.sent,
        'Please verify your email',
        'Please verify your email. Tap Resend OTP if needed.'
      ),
      emailSent: !!emailResult.sent
    };
  }

  await supabase.from('users').update({
    is_online: true,
    last_seen: new Date().toISOString()
  }).eq('id', user.id);

  const token = generateToken({ userId: user.id, email: user.email });
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token };
}

async function forgotPassword(email) {
  const cleanEmail = email.toLowerCase().trim();
  const { data: user } = await supabase.from('users').select('id').eq('email', cleanEmail).maybeSingle();
  if (!user) return { message: 'If account exists, OTP has been sent', emailSent: true };

  const otp = generateOTP();
  const emailResult = await saveAndSendOtp(cleanEmail, otp, 'reset');

  return {
    message: emailMessage(
      emailResult.sent,
      'OTP sent to your email',
      'Could not send OTP email. Try again.'
    ),
    emailSent: !!emailResult.sent
  };
}

async function resetPassword(email, otp, newPassword) {
  await verifyOTP(email, otp, 'reset');
  const cleanEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(newPassword);
  await supabase.from('users').update({
    password_hash: passwordHash,
    updated_at: new Date().toISOString()
  }).eq('email', cleanEmail);
  return { message: 'Password reset successfully' };
}

module.exports = {
  signup, verifyOTP, resendOTP, login, forgotPassword, resetPassword
};
