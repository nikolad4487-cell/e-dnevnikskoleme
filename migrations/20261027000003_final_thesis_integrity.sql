BEGIN;
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
