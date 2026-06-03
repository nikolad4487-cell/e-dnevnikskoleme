-- Migration for Priority 2: Pedagogical Measures, Expert Services, Program Adjustments, Parent Meetings, Individual Discussions, Parent Arrivals

-- 1. Pedagogical Measures Table
CREATE TABLE IF NOT EXISTS public.pedagogical_measures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    measure_type TEXT NOT NULL, -- Pohvala, Opomena razrednika, Ukor razrednika, Ukor razrednog vijeća, Opomena pred isključenje, Odluka nastavničkog vijeća, Ostalo
    date DATE NOT NULL,
    explanation TEXT NOT NULL,
    issuer TEXT NOT NULL,
    document_number TEXT,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, REVOKED, ARCHIVED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pedagogical_measures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage pedagogical_measures" ON public.pedagogical_measures;
CREATE POLICY "Authenticated manage pedagogical_measures" ON public.pedagogical_measures FOR ALL TO authenticated USING (true);

-- 2. Expert Service Activities Table
CREATE TABLE IF NOT EXISTS public.expert_service_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    school_year TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- razgovor s učenikom, razgovor s roditeljem, razgovor s nastavnikom, preporuka, procjena, plan podrške, prilagodba programa, individualizirani pristup
    date DATE NOT NULL,
    staff_role TEXT NOT NULL, -- pedagog, psiholog, edukacijski rehabilitator, socijalni pedagog, stručni suradnik
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

-- 3. Parent Meetings Table (Roditeljski sastanci)
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

-- 4. Individual Discussions Table (Individualni razgovori)
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

-- 5. Parent Arrivals Table (Evidencija dolaska roditelja)
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

-- 6. Add Audit Log Triggers
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
