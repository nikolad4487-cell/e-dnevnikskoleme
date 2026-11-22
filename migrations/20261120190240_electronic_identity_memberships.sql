BEGIN;
CREATE OR REPLACE FUNCTION public.identity_expiry_for_year(y jsonb) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE m text[]; BEGIN
 m:=regexp_match(coalesce(nullif(y->>'label',''),nullif(y->>'name',''),y->>'school_year',''),'([12][0-9]{3})[.]?\s*[/-]\s*([12][0-9]{3})');
 IF m IS NULL OR m[2]::integer<>m[1]::integer+1 THEN RAISE EXCEPTION 'Školska godina nema jednoznačan početak i završetak.';END IF;
 RETURN make_date(m[2]::integer,10,31);
END $$;
CREATE TABLE IF NOT EXISTS public.electronic_identity_memberships(
 profile_id uuid NOT NULL REFERENCES public.user_profiles(id),school_id text NOT NULL REFERENCES public.schools(id),
 relationship text NOT NULL CHECK(relationship IN ('STUDENT','TEACHER')),school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 valid_until date NOT NULL,issue_state text NOT NULL DEFAULT 'UNISSUED' CHECK(issue_state IN ('UNISSUED','ISSUING','READY','ACTIVATION_PENDING')),
 issuance_id uuid,lease_until timestamptz,issue_valid_until date,issued_at timestamptz,
 PRIMARY KEY(profile_id,school_id,relationship),CHECK(extract(month from valid_until)=10 AND extract(day from valid_until)=31)
);
ALTER TABLE public.electronic_identity_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.electronic_identity_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.electronic_identity_memberships TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.electronic_identity_memberships TO service_role;
DROP POLICY IF EXISTS identity_admin_read ON public.electronic_identity_memberships;
CREATE POLICY identity_admin_read ON public.electronic_identity_memberships FOR SELECT TO authenticated USING(public.registry_admin(school_id));
CREATE OR REPLACE FUNCTION public.identity_enrollment_renewal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c classes;y school_years;expiry date;BEGIN
 IF upper(coalesce(NEW.status,''))<>'ACTIVE' OR NEW.student_id IS NULL OR NOT EXISTS(SELECT 1 FROM user_profiles WHERE id=NEW.student_id AND auth_user_id IS NOT NULL) THEN RETURN NEW;END IF;
 SELECT * INTO c FROM classes WHERE id=NEW.class_id;
 SELECT * INTO y FROM school_years WHERE id=coalesce(NEW.school_year_id,c.school_year_id) AND school_id=c.school_id;
 IF y.id IS NULL THEN RETURN NEW;END IF;
 expiry:=identity_expiry_for_year(to_jsonb(y));
 INSERT INTO electronic_identity_memberships(profile_id,school_id,relationship,school_year_id,valid_until)
 VALUES(NEW.student_id,c.school_id,'STUDENT',y.id,expiry)
 ON CONFLICT(profile_id,school_id,relationship) DO UPDATE SET
 school_year_id=CASE WHEN excluded.valid_until>=electronic_identity_memberships.valid_until THEN excluded.school_year_id ELSE electronic_identity_memberships.school_year_id END,
 valid_until=greatest(electronic_identity_memberships.valid_until,excluded.valid_until);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS identity_enrollment_renewal ON public.student_class_enrollments;
CREATE TRIGGER identity_enrollment_renewal AFTER INSERT OR UPDATE OF school_year_id,class_id,status ON public.student_class_enrollments FOR EACH ROW EXECUTE FUNCTION public.identity_enrollment_renewal();
CREATE OR REPLACE FUNCTION public.identity_reserve_issue(_profile uuid,_school text,_relationship text,_year uuid,_until date,_issuance uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r electronic_identity_memberships;y school_years;BEGIN
 SELECT * INTO y FROM school_years WHERE id=_year AND school_id=_school;
 IF y.id IS NULL OR NOT EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=_profile AND school_id=_school AND status='ACTIVE' AND ((_relationship='STUDENT' AND role='STUDENT') OR (_relationship='TEACHER' AND role IN ('TEACHER','HOMEROOM','HOMEROOM_TEACHER','DEPUTY')))) THEN RAISE EXCEPTION 'Identitet ne pripada ustanovi i ulozi.';END IF;
 INSERT INTO electronic_identity_memberships(profile_id,school_id,relationship,school_year_id,valid_until) VALUES(_profile,_school,_relationship,_year,identity_expiry_for_year(to_jsonb(y))) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM electronic_identity_memberships WHERE profile_id=_profile AND school_id=_school AND relationship=_relationship FOR UPDATE;
 IF r.valid_until<>_until OR r.lease_until>now() THEN RAISE EXCEPTION 'Izdavanje je u tijeku ili su podaci promijenjeni. Osvježite prikaz.';END IF;
 UPDATE electronic_identity_memberships SET issuance_id=_issuance,lease_until=now()+interval '2 minutes',issue_valid_until=valid_until,issue_state='ISSUING' WHERE profile_id=_profile AND school_id=_school AND relationship=_relationship;
END $$;
CREATE OR REPLACE FUNCTION public.identity_finish_issue(_profile uuid,_school text,_relationship text,_issuance uuid,_actor uuid,_ready boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r electronic_identity_memberships;BEGIN
 SELECT * INTO r FROM electronic_identity_memberships WHERE profile_id=_profile AND school_id=_school AND relationship=_relationship FOR UPDATE;
 IF r.issuance_id IS DISTINCT FROM _issuance OR (_ready AND (r.valid_until<>r.issue_valid_until OR r.lease_until<now())) THEN RAISE EXCEPTION 'Izdavanje je isteklo ili se promijenio upis.';END IF;
 UPDATE electronic_identity_memberships SET lease_until=NULL,issue_state=CASE WHEN _ready THEN 'READY' ELSE 'ACTIVATION_PENDING' END,issued_at=CASE WHEN _ready THEN now() ELSE issued_at END WHERE profile_id=_profile AND school_id=_school AND relationship=_relationship;
 INSERT INTO registry_change_log(school_id,entity,entity_id,action,actor_id,after_data) VALUES(_school,'ELECTRONIC_IDENTITY',_profile::text,CASE WHEN _ready THEN 'ISSUED' ELSE 'ACTIVATION_PENDING' END,_actor,jsonb_build_object('relationship',_relationship,'valid_until',r.valid_until,'issuance_id',_issuance));
END $$;
REVOKE ALL ON FUNCTION public.identity_expiry_for_year(jsonb),public.identity_enrollment_renewal(),public.identity_reserve_issue(uuid,text,text,uuid,date,uuid),public.identity_finish_issue(uuid,text,text,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.identity_reserve_issue(uuid,text,text,uuid,date,uuid),public.identity_finish_issue(uuid,text,text,uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
