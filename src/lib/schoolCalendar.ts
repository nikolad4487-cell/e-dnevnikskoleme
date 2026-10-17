import { addDays, format, isValid, parseISO } from 'date-fns';

export type CalendarStatus = 'PROPOSAL' | 'PUBLISHED' | 'WAITING' | 'REVIEW_REQUIRED' | 'UNAVAILABLE';
export type CalendarItem = { key: string; title: string; start: string; end: string; type: 'PRAZNIK' | 'ŠKOLSKI_PRAZNIK' | 'DOGAĐAJ'; instructional: boolean; holidayType?: string };
export type CalendarSource = { year: number; status: CalendarStatus; url: string; title: string; checkedAt: string; notes: string[]; items: CalendarItem[] };
export function calendarYear(value: unknown): number {
  const match = String(value || '').trim().match(/^(20\d{2}|2100)(?:\.?\s*\/\s*(20\d{2}|2101)\.?)?$/);
  if (!match || (match[2] && Number(match[2]) !== Number(match[1]) + 1)) throw Object.assign(new Error('Neispravna školska godina.'), {status: 400});
  return Number(match[1]);
}
export const calendarYearLabel = (year: number) => `${year}/${year + 1}`;
export const validCalendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && format(parseISO(value), 'yyyy-MM-dd') === value;
export function schoolYearForDate(date: string) {
  if (!validCalendarDate(date)) throw new Error('Neispravan datum.');
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 9 ? year : year - 1;
}
export function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function croatianHolidays(year: number): CalendarItem[] {
  const definitions: [string, string, number, string][] = [
    ['all-saints','Svi sveti',year,'11-01'],['remembrance','Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje',year,'11-18'],
    ['christmas','Božić',year,'12-25'],['st-stephen','Sveti Stjepan',year,'12-26'],['new-year','Nova godina',year+1,'01-01'],['epiphany','Bogojavljenje / Sveta tri kralja',year+1,'01-06'],
    ['labour','Praznik rada',year+1,'05-01'],['statehood','Dan državnosti',year+1,'05-30'],['antifascist','Dan antifašističke borbe',year+1,'06-22'],
    ['victory','Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja',year+1,'08-05'],['assumption','Velika Gospa',year+1,'08-15']
  ];
  const easter = easterSunday(year + 1);
  const fixed = definitions.map(([key,title,y,md]) => ({key:`hr-${key}`,title,start:`${y}-${md}`,end:`${y}-${md}`,type:'PRAZNIK' as const,instructional:false}));
  for (const [key,title,offset] of [['easter','Uskrs',0],['easter-monday','Uskrsni ponedjeljak',1],['corpus-christi','Tijelovo',60]] as const) {
    const date = format(addDays(parseISO(easter),offset),'yyyy-MM-dd'); fixed.push({key:`hr-${key}`,title,start:date,end:date,type:'PRAZNIK',instructional:false});
  }
  return fixed.sort((a,b)=>a.start.localeCompare(b.start));
}
export function uploadedCalendar2026(): CalendarSource {
  return { year:2026,status:'PROPOSAL',url:'/calendars/skolski-kalendar-2026-2027-prijedlog.pdf',title:'ucenici.com — priloženi prijedlog školskog kalendara 2026./2027.',checkedAt:'2026-10-17T00:00:00.000Z',
    notes:['Priloženi dokument je prijedlog, a ne potvrda konačne odluke.','Pogrešan završni datum drugog zimskog odmora u PDF-u ispravljen je na 28. veljače 2027. prema potvrdi korisnika.','Ljetni odmor prikazan je samo unutar odabrane školske godine; iznimke za ispite i praksu škola određuje zasebno.'],
    items:[
      {key:'school-summer-initial',title:'Ljetni odmor prije početka nastave',start:'2026-09-01',end:'2026-09-06',type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'SUMMER'},
      {key:'school-start',title:'Početak nastave',start:'2026-09-07',end:'2026-09-07',type:'DOGAĐAJ',instructional:true},
      {key:'school-first-term-end',title:'Završetak prvog polugodišta',start:'2026-12-23',end:'2026-12-23',type:'DOGAĐAJ',instructional:true},
      {key:'school-winter-1',title:'Zimski praznici — 1. dio',start:'2026-12-24',end:'2027-01-06',type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'WINTER_1'},
      {key:'school-second-term-start',title:'Početak drugog polugodišta',start:'2027-01-07',end:'2027-01-07',type:'DOGAĐAJ',instructional:true},
      {key:'school-winter-2',title:'Zimski praznici — 2. dio',start:'2027-02-20',end:'2027-02-28',type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'WINTER_2'},
      {key:'school-spring',title:'Proljetni / uskrsni praznici',start:'2027-03-25',end:'2027-04-04',type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'SPRING'},
      {key:'school-graduates-end',title:'Završetak nastave za maturante',start:'2027-05-21',end:'2027-05-21',type:'DOGAĐAJ',instructional:true},
      {key:'school-teaching-end',title:'Završetak nastave',start:'2027-06-15',end:'2027-06-15',type:'DOGAĐAJ',instructional:true},
      {key:'school-summer',title:'Ljetni praznici (do kraja školske godine)',start:'2027-06-16',end:'2027-08-31',type:'ŠKOLSKI_PRAZNIK',instructional:false,holidayType:'SUMMER'}
    ]};
}
