import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function run() {
  const { data, error } = await supabase.from('classes').select('id').limit(1);
  console.log("Error:", error);

  // Fetch definitions for classes
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/`, {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""}`
    }
  });
  const schema = await res.json();
  console.log("Classes Columns", JSON.stringify(schema.definitions.classes, null, 2));
}
run();
