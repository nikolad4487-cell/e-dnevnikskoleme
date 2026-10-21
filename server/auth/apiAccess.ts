import type {Request,Response,NextFunction} from 'express';
export function apiAccessGuard(authenticate:(req:any)=>Promise<any>, database?:any){
 return async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.path.startsWith('/api/')||req.path==='/api/auth/login'||req.path==='/api/health/env')return next();
  try{
   const auth=await authenticate(req);
   if(auth.error)return res.status(auth.status||401).json({error:'Za ovu radnju potrebna je valjana prijava.'});
   const registrar=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>!r.status||r.status==='ACTIVE').map((r:any)=>r.role)].includes('REGISTRAR');
   const expert=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>r.role)].includes('EXPERT');
   if(expert){
    const ownAuth=['/api/auth/change-pin','/api/auth/reset-authenticator','/api/auth/complete-authenticator','/api/verify-totp'].includes(req.path);
    if(ownAuth){
     for(const key of ['userId','profileId','user_id','profile_id'])if(req.body?.[key]&&req.body[key]!==auth.userId)return res.status(403).json({error:'Možete mijenjati samo vlastiti račun.'});
    }else{
     // Specialists write pedagogy through user-scoped RPCs, not service-role routes.
     if(req.method!=='GET'||!['/api/student-notes','/api/daily-notes'].includes(req.path)||!database)return res.status(403).json({error:'Stručni suradnik ima pregled predmeta bez izmjena. Pedagošku dokumentaciju uređujte kroz pripadajuću evidenciju.'});
     const classId=req.query?.classId;
     if(typeof classId!=='string')return res.status(403).json({error:'Odaberite razred svoje škole.'});
     const r=await database.from('classes').select('id,school_id').eq('id',classId).maybeSingle();
     if(r.error||!r.data||!(auth.roles||[]).some((role:any)=>role.role==='EXPERT'&&role.status==='ACTIVE'&&role.school_id===r.data.school_id))return res.status(403).json({error:'Razred nije dostupan vašoj školi.'});
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
