import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const sql = `
    -- 1. Check if column 'period' exists, add if not
    ALTER TABLE public.final_grades ADD COLUMN IF NOT EXISTS period TEXT;

    -- 2. Deduplicate final_grades on student_id, subject_id, class_id, school_year_id, period
    DELETE FROM public.final_grades WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY student_id, subject_id, class_id, school_year_id, period
          ORDER BY updated_at DESC, created_at DESC
        ) as row_num
        FROM public.final_grades
      ) t WHERE t.row_num > 1
    );

    -- 3. Drop conflicting unique constraint/index if any
    ALTER TABLE public.final_grades DROP CONSTRAINT IF EXISTS final_grades_unique_student_subject_class_year_period;
    ALTER TABLE public.final_grades DROP CONSTRAINT IF EXISTS final_grades_student_id_class_id_subject_id_term_key;

    -- 4. Add the requested unique constraint
    ALTER TABLE public.final_grades
    ADD CONSTRAINT final_grades_unique_student_subject_class_year_period
    UNIQUE (student_id, subject_id, class_id, school_year_id, period);
  `;
  console.log("Running SQL Migration...");
  const { data, error } = await supabase.rpc('query_string', { sql });
  if (error) {
    console.error("❌ SQL executed with error:", error);
  } else {
    console.log("✅ SQL executed SUCCESS:", data);
  }
}

run();
