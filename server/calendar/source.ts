import { extractText } from 'unpdf';
import { addDays, format, parseISO } from 'date-fns';
import { calendarYearLabel, validCalendarDate, uploadedCalendar2026, type CalendarItem, type CalendarSource } from '../../src/lib/schoolCalendar.js';

const hosts = new Set(['ucenici.com','www.ucenici.com']);
export function allowedCalendarUrl(value: string, base = 'https://ucenici.com'): URL {
  const url = new URL(value,base);
  if(url.protocol!=='https:' || !hosts.has(url.hostname) || url.username || url.password || (url.port && url.port!=='443')) throw new Error('Nedopušten izvor kalendara.');
  return url;
}
export const plainText = (html: string) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#0*([0-9]+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/\s+/g,' ').trim();
const normalized = (value: string) => plainText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const hasCalendarYear = (text: string, year: number) => new RegExp(`${year}\\s*[./–—\\s-]+${year+1}(?!\\d)`).test(text);
const months = ['sijecnja','veljace','ozujka','travnja','svibnja','lipnja','srpnja','kolovoza','rujna','listopada','studenoga','prosinca'];
export function readSourceDate(text: string, year: number): string | null {
  const value = normalized(text);
  const m = value.match(/^(\d{1,2})\s*\.\s*(?:(\d{1,2})\s*\.|(sijecnja|veljace|ozujka|travnja|svibnja|lipnja|srpnja|kolovoza|rujna|listopada|studenoga|studenog|prosinca))\s*(\d{4})?\s*\.?/);
  if(!m || /^[\d.]/.test(value.slice(m[0].length))) return null;
  const month = m[2] ? Number(m[2]) : m[3]==='studenog' ? 11 : months.indexOf(m[3])+1;
  const resolvedYear = m[4] ? Number(m[4]) : month>=9 ? year : year+1;
  const date = `${resolvedYear}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
  return validCalendarDate(date) && date>=`${year}-09-01` && date<=`${year+1}-08-31` ? date : null;
}

function firstSourceDate(text:string,year:number) {
  const match=normalized(text).match(/\b\d{1,2}\s*\.\s*(?:\d{1,2}\s*\.|sijecnja|veljace|ozujka|travnja|svibnja|lipnja|srpnja|kolovoza|rujna|listopada|studenoga|studenog|prosinca)/);
  return match?readSourceDate(normalized(text).slice(match.index),year):null;
}

export function parseCalendarText(text: string, year: number, url: string, title: string): CalendarSource {
  const checkedAt = new Date().toISOString();
  const result: CalendarSource = {year,url,title,checkedAt,status:'REVIEW_REQUIRED',notes:[],items:[]};
  if(!hasCalendarYear(plainText(text).slice(0,1200),year)) {result.notes.push('Izvor ne potvrđuje traženu školsku godinu.');return result;}
  const value=normalized(text);
  const pattern=/(?:(prvi\s+dio|drugi\s+dio|1\.\s*dio|2\.\s*dio)\s+)?(zimsk[a-z]*|zimsih|proljetn[a-z]*|uskrsn[a-z]*|ljetn[a-z]*|jesensk[a-z]*)\s+(?:odmor[a-z]*|praznik[a-z]*)/g;
  const labels=[...value.matchAll(pattern)]; let malformed=false;
  for(let i=0;i<labels.length;i++) {
    const label=labels[i];const segment=value.slice(label.index!+label[0].length,Math.min(labels[i+1]?.index??value.length,label.index!+350));
    const range=segment.match(/\bod\s+(.+?)\s+do\s+([\s\S]+)/);
    if(!range) continue;
    const start=readSourceDate(range[1],year),end=readSourceDate(range[2],year);
    if(!start||!end||end<start||(+parseISO(end)-+parseISO(start))/86400000>100){malformed=true;continue;}
    const kind=label[2].startsWith('zim') ? (/drugi|2\./.test(label[1]||'')?'WINTER_2':'WINTER_1') : label[2].startsWith('ljet')?'SUMMER':label[2].startsWith('jesen')?'AUTUMN':'SPRING';
    const key=kind==='WINTER_1'?'school-winter-1':kind==='WINTER_2'?'school-winter-2':kind==='SPRING'?'school-spring':kind==='AUTUMN'?'school-autumn':'school-summer';
    const item:CalendarItem={key,title:kind==='WINTER_1'?'Zimski praznici — 1. dio':kind==='WINTER_2'?'Zimski praznici — 2. dio':kind==='SPRING'?'Proljetni / uskrsni praznici':kind==='AUTUMN'?'Jesenski praznici':'Ljetni praznici',start,end,type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:kind};
    const existing=result.items.find(x=>x.key===key);
    if(existing&&(existing.start!==start||existing.end!==end)){malformed=true;continue;}
    if(!existing)result.items.push(item);
  }
  if (!result.items.some(x => x.holidayType === 'SUMMER')) {
    const explicit = value.match(/ljetn[a-z]*\s+(?:odmor[a-z]*|praznik[a-z]*)[\s\S]{0,80}?(?:zapocinje|pocinje)\s+([^;]{0,80})/);
    const teachingEnd = value.match(/(?:nastav[a-z]*|nastavna\s+godina)\s+zavrsava\s+([^;]{0,80})/);
    let start = explicit ? firstSourceDate(explicit[1], year) : null;
    if (!start && teachingEnd) { const end = firstSourceDate(teachingEnd[1], year); if (end) start = format(addDays(parseISO(end),1),'yyyy-MM-dd'); }
    if (start && start >= `${year+1}-06-01` && start <= `${year+1}-08-31`) {
      result.items.push({key:'school-summer',title:'Ljetni praznici (do kraja školske godine)',start,end:`${year+1}-08-31`,type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'SUMMER'});
      result.notes.push('Ljetni odmor prikazan je do 31. kolovoza, unutar odabrane školske godine; početak nastave sljedeće godine određuje se iz njezina zasebnog kalendara.');
    }
  }
  if(malformed||!result.items.some(x=>x.holidayType==='WINTER_1')||!result.items.some(x=>x.holidayType==='SPRING')||!result.items.some(x=>x.holidayType==='SUMMER')) {
    result.items=[];result.notes.push('Datumi školskih odmora nisu dovoljno jasni ili potpuni za automatski unos. Potreban je pregled izvora.');return result;
  }
  const teachingStart=value.match(/nastav[a-z]*(?:\s+u\s+skolskoj\s+godini\s+[\d/.,\s]+)?\s+(?:pocinje|zapocinje)\s+([^;]{0,110})/);
  const firstDay=teachingStart?firstSourceDate(teachingStart[1],year):null;
  if(firstDay&&firstDay>=`${year}-09-01`&&firstDay<=`${year}-10-15`){
    result.items.push({key:'school-start',title:'Početak nastave',start:firstDay,end:firstDay,type:'DOGAĐAJ',instructional:true});
    if(firstDay>`${year}-09-01`)result.items.push({key:'school-summer-initial',title:'Ljetni odmor prije početka nastave',start:`${year}-09-01`,end:format(addDays(parseISO(firstDay),-1),'yyyy-MM-dd'),type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'SUMMER'});
  }
  result.status=/prijedlog|predloz|nacrt/.test(normalized(title+' '+url+' '+text.slice(0,1000)))?'PROPOSAL':'PUBLISHED';
  if(result.status==='PROPOSAL')result.notes.push('Izvor je označen kao prijedlog. Datume treba provjeriti nakon objave konačne odluke.');
  result.notes.push('Datumi su preuzeti s portala ucenici.com. Škola provjerava primjenjivost i iznimke za ispite, praksu i završne razrede.');
  return result;
}

async function readRemote(value: string, pdf = false, deadline?: AbortSignal): Promise<{url:string;body:Uint8Array}> {
  let url=allowedCalendarUrl(value);const signal=deadline?AbortSignal.any([AbortSignal.timeout(6500),deadline]):AbortSignal.timeout(6500);
  for(let n=0;n<5;n++) {
    const response=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'e-Dnevnik school-calendar/1.0','Accept':pdf?'application/pdf':'application/json,text/html'}});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');if(!next)throw new Error('Missing redirect');await response.body?.cancel();url=allowedCalendarUrl(next,url.href);continue;}
    if(!response.ok)throw new Error('Calendar source unavailable');
    const limit=pdf?8_000_000:2_000_000;if(Number(response.headers.get('content-length')||0)>limit)throw new Error('Source too large');
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty source');const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Source too large');}chunks.push(value);}
    const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return {url:url.href,body};
  }
  throw new Error('Too many redirects');
}
const cache=new Map<number,{expires:number;source:CalendarSource}>();
async function loadYearCalendar(year: number, force = false): Promise<CalendarSource> {
  const hit=cache.get(year);if(!force&&hit&&hit.expires>Date.now())return hit.source;
  // The supplied PDF is an explicit source for this year; future years are discovered independently.
  if(year===2026&&!force)return uploadedCalendar2026();
  const pending:CalendarSource={year,status:'WAITING',url:'https://ucenici.com/',title:`Školski kalendar ${calendarYearLabel(year)}`,checkedAt:new Date().toISOString(),notes:['Odgovarajući školski kalendar još nije pronađen. Blagdani su popunjeni, a školski praznici čekaju objavu i provjeru izvora.'],items:[]};
  const deadline=AbortSignal.timeout(20_000);
  try {
    let candidates:{url:string;title:string}[]=[];
    try {
      const search=await readRemote(`https://ucenici.com/wp-json/wp/v2/search?search=${encodeURIComponent('školski kalendar '+year+' '+(year+1))}&per_page=20`,false,deadline);
      const data=JSON.parse(new TextDecoder().decode(search.body));
      if(Array.isArray(data))candidates=data.filter(x=>typeof x.url==='string'&&typeof x.title==='string'&&hasCalendarYear(plainText(x.title),year)&&/kalendar/i.test(plainText(x.title))).map(x=>({url:allowedCalendarUrl(x.url).href,title:plainText(x.title)}));
    } catch { /* A WordPress installation may disable the REST search API. */ }
    if(!candidates.length){
      const search=await readRemote(`https://ucenici.com/?s=${encodeURIComponent('školski kalendar '+year+' '+(year+1))}`,false,deadline);
      const html=new TextDecoder().decode(search.body);
      candidates=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].filter(m=>hasCalendarYear(plainText(m[2]),year)&&/kalendar/i.test(plainText(m[2]))).slice(0,3).map(m=>({url:allowedCalendarUrl(m[1],search.url).href,title:plainText(m[2])}));
    }
    let review:CalendarSource|undefined;
    for(const candidate of candidates.slice(0,2)){
      const page=await readRemote(candidate.url,false,deadline);const html=new TextDecoder().decode(page.body);
      const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
      const heading=plainText(article.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||candidate.title);
      if(!hasCalendarYear(heading,year))continue;
      const links=[...article.matchAll(/(?:href|src)=["']([^"']+\.pdf(?:[?#][^"']*)?)["']/gi)].map(m=>allowedCalendarUrl(m[1].replace(/&amp;/g,'&'),page.url).href);
      for(const pdfUrl of [...new Set(links)].slice(0,2)){
        const pdf=await readRemote(pdfUrl,true,deadline);const extracted=await extractText(pdf.body,{mergePages:true});
        const parsed=parseCalendarText(Array.isArray(extracted.text)?extracted.text.join(' '):extracted.text,year,pdf.url,heading);
        if(parsed.status!=='REVIEW_REQUIRED'){cache.set(year,{expires:Date.now()+6*3600000,source:parsed});return parsed;}review=parsed;
      }
      const parsed=parseCalendarText(plainText(article),year,page.url,heading);
      if(parsed.status!=='REVIEW_REQUIRED'){cache.set(year,{expires:Date.now()+6*3600000,source:parsed});return parsed;}review=parsed;
    }
    if(review)Object.assign(pending,review);
  } catch {
    pending.status='UNAVAILABLE';pending.notes=['Izvor ucenici.com trenutačno nije dostupan. Već uvezeni praznici i školski događaji ostaju sačuvani; dohvat će se ponoviti pri sljedećem otvaranju.'];
  }
  if(cache.size>20)cache.delete(cache.keys().next().value!);
  cache.set(year,{expires:Date.now()+15*60000,source:pending});return pending;
}

const inFlight=new Map<number,Promise<CalendarSource>>();
export function fetchYearCalendar(year:number,force=false):Promise<CalendarSource> {
  const active=inFlight.get(year);if(active)return active;
  const promise=loadYearCalendar(year,force).finally(()=>inFlight.delete(year));inFlight.set(year,promise);return promise;
}
