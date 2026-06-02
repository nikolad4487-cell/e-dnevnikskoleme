CREATE TABLE IF NOT EXISTS public.final_thesis_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    school_year_id UUID,
    school_year TEXT,

    title TEXT NOT NULL,
    mentor_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    exam_term TEXT NOT NULL,
    student_note TEXT,

    status TEXT DEFAULT 'CREATED',

    submitted_at TIMESTAMPTZ DEFAULT NOW(),

    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,

    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    rejection_note TEXT,

    application_classification_number TEXT,
    application_registry_number TEXT,
    application_data_entered_at TIMESTAMPTZ,
    application_data_entered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,

    deregistered_at TIMESTAMPTZ,
    deregistration_note TEXT,
    deregistration_classification_number TEXT,
    deregistration_registry_number TEXT,
    deregistration_data_entered_at TIMESTAMPTZ,
    deregistration_data_entered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.final_thesis_applications ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS policies for final_thesis_applications
CREATE POLICY "Manage actions final_thesis_applications" ON public.final_thesis_applications
    FOR ALL TO authenticated USING (true);
