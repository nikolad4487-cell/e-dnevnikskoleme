-- Migration for e-Dnevnik to Supabase Synchronization and RLS rules
-- File: /migrations/20260609000000_ednevnik_supabase_sync.sql

-- 1. Create ednevnik_sync_logs table if not exists
CREATE TABLE IF NOT EXISTS public.ednevnik_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    trigger_type TEXT NOT NULL DEFAULT 'MANUAL', -- 'MANUAL' or 'AUTO_LOGIN'
    status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    students_synced INTEGER DEFAULT 0,
    teachers_synced INTEGER DEFAULT 0,
    school_admins_synced INTEGER DEFAULT 0,
    system_admins_synced INTEGER DEFAULT 0,
    new_users_count INTEGER DEFAULT 0,
    updated_users_count INTEGER DEFAULT 0,
    details JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure unique constraint on user_school_roles if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_school_roles_user_school_role_key'
    ) THEN
        ALTER TABLE public.user_school_roles 
        ADD CONSTRAINT user_school_roles_user_school_role_key UNIQUE (user_id, school_id, role);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 3. Enable RLS on ednevnik_sync_logs
ALTER TABLE public.ednevnik_sync_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy for ednevnik_sync_logs
DROP POLICY IF EXISTS "Admins can view and create sync logs" ON public.ednevnik_sync_logs;
CREATE POLICY "Admins can view and create sync logs" ON public.ednevnik_sync_logs
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.auth_user_id = auth.uid()
            AND (up.role IN ('MAIN_ADMIN', 'ADMIN', 'SCHOOL_ADMIN') OR up.access_role IN ('super_admin', 'ADMIN', 'SCHOOL_ADMIN'))
        )
    )
    WITH CHECK (true);

-- 5. Ensure indexes for efficient query lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id ON public.user_profiles (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_oib ON public.user_profiles (oib);
CREATE INDEX IF NOT EXISTS idx_user_school_roles_user_school ON public.user_school_roles (user_id, school_id);
