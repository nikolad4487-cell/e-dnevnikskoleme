import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// We try standard names: exec_sql, execute_sql, runs_sql, run_sql, query_string, query, execute_query, sql
const rpcs = ['exec_sql', 'execute_sql', 'run_sql', 'query_string', 'execute_query', 'query', 'sql', 'exec'];

async function run() {
  const sql = `SELECT 1 as val;`;
  for (const rpc of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpc, { sql, sql_query: sql, query: sql });
      if (error) {
        if (error.message.includes("does not exist")) {
          console.log(`❌ ${rpc}: does not exist`);
        } else {
          console.log(`✅ ${rpc}: exists but errored:`, error.message);
        }
      } else {
        console.log(`🎉 SUCCESS ${rpc}:`, data);
      }
    } catch (err: any) {
      console.log(`⚠️ ${rpc} exception:`, err.message);
    }
  }
}

run();
