-- Shared e-Matica / registrar foundation. Requires existing family/registrar migrations.
-- Additive: existing students, enrollments, grades and documents remain authoritative.
BEGIN;
CREATE FUNCTION public.registry_admin(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT public.registrar_is_user() AND (EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND (upper(role) IN ('MAIN_ADMIN','SUPER_ADMIN') OR upper(access_role) IN ('MAIN_ADMIN','SUPER_ADMIN'))) OR public.portal_admin(_school) OR EXISTS (
 SELECT 1 FROM user_profiles p WHERE p.id=portal_profile_id() AND p.active_school_id=_school
 AND upper(coalesce(p.access_role,'')) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR','RAVNATELJ','STRUCNA_SLUZBA')))
$$;
CREATE FUNCTION public.registry_global_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND
 (upper(role) IN ('MAIN_ADMIN','SUPER_ADMIN') OR upper(access_role) IN ('MAIN_ADMIN','SUPER_ADMIN')))
$$;
CREATE TABLE public.school_registry_sections (
 school_id text NOT NULL REFERENCES schools(id), section text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES user_profiles(id), PRIMARY KEY(school_id,section),
 CHECK(section IN ('BASIC','ABOUT','FOUNDATION','INFRASTRUCTURE','ELECTIVES','OTHER','CERTIFICATES')),
 CHECK(jsonb_typeof(data)='object')
);
CREATE TABLE public.staff_registry_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id text NOT NULL REFERENCES schools(id),
 staff_profile_id uuid NOT NULL REFERENCES user_profiles(id),
 record_type text NOT NULL CHECK(record_type IN ('CONTRACT','JOB','QUALIFICATION','SUBJECT','ADVANCEMENT','PROFESSIONAL_EXAM','PEDAGOGICAL_EXAM','COUNTY_COUNCIL')),
 starts_on date NOT NULL,ends_on date,data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES user_profiles(id),updated_by uuid REFERENCES user_profiles(id),
 CHECK(ends_on IS NULL OR ends_on>=starts_on),CHECK(jsonb_typeof(data)='object')
);
CREATE UNIQUE INDEX one_active_school_principal ON staff_registry_records(school_id)
 WHERE record_type='JOB' AND data->>'position'='RAVNATELJ' AND ends_on IS NULL;
CREATE TABLE public.registry_change_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,school_id text NOT NULL REFERENCES schools(id),
 entity text NOT NULL,entity_id text NOT NULL,action text NOT NULL,
 actor_id uuid REFERENCES user_profiles(id),changed_at timestamptz NOT NULL DEFAULT now(),
 before_data jsonb,after_data jsonb
);
ALTER TABLE school_registry_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_registry_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_read ON school_registry_sections FOR SELECT TO authenticated USING(registry_admin(school_id));
CREATE POLICY staff_read ON staff_registry_records FOR SELECT TO authenticated USING(registry_admin(school_id));
CREATE POLICY log_read ON registry_change_log FOR SELECT TO authenticated USING(registry_admin(school_id));
GRANT SELECT ON school_registry_sections,staff_registry_records,registry_change_log TO authenticated;

CREATE FUNCTION public.registry_save_section(_school text,_section text,_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous jsonb;item jsonb;headquarters int:=0;
BEGIN
 IF NOT registry_admin(_school) THEN RAISE EXCEPTION 'Nemate ovlasti za ovu ustanovu.'; END IF;
 IF _section='FOUNDATION' AND NOT registry_global_admin() THEN RAISE EXCEPTION 'Temeljnu dokumentaciju mijenja glavni administrator.';END IF;
 IF _section NOT IN ('BASIC','ABOUT','FOUNDATION','INFRASTRUCTURE','ELECTIVES','OTHER','CERTIFICATES') OR jsonb_typeof(_data)<>'object' OR octet_length(_data::text)>100000 THEN RAISE EXCEPTION 'Neispravni podaci ustanove.';END IF;
 IF _section='BASIC' THEN
  IF _data ?| ARRAY['name','oib','code','is_active','education_level'] THEN RAISE EXCEPTION 'Službeni identitet ustanove uređuje se zasebno.';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(_data->'addresses','[]')) LOOP
   IF nullif(trim(item->>'address'),'') IS NULL OR nullif(trim(item->>'city'),'') IS NULL OR nullif(item->>'starts_on','') IS NULL THEN RAISE EXCEPTION 'Adresa zahtijeva mjesto, ulicu i datum početka.';END IF;
   IF item->>'kind'='SJEDIŠTE' AND nullif(item->>'ends_on','') IS NULL THEN headquarters:=headquarters+1;END IF;
   IF nullif(item->>'ends_on','')::date<(item->>'starts_on')::date THEN RAISE EXCEPTION 'Završetak adrese prethodi početku.';END IF;
  END LOOP;
  IF jsonb_array_length(coalesce(_data->'addresses','[]'))>0 AND headquarters<>1 THEN RAISE EXCEPTION 'Ustanova mora imati točno jedno aktivno sjedište.';END IF;
 END IF;
 IF _section='ABOUT' AND coalesce((_data->>'shared_space')::boolean,false) AND nullif(trim(_data->>'shared_with'),'') IS NULL THEN RAISE EXCEPTION 'Navedite ustanovu s kojom dijelite prostor.';END IF;
 IF _section='INFRASTRUCTURE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(_data->'items','[]')) LOOP
   IF coalesce((item->>'count')::numeric,0)<0 OR coalesce((item->>'area')::numeric,0)<0 OR coalesce((item->>'computers')::numeric,0)<0 OR coalesce((item->>'seats')::numeric,0)<0 THEN RAISE EXCEPTION 'Infrastrukturne vrijednosti ne mogu biti negativne.';END IF;
  END LOOP;
 END IF;
 IF _section='BASIC' THEN
  UPDATE schools SET phone=nullif(_data->>'phone',''),email=nullif(_data->>'email',''),website=nullif(_data->>'website','') WHERE id=_school;
  SELECT value INTO item FROM jsonb_array_elements(coalesce(_data->'addresses','[]')) WHERE value->>'kind'='SJEDIŠTE' AND nullif(value->>'ends_on','') IS NULL LIMIT 1;
  IF item IS NOT NULL THEN UPDATE schools SET address=item->>'address',city=item->>'city',postal_code=item->>'postal_code' WHERE id=_school;END IF;
 END IF;
 IF _section='CERTIFICATES' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_school||':document-settings',0));
  IF EXISTS(SELECT 1 FROM school_document_settings WHERE school_id=_school) THEN UPDATE school_document_settings SET school_name_print=nullif(trim(_data->>'print_name'),''),desired_school_name=nullif(trim(_data->>'print_name'),'') WHERE school_id=_school;
  ELSE INSERT INTO school_document_settings(school_id,school_name,school_name_print,city) SELECT id,name,nullif(trim(_data->>'print_name'),''),city FROM schools WHERE id=_school;END IF;
 END IF;
 SELECT data INTO previous FROM school_registry_sections WHERE school_id=_school AND section=_section FOR UPDATE;
 INSERT INTO school_registry_sections(school_id,section,data,updated_by) VALUES(_school,_section,_data,portal_profile_id())
 ON CONFLICT(school_id,section) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data)
 VALUES(_school,'INSTITUTION',_section,'SAVE',portal_profile_id(),previous,_data);
END $$;

CREATE FUNCTION public.registry_save_staff(_school text,_staff uuid,_type text,_start date,_end date,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous jsonb;result uuid;contract staff_registry_records;
BEGIN
 IF NOT registry_admin(_school) THEN RAISE EXCEPTION 'Nemate ovlasti za ovu ustanovu.';END IF;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_staff AND school_id=_school AND status='ACTIVE' AND role NOT IN ('STUDENT','PARENT')) THEN RAISE EXCEPTION 'Djelatnik nije povezan s ovom ustanovom.';END IF;
 IF _start IS NULL OR _end<_start OR jsonb_typeof(_data)<>'object' OR octet_length(_data::text)>20000 THEN RAISE EXCEPTION 'Provjerite razdoblje i podatke djelatnika.';END IF;
 IF _type='CONTRACT' AND (nullif(_data->>'status','') IS NULL OR coalesce((_data->>'weekly_hours')::numeric,-1) NOT BETWEEN 0 AND 60) THEN RAISE EXCEPTION 'Ugovor zahtijeva status i tjednu satnicu od 0 do 60 sati.';END IF;
 IF _type='JOB' THEN
  SELECT * INTO contract FROM staff_registry_records WHERE id=nullif(_data->>'contract_id','')::uuid AND school_id=_school AND staff_profile_id=_staff AND record_type='CONTRACT';
  IF contract.id IS NULL OR _start<contract.starts_on OR (contract.ends_on IS NOT NULL AND (_end IS NULL OR _end>contract.ends_on)) THEN RAISE EXCEPTION 'Radno mjesto mora biti unutar pripadajućeg ugovora.';END IF;
  IF nullif(trim(_data->>'position'),'') IS NULL THEN RAISE EXCEPTION 'Navedite radno mjesto.';END IF;
 END IF;
 IF _type='JOB' AND _data->>'position'='RAVNATELJ' AND EXISTS(SELECT 1 FROM staff_registry_records r WHERE r.school_id=_school AND r.record_type='JOB' AND r.data->>'position'='RAVNATELJ' AND r.id IS DISTINCT FROM _id AND daterange(r.starts_on,coalesce(r.ends_on+1,'infinity'::date),'[)') && daterange(_start,coalesce(_end+1,'infinity'::date),'[)')) THEN RAISE EXCEPTION 'Najprije zatvorite prethodno imenovanje ravnatelja; razdoblja se ne smiju preklapati.';END IF;
 IF _type='CONTRACT' AND _id IS NOT NULL AND EXISTS(SELECT 1 FROM staff_registry_records r WHERE r.school_id=_school AND r.record_type='JOB' AND r.data->>'contract_id'=_id::text AND (r.starts_on<_start OR (_end IS NOT NULL AND (r.ends_on IS NULL OR r.ends_on>_end)))) THEN RAISE EXCEPTION 'Prije skraćivanja ugovora uskladite pripadajuća radna mjesta.';END IF;
 IF _type='SUBJECT' AND NOT EXISTS(SELECT 1 FROM subjects WHERE id=_data->>'subject_id' AND school_id=_school) THEN RAISE EXCEPTION 'Odaberite predmet ustanove.';END IF;
 IF _type='QUALIFICATION' AND (nullif(trim(_data->>'institution'),'') IS NULL OR nullif(trim(_data->>'level'),'') IS NULL OR nullif(trim(_data->>'title'),'') IS NULL) THEN RAISE EXCEPTION 'Navedite ustanovu, razinu i stručni naziv.';END IF;
 IF _type IN ('ADVANCEMENT','PROFESSIONAL_EXAM','PEDAGOGICAL_EXAM') AND nullif(trim(_data->>'decision_number'),'') IS NULL THEN RAISE EXCEPTION 'Navedite broj rješenja / isprave.';END IF;
 IF _type='COUNTY_COUNCIL' AND (nullif(trim(_data->>'county'),'') IS NULL OR nullif(trim(_data->>'subject'),'') IS NULL OR coalesce((_data->>'teacher_count')::integer,-1)<0) THEN RAISE EXCEPTION 'Provjerite županiju, predmet i broj nastavnika.';END IF;
 IF _id IS NOT NULL THEN
  SELECT to_jsonb(r) INTO previous FROM staff_registry_records r WHERE id=_id AND school_id=_school AND staff_profile_id=_staff AND record_type=_type FOR UPDATE;
  IF previous IS NULL THEN RAISE EXCEPTION 'Zapis nije dostupan u ovoj ustanovi.';END IF;
  UPDATE staff_registry_records SET starts_on=_start,ends_on=_end,data=_data,updated_at=now(),updated_by=portal_profile_id() WHERE id=_id RETURNING id INTO result;
 ELSE
  INSERT INTO staff_registry_records(school_id,staff_profile_id,record_type,starts_on,ends_on,data,created_by,updated_by)
  VALUES(_school,_staff,_type,_start,_end,_data,portal_profile_id(),portal_profile_id()) RETURNING id INTO result;
 END IF;
 IF _type='JOB' AND (_data->>'position'='RAVNATELJ' OR previous->'data'->>'position'='RAVNATELJ') THEN
  UPDATE school_document_settings SET principal_name=(SELECT p.name FROM staff_registry_records r JOIN user_profiles p ON p.id=r.staff_profile_id WHERE r.school_id=_school AND r.record_type='JOB' AND r.data->>'position'='RAVNATELJ' AND r.starts_on<=current_date AND (r.ends_on IS NULL OR r.ends_on>=current_date) ORDER BY r.starts_on DESC LIMIT 1) WHERE school_id=_school;
 END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data)
 VALUES(_school,'STAFF',result::text,'SAVE',portal_profile_id(),previous,jsonb_build_object('staff',_staff,'type',_type,'data',_data,'starts_on',_start,'ends_on',_end));
 RETURN result;
END $$;

-- Per-school administrators may edit contact data, not official identity or global roles.
CREATE FUNCTION public.registry_protect_school_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT registry_global_admin() AND
 (NEW.name,NEW.oib,NEW.code,NEW.is_active,NEW.education_level,NEW.type) IS DISTINCT FROM
 (OLD.name,OLD.oib,OLD.code,OLD.is_active,OLD.education_level,OLD.type) THEN
 RAISE EXCEPTION 'Službeni naziv, OIB, šifru, vrstu i status ustanove mijenja glavni administrator.';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registry_school_identity BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION registry_protect_school_identity();

REVOKE ALL ON FUNCTION registry_admin(text),registry_global_admin(),registry_save_section(text,text,jsonb),registry_save_staff(text,uuid,text,date,date,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_admin(text),registry_global_admin(),registry_save_section(text,text,jsonb),registry_save_staff(text,uuid,text,date,date,jsonb,uuid) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
