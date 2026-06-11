import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log("Checking exec_sql...");
  // Attempt a simple call
  const { data, error } = await supabase.rpc('exec_sql', { query: 'SELECT 1' });
  console.log("Result:", { data, error });
}
run();
