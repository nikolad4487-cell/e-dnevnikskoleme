-- Migration: use final_thesis instead of final_thesis_applications
ALTER TABLE public.final_thesis
ADD COLUMN IF NOT EXISTS mentor_id uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS status text DEFAULT 'CREATED',
ADD COLUMN IF NOT EXISTS final_grade integer,
ADD COLUMN IF NOT EXISTS final_grade_date date,
ADD COLUMN IF NOT EXISTS application_classification_number text,
ADD COLUMN IF NOT EXISTS application_registry_number text,
ADD COLUMN IF NOT EXISTS application_data_entered_at timestamptz,
ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS student_note text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.final_thesis_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  final_thesis_id uuid NOT NULL REFERENCES public.final_thesis(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.user_profiles(id),
  created_at timestamptz DEFAULT now()
);

-- RLS for new table
ALTER TABLE public.final_thesis_committee_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage final thesis committee members" ON public.final_thesis_committee_members FOR ALL TO authenticated USING (true);

-- Drop previous mistakenly created tables if they exist
DROP TABLE IF EXISTS public.final_thesis_committee_members_old CASCADE;
-- Will handle drops later if needed.

NOTIFY pgrst, 'reload schema';
