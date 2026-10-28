const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
test('Legacy views enforce caller RLS, including aggregate grades, and deny anonymous reads',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon,authenticated;
   CREATE TABLE final_grades(student_id text,school_year_id text,class_id text,value text);
   INSERT INTO final_grades VALUES('own','year','a','5'),('foreign','year','b','2');
   ALTER TABLE final_grades ENABLE ROW LEVEL SECURITY;
   CREATE POLICY legacy_read ON final_grades FOR SELECT TO authenticated USING(true);
   CREATE POLICY scoped_visibility ON final_grades AS RESTRICTIVE FOR SELECT TO authenticated USING(student_id=current_setting('test.student'));
   GRANT SELECT ON final_grades TO authenticated,anon;
   CREATE FUNCTION school_aux_collections() RETURNS text[] LANGUAGE sql AS $$SELECT ARRAY['payments']::text[]$$;
   CREATE FUNCTION school_thesis_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
   CREATE VIEW enrollment_grade_summary AS SELECT student_id,school_year_id,class_id,count(*) AS total_subjects,round(avg(nullif(value,'')::numeric),2) AS average_grade FROM final_grades WHERE value ~ '^[1-5]$' GROUP BY student_id,school_year_id,class_id;
   GRANT SELECT ON enrollment_grade_summary TO anon,authenticated;
   SELECT set_config('test.student','own',false); SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT * FROM enrollment_grade_summary')).rows.length,2,'original definer view bypasses table RLS');
  await db.exec('RESET ROLE');
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/20261028170521_enforce_view_rls.sql'),'utf8');
  // Use all production names so an accidentally omitted view is detected.
  const names=['active_classes_for_students','active_classes_current_year','v_admission_candidates_detailed','v_admission_offerings','v_admission_choices_detailed','enrollment_student_profiles','v_admission_applications_detailed','v_admissions_secondary_eligible','v_admissions_higher_eligible','v_admission_candidate_grade_summaries','v_textbook_records_detailed'];
  for(const name of names)await db.exec(`CREATE VIEW ${name} AS SELECT * FROM final_grades;GRANT SELECT ON ${name} TO anon,authenticated;`);
  await db.exec(sql);await db.exec(sql);
  await db.exec('SET ROLE authenticated');
  const rows=(await db.query('SELECT * FROM enrollment_grade_summary')).rows;assert.equal(rows.length,1);assert.equal(rows[0].student_id,'own');assert.equal(Number(rows[0].average_grade),5);
  for(const name of names)assert.deepEqual((await db.query(`SELECT student_id FROM ${name}`)).rows,[{student_id:'own'}]);
  await db.exec("SELECT set_config('test.student','foreign',false)");assert.equal((await db.query('SELECT student_id FROM enrollment_grade_summary')).rows[0].student_id,'foreign');
  await db.exec('RESET ROLE;SET ROLE anon');
  for(const name of [...names,'enrollment_grade_summary'])await assert.rejects(db.query(`SELECT * FROM ${name}`),/permission denied/);
  await db.exec('RESET ROLE');assert.equal((await db.query("SELECT has_function_privilege('authenticated','school_thesis_guard()','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
