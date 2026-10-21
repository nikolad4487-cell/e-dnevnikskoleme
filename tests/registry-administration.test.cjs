const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
require('node:test').test('Institution and staff changes enforce school scope, history and principal uniqueness',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 await db.exec(read('fixtures/registry-schema.sql'));
 await db.exec(`CREATE FUNCTION portal_profile_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid() $$;
 CREATE FUNCTION registrar_is_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=auth.uid() AND role='REGISTRAR') $$;
 CREATE FUNCTION portal_admin(s text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id=auth.uid() AND role='MAIN_ADMIN') OR EXISTS(SELECT 1 FROM user_school_roles WHERE user_id=auth.uid() AND school_id=s AND role='ADMIN' AND status='ACTIVE') $$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;`);
 await db.exec(read('../migrations/20261020000003_registry_administration.sql'));
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',staff='00000000-0000-4000-8000-000000000003';
 await db.query("INSERT INTO schools(id,name) VALUES('a','A'),('b','B');");
 for(const [id,role] of [[a,'ADMIN'],[b,'ADMIN'],[staff,'TEACHER']])await db.query('INSERT INTO user_profiles(id,role)VALUES($1,$2)',[id,role]);
 for(const [user,school,role] of [[a,'a','ADMIN'],[b,'b','ADMIN'],[staff,'a','TEACHER']])await db.query("INSERT INTO user_school_roles(user_id,school_id,role,status)VALUES($1,$2,$3,'ACTIVE')",[user,school,role]);
 const login=async id=>{await db.exec('RESET ROLE;SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);};
 await login(a);
 await assert.rejects(db.query("SELECT registry_save_section('b','ABOUT','{}')"));
 await assert.rejects(db.query("SELECT registry_save_section('a','FOUNDATION','{}')"));
 await assert.rejects(db.query("SELECT registry_save_section('a','BASIC',$1)",[JSON.stringify({addresses:[{kind:'SJEDIŠTE',address:'A',city:'A',starts_on:'2026-01-01'},{kind:'SJEDIŠTE',address:'B',city:'B',starts_on:'2026-01-01'}]})]));
 await db.query("SELECT registry_save_section('a','ABOUT',$1)",[JSON.stringify({shifts:2})]);
 await assert.rejects(db.query("SELECT registry_save_section('a','ABOUT',$1)",[JSON.stringify({shared_space:true})]));
 let r=await db.query("SELECT registry_save_staff('a',$1,'CONTRACT','2026-01-01',NULL,$2) AS id",[staff,JSON.stringify({status:'Neodređeno puno',weekly_hours:40})]);
 const contract=r.rows[0].id;
 await assert.rejects(db.query("SELECT registry_save_staff('b',$1,'CONTRACT','2026-01-01',NULL,$2)",[staff,JSON.stringify({status:'Neodređeno puno',weekly_hours:40})]));
 await db.query("SELECT registry_save_staff('a',$1,'JOB','2026-02-01',NULL,$2)",[staff,JSON.stringify({position:'RAVNATELJ',contract_id:contract})]);
 await assert.rejects(db.query("SELECT registry_save_staff('a',$1,'JOB','2026-03-01',NULL,$2)",[staff,JSON.stringify({position:'RAVNATELJ',contract_id:contract})]));
 await assert.rejects(db.query("SELECT registry_save_staff('a',$1,'JOB','2025-01-01',NULL,$2)",[staff,JSON.stringify({position:'NASTAVNIK',contract_id:contract})]));
 await login(b);assert.equal((await db.query('SELECT * FROM staff_registry_records')).rows.length,0);assert.equal((await db.query('SELECT * FROM school_registry_sections')).rows.length,0);
 await login(a);assert.equal((await db.query('SELECT * FROM registry_change_log')).rows.length,3);
 }finally{await db.close()}
});
