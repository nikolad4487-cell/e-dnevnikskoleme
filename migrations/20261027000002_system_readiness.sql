BEGIN;
CREATE TABLE IF NOT EXISTS system_recovery_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN ('BACKUP','RESTORE')),succeeded boolean NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),artifact_id text NOT NULL,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),details text NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS recovery_evidence_latest ON system_recovery_evidence(kind,checked_at DESC);
CREATE INDEX IF NOT EXISTS portal_notifications_center ON portal_notifications(user_id,is_read,created_at DESC,id DESC);
ALTER TABLE system_recovery_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON system_recovery_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON system_recovery_evidence TO service_role;
CREATE OR REPLACE FUNCTION school_system_readiness(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_admin(_school) THEN RAISE EXCEPTION 'Pregled je dostupan administratoru vlastite ustanove.';END IF;
 RETURN jsonb_build_object('checked_at',now(),'database',true,'authenticated',portal_profile_id() IS NOT NULL,
 'notifications',to_regclass('public.portal_notifications') IS NOT NULL,
 'durable_storage',to_regprocedure('public.school_aux_commit(jsonb)') IS NOT NULL,
 'request_supplements',to_regprocedure('public.services_supplement_request(uuid,text,timestamptz)') IS NOT NULL,
 'backup',(SELECT to_jsonb(e) FROM system_recovery_evidence e WHERE kind='BACKUP' ORDER BY checked_at DESC LIMIT 1),
 'restore',(SELECT to_jsonb(e) FROM system_recovery_evidence e WHERE kind='RESTORE' ORDER BY checked_at DESC LIMIT 1),
 'qualified_sealing_connected',false);
END $$;
CREATE OR REPLACE FUNCTION school_data_quality(_school text,_after uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT registry_admin(_school) THEN RAISE EXCEPTION 'Pregled je dostupan administratoru vlastite ustanove.';END IF;
 RETURN (WITH pupils AS(
 SELECT e.id,e.student_id,e.registry_student_id,e.class_id,c.name AS class_name,coalesce(nullif(concat_ws(' ',r.first_name,r.last_name),''),p.name) AS name,
 array_remove(ARRAY[
 CASE WHEN nullif(trim(coalesce(nullif(r.address,''),p.address)), '') IS NULL THEN 'ADDRESS' END,
 CASE WHEN coalesce(r.date_of_birth,p.dob) IS NULL THEN 'DOB' END,
 CASE WHEN coalesce(e.program_id,c.program_id) IS NULL THEN 'PROGRAM' END,
 CASE WHEN e.attendance_mode IS NULL OR e.status_verified_at IS NULL OR nullif(trim(e.status_evidence),'') IS NULL THEN 'SCHOOLING_STATUS' END,
 CASE WHEN e.registry_student_id IS NULL THEN 'REGISTRY_LINK' END,
 CASE WHEN coalesce(r.date_of_birth,p.dob)>(services_today()-interval '18 years')::date AND NOT EXISTS(SELECT 1 FROM parent_child_relationships WHERE child_id=e.student_id AND school_id=_school) THEN 'GUARDIAN' END
 ],NULL) AS missing
 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id JOIN user_profiles p ON p.id=e.student_id LEFT JOIN registry_students r ON r.id=e.registry_student_id
 WHERE c.school_id=_school AND e.status='ACTIVE' AND (_after IS NULL OR e.id>_after)
 ), page AS(SELECT * FROM pupils WHERE cardinality(missing)>0 ORDER BY id LIMIT 101)
 SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY id),'[]') FROM page);
END $$;
CREATE OR REPLACE FUNCTION school_student_history(_student uuid,_class text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE school text:=portal_class_school(_class);
BEGIN
 IF school IS NULL OR NOT portal_student_reader(_student,_class) OR NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student) THEN RAISE EXCEPTION 'Povijest učenika nije dostupna.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_id',_student,'action_type',x.action,'date',x.changed_at,'reason',coalesce(x.after_data->>'reason',x.after_data->>'status_evidence',x.after_data->>'evidence',''),'details',x.entity,'registered_by',coalesce(p.name,'Sustav / akter nije zabilježen')) ORDER BY x.changed_at DESC,x.id DESC),'[]') FROM (SELECT l.* FROM registry_change_log l WHERE l.school_id=school AND l.entity IN ('ENROLLMENT','student_class_enrollments','PROGRAM_CHANGE') AND (l.entity_id IN (SELECT id::text FROM student_class_enrollments WHERE student_id=_student AND class_id=_class) OR l.after_data->>'student_id'=_student::text OR l.before_data->>'student_id'=_student::text) ORDER BY l.changed_at DESC,l.id DESC LIMIT 100) x LEFT JOIN user_profiles p ON p.id=x.actor_id);
END $$;
REVOKE ALL ON FUNCTION school_student_history(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION school_student_history(uuid,text) TO authenticated;
-- Common events carry the class, child and the correct services tab.
CREATE OR REPLACE FUNCTION services_notify(_user uuid,_title text,_class text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tab text;child record;family boolean:=false;
BEGIN
 IF _user IS NULL OR _user=portal_profile_id() THEN RETURN;END IF;
 tab:=CASE WHEN _title ILIKE '%poruk%' THEN 'messages' WHEN _title ILIKE '%suglasnost%' THEN 'consents' WHEN _title ILIKE '%informacij%' THEN 'meetings' WHEN _title ILIKE '%ispit%' THEN 'exams' WHEN _title ILIKE '%raspored%' THEN 'schedule' ELSE 'requests' END;
 FOR child IN SELECT DISTINCT e.student_id FROM student_class_enrollments e WHERE e.class_id=_class AND e.status='ACTIVE' AND (e.student_id=_user OR EXISTS(SELECT 1 FROM parent_child_relationships p WHERE p.parent_id=_user AND p.child_id=e.student_id AND p.school_id=portal_class_school(_class))) LOOP
  family:=true;INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,child.student_id,_class,_title,'Otvorite pripadajući postupak za detalje.','/student/skolske-usluge?tab='||tab);
 END LOOP;
 IF NOT family THEN INSERT INTO portal_notifications(user_id,class_id,title,body,link) VALUES(_user,_class,_title,'Otvorite pripadajući postupak za detalje.','/class/'||_class||'/skolske-usluge?tab='||tab);END IF;
END $$;
REVOKE ALL ON FUNCTION services_notify(uuid,text,text),school_system_readiness(text),school_data_quality(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION school_system_readiness(text),school_data_quality(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION services_notify_target(_user uuid,_title text,_class text,_tab text,_target uuid,_student uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE child record;family boolean:=false;target text:='?tab='||_tab||'&item='||_target::text;
BEGIN
 IF _user IS NULL OR _user=portal_profile_id() THEN RETURN;END IF;
 IF _tab='messages' THEN target:=target||'&thread='||_target::text;END IF;
 FOR child IN SELECT DISTINCT e.student_id FROM student_class_enrollments e WHERE e.class_id=_class AND e.status='ACTIVE' AND (_student IS NULL OR e.student_id=_student) AND (e.student_id=_user OR EXISTS(SELECT 1 FROM parent_child_relationships p WHERE p.parent_id=_user AND p.child_id=e.student_id AND p.school_id=portal_class_school(_class))) LOOP
  family:=true;INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,child.student_id,_class,_title,'Otvorite pripadajući postupak za detalje.','/student/skolske-usluge'||target);
 END LOOP;
 IF NOT family THEN INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(_user,_student,_class,_title,'Otvorite pripadajući postupak za detalje.','/class/'||_class||'/skolske-usluge'||target);END IF;
END $$;
CREATE OR REPLACE FUNCTION services_notification_thread(_group uuid,_class text,_student uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT services_chat_access(_group) OR NOT EXISTS(SELECT 1 FROM chat_groups WHERE id=_group AND class_id=_class AND (_student IS NULL OR family_student_id=_student)) THEN RAISE EXCEPTION 'Razgovor ne pripada odabranom učeniku ili razredu.';END IF;RETURN _group;
END $$;
REVOKE ALL ON FUNCTION services_notify_target(uuid,text,text,text,uuid,uuid),services_notification_thread(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION services_notification_thread(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION services_send(_group uuid,_text text,_file jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;p text;g chat_groups;r uuid;
BEGIN
 IF NOT services_chat_access(_group) OR length(trim(coalesce(_text,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Razgovor nije dostupan ili je poruka prazna/preduga.';END IF;
 IF _file IS NOT NULL THEN p:=_file->>'path';IF split_part(p,'/',1)<>portal_profile_id()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='family-files' AND name=p) OR length(_file->>'name') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Prilog nije dostupan.';END IF;END IF;
 INSERT INTO messages(group_id,sender_id,text,content,timestamp) VALUES(_group,portal_profile_id(),trim(_text),trim(_text),now()) RETURNING id INTO result;
 IF _file IS NOT NULL THEN INSERT INTO message_attachments(message_id,file_url,file_name,file_type,file_size) VALUES(result,'family-files/'||p,_file->>'name',_file->>'type',(_file->>'size')::int);END IF;
 SELECT * INTO g FROM chat_groups WHERE id=_group;
 FOR r IN SELECT DISTINCT id FROM user_profiles WHERE id=g.family_parent_id OR id IN (SELECT homeroom_teacher_id FROM classes WHERE id=g.class_id UNION SELECT deputy_teacher_id FROM classes WHERE id=g.class_id) LOOP PERFORM services_notify_target(r,'Nova poruka roditelja / razrednika',g.class_id,'messages',_group,g.family_student_id);END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_consent(_class text,_title text,_description text,_deadline timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF NOT services_manager(_class) OR length(trim(_title)) NOT BETWEEN 3 AND 200 OR length(trim(_description)) NOT BETWEEN 3 AND 10000 OR _deadline IS NULL OR _deadline<=now() THEN RAISE EXCEPTION 'Provjerite ovlasti, opis i budući rok suglasnosti.';END IF;
 INSERT INTO school_consents(class_id,title,description,deadline,created_by) VALUES(_class,trim(_title),trim(_description),_deadline,portal_profile_id()) RETURNING id INTO result;
 FOR r IN SELECT DISTINCT parent_id FROM parent_child_relationships p JOIN student_class_enrollments e ON e.student_id=p.child_id WHERE e.class_id=_class AND e.status='ACTIVE' AND p.school_id=portal_class_school(_class) LOOP PERFORM services_notify_target(r,'Nova suglasnost za roditelja',_class,'consents',result);END LOOP;
 PERFORM services_audit(_class,'CONSENT',result::text,'CREATE',NULL,jsonb_build_object('title',_title,'deadline',_deadline));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_book_meeting(_id uuid,_student uuid,_cancel boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s family_meeting_slots;b family_meeting_bookings;
BEGIN
 SELECT * INTO s FROM family_meeting_slots WHERE id=_id FOR UPDATE;SELECT * INTO b FROM family_meeting_bookings WHERE slot_id=_id;
 IF s.id IS NULL OR s.starts_at<=now() OR s.cancelled_at IS NOT NULL OR _cancel IS NULL THEN RAISE EXCEPTION 'Termin nije dostupan.';END IF;
 IF _cancel THEN
  IF b.parent_id IS DISTINCT FROM portal_profile_id() AND NOT services_manager(s.class_id) THEN RAISE EXCEPTION 'Rezervacija nije vaša.';END IF;DELETE FROM family_meeting_bookings WHERE slot_id=_id;
  PERFORM services_notify_target(s.host_id,'Rezervacija informacija je otkazana',s.class_id,'meetings',_id,b.student_id);PERFORM services_notify_target(b.parent_id,'Rezervacija informacija je otkazana',s.class_id,'meetings',_id,b.student_id);
 ELSE
  IF b.slot_id IS NOT NULL OR NOT services_pupil(s.class_id,_student) OR NOT portal_linked(_student,portal_class_school(s.class_id)) THEN RAISE EXCEPTION 'Termin je zauzet ili dijete nije povezano.';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meeting-parent:'||portal_profile_id()::text,0));
  IF EXISTS(SELECT 1 FROM family_meeting_bookings booked_rows JOIN family_meeting_slots x ON x.id=booked_rows.slot_id WHERE booked_rows.parent_id=portal_profile_id() AND x.cancelled_at IS NULL AND x.starts_at<s.ends_at AND x.ends_at>s.starts_at) THEN RAISE EXCEPTION 'Već imate rezerviran razgovor u tom terminu.';END IF;
  INSERT INTO family_meeting_bookings(slot_id,parent_id,student_id) VALUES(_id,portal_profile_id(),_student);PERFORM services_notify_target(s.host_id,'Nova rezervacija informacija',s.class_id,'meetings',_id,_student);
 END IF;
 PERFORM services_audit(s.class_id,'MEETING',_id::text,CASE WHEN _cancel THEN 'CANCEL' ELSE 'BOOK' END,to_jsonb(b),jsonb_build_object('student_id',_student));
END $$;
CREATE OR REPLACE FUNCTION services_substitution(_class text,_subject text,_original uuid,_substitute uuid,_date date,_hour integer,_room text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF expert_actor() OR NOT portal_admin(portal_class_school(_class)) OR _date IS NULL OR _hour IS NULL OR _hour NOT BETWEEN 1 AND 14 OR _original IS NOT DISTINCT FROM _substitute OR length(coalesce(_note,''))>2000 OR length(coalesce(_room,''))>100 OR NOT EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND subject_id=_subject AND teacher_id=_original) OR NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_substitute AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY')) THEN RAISE EXCEPTION 'Provjerite dodijeljeni predmet, nastavnike, datum i sat.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('substitution:'||_date::text||':'||_hour::text,0));
 IF EXISTS(SELECT 1 FROM teacher_substitutions WHERE date=_date AND hour=_hour AND cancelled_at IS NULL AND (class_id=_class OR substitute_teacher_id=_substitute)) THEN RAISE EXCEPTION 'Razred ili zamjenski nastavnik već ima zamjenu u tom terminu.';END IF;
 INSERT INTO teacher_substitutions(school_id,class_id,subject_id,original_teacher_id,substitute_teacher_id,date,hour,room,notes) VALUES(portal_class_school(_class),_class,_subject,_original,_substitute,_date,_hour,_room,_note) RETURNING id INTO result;
 FOR r IN SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE' UNION SELECT parent_id FROM parent_child_relationships WHERE child_id IN (SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE') AND school_id=portal_class_school(_class) UNION SELECT _substitute LOOP PERFORM services_notify_target(r,'Promjena rasporeda / zamjena nastavnika',_class,'schedule',result);END LOOP;
 PERFORM services_audit(_class,'SUBSTITUTION',result::text,'CREATE',NULL,jsonb_build_object('date',_date,'hour',_hour,'subject_id',_subject,'substitute',_substitute,'room',_room));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_cancel_exam(_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r uuid;
BEGIN SELECT * INTO s FROM school_exam_sessions WHERE id=_session FOR UPDATE;IF s.id IS NULL OR NOT services_manager(s.class_id) OR s.starts_at<=now() THEN RAISE EXCEPTION 'Rok više nije moguće otkazati.';END IF;UPDATE school_exam_sessions SET cancelled_at=now() WHERE id=_session;FOR r IN SELECT student_id FROM school_exam_registrations WHERE session_id=_session UNION SELECT p.parent_id FROM parent_child_relationships p JOIN school_exam_registrations x ON x.student_id=p.child_id WHERE x.session_id=_session AND p.school_id=portal_class_school(s.class_id) LOOP PERFORM services_notify_target(r,'Ispitni rok je otkazan',s.class_id,'exams',_session);END LOOP;PERFORM services_audit(s.class_id,'EXAM_SESSION',_session::text,'CANCEL',to_jsonb(s),jsonb_build_object('cancelled',true));END $$;
CREATE OR REPLACE FUNCTION services_resolve_exam_registration(_session uuid,_student uuid,_status text,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r school_exam_registrations;y uuid;
BEGIN
 SELECT * INTO s FROM school_exam_sessions WHERE id=_session;SELECT * INTO r FROM school_exam_registrations WHERE session_id=_session AND student_id=_student FOR UPDATE;
 IF s.id IS NULL OR s.cancelled_at IS NOT NULL OR r.student_id IS NULL OR r.special_exam_id IS NOT NULL OR r.resolved_at IS NOT NULL OR expert_actor() OR NOT registry_admin(portal_class_school(s.class_id)) OR _status NOT IN ('NO_SHOW','WITHDRAWN') OR _status IS NULL OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 2000 OR (_status='NO_SHOW' AND s.starts_at>now()) THEN RAISE EXCEPTION 'Provjerite ovlasti, termin, status i obrazloženje postupka.';END IF;
 SELECT school_year_id INTO y FROM classes WHERE id=s.class_id;PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||y::text,0));
 IF EXISTS(SELECT 1 FROM school_years WHERE id=y AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Najprije ponovno otvorite školsku godinu uz obrazloženje.';END IF;
 UPDATE school_exam_registrations SET resolution_status=_status,resolution_reason=trim(_reason),resolved_at=now(),resolved_by=portal_profile_id() WHERE session_id=_session AND student_id=_student;
 PERFORM services_audit(s.class_id,'EXAM_REGISTRATION',_session::text,'RESOLVE',to_jsonb(r),jsonb_build_object('student_id',_student,'status',_status,'reason',trim(_reason)));
 PERFORM services_notify_target(_student,'Evidentiran status ispitne prijave',s.class_id,'exams',_session,_student);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
