import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
console.log("Supabase URL:", url);
console.log("Key length:", key ? key.length : 0);

const supabase = createClient(url, key);

async function run() {
  console.log("Searching for ID: 5b011d43-38c9-437b-aa69-5d7bcee28acc");
  const tables = ['user_profiles', 'subjects', 'classes', 'class_subject_teachers', 'class_subjects', 'student_subject_enrollments'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').eq('id', '5b011d43-38c9-437b-aa69-5d7bcee28acc');
      if (data && data.length > 0) {
        console.log(`Found in table ${table}:`, data);
      }
    } catch (err: any) {
      console.log(`Error reading ${table}:`, err.message);
    }
  }
}

run();

