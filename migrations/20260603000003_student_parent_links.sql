-- Student Parent Links (for Parent App Access)
CREATE TABLE IF NOT EXISTS public.student_parent_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_id, student_id)
);

ALTER TABLE public.student_parent_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage student_parent_links" ON public.student_parent_links FOR ALL TO authenticated USING (true);
