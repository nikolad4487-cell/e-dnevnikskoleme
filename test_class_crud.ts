import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: schools } = await supabase.from('schools').select('id').limit(1);
  const schoolId = schools && schools.length > 0 ? schools[0].id : null;
  const { data: years } = await supabase.from('school_years').select('id').limit(1);
  const yearId = years && years.length > 0 ? years[0].id : null;

  if (!schoolId || !yearId) return console.log("Missing school/year");

  // create class
  const { data: cls, error: clsErr } = await supabase.from('classes').insert({
      name: 'TEST CLASS',
      school_id: schoolId,
      school_year_id: yearId,
      school_year: '2025/2026',
      grade_level: 1,
      section: 'T'
  }).select().single();

  console.log("Created:", cls, clsErr);
  if (!cls) return;

  const { data, error } = await supabase.from('classes').delete().eq('id', cls.id).select();
  console.log("Deleted:", data, error);
}
run();
