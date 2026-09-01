-- FULL SYSTEM STABILIZATION MIGRATION
-- This script ensures all tables exist with correct columns, defaults, and relations.
-- IDs for schools, classes, and subjects are TEXT to match existing app requirements.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables to ensure clean state and type consistency
DROP TABLE IF EXISTS public.curriculum_plans CASCADE;
DROP TABLE IF EXISTS public.student_subject_enrollments CASCADE;
DROP TABLE IF EXISTS public.student_class_enrollments CASCADE;
DROP TABLE IF EXISTS public.student_year_summaries CASCADE;
DROP TABLE IF EXISTS public.schedule_cell_subjects CASCADE;
DROP TABLE IF EXISTS public.schedule_cells CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;
DROP TABLE IF EXISTS public.grades CASCADE;
DROP TABLE IF EXISTS public.absences CASCADE;
DROP TABLE IF EXISTS public.lessons CASCADE;
DROP TABLE IF EXISTS public.work_weeks CASCADE;
DROP TABLE IF EXISTS public.class_subjects CASCADE;
DROP TABLE IF EXISTS public.class_subject_teachers CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.user_school_roles CASCADE;
DROP TABLE IF EXISTS public.student_parent_links CASCADE;
DROP TABLE IF EXISTS public.student_notes CASCADE;
DROP TABLE IF EXISTS public.student_overall_notes CASCADE;
DROP TABLE IF EXISTS public.class_overall_notes CASCADE;
DROP TABLE IF EXISTS public.special_exams CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.grading_elements CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;

-- 1. Schools Table (ID is TEXT)
CREATE TABLE public.schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'SECONDARY',
    address TEXT,
    city TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Profiles Table (ID is UUID)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    oib TEXT,
    dob DATE,
    pob TEXT,
    mobile TEXT,
    program_id UUID,
    class_id TEXT, -- Added for current class cache
    is_first_login BOOLEAN DEFAULT TRUE,
    requires_password_change BOOLEAN DEFAULT TRUE,
    requires_authenticator_setup BOOLEAN DEFAULT FALSE,
    authenticator_secret TEXT,
    password_type TEXT DEFAULT 'NORMAL_PASSWORD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User School Roles Table
CREATE TABLE public.user_school_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- MAIN_ADMIN, SCHOOL_ADMIN, TEACHER, HOMEROOM, STUDENT, PARENT
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, school_id, role)
);

-- 4. School Years
CREATE TABLE public.school_years (
    id TEXT PRIMARY KEY,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    starts_at DATE,
    ends_at DATE,
    is_active BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.1 Programs Table
CREATE TABLE public.programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_years INTEGER NOT NULL DEFAULT 4,
    type TEXT NOT NULL DEFAULT 'VOCATIONAL_3Y',
    continuation_type TEXT NOT NULL DEFAULT 'NONE',
    module_or_track TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Classes Table (ID is TEXT)
CREATE TABLE public.classes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    name TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    section TEXT,
    status TEXT DEFAULT 'ACTIVE',
    homeroom_teacher_id UUID REFERENCES public.user_profiles(id),
    deputy_teacher_id UUID REFERENCES public.user_profiles(id),
    program_id UUID,
    variant TEXT DEFAULT 'REGULAR',
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Student Class Enrollments (Membership)
CREATE TABLE public.student_class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    program_id TEXT REFERENCES public.programs(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, class_id, school_year)
);

-- 6. Subjects Table (ID is TEXT)
CREATE TABLE public.subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Class Subjects
CREATE TABLE public.class_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL,
    is_foreign_language BOOLEAN DEFAULT false,
    subject_period TEXT NOT NULL,
    planned_hours_semester_1 INTEGER,
    planned_hours_total INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, subject_id)
);

-- 8. Class Subject Teachers (Assignments)
CREATE TABLE public.class_subject_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    group_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, subject_id, teacher_id)
);

-- 8. Curriculum Plans
CREATE TABLE public.curriculum_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    weekly_hours INTEGER NOT NULL,
    school_year TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, subject_id, school_year)
);

-- 9. Work Weeks
CREATE TABLE public.work_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    shift TEXT DEFAULT 'Ujutro',
    is_teaching_week BOOLEAN DEFAULT TRUE,
    on_duty_student_ids UUID[] DEFAULT '{}',
    teaching_days DATE[] DEFAULT '{}',
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Lessons
CREATE TABLE public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    work_week_id UUID REFERENCES public.work_weeks(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    hour INTEGER NOT NULL,
    topic TEXT NOT NULL,
    homework TEXT,
    notes TEXT,
    materials TEXT,
    group_name TEXT,
    is_held BOOLEAN DEFAULT TRUE,
    is_block BOOLEAN DEFAULT FALSE,
    block_count INTEGER DEFAULT 1,
    created_by_user_id UUID REFERENCES public.user_profiles(id),
    teacher_display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Absences
CREATE TABLE public.absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hour INTEGER,
    status TEXT DEFAULT 'CEKA',
    note TEXT,
    teacher_id UUID REFERENCES public.user_profiles(id),
    absence_type TEXT,
    justified_by UUID REFERENCES public.user_profiles(id),
    justified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, lesson_id, hour)
);

-- 12. Grades
CREATE TABLE public.grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    value INTEGER NOT NULL,
    note TEXT,
    element TEXT,
    category TEXT, -- keep for backward compatibility if needed, but 'element' is preferred now
    grade_type TEXT DEFAULT 'REGULAR',
    is_final BOOLEAN DEFAULT FALSE,
    period TEXT, -- For final grades ('1', 'FINAL', etc.)
    weight INTEGER DEFAULT 1,
    is_important BOOLEAN DEFAULT FALSE,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index to ensure only one final grade per student/subject/class
CREATE UNIQUE INDEX IF NOT EXISTS grades_one_final_per_subject 
ON public.grades(student_id, class_id, subject_id) 
WHERE is_final = true;

-- 13. Exams
CREATE TABLE public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.user_profiles(id) DEFAULT NULL, -- For supplementary/makeup/differential exams
    teacher_id UUID REFERENCES public.user_profiles(id) DEFAULT NULL,
    school_year_id TEXT REFERENCES public.school_years(id) DEFAULT NULL,
    exam_date DATE NOT NULL,
    exam_type TEXT NOT NULL,
    grade_value INTEGER DEFAULT NULL,
    description TEXT,
    note TEXT DEFAULT NULL,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.b Final Grades
CREATE TABLE public.final_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE CASCADE,
    term TEXT NOT NULL CHECK (term IN ('FIRST_SEMESTER', 'FINAL', 'FIRST_TERM', 'SECOND_TERM')),
    period TEXT,
    value TEXT NOT NULL,
    status TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_id, class_id, school_year_id, period)
);
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage final_grades" ON public.final_grades FOR ALL TO authenticated USING (true);


-- 14. Schedule Cells
CREATE TABLE public.schedule_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    day_of_week TEXT NOT NULL,
    shift TEXT NOT NULL,
    period_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, day_of_week, shift, period_number)
);

CREATE TABLE public.schedule_cell_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_cell_id UUID NOT NULL REFERENCES public.schedule_cells(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    classroom TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_cell_id, subject_id)
);

-- 15. Year Summaries
CREATE TABLE public.student_year_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    average NUMERIC(3,2),
    behavior TEXT DEFAULT 'Uzorno',
    final_result INTEGER,
    status TEXT DEFAULT 'PENDING',
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    overall_average NUMERIC(3,2),
    overall_success INTEGER,
    conduct TEXT,
    calculated_at TIMESTAMPTZ,
    UNIQUE(student_id, class_id, school_year_id)
);

-- 16. Student Subject Enrollments
CREATE TABLE public.student_subject_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_id, class_id, school_year)
);

-- 17. Notes & Imenik Specifics
CREATE TABLE public.student_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id),
    school_id TEXT REFERENCES public.schools(id),
    content TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.student_overall_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    homeroom_note TEXT,
    extracurricular_activities TEXT,
    school_activities TEXT,
    disciplinary_actions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.class_overall_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    homeroom_info TEXT,
    deputy_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Grading Elements
CREATE TABLE public.grading_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, subject_id, name)
);

-- Enable RLS on all tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_school_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subject_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_cell_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_year_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subject_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_overall_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_overall_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_elements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated read" ON public.schools FOR SELECT TO authenticated USING (true);

-- School years RLS Policies
DROP POLICY IF EXISTS "Authenticated read" ON public.school_years;
DROP POLICY IF EXISTS "Admins can read school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can insert school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can update school years" ON public.school_years;
DROP POLICY IF EXISTS "Admins can delete school years" ON public.school_years;

CREATE POLICY "Admins can read school years"
ON public.school_years
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
        )
      )
  )
);

CREATE POLICY "Admins can insert school years"
ON public.school_years
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

CREATE POLICY "Admins can update school years"
ON public.school_years
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);

CREATE POLICY "Admins can delete school years"
ON public.school_years
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.user_school_roles usr
      ON usr.user_id = up.id
    WHERE up.auth_user_id = auth.uid()
      AND (
        up.role = 'SUPER_ADMIN'
        OR up.access_role = 'SUPER_ADMIN'
        OR (
          usr.school_id = school_years.school_id
          AND usr.status = 'ACTIVE'
          AND usr.role IN ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN')
        )
      )
  )
);
CREATE POLICY "Authenticated read" ON public.programs FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.user_school_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.class_subjects FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.lessons FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.grades FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.absences FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.exams FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.class_subject_teachers FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.student_class_enrollments FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.curriculum_plans FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.student_subject_enrollments FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.student_notes FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.student_overall_notes FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.class_overall_notes FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.grading_elements FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.work_weeks FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.schedule_cells FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.schedule_cell_subjects FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.student_year_summaries FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.rollover_logs FOR ALL TO authenticated USING (true);

-- 22. Rollover Logs
CREATE TABLE public.rollover_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT REFERENCES public.schools(id),
    from_school_year_id TEXT,
    to_school_year_id TEXT,
    from_class_id TEXT,
    to_class_id TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    students_transferred INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Student Parent Contacts
CREATE TABLE IF NOT EXISTS public.student_parent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  parent_name text,
  parent_phone text,
  parent_email text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 24. Chat System Tables

CREATE TABLE IF NOT EXISTS public.chat_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT REFERENCES public.schools(id),
    class_id TEXT REFERENCES public.classes(id),
    subject_id TEXT REFERENCES public.subjects(id),
    name TEXT,
    type TEXT NOT NULL DEFAULT 'PRIVATE', -- PRIVATE, PRIVATE_GROUP, SUBJECT_CHANNEL, CUSTOM_CHANNEL
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated manage" ON public.chat_groups FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.chat_group_members FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage" ON public.message_attachments FOR ALL TO authenticated USING (true);

-- Enable RLS
CREATE OR REPLACE VIEW public.active_classes_current_year AS
SELECT
  c.*,
  sy.is_active as school_year_active
FROM public.classes c
JOIN public.school_years sy
  ON sy.id = c.school_year_id
WHERE
  sy.is_active = true;

CREATE OR REPLACE VIEW public.active_classes_for_students AS
SELECT
  c.id,
  c.name,
  c.grade_level,
  c.section,
  c.school_year_id,
  c.school_id,
  c.status,
  sy.is_active as school_year_active
FROM public.classes c
JOIN public.school_years sy
  ON sy.id = c.school_year_id
WHERE
  lower(c.status) IN ('active', 'aktivan')
  AND sy.is_active = true;

-- Lektire, Pedagoška dokumentacija, Daily Notes Schemas
CREATE TABLE IF NOT EXISTS public.lektire (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    completed_date DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedagoska_dokumentacija (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    education_program TEXT,
    assistance_form TEXT,
    difficulties TEXT,
    visit_reason TEXT,
    interview_date DATE,
    interviewer_name TEXT,
    record_type TEXT,
    problem_description TEXT,
    measures_taken TEXT,
    teacher_recommendational_notes TEXT,
    parent_recommendational_notes TEXT,
    confidential_notes TEXT,
    attachments JSONB,
    status TEXT DEFAULT 'OPEN',
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year_id TEXT REFERENCES public.school_years(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and Policies
ALTER TABLE public.lektire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagoska_dokumentacija ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage lektire" ON public.lektire FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage pedagoska" ON public.pedagoska_dokumentacija FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated manage daily_notes" ON public.daily_notes FOR ALL TO authenticated USING (true);

-- 1. Create table for system audit logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view audit logs" ON public.system_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert audit logs" ON public.system_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 2. General trigger function
CREATE OR REPLACE FUNCTION public.log_system_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_executor_id UUID;
    v_school_id TEXT := NULL;
    v_action TEXT;
    v_entity TEXT;
    v_entity_id TEXT;
    v_old JSONB := NULL;
    v_new JSONB := NULL;
BEGIN
    v_executor_id := auth.uid();
    v_entity := TG_TABLE_NAME;
    v_action := TG_OP;
    
    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id::TEXT;
        v_old := to_jsonb(OLD);
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := NEW.id::TEXT;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id::TEXT;
        v_new := to_jsonb(NEW);
    END IF;

    -- Try to capture school_id if it exists
    BEGIN
        IF TG_OP = 'DELETE' AND OLD ? 'school_id' THEN
            v_school_id := OLD.school_id;
        ELSIF NEW ? 'school_id' THEN
            v_school_id := NEW.school_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Safely ignore missing columns
    END;

    INSERT INTO public.system_audit_logs(executor_id, school_id, action_type, entity_type, entity_id, old_value, new_value)
    VALUES (v_executor_id, v_school_id, v_action, v_entity, v_entity_id, v_old, v_new);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triggers for Grades, Lessons, Absences

DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
    AFTER UPDATE OR DELETE ON public.grades
    FOR EACH ROW
    EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_lessons ON public.lessons;
CREATE TRIGGER trg_audit_lessons
    AFTER DELETE ON public.lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_absences ON public.absences;
CREATE TRIGGER trg_audit_absences
    AFTER DELETE ON public.absences
    FOR EACH ROW
    EXECUTE FUNCTION public.log_system_audit();

-- 4. Trigger for Overall Success (student_year_summaries)
CREATE OR REPLACE FUNCTION public.log_summary_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_executor_id UUID;
    v_action TEXT;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_executor_id := auth.uid();
        v_action := 'UPDATE_SUMMARY_STATUS_' || NEW.status;
        
        INSERT INTO public.system_audit_logs(executor_id, action_type, entity_type, entity_id, old_value, new_value)
        VALUES (v_executor_id, v_action, 'student_year_summaries', NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_summary_status ON public.student_year_summaries;
CREATE TRIGGER trg_audit_summary_status
    AFTER UPDATE ON public.student_year_summaries
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.log_summary_status_change();


-- 5. Trigger for Certificate Locks (student_documents)
CREATE OR REPLACE FUNCTION public.log_document_lock_change()
RETURNS TRIGGER AS $$
DECLARE
    v_executor_id UUID;
    v_action TEXT;
BEGIN
    IF OLD.locked IS DISTINCT FROM NEW.locked THEN
        v_executor_id := auth.uid();
        IF NEW.locked = true THEN
            v_action := 'LOCK_DOCUMENT';
        ELSE
            v_action := 'UNLOCK_DOCUMENT';
        END IF;
        
        INSERT INTO public.system_audit_logs(executor_id, action_type, entity_type, entity_id, old_value, new_value)
        VALUES (v_executor_id, v_action, 'student_documents', NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_doc_lock ON public.student_documents;
CREATE TRIGGER trg_audit_doc_lock
    AFTER UPDATE ON public.student_documents
    FOR EACH ROW
    WHEN (OLD.locked IS DISTINCT FROM NEW.locked)
    EXECUTE FUNCTION public.log_document_lock_change();

-- 6. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.notifications;
CREATE POLICY "Users can manage their own notifications" ON public.notifications FOR ALL TO authenticated USING (true);


-- 7. Notification Triggers
-- Trigger for Grades
CREATE OR REPLACE FUNCTION public.notify_grade_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.student_id, 'Nova ocjena', 'Dobili ste novu ocjenu iz nekog predmeta.', 'GRADE', '/student/ocjene');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_grade_insert ON public.grades;
CREATE TRIGGER trg_notify_grade_insert
    AFTER INSERT ON public.grades
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_grade_insert();

-- Trigger for Absences
CREATE OR REPLACE FUNCTION public.notify_absence_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.student_id, 'Novi izostanak', 'Dobili ste novi izostanak.', 'ABSENCE', '/student/izostanci');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_absence_insert ON public.absences;
CREATE TRIGGER trg_notify_absence_insert
    AFTER INSERT ON public.absences
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_absence_insert();


-- 8. Parent Child Relationships
CREATE TABLE IF NOT EXISTS public.parent_child_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_id, child_id)
);

ALTER TABLE public.parent_child_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage parent_child_relationships" ON public.parent_child_relationships;
CREATE POLICY "Authenticated manage parent_child_relationships" ON public.parent_child_relationships FOR ALL TO authenticated USING (true);

-- 9. Teacher Substitutions
CREATE TABLE IF NOT EXISTS public.teacher_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    original_teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    substitute_teacher_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hour INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teacher_substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage teacher_substitutions" ON public.teacher_substitutions;
CREATE POLICY "Authenticated manage teacher_substitutions" ON public.teacher_substitutions FOR ALL TO authenticated USING (true);


-- 10. Pedagogical Measures Table
CREATE TABLE IF NOT EXISTS public.pedagogical_measures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    measure_type TEXT NOT NULL,
    date DATE NOT NULL,
    explanation TEXT NOT NULL,
    issuer TEXT NOT NULL,
    document_number TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pedagogical_measures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage pedagogical_measures" ON public.pedagogical_measures;
CREATE POLICY "Authenticated manage pedagogical_measures" ON public.pedagogical_measures FOR ALL TO authenticated USING (true);

-- 11. Expert Service Activities Table
CREATE TABLE IF NOT EXISTS public.expert_service_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    date DATE NOT NULL,
    staff_role TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    description TEXT NOT NULL,
    conclusion TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expert_service_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage expert_service_activities" ON public.expert_service_activities;
CREATE POLICY "Authenticated manage expert_service_activities" ON public.expert_service_activities FOR ALL TO authenticated USING (true);

-- 12. Parent Meetings Table (Roditeljski sastanci)
CREATE TABLE IF NOT EXISTS public.parent_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    topic TEXT NOT NULL,
    leader TEXT NOT NULL,
    minutes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parent_meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage parent_meetings" ON public.parent_meetings;
CREATE POLICY "Authenticated manage parent_meetings" ON public.parent_meetings FOR ALL TO authenticated USING (true);

-- 13. Individual Discussions Table (Individualni razgovori)
CREATE TABLE IF NOT EXISTS public.individual_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    parent_name TEXT NOT NULL,
    counselor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.individual_discussions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage individual_discussions" ON public.individual_discussions;
CREATE POLICY "Authenticated manage individual_discussions" ON public.individual_discussions FOR ALL TO authenticated USING (true);

-- 14. Parent Arrivals Table (Evidencija dolaska roditelja)
CREATE TABLE IF NOT EXISTS public.parent_arrivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    parent_name TEXT NOT NULL,
    date DATE NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parent_arrivals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage parent_arrivals" ON public.parent_arrivals;
CREATE POLICY "Authenticated manage parent_arrivals" ON public.parent_arrivals FOR ALL TO authenticated USING (true);

-- 15. Add Audit Log Triggers
DROP TRIGGER IF EXISTS trg_audit_pedagogical_measures ON public.pedagogical_measures;
CREATE TRIGGER trg_audit_pedagogical_measures
    AFTER INSERT OR UPDATE OR DELETE ON public.pedagogical_measures
    FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_expert_service_activities ON public.expert_service_activities;
CREATE TRIGGER trg_audit_expert_service_activities
    AFTER INSERT OR UPDATE OR DELETE ON public.expert_service_activities
    FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_parent_meetings ON public.parent_meetings;
CREATE TRIGGER trg_audit_parent_meetings
    AFTER INSERT OR UPDATE OR DELETE ON public.parent_meetings
    FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_individual_discussions ON public.individual_discussions;
CREATE TRIGGER trg_audit_individual_discussions
    AFTER INSERT OR UPDATE OR DELETE ON public.individual_discussions
    FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();

DROP TRIGGER IF EXISTS trg_audit_parent_arrivals ON public.parent_arrivals;
CREATE TRIGGER trg_audit_parent_arrivals
    AFTER INSERT OR UPDATE OR DELETE ON public.parent_arrivals
    FOR EACH ROW EXECUTE FUNCTION public.log_system_audit();


-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';

-- --------------------------------------------------------
-- SCHOOL DOCUMENTS TABLE
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
    title text NOT NULL,
    document_type text NOT NULL,
    category text,
    description text,
    visibility text DEFAULT 'INTERNAL',
    status text DEFAULT 'ODOBREN',
    uploaded_by uuid REFERENCES auth.users(id),
    file_path text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'school_documents' AND policyname = 'Enable all for everyone'
    ) THEN
        CREATE POLICY "Enable all for everyone" ON public.school_documents
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;
