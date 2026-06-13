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
  const corpusChristi = getEasterSunday(year);
  corpusChristi.setDate(corpusChristi.getDate() + 60);

  return [
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
      id: `public-holiday-${year}-all-saints-day`,
      date: `${year}-11-01`,
      title: 'Svi sveti',
    },
  ];
}
