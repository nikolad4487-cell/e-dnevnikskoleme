-- Ravnatelj: pregled vlastite škole bez akademskih/administratorskih izmjena.
-- Primijeniti nakon AKTIVACIJA-STRUCNI-SURADNIK.sql; postojeći podaci se ne mijenjaju.
BEGIN;
DO $$ BEGIN IF NOT public.expert_role_ready() THEN RAISE EXCEPTION 'Najprije aktivirajte postojeću nadogradnju Stručni suradnik.';END IF;END $$;
CREATE OR REPLACE FUNCTION public.principal_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND upper(coalesce(role,''))='PRINCIPAL')
 OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='PRINCIPAL' AND status='ACTIVE')
$$;
CREATE OR REPLACE FUNCTION public.expert_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND upper(coalesce(role,'')) IN ('EXPERT','PRINCIPAL'))
 OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role IN ('EXPERT','PRINCIPAL') AND status='ACTIVE')
$$;
CREATE OR REPLACE FUNCTION public.expert_school(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND role IN ('EXPERT','PRINCIPAL') AND status='ACTIVE')
$$;
CREATE OR REPLACE FUNCTION public.expert_row_write(_table text,_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l lessons;
BEGIN
 IF principal_actor() THEN RETURN _table='user_profiles' AND _row->>'id'=portal_profile_id()::text;END IF;
 IF NOT expert_row_scope(_table,_row) THEN RETURN false;END IF;
 IF _table IN ('student_pedagogical_profiles','student_pedagogical_year_notes','pedagogical_measures','expert_service_activities') THEN RETURN true;END IF;
 IF _table='user_profiles' THEN RETURN _row->>'id'=portal_profile_id()::text OR expert_student(_row->>'id');END IF;
 IF _table='lessons' THEN RETURN _row->>'teacher_id'=portal_profile_id()::text AND expert_homeroom_subject(_row->>'subject_id',_row->>'class_id');END IF;
 IF _table='absences' THEN
  SELECT * INTO l FROM lessons WHERE id::text=_row->>'lesson_id';
  RETURN l.id IS NOT NULL AND l.class_id=_row->>'class_id' AND l.teacher_id=portal_profile_id() AND expert_homeroom_subject(l.subject_id,l.class_id)
   AND _row->>'teacher_id'=portal_profile_id()::text AND upper(coalesce(_row->>'status',''))='PENDING';
 END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.principal_role_ready() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.principal_actor(),public.principal_role_ready() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.principal_actor(),public.principal_role_ready() TO authenticated;
GRANT EXECUTE ON FUNCTION public.principal_role_ready() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
