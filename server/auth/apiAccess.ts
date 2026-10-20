import type {Request,Response,NextFunction} from 'express';
export function apiAccessGuard(authenticate:(req:any)=>Promise<any>){
 return async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.path.startsWith('/api/')||req.path==='/api/auth/login'||req.path==='/api/health/env')return next();
  try{
   const auth=await authenticate(req);
   if(auth.error)return res.status(auth.status||401).json({error:'Za ovu radnju potrebna je valjana prijava.'});
   const registrar=[auth.profile?.role,auth.profile?.access_role,...(auth.roles||[]).filter((r:any)=>!r.status||r.status==='ACTIVE').map((r:any)=>r.role)].includes('REGISTRAR');
   if(registrar){
    if(!['/api/auth/change-pin','/api/auth/reset-authenticator','/api/auth/complete-authenticator','/api/verify-totp'].includes(req.path))return res.status(403).json({error:'Ova radnja nije dostupna u Školskoj referadi.'});
    for(const key of ['userId','profileId','user_id','profile_id'])if(req.body?.[key]&&req.body[key]!==auth.userId)return res.status(403).json({error:'Možete mijenjati samo vlastiti račun.'});
   }
   next();
  }catch{return res.status(503).json({error:'Provjera prijave trenutačno nije dostupna.'});}
 };
}
