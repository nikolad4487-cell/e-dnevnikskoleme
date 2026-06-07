-- Drop the broken/misconfigured policies on public.reading_assignments
DROP POLICY IF EXISTS "Enable insert, update, delete for authorized roles" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable read for all authenticated users" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable delete for admin and creator" ON public.reading_assignments;
DROP POLICY IF EXISTS "Authenticated manage reading_assignments" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable select for authenticated" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable update for creator and admin" ON public.reading_assignments;
DROP POLICY IF EXISTS "Enable delete for creator and admin" ON public.reading_assignments;

-- 1. SELECT policy: any authenticated user (students, parents, teachers, admins) can view reading assignments
CREATE POLICY "Enable select for authenticated" ON public.reading_assignments
    FOR SELECT TO authenticated USING (true);

-- 2. INSERT policy: any authenticated user (specifically teachers/admins tasked with setup) can insert reading assignments
CREATE POLICY "Enable insert for authenticated" ON public.reading_assignments
    FOR INSERT TO authenticated WITH CHECK (true);

-- 3. UPDATE policy: allows admins or the assigned/creating teacher to update
CREATE POLICY "Enable update for creator and admin" ON public.reading_assignments
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles up
            JOIN public.user_school_roles usr ON usr.user_id = up.id
            WHERE up.auth_user_id = auth.uid()
            AND usr.role IN ('ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN')
            AND usr.status = 'ACTIVE'
        )
        OR created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
        OR teacher_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
    );

-- 4. DELETE policy: allows admins or the assigned/creating teacher to delete
CREATE POLICY "Enable delete for creator and admin" ON public.reading_assignments
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles up
            JOIN public.user_school_roles usr ON usr.user_id = up.id
            WHERE up.auth_user_id = auth.uid()
            AND usr.role IN ('ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN')
            AND usr.status = 'ACTIVE'
        )
        OR created_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
        OR teacher_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
    );
