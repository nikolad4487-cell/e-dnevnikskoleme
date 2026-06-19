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
  
  console.log("Testing class:", cls.name, cls.id);
  
  const { data: cs, error: csError } = await supabase
      .from('class_subjects')
      .select('subject_id')
      .eq('class_id', clsId);
  console.log("Entries in class_subjects:", cs?.map(s => s.subject_id));

  const { data: cst, error: cstError } = await supabase
      .from('class_subject_teachers')
      .select('subject_id')
      .eq('class_id', clsId);
  console.log("Entries in class_subject_teachers:", cst?.map(s => s.subject_id));
}

run();
