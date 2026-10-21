BEGIN;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS combined_grade_levels integer[];
ALTER TABLE classes ADD COLUMN IF NOT EXISTS education_group_label text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_continuation boolean NOT NULL DEFAULT false;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS teaching_language text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS teaching_model text;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS is_primary_program boolean NOT NULL DEFAULT false;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS education_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE student_education_records ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS subsidy_category text;
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS is_boarding boolean NOT NULL DEFAULT false;
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS is_special_transport boolean NOT NULL DEFAULT false;
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
ALTER TABLE student_transport_records ADD COLUMN IF NOT EXISTS benefit_evidence text;
ALTER TABLE weekly_assignments ADD COLUMN IF NOT EXISTS school_hours numeric;
ALTER TABLE weekly_assignments ADD COLUMN IF NOT EXISTS group_count integer;
ALTER TABLE weekly_assignments ADD COLUMN IF NOT EXISTS participant_count integer;
ALTER TABLE weekly_assignments ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES programs(id);
ALTER TABLE weekly_assignments ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE special_exams ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(id);
ALTER TABLE special_exams ADD COLUMN IF NOT EXISTS school_id text REFERENCES schools(id);
ALTER TABLE special_exams ADD COLUMN IF NOT EXISTS subject_id text REFERENCES subjects(id);
ALTER TABLE special_exams ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE special_exams ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES user_profiles(id);

CREATE FUNCTION public.registry_validate_linked_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=to_jsonb(NEW);s text:=j->>'school_id';student uuid:=nullif(j->>'registry_student_id','')::uuid;y uuid:=nullif(j->>'school_year_id','')::uuid;c text:=nullif(j->>'class_id','');p uuid:=nullif(j->>'program_id','')::uuid;
BEGIN
 IF s IS NULL OR (auth.uid() IS NOT NULL AND NOT registry_admin(s)) THEN RAISE EXCEPTION 'Odaberite ustanovu za koju imate ovlasti.';END IF;
 IF y IS NOT NULL AND NOT EXISTS(SELECT 1 FROM school_years WHERE id=y AND school_id=s) THEN RAISE EXCEPTION 'Školska godina ne pripada ustanovi.';END IF;
 IF c IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE id=c AND school_id=s AND (y IS NULL OR school_year_id=y)) THEN RAISE EXCEPTION 'Razred ne pripada ustanovi i godini.';END IF;
 IF p IS NOT NULL AND NOT EXISTS(SELECT 1 FROM programs WHERE id=p AND school_id=s) THEN RAISE EXCEPTION 'Program ne pripada ustanovi.';END IF;
 IF student IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes cl ON cl.id=e.class_id WHERE e.registry_student_id=student AND cl.school_id=s AND (c IS NULL OR cl.id=c) AND (y IS NULL OR cl.school_year_id=y)) AND NOT EXISTS(SELECT 1 FROM student_school_enrollments WHERE student_id=student AND school_id=s AND (y IS NULL OR school_year_id=y)) THEN RAISE EXCEPTION 'Učenik nema upis u odabranu ustanovu i godinu.';END IF;
 IF nullif(j->>'staff_profile_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=(j->>'staff_profile_id')::uuid AND school_id=s AND status='ACTIVE' AND role NOT IN ('STUDENT','PARENT')) THEN RAISE EXCEPTION 'Djelatnik nije povezan s ustanovom.';END IF;
 IF nullif(j->>'subject_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subjects WHERE id=j->>'subject_id' AND school_id=s) THEN RAISE EXCEPTION 'Predmet ne pripada ustanovi.';END IF;
 IF TG_TABLE_NAME='weekly_assignments' THEN
  IF NEW.class_id IS NOT NULL THEN
   SELECT count(DISTINCT student_id) INTO NEW.participant_count FROM student_class_enrollments WHERE class_id=NEW.class_id AND status='ACTIVE';
   IF NEW.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_subject_enrollments WHERE class_id=NEW.class_id AND subject_id=NEW.subject_id AND status='ACTIVE') AND NOT EXISTS(SELECT 1 FROM class_subjects WHERE class_id=NEW.class_id AND subject_id=NEW.subject_id) THEN RAISE EXCEPTION 'Predmet prvo pridružite učenicima ili odjelu u matičnoj evidenciji.';END IF;
  END IF;
  IF NEW.starts_on IS NULL OR NEW.ends_on<NEW.starts_on OR coalesce(NEW.weekly_hours,0)<0 OR coalesce(NEW.annual_hours,0)<0 OR coalesce(NEW.school_hours,0)<0 OR NEW.school_hours>NEW.annual_hours OR coalesce(NEW.group_count,0)<0 THEN RAISE EXCEPTION 'Provjerite razdoblje, satnicu i broj grupa.';END IF;
 ELSIF TG_TABLE_NAME='student_transport_records' THEN
  IF coalesce((j->>'distance_km')::numeric,0)<0 OR coalesce((j->>'price')::numeric,0)<0 THEN RAISE EXCEPTION 'Kilometraža i cijena ne mogu biti negativne.';END IF;
 END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['weekly_assignments','student_education_records','student_transport_records'] LOOP
  EXECUTE format('CREATE TRIGGER registry_links BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION registry_validate_linked_record()',t);
  EXECUTE format('CREATE POLICY registry_school_scope ON %I AS RESTRICTIVE FOR ALL TO authenticated USING(registry_admin(school_id)) WITH CHECK(registry_admin(school_id))',t);
 END LOOP;
END $$;
ALTER VIEW v_weekly_assignments_detailed SET(security_invoker=true);
ALTER VIEW v_student_education_records_detailed SET(security_invoker=true);
ALTER VIEW v_student_transport_records_detailed SET(security_invoker=true);

CREATE FUNCTION public.registry_student_enrollments(_student uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.school_year,q.created_at),'[]') FROM (
 SELECT e.*,c.school_id,c.name AS class_name,p.name AS program_name,coalesce(y.label,y.name,c.school_year) AS year_name
 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id LEFT JOIN school_years y ON y.id=c.school_year_id LEFT JOIN programs p ON p.id=coalesce(e.program_id,c.program_id)
 WHERE (e.registry_student_id=_student OR EXISTS(SELECT 1 FROM registry_students r WHERE r.id=_student AND r.ednevnik_student_id=e.student_id)) AND registry_admin(c.school_id))q);
END $$;
CREATE FUNCTION public.registry_save_education_details(_enrollment uuid,_primary boolean,_details jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e student_class_enrollments;c classes;
BEGIN
 SELECT * INTO e FROM student_class_enrollments WHERE id=_enrollment FOR UPDATE;SELECT * INTO c FROM classes WHERE id=e.class_id;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) THEN RAISE EXCEPTION 'Upis nije dostupan.';END IF;
 IF jsonb_typeof(_details)<>'object' OR octet_length(_details::text)>15000 THEN RAISE EXCEPTION 'Neispravni obrazovni podaci.';END IF;
 IF _primary THEN
  UPDATE student_class_enrollments x SET is_primary_program=false WHERE x.student_id=e.student_id AND x.school_year_id=e.school_year_id AND EXISTS(SELECT 1 FROM classes cl WHERE cl.id=x.class_id AND cl.school_id=c.school_id);
 END IF;
 UPDATE student_class_enrollments SET education_details=_details,is_primary_program=_primary,updated_at=now() WHERE id=_enrollment;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(c.school_id,'EDUCATION',_enrollment::text,'SAVE',portal_profile_id(),_details||jsonb_build_object('primary',_primary));
END $$;
CREATE FUNCTION public.registry_save_class_details(_class text,_variant text,_levels integer[],_group text,_continuation boolean,_language text,_model text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c classes;
BEGIN
 SELECT * INTO c FROM classes WHERE id=_class FOR UPDATE;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) THEN RAISE EXCEPTION 'Razred nije dostupan.';END IF;
 IF _variant NOT IN ('REGULAR','COMBINED','OOS') OR EXISTS(SELECT 1 FROM unnest(_levels) l WHERE l NOT BETWEEN 1 AND 8) OR (_variant='COMBINED' AND coalesce(cardinality(_levels),0)<2) OR (_variant='OOS' AND nullif(trim(_group),'') IS NULL) THEN RAISE EXCEPTION 'Provjerite vrstu razreda, razine i oznaku skupine.';END IF;
 UPDATE classes SET variant=_variant,combined_grade_levels=_levels,education_group_label=nullif(trim(_group),''),is_continuation=_continuation,teaching_language=_language,teaching_model=_model,updated_at=now() WHERE id=_class;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(c.school_id,'CLASS',_class,'SAVE_DETAILS',portal_profile_id(),jsonb_build_object('variant',_variant,'levels',_levels,'group',_group));
END $$;
CREATE FUNCTION public.registry_special_exams(_enrollment uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e student_class_enrollments;c classes;
BEGIN
 SELECT * INTO e FROM student_class_enrollments WHERE id=_enrollment;SELECT * INTO c FROM classes WHERE id=e.class_id;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) THEN RAISE EXCEPTION 'Upis nije dostupan.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM special_exams x WHERE student_id=e.student_id AND school_year_id=e.school_year_id AND (class_id=c.id OR (class_id IS NULL AND school_id=c.school_id)));
END $$;
CREATE FUNCTION public.registry_record_exam(_enrollment uuid,_subject text,_type text,_date date,_grade integer,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e student_class_enrollments;c classes;exam_subject_name text;previous text;result uuid;
BEGIN
 SELECT * INTO e FROM student_class_enrollments WHERE id=_enrollment FOR UPDATE;SELECT * INTO c FROM classes WHERE id=e.class_id;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) THEN RAISE EXCEPTION 'Upis nije dostupan.';END IF;
 SELECT name INTO exam_subject_name FROM subjects WHERE id=_subject AND school_id=c.school_id;
 IF exam_subject_name IS NULL OR _date IS NULL OR _grade IS NULL OR _grade NOT BETWEEN 1 AND 5 OR _type NOT IN ('DOPUNSKI_RAD','POPRAVNI','PREDMETNI','RAZREDNI','RAZLIKOVNI','DOPUNSKI') THEN RAISE EXCEPTION 'Provjerite vrstu, predmet, datum i ocjenu ispita.';END IF;
 SELECT value INTO previous FROM final_grades WHERE student_id=e.student_id AND class_id=c.id AND subject_id=_subject ORDER BY date DESC,created_at DESC LIMIT 1;
 IF _type='DOPUNSKI_RAD' AND coalesce(previous,'') NOT IN ('1','Nedovoljan','nedovoljan') THEN RAISE EXCEPTION 'Dopunski rad može se evidentirati uz zaključnu ocjenu nedovoljan.';END IF;
 IF _type='POPRAVNI' AND NOT EXISTS(SELECT 1 FROM special_exams WHERE student_id=e.student_id AND school_year_id=e.school_year_id AND subject_name=exam_subject_name AND exam_type='DOPUNSKI_RAD' AND grade=1) THEN RAISE EXCEPTION 'Prije popravnog ispita mora biti evidentiran neuspješan dopunski rad.';END IF;
 IF _type IN ('PREDMETNI','RAZREDNI') AND lower(coalesce(previous,'')) NOT IN ('neocijenjen','neocijenjena','n') THEN RAISE EXCEPTION 'Predmetni / razredni ispit evidentira se uz status neocijenjen.';END IF;
 INSERT INTO special_exams(student_id,school_year_id,class_id,school_id,subject_id,subject_name,exam_type,exam_date,grade,note,recorded_by) VALUES(e.student_id,e.school_year_id,c.id,c.school_id,_subject,exam_subject_name,_type,_date,_grade,_note,portal_profile_id()) RETURNING id INTO result;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(c.school_id,'EXAM',result::text,'CREATE',portal_profile_id(),jsonb_build_object('type',_type,'grade',_grade,'date',_date));RETURN result;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('registry_student_enrollments','registry_save_education_details','registry_save_class_details','registry_special_exams','registry_record_exam') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END LOOP;END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
