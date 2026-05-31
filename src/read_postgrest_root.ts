import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const schema = await res.json();
    console.log("Tables/Views exposed:", Object.keys(schema.paths).filter(p => !p.startsWith('/rpc/')));
    console.log("RPC Functions exposed:", Object.keys(schema.paths).filter(p => p.startsWith('/rpc/')));
  } catch (err: any) {
    console.error("Error fetching PostgREST root:", err);
  }
}
run();
