import test from 'node:test';import assert from 'node:assert/strict';
import {identityPassword,expiryForYear,canonicalIdentity,issueElectronicIdentity,identityBridge} from '../server/auth/electronicIdentity';
const profile={id:'p',auth_user_id:'auth',email:'luka.kovac2@skolehr.xyz',name:'Luka Kovač',oib:'00000000002',dob:'2010-03-06',gender:'M'};
const school={id:'school',name:'Ogledna škola',address:'Primjerna 12',postal_code:'10000',city:'Zagreb'};
test('Generated credentials have exactly 8 characters and all required classes; username suffix and real school data survive',()=>{
 const passwords=new Set();for(let i=0;i<2000;i++){const p=identityPassword();assert.match(p,/^[a-zA-Z0-9]{8}$/);assert.match(p,/[A-Z]/);assert.match(p,/[a-z]/);assert.match(p,/[0-9]/);passwords.add(p);}assert.equal(passwords.size,2000);
 assert.equal(expiryForYear({label:'2026./2027.'}),'2027-10-31');assert.equal(expiryForYear({name:'2027/2028'}),'2028-10-31');assert.throws(()=>expiryForYear({name:'2026/2028'}));
 const x=canonicalIdentity(profile,school,null,'STUDENT','2027-10-31');assert.equal(x.username,'luka.kovac2');assert.equal(x.birthDate,'06.03.2010.');assert.equal(x.school.locality,'HR-Zagreb');assert.equal(x.school.postalCode,'HR-10000');assert.equal(x.validUntil,'31.10.2027.');
 assert.throws(()=>canonicalIdentity({...profile,gender:null},school,null,'STUDENT','2027-10-31'));
});
test('Pupil password is verified on both systems; teacher issuance never changes Auth password, PIN or TOTP',async()=>{
 for(const relationship of ['STUDENT','TEACHER']){
  const writes:any[]=[],audit:any[]=[],remote:any[]=[];
  const db={rpc:async(name:any,args:any)=>{audit.push({name,args});return {error:null};},auth:{admin:{updateUserById:async(id:any,data:any)=>{writes.push({id,data});return {error:null};}}},from:()=>({update:(data:any)=>({eq:async()=>{writes.push(data);return {error:null};}})})};
  const ctx={profile,school,relationship,yearId:'year',validUntil:'2027-10-31',identity:canonicalIdentity(profile,school,null,relationship,'2027-10-31')};
  const result=await issueElectronicIdentity(db,ctx,'admin',{configured:()=>new URL('https://example.test'),call:async(op:any,_ctx:any,password:any)=>{remote.push({op,password});}});
  assert.equal(result.ready,true);assert.equal(remote[0].op,'prepare');assert.equal(remote[1].op,'activate');assert.equal(remote[1].password,result.password);
  assert.equal(writes.length,relationship==='STUDENT'?2:0);assert(!JSON.stringify(audit).includes(result.password));assert(!JSON.stringify(audit).includes('pin_hash'));assert.equal(result.identity.validUntil,'31.10.2027.');
 }
});
test('Missing integration blocks mutation, unconfirmed peer never returns success or plaintext password',async()=>{
 assert.throws(()=>identityBridge(fetch,{}).configured(),/WEBMAILHR/);
 let changed=0;const db:any={rpc:async()=>({error:null}),auth:{admin:{updateUserById:async()=>{changed++;return {error:null};}}},from:()=>({update:()=>({eq:async()=>({error:null})})})};
 const ctx={profile,school,relationship:'STUDENT',yearId:'y',validUntil:'2027-10-31',identity:{email:profile.email}};
 await assert.rejects(issueElectronicIdentity(db,ctx,'admin',{configured:()=>new URL('https://example.test'),call:async()=>{throw Error('unavailable');}}));assert.equal(changed,0);
 const generated:any={configured:()=>new URL('https://example.test'),call:async(op:string)=>{if(op==='activate')throw Error('timeout');}};
 await assert.rejects(issueElectronicIdentity(db,ctx,'admin',generated),(e:any)=>e.changed===true&&!e.message.includes('password:'));assert.equal(changed,1);
 const bridge=identityBridge(async()=>new Response(JSON.stringify({ready:true,user_id:'wrong',school_id:'school',email:profile.email})),{WEBMAILHR_IDENTITY_ISSUANCE_URL:'https://example.test/integrations',WEBMAILHR_IDENTITY_ISSUANCE_TOKEN:'test'});
 await assert.rejects(bridge.call('prepare',ctx),/drugi identitet/);
});
