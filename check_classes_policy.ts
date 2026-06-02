import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: user } = await supabase.auth.admin.listUsers();
  const firstUser = user?.users[0]; // some user
  
  // We can just verify table policies using anon key if we impersonate
  // Actually, we can check pg_policies
  
  const res = await supabase.rpc('exec_sql', { query: `
    SELECT policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'classes' AND cmd = 'DELETE';
  `});
  console.log("Policies:", res.error || res.data);
}
run();
