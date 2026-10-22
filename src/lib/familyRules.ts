export const absenceTypes=['Bolest - roditelj','Bolest - liječnik','Smrtni slučaj','Natjecanje','Promet','Obiteljski razlog','Ostalo'];
export const absenceStatuses:Record<string,string>={JUSTIFIED:'Opravdano',UNJUSTIFIED:'Neopravdano',OTHER:'Ostalo'};
export type RequestDay={date:string;absenceIds:string[];status:string;type:string;reason?:string};
export type FamilyRequest={id:string;student_id:string;parent_id:string;class_id:string;status:'SUBMITTED'|'PROCESSED'|'CANCELLED'|'REJECTED';days:RequestDay[];parent_note:string;teacher_note:string;attachment_path?:string;attachment_name?:string;version:number;created_at:string;processed_at?:string};
export const pendingAbsence=(status:string)=>['PENDING','CEKA','ČEKA','CEKA_ODLUKU','ČEKA ODLUKU'].includes(String(status||'').toUpperCase());
export const familyDate=(date:string)=>new Date(date.length===10?date+'T12:00:00':date).toLocaleDateString('hr-HR');
export function visibleParentGrades<T extends {createdAt?:string;created_at?:string}>(grades:T[],now=Date.now()):T[]{return grades.filter(g=>{const stamp=Date.parse(g.createdAt||g.created_at||'');return Number.isFinite(stamp)&&stamp<=now-48*3600000;});}
const fileTypes:Record<string,{mime:string;magic:number[]}>={pdf:{mime:'application/pdf',magic:[37,80,68,70,45]},png:{mime:'image/png',magic:[137,80,78,71,13,10,26,10]},jpg:{mime:'image/jpeg',magic:[255,216,255]},jpeg:{mime:'image/jpeg',magic:[255,216,255]},gif:{mime:'image/gif',magic:[71,73,70,56]},doc:{mime:'application/msword',magic:[208,207,17,224,161,177,26,225]},docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',magic:[80,75,3,4]}};
export async function validateAbsenceAttachment(file:File){
 const ext=file.name.split('.').pop()?.toLowerCase()||'',type=fileTypes[ext];
 if(!type||file.size===0||file.size>10*1024*1024)throw new Error('Priložite JPG, PNG, GIF, PDF, DOC ili DOCX datoteku do 10 MB.');
 const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());if(!type.magic.every((v,i)=>bytes[i]===v))throw new Error('Sadržaj datoteke ne odgovara odabranoj vrsti.');return {...type,ext};
}
