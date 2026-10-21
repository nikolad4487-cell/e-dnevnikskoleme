BEGIN;
ALTER TABLE user_school_roles ADD COLUMN IF NOT EXISTS can_delegate_registry boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.registry_scoped_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT registry_global_admin() AND (EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND upper(access_role) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR','RAVNATELJ','STRUCNA_SLUZBA')) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE'))
$$;
CREATE FUNCTION public.registry_student_visible(_student uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM registry_students r WHERE r.id=_student AND r.created_by=auth.uid() AND NOT EXISTS(SELECT 1 FROM student_class_enrollments e WHERE e.registry_student_id=r.id) AND NOT EXISTS(SELECT 1 FROM student_school_enrollments e WHERE e.student_id=r.id)) OR EXISTS(SELECT 1 FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id WHERE (e.registry_student_id=_student OR e.student_id=_student) AND registry_admin(c.school_id)) OR EXISTS(SELECT 1 FROM student_school_enrollments WHERE student_id=_student AND registry_admin(school_id))
$$;
CREATE FUNCTION public.registry_profile_visible(_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _profile=portal_profile_id() OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_profile AND registry_admin(school_id)) OR registry_student_visible(_profile)
$$;
CREATE POLICY registry_scoped_students_read ON registry_students AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_students_update ON registry_students AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id)) WITH CHECK(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_students_delete ON registry_students AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT registry_scoped_actor() OR registry_student_visible(id));
CREATE POLICY registry_scoped_profiles ON user_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_profile_visible(id));
CREATE POLICY registry_scoped_roles ON user_school_roles AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(school_id));
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['schools','classes','programs','school_years','student_school_enrollments','student_year_end_summaries','student_certificates'] LOOP
  EXECUTE format('CREATE POLICY registry_scoped_read ON %I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(%s))',t,CASE WHEN t='schools' THEN 'id' ELSE 'school_id' END);
 END LOOP;
END $$;
CREATE POLICY registry_scoped_enrollments ON student_class_enrollments AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT registry_scoped_actor() OR registry_admin(portal_class_school(class_id)));
DO $$ DECLARE v text;BEGIN
 FOREACH v IN ARRAY ARRAY['v_ematica_students_current','v_ematica_students_current_extended','v_ematica_class_summary','v_student_class_enrollments_detailed','v_ematica_year_end_summaries','v_ematica_sync_status','v_ematica_transfers_detailed','v_ematica_dashboard_stats'] LOOP
  IF EXISTS(SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=v) THEN EXECUTE format('ALTER VIEW %I SET(security_invoker=true)',v);END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.registry_manage_permissions(_school text,_user uuid,_active boolean,_delegate boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing_id uuid;
BEGIN
 IF NOT registry_global_admin() AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND school_id=_school AND status='ACTIVE' AND role IN ('ADMIN','SCHOOL_ADMIN') AND can_delegate_registry) THEN RAISE EXCEPTION 'Prava dodjeljuje glavni ili imenovani administrator ustanove.';END IF;
 IF _delegate AND NOT registry_global_admin() THEN RAISE EXCEPTION 'Pravo daljnje dodjele može postaviti samo glavni administrator.';END IF;
 IF _user=portal_profile_id() THEN RAISE EXCEPTION 'Vlastita prava mijenja drugi ovlašteni administrator.';END IF;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND school_id=_school AND status='ACTIVE' AND role NOT IN ('STUDENT','PARENT','REGISTRAR')) OR EXISTS(SELECT 1 FROM user_profiles WHERE id=_user AND (upper(role) IN ('MAIN_ADMIN','SUPER_ADMIN','REGISTRAR') OR upper(access_role) IN ('MAIN_ADMIN','SUPER_ADMIN','REGISTRAR'))) THEN RAISE EXCEPTION 'Odaberite djelatnika ove ustanove bez globalne ili referadske uloge.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_school||_user::text,0));
 SELECT id INTO existing_id FROM user_school_roles WHERE user_id=_user AND school_id=_school AND role='SCHOOL_ADMIN' LIMIT 1 FOR UPDATE;
 IF existing_id IS NULL THEN
  IF NOT _active THEN RAISE EXCEPTION 'Pravo nije dodijeljeno.';END IF;
  INSERT INTO user_school_roles(user_id,school_id,role,status,can_delegate_registry) VALUES(_user,_school,'SCHOOL_ADMIN','ACTIVE',_delegate);
 ELSE UPDATE user_school_roles SET status=CASE WHEN _active THEN 'ACTIVE' ELSE 'REVOKED' END,can_delegate_registry=_active AND _delegate,updated_at=now() WHERE id=existing_id;END IF;
 IF _active THEN UPDATE user_profiles SET access_role='school_admin',active_school_id=_school WHERE id=_user;
 ELSIF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE') THEN UPDATE user_profiles SET access_role='teacher' WHERE id=_user AND upper(access_role) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR');END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(_school,'PERMISSION',_user::text,CASE WHEN _active THEN 'GRANT' ELSE 'REVOKE' END,portal_profile_id(),jsonb_build_object('role','SCHOOL_ADMIN','can_delegate',_delegate));
END $$;
CREATE FUNCTION public.registry_link_existing_staff(_school text,_oib text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE person user_profiles;
BEGIN
 IF NOT registry_admin(_school) OR _oib IS NULL OR _oib!~'^[0-9]{11}$' THEN RAISE EXCEPTION 'Provjerite ustanovu, ovlasti i OIB.';END IF;
 SELECT * INTO person FROM user_profiles p WHERE p.oib=_oib AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=p.id AND role IN ('PARENT','STUDENT','REGISTRAR')) AND (upper(p.role) IN ('TEACHER','ADMIN','SCHOOL_ADMIN','PRINCIPAL','STAFF') OR upper(p.access_role) IN ('TEACHER','NASTAVNIK','PROFESSOR','SCHOOL_ADMIN')) LIMIT 1;
 IF person.id IS NULL THEN RAISE EXCEPTION 'U lokalnoj evidenciji nije pronađen djelatnik za povezivanje. Novi račun dodaje se kroz Novi korisnik.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_school||person.id::text,0));
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=person.id AND school_id=_school AND role='TEACHER') THEN INSERT INTO user_school_roles(user_id,school_id,role,status) VALUES(person.id,_school,'TEACHER','ACTIVE');
 ELSE UPDATE user_school_roles SET status='ACTIVE',updated_at=now() WHERE user_id=person.id AND school_id=_school AND role='TEACHER';END IF;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id) VALUES(_school,'STAFF_LINK',person.id::text,'LINK_EXISTING',portal_profile_id());
 RETURN jsonb_build_object('id',person.id,'name',person.name);
END $$;
CREATE FUNCTION public.registry_protect_authority() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND NOT registry_global_admin() THEN
  IF TG_TABLE_NAME='user_profiles' THEN
   IF (NEW.role,NEW.access_role,NEW.auth_user_id,NEW.school_id) IS DISTINCT FROM (OLD.role,OLD.access_role,OLD.auth_user_id,OLD.school_id) THEN RAISE EXCEPTION 'Korisničke ovlasti i pripadnost mijenjaju se kroz ovlašteni postupak.';END IF;
   IF NEW.active_school_id IS DISTINCT FROM OLD.active_school_id AND upper(coalesce(NEW.access_role,'')) IN ('SCHOOL_ADMIN','ADMIN','ADMINISTRATOR') AND NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=OLD.id AND school_id=NEW.active_school_id AND role IN ('ADMIN','SCHOOL_ADMIN') AND status='ACTIVE') THEN RAISE EXCEPTION 'Nemate administratorsku ulogu u odabranoj ustanovi.';END IF;
  ELSE
   IF NEW.role IN ('ADMIN','SCHOOL_ADMIN','MAIN_ADMIN','SUPER_ADMIN') OR NEW.can_delegate_registry THEN RAISE EXCEPTION 'Administratorska prava dodjeljuju se kroz upravljanje pravima ustanove.';END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER registry_protect_profile_authority BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION registry_protect_authority();
CREATE TRIGGER registry_protect_role_authority BEFORE INSERT OR UPDATE ON user_school_roles FOR EACH ROW EXECUTE FUNCTION registry_protect_authority();
REVOKE ALL ON FUNCTION registry_scoped_actor(),registry_student_visible(uuid),registry_profile_visible(uuid),registry_manage_permissions(text,uuid,boolean,boolean),registry_link_existing_staff(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION registry_scoped_actor(),registry_student_visible(uuid),registry_profile_visible(uuid),registry_manage_permissions(text,uuid,boolean,boolean),registry_link_existing_staff(text,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
