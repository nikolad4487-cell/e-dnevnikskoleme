import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {schoolCalendarRoutes,legacyCalendarGuard} from '../server/calendar/routes';

// A tiny Supabase protocol adapter exercises complete HTTP handlers without real accounts or writes.
function calendarDatabase() {
 const rows:any[]=[];
 const roles=[{user_id:'adminA',school_id:'A',role:'SCHOOL_ADMIN',status:'ACTIVE'},{user_id:'adminB',school_id:'B',role:'SCHOOL_ADMIN',status:'ACTIVE'},{user_id:'teacherA',school_id:'A',role:'TEACHER',status:'ACTIVE'},{user_id:'studentA',school_id:'A',role:'STUDENT',status:'ACTIVE'}];
 class Query {
  filters:((row:any)=>boolean)[]=[];action='read';payload:any;one=false;
  constructor(public table:string){}
  select(){return this;}eq(key:string,v:any){this.filters.push(r=>r[key]===v);return this;}
  lte(key:string,v:any){this.filters.push(r=>r[key]<=v);return this;}gte(key:string,v:any){this.filters.push(r=>r[key]>=v);return this;}
  in(key:string,v:any[]){this.filters.push(r=>v.includes(r[key]));return this;}order(){return this;}
  upsert(payload:any){this.action='upsert';this.payload=payload;return this;}delete(){this.action='delete';return this;}
  single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
  then(resolve:any,reject:any){return Promise.resolve().then(()=>{
   let data=this.table==='user_profiles'?roles.map(r=>({id:r.user_id,auth_user_id:r.user_id,role:r.role})):this.table==='user_school_roles'?roles:rows;
   if(this.action==='upsert'){for(const row of Array.isArray(this.payload)?this.payload:[this.payload]){const index=rows.findIndex(r=>r.id===row.id);if(index<0)rows.push({...row});else rows[index]={...rows[index],...row};}data=Array.isArray(this.payload)?this.payload:[this.payload];}
   else {data=data.filter(r=>this.filters.every(f=>f(r)));if(this.action==='delete')for(const row of data)rows.splice(rows.indexOf(row),1);}
   return {data:this.one?data[0]||null:data,error:null};
  }).then(resolve,reject);}
 }
 return {rows,client:{from:(table:string)=>new Query(table),auth:{getUser:async(token:string)=>roles.some(r=>r.user_id===token)?{data:{user:{id:token}},error:null}:{data:null,error:{message:'invalid'}}}}};
}
test('calendar API protects schools, repeat imports, custom ownership and automatic entries',async()=>{
 const db=calendarDatabase();const app=express();app.use(express.json());app.use('/calendar',schoolCalendarRoutes(db.client));app.post('/legacy',legacyCalendarGuard(db.client),(_req,res)=>res.json({success:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const root=`http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar`;
 const request=async(path:string,token:string,method='GET',body?:any)=>{const response=await fetch(root+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json() as any};};
 try {
  assert.equal((await request('?schoolId=A&year=2026','')).status,401);
  assert.equal((await request('?schoolId=B&year=2026','adminA')).status,403);
  assert.equal((await request('/sync','studentA','POST',{schoolId:'A',year:2026})).status,403);
  const first=await request('/sync','adminA','POST',{schoolId:'A',year:2026});assert.equal(first.status,200);assert.equal(db.rows.length,24);
  assert.equal((await request('/sync','adminA','POST',{schoolId:'A',year:2026})).status,200);assert.equal(db.rows.length,24);
  const custom=await request('/events','teacherA','POST',{school_id:'A',title:'Dan škole',type:'DAN_SKOLE',start_date:'2027-05-10',end_date:'2027-05-11'});
  assert.equal(custom.status,200);assert.equal(custom.data.event.creator_id,'teacherA');
  const moved=await fetch(root.replace('/calendar','')+'/legacy',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer adminA'},body:JSON.stringify({id:custom.data.event.id,school_id:'B'})});assert.equal(moved.status,403);
  assert.equal((await request('/sync','adminA','POST',{schoolId:'A',year:2026})).status,200);assert.equal(db.rows.length,25);
  assert.equal(db.rows.some(r=>r.title==='Dan škole'),true);
  const read=await request('?schoolId=A&year=2026','studentA');assert.equal(read.status,200);assert.equal(read.data.events.length,25);
  assert.equal((await request(`/events/${custom.data.event.id}?schoolId=A`,'adminB','DELETE')).status,403);
  assert.equal((await request(`/events/${db.rows[0].id}?schoolId=A`,'adminA','DELETE')).status,403);
  const edit=await request('/events','adminA','POST',{id:custom.data.event.id,school_id:'A',title:'Dan škole — ažurirano',type:'DAN_SKOLE',start_date:'2027-05-10'});
  assert.equal(edit.status,200);assert.equal(edit.data.event.creator_id,'teacherA');
  assert.equal((await request(`/events/${custom.data.event.id}?schoolId=A`,'teacherA','DELETE')).status,200);
  await request('/sync','adminB','POST',{schoolId:'B',year:2026});assert.equal(db.rows.length,48);
  assert.equal((await request('?schoolId=A&year=invalid','adminA')).status,400);
  // A later published source must not be replaced by the original bundled proposal after cache expiry.
  for(const row of db.rows.filter(r=>r.school_id==='A')){
    const meta=JSON.parse(row.description.slice('EDNEVNIK_CALENDAR_V1:'.length));
    meta.source.status='PUBLISHED';meta.source.url='https://ucenici.com/calendar-2026-2027/';meta.source.checkedAt=new Date(Date.now()-7*3600000).toISOString();
    row.description='EDNEVNIK_CALENDAR_V1:'+JSON.stringify(meta);
  }
  const published=await request('?schoolId=A&year=2026','adminA');assert.equal(published.data.source.status,'PUBLISHED');

 } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
