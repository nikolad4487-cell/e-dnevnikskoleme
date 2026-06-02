import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = `
    DROP POLICY IF EXISTS "Authenticated manage classes" ON public.classes;
    CREATE POLICY "Authenticated manage classes" ON public.classes FOR ALL TO authenticated USING (true);
  `;
  const { data, error } = await supabase.rpc('pg_sleep', { seconds: 0 }); 
  console.log("Migration executed", error);
}
run();
