BEGIN;
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
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['schools','registry_students','student_class_enrollments','student_school_enrollments','classes','programs','school_years','student_year_end_summaries','student_certificates','grades','final_grades','enrollment_final_grades','special_exams'] LOOP
  EXECUTE format('CREATE TRIGGER registry_write_scope BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION registry_write_scope_guard()',t);
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
COMMIT;
NOTIFY pgrst,'reload schema';
