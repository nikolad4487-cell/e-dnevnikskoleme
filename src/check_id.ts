import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

async function checkID() {
  const { data, error } = await supabase
    .from('final_exam_defense_schedule')
    .select('*')
    .eq('id', '7103e3d2-ad21-4bfd-973e-7a73301ecc29');

  console.log("Data:", data);
  console.log("Error:", error);
}

checkID();
