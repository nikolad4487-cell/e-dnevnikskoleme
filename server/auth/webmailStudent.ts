import {createHash,timingSafeEqual} from 'node:crypto';
import type {Request,RequestHandler} from 'express';
import {resolveLoginEmail} from './loginEmail.js';

export const WEBMAIL_STUDENT_LOGIN_PATH='/api/auth/webmail/student';
export const isWebmailStudentLoginRequest=(req:Pick<Request,'method'|'path'>)=>req.method==='POST'&&req.path===WEBMAIL_STUDENT_LOGIN_PATH;
type Dependencies={database:any;signIn:(email:string,password:string)=>Promise<any>;getToken:()=>string|undefined};
const invalid={error:'Neispravni podaci za prijavu.'};
const unavailable={error:'WebmailHR učenička prijava trenutačno nije dostupna.'};
const roleName=(value:unknown)=>String(value||'').trim().toUpperCase();

export function webmailStudentLogin({database,signIn,getToken}:Dependencies):RequestHandler{
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const expected=getToken()?.trim();
  if(!expected)return res.status(503).json(unavailable);
  const authorization=req.get('authorization')||'';
  const supplied=/^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  // Compare fixed-length digests, never a user session token or a public key.
  if(!supplied||supplied.length>4096||!timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update(expected).digest())){
   return res.status(401).json({error:'Nevaljan WebmailHR serverski token.'});
  }
  const {username,password}=req.body||{};
  if(typeof username!=='string'||!username.trim()||username.length>254||typeof password!=='string'||!password||password.length>4096){
   return res.status(400).json({error:'Unesite korisničko ime i lozinku.'});
  }
  try{
   if(!database)return res.status(503).json(unavailable);
   const email=await resolveLoginEmail(database,username);
   // Reuse the normal Auth password verifier. No PINs, resets, provisioning,
   // credential changes, or service-role-generated sessions are involved.
   const result=await signIn(email,password);
   if(result.error){
    if(result.error.status===429)return res.status(429).json({error:'Previše pokušaja prijave. Pokušajte kasnije.'});
    return res.status(result.error.status>=500?503:401).json(result.error.status>=500?unavailable:invalid);
   }
   const authId=result.data?.user?.id;
   if(typeof authId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(authId))return res.status(503).json(unavailable);
   let profileResult=await database.from('user_profiles').select('id,auth_user_id,role,access_role').eq('auth_user_id',authId).maybeSingle();
   if(profileResult.error)return res.status(503).json(unavailable);
   if(!profileResult.data){
    profileResult=await database.from('user_profiles').select('id,auth_user_id,role,access_role').eq('id',authId).maybeSingle();
    if(profileResult.error)return res.status(503).json(unavailable);
   }
   const profile=profileResult.data;
   if(!profile||profile.auth_user_id&&profile.auth_user_id!==authId)return res.status(403).json(invalid);
   const {data:roles,error:roleError}=await database.from('user_school_roles').select('role,status').eq('user_id',profile.id);
   if(roleError)return res.status(503).json(unavailable);
   const active=(roles||[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>roleName(r.role));
   const primary=[roleName(profile.role),roleName(profile.access_role)].filter(Boolean);
   // Staff/parent/mixed accounts must not use the pupil password adapter to
   // bypass their own sign-in requirements. Revoked student roles do not count.
   const student=active.includes('STUDENT')||primary.includes('STUDENT')&&!(roles||[]).some((r:any)=>roleName(r.role)==='STUDENT');
   if(!student||[...primary,...active].some(role=>role!=='STUDENT'))return res.status(403).json(invalid);
   return res.json({user_id:authId});
  }catch{
   return res.status(503).json(unavailable);
  }
 };
}
