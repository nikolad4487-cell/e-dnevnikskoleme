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
