import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractText} from 'unpdf';
import {croatianHolidays,easterSunday,uploadedCalendar2026,calendarYear,schoolYearForDate} from '../src/lib/schoolCalendar';
import {allowedCalendarUrl,parseCalendarText,readSourceDate,fetchYearCalendar} from '../server/calendar/source';
import {automaticCalendarRows,calendarMeta,calendarScope,validateSchoolEvent} from '../server/calendar/routes';

const article=(year:number)=>`Školski kalendar za ${year}./${year+1}. Prvi dio zimskog odmora za učenike počinje od 24. prosinca ${year}. do 6. siječnja ${year+1}. Drugi dio zimskog odmora traje od 21. veljače ${year+1}. do 27. veljače ${year+1}. Proljetni odmor za učenike traje od 13. travnja ${year+1}. do 23. travnja ${year+1}. Nastava završava 15. lipnja ${year+1}.`;
test('statutory holidays use each year and actual movable feasts',()=>{
 const a=croatianHolidays(2026),b=croatianHolidays(2027);
 assert.equal(a.length,14);assert.equal(new Set(a.map(e=>e.key)).size,14);
 assert.equal(easterSunday(2027),'2027-03-28');assert.equal(easterSunday(2028),'2028-04-16');
 assert.equal(a.find(e=>e.key==='hr-corpus-christi')?.start,'2027-05-27');
 assert.equal(b.find(e=>e.key==='hr-easter-monday')?.start,'2028-04-17');
 assert.equal(a.every(e=>e.start>='2026-09-01'&&e.end<='2027-08-31'),true);
});
test('the supplied proposal includes the user-confirmed winter correction and no next-year reuse',async()=>{
 const source=await fetchYearCalendar(2026);
 assert.equal(source.status,'PROPOSAL');assert.equal(source.items.find(e=>e.key==='school-winter-2')?.end,'2027-02-28');
 assert.equal(source.items.find(e=>e.key==='school-spring')?.end,'2027-04-04');
 const pdf=await extractText(new Uint8Array(await readFile('public/calendars/skolski-kalendar-2026-2027-prijedlog.pdf')),{mergePages:true});
 const raw=Array.isArray(pdf.text)?pdf.text.join(' '):pdf.text;
 assert.match(raw,/2026/);assert.equal(parseCalendarText(raw,2026,'https://ucenici.com/calendar.pdf','prijedlog').status,'REVIEW_REQUIRED');
});
test('new-year text is parsed with exact dates, summer bounds and proposal status',()=>{
 const source=parseCalendarText(article(2027),2027,'https://ucenici.com/2027.pdf','Školski kalendar 2027/2028 — prijedlog');
 assert.equal(source.status,'PROPOSAL');assert.equal(source.items.find(e=>e.key==='school-winter-1')?.start,'2027-12-24');
 assert.equal(source.items.find(e=>e.key==='school-summer')?.start,'2028-06-16');
 assert.equal(source.items.find(e=>e.key==='school-summer')?.end,'2028-08-31');
 assert.equal(parseCalendarText(article(2026),2027,'https://ucenici.com/old.pdf','old').items.length,0);
 const beginning=parseCalendarText(article(2027)+' Nastava u školskoj godini 2027/2028 počinje u ponedjeljak, 6. rujna 2027.',2027,'https://ucenici.com/calendar','calendar');assert.equal(beginning.items.find(e=>e.key==='school-summer-initial')?.end,'2027-09-05');
 const withAutumn=parseCalendarText(article(2027)+' Jesenski odmor traje od 29. listopada 2027. do 2. studenoga 2027.',2027,'https://ucenici.com/calendar','calendar');assert.equal(withAutumn.items.find(e=>e.holidayType==='AUTUMN')?.start,'2027-10-29');
 assert.equal(readSourceDate('28.6.1.2027.',2026),null);assert.equal(readSourceDate('31.2.2028.',2027),null);
});
test('source retrieval finds the requested year instead of guessing a PDF URL',async()=>{
 const original=globalThis.fetch;const urls:string[]=[];
 globalThis.fetch=(async(input:any)=>{const url=String(input);urls.push(url);
  if(url.includes('wp-json'))return new Response(JSON.stringify([{title:'Školski kalendar 2029./2030.',url:'https://ucenici.com/skolski-kalendar-2029-2030/'}]));
  return new Response(`<article><h1>Školski kalendar 2029./2030.</h1><p>${article(2029)}</p></article>`);
 }) as typeof fetch;
 try{const source=await fetchYearCalendar(2029);assert.equal(source.status,'PUBLISHED');assert.equal(source.year,2029);assert.equal(source.items.find(e=>e.holidayType==='WINTER_1')?.start,'2029-12-24');assert.equal(urls.length,2);}finally{globalThis.fetch=original;}
});
test('missing calendar and source outage never invent school-break dates',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=(async()=>new Response('[]')) as typeof fetch;
  const waiting=await fetchYearCalendar(2031);assert.equal(waiting.status,'WAITING');assert.deepEqual(waiting.items,[]);
  globalThis.fetch=(async()=>{throw new Error('offline');}) as typeof fetch;
  const offline=await fetchYearCalendar(2032);assert.equal(offline.status,'UNAVAILABLE');assert.deepEqual(offline.items,[]);
 }finally{globalThis.fetch=original;}
});
test('source URLs cannot redirect extraction to another host or insecure origin',()=>{
 for(const url of ['http://ucenici.com/a','https://evil.example/a','https://ucenici.com.evil.example/a','https://name:pass@ucenici.com/a','https://ucenici.com:444/a'])assert.throws(()=>allowedCalendarUrl(url));
 assert.equal(allowedCalendarUrl('/wp-content/calendar.pdf').hostname,'ucenici.com');
});
test('import IDs are repeatable and isolated by school and year',()=>{
 const source=uploadedCalendar2026(),a=automaticCalendarRows('A',source),b=automaticCalendarRows('B',source);
 assert.equal(a.length,24);assert.deepEqual(a.map(r=>r.id),automaticCalendarRows('A',source).map(r=>r.id));
 assert.equal(a.some(r=>b.some(s=>s.id===r.id)),false);assert.equal(calendarMeta(a[0]).kind,'AUTO');
});
test('calendar access respects active school membership and global scope',()=>{
 assert.equal(calendarScope({role:'ADMIN'},[{school_id:'A',role:'ADMIN',status:'ACTIVE'}],'B').admin,false);
 assert.equal(calendarScope({},[{school_id:'A',role:'TEACHER',status:'INACTIVE'}],'A').read,false);
 assert.equal(calendarScope({},[{school_id:'A',role:'STUDENT',status:'ACTIVE'}],'A').staff,false);
 assert.equal(calendarScope({role:'MAIN_ADMIN'},[],'A').admin,true);
});
test('school events validate ranges and preserve explicit instructional days',()=>{
 const row=validateSchoolEvent({title:'Dan škole',type:'DAN_SKOLE',start_date:'2027-05-10',end_date:'2027-05-12',is_instructional_day:true,notes:'Izložba'},'A','teacher');
 assert.equal(row.school_id,'A');assert.equal(row.is_instructional_day,true);assert.equal(calendarMeta(row).kind,'CUSTOM');
 assert.equal(validateSchoolEvent({...row,event_type:'NENASTAVNI_DAN',is_instructional_day:true},'A','teacher').is_instructional_day,false);
 assert.throws(()=>validateSchoolEvent({...row,end_date:'2027-05-01'},'A','teacher'));
 assert.throws(()=>validateSchoolEvent({...row,start_date:'2027-02-30'},'A','teacher'));
 assert.equal(schoolYearForDate('2027-08-31'),2026);assert.equal(schoolYearForDate('2027-09-01'),2027);
 assert.equal(calendarYear('2027./2028.'),2027);assert.throws(()=>calendarYear('2027/2029'));
});
