import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data, error } = await supabase.rpc('get_table_columns_info', { table_name: 'school_events' });
  // Wait, I don't think get_table_columns_info is a standard RPC.
  // Let's use information_schema.
  const { data: cols, error: err } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'school_events')
    .eq('table_schema', 'public');
    
  console.log("Columns:", cols);
  console.log("Error:", err);
}
run();
