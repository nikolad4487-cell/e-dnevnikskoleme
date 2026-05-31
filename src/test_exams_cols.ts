import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(url, key);

async function run() {
  // Try inserting with a dummy ID (or valid UUID for class/subject if needed, but the column check works even on foreign key checks as long as we check the error message).
  const { data, error } = await supabase.from('exams').insert({
    exam_grade_level: 1,
    foo_bar_dummy_column: 'test'
  }).select();
  
  console.log("Error response:", error);
}
run();
