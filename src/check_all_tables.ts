import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  const { data, error } = await supabaseAdmin.from('information_schema.tables' as any).select('table_name').eq('table_schema', 'public');
  if (error) {
    // try postgrest OpenAPI endpoint
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { 'apikey': supabaseKey as string, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const json = await res.json();
    console.log("Tables in OpenAPI definition:");
    const tables = Object.keys(json.definitions || {});
    console.log(tables);
  } else {
    console.log("Tables:", data);
  }
}

main().catch(console.error);
