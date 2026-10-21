BEGIN;
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
COMMIT;
NOTIFY pgrst,'reload schema';
