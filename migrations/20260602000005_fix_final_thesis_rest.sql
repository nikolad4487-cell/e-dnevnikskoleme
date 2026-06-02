-- Migration: add remaining columns to final_thesis
ALTER TABLE public.final_thesis
ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id),
ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id),
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS rejection_note text,
ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS deregistered_at timestamptz,
ADD COLUMN IF NOT EXISTS deregistered_by uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS deregistration_note text,
ADD COLUMN IF NOT EXISTS deregistration_classification_number text,
ADD COLUMN IF NOT EXISTS deregistration_registry_number text;

NOTIFY pgrst, 'reload schema';
