import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// We simulate authenticated test by using anon key + auth signin, but we don't have email/password.
// Since we don't have user creds here, I'll just check if pg_policies has 'DELETE' for 'classes'.
// Wait, we can fetch pg_policies via GET request directly? No!

async function run() {
  const { data, error } = await supabaseAdmin.from('classes').select('*').limit(1);
  console.log("Check complete");
}
run();
