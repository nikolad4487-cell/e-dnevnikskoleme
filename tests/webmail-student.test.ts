import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {apiAccessGuard} from '../server/auth/apiAccess';
import {webmailStudentLogin,WEBMAIL_STUDENT_LOGIN_PATH} from '../server/auth/webmailStudent';

const authId='10000000-0000-4000-8000-000000000001';
const fixtureToken='synthetic-webmail-token-only';
async function fixture(work:(f:any)=>Promise<void>){
 const state:any={token:fixtureToken,role:'STUDENT',accessRole:null,roles:[{role:'STUDENT',status:'ACTIVE'}],profileAuthId:authId,password:'  actual-password  ',calls:[],guardCalls:0};
 const database={from:(table:string)=>{
  let field='',value:any,columns='';
  const query:any={select:(s:string)=>{columns=s;return query;},ilike:(f:string,v:any)=>{field=f;value=v;state.calls.push(['lookup',v]);return query;},eq:(f:string,v:any)=>{field=f;value=v;return query;},
   maybeSingle:async()=>{
    if(state.dbError)return {data:null,error:{message:'private database failure'}};
    if(columns==='email')return {data:{email:'pupil@skolehr.xyz'},error:null};
    if(state.missingProfile||field==='auth_user_id'&&state.legacy)return {data:null,error:null};
    return {data:{id:state.legacy?authId:'different-profile-id',auth_user_id:state.legacy?state.profileAuthId:authId,role:state.role,access_role:state.accessRole},error:null};
   },then:(resolve:any)=>resolve({data:state.roles,error:state.roleError?{message:'private role error'}:null})};
  return query;
 }};
 const app=express();app.use(express.json());app.use(apiAccessGuard(async()=>{state.guardCalls++;return {error:'no user session',status:401};}));
 app.post(WEBMAIL_STUDENT_LOGIN_PATH,webmailStudentLogin({database,getToken:()=>state.token,signIn:async(email,password)=>{
  state.calls.push(['signIn',email,password]);
  if(state.authError)return {data:null,error:{status:503,message:'private Auth failure'}};
  return password===state.password?{data:{user:{id:authId},session:{access_token:'never-return-this',refresh_token:'never-return-this'}},error:null}:{data:null,error:{status:400,message:'Invalid login credentials'}};
 }}));
 app.all('/api/*',(_req,res)=>res.json({unprotected:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const call=async({path=WEBMAIL_STUDENT_LOGIN_PATH,method='POST',token=fixtureToken,body={username:'Pupil',password:state.password}}:any={})=>{
  const response=await fetch(url+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='GET'||method==='HEAD'?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json(),cache:response.headers.get('Cache-Control')};
 };
 try{await work({state,call});}finally{await new Promise<void>(r=>server.close(()=>r()));}
}

test('Only the exact Webmail POST bypasses the session guard and still requires its own Bearer token',()=>fixture(async({state,call})=>{
 for(const token of [null,'wrong',fixtureToken+'-suffix']){
  const r=await call({token});assert.equal(r.status,401);assert.equal(r.body.error,'Nevaljan WebmailHR serverski token.');
 }
 assert.equal(state.guardCalls,0);assert.equal(state.calls.length,0,'invalid tokens do not query profiles or Auth');
 for(const method of ['GET','PUT','PATCH','DELETE'])assert.equal((await call({method})).status,401);
 for(const path of [WEBMAIL_STUDENT_LOGIN_PATH+'/extra',WEBMAIL_STUDENT_LOGIN_PATH+'/', '/api/auth/webmail/staff'])assert.equal((await call({path})).status,401);
 assert.equal(state.guardCalls,7);
}));

test('Valid student uses the existing password verifier and returns only the Supabase Auth ID',()=>fixture(async({state,call})=>{
 const r=await call();assert.equal(r.status,200);assert.deepEqual(r.body,{user_id:authId});assert.equal(r.cache,'no-store');
 assert.deepEqual(state.calls,[['lookup','pupil@%'],['signIn','pupil@skolehr.xyz',state.password]]);
 assert.notEqual(r.body.user_id,'different-profile-id');assert.equal(state.guardCalls,0);
 assert.equal((await call({body:{username:'pupil',password:'incorrect'}})).status,401);
 state.accessRole='user';assert.equal((await call()).status,200,'legacy neutral access_role is not a staff role');
}));

test('Staff, parent, mixed identities and revoked student memberships cannot use pupil login',()=>fixture(async({state,call})=>{
 for(const role of ['TEACHER','MAIN_ADMIN','REGISTRAR','PARENT']){
  state.role=role;state.roles=[{role,status:'ACTIVE'}];assert.equal((await call()).status,403);
 }
 state.role='STUDENT';state.roles=[{role:'STUDENT',status:'ACTIVE'},{role:'TEACHER',status:'ACTIVE'}];assert.equal((await call()).status,403);
 state.roles=[{role:'STUDENT',status:'REVOKED'}];assert.equal((await call()).status,403);
 state.roles=[{role:'STUDENT',status:'ACTIVE'}];state.accessRole='SCHOOL_ADMIN';assert.equal((await call()).status,403);
}));

test('Missing configuration, bad input, identity mismatch and provider errors fail closed without leaking secrets',()=>fixture(async({state,call})=>{
 state.token=undefined;assert.equal((await call()).status,503);assert.equal(state.calls.length,0);state.token=fixtureToken;
 for(const body of [{},{username:{},password:'x'},{username:'pupil',password:''}])assert.equal((await call({body})).status,400);
 state.authError=true;let r=await call();assert.equal(r.status,503);assert(!JSON.stringify(r.body).includes('private'));state.authError=false;
 state.roleError=true;assert.equal((await call()).status,503);state.roleError=false;
 state.missingProfile=true;assert.equal((await call()).status,403);state.missingProfile=false;
 state.legacy=true;state.profileAuthId='foreign-auth-id';assert.equal((await call()).status,403);
 state.profileAuthId=null;assert.deepEqual((await call()).body,{user_id:authId});
}));

test('Production wiring installs the token-checking handler after the guard and skips session inactivity only for this POST',()=>{
 const source=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
 assert(source.includes('if(isWebmailStudentLoginRequest(req))return next();'));
 const guard=source.indexOf('app.use(apiAccessGuard('),route=source.indexOf('app.post(WEBMAIL_STUDENT_LOGIN_PATH,webmailStudentLogin(');
 assert(guard>=0&&route>guard);assert(source.includes('getToken:()=>process.env.WEBMAILHR_STUDENT_LOGIN_TOKEN'));
});
