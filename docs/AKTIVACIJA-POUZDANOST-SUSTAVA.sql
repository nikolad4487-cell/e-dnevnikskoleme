-- Aktivacija nakon prethodno aktiviranih školskih usluga.
BEGIN;
-- Follow-up for the existing document request workflow. No parallel request table.

ALTER TABLE school_document_requests DROP CONSTRAINT IF EXISTS school_document_requests_status_check;
ALTER TABLE school_document_requests ADD CONSTRAINT school_document_requests_status_check
 CHECK(status IN ('SUBMITTED','PROCESSING','NEEDS_INFORMATION','ISSUED','REJECTED'));
CREATE OR REPLACE FUNCTION services_handle_request(_id uuid,_status text,_note text,_document uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;school text;d school_document_records;
BEGIN
 school:=registrar_require_school();SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM school OR (_status IS NULL OR _status NOT IN ('PROCESSING','NEEDS_INFORMATION','ISSUED','REJECTED')) OR length(coalesce(_note,''))>2000 OR r.status IN ('ISSUED','REJECTED') OR (_status IN ('REJECTED','NEEDS_INFORMATION') AND length(trim(coalesce(_note,'')))<3) THEN RAISE EXCEPTION 'Zahtjev nije dostupan ili provjerite status i obrazloženje.';END IF;
 IF _status='ISSUED' THEN SELECT * INTO d FROM school_document_records WHERE id=_document;IF d.id IS NULL OR d.student_id IS DISTINCT FROM r.student_id OR d.school_id IS DISTINCT FROM school OR d.class_id IS DISTINCT FROM r.class_id OR d.status<>'IZDANO' OR d.pdf_path IS NULL THEN RAISE EXCEPTION 'Odaberite već izdani dokument ovog učenika i razreda.';END IF;END IF;
 UPDATE school_document_requests SET status=_status,note=coalesce(_note,''),document_id=CASE WHEN _status='ISSUED' THEN _document END,handled_by=portal_profile_id(),updated_at=now() WHERE id=_id;
 PERFORM services_audit(r.class_id,'DOCUMENT_REQUEST',_id::text,_status,to_jsonb(r),jsonb_build_object('status',_status,'document_id',_document,'note',_note));INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(r.requested_by,r.student_id,r.class_id,
 'Zahtjev referadi: '||CASE _status WHEN 'PROCESSING' THEN 'U obradi' WHEN 'NEEDS_INFORMATION' THEN 'Potrebna dopuna' WHEN 'ISSUED' THEN 'Spremno za preuzimanje' ELSE 'Odbijeno' END,
 left(coalesce(_note,''),250),'/student/skolske-usluge?tab=requests&request='||r.id::text);
END $$;

-- The current UI supplies the observed timestamp to reject stale decisions.
CREATE OR REPLACE FUNCTION services_review_request(_id uuid,_status text,_note text,_document uuid,_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests; school text;
BEGIN
 school:=registrar_require_school();
 SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM school OR r.updated_at IS DISTINCT FROM _updated_at THEN
  RAISE EXCEPTION 'Zahtjev je promijenjen ili nije dostupan. Osvježite prikaz.';
 END IF;
 PERFORM services_handle_request(_id,_status,_note,_document);
END $$;
CREATE OR REPLACE FUNCTION services_supplement_request(_id uuid,_purpose text,_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;
BEGIN
 SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.requested_by IS DISTINCT FROM portal_profile_id()
  OR NOT services_pupil(r.class_id,r.student_id) OR r.status<>'NEEDS_INFORMATION'
  OR r.updated_at IS DISTINCT FROM _updated_at THEN
  RAISE EXCEPTION 'Zahtjev je promijenjen ili nije dostupan za dopunu. Osvježite prikaz.';
 END IF;
 IF length(trim(coalesce(_purpose,''))) NOT BETWEEN 3 AND 2000 THEN
  RAISE EXCEPTION 'Dopuna treba sadržavati od 3 do 2000 znakova.';
 END IF;
 UPDATE school_document_requests SET purpose=trim(_purpose),status='SUBMITTED',document_id=NULL,updated_at=now() WHERE id=_id;
 PERFORM services_audit(r.class_id,'DOCUMENT_REQUEST',_id::text,'SUPPLEMENT',to_jsonb(r),
  jsonb_build_object('status','SUBMITTED','purpose',trim(_purpose),'note',r.note));
END $$;
REVOKE ALL ON FUNCTION services_review_request(uuid,text,text,uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION services_supplement_request(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION services_review_request(uuid,text,text,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION services_supplement_request(uuid,text,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Durable replacement for the legacy JSON-only fallback, not a replacement for canonical registry tables.

CREATE TABLE IF NOT EXISTS school_auxiliary_records(
 collection text NOT NULL,id text NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 school_id text NOT NULL REFERENCES schools(id),class_id text REFERENCES classes(id),student_id uuid REFERENCES user_profiles(id),
 updated_by uuid REFERENCES user_profiles(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(collection,id));
CREATE INDEX IF NOT EXISTS school_aux_student ON school_auxiliary_records(collection,student_id,id);
CREATE INDEX IF NOT EXISTS school_aux_class ON school_auxiliary_records(collection,class_id,id);
CREATE INDEX IF NOT EXISTS school_aux_school ON school_auxiliary_records(school_id,collection,id);
ALTER TABLE school_auxiliary_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON school_auxiliary_records FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION school_aux_collections() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['lektire','pedagoska_dokumentacija','student_pedagogical_profiles','student_pedagogical_year_notes','daily_notes','overall_success_audit_logs','practicum_placements','practicum_logs','practicum_evaluations','student_registrations','student_transfers','competitions','payments','final_exam_defense_schedule','final_exam_defense_commission_members','matura_registrations','matura_settings','matura_exam_schedule','matura_results','matura_objections','matura_study_applications','matura_study_programs','ematica_sync_runs','ematica_student_records','school_events','school_documents','system_audit_logs']::text[] $$;
CREATE OR REPLACE FUNCTION school_aux_scope(_collection text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE school text:=nullif(_data->>'school_id','');cls text:=coalesce(nullif(_data->>'class_id',''),nullif(_data->>'former_class_id',''),nullif(_data->>'new_class_id',''));pupil uuid:=nullif(_data->>'student_id','')::uuid;actual text;parent school_auxiliary_records; matches int;
BEGIN
 IF nullif(_data->>'schedule_id','') IS NOT NULL THEN
  SELECT * INTO parent FROM school_auxiliary_records WHERE collection='final_exam_defense_schedule' AND id=_data->>'schedule_id';
  IF parent.id IS NULL THEN RAISE EXCEPTION 'Raspored obrane nije dostupan u ovoj evidenciji.';END IF;
  IF school IS NOT NULL AND school IS DISTINCT FROM parent.school_id OR cls IS NOT NULL AND cls IS DISTINCT FROM parent.class_id THEN RAISE EXCEPTION 'Povjerenstvo ne pripada ustanovi ili razredu.';END IF;
  school:=parent.school_id;cls:=parent.class_id;
 END IF;
 IF nullif(_data->>'placement_id','') IS NOT NULL THEN
  SELECT * INTO parent FROM school_auxiliary_records WHERE collection='practicum_placements' AND id=_data->>'placement_id';
  IF parent.id IS NULL OR pupil IS DISTINCT FROM parent.student_id THEN RAISE EXCEPTION 'Praksa ne pripada učeniku.';END IF;
  IF school IS NOT NULL AND school IS DISTINCT FROM parent.school_id OR cls IS NOT NULL AND cls IS DISTINCT FROM parent.class_id THEN RAISE EXCEPTION 'Praksa ne pripada ustanovi ili razredu.';END IF;
  school:=parent.school_id;cls:=parent.class_id;
 END IF;
 IF cls IS NULL AND pupil IS NOT NULL THEN
  SELECT count(*),min(c.id) INTO matches,cls FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=pupil AND e.status='ACTIVE' AND (school IS NULL OR c.school_id=school);
  IF matches<>1 THEN RAISE EXCEPTION 'Odaberite nedvosmislen razred učenika.';END IF;
 END IF;
 IF cls IS NOT NULL THEN
  SELECT school_id INTO actual FROM classes WHERE id=cls;
  IF actual IS NULL OR school IS NOT NULL AND school IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Razred ne pripada ustanovi.';END IF;school:=actual;
  IF pupil IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=cls AND student_id=pupil) THEN RAISE EXCEPTION 'Učenik ne pripada razredu.';END IF;
 END IF;
 IF school IS NULL OR NOT EXISTS(SELECT 1 FROM schools WHERE id=school) THEN RAISE EXCEPTION 'Nedostaje provjerljiva ustanova zapisa.';END IF;
 RETURN jsonb_build_object('school',school,'class',cls,'student',pupil);
END $$;
CREATE OR REPLACE FUNCTION school_aux_allowed(_collection text,_school text,_class text,_student uuid,_write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF portal_profile_id() IS NULL OR NOT _collection=ANY(school_aux_collections()) THEN RETURN false;END IF;
 IF portal_admin(_school) THEN RETURN true;END IF;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE') AND NOT (_student IS NOT NULL AND portal_linked(_student,_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='INACTIVE')) THEN RETURN false;END IF;
 IF _collection IN ('student_pedagogical_profiles','student_pedagogical_year_notes','pedagoska_dokumentacija','system_audit_logs','ematica_sync_runs','ematica_student_records') THEN RETURN false;END IF;
 IF _collection IN ('school_documents','final_exam_defense_commission_members','daily_notes','overall_success_audit_logs') AND NOT _write THEN RETURN _class IS NOT NULL AND portal_class_manager(_class);END IF;
 IF _write THEN RETURN _class IS NOT NULL AND services_manager(_class) AND _collection NOT IN ('matura_settings','matura_exam_schedule','matura_study_programs','student_registrations','student_transfers');END IF;
 IF _collection IN ('payments','practicum_placements','practicum_logs','practicum_evaluations','competitions') AND _student IS NOT NULL THEN RETURN portal_class_manager(_class) OR portal_profile_id()=_student OR portal_linked(_student,_school);END IF;
 IF _student IS NOT NULL THEN RETURN _class IS NOT NULL AND portal_student_reader(_student,_class);END IF;
 RETURN EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE') OR EXISTS(SELECT 1 FROM parent_child_relationships WHERE parent_id=portal_profile_id() AND school_id=_school);
END $$;
CREATE OR REPLACE FUNCTION school_aux_snapshot(_collections text[] DEFAULT NULL,_student uuid DEFAULT NULL,_class text DEFAULT NULL,_school text DEFAULT NULL,_record_id text DEFAULT NULL,_placement text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb:='{}';c text;items jsonb;
BEGIN
 IF portal_profile_id() IS NULL THEN RAISE EXCEPTION 'Prijava je obavezna.';END IF;
 FOREACH c IN ARRAY school_aux_collections() LOOP
  IF _collections IS NOT NULL AND NOT c=ANY(_collections) THEN result:=result||jsonb_build_object(c,'[]'::jsonb);CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(q.data ORDER BY q.id),'[]') INTO items FROM (SELECT id,data FROM school_auxiliary_records WHERE collection=c AND school_aux_allowed(collection,school_id,class_id,student_id)
   AND (_school IS NULL OR school_id=_school) AND (_class IS NULL OR class_id=_class OR class_id IS NULL) AND (_student IS NULL OR student_id=_student OR student_id IS NULL)
   AND (_record_id IS NULL OR id=_record_id OR data->>'schedule_id'=_record_id OR c='matura_settings') AND (_placement IS NULL OR data->>'placement_id'=_placement OR id=_placement) ORDER BY id LIMIT 10001) q;
  IF jsonb_array_length(items)>10000 THEN RAISE EXCEPTION 'Evidencija zahtijeva straničenje prije daljnjeg rada.';END IF;
  result:=result||jsonb_build_object(c,items);
 END LOOP;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION school_aux_commit(_changes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE change jsonb;c text;key text;before_row jsonb;after_row jsonb;stored school_auxiliary_records;scope jsonb;diff record;
BEGIN
 IF portal_profile_id() IS NULL OR jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes)>28 THEN RAISE EXCEPTION 'Neispravan zahtjev za spremanje.';END IF;
 -- A fixed lock order makes multi-collection writes atomic without lost updates or deadlocks.
 FOR c IN SELECT DISTINCT x->>'collection' FROM jsonb_array_elements(_changes) x ORDER BY 1 LOOP PERFORM pg_advisory_xact_lock(hashtextextended('school-aux:'||c,0));END LOOP;
 FOR change IN SELECT value FROM jsonb_array_elements(_changes) LOOP
  c:=change->>'collection';IF c IS NULL OR NOT c=ANY(school_aux_collections()) OR jsonb_typeof(change->'before') IS DISTINCT FROM 'array' OR jsonb_typeof(change->'after') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Nepoznata evidencija.';END IF;
  IF jsonb_array_length(change->'before')>10000 OR jsonb_array_length(change->'after')>10000 THEN RAISE EXCEPTION 'Prevelika evidencija.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(change->'after') x GROUP BY x->>'id' HAVING count(*)>1 OR x->>'id' IS NULL) OR EXISTS(SELECT 1 FROM jsonb_array_elements(change->'before') x GROUP BY x->>'id' HAVING count(*)>1 OR x->>'id' IS NULL) THEN RAISE EXCEPTION 'Neispravni identifikatori.';END IF;
  FOR diff IN SELECT coalesce(b.v->>'id',a.v->>'id') AS key,b.v AS old_value,a.v AS new_value FROM jsonb_array_elements(change->'before') b(v) FULL JOIN jsonb_array_elements(change->'after') a(v) ON b.v->>'id'=a.v->>'id' WHERE b.v IS DISTINCT FROM a.v LOOP
   key:=diff.key;before_row:=diff.old_value;after_row:=diff.new_value;
   IF before_row IS NOT DISTINCT FROM after_row THEN CONTINUE;END IF;
   IF length(key) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Neispravan identifikator.';END IF;
   SELECT * INTO stored FROM school_auxiliary_records WHERE collection=c AND id=key FOR UPDATE;
   IF stored.data IS DISTINCT FROM before_row THEN RAISE EXCEPTION 'Zapis je promijenjen. Osvježite prikaz.' USING ERRCODE='40001';END IF;
   IF before_row IS NOT NULL AND NOT school_aux_allowed(c,stored.school_id,stored.class_id,stored.student_id,true) THEN RAISE EXCEPTION 'Nemate ovlasti za promjenu zapisa.';END IF;
   IF c IN ('overall_success_audit_logs','system_audit_logs','student_registrations','student_transfers','ematica_sync_runs') AND before_row IS NOT NULL THEN RAISE EXCEPTION 'Povijesni zapis se ne prepisuje niti briše.';END IF;
   IF after_row IS NOT NULL THEN
    scope:=school_aux_scope(c,after_row);
    IF NOT school_aux_allowed(c,scope->>'school',scope->>'class',(scope->>'student')::uuid,true) THEN RAISE EXCEPTION 'Nemate ovlasti za odredište zapisa.';END IF;
    IF before_row IS NOT NULL AND (scope->>'school' IS DISTINCT FROM stored.school_id OR scope->>'class' IS DISTINCT FROM stored.class_id OR (scope->>'student')::uuid IS DISTINCT FROM stored.student_id) THEN RAISE EXCEPTION 'Identitet i pripadnost zapisa ne mogu se prepisati.';END IF;
    IF c='payments' AND (jsonb_typeof(after_row->'amount') IS DISTINCT FROM 'number' OR round((after_row->>'amount')::numeric,2) IS DISTINCT FROM (after_row->>'amount')::numeric OR coalesce((after_row->>'amount')::numeric,0)<=0 OR after_row->>'status' IS NULL OR after_row->>'status' NOT IN ('PLAĆENO','DJELOMIČNO PLAĆENO','NIJE PLAĆENO') OR length(trim(coalesce(after_row->>'purpose','')))=0) THEN RAISE EXCEPTION 'Provjerite iznos, svrhu i status uplate.';END IF;
    IF c='practicum_logs' AND (coalesce((after_row->>'hours_worked')::numeric,-1)<0 OR (after_row->>'hours_worked')::numeric>24) THEN RAISE EXCEPTION 'Sati prakse moraju biti između 0 i 24.';END IF;
    IF c='practicum_evaluations' AND EXISTS(SELECT 1 FROM unnest(ARRAY['engagement_grade','expertise_grade','communication_grade','final_grade']) field WHERE coalesce((after_row->>field)::numeric,0) NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Unesite stvarne ocjene prakse od 1 do 5.';END IF;
    INSERT INTO school_auxiliary_records(collection,id,data,school_id,class_id,student_id,updated_by) VALUES(c,key,after_row,scope->>'school',scope->>'class',(scope->>'student')::uuid,portal_profile_id()) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   ELSE
    IF c='practicum_placements' AND EXISTS(SELECT 1 FROM school_auxiliary_records WHERE collection IN ('practicum_logs','practicum_evaluations') AND data->>'placement_id'=key) THEN RAISE EXCEPTION 'Praksa ima povezane zapise; najprije provjerite njihovo čuvanje.';END IF;
    DELETE FROM school_auxiliary_records WHERE collection=c AND id=key;scope:=jsonb_build_object('school',stored.school_id);END IF;
   INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data) VALUES(scope->>'school','AUXILIARY:'||c,key,CASE WHEN before_row IS NULL THEN 'INSERT' WHEN after_row IS NULL THEN 'DELETE' ELSE 'UPDATE' END,portal_profile_id(),before_row,after_row);
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION school_aux_scope(text,jsonb),school_aux_allowed(text,text,text,uuid,boolean),school_aux_collections(),school_aux_snapshot(text[],uuid,text,text,text,text),school_aux_commit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION school_aux_snapshot(text[],uuid,text,text,text,text),school_aux_commit(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';


CREATE TABLE IF NOT EXISTS system_recovery_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN ('BACKUP','RESTORE')),succeeded boolean NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),artifact_id text NOT NULL,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),details text NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS recovery_evidence_latest ON system_recovery_evidence(kind,checked_at DESC);
CREATE INDEX IF NOT EXISTS portal_notifications_center ON portal_notifications(user_id,is_read,created_at DESC,id DESC);
ALTER TABLE system_recovery_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON system_recovery_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON system_recovery_evidence TO service_role;
CREATE OR REPLACE FUNCTION school_system_readiness(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_admin(_school) THEN RAISE EXCEPTION 'Pregled je dostupan administratoru vlastite ustanove.';END IF;
 RETURN jsonb_build_object('checked_at',now(),'database',true,'authenticated',portal_profile_id() IS NOT NULL,
 'notifications',to_regclass('public.portal_notifications') IS NOT NULL,
 'durable_storage',to_regprocedure('public.school_aux_commit(jsonb)') IS NOT NULL,
 'request_supplements',to_regprocedure('public.services_supplement_request(uuid,text,timestamptz)') IS NOT NULL,
 'backup',(SELECT to_jsonb(e) FROM system_recovery_evidence e WHERE kind='BACKUP' ORDER BY checked_at DESC LIMIT 1),
 'restore',(SELECT to_jsonb(e) FROM system_recovery_evidence e WHERE kind='RESTORE' ORDER BY checked_at DESC LIMIT 1),
 'qualified_sealing_connected',false);
END $$;
CREATE OR REPLACE FUNCTION school_data_quality(_school text,_after uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT registry_admin(_school) THEN RAISE EXCEPTION 'Pregled je dostupan administratoru vlastite ustanove.';END IF;
 RETURN (WITH pupils AS(
 SELECT e.id,e.student_id,e.registry_student_id,e.class_id,c.name AS class_name,coalesce(nullif(concat_ws(' ',r.first_name,r.last_name),''),p.name) AS name,
 array_remove(ARRAY[
 CASE WHEN nullif(trim(coalesce(nullif(r.address,''),p.address)), '') IS NULL THEN 'ADDRESS' END,
 CASE WHEN coalesce(r.date_of_birth,p.dob) IS NULL THEN 'DOB' END,
 CASE WHEN coalesce(e.program_id,c.program_id) IS NULL THEN 'PROGRAM' END,
 CASE WHEN e.attendance_mode IS NULL OR e.status_verified_at IS NULL OR nullif(trim(e.status_evidence),'') IS NULL THEN 'SCHOOLING_STATUS' END,
 CASE WHEN e.registry_student_id IS NULL THEN 'REGISTRY_LINK' END,
 CASE WHEN coalesce(r.date_of_birth,p.dob)>(services_today()-interval '18 years')::date AND NOT EXISTS(SELECT 1 FROM parent_child_relationships WHERE child_id=e.student_id AND school_id=_school) THEN 'GUARDIAN' END
 ],NULL) AS missing
 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id JOIN user_profiles p ON p.id=e.student_id LEFT JOIN registry_students r ON r.id=e.registry_student_id
 WHERE c.school_id=_school AND e.status='ACTIVE' AND (_after IS NULL OR e.id>_after)
 ), page AS(SELECT * FROM pupils WHERE cardinality(missing)>0 ORDER BY id LIMIT 101)
 SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY id),'[]') FROM page);
END $$;
CREATE OR REPLACE FUNCTION school_student_history(_student uuid,_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE school text:=portal_class_school(_class);
BEGIN
 IF school IS NULL OR NOT portal_student_reader(_student,_class) OR NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student) THEN RAISE EXCEPTION 'Povijest učenika nije dostupna.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_id',_student,'action_type',x.action,'date',x.changed_at,'reason',coalesce(x.after_data->>'reason',x.after_data->>'status_evidence',x.after_data->>'evidence',''),'details',x.entity,'registered_by',coalesce(p.name,'Sustav / akter nije zabilježen')) ORDER BY x.changed_at DESC,x.id DESC),'[]') FROM (SELECT l.* FROM registry_change_log l WHERE l.school_id=school AND l.entity IN ('ENROLLMENT','student_class_enrollments','PROGRAM_CHANGE') AND (l.entity_id IN (SELECT id::text FROM student_class_enrollments WHERE student_id=_student AND class_id=_class) OR l.after_data->>'student_id'=_student::text OR l.before_data->>'student_id'=_student::text) ORDER BY l.changed_at DESC,l.id DESC LIMIT 100) x LEFT JOIN user_profiles p ON p.id=x.actor_id);
END $$;
REVOKE ALL ON FUNCTION school_student_history(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION school_student_history(uuid,text) TO authenticated;
-- Common events carry the class, child and the correct services tab.
CREATE OR REPLACE FUNCTION services_notify(_user uuid,_title text,_class text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tab text;child record;family boolean:=false;
BEGIN
 IF _user IS NULL OR _user=portal_profile_id() THEN RETURN;END IF;
 tab:=CASE WHEN _title ILIKE '%poruk%' THEN 'messages' WHEN _title ILIKE '%suglasnost%' THEN 'consents' WHEN _title ILIKE '%informacij%' THEN 'meetings' WHEN _title ILIKE '%ispit%' THEN 'exams' WHEN _title ILIKE '%raspored%' THEN 'schedule' ELSE 'requests' END;
 FOR child IN SELECT DISTINCT e.student_id FROM student_class_enrollments e WHERE e.class_id=_class AND e.status='ACTIVE' AND (e.student_id=_user OR EXISTS(SELECT 1 FROM parent_child_relationships p WHERE p.parent_id=_user AND p.child_id=e.student_id AND p.school_id=portal_class_school(_class))) LOOP
  family:=true;INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,child.student_id,_class,_title,'Otvorite pripadajući postupak za detalje.','/student/skolske-usluge?tab='||tab);
 END LOOP;
 IF NOT family THEN INSERT INTO portal_notifications(user_id,class_id,title,body,link) VALUES(_user,_class,_title,'Otvorite pripadajući postupak za detalje.','/class/'||_class||'/skolske-usluge?tab='||tab);END IF;
END $$;
REVOKE ALL ON FUNCTION services_notify(uuid,text,text),school_system_readiness(text),school_data_quality(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION school_system_readiness(text),school_data_quality(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION services_notify_target(_user uuid,_title text,_class text,_tab text,_target uuid,_student uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE child record;family boolean:=false;target text:='?tab='||_tab||'&item='||_target::text;
BEGIN
 IF _user IS NULL OR _user=portal_profile_id() THEN RETURN;END IF;
 IF _tab='messages' THEN target:=target||'&thread='||_target::text;END IF;
 FOR child IN SELECT DISTINCT e.student_id FROM student_class_enrollments e WHERE e.class_id=_class AND e.status='ACTIVE' AND (_student IS NULL OR e.student_id=_student) AND (e.student_id=_user OR EXISTS(SELECT 1 FROM parent_child_relationships p WHERE p.parent_id=_user AND p.child_id=e.student_id AND p.school_id=portal_class_school(_class))) LOOP
  family:=true;INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,child.student_id,_class,_title,'Otvorite pripadajući postupak za detalje.','/student/skolske-usluge'||target);
 END LOOP;
 IF NOT family THEN INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,_student,_class,_title,'Otvorite pripadajući postupak za detalje.','/class/'||_class||'/skolske-usluge'||target);END IF;
END $$;
CREATE OR REPLACE FUNCTION services_notification_thread(_group uuid,_class text,_student uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT services_chat_access(_group) OR NOT EXISTS(SELECT 1 FROM chat_groups WHERE id=_group AND class_id=_class AND (_student IS NULL OR family_student_id=_student)) THEN RAISE EXCEPTION 'Razgovor ne pripada odabranom učeniku ili razredu.';END IF;RETURN _group;
END $$;
REVOKE ALL ON FUNCTION services_notify_target(uuid,text,text,text,uuid,uuid),services_notification_thread(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION services_notification_thread(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION services_send(_group uuid,_text text,_file jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;p text;g chat_groups;r uuid;
BEGIN
 IF NOT services_chat_access(_group) OR length(trim(coalesce(_text,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Razgovor nije dostupan ili je poruka prazna/preduga.';END IF;
 IF _file IS NOT NULL THEN p:=_file->>'path';IF split_part(p,'/',1)<>portal_profile_id()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='family-files' AND name=p) OR length(_file->>'name') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Prilog nije dostupan.';END IF;END IF;
 INSERT INTO messages(group_id,sender_id,text,content,timestamp) VALUES(_group,portal_profile_id(),trim(_text),trim(_text),now()) RETURNING id INTO result;
 IF _file IS NOT NULL THEN INSERT INTO message_attachments(message_id,file_url,file_name,file_type,file_size) VALUES(result,'family-files/'||p,_file->>'name',_file->>'type',(_file->>'size')::int);END IF;
 SELECT * INTO g FROM chat_groups WHERE id=_group;
 FOR r IN SELECT DISTINCT id FROM user_profiles WHERE id=g.family_parent_id OR id IN (SELECT homeroom_teacher_id FROM classes WHERE id=g.class_id UNION SELECT deputy_teacher_id FROM classes WHERE id=g.class_id) LOOP PERFORM services_notify_target(r,'Nova poruka roditelja / razrednika',g.class_id,'messages',_group,g.family_student_id);END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_consent(_class text,_title text,_description text,_deadline timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF NOT services_manager(_class) OR length(trim(_title)) NOT BETWEEN 3 AND 200 OR length(trim(_description)) NOT BETWEEN 3 AND 10000 OR _deadline IS NULL OR _deadline<=now() THEN RAISE EXCEPTION 'Provjerite ovlasti, opis i budući rok suglasnosti.';END IF;
 INSERT INTO school_consents(class_id,title,description,deadline,created_by) VALUES(_class,trim(_title),trim(_description),_deadline,portal_profile_id()) RETURNING id INTO result;
 FOR r IN SELECT DISTINCT parent_id FROM parent_child_relationships p JOIN student_class_enrollments e ON e.student_id=p.child_id WHERE e.class_id=_class AND e.status='ACTIVE' AND p.school_id=portal_class_school(_class) LOOP PERFORM services_notify_target(r,'Nova suglasnost za roditelja',_class,'consents',result);END LOOP;
 PERFORM services_audit(_class,'CONSENT',result::text,'CREATE',NULL,jsonb_build_object('title',_title,'deadline',_deadline));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_book_meeting(_id uuid,_student uuid,_cancel boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s family_meeting_slots;b family_meeting_bookings;
BEGIN
 SELECT * INTO s FROM family_meeting_slots WHERE id=_id FOR UPDATE;SELECT * INTO b FROM family_meeting_bookings WHERE slot_id=_id;
 IF s.id IS NULL OR s.starts_at<=now() OR s.cancelled_at IS NOT NULL OR _cancel IS NULL THEN RAISE EXCEPTION 'Termin nije dostupan.';END IF;
 IF _cancel THEN
  IF b.parent_id IS DISTINCT FROM portal_profile_id() AND NOT services_manager(s.class_id) THEN RAISE EXCEPTION 'Rezervacija nije vaša.';END IF;DELETE FROM family_meeting_bookings WHERE slot_id=_id;
  PERFORM services_notify_target(s.host_id,'Rezervacija informacija je otkazana',s.class_id,'meetings',_id,b.student_id);PERFORM services_notify_target(b.parent_id,'Rezervacija informacija je otkazana',s.class_id,'meetings',_id,b.student_id);
 ELSE
  IF b.slot_id IS NOT NULL OR NOT services_pupil(s.class_id,_student) OR NOT portal_linked(_student,portal_class_school(s.class_id)) THEN RAISE EXCEPTION 'Termin je zauzet ili dijete nije povezano.';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meeting-parent:'||portal_profile_id()::text,0));
  IF EXISTS(SELECT 1 FROM family_meeting_bookings booked_rows JOIN family_meeting_slots x ON x.id=booked_rows.slot_id WHERE booked_rows.parent_id=portal_profile_id() AND x.cancelled_at IS NULL AND x.starts_at<s.ends_at AND x.ends_at>s.starts_at) THEN RAISE EXCEPTION 'Već imate rezerviran razgovor u tom terminu.';END IF;
  INSERT INTO family_meeting_bookings(slot_id,parent_id,student_id) VALUES(_id,portal_profile_id(),_student);PERFORM services_notify_target(s.host_id,'Nova rezervacija informacija',s.class_id,'meetings',_id,_student);
 END IF;
 PERFORM services_audit(s.class_id,'MEETING',_id::text,CASE WHEN _cancel THEN 'CANCEL' ELSE 'BOOK' END,to_jsonb(b),jsonb_build_object('student_id',_student));
END $$;
CREATE OR REPLACE FUNCTION services_substitution(_class text,_subject text,_original uuid,_substitute uuid,_date date,_hour integer,_room text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF expert_actor() OR NOT portal_admin(portal_class_school(_class)) OR _date IS NULL OR _hour IS NULL OR _hour NOT BETWEEN 1 AND 14 OR _original IS NOT DISTINCT FROM _substitute OR length(coalesce(_note,''))>2000 OR length(coalesce(_room,''))>100 OR NOT EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND subject_id=_subject AND teacher_id=_original) OR NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_substitute AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY')) THEN RAISE EXCEPTION 'Provjerite dodijeljeni predmet, nastavnike, datum i sat.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('substitution:'||_date::text||':'||_hour::text,0));
 IF EXISTS(SELECT 1 FROM teacher_substitutions WHERE date=_date AND hour=_hour AND cancelled_at IS NULL AND (class_id=_class OR substitute_teacher_id=_substitute)) THEN RAISE EXCEPTION 'Razred ili zamjenski nastavnik već ima zamjenu u tom terminu.';END IF;
 INSERT INTO teacher_substitutions(school_id,class_id,subject_id,original_teacher_id,substitute_teacher_id,date,hour,room,notes) VALUES(portal_class_school(_class),_class,_subject,_original,_substitute,_date,_hour,_room,_note) RETURNING id INTO result;
 FOR r IN SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE' UNION SELECT parent_id FROM parent_child_relationships WHERE child_id IN (SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE') AND school_id=portal_class_school(_class) UNION SELECT _substitute LOOP PERFORM services_notify_target(r,'Promjena rasporeda / zamjena nastavnika',_class,'schedule',result);END LOOP;
 PERFORM services_audit(_class,'SUBSTITUTION',result::text,'CREATE',NULL,jsonb_build_object('date',_date,'hour',_hour,'subject_id',_subject,'substitute',_substitute,'room',_room));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_cancel_exam(_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r uuid;
BEGIN SELECT * INTO s FROM school_exam_sessions WHERE id=_session FOR UPDATE;IF s.id IS NULL OR NOT services_manager(s.class_id) OR s.starts_at<=now() THEN RAISE EXCEPTION 'Rok više nije moguće otkazati.';END IF;UPDATE school_exam_sessions SET cancelled_at=now() WHERE id=_session;FOR r IN SELECT student_id FROM school_exam_registrations WHERE session_id=_session UNION SELECT p.parent_id FROM parent_child_relationships p JOIN school_exam_registrations x ON x.student_id=p.child_id WHERE x.session_id=_session AND p.school_id=portal_class_school(s.class_id) LOOP PERFORM services_notify_target(r,'Ispitni rok je otkazan',s.class_id,'exams',_session);END LOOP;PERFORM services_audit(s.class_id,'EXAM_SESSION',_session::text,'CANCEL',to_jsonb(s),jsonb_build_object('cancelled',true));END $$;
CREATE OR REPLACE FUNCTION services_resolve_exam_registration(_session uuid,_student uuid,_status text,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r school_exam_registrations;y uuid;
BEGIN
 SELECT * INTO s FROM school_exam_sessions WHERE id=_session;SELECT * INTO r FROM school_exam_registrations WHERE session_id=_session AND student_id=_student FOR UPDATE;
 IF s.id IS NULL OR s.cancelled_at IS NOT NULL OR r.student_id IS NULL OR r.special_exam_id IS NOT NULL OR r.resolved_at IS NOT NULL OR expert_actor() OR NOT registry_admin(portal_class_school(s.class_id)) OR _status NOT IN ('NO_SHOW','WITHDRAWN') OR _status IS NULL OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 2000 OR (_status='NO_SHOW' AND s.starts_at>now()) THEN RAISE EXCEPTION 'Provjerite ovlasti, termin, status i obrazloženje postupka.';END IF;
 SELECT school_year_id INTO y FROM classes WHERE id=s.class_id;PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||y::text,0));
 IF EXISTS(SELECT 1 FROM school_years WHERE id=y AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Najprije ponovno otvorite školsku godinu uz obrazloženje.';END IF;
 UPDATE school_exam_registrations SET resolution_status=_status,resolution_reason=trim(_reason),resolved_at=now(),resolved_by=portal_profile_id() WHERE session_id=_session AND student_id=_student;
 PERFORM services_audit(s.class_id,'EXAM_REGISTRATION',_session::text,'RESOLVE',to_jsonb(r),jsonb_build_object('student_id',_student,'status',_status,'reason',trim(_reason)));
 PERFORM services_notify_target(_student,'Evidentiran status ispitne prijave',s.class_id,'exams',_session,_student);
END $$;
NOTIFY pgrst,'reload schema';


ALTER TABLE final_thesis ADD COLUMN IF NOT EXISTS class_id text,ADD COLUMN IF NOT EXISTS school_id text,
 ADD COLUMN IF NOT EXISTS submitted_at timestamptz,ADD COLUMN IF NOT EXISTS rejected_at timestamptz,ADD COLUMN IF NOT EXISTS rejected_by uuid,ADD COLUMN IF NOT EXISTS rejection_note text,
 ADD COLUMN IF NOT EXISTS deregistered_at timestamptz,ADD COLUMN IF NOT EXISTS deregistered_by uuid,ADD COLUMN IF NOT EXISTS deregistration_note text,
 ADD COLUMN IF NOT EXISTS deregistration_classification_number text,ADD COLUMN IF NOT EXISTS deregistration_registry_number text,
 ADD COLUMN IF NOT EXISTS deregistration_data_entered_at timestamptz,ADD COLUMN IF NOT EXISTS deregistration_data_entered_by uuid,ADD COLUMN IF NOT EXISTS application_data_entered_by uuid;
-- Unscoped historic rows remain present and read-only for their student, mentor and global administrator.
CREATE OR REPLACE FUNCTION school_thesis_allowed(_row jsonb,_write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record;me uuid:=portal_profile_id();
BEGIN
 IF me IS NULL THEN RETURN false;END IF;
 IF NOT _write AND nullif(_row->>'class_id','') IS NULL AND nullif(_row->>'school_year_id','') IS NULL THEN RETURN me::text=_row->>'student_id' OR portal_admin('__global__') OR (me::text=_row->>'mentor_id' AND EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=me AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY')));END IF;
 FOR c IN SELECT cl.*,y.workflow_closed_at FROM student_class_enrollments e JOIN classes cl ON cl.id=e.class_id LEFT JOIN school_years y ON y.id=cl.school_year_id WHERE e.student_id=(_row->>'student_id')::uuid
  AND (nullif(_row->>'class_id','') IS NULL OR cl.id::text=_row->>'class_id') AND (nullif(_row->>'school_id','') IS NULL OR cl.school_id::text=_row->>'school_id')
  AND (nullif(_row->>'school_year_id','') IS NULL OR cl.school_year_id::text=_row->>'school_year_id') AND (nullif(_row->>'class_id','') IS NOT NULL OR nullif(_row->>'school_year_id','') IS NOT NULL) AND (NOT _write OR e.status='ACTIVE') LOOP
  IF _write AND (coalesce(c.is_locked,false) OR c.workflow_closed_at IS NOT NULL) THEN CONTINUE;END IF;
  IF registrar_is_user() THEN RETURN registrar_require_school()=c.school_id;END IF;
  IF portal_admin(c.school_id) THEN RETURN true;END IF;
  IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=me AND school_id=c.school_id AND status='ACTIVE') AND NOT portal_linked((_row->>'student_id')::uuid,c.school_id) THEN CONTINUE;END IF;
  IF _write THEN
   IF me=(_row->>'student_id')::uuid OR services_manager(c.id) OR (me::text=_row->>'mentor_id' AND EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=me AND school_id=c.school_id AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY'))) THEN RETURN true;END IF;
  ELSIF portal_student_reader((_row->>'student_id')::uuid,c.id) OR me::text=_row->>'mentor_id' THEN RETURN true;END IF;
 END LOOP;RETURN false;
END $$;
CREATE OR REPLACE FUNCTION school_thesis_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_json jsonb;new_json jsonb;me uuid:=portal_profile_id();school text;allowed text[]:=ARRAY['id','student_id','class_id','school_id','school_year_id','created_at','updated_at','submitted_at','thesis_title','mentor_id','mentor_name','exam_period','student_note','status','deregistered_at','deregistered_by','deregistration_note'];
BEGIN
 IF TG_OP<>'INSERT' THEN old_json:=to_jsonb(OLD);IF NOT school_thesis_allowed(old_json,true) THEN RAISE EXCEPTION 'Završni rad nije dostupan za izmjenu.';END IF;END IF;
 IF TG_OP='INSERT' AND NEW.class_id IS NOT NULL AND NEW.school_year_id IS NULL THEN SELECT school_year_id INTO NEW.school_year_id FROM classes WHERE id::text=NEW.class_id::text;END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM classes c JOIN student_class_enrollments e ON e.class_id=c.id AND e.student_id=NEW.student_id JOIN programs p ON p.id=coalesce(e.program_id,c.program_id) AND p.school_id=c.school_id WHERE c.id::text=NEW.class_id::text AND e.status='ACTIVE' AND c.grade_level=p.duration_years AND upper(replace(c.name,' ',''))<>'4.K') THEN RAISE EXCEPTION 'Završni rad dopušten je za završni razred odgovarajućeg programa.';END IF;
 IF TG_OP<>'DELETE' THEN
  new_json:=to_jsonb(NEW);IF NOT school_thesis_allowed(new_json,true) THEN RAISE EXCEPTION 'Provjerite ovlasti, razred, školsku godinu i zaključavanje.';END IF;
  IF TG_OP='UPDATE' AND (NEW.student_id IS DISTINCT FROM OLD.student_id OR OLD.school_year_id IS NOT NULL AND NEW.school_year_id IS DISTINCT FROM OLD.school_year_id OR old_json->>'class_id' IS NOT NULL AND new_json->>'class_id' IS DISTINCT FROM old_json->>'class_id' OR old_json->>'school_id' IS NOT NULL AND new_json->>'school_id' IS DISTINCT FROM old_json->>'school_id') THEN RAISE EXCEPTION 'Pripadnost završnog rada ne može se prepisati.';END IF;
  IF NEW.mentor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_school_roles r JOIN classes c ON c.school_id=r.school_id JOIN student_class_enrollments e ON e.class_id=c.id AND e.student_id=NEW.student_id WHERE (new_json->>'class_id' IS NULL OR c.id::text=new_json->>'class_id') AND (NEW.school_year_id IS NULL OR c.school_year_id=NEW.school_year_id) AND r.user_id=NEW.mentor_id AND r.status='ACTIVE' AND r.role IN ('TEACHER','HOMEROOM','DEPUTY')) THEN RAISE EXCEPTION 'Odaberite aktivnog nastavnika ove škole.';END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY[NEW.creation_grade,NEW.defense_grade,NEW.final_grade]) g WHERE g IS NOT NULL AND g NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Ocjene moraju biti od 1 do 5.';END IF;
 END IF;
 IF me=coalesce(NEW.student_id,OLD.student_id) THEN
  IF TG_OP='DELETE' AND OLD.status IS DISTINCT FROM 'CREATED' THEN RAISE EXCEPTION 'Možete obrisati samo vlastitu neobrađenu prijavu.';END IF;
  IF TG_OP<>'DELETE' THEN
   IF NEW.status IS NULL OR NEW.status NOT IN ('CREATED','DEREGISTERED') OR TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM 'CREATED' AND NOT (NEW.status='DEREGISTERED' AND OLD.status='ACCEPTED') THEN RAISE EXCEPTION 'Učenik ne može odrediti ovaj status.';END IF;
   IF TG_OP='UPDATE' AND OLD.status='ACCEPTED' AND (new_json-ARRAY['status','updated_at','deregistered_at','deregistered_by','deregistration_note']) IS DISTINCT FROM (old_json-ARRAY['status','updated_at','deregistered_at','deregistered_by','deregistration_note']) THEN RAISE EXCEPTION 'Pri odjavi prihvaćenog rada ne možete mijenjati sadržaj prijave.';END IF;
   IF TG_OP='UPDATE' AND (new_json-allowed) IS DISTINCT FROM (old_json-allowed) THEN RAISE EXCEPTION 'Učenik ne može mijenjati ocjene ili službene podatke.';END IF;
   IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM jsonb_each(new_json-allowed) x WHERE x.value<>'null'::jsonb) THEN RAISE EXCEPTION 'Učenik ne može unijeti službenu odluku ili ocjenu.';END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.status='ACCEPTED' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.accepted_by:=me;NEW.accepted_at:=clock_timestamp();END IF;
  IF NEW.status='REJECTED' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.rejected_by:=me;NEW.rejected_at:=clock_timestamp();END IF;
  IF NEW.application_registry_number IS DISTINCT FROM OLD.application_registry_number THEN NEW.application_data_entered_by:=me;NEW.application_data_entered_at:=clock_timestamp();END IF;
  IF NEW.deregistration_registry_number IS DISTINCT FROM OLD.deregistration_registry_number THEN NEW.deregistration_data_entered_by:=me;NEW.deregistration_data_entered_at:=clock_timestamp();END IF;
 END IF;
 IF TG_OP='DELETE' THEN school:=coalesce(old_json->>'school_id',(SELECT school_id FROM classes WHERE id::text=old_json->>'class_id'));ELSE school:=coalesce(new_json->>'school_id',(SELECT school_id FROM classes WHERE id::text=new_json->>'class_id'));NEW.updated_at:=clock_timestamp();END IF;
 IF school IS NULL THEN SELECT school_id INTO school FROM school_years WHERE id::text=coalesce(new_json->>'school_year_id',old_json->>'school_year_id');END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data) VALUES(school,'final_thesis',coalesce(new_json->>'id',old_json->>'id'),TG_OP,me,old_json,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS school_thesis_integrity ON final_thesis;
CREATE TRIGGER school_thesis_integrity BEFORE INSERT OR UPDATE OR DELETE ON final_thesis FOR EACH ROW EXECUTE FUNCTION school_thesis_guard();
ALTER TABLE final_thesis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_thesis_scope ON final_thesis;
CREATE POLICY school_thesis_scope ON final_thesis AS RESTRICTIVE FOR ALL TO authenticated USING(school_thesis_allowed(to_jsonb(final_thesis))) WITH CHECK(school_thesis_allowed(to_jsonb(final_thesis),true));
DROP POLICY IF EXISTS school_thesis_access ON final_thesis;
CREATE POLICY school_thesis_access ON final_thesis FOR ALL TO authenticated USING(school_thesis_allowed(to_jsonb(final_thesis))) WITH CHECK(school_thesis_allowed(to_jsonb(final_thesis),true));
GRANT SELECT,INSERT,UPDATE,DELETE ON final_thesis TO authenticated;
REVOKE ALL ON FUNCTION school_thesis_allowed(jsonb,boolean),school_thesis_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION school_thesis_allowed(jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
