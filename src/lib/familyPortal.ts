import {supabase} from './supabase';
import {validateAbsenceAttachment} from './familyRules';
export * from './familyRules';
export async function familyRpc<T=any>(name:string,args:Record<string,unknown>={}):Promise<T>{
 if(['registrar_context','registrar_students','registrar_certificates','registrar_issue_certificate','registrar_set_signature'].includes(name)){const proof=await supabase.rpc('registrar_touch_session');if(proof.error)throw new Error('Za pristup referadi prijavite se PIN-om i kodom iz autentifikatora. Administrator treba dodijeliti pristup jednoj školi.');}
 const {data,error}=await supabase.rpc(name,args);
 if(error){if(['PGRST202','42P01','42883'].includes(error.code))throw new Error('Roditeljski modul još nije aktiviran u bazi. Administrator treba primijeniti pripremljenu nadogradnju baze.');throw new Error(error.message||'Zahtjev nije uspio.');}return data as T;
}
export async function uploadAbsenceAttachment(file:File,parentId:string,requestId:string){
 const type=await validateAbsenceAttachment(file),path=`${parentId}/${requestId}/${crypto.randomUUID()}.${type.ext}`;
 const {error}=await supabase.storage.from('absence-notes').upload(path,file,{contentType:type.mime,upsert:false});if(error)throw new Error('Ispričnicu nije moguće spremiti. Provjerite datoteku i pokušajte ponovno.');return path;
}
export async function openAbsenceAttachment(path:string){
 const {data,error}=await supabase.storage.from('absence-notes').download(path);if(error)throw new Error('Nemate pristup ispričnici ili je prilog nedostupan.');
 const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=path.split('/').pop()||'ispricnica';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
