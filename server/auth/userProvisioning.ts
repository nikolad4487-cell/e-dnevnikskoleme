import type {Request,Response,NextFunction} from 'express';
export const STAFF_ROLES = ['TEACHER','HOMEROOM','DEPUTY','HOMEROOM_TEACHER','STAFF','ADMIN','SCHOOL_ADMIN','MAIN_ADMIN','SUPER_ADMIN','REGISTRAR'];
export function creationCredentials(password:unknown,roles:string[],fallback:()=>string){
 const isStaff=roles.some(role=>STAFF_ROLES.includes(role));
 const value=password===undefined||password===null||password===''?fallback():password;
 if(typeof value!=='string'||value.length<6)throw new Error('Lozinka mora sadržavati najmanje 6 znakova.');
 return {password:value,isStaff,isStudent:roles.includes('STUDENT')};
}
export function canManageSchool(auth:any,schoolId:string){
 const global=[auth?.profile?.role,auth?.profile?.access_role].some(r=>['MAIN_ADMIN','SUPER_ADMIN'].includes(r)) || (auth.roles||[]).some((r:any)=>r.status==='ACTIVE'&&!r.school_id&&['MAIN_ADMIN','SUPER_ADMIN'].includes(r.role));
 const schoolAdmin=['ADMIN','SCHOOL_ADMIN'].includes(auth?.profile?.role)&&auth?.profile?.school_id===schoolId;
 const schoolRole=(auth.roles||[]).some((r:any)=>r.school_id===schoolId&&r.status==='ACTIVE'&&['ADMIN','SCHOOL_ADMIN','MAIN_ADMIN','SUPER_ADMIN'].includes(r.role));
 return {allowed:!!schoolId&&(global||schoolAdmin||schoolRole),global};
}
export function userManagementScope(authenticate:(req:any)=>Promise<any>,database:any){
 return async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const auth=await authenticate(req);if(auth.error)return res.status(auth.status||401).json({success:false,error:'Prijava administratora je obavezna.'});
   const schoolId=req.body.schoolId||req.body.activeSchoolId||req.body.studentData?.schoolId;
   const access=canManageSchool(auth,schoolId);
   if(!access.allowed)return res.status(403).json({success:false,error:'Korisnike možete uređivati samo za školu kojom upravljate. Odaberite školu.'});
   const roles=req.body.roles||req.body.selectedRoles||(req.body.role?[req.body.role]:[]);
   const requested=[...(Array.isArray(roles)?roles:typeof roles==='string'?[roles]:[]),req.body.globalRole].filter(Boolean);
   if(requested.some(r=>typeof r!=='string'||![...STAFF_ROLES,'STUDENT','PARENT'].includes(r)))return res.status(400).json({success:false,error:'Odaberite valjanu korisničku ulogu.'});
   if(!access.global&&requested.some(r=>['MAIN_ADMIN','SUPER_ADMIN'].includes(r)))return res.status(403).json({success:false,error:'Samo glavni administrator može dodijeliti globalnu administratorsku ulogu.'});
   if(requested.includes('REGISTRAR')&&requested.some(r=>r!=='REGISTRAR'))return res.status(400).json({success:false,error:'Za Školsku referadu koristite zaseban račun s jedinom ulogom Školska referada.'});
   const {data:school,error:schoolError}=await database.from('schools').select('id').eq('id',schoolId).maybeSingle();
   if(schoolError||!school)return res.status(400).json({success:false,error:'Odabrana škola nije pronađena.'});
   const classId=req.body.classId||req.body.studentData?.classId;
   if(classId){const {data:cls,error}=await database.from('classes').select('school_id').eq('id',classId).maybeSingle();if(error||cls?.school_id!==schoolId)return res.status(400).json({success:false,error:'Razred ne pripada odabranoj školi.'});}
   if(req.body.profileId){
    const {data:profile,error}=await database.from('user_profiles').select('id,auth_user_id,school_id,role,access_role').eq('id',req.body.profileId).maybeSingle();
    if(error||!profile)return res.status(404).json({success:false,error:'Korisnik nije pronađen.'});
    if(req.body.authUserId&&req.body.authUserId!==profile.auth_user_id)return res.status(400).json({success:false,error:'Auth račun ne odgovara odabranom korisniku.'});
    req.body.authUserId=profile.auth_user_id;
    if(!access.global){
     if([profile.role,profile.access_role].some(r=>['MAIN_ADMIN','SUPER_ADMIN'].includes(r)))return res.status(403).json({success:false,error:'Školski administrator ne može uređivati globalni administratorski račun.'});
     const {data:memberships,error:membershipError}=await database.from('user_school_roles').select('school_id,status,role').eq('user_id',profile.id);
     const own=profile.school_id===schoolId||(memberships||[]).some((r:any)=>r.school_id===schoolId&&r.status==='ACTIVE');
     const other=(memberships||[]).some((r:any)=>r.status==='ACTIVE'&&(r.school_id!==schoolId||['MAIN_ADMIN','SUPER_ADMIN'].includes(r.role)));
     if(membershipError||!own||other)return res.status(403).json({success:false,error:'Ovaj račun dijeli više škola ili pripada drugoj školi. Promjenu može napraviti glavni administrator.'});
    }
   }
   req.body.schoolId=schoolId;
   next();
  }catch{return res.status(503).json({success:false,error:'Provjera ovlasti za upravljanje korisnicima nije uspjela.'});}
 };
}
