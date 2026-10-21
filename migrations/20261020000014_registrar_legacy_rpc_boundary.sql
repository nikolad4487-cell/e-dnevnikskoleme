BEGIN;
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
