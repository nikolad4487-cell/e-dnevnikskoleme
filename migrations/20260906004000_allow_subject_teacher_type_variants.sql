ALTER TABLE public.class_subject_teachers
  ADD COLUMN IF NOT EXISTS subject_type TEXT DEFAULT 'REDOVNI';

UPDATE public.class_subject_teachers
SET subject_type = CASE
  WHEN subject_type IS NULL OR btrim(subject_type) = '' OR subject_type = 'REQUIRED' THEN 'REDOVNI'
  ELSE subject_type
END;

ALTER TABLE public.class_subject_teachers
  ALTER COLUMN subject_type SET DEFAULT 'REDOVNI';

ALTER TABLE public.class_subject_teachers
  ALTER COLUMN subject_type SET NOT NULL;

ALTER TABLE public.class_subject_teachers
  DROP CONSTRAINT IF EXISTS class_subject_teachers_class_id_subject_id_teacher_id_key;

ALTER TABLE public.class_subject_teachers
  DROP CONSTRAINT IF EXISTS class_subject_teachers_class_id_subject_id_teacher_id;

ALTER TABLE public.class_subject_teachers
  ADD CONSTRAINT class_subject_teachers_class_subject_teacher_type_key
  UNIQUE (class_id, subject_id, teacher_id, subject_type);
