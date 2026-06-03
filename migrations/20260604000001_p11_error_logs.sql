CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    page_url TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    browser_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for authenticated users" ON public.system_error_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read for admins" ON public.system_error_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('ADMIN', 'SUPERADMIN', 'PRINCIPAL')
        )
    );
