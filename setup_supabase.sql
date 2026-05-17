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
