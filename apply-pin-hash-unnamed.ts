import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = 'alter table public.user_profiles add column if not exists pin_hash text;';
  
  // Try unnamed parameter
  const { data, error } = await supabase.rpc('exec_sql', sql as any);                
  if (error) {
     console.error("❌ Migration failed:", error);
     process.exit(1);
  } else {
     console.log("✅ Migration succeeded!");
  }
}
run();
