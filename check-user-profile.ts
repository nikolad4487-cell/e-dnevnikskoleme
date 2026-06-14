import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  const { data: profile } = await supabaseAdmin.from('user_profiles')
    .select('*')
    .eq('email', 'nikola.duric@skolehr.xyz')
    .single();
  
  console.log("Profile for nikola.duric@skolehr.xyz:");
  console.dir(profile, { depth: null });
}
main();
