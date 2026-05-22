import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
console.log("Supabase URL:", url);
console.log("Key length:", key ? key.length : 0);

const supabase = createClient(url, key);

async function run() {
  console.log("Querying check...");
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (res.ok) {
      const swagger = await res.json();
      console.log("Exposed endpoints/services in PostgREST:");
      const paths = Object.keys(swagger.paths || {});
      const rpcPaths = paths.filter(p => p.startsWith("/rpc/"));
      console.log("Available RPC pathways:", rpcPaths);
    } else {
      console.log("Failed to fetch OpenAPI spec:", res.status, res.statusText);
    }
  } catch (err: any) {
    console.log("Error querying OpenAPI:", err.message);
  }
}

run();

