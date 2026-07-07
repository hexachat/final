-- Link OTP codes to users table (run once in Supabase SQL Editor)
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id);
