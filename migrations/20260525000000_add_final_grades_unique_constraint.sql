-- Deduplicate final_grades table to ensure no conflicting records
DELETE FROM public.final_grades WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY student_id, subject_id, class_id, school_year_id, period
      ORDER BY updated_at DESC, created_at DESC
    ) as row_num
    FROM public.final_grades
  ) t WHERE t.row_num > 1
);

-- Drop previous conflicting unique constraints if they exist
ALTER TABLE public.final_grades DROP CONSTRAINT IF EXISTS final_grades_unique_student_subject_class_year_period;
ALTER TABLE public.final_grades DROP CONSTRAINT IF EXISTS final_grades_student_id_class_id_subject_id_term_key;

-- Add the unique constraint for final_grades
ALTER TABLE public.final_grades
ADD CONSTRAINT final_grades_unique_student_subject_class_year_period
UNIQUE (student_id, subject_id, class_id, school_year_id, period);
