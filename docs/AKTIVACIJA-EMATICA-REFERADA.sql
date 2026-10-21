-- SkoleHR: zajednička nadogradnja e-Matice i Školske referade
-- Generirano: node scripts/build-registry-activation.mjs
-- Preduvjet: postojeća e-Matica i aktivirana roditeljska/referadska shema.
-- Pokrenuti JEDNOM u SQL Editoru postojećeg Supabase projekta.
-- Sve se primjenjuje u jednoj transakciji; greška poništava cijelu nadogradnju.
BEGIN;
-- IZVOR: 20261020000003_registry_administration.sql
-- Shared e-Matica / registrar foundation. Requires existing family/registrar migrations.
-- Additive: existing students, enrollments, grades and documents remain authoritative.

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

-- IZVOR: 20261020000004_registrar_documents.sql
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS attendance_mode text;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS status_verified_at timestamptz;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS status_verified_by uuid REFERENCES user_profiles(id);
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS status_evidence text;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES user_profiles(id);
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS template_version text;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS pdf_sha256 text;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES user_profiles(id);
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS attested_by uuid REFERENCES user_profiles(id);
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS attestation_status text NOT NULL DEFAULT 'NONE';
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES user_profiles(id);
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS previewed_at timestamptz;
ALTER TABLE registrar_school_settings ADD COLUMN IF NOT EXISTS stamp_path text;
ALTER TABLE registrar_school_settings ADD COLUMN IF NOT EXISTS numbering_rules text;
ALTER TABLE registrar_school_settings ADD COLUMN IF NOT EXISTS attestation_authorized boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.registry_verify_enrollment(_enrollment uuid,_mode text,_evidence text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e student_class_enrollments;c classes;
BEGIN
 SELECT * INTO e FROM student_class_enrollments WHERE id=_enrollment FOR UPDATE;SELECT * INTO c FROM classes WHERE id=e.class_id;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) THEN RAISE EXCEPTION 'Upis nije dostupan.';END IF;
 IF _mode IS NULL OR _mode NOT IN ('REGULAR','PART_TIME','EXTERNAL') OR length(trim(coalesce(_evidence,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Odaberite status i navedite osnovu provjere.';END IF;
 UPDATE student_class_enrollments SET attendance_mode=_mode,status_verified_at=now(),status_verified_by=portal_profile_id(),status_evidence=trim(_evidence) WHERE id=_enrollment;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(c.school_id,'ENROLLMENT',_enrollment::text,'VERIFY_STATUS',portal_profile_id(),jsonb_build_object('mode',_mode,'evidence',trim(_evidence)));
END $$;

CREATE FUNCTION public.registrar_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 RETURN registrar_context()||jsonb_build_object('years',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(label,name),'is_active',is_active) ORDER BY starts_at DESC),'[]') FROM school_years WHERE school_id=s),
 'classes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'school_year_id',school_year_id,'school_year',school_year,'graduating',is_graduating_class) ORDER BY name),'[]') FROM classes WHERE school_id=s AND is_active IS DISTINCT FROM false));
END $$;
CREATE FUNCTION public.registrar_class_students(_year uuid,_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_id=s AND school_year_id=_year) THEN RAISE EXCEPTION 'Razred nije u odabranoj školi i godini.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.name),'[]') FROM (
 SELECT e.id AS enrollment_id,coalesce(r.id,e.student_id) AS id,r.id AS registry_student_id,e.student_id,e.class_id,
 coalesce(nullif(concat_ws(' ',r.first_name,r.last_name),''),p.name) AS name,coalesce(r.oib,p.oib) AS oib,
 coalesce(r.date_of_birth,p.dob) AS dob,e.attendance_mode,e.status_verified_at
 FROM student_class_enrollments e LEFT JOIN registry_students r ON r.id=e.registry_student_id OR (e.registry_student_id IS NULL AND r.ednevnik_student_id=e.student_id)
 LEFT JOIN user_profiles p ON p.id=e.student_id WHERE e.class_id=_class AND e.status='ACTIVE')q);
END $$;

CREATE FUNCTION public.registrar_document_snapshot(_year uuid,_class text,_student uuid,_template text,_inputs jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();c classes;e student_class_enrollments;r registry_students;p user_profiles;sch schools;yr school_years;program programs;cfg jsonb;result jsonb;grades_data jsonb;ys uuid[];
BEGIN
 IF _inputs IS NULL OR jsonb_typeof(_inputs)<>'object' OR octet_length(_inputs::text)>20000 THEN RAISE EXCEPTION 'Neispravni podaci dokumenta.';END IF;
 IF _template NOT IN ('attendance','transcript','zet-regular-2026-2027','zet-general','hzpp-pupil','hzpp-student','transport-75-2026-2027','transport-100-social-2026-2027','transport-100-veterans-2026-2027') THEN RAISE EXCEPTION 'Predložak nije podržan.';END IF;
 SELECT * INTO c FROM classes WHERE id=_class AND school_id=s AND school_year_id=_year;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Razred ne pripada odabranoj školi i godini.';END IF;
 SELECT * INTO e FROM student_class_enrollments WHERE class_id=c.id AND status='ACTIVE' AND (registry_student_id=_student OR student_id=_student OR EXISTS(SELECT 1 FROM registry_students rs WHERE rs.id=_student AND rs.ednevnik_student_id=student_class_enrollments.student_id)) ORDER BY created_at DESC LIMIT 1;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Učenik nema aktivan upis u odabrani razred.';END IF;
 SELECT * INTO r FROM registry_students WHERE id=e.registry_student_id OR (e.registry_student_id IS NULL AND ednevnik_student_id=e.student_id) LIMIT 1;
 SELECT * INTO p FROM user_profiles WHERE id=e.student_id;SELECT * INTO sch FROM schools WHERE id=s;SELECT * INTO yr FROM school_years WHERE id=_year AND school_id=s;
 SELECT * INTO program FROM programs WHERE id=coalesce(e.program_id,c.program_id) AND school_id=s;
 IF _template NOT IN ('transcript','zet-general') AND (e.attendance_mode IS DISTINCT FROM 'REGULAR' OR e.status_verified_at IS NULL) THEN RAISE EXCEPTION 'U e-Matici prvo potvrdite status redovitog školovanja i osnovu provjere.';END IF;
 IF _template LIKE '%2026-2027' AND regexp_replace(coalesce(yr.label,yr.name),'[^0-9]','','g')<>'20262027' THEN RAISE EXCEPTION 'Izvorni obrazac vrijedi za 2026./2027.; odaberite predložak za odgovarajuću godinu.';END IF;
 IF _template='hzpp-student' AND coalesce(upper(sch.education_level::text),'')<>'HIGHER' THEN RAISE EXCEPTION 'Studentski obrazac može ovjeriti samo pripadajuće visoko učilište.';END IF;
 IF (_template='hzpp-pupil' OR _template LIKE 'transport-%') AND coalesce(upper(sch.education_level::text),'') NOT IN ('ELEMENTARY','SECONDARY') THEN RAISE EXCEPTION 'Odaberite obrazac za vrstu svoje ustanove.';END IF;
 IF _template LIKE 'transport-%' AND upper(sch.education_level::text)<>'SECONDARY' THEN RAISE EXCEPTION 'Obrazac je namijenjen učenicima srednje škole.';END IF;
 IF _template IN ('attendance','transcript') AND length(trim(coalesce(_inputs->>'purpose',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Navedite svrhu dokumenta.';END IF;
 SELECT coalesce(to_jsonb(t),'{}') INTO cfg FROM registrar_school_settings t WHERE t.school_id=s;cfg:=coalesce(cfg,'{}')||jsonb_build_object('print_school_name',(SELECT nullif(school_name_print,'') FROM school_document_settings WHERE school_id=s LIMIT 1));
 IF coalesce((_inputs->>'attest')::boolean,false) AND (NOT coalesce((cfg->>'attestation_authorized')::boolean,false) OR nullif(cfg->>'signature_path','') IS NULL OR (nullif(cfg->>'stamp_path','') IS NULL AND s<>'srednja-kola-glina-zagreb') OR _template='zet-general') THEN RAISE EXCEPTION 'Školska ovjera nije konfigurirana i odobrena za ovaj obrazac.';END IF;
 IF nullif(coalesce(r.oib,p.oib),'') IS NULL OR coalesce(r.date_of_birth,p.dob) IS NULL THEN RAISE EXCEPTION 'U matičnoj evidenciji nedostaje OIB ili datum rođenja.';END IF;
 result:=jsonb_build_object('school',jsonb_build_object('id',sch.id,'name',sch.name,'address',sch.address,'city',sch.city,'postal_code',sch.postal_code,'education_level',sch.education_level),
 'student',jsonb_build_object('id',e.student_id,'registry_id',r.id,'name',coalesce(nullif(concat_ws(' ',r.first_name,r.last_name),''),p.name),'first_name',coalesce(r.first_name,split_part(p.name,' ',1)),'last_name',coalesce(r.last_name,nullif(substr(p.name,length(split_part(p.name,' ',1))+2),'')),'oib',coalesce(r.oib,p.oib),'dob',coalesce(r.date_of_birth,p.dob),'address',coalesce(nullif(r.address,''),p.address),'city',r.city,'postal_code',r.postal_code,'country',r.address_country,'phone',coalesce(r.phone,p.mobile),'email',coalesce(r.email,p.email),'gender',coalesce(r.gender,p.gender),'birthplace',coalesce(r.birth_place,p.birthplace,p.pob),'birth_country',coalesce(r.birth_country,p.birth_country)),
 'class',jsonb_build_object('id',c.id,'name',c.name,'grade_level',c.grade_level),'year',jsonb_build_object('id',yr.id,'name',coalesce(yr.label,yr.name)),
 'program',jsonb_build_object('id',program.id,'name',program.name),'settings',cfg,'inputs',_inputs,'prepared_at',now(),'prepared_by',portal_profile_id(),'template',_template,
 'transport',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at),'[]') FROM student_transport_records t WHERE school_id=s AND registry_student_id=r.id AND school_year_id=_year AND status='AKTIVNO'));
 IF _template='transcript' THEN
  SELECT array_agg(value::uuid) INTO ys FROM jsonb_array_elements_text(coalesce(_inputs->'years',jsonb_build_array(_year)));
  IF cardinality(ys) NOT BETWEEN 1 AND 20 OR EXISTS(SELECT 1 FROM unnest(ys) y WHERE NOT EXISTS(SELECT 1 FROM school_years WHERE id=y AND school_id=s)) THEN RAISE EXCEPTION 'Provjerite odabrane školske godine.';END IF;
  IF _inputs->>'grade_kind'='CURRENT' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('subject',sub.name,'value',g.value,'date',g.date,'year',coalesce(y.label,y.name),'class',cl.name,'kind','Tekuća ocjena') ORDER BY y.starts_at,sub.name,g.date),'[]') INTO grades_data
   FROM grades g JOIN classes cl ON cl.id=g.class_id JOIN school_years y ON y.id=cl.school_year_id LEFT JOIN subjects sub ON sub.id=g.subject_id WHERE g.student_id=e.student_id AND cl.school_id=s AND y.id=ANY(ys) AND g.value IS NOT NULL;
  ELSIF _inputs->>'grade_kind'='FINAL' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('subject',q.subject,'value',q.value,'date',q.date,'year',q.year,'class',q.class,'kind','Zaključna ocjena') ORDER BY q.year,q.subject),'[]') INTO grades_data FROM (
    SELECT DISTINCT ON (cl.school_year_id,g.class_id,g.subject_id,g.term) sub.name AS subject,g.value,g.date,coalesce(y.label,y.name) AS year,cl.name AS class
    FROM (
     SELECT student_id,class_id,subject_id,value,date,created_at,coalesce(term,period,'') AS term,0 AS priority FROM final_grades WHERE nullif(value,'') IS NOT NULL
     UNION ALL
     SELECT eg.student_id,eg.class_id,eg.subject_id,eg.grade_value,eg.date,eg.created_at,coalesce(eg.term,eg.period,'FINAL'),1 FROM enrollment_final_grades eg WHERE nullif(eg.grade_value,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM final_grades fg WHERE fg.id=eg.id)
    ) g JOIN classes cl ON cl.id=g.class_id JOIN school_years y ON y.id=cl.school_year_id LEFT JOIN subjects sub ON sub.id=g.subject_id
    WHERE g.student_id=e.student_id AND cl.school_id=s AND y.id=ANY(ys) ORDER BY cl.school_year_id,g.class_id,g.subject_id,g.term,g.priority,g.date DESC,g.created_at DESC
   )q;
  ELSE RAISE EXCEPTION 'Odaberite tekuće ili zaključne ocjene.';END IF;
  IF jsonb_array_length(grades_data)=0 THEN RAISE EXCEPTION 'Nema evidentiranih ocjena odabrane vrste i godina.';END IF;
  result:=result||jsonb_build_object('grades',grades_data);
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.registrar_prepare_document(_year uuid,_class text,_student uuid,_template text,_inputs jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snap jsonb;s text:=registrar_require_school();rec school_document_records;
BEGIN
 snap:=registrar_document_snapshot(_year,_class,_student,_template,_inputs);
 INSERT INTO school_document_records(school_id,school_year_id,class_id,registry_student_id,student_id,document_type,status,snapshot,template_version,created_by)
 VALUES(s,_year,_class,nullif(snap->'student'->>'registry_id','')::uuid,nullif(snap->'student'->>'id','')::uuid,_template,'NACRT',snap,'2026-10-20',auth.uid()) RETURNING * INTO rec;
 RETURN to_jsonb(rec);
END $$;
CREATE FUNCTION public.registrar_document(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();rec school_document_records;
BEGIN SELECT * INTO rec FROM school_document_records WHERE id=_id AND school_id=s AND snapshot IS NOT NULL;
 IF rec.id IS NULL THEN RAISE EXCEPTION 'Dokument nije dostupan.';END IF;RETURN to_jsonb(rec);END $$;
CREATE FUNCTION public.registrar_document_archive() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (SELECT id,document_type,document_number,issued_on,status,school_year_id,attestation_status,issued_by,attested_by,cancellation_reason,created_at,snapshot->'student'->>'name' AS student_name,snapshot->'year'->>'name' AS year_name,snapshot->'inputs'->>'purpose' AS purpose FROM school_document_records WHERE school_id=s ORDER BY created_at DESC LIMIT 1000)q);END $$;
CREATE FUNCTION public.registrar_issue_document(_id uuid,_sha text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();rec school_document_records;fresh jsonb;
BEGIN
 SELECT * INTO rec FROM school_document_records WHERE id=_id AND school_id=s FOR UPDATE;
 IF rec.id IS NULL OR rec.status<>'SPREMNO' OR rec.pdf_path IS NULL OR rec.pdf_sha256 IS DISTINCT FROM _sha OR _sha IS NULL OR rec.previewed_at IS NULL THEN RAISE EXCEPTION 'Prvo otvorite pregled pripremljenog PDF-a.';END IF;
 -- Revalidate current school/session/enrollment and status before issuing an immutable snapshot.
 fresh:=registrar_document_snapshot(rec.school_year_id,rec.class_id,coalesce(rec.registry_student_id,rec.student_id),rec.document_type,rec.snapshot->'inputs');
 IF (fresh-'prepared_at'-'prepared_by') IS DISTINCT FROM (rec.snapshot-'prepared_at'-'prepared_by') THEN RAISE EXCEPTION 'Matični podaci su promijenjeni nakon pregleda; pripremite novi PDF.';END IF;
 UPDATE school_document_records SET status='IZDANO',issued_on=current_date,issued_by=portal_profile_id(),attested_by=CASE WHEN attestation_status='VISUAL' THEN portal_profile_id() END,updated_at=now() WHERE id=_id RETURNING * INTO rec;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(s,'DOCUMENT',_id::text,'ISSUE',portal_profile_id(),jsonb_build_object('sha256',_sha,'attestation',rec.attestation_status));RETURN to_jsonb(rec);
END $$;
CREATE FUNCTION public.registrar_cancel_document(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF length(trim(coalesce(_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Navedite razlog poništenja.';END IF;
 UPDATE school_document_records SET status='PONIŠTENO',cancelled_by=portal_profile_id(),cancelled_at=now(),cancellation_reason=trim(_reason),updated_at=now() WHERE id=_id AND school_id=s AND status='IZDANO';
 IF NOT FOUND THEN RAISE EXCEPTION 'Izdani dokument nije dostupan za poništenje.';END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(s,'DOCUMENT',_id::text,'CANCEL',portal_profile_id(),jsonb_build_object('reason',trim(_reason)));
END $$;

CREATE POLICY registry_document_read ON school_document_records AS RESTRICTIVE FOR SELECT TO authenticated USING(registry_admin(school_id));
CREATE POLICY registry_document_no_direct_write ON school_document_records AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY registry_document_no_direct_update ON school_document_records AS RESTRICTIVE FOR UPDATE TO authenticated USING(false);
CREATE POLICY registry_document_no_delete ON school_document_records AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
ALTER VIEW v_school_document_records_detailed SET(security_invoker=true);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('registrar-documents','registrar-documents',false,15728640,ARRAY['application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false;
-- PDF writes/downloads are server-only after user-scoped registrar RPC authorization.
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'registrar_%' OR p.proname='registry_verify_enrollment') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END LOOP;END $$;

-- IZVOR: 20261020000005_registrar_registry.sql
CREATE TABLE public.registrar_registry_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id text NOT NULL REFERENCES schools(id),school_year_id uuid NOT NULL REFERENCES school_years(id),
 class_id text REFERENCES classes(id),student_id uuid REFERENCES user_profiles(id),thesis_id uuid REFERENCES final_thesis(id),
 entry_type text NOT NULL CHECK(entry_type IN ('THESIS','ADMINISTRATIVE','OTHER')),
 registry_number text NOT NULL,classification_number text,registered_on date NOT NULL,received_on date,
 title text NOT NULL,note text,status text NOT NULL CHECK(status IN ('ZAPRIMLJENO','U_OBRADI','DOVRŠENO','PONIŠTENO')),
 created_by uuid NOT NULL REFERENCES user_profiles(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,school_year_id,registry_number),UNIQUE(thesis_id),CHECK(length(trim(registry_number)) BETWEEN 1 AND 150)
);
ALTER TABLE registrar_registry_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registrar_registry_entries FROM anon,authenticated;
CREATE FUNCTION public.registrar_theses(_year uuid,_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_id=s AND school_year_id=_year AND is_graduating_class IS TRUE) THEN RAISE EXCEPTION 'Odaberite završni razred odabrane godine.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (
 SELECT t.id,t.student_id,p.name,t.thesis_title,t.application_registry_number,t.application_classification_number,t.accepted_at,t.status
 FROM final_thesis t JOIN user_profiles p ON p.id=t.student_id WHERE t.school_year_id=_year AND EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.student_id=t.student_id AND e.class_id=_class))q);
END $$;
CREATE FUNCTION public.registrar_registry_log(_year uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (SELECT * FROM registrar_registry_entries WHERE school_id=s AND (_year IS NULL OR school_year_id=_year) ORDER BY registered_on DESC,created_at DESC LIMIT 1000)q);END $$;
CREATE FUNCTION public.registrar_register_entry(_year uuid,_class text,_thesis uuid,_type text,_number text,_classification text,_registered date,_received date,_title text,_note text,_status text,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();person uuid;result uuid;old registrar_registry_entries;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM school_years WHERE id=_year AND school_id=s) OR _registered IS NULL OR _received>_registered OR length(trim(coalesce(_number,''))) NOT BETWEEN 1 AND 150 OR length(trim(coalesce(_title,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Provjerite godinu, broj, naslov i datume predmeta.';END IF;
 IF _class IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_id=s AND school_year_id=_year) THEN RAISE EXCEPTION 'Razred ne pripada ustanovi i godini.';END IF;
 IF _type='THESIS' THEN
  SELECT t.student_id INTO person FROM final_thesis t WHERE t.id=_thesis AND t.school_year_id=_year AND EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=t.student_id AND c.id=_class AND c.school_id=s AND c.school_year_id=_year AND c.is_graduating_class IS TRUE) FOR UPDATE;
  IF person IS NULL THEN RAISE EXCEPTION 'Završni rad nije povezan sa završnim razredom ove škole.';END IF;
  IF EXISTS(SELECT 1 FROM final_thesis t WHERE t.id=_thesis AND nullif(t.application_registry_number,'') IS NOT NULL AND t.application_registry_number<>trim(_number)) THEN RAISE EXCEPTION 'Završni rad već ima drugi urudžbeni broj; ispravak traži zaseban upravni postupak.';END IF;
 ELSIF _thesis IS NOT NULL THEN RAISE EXCEPTION 'Završni rad povezujte samo s odgovarajućom vrstom predmeta.';END IF;
 IF _id IS NOT NULL THEN
  SELECT * INTO old FROM registrar_registry_entries WHERE id=_id AND school_id=s FOR UPDATE;
  IF old.id IS NULL OR old.thesis_id IS DISTINCT FROM _thesis OR old.entry_type<>_type OR old.registry_number<>trim(_number) OR old.school_year_id<>_year THEN RAISE EXCEPTION 'Identitet evidentiranog predmeta ne može se zamijeniti.';END IF;
  UPDATE registrar_registry_entries SET note=_note,status=_status,updated_at=now() WHERE id=_id RETURNING id INTO result;
 ELSE
  INSERT INTO registrar_registry_entries(school_id,school_year_id,class_id,student_id,thesis_id,entry_type,registry_number,classification_number,registered_on,received_on,title,note,status,created_by)
  VALUES(s,_year,_class,person,_thesis,_type,trim(_number),nullif(trim(_classification),''),_registered,_received,trim(_title),_note,_status,portal_profile_id()) RETURNING id INTO result;
 END IF;
 IF _type='THESIS' THEN
  UPDATE final_thesis SET application_registry_number=trim(_number),application_classification_number=nullif(trim(_classification),''),application_data_entered_at=now(),accepted_at=coalesce(_received,_registered)::timestamptz,accepted_by=portal_profile_id(),updated_at=now() WHERE id=_thesis;
 END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(s,'REGISTRY',result::text,'SAVE',portal_profile_id(),jsonb_build_object('number',trim(_number),'status',_status,'thesis',_thesis));
 RETURN result;
END $$;
CREATE FUNCTION public.registrar_configure_settings(_name text,_stamp text,_rules text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 150 OR length(coalesce(_rules,''))>2000 THEN RAISE EXCEPTION 'Provjerite ime ovlaštene osobe i pravila numeriranja.';END IF;
 IF _stamp IS NOT NULL AND (split_part(_stamp,'/',1)<>s OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='registrar-assets' AND name=_stamp)) THEN RAISE EXCEPTION 'Pečat nije u privatnom spremištu ustanove.';END IF;
 INSERT INTO registrar_school_settings(school_id,signer_name,stamp_path,numbering_rules,updated_by) VALUES(s,trim(_name),_stamp,_rules,portal_profile_id()) ON CONFLICT(school_id) DO UPDATE SET signer_name=excluded.signer_name,stamp_path=excluded.stamp_path,numbering_rules=excluded.numbering_rules,attestation_authorized=false,updated_by=excluded.updated_by,updated_at=now();
END $$;
CREATE FUNCTION public.registry_attestation_settings(_school text,_approve boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT registry_admin(_school) THEN RAISE EXCEPTION 'Nemate ovlasti za ustanovu.';END IF;
 IF _approve IS NOT NULL THEN
  UPDATE registrar_school_settings SET attestation_authorized=_approve,updated_by=portal_profile_id(),updated_at=now() WHERE school_id=_school AND (_approve=false OR (signature_path IS NOT NULL AND (stamp_path IS NOT NULL OR _school='srednja-kola-glina-zagreb')));
  IF NOT FOUND THEN RAISE EXCEPTION 'Referada prvo mora spremiti potpis i školski pečat.';END IF;
  INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(_school,'ATTESTATION',_school,'AUTHORIZE',portal_profile_id(),jsonb_build_object('approved',_approve));
 END IF;
 RETURN (SELECT coalesce(to_jsonb(r),'{}') FROM registrar_school_settings r WHERE school_id=_school);
END $$;
-- A changed signature requires renewed authorization from the school administrator.
CREATE FUNCTION public.registry_signature_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.signature_path IS DISTINCT FROM OLD.signature_path OR NEW.signer_name IS DISTINCT FROM OLD.signer_name OR NEW.stamp_path IS DISTINCT FROM OLD.stamp_path THEN NEW.attestation_authorized:=false;END IF;RETURN NEW;END $$;
CREATE TRIGGER registry_signature_changed BEFORE UPDATE ON registrar_school_settings FOR EACH ROW EXECUTE FUNCTION registry_signature_changed();
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('registrar_theses','registrar_registry_log','registrar_register_entry','registrar_configure_settings','registry_attestation_settings') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END LOOP;END $$;

-- IZVOR: 20261020000006_registry_education.sql
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

-- IZVOR: 20261020000007_registry_program_history.sql
-- Replace the single active program/year index with program-level uniqueness.
-- This removes no enrollment rows and permits documented parallel art programs.
DROP INDEX IF EXISTS public.uq_student_class_enrollments_registry_active_year;
CREATE UNIQUE INDEX registry_active_program_class ON student_class_enrollments(registry_student_id,school_year_id,class_id,coalesce(program_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE registry_student_id IS NOT NULL AND ematica_status='ACTIVE';
CREATE FUNCTION public.registry_change_program(_enrollment uuid,_class text,_program uuid,_date date,_reason text,_parallel boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old student_class_enrollments;source classes;target classes;prog programs;sch_enrollment uuid;result uuid;is_art boolean;
BEGIN
 SELECT * INTO old FROM student_class_enrollments WHERE id=_enrollment FOR UPDATE;SELECT * INTO source FROM classes WHERE id=old.class_id;
 SELECT * INTO target FROM classes WHERE id=_class AND is_active IS DISTINCT FROM false;SELECT * INTO prog FROM programs WHERE id=_program AND is_active IS DISTINCT FROM false;
 IF old.id IS NULL OR old.registry_student_id IS NULL OR NOT registry_admin(source.school_id) OR NOT registry_admin(target.school_id) OR prog.school_id IS DISTINCT FROM target.school_id OR target.school_year_id IS NULL THEN RAISE EXCEPTION 'Provjerite ovlasti i program ciljane ustanove.';END IF;
 IF _parallel IS NULL OR old.status IS DISTINCT FROM 'ACTIVE' OR old.ematica_status IS DISTINCT FROM 'ACTIVE' OR _date IS NULL OR _date<coalesce(old.enrolled_on,old.created_at::date) OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Promjena zahtijeva aktivan upis, valjani datum i osnovu upisa.';END IF;
 IF NOT EXISTS(SELECT 1 FROM school_years WHERE id=target.school_year_id AND school_id=target.school_id AND _date BETWEEN starts_at::date AND ends_at::date) THEN RAISE EXCEPTION 'Datum nije unutar ciljne školske godine.';END IF;
 is_art:=upper(coalesce(prog.type,'')) IN ('ART','UMJETNIČKI','UMJETNICKI') OR coalesce(prog.code,'')='770004';
 IF _parallel AND NOT is_art THEN RAISE EXCEPTION 'Paralelan upis koristi se samo za dokumentirane umjetničke programe.';END IF;
 IF EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.registry_student_id=old.registry_student_id AND e.class_id=_class AND coalesce(e.program_id,'00000000-0000-0000-0000-000000000000'::uuid)=_program AND e.ematica_status='ACTIVE') THEN RAISE EXCEPTION 'Učenik je već aktivno upisan u taj program i razred.';END IF;
 IF NOT _parallel THEN
  IF _date=coalesce(old.enrolled_on,old.created_at::date) THEN RAISE EXCEPTION 'Datum novog upisa mora biti nakon početka prethodnog razdoblja.';END IF;
  UPDATE student_class_enrollments SET exited_on=_date-1,exit_reason=_reason,status='TRANSFERRED',ematica_status='TRANSFERRED',is_primary_program=false,updated_at=now() WHERE id=old.id;
  UPDATE student_school_enrollments SET exited_on=_date-1,exit_reason=_reason,status='TRANSFERRED',updated_at=now() WHERE id=coalesce(old.school_enrollment_id,old.source_school_enrollment_id) AND student_id=old.registry_student_id AND school_id=source.school_id;
 END IF;
 INSERT INTO student_school_enrollments(student_id,school_id,school_year_id,program_id,status,enrolled_on,created_by) VALUES(old.registry_student_id,target.school_id,target.school_year_id,_program,'ACTIVE',_date,auth.uid()) RETURNING id INTO sch_enrollment;
 INSERT INTO student_class_enrollments(student_id,registry_student_id,class_id,school_year_id,school_year,program_id,source_school_enrollment_id,school_enrollment_id,ematica_status,status,enrolled_on,is_primary_program)
 VALUES(old.student_id,old.registry_student_id,target.id,target.school_year_id,target.school_year,_program,sch_enrollment,sch_enrollment,'ACTIVE','ACTIVE',_date,NOT _parallel AND old.is_primary_program) RETURNING id INTO result;
 INSERT INTO student_education_records(registry_student_id,school_id,school_year_id,program_id,class_id,record_type,effective_on,description,details,created_by)
 VALUES(old.registry_student_id,target.school_id,target.school_year_id,_program,target.id,CASE WHEN _parallel THEN 'PARALELNI_UMJETNIČKI_PROGRAM' ELSE 'PROMJENA_PROGRAMA' END,_date,_reason,jsonb_build_object('previous_enrollment',old.id,'new_enrollment',result),auth.uid());
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(target.school_id,'PROGRAM',result::text,'ENROLL',portal_profile_id(),jsonb_build_object('previous',old.id,'parallel',_parallel,'program',_program,'date',_date));RETURN result;
END $$;

-- A deliberate program transfer can inspect a second authorized school without changing
-- the active-school filter used by ordinary lists. Unauthorized institutions are excluded.
CREATE FUNCTION public.registry_program_targets(_school text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF _school IS NOT NULL AND NOT registry_admin(_school) THEN RAISE EXCEPTION 'Ciljana ustanova nije dostupna.';END IF;
 RETURN jsonb_build_object('schools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM schools WHERE registry_admin(id)),
 'classes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'school_id',c.school_id,'school_year',coalesce(y.label,y.name,c.school_year)) ORDER BY y.starts_at,c.name),'[]') FROM classes c LEFT JOIN school_years y ON y.id=c.school_year_id WHERE c.school_id=_school AND c.is_active IS DISTINCT FROM false),
 'programs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'code',code) ORDER BY name),'[]') FROM programs WHERE school_id=_school AND is_active IS DISTINCT FROM false));
END $$;
REVOKE ALL ON FUNCTION registry_program_targets(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_program_targets(text) TO authenticated;

CREATE TABLE public.certificate_seal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),certificate_id uuid NOT NULL REFERENCES student_certificates(id),school_id text NOT NULL REFERENCES schools(id),
 requested_by uuid NOT NULL REFERENCES user_profiles(id),requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'READY_FOR_PROVIDER' CHECK(status IN ('READY_FOR_PROVIDER','SENT','EXPIRED','FAILED','SEALED','REGISTERED')),
 provider_request_id text,provider_receipt jsonb,sealed_pdf_path text,
 CHECK(status NOT IN ('SEALED','REGISTERED') OR (provider_request_id IS NOT NULL AND provider_receipt IS NOT NULL AND sealed_pdf_path IS NOT NULL))
);
CREATE UNIQUE INDEX certificate_one_pending_seal ON certificate_seal_requests(certificate_id) WHERE status IN ('READY_FOR_PROVIDER','SENT');
ALTER TABLE certificate_seal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY seal_read ON certificate_seal_requests FOR SELECT TO authenticated USING(registry_admin(school_id));
REVOKE ALL ON certificate_seal_requests FROM anon,authenticated;
GRANT SELECT ON certificate_seal_requests TO authenticated;
CREATE FUNCTION public.registry_prepare_seals(_certificates uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cert student_certificates;result jsonb:='[]';request_id uuid;
BEGIN
 IF coalesce(cardinality(_certificates),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Odaberite od 1 do 100 svjedodžbi.';END IF;
 FOREACH request_id IN ARRAY _certificates LOOP
  SELECT * INTO cert FROM student_certificates WHERE id=request_id FOR UPDATE;
  IF cert.id IS NULL OR NOT registry_admin(cert.school_id) OR cert.status NOT IN ('READY','ISSUED') OR nullif(cert.certificate_number,'') IS NULL OR cert.payload IS NULL THEN RAISE EXCEPTION 'Svjedodžba mora biti provjerena, zaključana, numerirana i dostupna vašoj ustanovi.';END IF;
  IF EXISTS(SELECT 1 FROM programs p JOIN student_class_enrollments e ON e.program_id=p.id WHERE e.class_id=cert.class_id AND e.registry_student_id=cert.registry_student_id AND p.code='770004') THEN RAISE EXCEPTION 'Općeobrazovna ustanova ne izdaje svjedodžbu za zajednički dio umjetničkog programa.';END IF;
  INSERT INTO certificate_seal_requests(certificate_id,school_id,requested_by) VALUES(cert.id,cert.school_id,portal_profile_id()) ON CONFLICT(certificate_id) WHERE status IN ('READY_FOR_PROVIDER','SENT') DO UPDATE SET certificate_id=EXCLUDED.certificate_id RETURNING id INTO request_id;
  result:=result||jsonb_build_array(jsonb_build_object('request',request_id,'certificate',cert.id,'status','READY_FOR_PROVIDER'));
 END LOOP;RETURN result;
END $$;
REVOKE ALL ON FUNCTION registry_change_program(uuid,text,uuid,date,text,boolean),registry_prepare_seals(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_change_program(uuid,text,uuid,date,text,boolean),registry_prepare_seals(uuid[]) TO authenticated;

-- IZVOR: 20261020000008_registry_school_permissions.sql
ALTER TABLE user_school_roles ADD COLUMN IF NOT EXISTS can_delegate_registry boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.registry_scoped_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT registry_global_admin() AND (EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND upper(access_role) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR','RAVNATELJ','STRUCNA_SLUZBA')) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE'))
$$;
CREATE FUNCTION public.registry_student_visible(_student uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM registry_students r WHERE r.id=_student AND r.created_by=auth.uid() AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.registry_student_id=r.id) AND NOT EXISTS(SELECT 1 FROM student_school_enrollments e WHERE e.student_id=r.id)) OR EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE (e.registry_student_id=_student OR e.student_id=_student) AND registry_admin(c.school_id)) OR EXISTS(SELECT 1 FROM student_school_enrollments WHERE student_id=_student AND registry_admin(school_id))
$$;
CREATE FUNCTION public.registry_profile_visible(_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _profile=portal_profile_id() OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_profile AND registry_admin(school_id)) OR registry_student_visible(_profile)
$$;
CREATE POLICY registry_scoped_students_read ON registry_students AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_students_update ON registry_students AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id)) WITH CHECK(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_students_delete ON registry_students AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_profiles ON user_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_profile_visible(id));
CREATE POLICY registry_scoped_roles ON user_school_roles AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(school_id));
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['schools','classes','programs','school_years','student_school_enrollments','student_year_end_summaries','student_certificates'] LOOP
  EXECUTE format('CREATE POLICY registry_scoped_read ON %I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(%s))',t,CASE WHEN t='schools' THEN 'id' ELSE 'school_id' END);
 END LOOP;
END $$;
CREATE POLICY registry_scoped_enrollments ON student_class_enrollments AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(portal_class_school(class_id)));
DO $$ DECLARE v text;BEGIN
 FOREACH v IN ARRAY ARRAY['v_ematica_students_current','v_ematica_students_current_extended','v_ematica_class_summary','v_student_class_enrollments_detailed','v_ematica_year_end_summaries','v_ematica_sync_status','v_ematica_transfers_detailed','v_ematica_dashboard_stats'] LOOP
  IF EXISTS(SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=v) THEN EXECUTE format('ALTER VIEW %I SET(security_invoker=true)',v);END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.registry_manage_permissions(_school text,_user uuid,_active boolean,_delegate boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing_id uuid;
BEGIN
 IF NOT registry_global_admin() AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE' AND role IN ('ADMIN','SCHOOL_ADMIN') AND can_delegate_registry) THEN RAISE EXCEPTION 'Prava dodjeljuje glavni ili imenovani administrator ustanove.';END IF;
 IF _delegate AND NOT registry_global_admin() THEN RAISE EXCEPTION 'Pravo daljnje dodjele može postaviti samo glavni administrator.';END IF;
 IF _user=portal_profile_id() THEN RAISE EXCEPTION 'Vlastita prava mijenja drugi ovlašteni administrator.';END IF;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND school_id=_school AND status='ACTIVE' AND role NOT IN ('STUDENT','PARENT','REGISTRAR')) OR EXISTS(SELECT 1 FROM user_profiles WHERE id=_user AND (upper(role) IN ('MAIN_ADMIN','SUPER_ADMIN','REGISTRAR') OR upper(access_role) IN ('MAIN_ADMIN','SUPER_ADMIN','REGISTRAR'))) THEN RAISE EXCEPTION 'Odaberite djelatnika ove ustanove bez globalne ili referadske uloge.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_school||_user::text,0));
 SELECT id INTO existing_id FROM user_school_roles WHERE user_id=_user AND school_id=_school AND role='SCHOOL_ADMIN' LIMIT 1 FOR UPDATE;
 IF existing_id IS NULL THEN
  IF NOT _active THEN RAISE EXCEPTION 'Pravo nije dodijeljeno.';END IF;
  INSERT INTO user_school_roles(user_id,school_id,role,status,can_delegate_registry) VALUES(_user,_school,'SCHOOL_ADMIN','ACTIVE',_delegate);
 ELSE UPDATE user_school_roles SET status=CASE WHEN _active THEN 'ACTIVE' ELSE 'REVOKED' END,can_delegate_registry=_active AND _delegate,updated_at=now() WHERE id=existing_id;END IF;
 IF _active THEN UPDATE user_profiles SET access_role='school_admin',active_school_id=_school WHERE id=_user;
 ELSIF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE') THEN UPDATE user_profiles SET access_role='teacher' WHERE id=_user AND upper(access_role) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR');END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(_school,'PERMISSION',_user::text,CASE WHEN _active THEN 'GRANT' ELSE 'REVOKE' END,portal_profile_id(),jsonb_build_object('role','SCHOOL_ADMIN','can_delegate',_delegate));
END $$;
CREATE FUNCTION public.registry_link_existing_staff(_school text,_oib text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE person user_profiles;
BEGIN
 IF NOT registry_admin(_school) OR _oib IS NULL OR _oib!~'^[0-9]{11}$' THEN RAISE EXCEPTION 'Provjerite ustanovu, ovlasti i OIB.';END IF;
 SELECT * INTO person FROM user_profiles p WHERE p.oib=_oib AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=p.id AND role IN ('PARENT','STUDENT','REGISTRAR')) AND (upper(p.role) IN ('TEACHER','ADMIN','SCHOOL_ADMIN','PRINCIPAL','STAFF') OR upper(p.access_role) IN ('TEACHER','NASTAVNIK','PROFESSOR','SCHOOL_ADMIN')) LIMIT 1;
 IF person.id IS NULL THEN RAISE EXCEPTION 'U lokalnoj evidenciji nije pronađen djelatnik za povezivanje. Novi račun dodaje se kroz Novi korisnik.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_school||person.id::text,0));
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=person.id AND school_id=_school AND role='TEACHER') THEN INSERT INTO user_school_roles(user_id,school_id,role,status) VALUES(person.id,_school,'TEACHER','ACTIVE');
 ELSE UPDATE user_school_roles SET status='ACTIVE',updated_at=now() WHERE user_id=person.id AND school_id=_school AND role='TEACHER';END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id) VALUES(_school,'STAFF_LINK',person.id::text,'LINK_EXISTING',portal_profile_id());
 RETURN jsonb_build_object('id',person.id,'name',person.name);
END $$;
CREATE FUNCTION public.registry_protect_authority() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND NOT registry_global_admin() THEN
  IF TG_TABLE_NAME='user_profiles' THEN
   IF (NEW.role,NEW.access_role,NEW.auth_user_id,NEW.school_id) IS DISTINCT FROM (OLD.role,OLD.access_role,OLD.auth_user_id,OLD.school_id) THEN RAISE EXCEPTION 'Korisničke ovlasti i pripadnost mijenjaju se kroz ovlašteni postupak.';END IF;
   IF NEW.active_school_id IS DISTINCT FROM OLD.active_school_id AND upper(coalesce(NEW.access_role,'')) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR') AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=OLD.id AND school_id=NEW.active_school_id AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE') THEN RAISE EXCEPTION 'Nemate administratorsku ulogu u odabranoj ustanovi.';END IF;
  ELSE
   IF NEW.role IN ('ADMIN','SCHOOL_ADMIN','MAIN_ADMIN','SUPER_ADMIN') OR NEW.can_delegate_registry THEN RAISE EXCEPTION 'Administratorska prava dodjeljuju se kroz upravljanje pravima ustanove.';END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER registry_protect_profile_authority BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION registry_protect_authority();
CREATE TRIGGER registry_protect_role_authority BEFORE INSERT OR UPDATE ON user_school_roles FOR EACH ROW EXECUTE FUNCTION registry_protect_authority();
REVOKE ALL ON FUNCTION registry_scoped_actor(),registry_student_visible(uuid),registry_profile_visible(uuid),registry_manage_permissions(text,uuid,boolean,boolean),registry_link_existing_staff(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_scoped_actor(),registry_student_visible(uuid),registry_profile_visible(uuid),registry_manage_permissions(text,uuid,boolean,boolean),registry_link_existing_staff(text,text) TO authenticated;

-- IZVOR: 20261020000009_registry_year_workflows.sql
CREATE FUNCTION public.registry_class_enrollments(_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT registry_admin(portal_class_school(_class)) THEN RAISE EXCEPTION 'Razred nije dostupan.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',coalesce(nullif(concat_ws(' ',r.first_name,r.last_name),''),p.name),'program_id',coalesce(e.program_id,c.program_id),'program_name',pr.name,'status',e.status) ORDER BY r.last_name,p.name),'[]') FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id LEFT JOIN registry_students r ON r.id=e.registry_student_id LEFT JOIN user_profiles p ON p.id=e.student_id LEFT JOIN programs pr ON pr.id=coalesce(e.program_id,c.program_id) WHERE e.class_id=_class AND e.status='ACTIVE');
END $$;
CREATE FUNCTION public.registry_promote_enrollments(_enrollments uuid[],_target text,_date date,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entry_id uuid;e student_class_enrollments;source classes;target classes;sub record;value text;new_id uuid;result jsonb:='[]';subject_count int;
BEGIN
 IF coalesce(cardinality(_enrollments),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Odaberite od 1 do 100 upisa.';END IF;
 SELECT * INTO target FROM classes WHERE id=_target;
 IF target.id IS NULL OR NOT registry_admin(target.school_id) THEN RAISE EXCEPTION 'Ciljni razred nije dostupan.';END IF;
 FOREACH entry_id IN ARRAY _enrollments LOOP
  SELECT * INTO e FROM student_class_enrollments WHERE id=entry_id FOR UPDATE;SELECT * INTO source FROM classes WHERE id=e.class_id;
  IF source.id IS NULL OR NOT registry_admin(source.school_id) OR source.school_id<>target.school_id OR source.school_year_id=target.school_year_id OR (target.grade_level=source.grade_level+1 OR source.grade_level+1=ANY(coalesce(target.combined_grade_levels,'{}'))) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Prijelaz mora biti u viši razred nove školske godine iste ustanove.';END IF;
  IF source.is_graduating_class IS TRUE OR EXISTS(SELECT 1 FROM programs p WHERE p.id=coalesce(e.program_id,source.program_id) AND p.duration_years IS NOT NULL AND source.grade_level>=p.duration_years) THEN RAISE EXCEPTION 'Završni razred se ne prenosi u viši razred; koristite postupak nastavka obrazovanja.';END IF;
  IF NOT EXISTS(SELECT 1 FROM school_years sy JOIN school_years ty ON ty.id=target.school_year_id WHERE sy.id=source.school_year_id AND ty.starts_at>sy.starts_at) THEN RAISE EXCEPTION 'Ciljna školska godina mora započeti nakon prethodne.';END IF;
  subject_count:=0;
  FOR sub IN SELECT DISTINCT subject_id FROM student_subject_enrollments WHERE student_id=e.student_id AND class_id=source.id AND status='ACTIVE' LOOP
   subject_count:=subject_count+1;
   SELECT g.value INTO value FROM final_grades g WHERE student_id=e.student_id AND class_id=source.id AND subject_id=sub.subject_id AND upper(coalesce(term,period,'')) IN ('FINAL','YEAR','YEAR_END','GODINA','GODIŠNJA','2','2. POLUGODIŠTE','DRUGO_POLUGODISTE') ORDER BY date DESC,created_at DESC LIMIT 1;
   IF value IS NULL THEN SELECT g.grade_value INTO value FROM enrollment_final_grades g WHERE student_id=e.student_id AND class_id=source.id AND subject_id=sub.subject_id AND school_year_id=source.school_year_id ORDER BY date DESC,created_at DESC LIMIT 1;END IF;
   IF value IS NULL OR trim(value) NOT IN ('2','3','4','5') THEN RAISE EXCEPTION 'Prijelaz nije dopušten dok nedostaju pozitivne zaključne ocjene za sve upisane predmete.';END IF;
  END LOOP;
  IF subject_count=0 THEN RAISE EXCEPTION 'Nisu evidentirani predmeti; nije moguće provjeriti uvjete za viši razred.';END IF;
  new_id:=registry_change_program(e.id,target.id,coalesce(e.program_id,target.program_id),_date,_reason,false);
  UPDATE student_education_records SET record_type='PRIJELAZ_U_VIŠI_RAZRED' WHERE details->>'new_enrollment'=new_id::text AND school_id=target.school_id;
  result:=result||jsonb_build_array(jsonb_build_object('previous_enrollment',e.id,'new_enrollment',new_id));
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION public.registry_bulk_enroll(_students uuid[],_class text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c classes;student uuid;result jsonb:='[]';new_id uuid;
BEGIN
 SELECT * INTO c FROM classes WHERE id=_class;
 IF c.id IS NULL OR NOT registry_admin(c.school_id) OR coalesce(cardinality(_students),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provjerite razred, ovlasti i odabrane učenike.';END IF;
 FOREACH student IN ARRAY _students LOOP
  IF NOT registry_student_visible(student) AND NOT registry_global_admin() THEN RAISE EXCEPTION 'Učenik nije dostupan za upis.';END IF;
  IF EXISTS(SELECT 1 FROM student_class_enrollments WHERE registry_student_id=student AND ematica_status='ACTIVE' AND school_year_id=c.school_year_id) THEN RAISE EXCEPTION 'Učenik već ima aktivan upis u toj godini. Za umjetničke programe koristite pojedinačni paralelni upis.';END IF;
  -- The existing bridge remains the single linking mechanism, including its validation.
  new_id:=sync_registry_student_to_ednevnik_class(student,c.id,NULL);
  result:=result||jsonb_build_array(jsonb_build_object('student',student,'enrollment',new_id));
 END LOOP;RETURN result;
END $$;
REVOKE ALL ON FUNCTION registry_class_enrollments(text),registry_promote_enrollments(uuid[],text,date,text),registry_bulk_enroll(uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_class_enrollments(text),registry_promote_enrollments(uuid[],text,date,text),registry_bulk_enroll(uuid[],text) TO authenticated;

-- IZVOR: 20261020000010_registry_active_school.sql
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

-- IZVOR: 20261020000011_registrar_form_review.sql
ALTER TABLE registrar_school_settings ADD COLUMN IF NOT EXISTS numbering_prefix text;
-- This is a configured prefix, not an automatically invented official number.
CREATE OR REPLACE FUNCTION public.registrar_configure_settings(_name text,_stamp text,_rules text,_prefix text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 150 OR length(coalesce(_rules,''))>2000 OR length(coalesce(_prefix,''))>100 THEN RAISE EXCEPTION 'Provjerite potpisnika i pravila numeriranja.';END IF;
 IF _stamp IS NOT NULL AND (split_part(_stamp,'/',1)<>s OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='registrar-assets' AND name=_stamp)) THEN RAISE EXCEPTION 'Pečat ne pripada privatnom spremištu ustanove.';END IF;
 INSERT INTO registrar_school_settings(school_id,signer_name,stamp_path,numbering_rules,numbering_prefix,updated_by) VALUES(s,trim(_name),_stamp,_rules,nullif(trim(_prefix),''),portal_profile_id()) ON CONFLICT(school_id) DO UPDATE SET signer_name=excluded.signer_name,stamp_path=excluded.stamp_path,numbering_rules=excluded.numbering_rules,numbering_prefix=excluded.numbering_prefix,attestation_authorized=false,updated_by=excluded.updated_by,updated_at=now();
END $$;
DROP FUNCTION public.registrar_configure_settings(text,text,text);
CREATE FUNCTION public.registrar_transport_review(_year uuid,_class text,_student uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();r uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_id=s AND school_year_id=_year) THEN RAISE EXCEPTION 'Razred nije dostupan u odabranoj godini.';END IF;
 SELECT rs.id INTO r FROM student_class_enrollments e JOIN registry_students rs ON rs.id=e.registry_student_id OR (e.registry_student_id IS NULL AND rs.ednevnik_student_id=e.student_id) WHERE e.class_id=_class AND e.status='ACTIVE' AND (rs.id=_student OR e.student_id=_student) LIMIT 1;
 IF r IS NULL THEN RETURN '[]'::jsonb;END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('route_from',route_from,'route_to',route_to,'distance_km',distance_km,'carrier',carrier,'price',price,'is_practice',is_practice,'subsidy_category',subsidy_category,'benefit_evidence',benefit_evidence,'valid_until',valid_until) ORDER BY created_at),'[]') FROM student_transport_records WHERE registry_student_id=r AND school_id=s AND school_year_id=_year AND status='AKTIVNO');
END $$;
CREATE FUNCTION public.registrar_validate_registry_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prefix text;
BEGIN
 SELECT numbering_prefix INTO prefix FROM registrar_school_settings WHERE school_id=NEW.school_id;
 IF prefix IS NOT NULL AND left(NEW.registry_number,length(prefix))<>prefix THEN RAISE EXCEPTION 'Urudžbeni broj ne odgovara konfiguriranom prefiksu ustanove.';END IF;
 IF EXISTS(SELECT 1 FROM final_thesis t WHERE t.id IS DISTINCT FROM NEW.thesis_id AND t.school_year_id=NEW.school_year_id AND t.application_registry_number=NEW.registry_number AND EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=t.student_id AND c.school_id=NEW.school_id)) THEN RAISE EXCEPTION 'Broj već pripada drugom završnom radu ustanove.';END IF;RETURN NEW;
END $$;
CREATE TRIGGER registrar_validate_registry_entry BEFORE INSERT ON registrar_registry_entries FOR EACH ROW EXECUTE FUNCTION registrar_validate_registry_entry();
CREATE OR REPLACE FUNCTION public.registry_read_school(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT registry_admin(_school) AND (NOT registry_scoped_actor() OR EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=portal_profile_id() AND coalesce(p.active_school_id,(SELECT min(r.school_id) FROM user_school_roles r WHERE r.user_id=p.id AND r.role IN ('ADMIN','SCHOOL_ADMIN') AND r.status='ACTIVE' HAVING count(DISTINCT r.school_id)=1))=_school))
$$;
REVOKE ALL ON FUNCTION registrar_configure_settings(text,text,text,text),registrar_transport_review(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registrar_configure_settings(text,text,text,text),registrar_transport_review(uuid,text,uuid) TO authenticated;

-- IZVOR: 20261020000012_registrar_legacy_archive.sql
ALTER TABLE school_document_records ADD COLUMN IF NOT EXISTS legacy_certificate_id uuid REFERENCES portal_attendance_certificates(id);
CREATE UNIQUE INDEX registrar_legacy_certificate ON school_document_records(legacy_certificate_id) WHERE legacy_certificate_id IS NOT NULL;
-- This indexes existing office certificates; it does not issue them again or touch SELF codes.
INSERT INTO school_document_records(id,school_id,school_year_id,class_id,registry_student_id,student_id,document_type,status,issued_on,issued_by,created_at,note,legacy_certificate_id,snapshot,template_version)
SELECT a.id,a.school_id,c.school_year_id,a.class_id,(SELECT id FROM registry_students WHERE ednevnik_student_id=a.student_id LIMIT 1),a.student_id,'attendance','IZDANO',a.issued_at::date,a.issued_by,a.issued_at,
 'Ranije izdana potvrda: PDF se priprema iz tada spremljenih matičnih podataka.',a.id,
 jsonb_build_object('template','attendance','student',a.snapshot->'student','school',(a.snapshot->'school')||jsonb_build_object('education_level',CASE WHEN upper(a.snapshot->'school'->>'type') IN ('PRIMARY','ELEMENTARY') THEN 'ELEMENTARY' WHEN upper(a.snapshot->'school'->>'type')='HIGHER' THEN 'HIGHER' ELSE 'SECONDARY' END),'class',a.snapshot->'class','year',jsonb_build_object('name',a.snapshot->'class'->>'school_year'),'program',a.snapshot->'program','settings',a.snapshot->'settings','inputs',jsonb_build_object('purpose',a.purpose,'attest',false),'prepared_at',a.issued_at,'legacy_certificate_id',a.id,'legacy_visual_stamp',nullif(a.snapshot->'settings'->>'stamp_url','') IS NOT NULL OR s.id='srednja-kola-glina-zagreb'),
 'LEGACY_SNAPSHOT'
FROM portal_attendance_certificates a JOIN classes c ON c.id=a.class_id AND c.school_id=a.school_id JOIN schools s ON s.id=a.school_id WHERE a.mode='SCHOOL'
ON CONFLICT DO NOTHING;

-- IZVOR: 20261020000013_registry_integrity.sql
-- Legacy SECURITY DEFINER workflows must respect the same school boundary on writes.
CREATE FUNCTION public.registry_write_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;old_j jsonb;school text;old_school text;student uuid;
BEGIN
 IF registrar_is_user() THEN RAISE EXCEPTION 'Matične zapise mijenjaju ovlašteni korisnici e-Matice.';END IF;
 IF NOT registry_scoped_actor() THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN old_j:=to_jsonb(OLD);END IF;
 IF TG_TABLE_NAME='registry_students' THEN
  IF TG_OP IN ('UPDATE','DELETE') AND NOT registry_student_visible(OLD.id) THEN RAISE EXCEPTION 'Matični zapis učenika nije dostupan vašoj ustanovi.';END IF;
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid();END IF;IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 school:=CASE WHEN TG_TABLE_NAME IN ('student_class_enrollments','grades','final_grades','enrollment_final_grades','special_exams') THEN portal_class_school(j->>'class_id') WHEN TG_TABLE_NAME='schools' THEN j->>'id' ELSE j->>'school_id' END;
 old_school:=CASE WHEN TG_TABLE_NAME IN ('student_class_enrollments','grades','final_grades','enrollment_final_grades','special_exams') THEN portal_class_school(old_j->>'class_id') WHEN TG_TABLE_NAME='schools' THEN old_j->>'id' ELSE old_j->>'school_id' END;
 IF school IS NULL OR NOT registry_admin(school) OR (TG_OP IN ('UPDATE','DELETE') AND old_school IS NOT NULL AND NOT registry_admin(old_school)) THEN RAISE EXCEPTION 'Zapis ne pripada ustanovi za koju imate ovlasti.';END IF;
 student:=nullif(j->>'registry_student_id','')::uuid;
 IF TG_TABLE_NAME='student_school_enrollments' THEN student:=nullif(j->>'student_id','')::uuid;END IF;
 IF student IS NOT NULL AND NOT registry_student_visible(student) THEN RAISE EXCEPTION 'Učenik nije dostupan za ovu promjenu.';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text;relation_kind "char";BEGIN
 FOREACH t IN ARRAY ARRAY['schools','registry_students','student_class_enrollments','student_school_enrollments','classes','programs','school_years','student_year_end_summaries','student_certificates','grades','final_grades','enrollment_final_grades','special_exams'] LOOP
  SELECT c.relkind INTO relation_kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t;
  IF relation_kind IN ('r','p') THEN
   EXECUTE format('CREATE TRIGGER registry_write_scope BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION registry_write_scope_guard()',t);
  ELSIF relation_kind='v' THEN
   -- Views inherit the caller's access to their underlying tables. In particular,
   -- enrollment_final_grades is a view; its definition must remain unchanged.
   EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',t);
  ELSE
   RAISE EXCEPTION 'Nepodržana ili nedostajuća relacija public.% (vrsta: %).',t,coalesce(relation_kind::text,'nedostaje');
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.registry_certificate_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE person registry_students;school schools;program_name text;
BEGIN
 IF NEW.status='ISSUED' AND EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id JOIN programs p ON p.id=coalesce(e.program_id,c.program_id) WHERE e.registry_student_id=NEW.registry_student_id AND e.class_id=NEW.class_id AND p.code='770004' AND e.status='ACTIVE') THEN RAISE EXCEPTION 'Za zajednički općeobrazovni dio umjetničkog programa ova ustanova ne izdaje zasebnu svjedodžbu.';END IF;
 IF TG_OP='UPDATE' AND OLD.status='ISSUED' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.registry_student_id<>OLD.registry_student_id OR NEW.class_id IS DISTINCT FROM OLD.class_id OR NEW.school_id IS DISTINCT FROM OLD.school_id) THEN RAISE EXCEPTION 'Izdanu svjedodžbu najprije stornirajte kroz upravni postupak.';END IF;
 IF TG_OP='UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN RETURN NEW;END IF;
 SELECT * INTO person FROM registry_students WHERE id=NEW.registry_student_id;SELECT * INTO school FROM schools WHERE id=NEW.school_id;
 SELECT p.name INTO program_name FROM classes c LEFT JOIN student_class_enrollments e ON e.class_id=c.id AND e.registry_student_id=NEW.registry_student_id JOIN programs p ON p.id=coalesce(e.program_id,c.program_id) WHERE c.id=NEW.class_id AND p.school_id=NEW.school_id ORDER BY (e.status='ACTIVE') DESC,e.enrolled_on DESC NULLS LAST,e.created_at DESC NULLS LAST LIMIT 1;
 NEW.payload:=coalesce(NEW.payload,'{}')||jsonb_build_object('birth_place',person.birth_place,'birth_country',person.birth_country,'citizenship',person.citizenship,'parent_guardian_name',person.parent_guardian_name,'date_of_birth',person.date_of_birth,'gender',person.gender,'school_oib',school.oib,'school_city',school.city,'issue_city',school.city,'program_name',program_name);
 RETURN NEW;
END $$;
CREATE TRIGGER registry_certificate_snapshot BEFORE INSERT OR UPDATE ON student_certificates FOR EACH ROW EXECUTE FUNCTION registry_certificate_snapshot();
CREATE FUNCTION public.registry_release() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('version','2026.10.20.registry.1','qualified_sealing_connected',false) $$;
REVOKE ALL ON FUNCTION registry_release() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_release() TO authenticated;

-- IZVOR: 20261020000014_registrar_legacy_rpc_boundary.sql
-- Keep dedicated registrar accounts out of pre-existing privileged e-Matica RPCs.
-- Other accounts keep the same function signatures, bodies, grants and return types.
CREATE FUNCTION public.registry_require_non_registrar() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF registrar_is_user() OR (current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL) THEN RAISE EXCEPTION 'Ovaj postupak nije dostupan u Školskoj referadi.';END IF;
END $$;
REVOKE ALL ON FUNCTION registry_require_non_registrar() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_require_non_registrar() TO authenticated;
DO $guard$
DECLARE f record;source text;definition text;
BEGIN
 FOR f IN SELECT p.oid,p.prosrc,p.proname,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND p.prosecdef AND l.lanname IN ('sql','plpgsql') AND p.proname=ANY(ARRAY[
 'admin_create_user','update_admission_application_status','create_class_admission_applications','set_transition_target_class',
 'sync_registry_student_to_ednevnik_class','transfer_registry_student','pull_class_year_end_to_ematica','delete_student_certificate',
 'get_my_admission_pin_status','sync_ednevnik_class_to_ematica','sync_admission_candidate_grade_summaries','calculate_admission_rankings',
 'apply_registry_student_class_flags','issue_student_certificate','continue_paid_education','get_active_school_year',
 'promote_school_year_students','update_student_transfer_workflow','set_registry_student_status','delete_student_class_enrollment',
 'mark_registry_student_dropped_out','update_student_certificate_status','update_admission_candidate_workflow',
 'generate_student_certificate','upsert_admission_choice','submit_admission_candidate','delete_admission_choice',
 'pull_ednevnik_year_end_to_ematica','link_registry_student_to_ednevnik','enroll_accepted_admission_candidates',
 'delete_student_transfer','update_student_class_enrollment_status','create_next_school_year_classes','create_class_admission_candidates',
 'sync_ednevnik_student_to_ematica']) LOOP
  IF position('registry_require_non_registrar' IN f.prosrc)>0 THEN CONTINUE;END IF;
  IF f.lanname='plpgsql' THEN
   source:=regexp_replace(f.prosrc,'\mBEGIN\M','BEGIN PERFORM public.registry_require_non_registrar();','i');
   IF source=f.prosrc THEN RAISE EXCEPTION 'Nije pronađen početak funkcije %; provjerite migraciju prije aktivacije.',f.proname;END IF;
  ELSE source:='SELECT public.registry_require_non_registrar();'||chr(10)||f.prosrc;END IF;
  definition:=replace(pg_get_functiondef(f.oid),f.prosrc,source);
  EXECUTE definition;
 END LOOP;
END $guard$;

COMMIT;
NOTIFY pgrst,'reload schema';
