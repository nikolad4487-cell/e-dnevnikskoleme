-- Programs table updates and RLS policies
-- Adds module_or_track column for faculty studies / tracks

ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS module_or_track TEXT;

-- RLS Policies for Programs
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read" ON public.programs;
DROP POLICY IF EXISTS "Admins can read programs" ON public.programs;
DROP POLICY IF EXISTS "Admins can insert programs" ON public.programs;
DROP POLICY IF EXISTS "Admins can update programs" ON public.programs;
DROP POLICY IF EXISTS "Admins can delete programs" ON public.programs;

-- 1. SELECT Policy (All authenticated can view programs for their schools or public)
CREATE POLICY "Admins can read programs"
ON public.programs
FOR SELECT
TO authenticated
USING (true);

-- 2. INSERT Policy
CREATE POLICY "Admins can insert programs"
ON public.programs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = programs.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

-- 3. UPDATE Policy
CREATE POLICY "Admins can update programs"
ON public.programs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = programs.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = programs.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

-- 4. DELETE Policy
CREATE POLICY "Admins can delete programs"
ON public.programs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = programs.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);
