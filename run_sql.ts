import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = `
    DROP POLICY IF EXISTS "Allow authenticated update user_profiles" ON public.user_profiles;
    CREATE POLICY "Allow authenticated update user_profiles"
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
  `;
  const { data, error } = await supabase.rpc('query_string', { sql });
  if (error) {
    console.error("❌ SQL executed with error:", error);
  } else {
    console.log("✅ SQL executed SUCCESS:", data);
  }
}

run();
