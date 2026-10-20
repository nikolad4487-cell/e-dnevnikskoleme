BEGIN;
CREATE TABLE public.portal_attendance_certificates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.user_profiles(id), class_id text NOT NULL REFERENCES public.classes(id),school_id text NOT NULL REFERENCES public.schools(id),
 issued_by uuid NOT NULL REFERENCES public.user_profiles(id),mode text NOT NULL CHECK(mode IN ('SELF','SCHOOL')),purpose text NOT NULL,snapshot jsonb NOT NULL,
 verification jsonb NOT NULL,issued_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '3 months'
);
ALTER TABLE portal_attendance_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_read ON portal_attendance_certificates FOR SELECT TO authenticated USING(portal_admin(school_id) OR portal_profile_id()=student_id OR portal_linked(student_id,school_id));
REVOKE ALL ON portal_attendance_certificates FROM anon,authenticated;
GRANT SELECT ON portal_attendance_certificates TO authenticated;
CREATE FUNCTION public.portal_office_access(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT portal_admin(_school) $$;
CREATE FUNCTION public.portal_attestation_data(_school text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '{}'::jsonb $$;
REVOKE ALL ON FUNCTION portal_office_access(text),portal_attestation_data(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION portal_office_access(text),portal_attestation_data(text) TO authenticated;
CREATE FUNCTION public.portal_issue_attendance(_student uuid,_class text,_purpose text,_mode text DEFAULT 'SELF') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c classes;p user_profiles;s schools;e student_class_enrollments;cfg jsonb;program_name text;cert portal_attendance_certificates;v jsonb;control text;rid text;
BEGIN
 SELECT * INTO c FROM classes WHERE id=_class;
 IF c.id IS NULL OR portal_profile_id() IS NULL OR _mode NOT IN ('SELF','SCHOOL') THEN RAISE EXCEPTION 'Provjerite prijavu, razred i način izdavanja.'; END IF;
 IF _mode='SCHOOL' THEN IF portal_office_access(c.school_id) IS NOT TRUE THEN RAISE EXCEPTION 'Potvrdu referade može izdati administrator škole.'; END IF;
 ELSE IF portal_profile_id()<>_student AND NOT portal_linked(_student,c.school_id) THEN RAISE EXCEPTION 'Nemate pristup potvrdi za odabrano dijete.'; END IF; END IF;
 IF _purpose IS NULL OR length(trim(_purpose)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Odaberite svrhu potvrde.'; END IF;
 SELECT * INTO e FROM student_class_enrollments WHERE student_id=_student AND class_id=_class AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Učenik nema aktivan upis u odabrani razred.'; END IF;
 SELECT * INTO p FROM user_profiles WHERE id=_student;SELECT * INTO s FROM schools WHERE id=c.school_id;
 SELECT name INTO program_name FROM programs WHERE id=COALESCE(e.program_id,c.program_id);
 SELECT jsonb_build_object('school_name',COALESCE(NULLIF(school_name_print,''),NULLIF(school_name,''),s.name),'city',COALESCE(NULLIF(city,''),s.city),'principal_name',principal_name,'principal_title',principal_title,'stamp_url',COALESCE(NULLIF(stamp_url,''),NULLIF(stamp_image_url,''))) INTO cfg FROM school_document_settings WHERE school_id=c.school_id LIMIT 1;
 cfg:=COALESCE(cfg,jsonb_build_object('school_name',s.name,'city',s.city))||CASE WHEN _mode='SCHOOL' THEN portal_attestation_data(c.school_id) ELSE '{}'::jsonb END;
 -- This graphic belongs to this school only; never use another school's stamp as a fallback.
 IF c.school_id='srednja-kola-glina-zagreb' THEN cfg:=cfg||jsonb_build_object('stamp_url','/stamps/srednja-skola-glina.png'); END IF;
 control:=lpad((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,15))::bit(60)::bigint%1000000000)::text,9,'0');
 rid:=extract(year FROM now())::text||'-'||replace(gen_random_uuid()::text,'-','');
 v:=jsonb_build_object('serialNumber',gen_random_uuid()::text,'recordNumber',rid,'controlNumber',substr(control,1,3)||'-'||substr(control,4,3)||'-'||substr(control,7,3),'seal',replace(gen_random_uuid()::text,'-',''));
 INSERT INTO portal_attendance_certificates(student_id,class_id,school_id,issued_by,mode,purpose,snapshot,verification)
 VALUES(_student,_class,c.school_id,portal_profile_id(),_mode,trim(_purpose),jsonb_build_object('student',jsonb_build_object('id',p.id,'name',p.name,'oib',p.oib,'dob',p.dob,'birthplace',COALESCE(p.birthplace,p.pob),'birth_country',p.birth_country,'address',p.address,'gender',p.gender),'class',jsonb_build_object('id',c.id,'name',c.name,'school_year',c.school_year,'grade_level',c.grade_level),'school',jsonb_build_object('id',s.id,'name',s.name,'city',s.city,'type',s.type),'program',jsonb_build_object('name',program_name),'settings',cfg),v) RETURNING * INTO cert;
 RETURN to_jsonb(cert);
END $$;
CREATE FUNCTION public.portal_verify_attendance(_record text,_control text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT jsonb_build_object('valid',true,'issuer',snapshot->'settings'->>'school_name','issuedAt',issued_at,'expiresAt',expires_at) FROM portal_attendance_certificates WHERE mode='SELF' AND verification->>'recordNumber'=_record AND verification->>'controlNumber'=_control AND expires_at>now()),jsonb_build_object('valid',false))
$$;
REVOKE ALL ON FUNCTION portal_issue_attendance(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION portal_issue_attendance(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION portal_verify_attendance(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_verify_attendance(text,text) TO anon,authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
