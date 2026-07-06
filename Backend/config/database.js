const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { env } = require('./env');

// Node 20 on Railway has no native WebSocket — required by @supabase/supabase-js
global.WebSocket = WebSocket;

const supabaseUrl = env('SUPABASE_URL');
const supabaseServiceKey = env('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = supabase;
