-- Stručni suradnik: school-wide reading, pedagogy and own Sat razrednika lessons.
-- Additive. Run after the existing e-Matica / Referada activation.
BEGIN;
-- Restrukturiranje Pedagoške Dokumentacije na Trajne i Godišnje podatke
CREATE TABLE IF NOT EXISTS public.student_pedagogical_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    education_program TEXT,
    visit_reason TEXT,
    disabilities TEXT,
    accommodations TEXT,
    support_types TEXT,
    practical_training TEXT,
    documentation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_profile UNIQUE (student_id)
);

CREATE TABLE IF NOT EXISTS public.student_pedagogical_year_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    school_year_id UUID NOT NULL REFERENCES public.school_years(id),
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    recommendations TEXT,
    counselor_notes TEXT,
    yearly_observations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_year_note UNIQUE (student_id, school_year_id, class_id)
);


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


-- Canonical tables are reused if present. Newly activated records need staff-only access.
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY expert_audit_reader ON public.system_audit_logs FOR SELECT TO authenticated USING(registry_admin(school_id) OR executor_id=portal_profile_id());
GRANT SELECT ON public.system_audit_logs TO authenticated;
CREATE OR REPLACE FUNCTION public.expert_staff_student(_row jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.student_id::text=_row->>'student_id' AND portal_class_manager(e.class_id)
 AND (nullif(_row->>'class_id','') IS NULL OR e.class_id=_row->>'class_id')
 AND (nullif(_row->>'school_id','') IS NULL OR portal_class_school(e.class_id)=_row->>'school_id'))
$$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['student_pedagogical_profiles','student_pedagogical_year_notes','pedagogical_measures','expert_service_activities'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY expert_existing_staff ON public.%I FOR ALL TO authenticated USING(public.expert_staff_student(to_jsonb(%I))) WITH CHECK(public.expert_staff_student(to_jsonb(%I)))',t,t,t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.expert_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND upper(coalesce(role,''))='EXPERT')
 OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='EXPERT' AND status='ACTIVE')
$$;
CREATE OR REPLACE FUNCTION public.expert_school(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND role='EXPERT' AND status='ACTIVE')
$$;
CREATE OR REPLACE FUNCTION public.expert_class(_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM classes WHERE id=_class AND expert_school(school_id))
$$;
CREATE OR REPLACE FUNCTION public.expert_student(_student text,_class text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE (e.student_id::text=_student OR e.registry_student_id::text=_student) AND e.status='ACTIVE' AND (_class IS NULL OR e.class_id=_class) AND expert_class(e.class_id))
$$;
CREATE OR REPLACE FUNCTION public.expert_homeroom_subject(_subject text,_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM subjects s JOIN classes c ON c.school_id=s.school_id WHERE s.id=_subject AND c.id=_class AND expert_class(c.id)
 AND lower(trim(s.name)) IN ('sat razrednika','sat razredne zajednice','sat razrednog odjela','sr')
 AND EXISTS(SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.subject_id=s.id))
$$;
-- Keep the existing 48-hour/ownership rules for attendance on Sat razrednika.
CREATE OR REPLACE FUNCTION public.portal_subject_teacher(_class text,_subject text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT portal_admin((SELECT school_id FROM classes WHERE id=_class)) OR EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND subject_id=_subject AND teacher_id=portal_profile_id())
 OR (expert_actor() AND expert_homeroom_subject(_subject,_class))
$$;
CREATE OR REPLACE FUNCTION public.expert_row_scope(_table text,_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c text:=nullif(_row->>'class_id',''); s text:=nullif(_row->>'school_id',''); person text:=nullif(_row->>'student_id','');
BEGIN
 IF NOT expert_actor() THEN RETURN false;END IF;
 IF _table='schools' THEN RETURN expert_school(_row->>'id');END IF;
 IF _table='user_profiles' THEN
  RETURN _row->>'id'=portal_profile_id()::text OR expert_student(_row->>'id') OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id::text=_row->>'id' AND status='ACTIVE' AND expert_school(school_id));
 END IF;
 IF _table='registry_students' THEN RETURN expert_student(_row->>'id');END IF;
 IF c IS NOT NULL THEN
  IF NOT expert_class(c) OR (s IS NOT NULL AND s IS DISTINCT FROM portal_class_school(c)) THEN RETURN false;END IF;
  RETURN person IS NULL OR expert_student(person,c);
 END IF;
 IF s IS NOT NULL THEN RETURN expert_school(s) AND (person IS NULL OR expert_student(person));END IF;
 IF person IS NOT NULL THEN RETURN expert_student(person);END IF;
 IF nullif(_row->>'subject_id','') IS NOT NULL THEN RETURN EXISTS(SELECT 1 FROM subjects WHERE id=_row->>'subject_id' AND expert_school(school_id));END IF;
 IF nullif(_row->>'user_id','') IS NOT NULL THEN RETURN _row->>'user_id'=portal_profile_id()::text;END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.expert_row_write(_table text,_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l lessons;
BEGIN
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
CREATE OR REPLACE FUNCTION public.expert_write_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j jsonb;old_j jsonb;
BEGIN
 IF NOT expert_actor() OR auth.uid() IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 -- Audit/notification triggers append their own records; users cannot invoke this path directly.
 IF TG_OP='INSERT' AND pg_trigger_depth()>1 AND TG_TABLE_NAME IN ('system_audit_logs','audit_logs','registry_change_log','portal_notifications') THEN RETURN NEW;END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  old_j:=to_jsonb(OLD);
  IF NOT expert_row_write(TG_TABLE_NAME,old_j) THEN RAISE EXCEPTION 'Stručni suradnik ne može mijenjati ovaj zapis.';END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  j:=to_jsonb(NEW);
  IF NOT expert_row_write(TG_TABLE_NAME,j) THEN RAISE EXCEPTION 'Stručni suradnik uređuje samo pedagošku dokumentaciju i vlastiti sat razrednika u svojoj školi.';END IF;
 END IF;
 IF TG_TABLE_NAME='user_profiles' THEN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Stručni suradnik ne može dodavati ili brisati korisnike.';END IF;
  IF j->>'id'=portal_profile_id()::text THEN
   IF (old_j-ARRAY['name','email','mobile','address','updated_at']) IS DISTINCT FROM (j-ARRAY['name','email','mobile','address','updated_at']) THEN RAISE EXCEPTION 'Vlastite ovlasti i postavke prijave mijenjajte samo kroz ovlašteni postupak.';END IF;
  ELSE
   IF (old_j-ARRAY['program_adjustment','updated_at']) IS DISTINCT FROM (j-ARRAY['program_adjustment','updated_at']) THEN RAISE EXCEPTION 'Dopuštena je samo pedagoška prilagodba programa učenika.';END IF;
   IF coalesce(j->>'program_adjustment','NONE') NOT IN ('NONE','REGULAR_WITH_ADAPTATION','REGULAR_WITH_INDIVIDUALIZATION') THEN RAISE EXCEPTION 'Odaberite valjanu pedagošku prilagodbu programa.';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
-- Preserve access for existing users on relations that previously had no RLS.
-- Trigger only physical tables: enrollment_final_grades may be a view.
DO $$ DECLARE t record;BEGIN
 FOR t IN SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
  IF NOT t.relrowsecurity THEN
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
   EXECUTE format('CREATE POLICY expert_previous_access ON public.%I FOR ALL TO authenticated USING(NOT public.expert_actor()) WITH CHECK(NOT public.expert_actor())',t.relname);
  END IF;
  EXECUTE format('CREATE POLICY expert_read_scope ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.expert_actor() OR public.expert_row_scope(%L,to_jsonb(%I)))',t.relname,t.relname,t.relname);
  EXECUTE format('CREATE POLICY expert_read ON public.%I FOR SELECT TO authenticated USING(public.expert_row_scope(%L,to_jsonb(%I)))',t.relname,t.relname,t.relname);
  EXECUTE format('CREATE POLICY expert_write ON public.%I FOR ALL TO authenticated USING(public.expert_row_write(%L,to_jsonb(%I))) WITH CHECK(public.expert_row_write(%L,to_jsonb(%I)))',t.relname,t.relname,t.relname,t.relname,t.relname);
  EXECUTE format('CREATE TRIGGER expert_write_scope BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.expert_write_guard()',t.relname);
 END LOOP;
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND (c.relname LIKE 'v_ematica_%%' OR c.relname LIKE 'v_student_%%' OR c.relname='enrollment_final_grades') LOOP
  EXECUTE format('ALTER VIEW public.%I SET(security_invoker=true)',t.relname);
 END LOOP;
END $$;
-- Existing pedagogical audit triggers reference user_profiles, not auth.users.
-- Resolve the profile identifier so accounts with distinct Auth IDs can save.
CREATE OR REPLACE FUNCTION public.log_system_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
 INSERT INTO public.system_audit_logs(executor_id,school_id,action_type,entity_type,entity_id,old_value,new_value)
 VALUES(portal_profile_id(),coalesce(nullif(j->>'school_id',''),portal_class_school(j->>'class_id')),TG_OP,TG_TABLE_NAME,j->>'id',CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['pedagogical_measures','expert_service_activities'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgfoid='public.log_system_audit()'::regprocedure AND NOT tgisinternal) THEN
   EXECUTE format('CREATE TRIGGER expert_system_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_system_audit()',t);
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.expert_pedagogy_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;s text;
BEGIN
 IF expert_actor() THEN
  s:=coalesce(j->>'school_id',portal_class_school(j->>'class_id'),(SELECT c.school_id FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id::text=j->>'student_id' AND e.status='ACTIVE' AND expert_school(c.school_id) ORDER BY c.school_id LIMIT 1));
  INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data)
  VALUES(s,'PEDAGOGY',j->>'id',TG_OP,portal_profile_id(),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['student_pedagogical_profiles','student_pedagogical_year_notes','pedagogical_measures','expert_service_activities'] LOOP
  EXECUTE format('CREATE TRIGGER expert_pedagogy_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.expert_pedagogy_audit()',t);
 END LOOP;
END $$;
-- Reuse existing pedagogical records, not a parallel student database.
CREATE OR REPLACE FUNCTION public.expert_pedagogy(_student uuid,_class text DEFAULT NULL,_year text DEFAULT NULL,_section text DEFAULT 'PROFILE',_data jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; col text; current_profile student_pedagogical_profiles; current_year student_pedagogical_year_notes;
BEGIN
 IF NOT expert_actor() OR NOT expert_student(_student::text,_class) THEN RAISE EXCEPTION 'Učenik nije dostupan stručnoj službi vaše škole.';END IF;
 IF _section='YEAR' AND _data ? 'yearly_observations' AND jsonb_typeof(_data->'yearly_observations')<>'array' THEN RAISE EXCEPTION 'Godišnja opažanja moraju biti popis zapisa.';END IF;
 IF _section NOT IN ('PROFILE','YEAR') THEN RAISE EXCEPTION 'Nepoznata pedagoška evidencija.';END IF;
 IF _data IS NOT NULL AND (jsonb_typeof(_data)<>'object' OR octet_length(_data::text)>100000) THEN RAISE EXCEPTION 'Neispravni ili predugi pedagoški podaci.';END IF;
 IF _section='PROFILE' THEN
  SELECT * INTO current_profile FROM student_pedagogical_profiles WHERE student_id=_student;
  IF _data IS NOT NULL THEN
   IF _data ? 'program_adjustment' AND coalesce(_data->>'program_adjustment','') NOT IN ('NONE','REGULAR_WITH_ADAPTATION','REGULAR_WITH_INDIVIDUALIZATION') THEN RAISE EXCEPTION 'Odaberite valjanu pedagošku prilagodbu programa.';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN ('education_program','visit_reason','disabilities','accommodations','support_types','practical_training','documentation','program_adjustment')) THEN RAISE EXCEPTION 'Nedopušteno polje pedagoškog kartona.';END IF;
   INSERT INTO student_pedagogical_profiles(student_id,education_program,visit_reason,disabilities,accommodations,support_types,practical_training,documentation)
   VALUES(_student,coalesce(_data->>'education_program',current_profile.education_program,''),coalesce(_data->>'visit_reason',current_profile.visit_reason,''),coalesce(_data->>'disabilities',current_profile.disabilities,''),coalesce(_data->>'accommodations',current_profile.accommodations,''),coalesce(_data->>'support_types',current_profile.support_types,''),coalesce(_data->>'practical_training',current_profile.practical_training,''),coalesce(_data->>'documentation',current_profile.documentation,''))
   ON CONFLICT(student_id) DO UPDATE SET education_program=EXCLUDED.education_program,visit_reason=EXCLUDED.visit_reason,disabilities=EXCLUDED.disabilities,accommodations=EXCLUDED.accommodations,support_types=EXCLUDED.support_types,practical_training=EXCLUDED.practical_training,documentation=EXCLUDED.documentation,updated_at=now();
   IF _data ? 'program_adjustment' THEN UPDATE user_profiles SET program_adjustment=_data->>'program_adjustment' WHERE id=_student;END IF;
  END IF;
  SELECT coalesce(to_jsonb(p),jsonb_build_object('student_id',_student)) INTO result FROM (SELECT 1) q LEFT JOIN student_pedagogical_profiles p ON p.student_id=_student;
  RETURN result||jsonb_build_object('program_adjustment',coalesce((SELECT program_adjustment FROM user_profiles WHERE id=_student),'NONE'));
 ELSE
  IF _class IS NULL OR _year IS NULL OR NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_year_id::text=_year AND expert_class(id)) THEN RAISE EXCEPTION 'Provjerite razred i školsku godinu.';END IF;
  IF _data IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN ('recommendations','counselor_notes','yearly_observations')) THEN RAISE EXCEPTION 'Nedopušteno polje godišnje dokumentacije.';END IF;
   SELECT * INTO current_year FROM student_pedagogical_year_notes WHERE student_id=_student AND class_id=_class AND school_year_id::text=_year;
   INSERT INTO student_pedagogical_year_notes(student_id,class_id,school_year_id,recommendations,counselor_notes,yearly_observations)
   VALUES(_student,_class,(jsonb_populate_record(NULL::student_pedagogical_year_notes,jsonb_build_object('school_year_id',_year))).school_year_id,coalesce(_data->>'recommendations',current_year.recommendations,''),coalesce(_data->>'counselor_notes',current_year.counselor_notes,''),coalesce(_data->'yearly_observations',current_year.yearly_observations,'[]'))
   ON CONFLICT(student_id,school_year_id,class_id) DO UPDATE SET recommendations=EXCLUDED.recommendations,counselor_notes=EXCLUDED.counselor_notes,yearly_observations=EXCLUDED.yearly_observations,updated_at=now();
  END IF;
  SELECT coalesce(to_jsonb(p),jsonb_build_object('student_id',_student,'class_id',_class,'school_year_id',_year,'yearly_observations','[]'::jsonb)) INTO result FROM (SELECT 1) q LEFT JOIN student_pedagogical_year_notes p ON p.student_id=_student AND p.class_id=_class AND p.school_year_id::text=_year;
  RETURN result;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.expert_workspace(_class text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT expert_actor() THEN RAISE EXCEPTION 'Pristup je namijenjen stručnim suradnicima.';END IF;
 IF _class IS NOT NULL AND NOT expert_class(_class) THEN RAISE EXCEPTION 'Razred nije dostupan vašoj školi.';END IF;
 RETURN jsonb_build_object(
 'schools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name),'[]') FROM schools s WHERE expert_school(s.id)),
 'classes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'school_id',c.school_id,'school_year_id',c.school_year_id,'year',coalesce(y.label,y.name)) ORDER BY c.name),'[]') FROM classes c LEFT JOIN school_years y ON y.id=c.school_year_id WHERE expert_class(c.id)),
 'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'class_id',e.class_id,'oib',coalesce(r.oib,p.oib),'dob',coalesce(r.date_of_birth,p.dob),'address',coalesce(r.address,p.address)) ORDER BY p.name),'[]') FROM student_class_enrollments e JOIN user_profiles p ON p.id=e.student_id LEFT JOIN registry_students r ON r.id=e.registry_student_id WHERE e.class_id=_class AND e.status='ACTIVE'),
 'subjects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name),'[]') FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=_class));
END $$;
CREATE OR REPLACE FUNCTION public.expert_role_ready() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure AS name FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'expert_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.name);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.expert_role_ready() TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON student_pedagogical_profiles,student_pedagogical_year_notes,pedagogical_measures,expert_service_activities TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
