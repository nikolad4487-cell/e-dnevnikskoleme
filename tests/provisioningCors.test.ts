import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {provisioningCors} from '../server/auth/provisioningCors';
import {canManageSchool} from '../server/auth/userProvisioning';
test('e-Matica has an authenticated CORS route without enabling unrelated origins or endpoints',async()=>{
 const app=express();app.use(provisioningCors);app.use((_req,res)=>res.status(401).json({error:'Prijava je obavezna.'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const addr=server.address() as any;
 const call=(origin:string,path='/api/admin/create-user',method='OPTIONS')=>fetch(`http://127.0.0.1:${addr.port}${path}`,{method,headers:{Origin:origin,'Access-Control-Request-Headers':'authorization,content-type','Access-Control-Request-Method':'POST'}});
 try{
  const preflight=await call('https://e-matica.skolehr.xyz');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://e-matica.skolehr.xyz');
  const unauthorized=await call('https://e-matica.skolehr.xyz','/api/admin/create-user','POST');assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('Access-Control-Allow-Origin'),'https://e-matica.skolehr.xyz');
  assert.equal((await call('https://other.example')).headers.get('Access-Control-Allow-Origin'),null);
  assert.equal((await call('https://e-matica.skolehr.xyz','/api/admin/update-user')).headers.get('Access-Control-Allow-Origin'),null);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('e-Matica lowercase administrative access roles retain their school scope',()=>{
 assert.equal(canManageSchool({profile:{role:'TEACHER',access_role:'super_admin'},roles:[]},'school-b').allowed,true);
 assert.equal(canManageSchool({profile:{role:'TEACHER',access_role:'school_admin',school_id:'school-a'},roles:[]},'school-a').allowed,true);
 assert.equal(canManageSchool({profile:{role:'TEACHER',access_role:'school_admin',school_id:'school-a'},roles:[]},'school-b').allowed,false);
});
