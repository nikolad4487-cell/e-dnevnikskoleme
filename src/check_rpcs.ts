import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log("Checking routines...");
  const { data, error } = await supabase
    .from('pg_proc')
    .select('proname')
    .limit(10);
  console.log("Result pg_proc:", { data, error });
}

run();
