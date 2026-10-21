BEGIN;
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
COMMIT;
NOTIFY pgrst,'reload schema';
