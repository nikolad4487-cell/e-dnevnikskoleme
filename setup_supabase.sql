-- FK Constraints for classes table
ALTER TABLE classes
ADD CONSTRAINT classes_program_id_fkey
FOREIGN KEY (program_id)
REFERENCES educational_programs(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_homeroom_teacher_id_fkey
FOREIGN KEY (homeroom_teacher_id)
REFERENCES user_profiles(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_deputy_teacher_id_fkey
FOREIGN KEY (deputy_teacher_id)
REFERENCES user_profiles(id)
ON DELETE SET NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_school_year_id_fkey
FOREIGN KEY (school_year_id)
REFERENCES school_years(id)
ON DELETE SET NULL;

-- Cascade deletions for class-related data
-- Note: Re-creating FKs can be done via ALTER TABLE if CASCADE constraint is needed
-- This assumes standard naming conventions: table_name_class_id_fkey

ALTER TABLE student_class_enrollments
DROP CONSTRAINT IF EXISTS student_class_enrollments_class_id_fkey,
ADD CONSTRAINT student_class_enrollments_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE student_subject_enrollments
DROP CONSTRAINT IF EXISTS student_subject_enrollments_class_id_fkey,
ADD CONSTRAINT student_subject_enrollments_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE grades
DROP CONSTRAINT IF EXISTS grades_class_id_fkey,
ADD CONSTRAINT grades_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE absences
DROP CONSTRAINT IF EXISTS absences_class_id_fkey,
ADD CONSTRAINT absences_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE schedule_cells
DROP CONSTRAINT IF EXISTS schedule_cells_class_id_fkey,
ADD CONSTRAINT schedule_cells_class_id_fkey
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

-- Create attachments bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;
