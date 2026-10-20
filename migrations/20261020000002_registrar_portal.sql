BEGIN;
CREATE TABLE public.registrar_assignments (
 user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id),school_id text NOT NULL REFERENCES public.schools(id),
 is_active boolean NOT NULL DEFAULT true,assigned_by uuid NOT NULL REFERENCES public.user_profiles(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registrar_verified_sessions (
 session_id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.user_profiles(id),expires_at timestamptz NOT NULL
);
ALTER TABLE registrar_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registrar_verified_sessions FROM anon,authenticated;
GRANT ALL ON registrar_verified_sessions TO service_role;
CREATE TABLE public.registrar_school_settings (
 school_id text PRIMARY KEY REFERENCES public.schools(id),signer_name text NOT NULL DEFAULT '',signature_path text,updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES public.user_profiles(id)
);
ALTER TABLE registrar_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrar_school_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registrar_assignments,registrar_school_settings FROM anon,authenticated;
CREATE FUNCTION public.registrar_is_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=portal_profile_id() AND (role='REGISTRAR' OR access_role='REGISTRAR')) OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=portal_profile_id() AND role='REGISTRAR')
$$;
CREATE FUNCTION public.registrar_school_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.school_id FROM registrar_assignments a JOIN schools s ON s.id=a.school_id WHERE a.user_id=portal_profile_id() AND a.is_active AND s.is_active IS DISTINCT FROM false AND registrar_is_user() AND EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=a.user_id AND p.requires_authenticator_setup IS DISTINCT FROM true) AND EXISTS(SELECT 1 FROM registrar_verified_sessions v WHERE v.user_id=a.user_id AND v.session_id=NULLIF(auth.jwt()->>'session_id','')::uuid AND v.expires_at>now())
$$;
CREATE FUNCTION public.registrar_require_school() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text;
BEGIN
 s:=registrar_school_id();IF s IS NULL THEN RAISE EXCEPTION 'Računu nije dodijeljen aktivan pristup Školskoj referadi. Obratite se administratoru škole.';END IF;RETURN s;
END $$;
CREATE FUNCTION public.registrar_manage_context(_school text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT portal_admin(_school) THEN RAISE EXCEPTION 'Pristup nije dopušten.';END IF;
 RETURN jsonb_build_object('users',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email)),'[]') FROM user_profiles p WHERE EXISTS(SELECT 1 FROM user_school_roles r WHERE r.user_id=p.id AND r.role='REGISTRAR' AND r.school_id=_school AND r.status='ACTIVE')),'assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]') FROM registrar_assignments a WHERE a.school_id=_school));
END $$;
CREATE FUNCTION public.registrar_assign(_user uuid,_school text,_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_school text;
BEGIN
 IF NOT portal_admin(_school) THEN RAISE EXCEPTION 'Samo administrator škole može dodijeliti referadu.';END IF;
 SELECT school_id INTO old_school FROM registrar_assignments WHERE user_id=_user FOR UPDATE;
 IF old_school IS NOT NULL AND old_school<>_school AND NOT portal_admin(old_school) THEN RAISE EXCEPTION 'Račun već pripada referadi druge škole.';END IF;
 IF NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND school_id=_school AND role='REGISTRAR' AND status='ACTIVE') OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_user AND status='ACTIVE' AND (school_id<>_school OR role<>'REGISTRAR')) THEN RAISE EXCEPTION 'Za referadu koristite zaseban račun s jedinom aktivnom ulogom Školska referada u ovoj školi.';END IF;
 IF EXISTS(SELECT 1 FROM user_profiles WHERE id=_user AND (role IN ('MAIN_ADMIN','SUPER_ADMIN','ADMIN','SCHOOL_ADMIN') OR access_role IN ('MAIN_ADMIN','SUPER_ADMIN','ADMIN','SCHOOL_ADMIN'))) THEN RAISE EXCEPTION 'Za referadu izradite zaseban korisnički račun.';END IF;
 INSERT INTO registrar_assignments(user_id,school_id,is_active,assigned_by) VALUES(_user,_school,_active,portal_profile_id()) ON CONFLICT(user_id) DO UPDATE SET school_id=excluded.school_id,is_active=excluded.is_active,assigned_by=excluded.assigned_by,updated_at=now();
 UPDATE user_profiles SET role='REGISTRAR',access_role='REGISTRAR' WHERE id=_user;
END $$;
CREATE FUNCTION public.registrar_touch_session() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF registrar_school_id() IS NULL THEN RAISE EXCEPTION 'Za pristup referadi prijavite se PIN-om i kodom iz autentifikatora ili zatražite dodjelu škole.';END IF;
 UPDATE registrar_verified_sessions SET expires_at=now()+interval '45 minutes' WHERE user_id=portal_profile_id() AND session_id=NULLIF(auth.jwt()->>'session_id','')::uuid AND expires_at>now();
END $$;
CREATE FUNCTION public.registrar_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN RETURN jsonb_build_object('school',(SELECT jsonb_build_object('id',id,'name',name,'city',city) FROM schools WHERE id=s),'signer',(SELECT COALESCE(to_jsonb(r),'{}') FROM registrar_school_settings r WHERE r.school_id=s));END $$;
CREATE FUNCTION public.registrar_students(_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT e.id,e.student_id,e.class_id,p.name,p.oib,p.gender,p.dob,c.name AS class_name,c.school_year,e.status FROM student_class_enrollments e JOIN classes c ON c.id=e.class_id JOIN user_profiles p ON p.id=e.student_id WHERE c.school_id=s AND e.status='ACTIVE' AND (COALESCE(_search,'')='' OR p.name ILIKE '%'||left(_search,100)||'%' OR p.oib=left(_search,100)) ORDER BY p.name,c.school_year DESC LIMIT 200)x);END $$;
CREATE FUNCTION public.registrar_certificates() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT * FROM portal_attendance_certificates WHERE school_id=s AND mode='SCHOOL' ORDER BY issued_at DESC LIMIT 200)x);END $$;
CREATE OR REPLACE FUNCTION public.portal_office_access(_school text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT portal_admin(_school) OR COALESCE(registrar_school_id()=_school,false) $$;
CREATE OR REPLACE FUNCTION public.portal_attestation_data(_school text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE((SELECT jsonb_build_object('signer_name',signer_name,'signature_path',signature_path) FROM registrar_school_settings WHERE school_id=_school AND portal_office_access(_school)),'{}')
$$;
CREATE FUNCTION public.registrar_issue_certificate(_student uuid,_class text,_purpose text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM classes WHERE id=_class AND school_id=s) THEN RAISE EXCEPTION 'Razred nije u vašoj školi.';END IF;
 RETURN portal_issue_attendance(_student,_class,_purpose,'SCHOOL');
END $$;
CREATE FUNCTION public.registrar_set_signature(_path text,_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s text:=registrar_require_school();
BEGIN
 IF length(trim(COALESCE(_name,''))) NOT BETWEEN 1 AND 150 OR _path IS NULL OR split_part(_path,'/',1)<>s OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='registrar-assets' AND name=_path) THEN RAISE EXCEPTION 'Provjerite ime potpisnika i priloženi potpis.';END IF;
 INSERT INTO registrar_school_settings(school_id,signer_name,signature_path,updated_by) VALUES(s,trim(_name),_path,portal_profile_id()) ON CONFLICT(school_id) DO UPDATE SET signer_name=excluded.signer_name,signature_path=excluded.signature_path,updated_at=now(),updated_by=excluded.updated_by;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('registrar-assets','registrar-assets',false,2097152,ARRAY['image/png']) ON CONFLICT(id) DO UPDATE SET public=false;
CREATE POLICY registrar_asset_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='registrar-assets' AND split_part(name,'/',1)=registrar_school_id());
CREATE POLICY registrar_asset_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='registrar-assets' AND (split_part(name,'/',1)=registrar_school_id() OR portal_admin(split_part(name,'/',1))));
-- Dedicated registrar accounts use scoped RPCs. Broad legacy policies must not expose other schools.
-- Definer helpers read the same account/assignment without RLS recursion.
DO $$ DECLARE t record;pred text;BEGIN
 FOR t IN SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' LOOP
  -- Preserve authenticated access on legacy tables that previously had no RLS.
  -- Existing policies on already protected tables remain authoritative.
  IF NOT t.rowsecurity THEN
   EXECUTE format('CREATE POLICY legacy_authenticated_access ON public.%I FOR ALL TO authenticated USING(true) WITH CHECK(true)',t.tablename);
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  IF t.tablename IN ('user_profiles','user_school_roles') THEN
   pred:=CASE WHEN t.tablename='user_profiles' THEN 'id=public.portal_profile_id()' ELSE 'user_id=public.portal_profile_id()' END;
   EXECUTE format('CREATE POLICY registrar_read_scope ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.registrar_is_user() OR %s)',t.tablename,pred);
   EXECUTE format('CREATE POLICY registrar_insert_scope ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT public.registrar_is_user())',t.tablename);
   EXECUTE format('CREATE POLICY registrar_update_scope ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT public.registrar_is_user()) WITH CHECK(NOT public.registrar_is_user())',t.tablename);
   EXECUTE format('CREATE POLICY registrar_delete_scope ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT public.registrar_is_user())',t.tablename);
  ELSE EXECUTE format('CREATE POLICY registrar_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.registrar_is_user()) WITH CHECK(NOT public.registrar_is_user())',t.tablename);END IF;
 END LOOP;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'registrar_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END LOOP;END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
