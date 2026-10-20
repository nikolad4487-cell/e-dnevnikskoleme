import {jsPDF} from 'jspdf';
import {registerUnicodeFont,formatCroatianDate} from './pdfGenerator';
import {enrollmentCertificateBody} from './certificateText';
import {supabase} from './supabase';
export type AttendanceRecord={id:string;mode:'SELF'|'SCHOOL';purpose:string;issued_at:string;snapshot:any;verification:{serialNumber:string;recordNumber:string;controlNumber:string;seal:string}};
export async function imageDataUrl(source:string){
 if(source.startsWith('private:')){
  const [bucket,...parts]=source.slice(8).split('/');
  const {data,error}=await supabase.storage.from(bucket).download(parts.join('/'));if(error)throw new Error('Potpis škole nije dostupan.');
  return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(data);});
 }
 let url=source;
 if(!source.startsWith('/')&&!/^https?:|^data:/.test(source))url=supabase.storage.from('school-documents').getPublicUrl(source).data.publicUrl;
 const response=await fetch(url);if(!response.ok)throw new Error('Pečat škole nije dostupan. Provjerite postavke dokumenata.');
 const blob=await response.blob();return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
}
export async function addSchoolAttestation(doc:jsPDF,settings:any,{newPage=false}:{newPage?:boolean}={}){
 if(newPage)doc.addPage();
 const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
 const stamp=settings?.stamp_url||settings?.stamp_image_url;
 if(stamp){const data=await imageDataUrl(stamp);const properties=doc.getImageProperties(data),ratio=properties.width/properties.height;const w=ratio>=1?34:34*ratio,h=ratio>=1?34/ratio:34;doc.addImage(data,'PNG',width/2-w/2,height-58,w,h);}
 if(settings?.signature_path){const signature=await imageDataUrl('private:registrar-assets/'+settings.signature_path);const p=doc.getImageProperties(signature),ratio=p.width/p.height,w=Math.min(52,13*ratio),h=w/ratio;doc.addImage(signature,'PNG',width-75,height-26-h,w,h);}
 doc.setFont('NotoSans','normal');doc.setFontSize(9);doc.setTextColor(0,0,0);
 doc.line(width-78,height-25,width-20,height-25);doc.text('Potpis odgovorne osobe škole',width-49,height-20,{align:'center'});
 if(settings?.signer_name||settings?.principal_name)doc.text(settings.signer_name||settings.principal_name,width-49,height-15,{align:'center'});
}
export async function buildAttendancePdf(record:AttendanceRecord){
 const doc=new jsPDF('p','mm','a4');await registerUnicodeFont(doc);doc.setFont('NotoSans','normal');
 const {student,school,class:cls,program,settings={}}=record.snapshot;
 doc.setFontSize(10);doc.text(settings.school_name||school.name||'Škola',28,28);doc.text(settings.city||school.city||'',28,34);
 doc.setFont('NotoSans','bold');doc.setFontSize(record.mode==='SELF'?16:14);doc.text(record.mode==='SELF'?'ELEKTRONIČKI ZAPIS':'POTVRDA O REDOVNOM ŠKOLOVANJU',105,62,{align:'center'});
 const schoolType=String(school.type||'').toUpperCase().includes('PRIMARY')||String(school.type||'').toUpperCase().includes('OSNOV')?'osnovne škole':'srednje škole';
 const body=enrollmentCertificateBody(student,{grade:String(cls.grade_level||cls.name?.match(/\d+/)?.[0]||''),schoolType,year:cls.school_year||'',program:program.name||'',birthDate:formatCroatianDate(student.dob)});
 doc.setFontSize(9);const lines=doc.splitTextToSize(body,155);doc.text(lines,28,83);
 let y=Math.max(106,83+lines.length*4.2+12);doc.setFont('NotoSans','normal');
 const purpose=`Ova potvrda izdaje se na temelju podataka iz školske evidencije i služi kao dokaz o redovitom školovanju u svrhu ${record.purpose}.`;
 const purposeLines=doc.splitTextToSize(purpose,155);doc.text(purposeLines,28,y);y+=purposeLines.length*4.2+12;
 doc.text(doc.splitTextToSize('Potvrda je oslobođena od plaćanja upravne pristojbe prema članku 9. stavak 21. Zakona o upravnim pristojbama ("Narodne novine", br. 115/16).',155),28,y);
 if(record.mode==='SCHOOL'){
  doc.text(`${settings.city||school.city||''}, ${formatCroatianDate(record.issued_at)}`,28,242);
  await addSchoolAttestation(doc,settings);return doc;
 }
 const verifyUrl=`${window.location.origin}/provjera-potvrde`;
 const rows=[['Vrijeme izdavanja',new Date(record.issued_at).toLocaleString('hr-HR')],['Izdavatelj',settings.school_name||school.name||'Škola'],['Identifikator zapisa',record.verification.serialNumber],['Broj zapisa',record.verification.recordNumber],['Kontrolni broj',record.verification.controlNumber],['Kontrolna oznaka sustava',record.verification.seal],['Provjera zapisa',`${verifyUrl}\nProvjera brojem zapisa i kontrolnim brojem dostupna je tri mjeseca od izdavanja.`]];
 let top=195;doc.setFontSize(7);
 for(const [label,value] of rows){const text=doc.splitTextToSize(value,102),h=Math.max(10,text.length*3.4+4);doc.rect(28,top,155,h);doc.line(74,top,74,top+h);doc.text(doc.splitTextToSize(label,42),30,top+4);doc.text(text,76,top+4);top+=h;}
 return doc;
}
export async function schoolAttestationSettings(schoolId:string){
 const {data,error}=await supabase.from('school_document_settings').select('school_name,school_name_print,principal_name,stamp_url,stamp_image_url').eq('school_id',schoolId).maybeSingle();
 if(error)throw new Error('Postavke službenog izvješća nisu dostupne.');
 return {...data,...(schoolId==='srednja-kola-glina-zagreb'?{stamp_url:'/stamps/srednja-skola-glina.png'}:{})};
}
