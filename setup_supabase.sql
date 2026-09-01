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
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS term text DEFAULT 'FINAL';
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS school_year_id uuid;
ALTER TABLE final_grades ADD COLUMN IF NOT EXISTS status text;

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

-- Add program_adjustment to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS program_adjustment TEXT DEFAULT 'NONE';

-- Create student_guardians table if it does not exist
CREATE TABLE IF NOT EXISTS public.student_guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    full_name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    note TEXT,
    relation TEXT,
    order_number INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for student_guardians
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read for student_guardians" ON public.student_guardians;
CREATE POLICY "Allow authenticated read for student_guardians" ON public.student_guardians
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow manage for admin and homeroom" ON public.student_guardians;
CREATE POLICY "Allow manage for admin and homeroom" ON public.student_guardians
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.auth_user_id = auth.uid()
              AND (
                  u.role IN ('ADMIN', 'MAIN_ADMIN')
                  OR EXISTS (
                      SELECT 1 FROM public.classes c
                      JOIN public.user_profiles stud ON stud.class_id = c.id
                      WHERE stud.id = student_id
                        AND (c.homeroom_teacher_id = u.id OR c.deputy_teacher_id = u.id)
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.auth_user_id = auth.uid()
              AND (
                  u.role IN ('ADMIN', 'MAIN_ADMIN')
                  OR EXISTS (
                      SELECT 1 FROM public.classes c
                      JOIN public.user_profiles stud ON stud.class_id = c.id
                      WHERE stud.id = student_id
                        AND (c.homeroom_teacher_id = u.id OR c.deputy_teacher_id = u.id)
                  )
              )
        )
    );

-- Replace update policy on user_profiles to implement rule 7
DROP POLICY IF EXISTS "Allow authenticated update user_profiles dev" ON public.user_profiles;

CREATE POLICY "Allow restricted update for admin and homeroom" ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.auth_user_id = auth.uid()
              AND (
                  -- Admin can update anyone
                  u.role IN ('ADMIN', 'MAIN_ADMIN')
                  -- Self-update (for change password/profile)
                  OR u.id = public.user_profiles.id
                  -- Homeroom teacher can update their class students
                  OR EXISTS (
                      SELECT 1 FROM public.classes c
                      WHERE c.id = public.user_profiles.class_id
                        AND (c.homeroom_teacher_id = u.id OR c.deputy_teacher_id = u.id)
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.auth_user_id = auth.uid()
              AND (
                  u.role IN ('ADMIN', 'MAIN_ADMIN')
                  OR u.id = public.user_profiles.id
                  OR EXISTS (
                      SELECT 1 FROM public.classes c
                      WHERE c.id = public.user_profiles.class_id
                        AND (c.homeroom_teacher_id = u.id OR c.deputy_teacher_id = u.id)
                  )
              )
        )
    );

NOTIFY pgrst, 'reload schema';

