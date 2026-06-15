import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkLuka() {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .ilike('name', '%Barišić%');

  if (error) {
    console.error("Error fetching students:", error);
    return;
  }
  console.log("Found Barišić profiles:", profiles);
  
  // Find all students
  const { data: students, error: sErr } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('role', 'STUDENT');
  
  if (sErr) {
    console.error(sErr);
    return;
  }
  console.log(`Total students in user_profiles: ${students?.length}`);
}

checkLuka();
