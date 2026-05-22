-- 1. School Document Settings
CREATE TABLE IF NOT EXISTS school_document_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id text NOT NULL,
    school_name text,
    school_name_print text,
    oib text,
    city text,
    county text,
    principal_name text,
    principal_title text,
    school_number text,
    default_klasa text,
    default_urbroj text,
    stamp_image_url text,
    principal_signature_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Update Classes Table
DO $$ BEGIN
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS document_klasa text;
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS document_urbroj text;
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS document_issue_date date;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 3. Update User Profiles
DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS father_name text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mother_name text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birthplace text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birth_country text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS citizenship text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS student_registry_number text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gender text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 4. Student Documents
CREATE TABLE IF NOT EXISTS student_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    school_year_id uuid,
    class_id text,
    document_type text NOT NULL,
    document_number text,
    klasa text,
    urbroj text,
    issue_date date,
    status text DEFAULT 'DRAFT',
    locked boolean DEFAULT false,
    locked_at timestamptz,
    locked_by uuid,
    unlock_reason text,
    unlocked_at timestamptz,
    unlocked_by uuid,
    pdf_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 5. Final Thesis
CREATE TABLE IF NOT EXISTS final_thesis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    school_year_id uuid,
    thesis_title text,
    mentor_name text,
    creation_grade integer,
    defense_grade integer,
    creation_date date,
    defense_date date,
    exam_period text,
    created_at timestamptz DEFAULT now()
);

-- 6. Special Exams
CREATE TABLE IF NOT EXISTS special_exams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    exam_type text NOT NULL,
    subject_name text,
    grade integer,
    exam_date date,
    exam_period text,
    school_year_id uuid,
    created_at timestamptz DEFAULT now()
);
