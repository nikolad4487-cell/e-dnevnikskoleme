import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { isExpertForSchool, isHomeroomPeriod } from '../src/lib/expertAccess';
import { apiAccessGuard } from '../server/auth/apiAccess';
import { userManagementScope, creationCredentials } from '../server/auth/userProvisioning';
test('Expert access follows active school membership and actual homeroom subject names',()=>{
 const roles=[{role:'EXPERT',schoolId:'a',status:'ACTIVE'},{role:'EXPERT',schoolId:'b',status:'REVOKED'}];
 assert(isExpertForSchool({},roles,'a'));assert(!isExpertForSchool({},roles,'b'));assert(!isExpertForSchool({name:'Pedagog'},[],'a'));
 assert(isHomeroomPeriod('Sat razrednika'));assert(isHomeroomPeriod(' Sat razredne zajednice '));assert(!isHomeroomPeriod('Matematika'));assert(!isHomeroomPeriod('Sat razrednika i matematika'));
 assert(creationCredentials('Example8',['EXPERT'],()=> '').isStaff);
});
test('Expert cannot use legacy service mutations or cross-school reads, and readiness gates provisioning',async()=>{
 let ready=false, next=0;
 const database={rpc:async()=>({data:ready,error:null}),from:(table:string)=>{let id='';const q:any={select:()=>q,eq:(k:string,v:string)=>{if(k==='id')id=v;return q;},maybeSingle:async()=>({data:table==='schools'?{id:'a'}:{id,school_id:id==='foreign'?'b':'a'},error:null}),limit:async()=>({data:[{id:'enrollment'}],error:null})};return q;}};
 const auth={userId:'own',profile:{role:'EXPERT'},roles:[{role:'EXPERT',school_id:'a',status:'ACTIVE'}]};
 const app=express();app.use(express.json());app.post('/provision',userManagementScope(async()=>({profile:{role:'SCHOOL_ADMIN',school_id:'a'},roles:[]}),database),(_req,res)=>{next++;res.json({ok:true});});
 app.use(apiAccessGuard(async()=>auth,database));app.all('/api/*',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const post=(path:string,body:any)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/admin/create-user',{schoolId:'a'})).status,403);
  assert.equal((await post('/api/student-pedagogical-profile',{studentId:'foreign'})).status,403);
  assert.equal((await fetch(url+'/api/student-notes?classId=foreign&studentId=pupil')).status,403);
  assert.equal((await fetch(url+'/api/student-notes?classId=own&studentId=pupil')).status,200);
  assert.equal((await post('/api/auth/change-pin',{userId:'other'})).status,403);
  assert.equal((await post('/api/auth/change-pin',{userId:'own'})).status,200);
  assert.equal((await post('/provision',{schoolId:'a',roles:['EXPERT']})).status,409);assert.equal(next,0);
  ready=true;assert.equal((await post('/provision',{schoolId:'a',roles:['EXPERT']})).status,200);assert.equal(next,1);
  assert.equal((await post('/provision',{schoolId:'a',roles:['EXPERT','TEACHER']})).status,400);assert.equal(next,1);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
