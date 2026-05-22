import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Probing absences columns...');
  const fields = ['id', 'student_id', 'lesson_id', 'class_id', 'date', 'hour', 'status', 'note', 'teacher_id', 'absence_type', 'justified_by', 'justified_at', 'resolved_by', 'resolved_at'];
  for (const field of fields) {
    const { data, error } = await supabase.from('absences').select(field).limit(1);
    if (error) {
      console.log(`❌ absences column NOT found: ${field}`, error.message);
    } else {
      console.log(`✅ absences column found: ${field}`);
    }
  }
}
run();

