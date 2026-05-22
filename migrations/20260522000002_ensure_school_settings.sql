-- Create table for storing asset paths if it doesn't exist
CREATE TABLE IF NOT EXISTS school_document_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    school_name text,
    principal_name text,
    overall_success_label text,
    stamp_url text,
    principal_signature_url text,
    teacher_signature_url text,
    updated_at timestamptz DEFAULT now()
);
