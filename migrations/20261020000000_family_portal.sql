-- Family portal. Apply once in Supabase SQL Editor before enabling the new routes.
-- All request mutations are transactional RPCs; clients cannot update official absence status.
BEGIN;
CREATE TABLE IF NOT EXISTS public.parent_child_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid NOT NULL REFERENCES public.user_profiles(id),
 child_id uuid NOT NULL REFERENCES public.user_profiles(id), school_id text NOT NULL REFERENCES public.schools(id),
 relationship text NOT NULL DEFAULT 'Roditelj', created_by uuid REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(parent_id,child_id,school_id), CHECK(parent_id<>child_id)
);
CREATE TABLE public.family_absence_requests (
 id uuid PRIMARY KEY, parent_id uuid NOT NULL REFERENCES public.user_profiles(id), student_id uuid NOT NULL REFERENCES public.user_profiles(id),
 class_id text NOT NULL REFERENCES public.classes(id), school_id text NOT NULL REFERENCES public.schools(id),
 days jsonb NOT NULL, parent_note text NOT NULL DEFAULT '', attachment_path text, attachment_name text,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','PROCESSED','CANCELLED')),
 teacher_note text NOT NULL DEFAULT '', processed_by uuid REFERENCES public.user_profiles(id), processed_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_requests_class ON public.family_absence_requests(class_id,status,created_at DESC);
CREATE INDEX family_requests_parent ON public.family_absence_requests(parent_id,student_id,created_at DESC);
CREATE TABLE public.portal_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.user_profiles(id),
 student_id uuid REFERENCES public.user_profiles(id), class_id text REFERENCES public.classes(id), title text NOT NULL, body text NOT NULL DEFAULT '', link text NOT NULL, request_id uuid REFERENCES public.family_absence_requests(id),
 is_read boolean NOT NULL DEFAULT false, visible_at timestamptz NOT NULL DEFAULT now(), grade_id uuid REFERENCES public.grades(id) ON DELETE CASCADE, absence_id uuid REFERENCES public.absences(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_notifications_user ON public.portal_notifications(user_id,created_at DESC);
CREATE TABLE public.family_request_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.family_absence_requests(id),
 actor_id uuid NOT NULL REFERENCES public.user_profiles(id), action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.portal_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT id FROM public.user_profiles WHERE auth_user_id=auth.uid() OR (id=auth.uid() AND auth_user_id IS NULL)
 ORDER BY (auth_user_id=auth.uid()) DESC NULLS LAST LIMIT 1
$$;
CREATE FUNCTION public.portal_admin(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=portal_profile_id() AND (p.role IN ('MAIN_ADMIN','SUPER_ADMIN') OR p.access_role IN ('MAIN_ADMIN','SUPER_ADMIN')))
 OR EXISTS(SELECT 1 FROM user_school_roles r WHERE r.user_id=portal_profile_id() AND r.school_id=_school AND r.status='ACTIVE' AND r.role IN ('ADMIN','SCHOOL_ADMIN'))
$$;
CREATE FUNCTION public.portal_class_school(_class text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT school_id FROM classes WHERE id=_class $$;
CREATE FUNCTION public.portal_class_manager(_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM classes c WHERE c.id=_class AND (portal_admin(c.school_id) OR portal_profile_id() IN (c.homeroom_teacher_id,c.deputy_teacher_id,c.deputy_homeroom_teacher_id)))
$$;
CREATE FUNCTION public.portal_linked(_student uuid,_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM parent_child_relationships r WHERE r.parent_id=portal_profile_id() AND r.child_id=_student AND r.school_id=_school)
$$;
CREATE FUNCTION public.portal_student_reader(_student uuid,_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT portal_profile_id()=_student OR EXISTS(SELECT 1 FROM classes c WHERE c.id=_class AND (
 portal_class_manager(c.id) OR portal_linked(_student,c.school_id)
 OR EXISTS(SELECT 1 FROM class_subject_teachers t WHERE t.class_id=c.id AND t.teacher_id=portal_profile_id())
 OR EXISTS(SELECT 1 FROM user_school_roles r WHERE r.user_id=portal_profile_id() AND r.school_id=c.school_id AND r.status='ACTIVE' AND r.role IN ('PRINCIPAL','PEDAGOGUE','PSYCHOLOGIST','EXPERT','STAFF'))))
$$;
-- RLS on these tables is the only direct client entry point; no broad ALL policy.
ALTER TABLE parent_child_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_request_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY family_links_read ON parent_child_relationships FOR SELECT TO authenticated USING(parent_id=portal_profile_id() OR portal_admin(school_id) OR EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.student_id=child_id AND portal_class_manager(e.class_id)));
CREATE POLICY family_requests_read ON family_absence_requests FOR SELECT TO authenticated USING(portal_linked(student_id,school_id) AND parent_id=portal_profile_id() OR portal_class_manager(class_id));
CREATE POLICY family_notifications_read ON portal_notifications FOR SELECT TO authenticated USING(user_id=portal_profile_id() AND visible_at<=now());
CREATE POLICY family_notifications_update ON portal_notifications FOR UPDATE TO authenticated USING(user_id=portal_profile_id() AND visible_at<=now()) WITH CHECK(user_id=portal_profile_id() AND visible_at<=now());
CREATE POLICY family_audit_read ON family_request_audit FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM family_absence_requests r WHERE r.id=request_id AND portal_class_manager(r.class_id)));
REVOKE ALL ON parent_child_relationships,family_absence_requests,family_request_audit FROM anon,authenticated;
GRANT SELECT ON parent_child_relationships,family_absence_requests,family_request_audit TO authenticated;
GRANT SELECT ON portal_notifications TO authenticated;
GRANT UPDATE(is_read) ON portal_notifications TO authenticated;

CREATE FUNCTION public.family_children() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'school_id',r.school_id,'relationship',r.relationship)),'[]'::jsonb)
 FROM parent_child_relationships r JOIN user_profiles p ON p.id=r.child_id WHERE r.parent_id=portal_profile_id()
$$;
CREATE FUNCTION public.family_manage_context(_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_class_manager(_class) THEN RAISE EXCEPTION 'Nemate ovlasti za upravljanje roditeljima ovog razreda.'; END IF;
 RETURN jsonb_build_object(
 'students',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)),'[]') FROM student_class_enrollments e JOIN user_profiles p ON p.id=e.student_id WHERE e.class_id=_class AND e.status='ACTIVE'),
 'parents',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email)),'[]') FROM user_profiles p WHERE (p.role='PARENT' AND p.school_id=(SELECT school_id FROM classes WHERE id=_class)) OR EXISTS(SELECT 1 FROM user_school_roles r JOIN classes c ON c.school_id=r.school_id WHERE c.id=_class AND r.user_id=p.id AND r.role='PARENT' AND r.status='ACTIVE')),
 'links',(SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM parent_child_relationships r JOIN classes c ON c.school_id=r.school_id WHERE c.id=_class AND EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.class_id=c.id AND e.student_id=r.child_id))
 );
END $$;
CREATE FUNCTION public.family_set_link(_class text,_parent uuid,_student uuid,_relationship text,_remove boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _school text;
BEGIN
 IF NOT portal_class_manager(_class) THEN RAISE EXCEPTION 'Nemate ovlasti za povezivanje roditelja.'; END IF;
 SELECT school_id INTO _school FROM classes WHERE id=_class;
 IF NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student) THEN RAISE EXCEPTION 'Učenik nije u razredu.'; END IF;
 IF _remove THEN DELETE FROM parent_child_relationships WHERE parent_id=_parent AND child_id=_student AND school_id=_school; RETURN; END IF;
 IF _parent=_student OR NOT EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=_parent AND ((p.role='PARENT' AND p.school_id=_school) OR EXISTS(SELECT 1 FROM user_school_roles r WHERE r.user_id=p.id AND r.school_id=_school AND r.role='PARENT' AND r.status='ACTIVE'))) THEN RAISE EXCEPTION 'Odaberite roditeljski račun.'; END IF;
 IF _relationship IS NULL OR length(trim(_relationship)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Provjerite odnos roditelja/skrbnika.'; END IF;
 INSERT INTO parent_child_relationships(parent_id,child_id,school_id,relationship,created_by) VALUES(_parent,_student,_school,trim(_relationship),portal_profile_id()) ON CONFLICT(parent_id,child_id,school_id) DO UPDATE SET relationship=excluded.relationship;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_parent AND school_id=_school AND role='PARENT' AND status='ACTIVE') THEN
 INSERT INTO user_school_roles(user_id,school_id,role,status) VALUES(_parent,_school,'PARENT','ACTIVE'); END IF;
END $$;
CREATE FUNCTION public.family_workday(_class text,_day date) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w record; s text;
BEGIN
 SELECT school_id INTO s FROM classes WHERE id=_class;
 IF EXISTS(SELECT 1 FROM school_events WHERE school_id=s AND _day BETWEEN start_date AND end_date AND is_instructional_day=false) THEN RETURN false; END IF;
 SELECT * INTO w FROM work_weeks WHERE class_id=_class AND _day BETWEEN start_date AND end_date ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
   IF w.is_teaching_week=false OR w.is_instructional=false OR w.week_type='SCHOOL_HOLIDAY' THEN RETURN false; END IF;
   IF cardinality(w.teaching_days)>0 THEN RETURN _day=ANY(w.teaching_days); END IF;
 END IF;
 RETURN extract(isodow FROM _day) BETWEEN 1 AND 5;
END $$;
CREATE FUNCTION public.family_save_request(_id uuid,_student uuid,_class text,_days jsonb,_note text,_attachment_path text DEFAULT NULL,_attachment_name text DEFAULT NULL,_version integer DEFAULT 0) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _me uuid:=portal_profile_id(); _school text; oldrow family_absence_requests; d jsonb; aid text; a absences;
 _date date; _previous date; _next date; _run integer:=0; _maxrun integer:=0; _seen uuid[]:='{}'; _ids uuid[]:='{}'; _teachers uuid[]; _required integer;
BEGIN
 SELECT school_id INTO _school FROM classes WHERE id=_class;
 IF _me IS NULL OR NOT portal_linked(_student,_school) OR NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student AND status='ACTIVE') THEN RAISE EXCEPTION 'Nemate pristup ovom učeniku i razredu.'; END IF;
 IF jsonb_typeof(_days) IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(_days),0) NOT BETWEEN 1 AND 60 OR _note IS NULL OR length(_note)>5000 THEN RAISE EXCEPTION 'Odaberite dane i provjerite napomenu.'; END IF;
 -- Serialize all requests/decisions for the same student; prevents concurrent overlapping submissions.
 PERFORM pg_advisory_xact_lock(hashtextextended(_student::text,0));
 SELECT * INTO oldrow FROM family_absence_requests WHERE id=_id FOR UPDATE;
 IF FOUND AND (oldrow.parent_id<>_me OR oldrow.student_id<>_student OR oldrow.class_id<>_class OR oldrow.status<>'SUBMITTED' OR oldrow.version IS DISTINCT FROM _version) THEN RAISE EXCEPTION 'Zahtjev je promijenjen ili obrađen. Osvježite prikaz.'; END IF;
 IF NOT FOUND AND _version<>0 THEN RAISE EXCEPTION 'Zahtjev više nije dostupan.'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(_days) ORDER BY value->>'date' LOOP
  _date:=(d->>'date')::date;
  IF _date IS NULL OR _date>(now() AT TIME ZONE 'Europe/Zagreb')::date OR COALESCE(d->>'status','') NOT IN ('JUSTIFIED','UNJUSTIFIED','OTHER') OR COALESCE(d->>'type','') NOT IN ('Bolest - roditelj','Bolest - liječnik','Smrtni slučaj','Natjecanje','Promet','Obiteljski razlog','Ostalo') OR COALESCE(jsonb_array_length(d->'absenceIds'),0)=0 THEN RAISE EXCEPTION 'Provjerite dan, status i tip izostanka.'; END IF;
  IF _previous=_date THEN RAISE EXCEPTION 'Dan je naveden više puta.'; END IF;
  FOR aid IN SELECT jsonb_array_elements_text(d->'absenceIds') LOOP
   SELECT * INTO a FROM absences WHERE id=aid::uuid AND student_id=_student AND class_id=_class AND date=_date FOR UPDATE;
   IF NOT FOUND OR upper(a.status) NOT IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU') OR a.id=ANY(_seen) THEN RAISE EXCEPTION 'Izostanak ne čeka odluku ili nije dostupan.'; END IF;
   _seen:=array_append(_seen,a.id);
  END LOOP;
  SELECT count(*) INTO _required FROM absences WHERE student_id=_student AND class_id=_class AND date=_date AND upper(status) IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU');
  IF _required<>jsonb_array_length(d->'absenceIds') THEN RAISE EXCEPTION 'Odabrani dan se promijenio. Ponovno učitajte izostanke.'; END IF;
  _next:=_previous+1;
  IF _previous IS NOT NULL THEN WHILE _next<_date AND NOT family_workday(_class,_next) LOOP _next:=_next+1; END LOOP; END IF;
  _run:=CASE WHEN _next=_date THEN _run+1 ELSE 1 END; _maxrun:=greatest(_maxrun,_run); _previous:=_date;
 END LOOP;
 IF EXISTS(SELECT 1 FROM family_absence_requests r CROSS JOIN LATERAL jsonb_array_elements(r.days) x CROSS JOIN LATERAL jsonb_array_elements_text(x->'absenceIds') z WHERE r.student_id=_student AND r.id<>_id AND r.status='SUBMITTED' AND z::uuid=ANY(_seen)) THEN RAISE EXCEPTION 'Za ove izostanke već postoji neobrađeni zahtjev.'; END IF;
 IF _maxrun>3 AND COALESCE(_attachment_path,'')='' THEN RAISE EXCEPTION 'Za više od tri uzastopna radna dana priložite ispričnicu.'; END IF;
 IF _attachment_path IS NOT NULL AND (left(_attachment_path,length(_me::text||'/'||_id::text||'/'))<>_me::text||'/'||_id::text||'/' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='absence-notes' AND name=_attachment_path)) THEN RAISE EXCEPTION 'Ispričnica nije pravilno priložena.'; END IF;
 INSERT INTO family_absence_requests(id,parent_id,student_id,class_id,school_id,days,parent_note,attachment_path,attachment_name)
 VALUES(_id,_me,_student,_class,_school,_days,trim(_note),_attachment_path,left(_attachment_name,200))
 ON CONFLICT(id) DO UPDATE SET days=excluded.days,parent_note=excluded.parent_note,attachment_path=excluded.attachment_path,attachment_name=excluded.attachment_name,version=family_absence_requests.version+1,updated_at=now();
 INSERT INTO family_request_audit(request_id,actor_id,action,details) VALUES(_id,_me,CASE WHEN oldrow.id IS NULL THEN 'SUBMIT' ELSE 'EDIT' END,jsonb_build_object('days',_days,'note',trim(_note),'attachment',_attachment_path));
 SELECT array_remove(ARRAY[c.homeroom_teacher_id,c.deputy_teacher_id,c.deputy_homeroom_teacher_id],NULL) INTO _teachers FROM classes c WHERE c.id=_class;
 INSERT INTO portal_notifications(user_id,title,body,link,request_id) SELECT DISTINCT t,'Zahtjev za opravdavanje izostanaka','Zaprimljen je roditeljski zahtjev.','/class/'||_class||'/zahtjevi-izostanaka',_id FROM unnest(_teachers) t;
 RETURN _id;
END $$;
CREATE FUNCTION public.family_cancel_request(_id uuid,_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r family_absence_requests;
BEGIN
 SELECT * INTO r FROM family_absence_requests WHERE id=_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.student_id::text,0));
 UPDATE family_absence_requests SET status='CANCELLED',version=version+1,updated_at=now() WHERE id=_id AND parent_id=portal_profile_id() AND portal_linked(student_id,school_id) AND status='SUBMITTED' AND version=_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Zahtjev je promijenjen ili obrađen.'; END IF;
 INSERT INTO family_request_audit(request_id,actor_id,action,details) VALUES(_id,portal_profile_id(),'CANCEL','{}');
END $$;
CREATE FUNCTION public.family_process_request(_id uuid,_version integer,_days jsonb,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r family_absence_requests; d jsonb; previous jsonb; aid text; changed integer; expected integer:=0; done integer:=0;
BEGIN
 SELECT * INTO r FROM family_absence_requests WHERE id=_id;
 IF r.id IS NULL OR NOT portal_class_manager(r.class_id) THEN RAISE EXCEPTION 'Zahtjev nije dostupan.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.student_id::text,0));
 SELECT * INTO r FROM family_absence_requests WHERE id=_id FOR UPDATE;
 IF r.status<>'SUBMITTED' OR r.version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Zahtjev je već obrađen ili promijenjen.'; END IF;
 IF _note IS NULL OR length(_note)>5000 OR jsonb_typeof(_days) IS DISTINCT FROM 'array' OR jsonb_array_length(_days)<>jsonb_array_length(r.days) THEN RAISE EXCEPTION 'Provjerite dane i bilješku.'; END IF;
 FOR previous IN SELECT value FROM jsonb_array_elements(r.days) LOOP
  SELECT value INTO d FROM jsonb_array_elements(_days) WHERE value->>'date'=previous->>'date';
  IF d IS NULL OR COALESCE(d->>'status','') NOT IN ('JUSTIFIED','UNJUSTIFIED','OTHER') OR COALESCE(d->>'type','') NOT IN ('Bolest - roditelj','Bolest - liječnik','Smrtni slučaj','Natjecanje','Promet','Obiteljski razlog','Ostalo') THEN RAISE EXCEPTION 'Nedostaje status ili tip za odabrani dan.'; END IF;
  FOR aid IN SELECT jsonb_array_elements_text(previous->'absenceIds') LOOP
   UPDATE absences SET status=d->>'status',absence_type=d->>'type',note=NULLIF(trim(COALESCE(d->>'reason','')),''),resolved_by=portal_profile_id(),resolved_at=now(),justified_by=portal_profile_id(),updated_at=now()
   WHERE id=aid::uuid AND student_id=r.student_id AND class_id=r.class_id AND date=(previous->>'date')::date AND upper(status) IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU');
   GET DIAGNOSTICS changed=ROW_COUNT; expected:=expected+1; done:=done+changed;
  END LOOP;
 END LOOP;
 IF expected<>done THEN RAISE EXCEPTION 'Neki izostanci su već promijenjeni. Obrada je poništena; provjerite redovnu evidenciju.'; END IF;
 UPDATE family_absence_requests SET status='PROCESSED',days=(SELECT jsonb_agg(old.value||jsonb_build_object('status',new.value->>'status','type',new.value->>'type','reason',left(COALESCE(new.value->>'reason',''),1000))) FROM jsonb_array_elements(r.days) old JOIN jsonb_array_elements(_days) new ON old.value->>'date'=new.value->>'date'),teacher_note=trim(_note),processed_by=portal_profile_id(),processed_at=now(),updated_at=now(),version=version+1 WHERE id=_id;
 INSERT INTO family_request_audit(request_id,actor_id,action,details) VALUES(_id,portal_profile_id(),'PROCESS',jsonb_build_object('parentProposal',r.days,'decision',_days,'note',trim(_note)));
 INSERT INTO portal_notifications(user_id,title,body,link,request_id) VALUES(r.parent_id,'Zahtjev za izostanke je obrađen',left(_note,250),'/student/opravdavanje',_id);
END $$;
CREATE FUNCTION public.family_request_names(_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_class_manager(_class) THEN RAISE EXCEPTION 'Nemate pristup zahtjevima.'; END IF;
 RETURN (SELECT COALESCE(jsonb_object_agg(p.id,p.name),'{}') FROM user_profiles p WHERE EXISTS(SELECT 1 FROM family_absence_requests r WHERE r.class_id=_class AND p.id IN(r.student_id,r.parent_id)));
END $$;
-- Private upload/download. Parents keep access only while their child link remains active.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('absence-notes','absence-notes',false,10485760,ARRAY['image/jpeg','image/png','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
CREATE POLICY absence_note_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='absence-notes' AND split_part(name,'/',1)=portal_profile_id()::text AND EXISTS(SELECT 1 FROM parent_child_relationships WHERE parent_id=portal_profile_id()));
CREATE POLICY absence_note_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='absence-notes' AND (EXISTS(SELECT 1 FROM family_absence_requests r WHERE r.attachment_path=name AND r.parent_id=portal_profile_id() AND portal_linked(r.student_id,r.school_id)) OR EXISTS(SELECT 1 FROM family_absence_requests r WHERE r.attachment_path=name AND portal_class_manager(r.class_id))));
CREATE POLICY absence_note_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='absence-notes' AND split_part(name,'/',1)=portal_profile_id()::text AND NOT EXISTS(SELECT 1 FROM family_absence_requests WHERE attachment_path=name AND status<>'CANCELLED'));
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON grades,final_grades,absences,student_notes FROM anon;
CREATE POLICY family_grades_read ON grades FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
CREATE POLICY family_final_grades_read ON final_grades FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
CREATE POLICY family_absences_read ON absences FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
CREATE POLICY family_student_notes_read ON student_notes FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
CREATE POLICY family_final_grade_visibility ON final_grades AS RESTRICTIVE FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id) AND (portal_profile_id()=student_id OR NOT portal_linked(student_id,portal_class_school(final_grades.class_id)) OR created_at<=now()-interval '48 hours' OR portal_class_manager(class_id)));
-- A restrictive policy combines with every pre-existing permissive SELECT/ALL policy.
-- It prevents an old broad development policy from exposing recent grades to parents.
CREATE POLICY family_grade_visibility ON grades AS RESTRICTIVE FOR SELECT TO authenticated USING(
 portal_student_reader(student_id,class_id) AND (
 portal_profile_id()=student_id OR NOT portal_linked(student_id,portal_class_school(grades.class_id))
 OR created_at<=now()-interval '48 hours' OR portal_class_manager(class_id)
 ));
CREATE POLICY family_absence_visibility ON absences AS RESTRICTIVE FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
CREATE POLICY family_notes_visibility ON student_notes AS RESTRICTIVE FOR SELECT TO authenticated USING(portal_student_reader(student_id,class_id));
-- Restrictive writes prevent legacy permissive policies from granting parent write access.
CREATE FUNCTION public.portal_subject_teacher(_class text,_subject text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT portal_admin((SELECT school_id FROM classes WHERE id=_class)) OR EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND subject_id=_subject AND teacher_id=portal_profile_id())
$$;
CREATE FUNCTION public.portal_own_absence(_class text,_lesson uuid,_teacher uuid,_status text,_created timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT portal_class_manager(_class) OR (_teacher=portal_profile_id() AND upper(_status) IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU') AND EXISTS(SELECT 1 FROM lessons l WHERE l.id=_lesson AND l.class_id=_class AND l.teacher_id=portal_profile_id() AND portal_subject_teacher(l.class_id,l.subject_id) AND l.created_at>=now()-interval '48 hours'))
$$;
CREATE POLICY family_absence_insert ON absences AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(portal_own_absence(class_id,lesson_id,teacher_id,status,created_at));
CREATE POLICY family_absence_update ON absences AS RESTRICTIVE FOR UPDATE TO authenticated USING(portal_own_absence(class_id,lesson_id,teacher_id,status,created_at)) WITH CHECK(portal_own_absence(class_id,lesson_id,teacher_id,status,created_at));
CREATE POLICY family_absence_delete ON absences AS RESTRICTIVE FOR DELETE TO authenticated USING(portal_own_absence(class_id,lesson_id,teacher_id,status,created_at));
CREATE POLICY family_grade_insert ON grades AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(grades.class_id))));
CREATE POLICY family_grade_update ON grades AS RESTRICTIVE FOR UPDATE TO authenticated USING(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(grades.class_id)))) WITH CHECK(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(grades.class_id))));
CREATE POLICY family_grade_delete ON grades AS RESTRICTIVE FOR DELETE TO authenticated USING(portal_admin(portal_class_school(grades.class_id)) OR (portal_subject_teacher(class_id,subject_id) AND teacher_id=portal_profile_id() AND created_at>=now()-interval '45 minutes'));
CREATE POLICY family_final_grade_insert ON final_grades AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(final_grades.class_id))));
CREATE POLICY family_final_grade_update ON final_grades AS RESTRICTIVE FOR UPDATE TO authenticated USING(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(final_grades.class_id)))) WITH CHECK(portal_subject_teacher(class_id,subject_id) AND (teacher_id=portal_profile_id() OR portal_admin(portal_class_school(final_grades.class_id))));
CREATE POLICY family_final_grade_delete ON final_grades AS RESTRICTIVE FOR DELETE TO authenticated USING(portal_admin(portal_class_school(final_grades.class_id)) OR (portal_subject_teacher(class_id,subject_id) AND teacher_id=portal_profile_id() AND created_at>=now()-interval '48 hours'));
CREATE POLICY family_note_insert ON student_notes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(portal_class_manager(class_id) OR (portal_subject_teacher(class_id,subject_id) AND teacher_id=portal_profile_id()));
CREATE POLICY family_note_update ON student_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING(portal_class_manager(class_id) OR (portal_subject_teacher(class_id,subject_id) AND teacher_id=portal_profile_id())) WITH CHECK(portal_class_manager(class_id) OR (portal_subject_teacher(class_id,subject_id) AND teacher_id=portal_profile_id()));
CREATE POLICY family_note_delete ON student_notes AS RESTRICTIVE FOR DELETE TO authenticated USING(portal_admin(portal_class_school(student_notes.class_id)) OR (teacher_id=portal_profile_id() AND portal_subject_teacher(class_id,subject_id) AND created_at>=now()-interval '45 minutes'));
CREATE FUNCTION public.portal_notification_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.request_id IS NOT NULL THEN SELECT student_id,class_id INTO NEW.student_id,NEW.class_id FROM family_absence_requests WHERE id=NEW.request_id;
 ELSIF NEW.grade_id IS NOT NULL THEN SELECT student_id,class_id INTO NEW.student_id,NEW.class_id FROM grades WHERE id=NEW.grade_id;
 ELSIF NEW.absence_id IS NOT NULL THEN SELECT student_id,class_id INTO NEW.student_id,NEW.class_id FROM absences WHERE id=NEW.absence_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_notification_scope BEFORE INSERT ON portal_notifications FOR EACH ROW EXECUTE FUNCTION portal_notification_scope();
CREATE FUNCTION public.portal_notify_new_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _school text;
BEGIN
 SELECT school_id INTO _school FROM classes WHERE id=NEW.class_id;
 IF TG_TABLE_NAME='grades' THEN
  INSERT INTO portal_notifications(user_id,title,body,link,grade_id) VALUES(NEW.student_id,'Nova ocjena','Upisana je nova ocjena.','/student/ocjene',NEW.id);
  INSERT INTO portal_notifications(user_id,title,body,link,grade_id,visible_at) SELECT parent_id,'Nova ocjena','Dostupna je nova ocjena za povezano dijete.','/student/ocjene',NEW.id,COALESCE(NEW.created_at,now())+interval '48 hours' FROM parent_child_relationships WHERE child_id=NEW.student_id AND school_id=_school;
 ELSE
  INSERT INTO portal_notifications(user_id,title,body,link,absence_id) VALUES(NEW.student_id,'Novi izostanak','Upisan je novi izostanak.','/student/izostanci',NEW.id);
  INSERT INTO portal_notifications(user_id,title,body,link,absence_id) SELECT parent_id,'Novi izostanak','Upisan je izostanak za povezano dijete.','/student/izostanci',NEW.id FROM parent_child_relationships WHERE child_id=NEW.student_id AND school_id=_school;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_new_grade AFTER INSERT ON grades FOR EACH ROW EXECUTE FUNCTION portal_notify_new_record();
CREATE TRIGGER portal_new_absence AFTER INSERT ON absences FOR EACH ROW EXECUTE FUNCTION portal_notify_new_record();
-- Definer functions are callable only by authenticated sessions, never anonymously.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'family_%' OR p.proname LIKE 'portal_%') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);
 END LOOP;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
