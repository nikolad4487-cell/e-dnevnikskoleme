ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.final_grades
ADD COLUMN IF NOT EXISTS status TEXT;

NOTIFY pgrst, 'reload schema';
