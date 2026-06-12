import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

async function checkRLS() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_statement: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE tablename IN ('school_events', 'final_exam_defense_schedule');
    `
  });

  if (error) {
    console.error("Error fetching policies:", error);
  } else {
    console.log("Policies:", data);
  }
}

checkRLS();
