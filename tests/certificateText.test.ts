import test from 'node:test';
import assert from 'node:assert/strict';
import {croatianStudentGender,enrollmentCertificateBody} from '../src/lib/certificateText';
import {visibleParentGrades,validateAbsenceAttachment} from '../src/lib/familyRules';
test('Croatian certificate text follows recorded gender, including diacritics',()=>{
 for(const gender of ['FEMALE','F','Ž','ŽENSKO','ženski']){const text=enrollmentCertificateBody({name:'Učenica Primjer',gender},{grade:'2',schoolType:'srednje škole',year:'2026./2027.',program:'Primjer',birthDate:'1.1.2010.'});assert(text.includes('rođena'));assert(text.includes('učenica 2'));}
 assert.equal(croatianStudentGender('MALE').born,'rođen');assert.equal(croatianStudentGender('M').student,'učenik');assert.equal(croatianStudentGender(undefined).born,'rođen/a');
});
test('Parent grade boundary uses actual insertion time, including missing/invalid times',()=>{
 const now=Date.parse('2026-10-20T12:00:00Z');
 const rows=[{id:1,createdAt:'2026-10-18T12:00:00Z'},{id:2,created_at:'2026-10-18T12:00:00.001Z'},{id:3,createdAt:'bad'},{id:4}];
 assert.deepEqual(visibleParentGrades(rows,now).map(r=>r.id),[1]);
});
test('Absence attachments validate content as well as extension and size',async()=>{
 assert.equal((await validateAbsenceAttachment(new File([new Uint8Array([137,80,78,71,13,10,26,10])],'ispricnica.png'))).mime,'image/png');
 await assert.rejects(validateAbsenceAttachment(new File(['malformed'],'ispricnica.pdf')));
 await assert.rejects(validateAbsenceAttachment(new File(['code'],'ispricnica.exe')));
 await assert.rejects(validateAbsenceAttachment(new File([''],'ispricnica.docx')));
 await assert.rejects(validateAbsenceAttachment(new File([new Uint8Array(10*1024*1024+1)],'ispricnica.png')));
});
