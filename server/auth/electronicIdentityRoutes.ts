import type {Express} from 'express';
import {userManagementScope} from './userProvisioning.js';
import {identityContext,issueElectronicIdentity} from './electronicIdentity.js';
export function electronicIdentityRoutes(app:Express,authenticate:any,database:any){
 app.post('/api/admin/electronic-identity',userManagementScope(authenticate,database),async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(typeof req.body.profileId!=='string')return res.status(400).json({success:false,error:'Odaberite korisnika.'});
   const ctx=await identityContext(database,req.body.profileId,req.body.schoolId,req.body.schoolYearId);
   const actor=(req as any).workflowActor||await authenticate(req);
   if(req.body.operation==='preview')return res.json({success:true,identity:ctx.identity});
   if(req.body.operation!=='issue')return res.status(400).json({success:false,error:'Odaberite izdavanje.'});
   return res.json(await issueElectronicIdentity(database,ctx,actor.userId));
  }catch(error:any){return res.status(error.status||503).json({success:false,error:error.status?error.message:'Izdavanje nije dovršeno. Provjerite serversku konfiguraciju.',credentialMayHaveChanged:!!error.changed});}
 });
}
