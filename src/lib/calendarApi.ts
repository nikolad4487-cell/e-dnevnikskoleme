import { supabase } from './supabase';
export async function calendarRequest(path: string, options: RequestInit = {}) {
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw new Error('Prijavite se za pristup kalendaru.');
  const headers=new Headers(options.headers);headers.set('Authorization',`Bearer ${data.session.access_token}`);
  if(options.body)headers.set('Content-Type','application/json');
  const response=await fetch('/api/school-calendar'+path,{...options,headers});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Kalendar trenutačno nije dostupan.');return result;
}
export const syncSchoolCalendar = (schoolId:string,year:number,force=false) => calendarRequest('/sync',{method:'POST',body:JSON.stringify({schoolId,year,force})});
