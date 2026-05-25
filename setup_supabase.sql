-- FK Constraints for classes table
ALTER TABLE classes
ADD CONSTRAINT classes_program_id_fkey
FOREIGN KEY (program_id)
REFERENCES educational_programs(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_homeroom_teacher_id_fkey
FOREIGN KEY (homeroom_teacher_id)
REFERENCES user_profiles(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_deputy_teacher_id_fkey
FOREIGN KEY (deputy_teacher_id)
REFERENCES user_profiles(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_school_year_id_fkey
FOREIGN KEY (school_year_id)
REFERENCES school_years(id)
ON DELETE SET NULL;

-- Cascade deletions for class-related data
-- Note: Re-creating FKs can be done via ALTER TABLE if CASCADE constraint is needed
-- This assumes standard naming conventions: table_name_class_id_fkey

ALTER TABLE student_class_enrollments
DROP CONSTRAINT IF EXISTS student_class_enrollments_class_id_fkey,
ADD CONSTRAINT student_class_enrollments_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE student_subject_enrollments
DROP CONSTRAINT IF EXISTS student_subject_enrollments_class_id_fkey,
ADD CONSTRAINT student_subject_enrollments_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE grades
DROP CONSTRAINT IF EXISTS grades_class_id_fkey,
ADD CONSTRAINT grades_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE absences
DROP CONSTRAINT IF EXISTS absences_class_id_fkey,
ADD CONSTRAINT absences_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE schedule_cells
DROP CONSTRAINT IF EXISTS schedule_cells_class_id_fkey,
ADD CONSTRAINT schedule_cells_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

-- final_grades updates
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS term text DEFAULT 'FINAL';
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS school_year_id uuid;

-- Clean up final_grades duplicates
DELETE FROM final_grades WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY student_id, subject_id, class_id, school_year_id, period
      ORDER BY updated_at DESC, created_at DESC
    ) as row_num
    FROM final_grades
  ) t WHERE t.row_num > 1
);

-- Drop previous conflicting unique constraints if they exist
ALTER TABLE final_grades DROP CONSTRAINT IF EXISTS final_grades_unique_student_subject_class_year_period;
ALTER TABLE final_grades DROP CONSTRAINT IF EXISTS final_grades_student_id_class_id_subject_id_term_key;

-- Add unique constraint matching student_id + subject_id + class_id + school_year_id + period
ALTER TABLE final_grades
ADD CONSTRAINT final_grades_unique_student_subject_class_year_period
UNIQUE (student_id, subject_id, class_id, school_year_id, period);

-- student_year_summaries updates
ALTER TABLE public.student_year_summaries ADD COLUMN IF NOT EXISTS school_year_id text;
ALTER TABLE public.student_year_summaries ADD COLUMN IF NOT EXISTS overall_average numeric(3,2);
ALTER TABLE public.student_year_summaries ADD COLUMN IF NOT EXISTS overall_success integer;
ALTER TABLE public.student_year_summaries ADD COLUMN IF NOT EXISTS conduct text;
ALTER TABLE public.student_year_summaries ADD COLUMN IF NOT EXISTS calculated_at timestamptz;

-- Drop previous unique constraints if any and add the requested unique constraint for onConflict
ALTER TABLE public.student_year_summaries DROP CONSTRAINT IF EXISTS student_year_summaries_student_id_class_id_school_year_key;
ALTER TABLE public.student_year_summaries DROP CONSTRAINT IF EXISTS student_year_summaries_unique_student_class_year_id;
ALTER TABLE public.student_year_summaries ADD CONSTRAINT student_year_summaries_unique_student_class_year_id UNIQUE (student_id, class_id, school_year_id);

NOTIFY pgrst, 'reload schema';

-- Create attachments bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('informativka-attachments', 'informativka-attachments', true)
ON CONFLICT (id) DO NOTHING;
