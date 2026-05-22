
-- Snapshot tablica za zaključane dokumente
CREATE TABLE IF NOT EXISTS student_document_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES student_documents(id),
    snapshot_data jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Log tablica za otključavanje
CREATE TABLE IF NOT EXISTS document_unlock_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES student_documents(id),
    unlocked_by uuid NOT NULL,
    reason text,
    klasa text,
    urbroj text,
    no_admin_procedure boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
