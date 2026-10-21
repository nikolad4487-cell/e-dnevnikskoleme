BEGIN;
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
COMMIT;
NOTIFY pgrst,'reload schema';
