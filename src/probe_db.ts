import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
console.log("Supabase URL:", url);
console.log("Key length:", key ? key.length : 0);

const supabase = createClient(url, key);

async function run() {
  console.log("Querying class_subjects structure...");
  try {
    const { data, error } = await supabase.from('class_subjects').select('*').limit(1);
    if (error) throw error;
    console.log("Row example:", data);
    if (data && data.length > 0) {
      console.log("Columns:", Object.keys(data[0]));
    } else {
      console.log("Table is empty, querying columns using postgres schema...");
    }
  } catch (err: any) {
    console.log("Error querying class_subjects:", err.message);
  }
}

run();

