CREATE TABLE IF NOT EXISTS public.overall_success_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executor_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'UNLOCK_OVERALL_SUCCESS' or 'LOCK_OVERALL_SUCCESS'
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.overall_success_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage overall_success_audit_logs" ON public.overall_success_audit_logs FOR ALL TO authenticated USING (true);
