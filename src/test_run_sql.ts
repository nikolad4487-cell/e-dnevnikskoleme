import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(url, key);

async function run() {
  console.log("Testing common RPC names to execute SQL...");
  const rpcNames = ["exec_sql", "run_sql", "execute_sql", "exec", "sql"];
  
  for (const name of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(name, { sql: "SELECT 1;" });
      if (!error) {
        console.log(`✅ RPC "${name}" WORKED!`, data);
        return;
      } else {
        console.log(`❌ RPC "${name}" failed:`, error.message);
      }
    } catch (err: any) {
      console.log(`❌ RPC "${name}" threw error:`, err.message);
    }
  }
}

run();
