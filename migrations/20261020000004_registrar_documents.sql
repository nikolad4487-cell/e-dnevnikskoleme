BEGIN;
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
COMMIT;
NOTIFY pgrst,'reload schema';
