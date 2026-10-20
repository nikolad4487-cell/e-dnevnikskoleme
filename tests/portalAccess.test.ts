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
