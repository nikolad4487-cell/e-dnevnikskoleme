export interface CroatianPublicHoliday {
  id: string;
  date: string;
  title: string;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getCroatianPublicHolidays(year: number): CroatianPublicHoliday[] {
  const easterSunday = getEasterSunday(year);
  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);

  const corpusChristi = new Date(easterSunday);
  corpusChristi.setDate(corpusChristi.getDate() + 60);

  return [
    {
      id: `public-holiday-${year}-new-year`,
      date: `${year}-01-01`,
      title: 'Nova godina',
    },
    {
      id: `public-holiday-${year}-epiphany`,
      date: `${year}-01-06`,
      title: 'Bogojavljenje ili Sveta tri kralja',
    },
    {
      id: `public-holiday-${year}-easter`,
      date: formatDate(easterSunday),
      title: 'Uskrs',
    },
    {
      id: `public-holiday-${year}-easter-monday`,
      date: formatDate(easterMonday),
      title: 'Uskrsni ponedjeljak',
    },
    {
      id: `public-holiday-${year}-labour-day`,
      date: `${year}-05-01`,
      title: 'Praznik rada',
    },
    {
      id: `public-holiday-${year}-statehood-day`,
      date: `${year}-05-30`,
      title: 'Dan državnosti',
    },
    {
      id: `public-holiday-${year}-corpus-christi`,
      date: formatDate(corpusChristi),
      title: 'Tijelovo',
    },
    {
      id: `public-holiday-${year}-anti-fascist-struggle-day`,
      date: `${year}-06-22`,
      title: 'Dan antifašističke borbe',
    },
    {
      id: `public-holiday-${year}-victory-day`,
      date: `${year}-08-05`,
      title: 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja',
    },
    {
      id: `public-holiday-${year}-assumption`,
      date: `${year}-08-15`,
      title: 'Velika Gospa',
    },
    {
      id: `public-holiday-${year}-all-saints-day`,
      date: `${year}-11-01`,
      title: 'Svi sveti',
    },
    {
      id: `public-holiday-${year}-remembrance-day`,
      date: `${year}-11-18`,
      title: 'Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje',
    },
    {
      id: `public-holiday-${year}-christmas`,
      date: `${year}-12-25`,
      title: 'Božić',
    },
    {
      id: `public-holiday-${year}-saint-stephen`,
      date: `${year}-12-26`,
      title: 'Sveti Stjepan',
    },
  ];
}
