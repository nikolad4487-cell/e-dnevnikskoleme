import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  console.log("Adding pin_hash column to user_profiles...");
  const { error } = await supabaseAdmin.rpc('exec_sql', {
    query: 'alter table public.user_profiles add column if not exists pin_hash text;'
  });
  
  if (error) {
     console.error("Error running migration:", error);
     process.exit(1);
  }
  console.log("Migration applied.");
}
main();
