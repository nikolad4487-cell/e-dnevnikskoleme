import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data, error } = await supabase
    .from('final_thesis_applications')
    .update({ work_grade: 5 })
    .neq('id', '00000000-0000-0000-0000-000000000000') // just any query
    .limit(1)
    .select();
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
