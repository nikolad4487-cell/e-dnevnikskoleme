BEGIN;
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
COMMIT;
NOTIFY pgrst,'reload schema';
