import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkSubjects() {
  const { data, error } = await supabaseAdmin.from('subjects').select('id, name, code').limit(100);
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Found subjects:");
  data.forEach(s => {
    if (s.name.includes('required') || s.name.includes('REQUIRED') || s.name.includes('(')) {
      console.log(`- ${s.id}: "${s.name}" [code: ${s.code}]`);
    } else {
      console.log(`  ${s.id}: "${s.name}" [code: ${s.code}]`);
    }
  });
}

checkSubjects();
