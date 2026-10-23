-- Communication, consent, support, school services; existing messages/marks remain authoritative.
BEGIN;
CREATE OR REPLACE FUNCTION services_today() RETURNS date LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$ SELECT (now() AT TIME ZONE 'Europe/Zagreb')::date $$;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS family_student_id uuid REFERENCES user_profiles(id);
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS family_parent_id uuid REFERENCES user_profiles(id);
CREATE UNIQUE INDEX IF NOT EXISTS family_conversation_unique ON chat_groups(class_id,family_student_id,family_parent_id) WHERE family_student_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS message_receipts(message_id uuid REFERENCES messages(id) ON DELETE CASCADE,user_id uuid REFERENCES user_profiles(id),read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(message_id,user_id));
CREATE TABLE IF NOT EXISTS school_consents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id text NOT NULL REFERENCES classes(id),title text NOT NULL,description text NOT NULL,deadline timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES user_profiles(id),created_at timestamptz NOT NULL DEFAULT now(),cancelled_at timestamptz);
CREATE TABLE IF NOT EXISTS school_consent_responses(consent_id uuid REFERENCES school_consents(id),student_id uuid REFERENCES user_profiles(id),parent_id uuid REFERENCES user_profiles(id),accepted boolean NOT NULL,note text NOT NULL DEFAULT '',responded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(consent_id,student_id,parent_id));
CREATE TABLE IF NOT EXISTS family_meeting_slots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id text NOT NULL REFERENCES classes(id),host_id uuid NOT NULL REFERENCES user_profiles(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,location text NOT NULL,cancelled_at timestamptz,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS family_meeting_bookings(slot_id uuid PRIMARY KEY REFERENCES family_meeting_slots(id),parent_id uuid NOT NULL REFERENCES user_profiles(id),student_id uuid NOT NULL REFERENCES user_profiles(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS school_document_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id text NOT NULL REFERENCES schools(id),class_id text NOT NULL REFERENCES classes(id),student_id uuid NOT NULL REFERENCES user_profiles(id),requested_by uuid NOT NULL REFERENCES user_profiles(id),kind text NOT NULL,purpose text NOT NULL,status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','PROCESSING','ISSUED','REJECTED')),note text NOT NULL DEFAULT '',document_id uuid REFERENCES school_document_records(id),handled_by uuid REFERENCES user_profiles(id),updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS school_exam_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id text NOT NULL REFERENCES classes(id),subject_id text NOT NULL REFERENCES subjects(id),exam_type text NOT NULL CHECK(exam_type IN ('DOPUNSKI_RAD','POPRAVNI','PREDMETNI','RAZREDNI','RAZLIKOVNI','DOPUNSKI')),starts_at timestamptz NOT NULL,location text NOT NULL,commission uuid[] NOT NULL,created_by uuid REFERENCES user_profiles(id),cancelled_at timestamptz);
CREATE TABLE IF NOT EXISTS school_exam_registrations(session_id uuid REFERENCES school_exam_sessions(id),student_id uuid REFERENCES user_profiles(id),registered_by uuid REFERENCES user_profiles(id),registered_at timestamptz NOT NULL DEFAULT now(),special_exam_id uuid REFERENCES special_exams(id),PRIMARY KEY(session_id,student_id));
ALTER TABLE school_exam_registrations ADD COLUMN IF NOT EXISTS resolution_status text CHECK(resolution_status IN ('NO_SHOW','WITHDRAWN'));
ALTER TABLE school_exam_registrations ADD COLUMN IF NOT EXISTS resolution_reason text;
ALTER TABLE school_exam_registrations ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE school_exam_registrations ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES user_profiles(id);
-- Missing legacy substitution migration is installed without duplicating its table.
CREATE TABLE IF NOT EXISTS teacher_substitutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id text NOT NULL REFERENCES schools(id),class_id text NOT NULL REFERENCES classes(id),subject_id text NOT NULL REFERENCES subjects(id),original_teacher_id uuid NOT NULL REFERENCES user_profiles(id),substitute_teacher_id uuid NOT NULL REFERENCES user_profiles(id),date date NOT NULL,hour integer,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE teacher_substitutions ADD COLUMN IF NOT EXISTS room text;
CREATE OR REPLACE FUNCTION services_manager(_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT portal_class_manager(_class) AND NOT expert_actor() AND (portal_admin(portal_class_school(_class)) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY')))
$$;
CREATE OR REPLACE FUNCTION services_pupil(_class text,_student uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student AND status='ACTIVE') AND (portal_profile_id()=_student OR portal_linked(_student,portal_class_school(_class)))
$$;
CREATE OR REPLACE FUNCTION services_chat_access(_group uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM chat_groups g WHERE g.id=_group AND (services_manager(g.class_id) OR (g.family_parent_id=portal_profile_id() AND services_pupil(g.class_id,g.family_student_id))))
$$;
-- Restrictive overlays protect managed family threads even if legacy development policies are permissive.
DROP POLICY IF EXISTS family_thread_scope ON chat_groups;
CREATE POLICY family_thread_scope ON chat_groups AS RESTRICTIVE FOR SELECT TO authenticated USING(family_student_id IS NULL OR services_chat_access(id));
DROP POLICY IF EXISTS family_thread_write ON chat_groups;
CREATE POLICY family_thread_write ON chat_groups AS RESTRICTIVE FOR ALL TO authenticated USING(family_student_id IS NULL) WITH CHECK(family_student_id IS NULL);
DROP POLICY IF EXISTS family_message_scope ON messages;
-- Use a definer predicate so hidden groups cannot turn NOT EXISTS into a permission grant.
CREATE OR REPLACE FUNCTION services_legacy_chat(_group uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM chat_groups WHERE id=_group AND family_student_id IS NULL) $$;
DROP POLICY IF EXISTS family_message_scope ON messages;
CREATE POLICY family_message_scope ON messages AS RESTRICTIVE FOR SELECT TO authenticated USING(services_legacy_chat(group_id) OR services_chat_access(group_id));
DROP POLICY IF EXISTS family_message_write ON messages;
CREATE POLICY family_message_write ON messages AS RESTRICTIVE FOR ALL TO authenticated USING(services_legacy_chat(group_id)) WITH CHECK(services_legacy_chat(group_id));
DROP POLICY IF EXISTS family_member_scope ON chat_group_members;
CREATE POLICY family_member_scope ON chat_group_members AS RESTRICTIVE FOR ALL TO authenticated USING(services_legacy_chat(group_id)) WITH CHECK(services_legacy_chat(group_id));
DROP POLICY IF EXISTS family_attachment_scope ON message_attachments;
CREATE POLICY family_attachment_scope ON message_attachments AS RESTRICTIVE FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM messages m WHERE m.id=message_id AND services_legacy_chat(m.group_id))) WITH CHECK(EXISTS(SELECT 1 FROM messages m WHERE m.id=message_id AND services_legacy_chat(m.group_id)));
CREATE OR REPLACE FUNCTION services_audit(_class text,_entity text,_id text,_action text,_before jsonb,_after jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,before_data,after_data) VALUES(portal_class_school(_class),_entity,_id,_action,portal_profile_id(),_before,_after)
$$;
CREATE OR REPLACE FUNCTION services_notify(_user uuid,_title text,_class text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO portal_notifications(user_id,title,body,link) SELECT _user,_title,'Otvorite školske usluge za detalje.',CASE WHEN EXISTS(SELECT 1 FROM parent_child_relationships WHERE parent_id=_user) OR EXISTS(SELECT 1 FROM user_profiles WHERE id=_user AND role='STUDENT') THEN '/student/skolske-usluge' ELSE '/class/'||_class||'/skolske-usluge' END WHERE _user IS NOT NULL AND _user<>portal_profile_id()
$$;
CREATE OR REPLACE FUNCTION services_thread(_class text,_student uuid,_parent uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;h uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student AND status='ACTIVE') OR NOT portal_linked_for_parent(_parent,_student,_class) THEN RAISE EXCEPTION 'Poveznica roditelja i učenika nije dostupna.';END IF;
 IF NOT services_manager(_class) AND NOT (_parent=portal_profile_id() AND services_pupil(_class,_student)) THEN RAISE EXCEPTION 'Razgovor nije dostupan.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_class||_student::text||_parent::text,0));
 SELECT id INTO result FROM chat_groups WHERE class_id=_class AND family_student_id=_student AND family_parent_id=_parent;
 IF result IS NULL THEN
  INSERT INTO chat_groups(school_id,class_id,name,type,created_by,family_student_id,family_parent_id) VALUES(portal_class_school(_class),_class,'Roditelj i razrednik','PRIVATE',portal_profile_id(),_student,_parent) RETURNING id INTO result;
 END IF;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION portal_linked_for_parent(_parent uuid,_student uuid,_class text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM parent_child_relationships WHERE parent_id=_parent AND child_id=_student AND school_id=portal_class_school(_class)) $$;
CREATE OR REPLACE FUNCTION services_send(_group uuid,_text text,_file jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;p text;g chat_groups;r uuid;
BEGIN
 IF NOT services_chat_access(_group) OR length(trim(coalesce(_text,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Razgovor nije dostupan ili je poruka prazna/preduga.';END IF;
 IF _file IS NOT NULL THEN p:=_file->>'path';IF split_part(p,'/',1)<>portal_profile_id()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='family-files' AND name=p) OR length(_file->>'name') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Prilog nije dostupan.';END IF;END IF;
 INSERT INTO messages(group_id,sender_id,text,content,timestamp) VALUES(_group,portal_profile_id(),trim(_text),trim(_text),now()) RETURNING id INTO result;
 IF _file IS NOT NULL THEN INSERT INTO message_attachments(message_id,file_url,file_name,file_type,file_size) VALUES(result,'family-files/'||p,_file->>'name',_file->>'type',(_file->>'size')::int);END IF;
 SELECT * INTO g FROM chat_groups WHERE id=_group;
 FOR r IN SELECT DISTINCT id FROM user_profiles WHERE id=g.family_parent_id OR id IN (SELECT homeroom_teacher_id FROM classes WHERE id=g.class_id UNION SELECT deputy_teacher_id FROM classes WHERE id=g.class_id) LOOP PERFORM services_notify(r,'Nova poruka roditelja / razrednika',g.class_id);END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_messages(_group uuid,_before timestamptz DEFAULT NULL,_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT services_chat_access(_group) THEN RAISE EXCEPTION 'Razgovor nije dostupan.';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.timestamp,x.id),'[]') FROM (SELECT m.*,p.name sender,(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM message_attachments a WHERE a.message_id=m.id) attachments,(SELECT coalesce(jsonb_agg(jsonb_build_object('name',u.name,'read_at',r.read_at)),'[]') FROM message_receipts r JOIN user_profiles u ON u.id=r.user_id WHERE r.message_id=m.id AND r.user_id<>m.sender_id) receipts FROM messages m JOIN user_profiles p ON p.id=m.sender_id WHERE m.group_id=_group AND (_before IS NULL OR m.timestamp<_before OR m.timestamp=_before AND _before_id IS NOT NULL AND m.id<_before_id) ORDER BY m.timestamp DESC,m.id DESC LIMIT 100)x);
END $$;
CREATE OR REPLACE FUNCTION services_read(_group uuid,_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF NOT services_chat_access(_group) OR coalesce(cardinality(_ids),0)>100 THEN RAISE EXCEPTION 'Razgovor nije dostupan.';END IF;
 INSERT INTO message_receipts(message_id,user_id) SELECT id,portal_profile_id() FROM messages WHERE group_id=_group AND id=ANY(_ids) AND sender_id<>portal_profile_id() ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION services_consent(_class text,_title text,_description text,_deadline timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF NOT services_manager(_class) OR length(trim(_title)) NOT BETWEEN 3 AND 200 OR length(trim(_description)) NOT BETWEEN 3 AND 10000 OR _deadline IS NULL OR _deadline<=now() THEN RAISE EXCEPTION 'Provjerite ovlasti, opis i budući rok suglasnosti.';END IF;
 INSERT INTO school_consents(class_id,title,description,deadline,created_by) VALUES(_class,trim(_title),trim(_description),_deadline,portal_profile_id()) RETURNING id INTO result;
 FOR r IN SELECT DISTINCT parent_id FROM parent_child_relationships p JOIN student_class_enrollments e ON e.student_id=p.child_id WHERE e.class_id=_class AND e.status='ACTIVE' AND p.school_id=portal_class_school(_class) LOOP PERFORM services_notify(r,'Nova suglasnost za roditelja',_class);END LOOP;
 PERFORM services_audit(_class,'CONSENT',result::text,'CREATE',NULL,jsonb_build_object('title',_title,'deadline',_deadline));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_consent_reply(_id uuid,_student uuid,_accepted boolean,_note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c school_consents;b jsonb;
BEGIN
 SELECT * INTO c FROM school_consents WHERE id=_id FOR UPDATE;
 IF c.id IS NULL OR c.cancelled_at IS NOT NULL OR c.deadline<=now() OR _accepted IS NULL OR NOT services_pupil(c.class_id,_student) OR NOT portal_linked(_student,portal_class_school(c.class_id)) OR length(coalesce(_note,''))>2000 THEN RAISE EXCEPTION 'Samo povezani roditelj može odgovoriti prije isteka roka.';END IF;
 SELECT to_jsonb(r) INTO b FROM school_consent_responses r WHERE consent_id=_id AND student_id=_student AND parent_id=portal_profile_id();
 INSERT INTO school_consent_responses(consent_id,student_id,parent_id,accepted,note) VALUES(_id,_student,portal_profile_id(),_accepted,coalesce(_note,'')) ON CONFLICT(consent_id,student_id,parent_id) DO UPDATE SET accepted=EXCLUDED.accepted,note=EXCLUDED.note,responded_at=now();
 PERFORM services_audit(c.class_id,'CONSENT_RESPONSE',_id::text,'REPLY',b,jsonb_build_object('student_id',_student,'parent_id',portal_profile_id(),'accepted',_accepted,'note',_note));
END $$;
CREATE OR REPLACE FUNCTION services_cancel_consent(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c school_consents;BEGIN SELECT * INTO c FROM school_consents WHERE id=_id FOR UPDATE;IF c.id IS NULL OR NOT services_manager(c.class_id) THEN RAISE EXCEPTION 'Suglasnost nije dostupna.';END IF;UPDATE school_consents SET cancelled_at=now() WHERE id=_id;PERFORM services_audit(c.class_id,'CONSENT',_id::text,'CANCEL',to_jsonb(c),jsonb_build_object('cancelled',true));END $$;
CREATE OR REPLACE FUNCTION services_meeting(_class text,_start timestamptz,_end timestamptz,_location text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT services_manager(_class) OR _start IS NULL OR _end IS NULL OR _start<=now() OR _end<=_start OR _end>_start+interval '4 hours' OR length(trim(coalesce(_location,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Provjerite termin i mjesto informacija.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meeting:'||portal_profile_id()::text,0));
 IF EXISTS(SELECT 1 FROM family_meeting_slots WHERE host_id=portal_profile_id() AND cancelled_at IS NULL AND starts_at<_end AND ends_at>_start) THEN RAISE EXCEPTION 'Termin se preklapa s postojećim informacijama.';END IF;
 INSERT INTO family_meeting_slots(class_id,host_id,starts_at,ends_at,location) VALUES(_class,portal_profile_id(),_start,_end,trim(_location)) RETURNING id INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_book_meeting(_id uuid,_student uuid,_cancel boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s family_meeting_slots;b family_meeting_bookings;
BEGIN
 SELECT * INTO s FROM family_meeting_slots WHERE id=_id FOR UPDATE;SELECT * INTO b FROM family_meeting_bookings WHERE slot_id=_id;
 IF s.id IS NULL OR s.starts_at<=now() OR s.cancelled_at IS NOT NULL OR _cancel IS NULL THEN RAISE EXCEPTION 'Termin nije dostupan.';END IF;
 IF _cancel THEN
  IF b.parent_id IS DISTINCT FROM portal_profile_id() AND NOT services_manager(s.class_id) THEN RAISE EXCEPTION 'Rezervacija nije vaša.';END IF;DELETE FROM family_meeting_bookings WHERE slot_id=_id;
  PERFORM services_notify(s.host_id,'Rezervacija informacija je otkazana',s.class_id);PERFORM services_notify(b.parent_id,'Rezervacija informacija je otkazana',s.class_id);
 ELSE
  IF b.slot_id IS NOT NULL OR NOT services_pupil(s.class_id,_student) OR NOT portal_linked(_student,portal_class_school(s.class_id)) THEN RAISE EXCEPTION 'Termin je zauzet ili dijete nije povezano.';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meeting-parent:'||portal_profile_id()::text,0));
  IF EXISTS(SELECT 1 FROM family_meeting_bookings booked_rows JOIN family_meeting_slots x ON x.id=booked_rows.slot_id WHERE booked_rows.parent_id=portal_profile_id() AND x.cancelled_at IS NULL AND x.starts_at<s.ends_at AND x.ends_at>s.starts_at) THEN RAISE EXCEPTION 'Već imate rezerviran razgovor u tom terminu.';END IF;
  INSERT INTO family_meeting_bookings(slot_id,parent_id,student_id) VALUES(_id,portal_profile_id(),_student);PERFORM services_notify(s.host_id,'Nova rezervacija informacija',s.class_id);
 END IF;
 PERFORM services_audit(s.class_id,'MEETING',_id::text,CASE WHEN _cancel THEN 'CANCEL' ELSE 'BOOK' END,to_jsonb(b),jsonb_build_object('student_id',_student));
END $$;
CREATE OR REPLACE FUNCTION services_request(_class text,_student uuid,_kind text,_purpose text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT services_pupil(_class,_student) OR _kind NOT IN ('attendance','transcript','zet','hzpp','transport','other') OR length(trim(coalesce(_purpose,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Provjerite učenika, vrstu i svrhu zahtjeva.';END IF;
 INSERT INTO school_document_requests(school_id,class_id,student_id,requested_by,kind,purpose) VALUES(portal_class_school(_class),_class,_student,portal_profile_id(),_kind,trim(_purpose)) RETURNING id INTO result;
 PERFORM services_audit(_class,'DOCUMENT_REQUEST',result::text,'SUBMIT',NULL,jsonb_build_object('kind',_kind,'student_id',_student));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_handle_request(_id uuid,_status text,_note text,_document uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;school text;d school_document_records;
BEGIN
 school:=registrar_require_school();SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM school OR _status NOT IN ('PROCESSING','ISSUED','REJECTED') OR length(coalesce(_note,''))>2000 OR r.status IN ('ISSUED','REJECTED') OR (_status='REJECTED' AND length(trim(coalesce(_note,'')))<3) THEN RAISE EXCEPTION 'Zahtjev nije dostupan ili provjerite status i obrazloženje.';END IF;
 IF _status='ISSUED' THEN SELECT * INTO d FROM school_document_records WHERE id=_document;IF d.id IS NULL OR d.student_id IS DISTINCT FROM r.student_id OR d.school_id IS DISTINCT FROM school OR d.class_id IS DISTINCT FROM r.class_id OR d.status<>'IZDANO' OR d.pdf_path IS NULL THEN RAISE EXCEPTION 'Odaberite već izdani dokument ovog učenika i razreda.';END IF;END IF;
 UPDATE school_document_requests SET status=_status,note=coalesce(_note,''),document_id=CASE WHEN _status='ISSUED' THEN _document END,handled_by=portal_profile_id(),updated_at=now() WHERE id=_id;
 PERFORM services_audit(r.class_id,'DOCUMENT_REQUEST',_id::text,_status,to_jsonb(r),jsonb_build_object('status',_status,'document_id',_document,'note',_note));PERFORM services_notify(r.requested_by,'Zahtjev referadi: '||_status,r.class_id);
END $$;
CREATE OR REPLACE FUNCTION services_document(_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;d school_document_records;
BEGIN SELECT * INTO r FROM school_document_requests WHERE id=_request;IF r.id IS NULL OR r.status<>'ISSUED' OR NOT services_pupil(r.class_id,r.student_id) THEN RAISE EXCEPTION 'Dokument nije dostupan.';END IF;SELECT * INTO d FROM school_document_records WHERE id=r.document_id AND school_id=r.school_id AND student_id=r.student_id AND status='IZDANO';IF d.id IS NULL THEN RAISE EXCEPTION 'Dokument je poništen ili nedostupan.';END IF;RETURN jsonb_build_object('path',d.pdf_path,'sha256',d.pdf_sha256);END $$;
CREATE OR REPLACE FUNCTION services_exam(_class text,_subject text,_type text,_start timestamptz,_location text,_commission uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT services_manager(_class) OR _start IS NULL OR _start<=now() OR length(trim(coalesce(_location,''))) NOT BETWEEN 1 AND 200 OR coalesce(cardinality(_commission),0) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM unnest(_commission) member WHERE NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=member AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY','SCHOOL_ADMIN','ADMIN','PRINCIPAL'))) OR NOT EXISTS(SELECT 1 FROM class_subjects WHERE class_id=_class AND subject_id=_subject) THEN RAISE EXCEPTION 'Provjerite ovlasti, predmet, budući termin i povjerenstvo svoje škole.';END IF;
 IF EXISTS(SELECT 1 FROM school_years y JOIN classes c ON c.school_year_id=y.id WHERE c.id=_class AND y.workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Najprije ponovno otvorite školsku godinu uz obrazloženje.';END IF;
 INSERT INTO school_exam_sessions(class_id,subject_id,exam_type,starts_at,location,commission,created_by) VALUES(_class,_subject,_type,_start,trim(_location),_commission,portal_profile_id()) RETURNING id INTO result;PERFORM services_audit(_class,'EXAM_SESSION',result::text,'CREATE',NULL,jsonb_build_object('subject_id',_subject,'type',_type,'starts_at',_start,'location',_location,'commission',_commission));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_cancel_exam(_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r uuid;
BEGIN SELECT * INTO s FROM school_exam_sessions WHERE id=_session FOR UPDATE;IF s.id IS NULL OR NOT services_manager(s.class_id) OR s.starts_at<=now() THEN RAISE EXCEPTION 'Rok više nije moguće otkazati.';END IF;UPDATE school_exam_sessions SET cancelled_at=now() WHERE id=_session;FOR r IN SELECT student_id FROM school_exam_registrations WHERE session_id=_session UNION SELECT p.parent_id FROM parent_child_relationships p JOIN school_exam_registrations x ON x.student_id=p.child_id WHERE x.session_id=_session AND p.school_id=portal_class_school(s.class_id) LOOP PERFORM services_notify(r,'Ispitni rok je otkazan',s.class_id);END LOOP;PERFORM services_audit(s.class_id,'EXAM_SESSION',_session::text,'CANCEL',to_jsonb(s),jsonb_build_object('cancelled',true));END $$;
CREATE OR REPLACE FUNCTION services_register_exam(_session uuid,_student uuid,_remove boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;
BEGIN SELECT * INTO s FROM school_exam_sessions WHERE id=_session FOR UPDATE;
 IF s.id IS NULL OR s.cancelled_at IS NOT NULL OR s.starts_at<=now() OR _remove IS NULL OR NOT (services_manager(s.class_id) OR services_pupil(s.class_id,_student)) OR NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=s.class_id AND student_id=_student AND status='ACTIVE') OR NOT EXISTS(SELECT 1 FROM student_subject_enrollments WHERE class_id=s.class_id AND student_id=_student AND subject_id=s.subject_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Ispit ili upis predmeta nije dostupan.';END IF;
 IF EXISTS(SELECT 1 FROM school_exam_registrations WHERE session_id=_session AND student_id=_student AND resolved_at IS NOT NULL) THEN RAISE EXCEPTION 'Postupak ispitne prijave već je zaključen.';END IF;
 IF _remove THEN DELETE FROM school_exam_registrations WHERE session_id=_session AND student_id=_student AND special_exam_id IS NULL;ELSE INSERT INTO school_exam_registrations(session_id,student_id,registered_by) VALUES(_session,_student,portal_profile_id()) ON CONFLICT DO NOTHING;END IF;
END $$;
CREATE OR REPLACE FUNCTION services_resolve_exam_registration(_session uuid,_student uuid,_status text,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r school_exam_registrations;y uuid;
BEGIN
 SELECT * INTO s FROM school_exam_sessions WHERE id=_session;SELECT * INTO r FROM school_exam_registrations WHERE session_id=_session AND student_id=_student FOR UPDATE;
 IF s.id IS NULL OR s.cancelled_at IS NOT NULL OR r.student_id IS NULL OR r.special_exam_id IS NOT NULL OR r.resolved_at IS NOT NULL OR expert_actor() OR NOT registry_admin(portal_class_school(s.class_id)) OR _status NOT IN ('NO_SHOW','WITHDRAWN') OR _status IS NULL OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 2000 OR (_status='NO_SHOW' AND s.starts_at>now()) THEN RAISE EXCEPTION 'Provjerite ovlasti, termin, status i obrazloženje postupka.';END IF;
 SELECT school_year_id INTO y FROM classes WHERE id=s.class_id;PERFORM pg_advisory_xact_lock(hashtextextended('school-year:'||y::text,0));
 IF EXISTS(SELECT 1 FROM school_years WHERE id=y AND workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Najprije ponovno otvorite školsku godinu uz obrazloženje.';END IF;
 UPDATE school_exam_registrations SET resolution_status=_status,resolution_reason=trim(_reason),resolved_at=now(),resolved_by=portal_profile_id() WHERE session_id=_session AND student_id=_student;
 PERFORM services_audit(s.class_id,'EXAM_REGISTRATION',_session::text,'RESOLVE',to_jsonb(r),jsonb_build_object('student_id',_student,'status',_status,'reason',trim(_reason)));
 PERFORM services_notify(_student,'Evidentiran status ispitne prijave',s.class_id);
END $$;
CREATE OR REPLACE FUNCTION services_exam_result(_session uuid,_student uuid,_grade integer,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s school_exam_sessions;r school_exam_registrations;e uuid;result uuid;
BEGIN SELECT * INTO s FROM school_exam_sessions WHERE id=_session;SELECT * INTO r FROM school_exam_registrations WHERE session_id=_session AND student_id=_student FOR UPDATE;
 IF s.id IS NULL OR s.cancelled_at IS NOT NULL OR s.starts_at>now() OR r.student_id IS NULL OR r.special_exam_id IS NOT NULL OR r.resolved_at IS NOT NULL OR expert_actor() OR NOT registry_admin(portal_class_school(s.class_id)) THEN RAISE EXCEPTION 'Rezultat nije dostupan za unos.';END IF;
 IF EXISTS(SELECT 1 FROM school_years y JOIN classes c ON c.school_year_id=y.id WHERE c.id=s.class_id AND y.workflow_closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Najprije ponovno otvorite školsku godinu uz obrazloženje.';END IF;
 SELECT id INTO e FROM student_class_enrollments WHERE class_id=s.class_id AND student_id=_student AND status='ACTIVE';
 result:=registry_record_exam(e,s.subject_id,s.exam_type,(s.starts_at AT TIME ZONE 'Europe/Zagreb')::date,_grade,_note);
 UPDATE school_exam_registrations SET special_exam_id=result WHERE session_id=_session AND student_id=_student;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_support_action(_class text,_student uuid,_description text,_conclusion text,_recommendation text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;p user_profiles;c classes;
BEGIN
 IF NOT services_manager(_class) AND NOT (expert_class(_class) AND NOT principal_actor()) THEN RAISE EXCEPTION 'Podršku evidentira razrednik ili stručna služba svoje škole.';END IF;
 IF length(trim(coalesce(_description,''))) NOT BETWEEN 3 AND 5000 OR length(coalesce(_conclusion,''))>5000 OR length(coalesce(_recommendation,''))>5000 OR NOT EXISTS(SELECT 1 FROM student_class_enrollments WHERE class_id=_class AND student_id=_student AND status='ACTIVE') THEN RAISE EXCEPTION 'Provjerite učenika i opis aktivnosti.';END IF;
 SELECT * INTO p FROM user_profiles WHERE id=portal_profile_id();SELECT * INTO c FROM classes WHERE id=_class;
 INSERT INTO expert_service_activities(school_id,class_id,student_id,school_year,activity_type,date,staff_role,staff_name,description,conclusion,recommendation) VALUES(c.school_id,_class,_student,coalesce(c.school_year,''),'plan podrške',services_today(),coalesce(p.role,''),coalesce(p.name,''),trim(_description),coalesce(_conclusion,''),coalesce(_recommendation,'')) RETURNING id INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION services_substitution(_class text,_subject text,_original uuid,_substitute uuid,_date date,_hour integer,_room text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;r uuid;
BEGIN
 IF expert_actor() OR NOT portal_admin(portal_class_school(_class)) OR _date IS NULL OR _hour IS NULL OR _hour NOT BETWEEN 1 AND 14 OR _original IS NOT DISTINCT FROM _substitute OR length(coalesce(_note,''))>2000 OR length(coalesce(_room,''))>100 OR NOT EXISTS(SELECT 1 FROM class_subject_teachers WHERE class_id=_class AND subject_id=_subject AND teacher_id=_original) OR NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_substitute AND school_id=portal_class_school(_class) AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY')) THEN RAISE EXCEPTION 'Provjerite dodijeljeni predmet, nastavnike, datum i sat.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('substitution:'||_date::text||':'||_hour::text,0));
 IF EXISTS(SELECT 1 FROM teacher_substitutions WHERE date=_date AND hour=_hour AND cancelled_at IS NULL AND (class_id=_class OR substitute_teacher_id=_substitute)) THEN RAISE EXCEPTION 'Razred ili zamjenski nastavnik već ima zamjenu u tom terminu.';END IF;
 INSERT INTO teacher_substitutions(school_id,class_id,subject_id,original_teacher_id,substitute_teacher_id,date,hour,room,notes) VALUES(portal_class_school(_class),_class,_subject,_original,_substitute,_date,_hour,_room,_note) RETURNING id INTO result;
 FOR r IN SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE' UNION SELECT parent_id FROM parent_child_relationships WHERE child_id IN (SELECT student_id FROM student_class_enrollments WHERE class_id=_class AND status='ACTIVE') AND school_id=portal_class_school(_class) UNION SELECT _substitute LOOP PERFORM services_notify(r,'Promjena rasporeda / zamjena nastavnika',_class);END LOOP;
 PERFORM services_audit(_class,'SUBSTITUTION',result::text,'CREATE',NULL,jsonb_build_object('date',_date,'hour',_hour,'subject_id',_subject,'substitute',_substitute,'room',_room));RETURN result;
END $$;
CREATE OR REPLACE FUNCTION school_services_context(_class text DEFAULT NULL,_student uuid DEFAULT NULL,_office boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE school text;manager boolean;support boolean;staff boolean;support_view boolean;
BEGIN
 IF _office THEN
  school:=registrar_require_school();
  RETURN jsonb_build_object('office',true,'requests',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('student',p.name,'class',c.name,'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'number',d.document_number)),'[]') FROM school_document_records d WHERE d.school_id=school AND d.student_id=r.student_id AND d.class_id=r.class_id AND d.status='IZDANO' AND d.pdf_path IS NOT NULL)) ORDER BY r.created_at DESC),'[]') FROM school_document_requests r JOIN user_profiles p ON p.id=r.student_id JOIN classes c ON c.id=r.class_id WHERE r.school_id=school));
 END IF;
 school:=portal_class_school(_class);manager:=services_manager(_class);support_view:=manager OR expert_class(_class);staff:=support_view OR EXISTS(SELECT 1 FROM class_subject_teachers t JOIN user_school_roles r ON r.user_id=t.teacher_id AND r.school_id=school AND r.status='ACTIVE' WHERE t.class_id=_class AND t.teacher_id=portal_profile_id());support:=manager OR (expert_class(_class) AND NOT principal_actor());
 IF school IS NULL OR NOT staff AND NOT services_pupil(_class,_student) THEN RAISE EXCEPTION 'Odaberite svoj razred i povezano dijete.';END IF;
 RETURN jsonb_build_object('manager',manager,'staff',staff,'support',support,'support_view',support_view,'admin',portal_admin(school) AND NOT expert_actor(),'parent',_student IS NOT NULL AND portal_linked(_student,school),'student_id',_student,
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',e.student_id,'student',p.name,'parent_id',r.parent_id,'parent',u.name)),'[]') FROM student_class_enrollments e JOIN user_profiles p ON p.id=e.student_id LEFT JOIN parent_child_relationships r ON r.child_id=p.id AND r.school_id=school LEFT JOIN user_profiles u ON u.id=r.parent_id WHERE e.class_id=_class AND e.status='ACTIVE' AND (manager OR r.parent_id=portal_profile_id() AND e.student_id=_student)),
 'staff_directory',portal_staff_directory(school),
 'subjects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name)),'[]') FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=_class),
 'consents',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('responses',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('student',p.name,'parent',u.name)),'[]') FROM school_consent_responses r JOIN user_profiles p ON p.id=r.student_id JOIN user_profiles u ON u.id=r.parent_id WHERE r.consent_id=c.id AND (manager OR r.student_id=_student AND r.parent_id=portal_profile_id()))) ORDER BY c.created_at DESC),'[]') FROM school_consents c WHERE c.class_id=_class),
 'meetings',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('host',p.name,'booked',EXISTS(SELECT 1 FROM family_meeting_bookings WHERE slot_id=s.id),'booking',(SELECT jsonb_build_object('parent_id',b.parent_id,'student',u.name) FROM family_meeting_bookings b JOIN user_profiles u ON u.id=b.student_id WHERE b.slot_id=s.id AND (manager OR b.parent_id=portal_profile_id()))) ORDER BY s.starts_at),'[]') FROM family_meeting_slots s JOIN user_profiles p ON p.id=s.host_id WHERE s.class_id=_class AND s.cancelled_at IS NULL),
 'requests',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY created_at DESC),'[]') FROM school_document_requests r WHERE r.class_id=_class AND r.student_id=_student AND (r.requested_by=portal_profile_id() OR portal_linked(_student,school))),
 'exams',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('subject',p.name,'registrations',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('student',u.name,'grade',x.grade)),'[]') FROM school_exam_registrations r JOIN user_profiles u ON u.id=r.student_id LEFT JOIN special_exams x ON x.id=r.special_exam_id WHERE r.session_id=s.id AND (staff OR r.student_id=_student))) ORDER BY s.starts_at),'[]') FROM school_exam_sessions s JOIN subjects p ON p.id=s.subject_id WHERE s.class_id=_class),
 'substitutions',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('subject',t.name,'teacher',u.name) ORDER BY s.date DESC,s.hour),'[]') FROM teacher_substitutions s JOIN subjects t ON t.id=s.subject_id JOIN user_profiles u ON u.id=s.substitute_teacher_id WHERE s.class_id=_class AND s.cancelled_at IS NULL),
 'signals',CASE WHEN support_view THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.student_id,'name',p.name,'absences',(SELECT count(*) FROM absences WHERE student_id=e.student_id AND class_id=_class AND date BETWEEN services_today()-29 AND services_today()),'negative',(SELECT count(*) FROM (SELECT DISTINCT ON(subject_id) value FROM final_grades WHERE student_id=e.student_id AND class_id=_class AND upper(coalesce(term,period,'')) IN ('FINAL','YEAR','YEAR_END','GODINA','GODIŠNJA','2','2. POLUGODIŠTE','DRUGO_POLUGODISTE') ORDER BY subject_id,date DESC NULLS LAST,created_at DESC NULLS LAST,id DESC) latest WHERE value='1'),'recent_average',(SELECT avg(value) FROM grades WHERE student_id=e.student_id AND class_id=_class AND date BETWEEN services_today()-29 AND services_today() AND value BETWEEN 1 AND 5),'previous_average',(SELECT avg(value) FROM grades WHERE student_id=e.student_id AND class_id=_class AND date BETWEEN services_today()-59 AND services_today()-30 AND value BETWEEN 1 AND 5))),'[]') FROM student_class_enrollments e JOIN user_profiles p ON p.id=e.student_id WHERE e.class_id=_class AND e.status='ACTIVE') ELSE '[]'::jsonb END,
 'activities',CASE WHEN support THEN (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.date DESC),'[]') FROM expert_service_activities a WHERE a.class_id=_class) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION services_cancel_meeting(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s family_meeting_slots;b family_meeting_bookings;
BEGIN SELECT * INTO s FROM family_meeting_slots WHERE id=_id FOR UPDATE;IF s.id IS NULL OR NOT services_manager(s.class_id) OR s.starts_at<=now() THEN RAISE EXCEPTION 'Termin nije dostupan.';END IF;SELECT * INTO b FROM family_meeting_bookings WHERE slot_id=_id;UPDATE family_meeting_slots SET cancelled_at=now() WHERE id=_id;PERFORM services_notify(b.parent_id,'Termin informacija je otkazan',s.class_id);PERFORM services_audit(s.class_id,'MEETING',_id::text,'CANCEL_SLOT',to_jsonb(s),jsonb_build_object('cancelled',true));END $$;
ALTER TABLE teacher_substitutions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE OR REPLACE FUNCTION services_cancel_substitution(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s teacher_substitutions;r uuid;
BEGIN SELECT * INTO s FROM teacher_substitutions WHERE id=_id FOR UPDATE;IF s.id IS NULL OR expert_actor() OR NOT portal_admin(s.school_id) THEN RAISE EXCEPTION 'Zamjena nije dostupna.';END IF;UPDATE teacher_substitutions SET cancelled_at=now() WHERE id=_id;FOR r IN SELECT student_id FROM student_class_enrollments WHERE class_id=s.class_id AND status='ACTIVE' UNION SELECT parent_id FROM parent_child_relationships WHERE child_id IN(SELECT student_id FROM student_class_enrollments WHERE class_id=s.class_id AND status='ACTIVE') AND school_id=s.school_id UNION SELECT s.substitute_teacher_id LOOP PERFORM services_notify(r,'Zamjena nastavnika je otkazana',s.class_id);END LOOP;PERFORM services_audit(s.class_id,'SUBSTITUTION',_id::text,'CANCEL',to_jsonb(s),jsonb_build_object('cancelled',true));END $$;
ALTER TABLE teacher_substitutions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON teacher_substitutions FROM authenticated;
GRANT SELECT ON teacher_substitutions TO authenticated;
DROP POLICY IF EXISTS services_substitution_reader ON teacher_substitutions;
CREATE POLICY services_substitution_reader ON teacher_substitutions FOR SELECT TO authenticated USING(portal_admin(school_id) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=teacher_substitutions.school_id AND status='ACTIVE'));
DROP POLICY IF EXISTS services_substitution_scope ON teacher_substitutions;
CREATE POLICY services_substitution_scope ON teacher_substitutions AS RESTRICTIVE FOR SELECT TO authenticated USING(portal_admin(school_id) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=teacher_substitutions.school_id AND status='ACTIVE'));

-- Preserve the same restricted support scope under permissive legacy policies.
CREATE OR REPLACE FUNCTION services_support_scope(_student uuid,_class text,_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=_student AND e.status='ACTIVE' AND (_class IS NULL OR e.class_id=_class) AND c.school_id=_school AND (services_manager(c.id) OR expert_class(c.id)))
$$;
DROP POLICY IF EXISTS services_support_private ON expert_service_activities;
CREATE POLICY services_support_private ON expert_service_activities AS RESTRICTIVE FOR ALL TO authenticated USING(services_support_scope(student_id,class_id,school_id)) WITH CHECK(services_support_scope(student_id,class_id,school_id));
-- Private files; no public download URLs are generated.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('family-files','family-files',false,10485760,ARRAY['application/pdf','image/png','image/jpeg']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE OR REPLACE FUNCTION services_file_reader(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM message_attachments a JOIN messages m ON m.id=a.message_id WHERE a.file_url='family-files/'||_path AND services_chat_access(m.group_id)) $$;
CREATE OR REPLACE FUNCTION services_file_referenced(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM message_attachments WHERE file_url='family-files/'||_path) $$;
CREATE OR REPLACE FUNCTION services_upload_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM chat_groups WHERE family_student_id IS NOT NULL AND services_chat_access(id)) $$;
DROP POLICY IF EXISTS services_file_read ON storage.objects;
CREATE POLICY services_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='family-files' AND services_file_reader(name));
DROP POLICY IF EXISTS services_file_upload ON storage.objects;
CREATE POLICY services_file_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='family-files' AND split_part(name,'/',1)=portal_profile_id()::text);
DROP POLICY IF EXISTS services_file_cleanup ON storage.objects;
CREATE POLICY services_file_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='family-files' AND split_part(name,'/',1)=portal_profile_id()::text AND NOT services_file_referenced(name));
DROP POLICY IF EXISTS services_file_scope ON storage.objects;
CREATE POLICY services_file_scope ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id<>'family-files' OR services_file_reader(name) OR split_part(name,'/',1)=portal_profile_id()::text AND NOT services_file_referenced(name)) WITH CHECK(bucket_id<>'family-files' OR split_part(name,'/',1)=portal_profile_id()::text AND NOT services_file_referenced(name) AND services_upload_access());
DROP POLICY IF EXISTS services_file_no_update ON storage.objects;
CREATE POLICY services_file_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'family-files') WITH CHECK(bucket_id<>'family-files');
DROP POLICY IF EXISTS services_file_delete_scope ON storage.objects;
CREATE POLICY services_file_delete_scope ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'family-files' OR split_part(name,'/',1)=portal_profile_id()::text AND NOT services_file_referenced(name));
-- Issued document access is authorized through the linked request and current student relation.
CREATE OR REPLACE FUNCTION services_issued_file_reader(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM school_document_records d WHERE d.pdf_path=_path AND (portal_admin(d.school_id) OR registrar_school_id()=d.school_id OR d.status='IZDANO' AND EXISTS(SELECT 1 FROM school_document_requests r WHERE r.document_id=d.id AND r.status='ISSUED' AND d.student_id=r.student_id AND d.school_id=r.school_id AND services_pupil(r.class_id,r.student_id)))) $$;
DROP POLICY IF EXISTS services_issued_file_read ON storage.objects;
CREATE POLICY services_issued_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='registrar-documents' AND services_issued_file_reader(name));
DROP POLICY IF EXISTS services_issued_file_scope ON storage.objects;
CREATE POLICY services_issued_file_scope ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'registrar-documents' OR services_issued_file_reader(name));
DO $$ DECLARE t text;f record;BEGIN
 FOREACH t IN ARRAY ARRAY['message_receipts','school_consents','school_consent_responses','family_meeting_slots','family_meeting_bookings','school_document_requests','school_exam_sessions','school_exam_registrations'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t);END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'services_%' OR p.proname IN ('school_services_context','portal_linked_for_parent')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  IF f.proname NOT IN ('services_audit','services_notify','portal_linked_for_parent') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.portal_work_queue(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb:='[]';c record;n bigint;
BEGIN
 IF registrar_is_user() THEN
  IF registrar_require_school() IS DISTINCT FROM _school THEN RAISE EXCEPTION 'Ustanova nije dostupna.';END IF;
  SELECT count(*) INTO n FROM school_document_records WHERE school_id=_school AND status IN ('NACRT','SPREMNO','PRIPREMLJENO');
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','documents','title','Dokumenti čekaju izdavanje','count',n,'link','https://referada.skolehr.xyz/?task=documents'));END IF;
  SELECT count(*) INTO n FROM school_document_requests WHERE school_id=_school AND status IN ('SUBMITTED','PROCESSING');
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','requests','title','Zahtjevi učenika i roditelja','count',n,'link','https://referada.skolehr.xyz/?task=requests'));END IF;
  RETURN result;
 END IF;
 IF NOT portal_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE' AND role IN ('TEACHER','HOMEROOM','DEPUTY','EXPERT','PRINCIPAL')) THEN RAISE EXCEPTION 'Zadaci nisu dostupni za ovu školu.';END IF;
 FOR c IN SELECT id,name FROM classes WHERE school_id=_school AND portal_class_manager(id) LOOP
  SELECT count(*) INTO n FROM family_absence_requests WHERE class_id=c.id AND status='SUBMITTED';
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','absence-'||c.id,'title',c.name||' — zahtjevi za opravdavanje','count',n,'link','/class/'||c.id||'/zahtjevi-izostanaka'));END IF;
 END LOOP;
 IF registry_admin(_school) THEN
  SELECT count(*) INTO n FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE c.school_id=_school AND e.status='ACTIVE' AND (e.status_verified_at IS NULL OR nullif(trim(e.status_evidence),'') IS NULL);
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('key','schooling','title','Upisi bez provjerenog statusa školovanja','count',n,'link','https://e-matica.skolehr.xyz/'));END IF;
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.portal_year_readiness(_school text,_year uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record;e record;s record;v text;missing int;unassigned int;pupils int;pending int;requests int;pending_exams int;result jsonb:='[]';blockers int:=0;y school_years;
BEGIN
 IF NOT registry_admin(_school) AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='PRINCIPAL' AND status='ACTIVE' AND school_id=_school) THEN RAISE EXCEPTION 'Nemate ovlasti za pregled godine.';END IF;
 SELECT * INTO y FROM school_years WHERE id=_year AND school_id=_school;
 IF y.id IS NULL THEN RAISE EXCEPTION 'Školska godina ne pripada ustanovi.';END IF;
 FOR c IN SELECT * FROM classes WHERE school_id=_school AND school_year_id=_year LOOP
  missing:=0;unassigned:=0;pupils:=0;
  FOR e IN SELECT * FROM student_class_enrollments WHERE class_id=c.id AND status='ACTIVE' LOOP
   pupils:=pupils+1;
   IF NOT EXISTS(SELECT 1 FROM student_subject_enrollments WHERE student_id=e.student_id AND class_id=c.id AND status='ACTIVE') THEN unassigned:=unassigned+1;END IF;
   FOR s IN SELECT DISTINCT subject_id FROM student_subject_enrollments WHERE student_id=e.student_id AND class_id=c.id AND status='ACTIVE' LOOP
    SELECT g.value INTO v FROM final_grades g WHERE student_id=e.student_id AND class_id=c.id AND subject_id=s.subject_id AND upper(coalesce(term,period,'')) IN ('FINAL','YEAR','YEAR_END','GODINA','GODIŠNJA','2','2. POLUGODIŠTE','DRUGO_POLUGODISTE') ORDER BY date DESC,created_at DESC LIMIT 1;
    IF nullif(trim(v),'') IS NULL THEN SELECT grade_value INTO v FROM enrollment_final_grades WHERE student_id=e.student_id AND class_id=c.id AND subject_id=s.subject_id AND school_year_id=_year ORDER BY date DESC,created_at DESC LIMIT 1;END IF;
    IF nullif(trim(v),'') IS NULL THEN missing:=missing+1;END IF;
   END LOOP;
  END LOOP;
  SELECT count(*) INTO pending FROM absences WHERE class_id=c.id AND upper(status) IN ('PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU');
  SELECT count(*) INTO requests FROM family_absence_requests WHERE class_id=c.id AND status='SUBMITTED';
  SELECT count(*) INTO pending_exams FROM school_exam_registrations r JOIN school_exam_sessions scheduled ON scheduled.id=r.session_id WHERE scheduled.class_id=c.id AND scheduled.cancelled_at IS NULL AND r.special_exam_id IS NULL AND r.resolved_at IS NULL;
  blockers:=blockers+missing+unassigned+pending+requests+pending_exams;
  result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'pupils',pupils,'missingSubjects',unassigned,'missingFinalGrades',missing,'pendingAbsences',pending,'pendingRequests',requests,'pendingExams',pending_exams,'locked',coalesce(c.is_locked,false)));
 END LOOP;
 RETURN jsonb_build_object('classes',result,'blockers',blockers,'canClose',jsonb_array_length(result)>0 AND blockers=0,'closedAt',y.workflow_closed_at,'reason',y.workflow_closure_reason);
END $$;
-- Special exam results also respect the common year lock, including existing registry RPCs.
DROP TRIGGER IF EXISTS workflow_year_lock ON special_exams;
CREATE TRIGGER workflow_year_lock BEFORE INSERT OR UPDATE OR DELETE ON special_exams FOR EACH ROW EXECUTE FUNCTION workflow_year_lock_guard();

NOTIFY pgrst,'reload schema';
COMMIT;
