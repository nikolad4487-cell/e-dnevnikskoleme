-- Chat schema improvements
CREATE TABLE IF NOT EXISTS public.chat_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure chat_groups has required columns
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS subject_id TEXT REFERENCES public.subjects(id);
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS class_id TEXT REFERENCES public.classes(id);
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS school_id TEXT REFERENCES public.schools(id);

-- Ensure messages has required columns
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated manage" ON public.chat_group_members FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.message_attachments FOR ALL TO authenticated USING (true);

-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
