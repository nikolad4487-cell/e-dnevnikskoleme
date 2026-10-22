-- Ordered workflow improvements; reuses existing requests, notifications and history.
BEGIN;
-- Include the idempotent principal activation so one new SQL file is sufficient.
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

ALTER TABLE family_absence_requests DROP CONSTRAINT IF EXISTS family_absence_requests_status_check;
ALTER TABLE family_absence_requests ADD CONSTRAINT family_absence_requests_status_check CHECK(status IN ('SUBMITTED','PROCESSED','CANCELLED','REJECTED'));
CREATE OR REPLACE FUNCTION public.family_reject_request(_id uuid,_version integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r family_absence_requests;
BEGIN
 SELECT * INTO r FROM family_absence_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR NOT portal_class_manager(r.class_id) OR r.status<>'SUBMITTED' OR r.version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Zahtjev nije dostupan ili je već promijenjen.';END IF;
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 5000 THEN RAISE EXCEPTION 'Navedite razlog odbijanja (3–5000 znakova).';END IF;
 UPDATE family_absence_requests SET status='REJECTED',teacher_note=trim(_reason),processed_by=portal_profile_id(),processed_at=now(),updated_at=now(),version=version+1 WHERE id=_id;
 INSERT INTO family_request_audit(request_id,actor_id,action,details) VALUES(_id,portal_profile_id(),'REJECT',jsonb_build_object('reason',trim(_reason)));
 INSERT INTO portal_notifications(user_id,title,body,link,request_id) VALUES(r.parent_id,'Zahtjev za izostanke je odbijen','Pročitajte obrazloženje razrednika.','/student/opravdavanje',_id);
END $$;
CREATE OR REPLACE FUNCTION public.portal_work_queue(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb:='[]';c record;n bigint;
BEGIN
 IF registrar_is_user() THEN
  IF registrar_require_school() IS DISTINCT FROM _school THEN RAISE EXCEPTION 'Ustanova nije dostupna.';END IF;
  SELECT count(*) INTO n FROM school_document_records WHERE school_id=_school AND status IN ('NACRT','SPREMNO','PRIPREMLJENO');
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','documents','title','Dokumenti čekaju izdavanje','count',n,'link','https://referada.skolehr.xyz/'));END IF;
  RETURN result;
 END IF;
 IF NOT portal_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY','EXPERT','PRINCIPAL')) THEN RAISE EXCEPTION 'Zadaci nisu dostupni za ovu školu.';END IF;
 FOR c IN SELECT id,name FROM classes WHERE school_id=_school AND portal_class_manager(id) LOOP
  SELECT count(*) INTO n FROM family_absence_requests WHERE class_id=c.id AND status='SUBMITTED';
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','absence-'||c.id,'title',c.name||' — zahtjevi za opravdavanje','count',n,'link','/class/'||c.id||'/zahtjevi-izostanaka'));END IF;
 END LOOP;
 IF registry_admin(_school) THEN
  SELECT count(*) INTO n FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE c.school_id=_school AND e.status='ACTIVE' AND (e.status_verified_at IS NULL OR nullif(trim(e.status_evidence),'') IS NULL);
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','schooling','title','Upisi bez provjerenog statusa školovanja','count',n,'link','https://e-matica.skolehr.xyz/'));END IF;
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.portal_mark_notification(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE portal_notifications SET is_read=true WHERE id=_id AND user_id=portal_profile_id() AND visible_at<=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Obavijest nije dostupna.';END IF;
END $$;
-- Audit all future academic changes in the existing immutable history.
CREATE OR REPLACE FUNCTION public.workflow_record_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;previous jsonb;school text;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW;END IF;
 school:=coalesce(nullif(j->>'school_id',''),portal_class_school(j->>'class_id'));
 IF school IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' THEN previous:=to_jsonb(OLD);END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data) VALUES(school,TG_TABLE_NAME,coalesce(j->>'id',j->>'student_id'),TG_OP,portal_profile_id(),previous,CASE WHEN TG_OP<>'DELETE' THEN j END);
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['grades','final_grades','absences','student_class_enrollments','school_document_records','classes','school_years'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS workflow_history ON %I',t);
  EXECUTE format('CREATE TRIGGER workflow_history AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION workflow_record_change()',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS workflow_history_no_update ON registry_change_log;
CREATE POLICY workflow_history_no_update ON registry_change_log AS RESTRICTIVE FOR UPDATE TO authenticated USING(false);
DROP POLICY IF EXISTS workflow_history_no_delete ON registry_change_log;
CREATE POLICY workflow_history_no_delete ON registry_change_log AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
CREATE OR REPLACE FUNCTION public.portal_history(_school text,_class text DEFAULT NULL,_before timestamptz DEFAULT NULL,_before_id bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='PRINCIPAL' AND status='ACTIVE' AND school_id=_school) AND NOT (_class IS NOT NULL AND portal_class_school(_class)=_school AND portal_class_manager(_class)) THEN RAISE EXCEPTION 'Nemate ovlasti za pregled povijesti.';END IF;
 IF _class IS NOT NULL AND portal_class_school(_class) IS DISTINCT FROM _school THEN RAISE EXCEPTION 'Razred ne pripada ustanovi.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT l.id,l.entity,l.entity_id,l.action,l.changed_at,l.before_data,l.after_data,p.name AS actor FROM registry_change_log l LEFT JOIN user_profiles p ON p.id=l.actor_id WHERE l.school_id=_school AND (_before IS NULL OR l.changed_at<_before OR l.changed_at=_before AND _before_id IS NOT NULL AND l.id<_before_id) AND (_class IS NULL OR l.before_data->>'class_id'=_class OR l.after_data->>'class_id'=_class OR l.entity IN ('CLASS','classes') AND l.entity_id=_class) ORDER BY l.changed_at DESC,l.id DESC LIMIT 100)x);
END $$;
ALTER TABLE school_years ADD COLUMN IF NOT EXISTS workflow_closed_at timestamptz;
ALTER TABLE school_years ADD COLUMN IF NOT EXISTS workflow_closed_by uuid REFERENCES user_profiles(id);
ALTER TABLE school_years ADD COLUMN IF NOT EXISTS workflow_closure_reason text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS workflow_year_lock boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.portal_year_readiness(_school text,_year uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record;e record;s record;v text;missing int;unassigned int;pupils int;pending int;requests int;result jsonb:='[]';blockers int:=0;y school_years;
BEGIN
 IF NOT registry_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='PRINCIPAL' AND status='ACTIVE' AND school_id=_school) THEN RAISE EXCEPTION 'Nemate ovlasti za pregled godine.';END IF;
 SELECT * INTO y FROM school_years WHERE id=_year AND school_id=_school;
 IF y.id IS NULL THEN RAISE EXCEPTION 'Školska godina ne pripada ustanovi.';END IF;
 FOR c IN SELECT * FROM classes WHERE school_id=_school AND school_year_id=_year LOOP
  missing:=0;unassigned:=0;pupils:=0;
  FOR e IN SELECT * FROM student_class_enrollments WHERE class_id=c.id AND status='ACTIVE' LOOP
   pupils:=pupils+1;
   IF NOT EXISTS(SELECT 1 FROM student_subject_enrollments WHERE student_id=e.student_id AND class_id=c.id AND status='ACTIVE') THEN unassigned:=unassigned+1;END IF;
   FOR s IN SELECT DISTINCT subject_id FROM student_subject_enrollments WHERE student_id=e.student_id AND class_id=c.id AND status='ACTIVE' LOOP
    SELECT g.value INTO v FROM final_grades g WHERE student_id=e.student_id AND class_id=c.id AND subject_id=s.subject_id AND upper(coalesce(term,period,'')) IN ('FINAL','YEAR','YEAR_END','GODINA','GODIŠNJA','2','2. POLUGODIŠTE','DRUGO_POLUGODISTE') ORDER BY date DESC,created_at DESC LIMIT 1;
    IF nullif(trim(v),'') IS NULL THEN SELECT grade_value INTO v FROM enrollment_final_grades WHERE student_id=e.student_id AND class_id=c.id AND subject_id=s.subject_id AND school_year_id=_year ORDER BY date DESC,created_at DESC LIMIT 1;END IF;
    IF nullif(trim(v),'') IS NULL THEN missing:=missing+1;END IF;
   END LOOP;
  END LOOP;
  SELECT count(*) INTO pending FROM absences WHERE class_id=c.id AND upper(status) IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU');
  SELECT count(*) INTO requests FROM family_absence_requests WHERE class_id=c.id AND status='SUBMITTED';
  blockers:=blockers+missing+unassigned+pending+requests;
  result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'pupils',pupils,'missingSubjects',unassigned,'missingFinalGrades',missing,'pendingAbsences',pending,'pendingRequests',requests,'locked',coalesce(c.is_locked,false)));
 END LOOP;
 RETURN jsonb_build_object('classes',result,'blockers',blockers,'canClose',jsonb_array_length(result)>0 AND blockers=0,'closedAt',y.workflow_closed_at,'reason',y.workflow_closure_reason);
END $$;
CREATE OR REPLACE FUNCTION public.portal_close_year(_school text,_year uuid,_reason text,_reopen boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE readiness jsonb;
BEGIN
 IF _reopen IS NULL OR NOT registry_admin(_school) OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Potrebne su administratorske ovlasti i obrazloženje (3–1000 znakova).';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||_year::text,0));
 readiness:=portal_year_readiness(_school,_year);
 IF NOT _reopen AND (readiness->>'canClose')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Najprije dovršite predmete, zaključne ocjene, izostanke i roditeljske zahtjeve.';END IF;
 IF _reopen THEN
  UPDATE school_years SET workflow_closed_at=NULL,workflow_closed_by=NULL,workflow_closure_reason=trim(_reason) WHERE id=_year AND school_id=_school;
  UPDATE classes SET is_locked=false,workflow_year_lock=false WHERE school_id=_school AND school_year_id=_year AND workflow_year_lock;
 ELSE
  UPDATE school_years SET workflow_closed_at=now(),workflow_closed_by=portal_profile_id(),workflow_closure_reason=trim(_reason) WHERE id=_year AND school_id=_school;
  UPDATE classes SET workflow_year_lock=workflow_year_lock OR NOT coalesce(is_locked,false),is_locked=true WHERE school_id=_school AND school_year_id=_year;
 END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data) VALUES(_school,'SCHOOL_YEAR',_year::text,CASE WHEN _reopen THEN 'REOPEN' ELSE 'CLOSE' END,portal_profile_id(),readiness,jsonb_build_object('reason',trim(_reason)));
 RETURN portal_year_readiness(_school,_year);
END $$;
CREATE OR REPLACE FUNCTION public.workflow_year_metadata_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ready jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.workflow_closed_at IS NOT NULL OR NEW.workflow_closed_by IS NOT NULL THEN RAISE EXCEPTION 'Novu godinu najprije kreirajte, a zatim provjerite prije zaključivanja.';END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(OLD)->'workflow_closed_at') IS DISTINCT FROM (to_jsonb(NEW)->'workflow_closed_at') OR OLD.workflow_closure_reason IS DISTINCT FROM NEW.workflow_closure_reason OR OLD.workflow_closed_by IS DISTINCT FROM NEW.workflow_closed_by THEN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id OR NOT registry_admin(OLD.school_id) OR length(trim(coalesce(NEW.workflow_closure_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Za promjenu zaključivanja potrebne su ovlasti i obrazloženje.';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||OLD.id::text,0));
  IF NEW.workflow_closed_at IS NOT NULL THEN
   ready:=portal_year_readiness(OLD.school_id,OLD.id);
   IF (ready->>'canClose')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Godina ima nedovršene podatke.';END IF;
   NEW.workflow_closed_by:=portal_profile_id();
  ELSE NEW.workflow_closed_by:=NULL;
  END IF;
 END IF;
 IF OLD.workflow_closed_at IS NOT NULL AND (NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.id IS DISTINCT FROM OLD.id) THEN RAISE EXCEPTION 'Zaključena godina ne može promijeniti ustanovu.';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_year_metadata ON school_years;
CREATE TRIGGER workflow_year_metadata BEFORE INSERT OR UPDATE ON school_years FOR EACH ROW EXECUTE FUNCTION workflow_year_metadata_guard();
CREATE OR REPLACE FUNCTION public.workflow_class_year_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM school_years WHERE id=OLD.school_year_id AND workflow_closed_at IS NOT NULL) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Razred zaključene godine ne može se obrisati.';END IF;
  IF NOT coalesce(NEW.is_locked,false) OR (to_jsonb(OLD)-ARRAY['is_locked','workflow_year_lock','updated_at','previous_class_id','next_class_id']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['is_locked','workflow_year_lock','updated_at','previous_class_id','next_class_id']) THEN RAISE EXCEPTION 'Podatke zaključene godine nije dopušteno premještati ili mijenjati.';END IF;
 END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM school_years WHERE id=NEW.school_year_id AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Nove razrede dodajte u otvorenu školsku godinu.';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DROP TRIGGER IF EXISTS workflow_class_year ON classes;
CREATE TRIGGER workflow_class_year BEFORE INSERT OR UPDATE OR DELETE ON classes FOR EACH ROW EXECUTE FUNCTION workflow_class_year_guard();
CREATE OR REPLACE FUNCTION public.workflow_year_lock_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb;y uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN
  j:=to_jsonb(OLD);SELECT school_year_id INTO y FROM classes WHERE id=j->>'class_id';
  IF y IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||y::text,0));
   IF EXISTS(SELECT 1 FROM school_years WHERE id=y AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Školsku godinu je potrebno najprije ponovno otvoriti uz obrazloženje.';END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  j:=to_jsonb(NEW);SELECT school_year_id INTO y FROM classes WHERE id=j->>'class_id';
  IF y IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||y::text,0));
   IF EXISTS(SELECT 1 FROM school_years WHERE id=y AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'U zaključenoj školskoj godini nije dopušten unos ili izmjena nastave.';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['grades','final_grades','absences','lessons','work_weeks'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS workflow_year_lock ON %I',t);
  EXECUTE format('CREATE TRIGGER workflow_year_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION workflow_year_lock_guard()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION family_reject_request(uuid,integer,text),portal_work_queue(text),portal_mark_notification(uuid),portal_history(text,text,timestamptz,bigint),portal_year_readiness(text,uuid),portal_close_year(text,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION family_reject_request(uuid,integer,text),portal_work_queue(text),portal_mark_notification(uuid),portal_history(text,text,timestamptz,bigint),portal_year_readiness(text,uuid),portal_close_year(text,uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.expert_write_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j jsonb;old_j jsonb;
BEGIN
 IF NOT expert_actor() OR auth.uid() IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME='portal_notifications' AND TG_OP='UPDATE' AND to_jsonb(OLD)->>'user_id'=portal_profile_id()::text AND (to_jsonb(OLD)-'is_read')=(to_jsonb(NEW)-'is_read') THEN RETURN NEW;END IF;
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
   IF (old_j-ARRAY['name','email','mobile','address','updated_at','active_school_id']) IS DISTINCT FROM (j-ARRAY['name','email','mobile','address','updated_at','active_school_id']) THEN RAISE EXCEPTION 'Vlastite ovlasti i postavke prijave mijenjajte samo kroz ovlašteni postupak.';END IF;
  ELSE
   IF (old_j-ARRAY['program_adjustment','updated_at']) IS DISTINCT FROM (j-ARRAY['program_adjustment','updated_at']) THEN RAISE EXCEPTION 'Dopuštena je samo pedagoška prilagodba programa učenika.';END IF;
   IF coalesce(j->>'program_adjustment','NONE') NOT IN ('NONE','REGULAR_WITH_ADAPTATION','REGULAR_WITH_INDIVIDUALIZATION') THEN RAISE EXCEPTION 'Odaberite valjanu pedagošku prilagodbu programa.';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
-- Legacy development UPDATE policies must never permit self-assignment of privileges.
CREATE OR REPLACE FUNCTION public.workflow_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb;previous jsonb;school text;old_school text;allowed text[]:=ARRAY['name','email','mobile','address','birthplace','pob','dob','father_name','mother_name','citizenship','birth_country','gender','updated_at'];
BEGIN
 IF auth.uid() IS NULL OR registry_global_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'DELETE' THEN j:=to_jsonb(NEW);END IF;
 IF TG_OP<>'INSERT' THEN previous:=to_jsonb(OLD);END IF;
 school:=coalesce(j->>'school_id',j->>'active_school_id');old_school:=coalesce(previous->>'school_id',previous->>'active_school_id');
 IF TG_TABLE_NAME='user_school_roles' THEN
  IF coalesce(j->>'role','') IN ('MAIN_ADMIN','SUPER_ADMIN') OR coalesce(previous->>'role','') IN ('MAIN_ADMIN','SUPER_ADMIN') OR coalesce(j->>'user_id',previous->>'user_id')=portal_profile_id()::text THEN RAISE EXCEPTION 'Nije dopušteno samostalno mijenjati vlastita ili globalna prava.';END IF;
  IF TG_OP<>'DELETE' AND NOT portal_admin(school) OR TG_OP<>'INSERT' AND NOT portal_admin(old_school) THEN RAISE EXCEPTION 'Prava dodjeljuje administrator pripadajuće ustanove.';END IF;
 ELSIF TG_OP='UPDATE' AND j->>'id'=portal_profile_id()::text THEN
  IF j->>'active_school_id' IS DISTINCT FROM previous->>'active_school_id' AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=j->>'active_school_id' AND status='ACTIVE') THEN RAISE EXCEPTION 'Aktivna škola nije dodijeljena vašem računu.';END IF;
  IF (j-(allowed||ARRAY['active_school_id'])) IS DISTINCT FROM (previous-(allowed||ARRAY['active_school_id'])) THEN RAISE EXCEPTION 'Vlastita prava i postavke prijave mijenjaju se kroz ovlašteni postupak.';END IF;
 ELSIF coalesce(j->>'role','') IN ('MAIN_ADMIN','SUPER_ADMIN') OR coalesce(previous->>'role','') IN ('MAIN_ADMIN','SUPER_ADMIN') OR upper(coalesce(j->>'access_role','')) IN ('MAIN_ADMIN','SUPER_ADMIN') OR upper(coalesce(previous->>'access_role','')) IN ('MAIN_ADMIN','SUPER_ADMIN') THEN RAISE EXCEPTION 'Globalni račun uređuje samo glavni administrator.';
 ELSIF TG_OP='UPDATE' AND ((j-(allowed||ARRAY['student_registry_number','program_adjustment'])) IS NOT DISTINCT FROM (previous-(allowed||ARRAY['student_registry_number','program_adjustment']))) AND EXISTS(SELECT 1 FROM student_class_enrollments WHERE student_id::text=j->>'id' AND portal_class_manager(class_id)) THEN RETURN NEW;
 ELSIF TG_OP='UPDATE' AND (j-ARRAY['program_adjustment','updated_at']) IS NOT DISTINCT FROM (previous-ARRAY['program_adjustment','updated_at']) AND expert_student(j->>'id') AND EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='EXPERT' AND status='ACTIVE') THEN RETURN NEW;
 ELSE
  IF TG_OP<>'DELETE' AND NOT portal_admin(school) OR TG_OP<>'INSERT' AND NOT portal_admin(old_school) THEN RAISE EXCEPTION 'Profil uređuje korisnik ili ovlaštena ustanova.';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DROP TRIGGER IF EXISTS workflow_identity ON user_profiles;
CREATE TRIGGER workflow_identity BEFORE INSERT OR UPDATE OR DELETE ON user_profiles FOR EACH ROW EXECUTE FUNCTION workflow_identity_guard();
DROP TRIGGER IF EXISTS workflow_identity ON user_school_roles;
CREATE TRIGGER workflow_identity BEFORE INSERT OR UPDATE OR DELETE ON user_school_roles FOR EACH ROW EXECUTE FUNCTION workflow_identity_guard();
-- Directory reads expose names and roles, never another staff member's PIN/TOTP.
CREATE OR REPLACE FUNCTION public.workflow_profile_visible(_person uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _person=portal_profile_id() OR registry_global_admin()
 OR EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=_person AND portal_admin(p.school_id)
  AND upper(coalesce(p.role,'')) NOT IN ('MAIN_ADMIN','SUPER_ADMIN') AND upper(coalesce(p.access_role,'')) NOT IN ('MAIN_ADMIN','SUPER_ADMIN')
  AND NOT EXISTS(SELECT 1 FROM user_school_roles r WHERE r.user_id=p.id AND r.status='ACTIVE' AND (r.role IN ('MAIN_ADMIN','SUPER_ADMIN') OR NOT portal_admin(r.school_id))))
 OR EXISTS(SELECT 1 FROM user_profiles p JOIN student_class_enrollments e ON e.student_id=p.id WHERE p.id=_person AND (p.role='STUDENT' OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=p.id AND role='STUDENT' AND status='ACTIVE')) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=p.id AND status='ACTIVE' AND role NOT IN ('STUDENT','PARENT')) AND e.status='ACTIVE' AND portal_student_reader(p.id,e.class_id))
$$;
DROP POLICY IF EXISTS workflow_profile_read ON user_profiles;
CREATE POLICY workflow_profile_read ON user_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING(workflow_profile_visible(id));
CREATE OR REPLACE FUNCTION public.portal_staff_directory(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE') AND NOT EXISTS(SELECT 1 FROM parent_child_relationships WHERE parent_id=portal_profile_id() AND school_id=_school) AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=portal_profile_id() AND e.status='ACTIVE' AND c.school_id=_school) THEN RAISE EXCEPTION 'Imenik ustanove nije dostupan.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.role,'user',jsonb_build_object('id',p.id,'auth_user_id',p.auth_user_id,'name',p.name,'role',p.role,'school_id',_school,'email',p.email)) ORDER BY p.name),'[]') FROM user_school_roles r JOIN user_profiles p ON p.id=r.user_id WHERE r.school_id=_school AND r.status='ACTIVE' AND r.role NOT IN ('STUDENT','PARENT','REGISTRAR'));
END $$;
CREATE OR REPLACE FUNCTION public.portal_class_names(_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_class_manager(_class) AND NOT EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND teacher_id=portal_profile_id()) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('EXPERT','PRINCIPAL')) AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.class_id=_class AND e.status='ACTIVE' AND (e.student_id=portal_profile_id() OR portal_linked(e.student_id,portal_class_school(_class)))) THEN RAISE EXCEPTION 'Popis učenika nije dostupan.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.name),'[]') FROM student_class_enrollments e JOIN user_profiles p ON p.id=e.student_id WHERE e.class_id=_class AND e.status='ACTIVE');
END $$;
REVOKE ALL ON FUNCTION workflow_profile_visible(uuid),portal_staff_directory(text),portal_class_names(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION workflow_profile_visible(uuid),portal_staff_directory(text),portal_class_names(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
