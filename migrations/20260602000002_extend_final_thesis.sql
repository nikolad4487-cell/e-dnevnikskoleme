-- Migration: extend final thesis module
ALTER TABLE public.final_thesis_applications
ADD COLUMN IF NOT EXISTS work_grade integer,
ADD COLUMN IF NOT EXISTS work_grade_date date,
ADD COLUMN IF NOT EXISTS defense_grade integer,
ADD COLUMN IF NOT EXISTS defense_grade_date date,
ADD COLUMN IF NOT EXISTS final_grade integer,
ADD COLUMN IF NOT EXISTS final_grade_date date,
ADD COLUMN IF NOT EXISTS work_graded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS defense_graded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS final_graded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.final_thesis_committee_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    thesis_application_id uuid NOT NULL REFERENCES public.final_thesis_applications(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT NOW()
);

-- Policies for committee members
ALTER TABLE public.final_thesis_committee_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage final thesis committee members" ON public.final_thesis_committee_members FOR ALL TO authenticated USING (true);
