CREATE TABLE IF NOT EXISTS public.school_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL,
  school_year_id uuid REFERENCES public.school_years(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  document_type text,
  visibility text DEFAULT 'INTERNAL',
  status text DEFAULT 'ACTIVE',
  file_url text,
  file_name text,
  file_mime_type text,
  file_size integer,
  version integer DEFAULT 1,
  uploaded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  signed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  signed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_documents_select"
ON public.school_documents
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "school_documents_insert_admin"
ON public.school_documents
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "school_documents_update_admin"
ON public.school_documents
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "school_documents_delete_admin"
ON public.school_documents
FOR DELETE
TO authenticated
USING (true);

NOTIFY pgrst, 'reload schema';
