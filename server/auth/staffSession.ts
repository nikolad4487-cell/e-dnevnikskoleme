import {STAFF_ROLES} from './userProvisioning.js';
const LEGACY_PIN_HASH='$2b$10$EEbRoX3UU0AtHm3CMZSABOXxL9ghae0./0eeeBuKVpYEsAaDdXQ72';
// PIN is an application credential. Never replace the user's Auth password with it.
export async function staffSession({database,email,pin,verifyPin,verifyToken}:{database:any;email:string;pin:string;verifyPin:(pin:string,hash:string)=>Promise<boolean>;verifyToken:(hash:string)=>Promise<any>}){
 const denied={data:null,error:{message:'Neispravni podaci za prijavu.',status:401}};
 const {data:profile,error}=await database.from('user_profiles').select('id,auth_user_id,role,access_role,pin_hash').eq('email',email).maybeSingle();
 if(error||!profile?.auth_user_id)return denied;
 const {data:roles,error:roleError}=await database.from('user_school_roles').select('role,status').eq('user_id',profile.id);
 const staff=[profile.role,profile.access_role,...(roles||[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>r.role)].some(r=>STAFF_ROLES.includes(r));
 if(roleError||!staff||typeof pin!=='string'||!await verifyPin(pin,profile.pin_hash||LEGACY_PIN_HASH))return denied;
 const generated=await database.auth.admin.generateLink({type:'magiclink',email});
 if(generated.error||!generated.data?.properties?.hashed_token)throw new Error('Nije moguće otvoriti prijavu djelatnika.');
 const result=await verifyToken(generated.data.properties.hashed_token);
 if(result.error)return result;
 if(result.data?.user?.id!==profile.auth_user_id)return denied;
 return result;
}
