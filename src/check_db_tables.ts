import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  console.log("=== CHECKING SUPABASE TABLES ===");
  
  const tables = ['user_profiles', 'user_school_roles', 'schools', 'classes', 'subjects', 'teacher_subjects'];
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table '${table}': ERROR -> ${error.message}`);
    } else {
      console.log(`Table '${table}': EXISTS, sample columns ->`, data.length > 0 ? Object.keys(data[0]) : '(empty table)');
    }
  }
}

main().catch(console.error);
