import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(url, key);

async function run() {
  const { data: classes, error: cError } = await supabase.from('classes').select('id, name').limit(1);
  if (cError || !classes || classes.length === 0) { console.error(cError); return; }
  const clsId = classes[0].id;
  
  console.log("Testing class:", classes[0]);
  
  const { data: cSubjects, error: csError } = await supabase
      .from('class_subjects')
      .select('subject_id')
      .eq('class_id', clsId);
  console.log("class_subjects subjects:", cSubjects?.map(s => s.subject_id));
    
  const { data: cstSubjects, error: cstError } = await supabase
      .from('class_subject_teachers')
      .select('subject_id')
      .eq('class_id', clsId);
  console.log("class_subject_teachers subjects:", cstSubjects?.map(s => s.subject_id));
}

run();
