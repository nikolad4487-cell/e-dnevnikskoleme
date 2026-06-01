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
