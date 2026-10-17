import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { calendarYear, calendarYearLabel, croatianHolidays, schoolYearForDate, validCalendarDate, type CalendarSource } from '../../src/lib/schoolCalendar';
import { fetchYearCalendar, allowedCalendarUrl } from './source';

const marker='EDNEVNIK_CALENDAR_V1:';
export const calendarMeta = (row: any): any => { try { return String(row.description||'').startsWith(marker)?JSON.parse(row.description.slice(marker.length)):null; } catch { return null; } };
export function automaticCalendarId(school: string, year: number, key: string) {
  const h=createHash('sha256').update(`school-calendar:v1:${school}:${year}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function calendarRow(row:any) {
  const meta=calendarMeta(row);
  return {id:row.id,school_id:row.school_id,school_year:row.school_year,date:row.start_date,start_date:row.start_date,end_date:row.end_date,time:row.start_time,start_time:row.start_time,end_time:row.end_time,type:row.event_type,title:row.title,notes:meta?meta.notes||'':row.description||'',classroom:row.classroom,is_instructional_day:row.is_instructional_day,holiday_type:meta?.holidayType,automatic:meta?.kind==='AUTO',source_status:row.event_type==='PRAZNIK'?'PUBLISHED':meta?.source?.status,creator_id:meta?.creatorId};
}
export function calendarScope(profile: any, roles: any[], school: string) {
  const global=[profile?.role,profile?.access_role].some(r=>['MAIN_ADMIN','SUPER_ADMIN'].includes(r));
  const scoped=roles.filter(r=>r.status==='ACTIVE'&&String(r.school_id)===school);
  return {read:global||scoped.length>0,admin:global||scoped.some(r=>['ADMIN','SCHOOL_ADMIN'].includes(r.role)),staff:global||scoped.some(r=>['ADMIN','SCHOOL_ADMIN','TEACHER','HOMEROOM','DEPUTY','STAFF'].includes(r.role))};
}
async function authenticate(admin:any,req:Request,school:string) {
  const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];if(!token)throw Object.assign(new Error('Prijava je obavezna.'),{status:401});
  if(!admin)throw Object.assign(new Error('Pohrana kalendara nije konfigurirana.'),{status:503});
  const {data,error}=await admin.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Sesija nije valjana.'),{status:401});
  let {data:profile,error:pe}=await admin.from('user_profiles').select('id,auth_user_id,role,access_role').eq('auth_user_id',data.user.id).maybeSingle();
  if(!pe&&!profile){
    const fallback=await admin.from('user_profiles').select('id,auth_user_id,role,access_role').eq('id',data.user.id).maybeSingle();
    if(!fallback.error&&fallback.data&&(!fallback.data.auth_user_id||fallback.data.auth_user_id===data.user.id))profile=fallback.data;
  }
  if(pe||!profile)throw Object.assign(new Error('Profil nije dostupan.'),{status:403});
  const {data:roles,error:re}=await admin.from('user_school_roles').select('school_id,role,status').eq('user_id',profile.id);
  if(re)throw Object.assign(new Error('Provjera ovlasti nije dostupna.'),{status:503});
  const scope=calendarScope(profile,roles||[],school);if(!scope.read)throw Object.assign(new Error('Nemate pristup kalendaru ove škole.'),{status:403});
  return {...scope,userId:profile.id};
}
const fail=(res:Response,e:any)=>res.status(e.status||500).json({error:e.status?e.message:'Kalendar nije moguće spremiti ili učitati. Pokušajte ponovno.'});
async function rowsForYear(admin:any,school:string,year:number) {
  const {data,error}=await admin.from('school_events').select('*').eq('school_id',school).lte('start_date',`${year+1}-08-31`).gte('end_date',`${year}-09-01`).order('start_date');
  if(error)throw error;return data||[];
}
function snapshot(rows:any[],year:number):CalendarSource|undefined {
  const sources=rows.map(r=>calendarMeta(r)).filter(m=>m?.kind==='AUTO').map(m=>m.source).filter(source=>{
    if(!source||source.year!==year||!Array.isArray(source.items)||source.items.length>60||!Array.isArray(source.notes)||!Number.isFinite(Date.parse(source.checkedAt)))return false;
    if(!['PROPOSAL','PUBLISHED','WAITING','REVIEW_REQUIRED','UNAVAILABLE'].includes(source.status))return false;
    try { if(source.url!=='/calendars/skolski-kalendar-2026-2027-prijedlog.pdf')allowedCalendarUrl(source.url); } catch {return false;}
    return source.items.every((item:any)=>typeof item.key==='string'&&/^[a-z0-9-]{1,80}$/.test(item.key)&&typeof item.title==='string'&&item.title.length<=300&&validCalendarDate(item.start)&&validCalendarDate(item.end)&&item.start>=`${year}-09-01`&&item.end<=`${year+1}-08-31`&&item.end>=item.start&&['PRAZNIK','ŠKOLSKI_PRAZNIK','DOGAĐAJ'].includes(item.type));
  });
  return sources.sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt))[0];
}
async function sourceForYear(rows:any[],year:number,force=false) {
  const saved=snapshot(rows,year);
  if(!force&&saved&&Date.now()-Date.parse(saved.checkedAt)<(['PUBLISHED','PROPOSAL'].includes(saved.status)?6*3600000:15*60000))return saved;
  const source=await fetchYearCalendar(year,force);
  if(year===2026&&source.url.startsWith('/calendars/')&&saved?.items.length&&!saved.url.startsWith('/calendars/'))return saved;
  if(['UNAVAILABLE','WAITING','REVIEW_REQUIRED'].includes(source.status)&&saved?.items.length) return {...saved,notes:[...new Set([...saved.notes,'Novi dohvat nije uspio; prethodno uvezeni datumi su sačuvani.'])]};
  return source;
}
export function automaticCalendarRows(school:string,source:CalendarSource) {
  return [...croatianHolidays(source.year),...source.items].map(item=>({id:automaticCalendarId(school,source.year,item.key),school_id:school,school_year:calendarYearLabel(source.year),event_type:item.type,title:item.title,start_date:item.start,end_date:item.end,start_time:null,end_time:null,classroom:null,is_instructional_day:item.instructional,
    description:marker+JSON.stringify({kind:'AUTO',key:item.key,holidayType:item.holidayType,notes:item.type==='PRAZNIK'?'Blagdan u Republici Hrvatskoj.':source.title,source})}));
}
export const schoolEventTypes=new Set(['PRAZNIK','ŠKOLSKI_PRAZNIK','SJEDNICA','SASTANAK','OBRANA','NATJECANJE','IZLET','DOGAĐAJ','NENASTAVNI_DAN','DAN_SKOLE']);
export function validateSchoolEvent(body:any,school:string,userId:string) {
  const start=String(body.start_date||body.date||''),end=String(body.end_date||start);
  if(!validCalendarDate(start)||!validCalendarDate(end)||end<start||start<'2000-09-01'||end>'2101-08-31'||(Date.parse(end)-Date.parse(start))/86400000>366)throw Object.assign(new Error('Provjerite datum početka i završetka događaja.'),{status:400});
  const title=String(body.title||'').trim(),type=String(body.event_type||body.type||'');
  if(!title||title.length>300||!schoolEventTypes.has(type)||String(body.notes||'').length>10000)throw Object.assign(new Error('Provjerite naziv, vrstu i opis događaja.'),{status:400});
  for(const value of [body.start_time,body.end_time])if(value&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))throw Object.assign(new Error('Neispravno vrijeme događaja.'),{status:400});
  if(start===end&&body.start_time&&body.end_time&&body.end_time<body.start_time)throw Object.assign(new Error('Završetak događaja mora biti nakon početka.'),{status:400});
  return {school_id:school,school_year:calendarYearLabel(schoolYearForDate(start)),event_type:type,title,start_date:start,end_date:end,start_time:body.start_time||null,end_time:body.end_time||null,classroom:String(body.classroom||'').slice(0,200)||null,
    is_instructional_day:['PRAZNIK','ŠKOLSKI_PRAZNIK','NENASTAVNI_DAN'].includes(type)?false:body.is_instructional_day!==false,
    description:marker+JSON.stringify({kind:'CUSTOM',creatorId:userId,holidayType:body.holiday_type,notes:String(body.notes||'')})};
}
export function schoolCalendarRoutes(admin:any) {
  const router=Router();
  router.get('/',async(req,res)=>{try{
    const school=String(req.query.schoolId||''),year=calendarYear(req.query.year);const auth=await authenticate(admin,req,school);
    const rows=await rowsForYear(admin,school,year),source=await sourceForYear(rows,year);
    const automatic=automaticCalendarRows(school,source);
    const custom=rows.filter((r:any)=>calendarMeta(r)?.kind!=='AUTO');
    res.setHeader('Cache-Control','no-store');res.json({events:[...custom,...automatic].map(calendarRow),source,canManage:auth.staff,canSync:auth.admin});
  }catch(e){fail(res,e);}});
  router.post('/sync',async(req,res)=>{try{
    const school=String(req.body.schoolId||''),year=calendarYear(req.body.year);const auth=await authenticate(admin,req,school);
    if(!auth.admin)return res.status(403).json({error:'Uvoz kalendara zahtijeva administratora škole.'});
    const rows=await rowsForYear(admin,school,year),source=await sourceForYear(rows,year,req.body.force===true),automatic=automaticCalendarRows(school,source);
    // Stable IDs make repeat requests and independent schools safe. A batch upsert is one database statement.
    const {error}=await admin.from('school_events').upsert(automatic,{onConflict:'id'});if(error)throw error;
    const ids=new Set(automatic.map(r=>r.id));const obsolete=rows.filter((r:any)=>calendarMeta(r)?.kind==='AUTO'&&calendarMeta(r)?.source?.year===year&&!ids.has(r.id)).map((r:any)=>r.id);
    if(obsolete.length){const {error}=await admin.from('school_events').delete().eq('school_id',school).in('id',obsolete);if(error)throw error;}
    res.json({success:true,count:automatic.length,source});
  }catch(e){fail(res,e);}});
  router.post('/events',async(req,res)=>{try{
    const school=String(req.body.school_id||''),auth=await authenticate(admin,req,school);
    if(!auth.staff)return res.status(403).json({error:'Događaje mogu dodavati zaposlenici škole.'});
    const payload=validateSchoolEvent(req.body,school,auth.userId);let id=req.body.id||randomUUID();
    if(req.body.id){
      const {data:existing,error}=await admin.from('school_events').select('*').eq('id',id).eq('school_id',school).maybeSingle();if(error)throw error;
      if(!existing)return res.status(404).json({error:'Događaj nije pronađen u ovoj školi.'});
      const meta=calendarMeta(existing);if(meta?.kind==='AUTO')return res.status(403).json({error:'Uvezeni kalendar se osvježava iz izvora. Dodajte zaseban školski događaj.'});
      if(!auth.admin&&meta?.creatorId!==auth.userId)return res.status(403).json({error:'Možete uređivati samo vlastite događaje.'});
      if(meta?.creatorId){const metadata=JSON.parse(payload.description.slice(marker.length));metadata.creatorId=meta.creatorId;payload.description=marker+JSON.stringify(metadata);}
    }
    const {data,error}=await admin.from('school_events').upsert({id,...payload}).select().single();if(error)throw error;
    res.json({success:true,event:calendarRow(data)});
  }catch(e){fail(res,e);}});
  router.delete('/events/:id',async(req,res)=>{try{
    const school=String(req.query.schoolId||''),auth=await authenticate(admin,req,school);
    const {data:existing,error}=await admin.from('school_events').select('*').eq('id',req.params.id).eq('school_id',school).maybeSingle();if(error)throw error;
    if(!existing)return res.status(404).json({error:'Događaj nije pronađen u ovoj školi.'});
    const meta=calendarMeta(existing);if(meta?.kind==='AUTO'||(!auth.admin&&(!auth.staff||meta?.creatorId!==auth.userId)))return res.status(403).json({error:'Brisanje ovog događaja nije dopušteno.'});
    const {data:deleted,error:de}=await admin.from('school_events').delete().eq('id',req.params.id).eq('school_id',school).select('id');if(de)throw de;
    if(!deleted?.length)return res.status(409).json({error:'Događaj nije obrisan.'});res.json({success:true});
  }catch(e){fail(res,e);}});
  return router;
}

// Protect legacy service-role routes as well; the new UI never uses the browser's deletion interception.
export function legacyCalendarGuard(admin:any) {
 return async(req:Request,res:Response,next:NextFunction)=>{try{
  let school=String(req.query.schoolId||req.body?.school_id||req.body?.schoolId||'');
  const id=req.params.id||req.body?.id;let existing:any;
  if(id){const r=await admin.from('school_events').select('*').eq('id',id).maybeSingle();if(r.error)throw r.error;existing=r.data;if(existing){if(school&&school!==existing.school_id)return res.status(403).json({error:'Događaj se ne može premještati u drugu školu.'});school=existing.school_id;}}
  const auth=await authenticate(admin,req,school);
  if(req.method!=='GET'&&(!auth.admin||calendarMeta(existing)?.kind==='AUTO'||String(req.body?.notes||'').startsWith(marker)))return res.status(403).json({error:'Koristite školski obrazac za uređivanje vlastitih događaja.'});
  next();
 }catch(e){fail(res,e);}};
}
