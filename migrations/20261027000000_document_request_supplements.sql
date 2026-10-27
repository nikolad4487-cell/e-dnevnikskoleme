-- Follow-up for the existing document request workflow. No parallel request table.
BEGIN;
ALTER TABLE school_document_requests DROP CONSTRAINT IF EXISTS school_document_requests_status_check;
ALTER TABLE school_document_requests ADD CONSTRAINT school_document_requests_status_check
 CHECK(status IN ('SUBMITTED','PROCESSING','NEEDS_INFORMATION','ISSUED','REJECTED'));
CREATE OR REPLACE FUNCTION services_handle_request(_id uuid,_status text,_note text,_document uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;school text;d school_document_records;
BEGIN
 school:=registrar_require_school();SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM school OR (_status IS NULL OR _status NOT IN ('PROCESSING','NEEDS_INFORMATION','ISSUED','REJECTED')) OR length(coalesce(_note,''))>2000 OR r.status IN ('ISSUED','REJECTED') OR (_status IN ('REJECTED','NEEDS_INFORMATION') AND length(trim(coalesce(_note,'')))<3) THEN RAISE EXCEPTION 'Zahtjev nije dostupan ili provjerite status i obrazloženje.';END IF;
 IF _status='ISSUED' THEN SELECT * INTO d FROM school_document_records WHERE id=_document;IF d.id IS NULL OR d.student_id IS DISTINCT FROM r.student_id OR d.school_id IS DISTINCT FROM school OR d.class_id IS DISTINCT FROM r.class_id OR d.status<>'IZDANO' OR d.pdf_path IS NULL THEN RAISE EXCEPTION 'Odaberite već izdani dokument ovog učenika i razreda.';END IF;END IF;
 UPDATE school_document_requests SET status=_status,note=coalesce(_note,''),document_id=CASE WHEN _status='ISSUED' THEN _document END,handled_by=portal_profile_id(),updated_at=now() WHERE id=_id;
 PERFORM services_audit(r.class_id,'DOCUMENT_REQUEST',_id::text,_status,to_jsonb(r),jsonb_build_object('status',_status,'document_id',_document,'note',_note));INSERT INTO portal_notifications(user_id,student_id,class_id,title,body,link) VALUES(r.requested_by,r.student_id,r.class_id,
 'Zahtjev referadi: '||CASE _status WHEN 'PROCESSING' THEN 'U obradi' WHEN 'NEEDS_INFORMATION' THEN 'Potrebna dopuna' WHEN 'ISSUED' THEN 'Spremno za preuzimanje' ELSE 'Odbijeno' END,
 left(coalesce(_note,''),250),'/student/skolske-usluge?tab=requests&request='||r.id::text);
END $$;

-- The current UI supplies the observed timestamp to reject stale decisions.
CREATE OR REPLACE FUNCTION services_review_request(_id uuid,_status text,_note text,_document uuid,_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests; school text;
BEGIN
 school:=registrar_require_school();
 SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM school OR r.updated_at IS DISTINCT FROM _updated_at THEN
  RAISE EXCEPTION 'Zahtjev je promijenjen ili nije dostupan. Osvježite prikaz.';
 END IF;
 PERFORM services_handle_request(_id,_status,_note,_document);
END $$;
CREATE OR REPLACE FUNCTION services_supplement_request(_id uuid,_purpose text,_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r school_document_requests;
BEGIN
 SELECT * INTO r FROM school_document_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.requested_by IS DISTINCT FROM portal_profile_id()
  OR NOT services_pupil(r.class_id,r.student_id) OR r.status<>'NEEDS_INFORMATION'
  OR r.updated_at IS DISTINCT FROM _updated_at THEN
  RAISE EXCEPTION 'Zahtjev je promijenjen ili nije dostupan za dopunu. Osvježite prikaz.';
 END IF;
 IF length(trim(coalesce(_purpose,''))) NOT BETWEEN 3 AND 2000 THEN
  RAISE EXCEPTION 'Dopuna treba sadržavati od 3 do 2000 znakova.';
 END IF;
 UPDATE school_document_requests SET purpose=trim(_purpose),status='SUBMITTED',document_id=NULL,updated_at=now() WHERE id=_id;
 PERFORM services_audit(r.class_id,'DOCUMENT_REQUEST',_id::text,'SUPPLEMENT',to_jsonb(r),
  jsonb_build_object('status','SUBMITTED','purpose',trim(_purpose),'note',r.note));
END $$;
REVOKE ALL ON FUNCTION services_review_request(uuid,text,text,uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION services_supplement_request(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION services_review_request(uuid,text,text,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION services_supplement_request(uuid,text,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
