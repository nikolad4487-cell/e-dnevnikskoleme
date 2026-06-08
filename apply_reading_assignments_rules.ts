import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = `
    DROP POLICY IF EXISTS "Enable update for creator and admin" ON public.reading_assignments;
    DROP POLICY IF EXISTS "Enable delete for creator and admin" ON public.reading_assignments;
    DROP POLICY IF EXISTS "Allow authenticated update reading assignments" ON public.reading_assignments;
    DROP POLICY IF EXISTS "Allow authenticated delete reading assignments" ON public.reading_assignments;

    CREATE POLICY "Allow authenticated update reading assignments"
    ON public.reading_assignments
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Allow authenticated delete reading assignments"
    ON public.reading_assignments
    FOR DELETE
    TO authenticated
    USING (true);
  `;
  
  console.log("Applying RLS policy updates for reading_assignments...");
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error("❌ Failed to apply policies:", error);
  } else {
    console.log("✅ Successfully applied policies!", data);
  }
}

run();
