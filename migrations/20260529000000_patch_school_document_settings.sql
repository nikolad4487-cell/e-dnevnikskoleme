-- Add columns to school_document_settings if they don't exist
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS stamp_url text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS stamp_path text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS signature_path text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS teacher_signature_url text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS teacher_signature_path text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS principal_signature_url text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS principal_signature_path text;

-- Make sure standard/form columns also exist
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS school_name_print text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS oib text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS school_number text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS default_klasa text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS default_urbroj text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS stamp_image_url text;

-- Requested sync columns with form schema
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS overall_success_label text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS conduct_label text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS certificate_place text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS certificate_date date;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS desired_school_name text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS certificate_template_config text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS principal_name text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS homeroom_teacher_title text;
ALTER TABLE public.school_document_settings ADD COLUMN IF NOT EXISTS principal_title text;

-- Deduplicate school_document_settings table to ensure unique school_id
DELETE FROM public.school_document_settings WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY school_id
      ORDER BY updated_at DESC
    ) as row_num
    FROM public.school_document_settings
  ) t WHERE t.row_num > 1
);

-- Drop previous constraint if exists
ALTER TABLE public.school_document_settings DROP CONSTRAINT IF EXISTS school_document_settings_school_id_key;

-- Add UNIQUE constraint to school_id column
ALTER TABLE public.school_document_settings ADD CONSTRAINT school_document_settings_school_id_key UNIQUE (school_id);

-- Add subject_type to subjects and class_subject_teachers tables
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS subject_type text DEFAULT 'REQUIRED';
ALTER TABLE public.class_subject_teachers ADD COLUMN IF NOT EXISTS subject_type text DEFAULT 'REQUIRED';
