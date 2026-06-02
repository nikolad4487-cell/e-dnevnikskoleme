import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const classId = 'Some uuid';
  const tables = [
    'student_class_enrollments',
    'grades',
    'absences',
    'lessons',
    'schedule_cells',
    'class_subject_teachers',
    'student_year_summaries',
    'student_overall_notes',
    'class_overall_notes',
    'exams'
  ];
  
  for (const table of tables) {
    const res = await supabase.from(table).select('id', { count: 'exact', head: true }).limit(1);
    console.log(table, res.error);
  }
}
run();
