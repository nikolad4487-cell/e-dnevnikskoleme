import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const rpcs = ['exec_sql'];

async function run() {
  const sql = `SELECT 1 as val;`;
  for (const rpc of rpcs) {
      // Trying different combinations
      const params = [
        { query: sql },
        { sql_statement: sql },
      ];

      for (const p of params) {
          console.log(`Trying ${rpc} with params:`, p);
          try {
            const { data, error } = await supabase.rpc(rpc, p);
            if (error) {
                console.log(`❌ ${rpc} with ${JSON.stringify(p)}: errored:`, error.message);
            } else {
                console.log(`🎉 SUCCESS ${rpc}:`, data);
            }
          } catch (err: any) {
            console.log(`⚠️ ${rpc} exception with params ${JSON.stringify(p)}:`, err.message);
          }
      }
  }
}

run();
