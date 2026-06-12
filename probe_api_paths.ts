import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

async function run() {
  try {
    const rDef = await fetch(`${url}/rest/v1/`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const schema = await rDef.json();
    console.log("Paths count:", Object.keys(schema.paths).length);
    console.log("RPC paths:", Object.keys(schema.paths).filter(p => p.includes("rpc")));
  } catch (err: any) {
    console.error("Error:", err);
  }
}
run();
