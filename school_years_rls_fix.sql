-- School Years RLS Policies
-- Enables SCHOOL_ADMIN, ADMIN and SUPER_ADMIN to manage school years for their schools / all schools
-- user_school_roles.user_id connects to user_profiles.id (where user_profiles.auth_user_id = auth.uid())

ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read" ON public.school_years;
DROP POLICY IF EXISTS "Admins can read school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can insert school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can update school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can delete school years" ON public.school_years;

-- 1. SELECT Policy
CREATE POLICY "Admins can read school years"
ON public.school_years
FOR SELECT
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
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
        )
      )
  )
);

-- 2. INSERT Policy
CREATE POLICY "Admins can insert school years"
ON public.school_years
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
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

-- 3. UPDATE Policy
CREATE POLICY "Admins can update school years"
ON public.school_years
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
          usr.school_id = school_years.school_id
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
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

-- 4. DELETE Policy
CREATE POLICY "Admins can delete school years"
ON public.school_years
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
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);
