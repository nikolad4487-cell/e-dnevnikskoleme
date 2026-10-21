BEGIN;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS legacy_certificate_id uuid REFERENCES portal_attendance_certificates(id);
CREATE UNIQUE INDEX registrar_legacy_certificate ON school_document_records(legacy_certificate_id) WHERE legacy_certificate_id IS NOT NULL;
-- This indexes existing office certificates; it does not issue them again or touch SELF codes.
INSERT INTO school_document_records(id,school_id,school_year_id,class_id,registry_student_id,student_id,document_type,status,issued_on,issued_by,created_at,note,legacy_certificate_id,snapshot,template_version)
SELECT a.id,a.school_id,c.school_year_id,a.class_id,(SELECT id FROM registry_students WHERE ednevnik_student_id=a.student_id LIMIT 1),a.student_id,'attendance','IZDANO',a.issued_at::date,a.issued_by,a.issued_at,
 'Ranije izdana potvrda: PDF se priprema iz tada spremljenih matičnih podataka.',a.id,
 jsonb_build_object('template','attendance','student',a.snapshot->'student','school',(a.snapshot->'school')||jsonb_build_object('education_level',CASE WHEN upper(a.snapshot->'school'->>'type') IN ('PRIMARY','ELEMENTARY') THEN 'ELEMENTARY' WHEN upper(a.snapshot->'school'->>'type')='HIGHER' THEN 'HIGHER' ELSE 'SECONDARY' END),'class',a.snapshot->'class','year',jsonb_build_object('name',a.snapshot->'class'->>'school_year'),'program',a.snapshot->'program','settings',a.snapshot->'settings','inputs',jsonb_build_object('purpose',a.purpose,'attest',false),'prepared_at',a.issued_at,'legacy_certificate_id',a.id,'legacy_visual_stamp',nullif(a.snapshot->'settings'->>'stamp_url','') IS NOT NULL OR s.id='srednja-kola-glina-zagreb'),
 'LEGACY_SNAPSHOT'
FROM portal_attendance_certificates a JOIN classes c ON c.id=a.class_id AND c.school_id=a.school_id JOIN schools s ON s.id=a.school_id WHERE a.mode='SCHOOL'
ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst,'reload schema';
