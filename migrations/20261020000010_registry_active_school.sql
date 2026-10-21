BEGIN;
CREATE FUNCTION public.registry_read_school(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT registry_admin(_school) AND (NOT registry_scoped_actor() OR EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND active_school_id=_school))
$$;
CREATE FUNCTION public.registry_available_schools() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM schools WHERE registry_admin(id) AND is_active IS DISTINCT FROM false);END $$;
CREATE FUNCTION public.registry_switch_school(_school text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT registry_admin(_school) OR NOT EXISTS(SELECT 1 FROM schools WHERE id=_school AND is_active IS DISTINCT FROM false) THEN RAISE EXCEPTION 'Nemate ovlasti za odabranu ustanovu.';END IF;
 UPDATE user_profiles SET active_school_id=_school WHERE id=portal_profile_id();
END $$;
CREATE OR REPLACE FUNCTION public.registry_student_visible(_student uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM registry_students r WHERE r.id=_student AND r.created_by=auth.uid() AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.registry_student_id=r.id) AND NOT EXISTS(SELECT 1 FROM student_school_enrollments e WHERE e.student_id=r.id))
 OR EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE (e.registry_student_id=_student OR e.student_id=_student) AND registry_read_school(c.school_id))
 OR EXISTS(SELECT 1 FROM student_school_enrollments WHERE student_id=_student AND registry_read_school(school_id))
$$;
CREATE OR REPLACE FUNCTION public.registry_profile_visible(_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _profile=portal_profile_id() OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_profile AND registry_read_school(school_id)) OR registry_student_visible(_profile)
$$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['schools','classes','programs','school_years','student_school_enrollments','student_year_end_summaries','student_certificates','weekly_assignments','student_transport_records','student_education_records','school_document_records','school_registry_sections','staff_registry_records','certificate_seal_requests'] LOOP
  EXECUTE format('CREATE POLICY registry_active_read ON %I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_read_school(%s))',t,CASE WHEN t='schools' THEN 'id' ELSE 'school_id' END);
 END LOOP;
END $$;
CREATE POLICY registry_active_roles ON user_school_roles AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR user_id=portal_profile_id() OR registry_read_school(school_id));
CREATE POLICY registry_active_enrollments ON student_class_enrollments AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_read_school(portal_class_school(class_id)));
REVOKE ALL ON FUNCTION registry_read_school(text),registry_available_schools(),registry_switch_school(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_read_school(text),registry_available_schools(),registry_switch_school(text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
