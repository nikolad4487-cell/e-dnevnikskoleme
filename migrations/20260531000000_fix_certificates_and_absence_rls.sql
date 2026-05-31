-- Create student_document_snapshots table
CREATE TABLE IF NOT EXISTS public.student_document_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.student_documents(id) ON DELETE CASCADE,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS for student_documents
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.student_documents;
CREATE POLICY "Allow authenticated read access" ON public.student_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin/teacher insert" ON public.student_documents;
CREATE POLICY "Allow admin/teacher insert" ON public.student_documents FOR INSERT TO authenticated WITH CHECK (true); -- Simplifying for now

DROP POLICY IF EXISTS "Allow admin/teacher update" ON public.student_documents;
CREATE POLICY "Allow admin/teacher update" ON public.student_documents FOR UPDATE TO authenticated USING (true); -- Simplifying for now

DROP POLICY IF EXISTS "Allow admin delete" ON public.student_documents;
CREATE POLICY "Allow admin delete" ON public.student_documents FOR DELETE TO authenticated USING (true); -- Simplifying for now
