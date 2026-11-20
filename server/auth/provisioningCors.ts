import type {Request,Response,NextFunction} from 'express';
const allowedOrigins=new Set(['https://e-matica.skolehr.xyz']);
export function provisioningCors(req:Request,res:Response,next:NextFunction){
 if(!['/api/admin/create-user','/api/admin/electronic-identity'].includes(req.path))return next();
 const origin=req.get('origin');
 if(origin&&allowedOrigins.has(origin)){
  res.setHeader('Access-Control-Allow-Origin',origin);res.vary('Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.sendStatus(204);
 }
 next();
}
