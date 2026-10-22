import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {resolvePortal} from '../src/lib/portal';import {apiAccessGuard} from '../server/auth/apiAccess';
test('Known hostnames select a portal before Vercel preview configuration',()=>{
 assert.equal(resolvePortal('referada.skolehr.xyz','staff'),'registrar');assert.equal(resolvePortal('ednevnik.skolehr.xyz','registrar'),'staff');assert.equal(resolvePortal('ocjene.skolehr.xyz','staff'),'student');assert.equal(resolvePortal('preview.vercel.app','registrar'),'registrar');assert.equal(resolvePortal('unrelated.test'),'staff');
});
test('Legacy API requires a session and a registrar cannot reach school administration',async()=>{
 const app=express();app.use(express.json());app.use(apiAccessGuard(async req=>!req.headers.authorization?{error:'missing',status:401}:{userId:'own',profile:{role:req.headers.authorization==='Bearer registrar'?'REGISTRAR':'TEACHER'},roles:[]}));app.all('/api/*',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+((server.address() as any).port);
 try{
  assert.equal((await fetch(origin+'/api/admin/delete-user')).status,401);
  assert.equal((await fetch(origin+'/api/admin/delete-user',{headers:{Authorization:'Bearer registrar'}})).status,403);
  assert.equal((await fetch(origin+'/api/auth/change-pin',{method:'POST',headers:{Authorization:'Bearer registrar','Content-Type':'application/json'},body:JSON.stringify({userId:'other'})})).status,403);
  assert.equal((await fetch(origin+'/api/auth/change-pin',{method:'POST',headers:{Authorization:'Bearer registrar','Content-Type':'application/json'},body:JSON.stringify({userId:'own'})})).status,200);
  assert.equal((await fetch(origin+'/api/auth/login',{method:'POST'})).status,200);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('All roles enforce administration and own credential boundaries',async()=>{
 let current:any={userId:'own',profile:{role:'STUDENT',school_id:'a'},roles:[]};
 const db={from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{school_id:'b'},error:null})};return q;}};
 const app=express();app.use(express.json());app.use(apiAccessGuard(async()=>current,db));app.all('/api/*',(_q,r)=>r.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const call=(path:string,body={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  for(const role of ['STUDENT','PARENT','TEACHER','HOMEROOM','EXPERT','PRINCIPAL','REGISTRAR']){
   current={userId:'own',profile:{role,school_id:'a'},roles:[{role,school_id:'a',status:'ACTIVE'}]};
   assert.equal((await call('/api/admin/delete-user',{schoolId:'a'})).status,403,role);
   assert.equal((await call('/api/seed')).status,403,role);
   assert.equal((await call('/api/auth/reset-authenticator',{profileId:'foreign'})).status,403,role);
  }
  current={userId:'own',profile:{role:'SCHOOL_ADMIN',school_id:'a'},roles:[{role:'SCHOOL_ADMIN',school_id:'a',status:'ACTIVE'}]};
  assert.equal((await call('/api/admin/delete-user',{schoolId:'a'})).status,200);
  assert.equal((await call('/api/admin/delete-user',{schoolId:'b'})).status,403);
  assert.equal((await call('/api/programs/foreign',{schoolId:'a'})).status,403);
  assert.equal((await call('/api/school-years/foreign/activate',{schoolId:'a'})).status,403);
  assert.equal((await call('/api/admin/run-initial-setup',{schoolId:'a'})).status,403);
  current.roles[0].status='REVOKED';assert.equal((await call('/api/admin/delete-user',{schoolId:'a'})).status,403);
  current={userId:'own',profile:{role:'MAIN_ADMIN'},roles:[]};assert.equal((await call('/api/seed')).status,200);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('Reader accounts cannot mutate school metadata, finances, unrelated pupils or thesis records',async()=>{
 let role='STUDENT';const database={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{student_id:'foreign'},error:null})};return q;}};
 const app=express();app.use(express.json());app.use(apiAccessGuard(async()=>({userId:'own',profile:{role,school_id:'a'},roles:[{role,school_id:'a',status:'ACTIVE'}]}),database));app.all('/api/*',(req,res)=>res.json({ok:true,query:req.query}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const post=(path:string,body={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  for(role of ['STUDENT','PARENT']){assert.equal((await post('/api/programs',{schoolId:'a'})).status,403);assert.equal((await post('/api/payments',{studentId:'own'})).status,403);assert.equal((await fetch(url+'/api/final-thesis?studentId=foreign')).status,403);}
  role='STUDENT';assert.equal((await fetch(url+'/api/final-thesis/foreign',{method:'DELETE'})).status,403);
  const read=await fetch(url+'/api/final-thesis');assert.equal(read.status,200);assert.equal((await read.json()).query.studentId,'own');
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
