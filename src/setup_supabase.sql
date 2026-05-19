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

-- 7. Class Subject Teachers (Assignments)
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
    date DATE NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    UNIQUE(student_id, class_id, school_year)
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
CREATE POLICY "Authenticated read" ON public.school_years FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.programs FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.user_school_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.subjects FOR SELECT TO authenticated USING (true);
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

-- Enable RLS
ALTER TABLE public.student_parent_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage" ON public.student_parent_contacts FOR ALL TO authenticated USING (true);

-- 24. View for Active Classes (Used for Student Registration)
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

-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
