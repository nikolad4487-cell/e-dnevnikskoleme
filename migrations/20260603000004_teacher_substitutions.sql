-- Teacher Substitutions Table
CREATE TABLE IF NOT EXISTS public.teacher_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    original_teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    substitute_teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hour INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teacher_substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage teacher_substitutions" ON public.teacher_substitutions;
CREATE POLICY "Authenticated manage teacher_substitutions" ON public.teacher_substitutions FOR ALL TO authenticated USING (true);
