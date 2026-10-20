export function croatianStudentGender(value:unknown){
 const gender=String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(['F','FEMALE','Z','ZENSKI','ZENSKO','ZENSKA'].includes(gender))return {born:'rođena',student:'učenica',completed:'završila'};
 if(['M','MALE','MUSKI','MUSKO'].includes(gender))return {born:'rođen',student:'učenik',completed:'završio'};
 return {born:'rođen/a',student:'učenik/ca',completed:'završio/la'};
}
export function enrollmentCertificateBody(student:any,context:{grade:string;schoolType:string;year:string;program:string;birthDate:string}){
 const words=croatianStudentGender(student.gender),name=student.name||[student.first_name,student.last_name].filter(Boolean).join(' ');
 return `Potvrđuje se da je ${name}, OIB ${student.oib||'____________'}, ${words.born} ${context.birthDate} u ${student.birthplace||student.pob||'____________'}, ${student.birth_country||'Hrvatska'}, s mjestom prebivališta ${student.address||'____________'}, ${words.student} ${context.grade||'_'} razreda ${context.schoolType} u školskoj godini ${context.year}, programa ${context.program||'____________'}.`;
}
