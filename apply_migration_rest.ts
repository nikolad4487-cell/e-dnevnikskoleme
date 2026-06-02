import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = fs.readFileSync('./migrations/20260602000005_fix_final_thesis_rest.sql', 'utf8');
  console.log("Running migration...");
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error("❌ Migration failed:", error);
  } else {
    console.log("✅ Migration succeeded!", data);
  }
}
run();
