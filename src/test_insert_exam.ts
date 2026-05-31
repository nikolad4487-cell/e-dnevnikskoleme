import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(url, key);

async function run() {
  console.log("Testing insert with 'value':");
  const res1 = await supabase.from('exams').insert({
    class_id: "test", // trigger FK error or similar, but check schema error
    subject_id: "test",
    exam_date: "2026-05-31",
    exam_type: "SUPPLEMENTARY_WORK",
    value: 5
  }).select();
  console.log("Response with 'value':", { error: res1.error?.message, code: res1.error?.code });

  console.log("\nTesting insert with 'grade_value':");
  const res2 = await supabase.from('exams').insert({
    class_id: "test",
    subject_id: "test",
    exam_date: "2026-05-31",
    exam_type: "SUPPLEMENTARY_WORK",
    grade_value: 5
  }).select();
  console.log("Response with 'grade_value':", { error: res2.error?.message, code: res2.error?.code });
}
run();
