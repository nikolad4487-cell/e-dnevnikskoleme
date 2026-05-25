import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { error } = await supabase
    .from('student_year_summaries')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000009999');
  console.log("Deleted mock row, error:", error);
}

run();
