import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Re-probing student_year_summaries columns...');
  const fields = [
    'id', 'student_id', 'class_id', 'school_year_id', 'school_year',
    'average', 'behavior', 'final_result', 'status', 'finalized_at', 'finalized_by',
    'created_at', 'updated_at', 'overall_average', 'overall_success', 'conduct', 'calculated_at'
  ];
  for (const field of fields) {
    const { error } = await supabase.from('student_year_summaries').select(field).limit(0);
    if (error) {
      console.log(`❌ column NOT found: ${field}`, error.message);
    } else {
      console.log(`✅ column found: ${field}`);
    }
  }
}
run();
