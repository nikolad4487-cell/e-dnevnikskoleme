import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  const { data: tables, error } = await supabaseAdmin.rpc('get_tables'); // Assuming I can list tables this way or query information_schema
  
  // Actually, I can query information_schema.tables directly.
  const { data: tables2, error: err2 } = await supabaseAdmin.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
  
  console.log("Tables:", tables2);
}
main();
