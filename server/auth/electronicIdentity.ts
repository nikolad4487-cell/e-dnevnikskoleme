import {randomInt,randomUUID} from 'node:crypto';
import {printableSchoolAddress} from '../registrar/schoolAddress.js';
export class IdentityError extends Error{constructor(message:string,public status=409,public changed=false){super(message);}}
export function identityPassword(){
 const upper='ABCDEFGHIJKLMNOPQRSTUVWXYZ',lower='abcdefghijklmnopqrstuvwxyz',digits='0123456789',all=upper+lower+digits;
 const chars=[upper[randomInt(upper.length)],lower[randomInt(lower.length)],digits[randomInt(10)]];
 while(chars.length<8)chars.push(all[randomInt(all.length)]);
 for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
 return chars.join('');
}
export function expiryForYear(year:any){
 const label=String(year.label||year.name||year.school_year||'');
 const match=label.match(/([12]\d{3})\.?\s*[/-]\s*([12]\d{3})/);
 if(!match||Number(match[2])!==Number(match[1])+1)throw new IdentityError('Školska godina nema jednoznačan zapis početne i završne godine.');
 return match[2]+'-10-31';
}
const hrDate=(date:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new IdentityError('Nedostaje ispravan datum.');return date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4)+'.';};
const role=(v:any)=>String(v||'').toUpperCase();
export function canonicalIdentity(profile:any,school:any,personal:any,relationship:string,validUntil:string){
 const email=String(profile.email||'').toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]*@skolehr\.xyz$/.test(email))throw new IdentityError('Račun mora imati stvarno dodijeljenu korisničku oznaku @skolehr.xyz.');
 let addressMeta:any={};try{addressMeta=typeof school.address==='string'&&school.address.startsWith('{')?JSON.parse(school.address):typeof school.address==='object'?school.address:{};}catch{}
 let street='';try{street=printableSchoolAddress(school.address);}catch{}
 const postal=String(school.postal_code||school.zip||addressMeta.postal_code||addressMeta.postalCode||'').replace(/^HR-/,''),city=String(school.city||addressMeta.city||'').replace(/^HR-/,''),gender=role(personal?.gender||profile.gender);
 const g=['M','MALE','MUŠKI','MUSKI'].includes(gender)?'M':['Ž','Z','F','FEMALE','ŽENSKI','ZENSKI'].includes(gender)?'Ž':'';
 const dob=personal?.date_of_birth||personal?.dob||profile.dob;
 const name=personal?.first_name&&personal?.last_name?`${personal.first_name} ${personal.last_name}`:profile.name;
 const oib=personal?.oib||profile.oib;
 if(!name||!/^\d{11}$/.test(oib||'')||!dob||!g||!school.name||!/^\d{5}$/.test(postal)||!city)throw new IdentityError('Prije izdavanja dopunite ime, OIB, datum rođenja i spol korisnika te naziv, mjesto i poštanski broj škole.');
 return {name,oib,username:email.split('@')[0],email,birthDate:hrDate(dob),gender:g,relationship,validUntil:hrDate(validUntil),school:{name:school.name,id:school.id,address:!street?'':street.includes(postal)?street:`${street}, ${postal} ${city}`,locality:'HR-'+city,postalCode:'HR-'+postal}};
}
export async function identityContext(database:any,profileId:string,schoolId:string,schoolYearId?:string){
 const get=async(table:string,key:string,value:any)=>{const r=await database.from(table).select('*').eq(key,value).maybeSingle();if(r.error)throw new IdentityError('Dohvat podataka identiteta nije uspio.',503);return r.data;};
 const profile=await get('user_profiles','id',profileId),school=await get('schools','id',schoolId);
 if(!profile?.auth_user_id||!school)throw new IdentityError('Račun ili matična škola nisu povezani.');
 if(profile.school_id!==schoolId)throw new IdentityError('Odaberite matičnu ustanovu korisničkog računa.');
 const roles=await database.from('user_school_roles').select('role,status,school_id').eq('user_id',profileId);
 if(roles.error)throw new IdentityError('Provjera uloge nije dostupna.',503);
 const own=(roles.data||[]).filter((r:any)=>r.status==='ACTIVE'&&r.school_id===schoolId).map((r:any)=>role(r.role));
 const relationship=own.includes('STUDENT')?'STUDENT':own.some((r:string)=>['TEACHER','HOMEROOM','HOMEROOM_TEACHER','DEPUTY'].includes(r))?'TEACHER':null;
 if(!relationship)throw new IdentityError('Dokument se izdaje samo učeniku ili nastavniku povezanim s odabranom školom.',403);
 const stored=await database.from('electronic_identity_memberships').select('*').eq('profile_id',profileId).eq('school_id',schoolId).eq('relationship',relationship).maybeSingle();
 if(stored.error)throw new IdentityError('Najprije aktivirajte SQL nadogradnju elektroničkog identiteta.',503);
 let personal:any=null,yearId=schoolYearId||stored.data?.school_year_id||profile.school_year_id;
 if(relationship==='STUDENT'){
  const enroll=await database.from('student_class_enrollments').select('*').eq('student_id',profileId).eq('status','ACTIVE');
  if(enroll.error)throw new IdentityError('Upis učenika nije dostupan.',503);
  const matches=[];for(const e of enroll.data||[]){const c=await get('classes','id',e.class_id);if(c?.school_id===schoolId)matches.push({...e,school_year_id:e.school_year_id||c.school_year_id});}
  if(!yearId){const ids=[...new Set(matches.map(e=>e.school_year_id))];if(ids.length!==1)throw new IdentityError('Odaberite jednoznačno dodijeljenu školsku godinu učenika.');yearId=ids[0];}
  const enrollment=matches.find(e=>e.school_year_id===yearId);
  if(!enrollment)throw new IdentityError('Nema aktivnog upisa učenika u odabranoj školskoj godini.');
  if(enrollment.registry_student_id)personal=await get('registry_students','id',enrollment.registry_student_id);
 }
 if(!yearId)throw new IdentityError('Odaberite dodijeljenu školsku godinu.');
 const year=await get('school_years','id',yearId);if(!year||year.school_id!==schoolId)throw new IdentityError('Školska godina ne pripada matičnoj školi.');
 const validUntil=stored.data?.valid_until||expiryForYear(year);
 return {profile,school,relationship,yearId,validUntil,identity:canonicalIdentity(profile,school,personal,relationship,validUntil)};
}
export function identityBridge(fetcher:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env){
 const configured=()=>{
  let url:URL;try{url=new URL(env.WEBMAILHR_IDENTITY_ISSUANCE_URL||'');}catch{throw new IdentityError('Postavite WEBMAILHR_IDENTITY_ISSUANCE_URL i WEBMAILHR_IDENTITY_ISSUANCE_TOKEN te objavite WebmailHR integraciju.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!env.WEBMAILHR_IDENTITY_ISSUANCE_TOKEN)throw new IdentityError('WebmailHR povezivanje izdavanja identiteta nije konfigurirano.');
  return url;
 };
 return {configured,async call(operation:string,ctx:any,password?:string){
  const url=configured();let r:Response;
  try{r=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.WEBMAILHR_IDENTITY_ISSUANCE_TOKEN},body:JSON.stringify({operation,user_id:ctx.profile.auth_user_id,school_id:ctx.school.id,email:ctx.identity.email,relationship:ctx.relationship,...(password?{password}:{})})});}catch{throw new IdentityError('WebmailHR nije dostupan; aktivacija lozinke nije potvrđena.',503);}
  if(!r.ok)throw new IdentityError(r.status===404?'Objavite WebmailHR API za izdavanje identiteta.':r.status===409?'WebmailHR nema spreman osobni sandučić povezan s ovim Auth ID-om i školom. Pokrenite postojeću sinkronizaciju imenika i dovršite dodjelu.':'WebmailHR nije potvrdio aktivaciju. Provjerite serverski token, bazu i poštansku konfiguraciju.',r.status>=500?503:409);
  const x=await r.json();if(!x.ready||x.user_id!==ctx.profile.auth_user_id||x.email!==ctx.identity.email||x.school_id!==ctx.school.id)throw new IdentityError('WebmailHR je vratio drugi identitet; izdavanje je zaustavljeno.');
 }};
}
export async function issueElectronicIdentity(database:any,ctx:any,actorId:string,bridge=identityBridge(),initialPassword?:string){
 await bridge.call('prepare',ctx);
 const issuance=randomUUID(),reserve=await database.rpc('identity_reserve_issue',{_profile:ctx.profile.id,_school:ctx.school.id,_relationship:ctx.relationship,_year:ctx.yearId,_until:ctx.validUntil,_issuance:issuance});
 if(reserve.error)throw new IdentityError('Drugo izdavanje je u tijeku ili nadogradnja baze nije aktivna. Osvježite prikaz.');
 const password=initialPassword||identityPassword();let changed=!!initialPassword;
 try{
  // A teacher's e-Dnevnik PIN, Auth password and authenticator are untouched
  // when issuing a new Webmail password. Pupils share the source Auth password.
  if(ctx.relationship==='STUDENT'&&!initialPassword){
   const r=await database.auth.admin.updateUserById(ctx.profile.auth_user_id,{password});if(r.error)throw new IdentityError('Lozinka e-Dnevnika nije promijenjena.',503);changed=true;
   const flags=await database.from('user_profiles').update({requires_password_change:false,password_type:'standard'}).eq('id',ctx.profile.id);if(flags.error)throw new IdentityError('Oznake prijave nisu spremljene.',503,true);
  }
  changed=true; // A timed-out activation may have committed at the peer.
  await bridge.call('activate',ctx,password);
  const finished=await database.rpc('identity_finish_issue',{_profile:ctx.profile.id,_school:ctx.school.id,_relationship:ctx.relationship,_issuance:issuance,_actor:actorId,_ready:true});
  if(finished.error)throw new IdentityError('Lozinka je aktivirana, ali završetak izdavanja nije potvrđen. Ponovno izdajte lozinku.',503,true);
  return {success:true,ready:true,password,identity:ctx.identity,expiresAt:Date.now()+5*60*1000};
 }catch(error){
  await database.rpc('identity_finish_issue',{_profile:ctx.profile.id,_school:ctx.school.id,_relationship:ctx.relationship,_issuance:issuance,_actor:actorId,_ready:false});
  if(changed)throw new IdentityError('Lozinka je možda promijenjena, ali izdavanje nije dovršeno. PDF nije izdan. Provjerite WebmailHR i ponovite izdavanje.',409,true);
  throw error;
 }
}
