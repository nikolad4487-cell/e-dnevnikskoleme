-- Restrukturiranje Pedagoške Dokumentacije na Trajne i Godišnje podatke
CREATE TABLE IF NOT EXISTS public.student_pedagogical_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    education_program TEXT,
    visit_reason TEXT,
    disabilities TEXT,
    accommodations TEXT,
    support_types TEXT,
    practical_training TEXT,
    documentation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_profile UNIQUE (student_id)
);

CREATE TABLE IF NOT EXISTS public.student_pedagogical_year_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    school_year_id TEXT NOT NULL,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    recommendations TEXT,
    counselor_notes TEXT,
    yearly_observations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_year_note UNIQUE (student_id, school_year_id, class_id)
);

-- Enable RLS
ALTER TABLE public.student_pedagogical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_pedagogical_year_notes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated manage
DROP POLICY IF EXISTS "Authenticated manage student_pedagogical_profiles" ON public.student_pedagogical_profiles;
CREATE POLICY "Authenticated manage student_pedagogical_profiles"
ON public.student_pedagogical_profiles
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated manage student_pedagogical_year_notes" ON public.student_pedagogical_year_notes;
CREATE POLICY "Authenticated manage student_pedagogical_year_notes"
ON public.student_pedagogical_year_notes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
