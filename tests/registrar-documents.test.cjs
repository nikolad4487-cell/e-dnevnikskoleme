const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
require('node:test').test('Registrar documents require verified school sessions, real enrollment, PDF review and private archive',async()=>{
 const db=new PGlite();const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 await db.exec(read('fixtures/family-schema.sql'));await db.exec(read('fixtures/registry-schema.sql'));await db.exec(read('fixtures/existing-enrollment-bridge.sql'));
 await db.exec(`CREATE VIEW v_school_document_records_detailed AS SELECT * FROM school_document_records;CREATE VIEW v_weekly_assignments_detailed AS SELECT * FROM weekly_assignments;CREATE VIEW v_student_education_records_detailed AS SELECT * FROM student_education_records;CREATE VIEW v_student_transport_records_detailed AS SELECT * FROM student_transport_records;GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO authenticated;`);
 await db.exec(read('../docs/AKTIVACIJA-RODITELJI-REFERADA.sql'));
 await db.exec("CREATE FUNCTION get_active_school_year() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'private-year'::text $$;");
 await db.exec("CREATE FUNCTION admin_create_user(p_email text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN gen_random_uuid();END $$;");
 const {activationSql}=await import('../scripts/build-registry-activation.mjs');assert.equal(read('../docs/AKTIVACIJA-EMATICA-REFERADA.sql'),activationSql(),'Generated SQL must match source migrations');assert.equal((activationSql().match(/^BEGIN;$/gm)||[]).length,1);assert.equal((activationSql().match(/^COMMIT;$/gm)||[]).length,1);await db.exec(activationSql());
 const admin=uid(1),office=uid(2),student=uid(3),year=uid(4),registry=uid(5),enrollment=uid(6),sid=uid(7),otherYear=uid(8);
 await db.exec("INSERT INTO schools(id,name,education_level,is_active)VALUES('a','School A','SECONDARY',true),('b','School B','HIGHER',true);INSERT INTO classes(id,school_id,name,is_active,is_graduating_class)VALUES('ca','a','4.A',true,true),('cb','b','1.B',true,false);");
 for(const [id,role] of [[admin,'MAIN_ADMIN'],[office,'REGISTRAR'],[student,'STUDENT']]){await db.query('INSERT INTO auth.users(id)VALUES($1)',[id]);await db.query('INSERT INTO user_profiles(id,auth_user_id,role,requires_authenticator_setup,name,oib,dob)VALUES($1,$1,$2,false,$2,\'12345678901\',\'2008-01-01\')',[id,role])}
 await db.query("INSERT INTO school_years(id,school_id,name,label,is_active)VALUES($1,'a','2026/2027','2026./2027.',true),($2,'b','2026/2027','2026./2027.',true)",[year,otherYear]);await db.query("UPDATE classes SET school_year_id=CASE WHEN id='ca' THEN $1::uuid ELSE $2::uuid END",[year,otherYear]);
 await db.query("INSERT INTO registry_students(id,ednevnik_student_id,first_name,last_name,oib,date_of_birth)VALUES($1,$2,'Ana','Anić','12345678901','2008-01-01')",[registry,student]);
 await db.query("INSERT INTO student_class_enrollments(id,student_id,registry_student_id,class_id,school_year_id,status)VALUES($1,$2,$3,'ca',$4,'ACTIVE')",[enrollment,student,registry,year]);
 await db.query("INSERT INTO user_school_roles(user_id,school_id,role,status)VALUES($1,'a','REGISTRAR','ACTIVE')",[office]);
 const login=async id=>{await db.exec('RESET ROLE;SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})])};
 await login(admin);await db.query("SELECT registrar_assign($1,'a',true)",[office]);await login(office);
 await assert.rejects(db.query('SELECT registrar_workspace()'));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("INSERT INTO registrar_verified_sessions(session_id,user_id,expires_at)VALUES($1,$2,now()+interval '45 minutes')",[sid,office]);
 await login(office);let r=await db.query('SELECT registrar_workspace() AS x');assert.equal(r.rows[0].x.classes.length,1);assert.equal(r.rows[0].x.classes[0].id,'ca');
 await assert.rejects(db.query('SELECT get_active_school_year()'));await assert.rejects(db.query("SELECT admin_create_user('test@example.invalid')"));
 await assert.rejects(db.query("SELECT registrar_class_students($1,'cb')",[year]));
 r=await db.query("SELECT registrar_class_students($1,'ca') AS x",[year]);assert.equal(r.rows[0].x[0].name,'Ana Anić');
 const prepare=(template='attendance',inputs={purpose:'Stipendija',attest:false})=>db.query("SELECT registrar_prepare_document($1,'ca',$2,$3,$4) AS x",[year,registry,template,JSON.stringify(inputs)]);
 await assert.rejects(prepare());await login(admin);await db.query("SELECT registry_verify_enrollment($1,'REGULAR','Provjeren upis i matična evidencija')",[enrollment]);await login(office);
 await assert.rejects(prepare('hzpp-student'));await assert.rejects(prepare('attendance',{purpose:'Stipendija',attest:true}));
 r=await prepare();const doc=r.rows[0].x;assert.equal(doc.snapshot.student.name,'Ana Anić');assert(!JSON.stringify(doc.snapshot).includes('pin_hash'));
 await assert.rejects(db.query('SELECT registrar_issue_document($1,$2)',[doc.id,'hash']));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("UPDATE school_document_records SET pdf_path=$2,pdf_sha256='hash',status='SPREMNO',previewed_at=now() WHERE id=$1",[doc.id,`a/${doc.id}/document.pdf`]);
 await login(office);r=await db.query('SELECT registrar_issue_document($1,$2) AS x',[doc.id,'hash']);assert.equal(r.rows[0].x.status,'IZDANO');assert.equal(r.rows[0].x.issued_by,office);
 await assert.rejects(db.query('SELECT registrar_issue_document($1,$2)',[doc.id,'hash']));
 r=await db.query('SELECT * FROM school_document_records');assert.equal(r.rows.length,0,'Registrar has no direct legacy table access');
 await assert.rejects(prepare('transcript',{purpose:'Stipendija',grade_kind:'FINAL',years:[year],attest:false}));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("INSERT INTO subjects(id,name)VALUES('math','Matematika')");await db.query("INSERT INTO final_grades(student_id,subject_id,class_id,school_id,school_year_id,value,date)VALUES($1,'math','ca','a',$2,'5','2027-06-15')",[student,year]);
 await login(office);r=await prepare('transcript',{purpose:'Stipendija',grade_kind:'FINAL',years:[year],attest:false});assert.equal(r.rows[0].x.snapshot.grades[0].value,'5');
 await assert.rejects(prepare('transcript',{purpose:'Stipendija',grade_kind:'FINAL',years:[otherYear],attest:false}));
 await db.query('SELECT registrar_cancel_document($1,$2)',[doc.id,'Pogrešna svrha dokumenta']);r=await db.query('SELECT registrar_document($1) AS x',[doc.id]);assert.equal(r.rows[0].x.status,'PONIŠTENO');
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");const thesis=uid(9);await db.query("INSERT INTO final_thesis(id,student_id,school_year_id,thesis_title)VALUES($1,$2,$3,'Stvarni završni rad')",[thesis,student,year]);
 await login(office);await db.query("SELECT registrar_register_entry($1,'ca',$2,'THESIS','602-01/26-01/1','602-01','2026-10-20','2026-10-20','Završni rad','Provjereno','ZAPRIMLJENO')",[year,thesis]);
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");r=await db.query('SELECT application_registry_number FROM final_thesis WHERE id=$1',[thesis]);assert.equal(r.rows[0].application_registry_number,'602-01/26-01/1');assert.equal((await db.query('SELECT * FROM final_thesis')).rows.length,1);
 await login(office);await assert.rejects(db.query("SELECT registrar_register_entry($1,'ca',$2,'THESIS','602-01/26-01/2','602-01','2026-10-20',NULL,'Završni rad','','ZAPRIMLJENO')",[year,thesis]));

 // A different school's document and private storage objects never become directly readable.
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");
 const foreignDoc=uid(80);
 await db.query("INSERT INTO school_document_records(id,school_id,document_type,status,snapshot)VALUES($1,'b','attendance','IZDANO','{}')",[foreignDoc]);
 await db.query("INSERT INTO storage.objects(bucket_id,name)VALUES('registrar-documents','b/private.pdf')");
 await login(office);await assert.rejects(db.query('SELECT registrar_document($1)',[foreignDoc]));assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='registrar-documents'")).rows.length,0);
 // Changing real data after preview invalidates the prepared snapshot at issuance.
 r=await prepare();const staleDoc=r.rows[0].x;
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");
 await db.query("UPDATE school_document_records SET pdf_path=$2,pdf_sha256='stale',status='SPREMNO',previewed_at=now() WHERE id=$1",[staleDoc.id,`a/${staleDoc.id}/document.pdf`]);
 await db.query("UPDATE registry_students SET address='Changed verified address' WHERE id=$1",[registry]);
 await login(office);await assert.rejects(db.query('SELECT registrar_issue_document($1,$2)',[staleDoc.id,'stale']));
 // School administrators are isolated even where the old baseline allowed authenticated reads.
 await login(admin);const schoolAdmin=uid(50),editor=uid(51),foreign=uid(52);
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");
 for(const [id,school] of [[schoolAdmin,'a'],[editor,'a'],[foreign,'b']]){
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[id]);
  await db.query("INSERT INTO user_profiles(id,auth_user_id,role,access_role,active_school_id,name,oib)VALUES($1,$1,'TEACHER','teacher',$2,'Teacher',$3)",[id,school,'987654321'+id.slice(-2)]);
  await db.query("INSERT INTO user_school_roles(user_id,school_id,role,status)VALUES($1,$2,'TEACHER','ACTIVE')",[id,school]);
 }
 await db.query("INSERT INTO school_document_records(school_id,document_type,status)VALUES('b','PRIVATE_OTHER_SCHOOL','IZDANO')");
 await login(admin);await db.query("SELECT registry_manage_permissions('a',$1,true,true)",[schoolAdmin]);
 await login(schoolAdmin);assert.equal((await db.query('SELECT id FROM schools')).rows.length,1);
 assert.equal((await db.query("SELECT * FROM school_document_records WHERE school_id='b'")).rows.length,0);
 assert.equal((await db.query('SELECT id FROM user_profiles WHERE id=$1',[foreign])).rows.length,0);
 await assert.rejects(db.query("SELECT registry_manage_permissions('b',$1,true,false)",[foreign]));
 await assert.rejects(db.query("UPDATE user_profiles SET access_role='main_admin' WHERE id=$1",[schoolAdmin]));
 await assert.rejects(db.query("UPDATE user_profiles SET active_school_id='b' WHERE id=$1",[schoolAdmin]));
 await db.query("SELECT registry_manage_permissions('a',$1,true,false)",[editor]);
 await login(editor);await assert.rejects(db.query("SELECT registry_manage_permissions('a',$1,true,false)",[schoolAdmin]));
 await login(schoolAdmin);await db.query("SELECT registry_manage_permissions('a',$1,false,false)",[editor]);
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query('SELECT access_role FROM user_profiles WHERE id=$1',[editor])).rows[0].access_role,'teacher');
 // Existing staff linking reuses a profile; it neither creates Auth users nor resets a password.
 await login(schoolAdmin);r=await db.query("SELECT registry_link_existing_staff('a','98765432152') AS x");assert.equal(r.rows[0].x.id,foreign);
 // Validate exam prerequisites and class/year links in the database.
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("UPDATE subjects SET school_id='a' WHERE id='math'");
 await login(schoolAdmin);await assert.rejects(db.query("SELECT registry_record_exam($1,'math','DOPUNSKI_RAD','2027-06-20',4,'')",[enrollment]));
 await db.query("SELECT registry_record_exam($1,'math','RAZLIKOVNI','2027-06-20',4,'Zapisnik ispita')",[enrollment]);
 await assert.rejects(db.query("INSERT INTO student_transport_records(registry_student_id,school_id,school_year_id,class_id,price)VALUES($1,'a',$2,'cb',10)",[registry,year]));
 // Program changes close the old period and keep the same person/profile.
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");const program1=uid(60),program2=uid(61);
 await db.query("INSERT INTO programs(id,school_id,name,type,is_active)VALUES($1,'a','Program A','GENERAL',true),($2,'a','Program B','GENERAL',true)",[program1,program2]);
 await db.query("UPDATE student_class_enrollments SET ematica_status='ACTIVE',enrolled_on='2026-09-01',program_id=$2 WHERE id=$1",[enrollment,program1]);
 await db.query("UPDATE classes SET grade_level=3,is_graduating_class=false,program_id=$1 WHERE id='ca'",[program1]);
 await db.query("UPDATE school_years SET starts_at='2026-09-01',ends_at='2027-08-31' WHERE id=$1",[year]);
 await login(schoolAdmin);await assert.rejects(db.query("SELECT registry_change_program($1,'ca',$2,'2026-10-20','Paralelni program',true)",[enrollment,program2]));
 r=await db.query("SELECT registry_change_program($1,'ca',$2,'2026-10-20','Promjena programa po rješenju',false) AS id",[enrollment,program2]);const changed=r.rows[0].id;
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");r=await db.query('SELECT exited_on,status FROM student_class_enrollments WHERE id=$1',[enrollment]);assert.equal(new Date(r.rows[0].exited_on).toISOString().slice(0,10),'2026-10-19');assert.equal(r.rows[0].status,'TRANSFERRED');assert.equal((await db.query('SELECT id FROM registry_students')).rows.length,1);
 const nextYear=uid(62);await db.query("INSERT INTO school_years(id,school_id,name,label,starts_at,ends_at)VALUES($1,'a','2027/2028','2027./2028.','2027-09-01','2028-08-31')",[nextYear]);await db.query("INSERT INTO classes(id,school_id,name,grade_level,school_year_id,school_year,is_active,program_id)VALUES('next','a','4.B',4,$1,'2027/2028',true,$2)",[nextYear,program2]);
 await login(schoolAdmin);await assert.rejects(db.query("SELECT registry_promote_enrollments($1,'next','2027-09-01','Prijelaz u viši razred')",[[changed]]));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("INSERT INTO student_subject_enrollments(student_id,class_id,subject_id,status)VALUES($1,'ca','math','ACTIVE')",[student]);await db.query("UPDATE final_grades SET term='FINAL' WHERE student_id=$1",[student]);
 await login(schoolAdmin);r=await db.query("SELECT registry_promote_enrollments($1,'next','2027-09-01','Prijelaz u viši razred') AS x",[[changed]]);assert.equal(r.rows[0].x.length,1);
 // Bulk enrollment uses the real existing bridge; it must not create a person or Auth account.
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");
 const bulkStudent=uid(70),bulkProfile=uid(71);
 await db.query("INSERT INTO auth.users(id)VALUES($1)",[bulkProfile]);
 await db.query("INSERT INTO user_profiles(id,auth_user_id,role,name)VALUES($1,$1,'STUDENT','Bulk Student')",[bulkProfile]);
 await db.query("INSERT INTO registry_students(id,ednevnik_student_id,first_name,last_name,status,created_by)VALUES($1,$2,'Bulk','Student','ACTIVE',$3)",[bulkStudent,bulkProfile,schoolAdmin]);
 await login(schoolAdmin);r=await db.query("SELECT registry_bulk_enroll($1,'next') AS x",[[bulkStudent]]);assert.equal(r.rows[0].x.length,1);
 await assert.rejects(db.query("SELECT registry_bulk_enroll($1,'next')",[[bulkStudent]]));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query('SELECT count(*) AS n FROM student_class_enrollments WHERE registry_student_id=$1',[bulkStudent])).rows[0].n,1);assert.equal((await db.query('SELECT count(*) AS n FROM ednevnik_sync_logs WHERE student_id=$1',[bulkStudent])).rows[0].n,1);
 // Enrollment-level final grades are included without creating missing marks.
 await db.query("INSERT INTO subjects(id,name,school_id)VALUES('croatian','Hrvatski jezik','a')");
 await db.query("INSERT INTO enrollment_final_grades(student_id,class_id,school_year_id,subject_id,grade_value,date)VALUES($1,'next',$2,'croatian','4','2028-06-15')",[student,nextYear]);
 await login(office);r=await db.query("SELECT registrar_prepare_document($1,'next',$2,'transcript',$3) AS x",[nextYear,registry,JSON.stringify({purpose:'Stipendija',grade_kind:'FINAL',years:[nextYear],attest:false})]);assert.equal(r.rows[0].x.snapshot.grades[0].value,'4');
 // Certificate snapshots keep real citizenship/program; preparing twice is idempotent,
 // and an authenticated operator cannot manufacture a qualified sealing result.
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");const certId=uid(81);
 await db.query("UPDATE registry_students SET birth_country='Slovenija',citizenship='slovensko',gender='F' WHERE id=$1",[registry]);
 await db.query("INSERT INTO student_certificates(id,registry_student_id,school_id,school_year_id,class_id,certificate_number,status,payload)VALUES($1,$2,'a',$3,'next','TEST-ONLY-81','READY','{}')",[certId,registry,nextYear]);
 r=await db.query('SELECT payload FROM student_certificates WHERE id=$1',[certId]);assert.equal(r.rows[0].payload.program_name,'Program B');assert.equal(r.rows[0].payload.citizenship,'slovensko');
 await login(schoolAdmin);const seal1=await db.query('SELECT registry_prepare_seals($1) AS x',[[certId]]);const seal2=await db.query('SELECT registry_prepare_seals($1) AS x',[[certId]]);assert.equal(seal1.rows[0].x[0].request,seal2.rows[0].x[0].request);assert.equal(seal1.rows[0].x[0].status,'READY_FOR_PROVIDER');
 await assert.rejects(db.query("UPDATE certificate_seal_requests SET status='SEALED' WHERE certificate_id=$1",[certId]));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("UPDATE programs SET code='770004' WHERE id=$1",[program2]);await assert.rejects(db.query("UPDATE student_certificates SET status='ISSUED' WHERE id=$1",[certId]));await db.query("UPDATE programs SET code=NULL WHERE id=$1",[program2]);
 // Switching an authorized active school changes row visibility without granting new schools.
 await login(admin);await db.query("INSERT INTO user_school_roles(user_id,school_id,role,status)VALUES($1,'b','TEACHER','ACTIVE')",[schoolAdmin]);await db.query("SELECT registry_manage_permissions('b',$1,true,false)",[schoolAdmin]);
 await login(schoolAdmin);r=await db.query('SELECT registry_available_schools() AS x');assert.equal(r.rows[0].x.length,2);assert.deepEqual((await db.query('SELECT id FROM schools')).rows.map(x=>x.id),['b']);
 await db.query("SELECT registry_switch_school('a')");assert.deepEqual((await db.query('SELECT id FROM schools')).rows.map(x=>x.id),['a']);
 await assert.rejects(db.query("SELECT registry_switch_school('foreign-unassigned')"));
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query("UPDATE registrar_verified_sessions SET expires_at=now()-interval '1 second'");await login(office);await assert.rejects(db.query('SELECT registrar_document_archive()'));
 }finally{await db.close()}
});
