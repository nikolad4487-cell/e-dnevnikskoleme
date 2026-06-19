import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(url, key);

async function run() {
  // Find a class to test
  const { data: cls, error: cError } = await supabase.from('classes').select('*').eq('name', '2.A').single();
  if (cError) { console.error(cError); return; }
  const clsId = cls.id;
  
  console.log("Testing class:", cls);
  
  const { data: assignments, error: aError } = await supabase
      .from('class_subject_teachers')
      .select('subject_id, subject:subjects(name)')
      .eq('class_id', clsId);
  
  console.log("Assignments for 2.A:", JSON.stringify(assignments, null, 2));
}

run();
