import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { query: `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public';
  `});
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
