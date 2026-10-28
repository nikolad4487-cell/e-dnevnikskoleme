BEGIN;
-- A view must apply the caller's existing restrictive policies, including
-- delayed family grade visibility and the active school of registry staff.
-- Some older installations do not have the optional admissions/textbook views.
DO $$ DECLARE view_name text; BEGIN
 FOREACH view_name IN ARRAY ARRAY[
  'active_classes_for_students','active_classes_current_year',
  'v_admission_candidates_detailed','v_admission_offerings',
  'v_admission_choices_detailed','enrollment_grade_summary',
  'enrollment_student_profiles','v_admission_applications_detailed',
  'v_admissions_secondary_eligible','v_admissions_higher_eligible',
  'v_admission_candidate_grade_summaries','v_textbook_records_detailed'
 ] LOOP
  IF EXISTS(SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=view_name) THEN
   EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',view_name);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',view_name);
  END IF;
 END LOOP;
END $$;
-- Constant helper needs no application schema; the trigger is not an RPC.
ALTER FUNCTION public.school_aux_collections() SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION public.school_thesis_guard() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
