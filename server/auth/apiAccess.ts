import {canManageSchool,canManageProfileIdentity,STAFF_ROLES} from './userProvisioning.js';
import type {Request,Response,NextFunction} from 'express';
export function apiAccessGuard(authenticate:(req:any)=>Promise<any>, database?:any){
 return async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.path.startsWith('/api/')||req.path==='/api/auth/login'||req.path==='/api/health/env')return next();
  try{
   const auth=await authenticate(req);
   if(auth.error)return res.status(auth.status||401).json({error:'Za ovu radnju potrebna je valjana prijava.'});
   (req as any).workflowActor=auth;
   const ownAuth=['/api/auth/change-pin','/api/auth/reset-authenticator','/api/auth/complete-authenticator','/api/verify-totp'].includes(req.path);
   if(ownAuth){
    for(const key of ['userId','profileId','user_id','profile_id'])if(req.body?.[key]&&req.body[key]!==auth.userId){
     if(!await canManageProfileIdentity(auth,database,req.body[key]))return res.status(403).json({error:'Nemate ovlasti za tuđi račun ili je račun povezan s više škola.'});
    }
   }
   const globalOnly=req.path==='/api/seed'||/^\/api\/admin\/run-/.test(req.path);
   const adminPath=req.path.startsWith('/api/admin/')||req.method!=='GET'&&/^\/api\/(school-years|programs|school-documents|matura-settings|matura-exam-schedule|matura-study-programs|final-exam-defense-schedules|classes)(\/|$)/.test(req.path)||['/api/auth/bulk-generate-staff-authenticators','/api/auth/mark-staff-authenticators-scanned'].includes(req.path);
   if(globalOnly&&!canManageSchool(auth,'__global_check__').global)return res.status(403).json({error:'Ovu radnju može provesti samo glavni administrator.'});
   if(adminPath&&!canManageSchool(auth,'__global_check__').global){
    let school=req.body?.schoolId||req.body?.school_id||req.query?.schoolId||req.query?.school_id||auth.profile?.active_school_id||auth.profile?.school_id;
    const classId=req.body?.classId||req.query?.classId||req.body?.class_id;
    if(classId&&database){const c=await database.from('classes').select('school_id').eq('id',classId).maybeSingle();if(c.error||!c.data||school&&c.data.school_id!==school)return res.status(403).json({error:'Razred ne pripada odabranoj školi.'});school=c.data.school_id;}
    if(!school||!canManageSchool(auth,school).allowed)return res.status(403).json({error:'Administracija je dostupna samo za vlastitu školu.'});
    if(req.method==='GET'){if(!req.query.schoolId)req.query.schoolId=school;}else{req.body||={};if(!req.body.schoolId)req.body.schoolId=school;}
    const credentialTargets=req.path==='/api/auth/mark-staff-authenticators-scanned'?req.body?.profileIds:req.path==='/api/admin/reset-student-password'?[req.body?.profileId]:[];
    for(const id of credentialTargets||[])if(typeof id!=='string'||!await canManageProfileIdentity(auth,database,id))return res.status(403).json({error:'Podaci prijave mogu se mijenjati samo za vlastitu ustanovu; zajedničkim računima upravlja glavni administrator.'});
   }
   const globalAccess=canManageSchool(auth,'__global_check__').global;
   const membership=(school:string)=>(auth.roles||[]).some((r:any)=>r.school_id===school&&r.status==='ACTIVE')||auth.profile?.school_id===school&&!(auth.roles||[]).some((r:any)=>r.school_id===school&&r.status&&r.status!=='ACTIVE');
   const readableSchool=async(school:string)=>{if(membership(school))return true;if(!database||auth.profile?.role!=='PARENT')return false;const links=await database.from('parent_child_relationships').select('id').eq('parent_id',auth.userId).eq('school_id',school).limit(1);return !links.error&&!!links.data?.length;};
   const schoolSelectors=[req.body?.schoolId,req.body?.school_id,req.query?.schoolId,req.query?.school_id].filter(Boolean);
   if(!globalAccess)for(const school of schoolSelectors)if(typeof school!=='string'||!await readableSchool(school))return res.status(403).json({error:'Ustanova nije dostupna vašem računu.'});
   const classSelector=req.body?.classId||req.body?.class_id||req.query?.classId||req.query?.class_id;
   if(!globalAccess&&classSelector&&database){
    const row=await database.from('classes').select('school_id').eq('id',classSelector).maybeSingle();
    if(row.error||!row.data||!await readableSchool(row.data.school_id)||schoolSelectors.some(s=>s!==row.data.school_id))return res.status(403).json({error:'Razred ne pripada dostupnoj ustanovi.'});
   }
   const resource=req.path.match(/^\/api\/(?:admin\/)?(classes|programs|school-years)\/([^/]+)/);
   if(resource&&!globalAccess&&database){
    const table=resource[1]==='school-years'?'school_years':resource[1],row=await database.from(table).select('school_id').eq('id',resource[2]).maybeSingle();
    if(row.error||!row.data||!await readableSchool(row.data.school_id)||schoolSelectors.some(s=>s!==row.data.school_id))return res.status(403).json({error:'Zapis ne pripada dostupnoj ustanovi.'});
   }
   if(req.path==='/api/ensure-profile'&&req.body?.authUserId!==auth.profile?.auth_user_id)return res.status(403).json({error:'Nije dopušten pristup tuđem profilu.'});
   const roleNames=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>r.role)].map(r=>String(r||'').toUpperCase());
   const familyReader=roleNames.some(r=>['STUDENT','PARENT'].includes(r))&&!roleNames.some(r=>STAFF_ROLES.includes(r));
   const personalCollection=/^\/api\/(final-thesis|matura-registrations|matura-results|matura-objections|matura-study-applications|payments|practicum-placements|student-registrations|competitions|student-pedagogical-profile|student-pedagogical-year-notes)(\/|$)/.test(req.path);
   const people=[req.body?.studentId,req.body?.student_id,req.query?.studentId,req.query?.student_id].filter(Boolean);
   if(familyReader){
    const student=roleNames.includes('STUDENT');
    if(req.method!=='GET'&&!ownAuth&&(!student||!/^\/api\/(final-thesis|matura-registrations|matura-study-applications|matura-objections)(\/|$)/.test(req.path)))return res.status(403).json({error:'Roditeljski i učenički račun nema ovlasti za ovu izmjenu.'});
    if(req.method==='GET'&&personalCollection&&!people.length){if(!student)return res.status(403).json({error:'Odaberite povezano dijete.'});req.query.studentId=auth.userId;people.push(auth.userId);}
    for(const person of people){
     if(student&&person===auth.userId)continue;
     if(!student&&database){const link=await database.from('parent_child_relationships').select('id').eq('parent_id',auth.userId).eq('child_id',person).limit(1);if(!link.error&&link.data?.length)continue;}
     return res.status(403).json({error:'Učenik nije povezan s vašim računom.'});
    }
    if(student&&req.method!=='GET'&&/^\/api\/matura-registrations\//.test(req.path)){
     const id=req.path.split('/')[3],record=database?await database.from('matura_registrations').select('student_id').eq('id',id).maybeSingle():null;
     if(record?.error||record?.data?.student_id!==auth.userId)return res.status(403).json({error:'Prijava mature nije dostupna vašem računu.'});
    }
    if(student&&req.method!=='GET'&&/^\/api\/final-thesis\//.test(req.path)){
     const id=req.path.split('/')[3],record=database?await database.from('final_thesis').select('student_id').eq('id',id).maybeSingle():null;
     if(record?.error||record?.data?.student_id!==auth.userId)return res.status(403).json({error:'Završni rad nije dostupan vašem računu.'});
    }
   }
   const registrar=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>!r.status||r.status==='ACTIVE').map((r:any)=>r.role)].includes('REGISTRAR');
   const expert=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>r.role)].some(r=>['EXPERT','PRINCIPAL'].includes(r));
   if(expert){
    const ownAuth=['/api/auth/change-pin','/api/auth/reset-authenticator','/api/auth/complete-authenticator','/api/verify-totp'].includes(req.path);
    if(ownAuth){
     for(const key of ['userId','profileId','user_id','profile_id'])if(req.body?.[key]&&req.body[key]!==auth.userId)return res.status(403).json({error:'Možete mijenjati samo vlastiti račun.'});
    }else{
     // Specialists write pedagogy through user-scoped RPCs, not service-role routes.
     if(req.method!=='GET'||!['/api/student-notes','/api/daily-notes'].includes(req.path)||!database)return res.status(403).json({error:'Ova školska uloga nema ovlasti za ovu radnju.'});
     const classId=req.query?.classId;
     if(typeof classId!=='string')return res.status(403).json({error:'Odaberite razred svoje škole.'});
     const r=await database.from('classes').select('id,school_id').eq('id',classId).maybeSingle();
     if(r.error||!r.data||!(auth.roles||[]).some((role:any)=>['EXPERT','PRINCIPAL'].includes(role.role)&&role.status==='ACTIVE'&&role.school_id===r.data.school_id))return res.status(403).json({error:'Razred nije dostupan vašoj školi.'});
     if(req.query?.studentId){const e=await database.from('student_class_enrollments').select('id').eq('class_id',classId).eq('student_id',req.query.studentId).eq('status','ACTIVE').limit(1);if(e.error||!e.data?.length)return res.status(403).json({error:'Učenik nije u odabranom razredu.'});}
    }
   }
   if(registrar){
    if(!['/api/auth/change-pin','/api/auth/reset-authenticator','/api/auth/complete-authenticator','/api/verify-totp'].includes(req.path))return res.status(403).json({error:'Ova radnja nije dostupna u Školskoj referadi.'});
    for(const key of ['userId','profileId','user_id','profile_id'])if(req.body?.[key]&&req.body[key]!==auth.userId)return res.status(403).json({error:'Možete mijenjati samo vlastiti račun.'});
   }
   next();
  }catch{return res.status(503).json({error:'Provjera prijave trenutačno nije dostupna.'});}
 };
}
