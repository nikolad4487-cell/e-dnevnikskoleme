import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {creationCredentials,canManageSchool,userManagementScope} from '../server/auth/userProvisioning';
import {staffSession} from '../server/auth/staffSession';

test('Entered Auth password is preserved for every role and is never replaced with a PIN',()=>{
 for(const role of ['TEACHER','REGISTRAR','SCHOOL_ADMIN','MAIN_ADMIN','SUPER_ADMIN','STUDENT','PARENT']){
  const result=creationCredentials('Example8',[role],()=>{throw new Error('Must not replace supplied password');});
  assert.equal(result.password,'Example8');
 }
 assert.throws(()=>creationCredentials('1234',['REGISTRAR'],()=>''),/najmanje 6/);
 assert.throws(()=>creationCredentials(12345678,['TEACHER'],()=>''),/najmanje 6/);
 assert.equal(creationCredentials(undefined,['REGISTRAR'],()=> 'RandomPassword123').password,'RandomPassword123');
});

test('School admin stays in own school; global administrator can select the target school',()=>{
 const schoolAdmin={profile:{role:'SCHOOL_ADMIN',school_id:'a'},roles:[]};
 assert.equal(canManageSchool(schoolAdmin,'a').allowed,true);
 assert.equal(canManageSchool(schoolAdmin,'b').allowed,false);
 assert.equal(canManageSchool({profile:{role:'TEACHER'},roles:[{school_id:'b',role:'ADMIN',status:'INACTIVE'}]},'b').allowed,false);
 assert.equal(canManageSchool({profile:{role:'MAIN_ADMIN'},roles:[]},'b').allowed,true);
 assert.equal(canManageSchool({profile:{role:'MAIN_ADMIN'},roles:[]},'').allowed,false);
});

test('User creation/update scope rejects cross-school class, privileged role and mismatched Auth ID before mutation',async()=>{
 let dbCalls=0;const db={from:(table:string)=>{dbCalls++;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='schools'?{id:'a'}:table==='classes'?{school_id:'b'}:{id:'own-profile',auth_user_id:'own-auth',school_id:'a',role:'TEACHER'}}),then:(resolve:any)=>resolve({data:[{school_id:'a',status:'ACTIVE'}]})};return q;}};
 const app=express();app.use(express.json());
 app.post('/create',userManagementScope(async()=>({profile:{role:'SCHOOL_ADMIN',school_id:'a'},roles:[]}),db),(_req,res)=>res.json({success:true}));
 app.post('/global',userManagementScope(async()=>({profile:{role:'MAIN_ADMIN'},roles:[]}),db),(_req,res)=>res.json({success:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const addr=server.address() as any;const call=(route:string,body:any)=>fetch(`http://127.0.0.1:${addr.port}/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await call('create',{schoolId:'b',roles:['TEACHER']})).status,403);assert.equal(dbCalls,0);
  assert.equal((await call('create',{schoolId:'a',roles:['SUPER_ADMIN']})).status,403);assert.equal(dbCalls,0);
  assert.equal((await call('create',{schoolId:'a',roles:'SUPER_ADMIN'})).status,403);assert.equal(dbCalls,0);
  assert.equal((await call('create',{schoolId:'a',roles:['TEACHER'],classId:'foreign'})).status,400);
  assert.equal((await call('create',{schoolId:'a',roles:['TEACHER'],profileId:'own-profile',authUserId:'foreign-auth'})).status,400);
  assert.equal((await call('create',{schoolId:'a',roles:['TEACHER']})).status,200);
  assert.equal((await call('global',{schoolId:'b',roles:['REGISTRAR']})).status,200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});

test('Staff session verifies account role and PIN before minting a token, independent of Auth password',async()=>{
 let generated=0,verified=0;let role='REGISTRAR';
 const db:any={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'profile',auth_user_id:'auth',role,pin_hash:'pin-hash'}}),then:(resolve:any)=>resolve({data:[{role,status:'ACTIVE'}]})};return q;},auth:{admin:{generateLink:async()=>{generated++;return {data:{properties:{hashed_token:'private-token'}}};}}}};
 const args={database:db,email:'example@example.test',pin:'1234',verifyPin:async(pin:string,hash:string)=>pin==='1234'&&hash==='pin-hash',verifyToken:async(hash:string)=>{assert.equal(hash,'private-token');verified++;return {data:{user:{id:'auth'},session:{access_token:'example-session'}},error:null};}};
 assert((await staffSession({...args,pin:'wrong'})).error);assert.equal(generated,0);
 role='PARENT';assert((await staffSession(args)).error);assert.equal(generated,0);
 role='REGISTRAR';const result=await staffSession(args);assert.equal(result.data.session.access_token,'example-session');assert.equal(generated,1);assert.equal(verified,1);
 args.verifyToken=async()=>({data:{user:{id:'other-auth'},session:{access_token:'foreign-session'}},error:null});assert((await staffSession(args)).error);
});
