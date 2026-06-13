import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = 'alter table public.user_profiles add column if not exists pin_hash text;';
  // Try calling rpc with BOTH possible parameter names
  const { data, error } = await supabase.rpc('exec_sql', { query: sql } as any);
  if (error) {
     const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { sql_statement: sql } as any);
     if (error2) {
         console.error("❌ Migration failed with both parameter names:", error, error2);
         process.exit(1);
     } else {
         console.log("✅ Migration succeeded with sql_statement!");
     }
  } else {
    console.log("✅ Migration succeeded with query!");
  }
}
run();
