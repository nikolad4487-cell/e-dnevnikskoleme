import {supabase} from './supabase';
/** Names/roles only; staff credentials must never be fetched for directory screens. */
export async function fetchSchoolStaff(schoolId:string|null|undefined):Promise<{data:any[];error:any}>{
 if(!schoolId)return {data:[],error:null};
 const r=await supabase.rpc('portal_staff_directory',{_school:schoolId});
 if(!r.error)return {data:r.data||[],error:null};
 if(!['PGRST202','42883'].includes(r.error.code))return {data:[],error:r.error};
 const fallback=await supabase.from('user_school_roles').select('role,user:user_profiles(id,auth_user_id,name,role,school_id,email)').eq('school_id',schoolId).eq('status','ACTIVE').in('role',['TEACHER','HOMEROOM','DEPUTY','ADMIN','SCHOOL_ADMIN','PRINCIPAL','EXPERT','MAIN_ADMIN','SUPER_ADMIN']);
 return {data:(fallback.data||[]).filter(r=>r.user),error:fallback.error};
}
export async function fetchStaffProfiles(schoolId:string|null|undefined){const r=await fetchSchoolStaff(schoolId);return {data:[...new Map(r.data.map(r=>[r.user.id,r.user])).values()],error:r.error};}
export async function fetchClassNames(classId:string){
 const r=await supabase.rpc('portal_class_names',{_class:classId});if(!r.error)return {data:r.data||[],error:null};
 if(!['PGRST202','42883'].includes(r.error.code))return {data:[],error:r.error};
 const fallback=await supabase.from('student_class_enrollments').select('student:user_profiles!student_class_enrollments_student_id_fkey(id,name)').eq('class_id',classId).eq('status','ACTIVE');return {data:(fallback.data||[]).map(e=>e.student).filter(Boolean),error:fallback.error};
}

export async function fetchClassStaffProfiles(classId:string){const r=await supabase.from('classes').select('school_id').eq('id',classId).maybeSingle();if(r.error)return {data:[],error:r.error};return fetchStaffProfiles(r.data?.school_id);}
