-- Durable replacement for the legacy JSON-only fallback, not a replacement for canonical registry tables.
BEGIN;
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
COMMIT;
