import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorkWeek } from '../types';
import { formatSubjectName, getLocalDateISO } from '../lib/utils';
import { buildPlanningSchedule, planningMonday, planningShift, type PlanningScheduleCell, type PlanningScheduleSubject } from '../lib/planningSchedule';

interface Props {
  classId: string;
  date: string;
  initialDate?: string;
  subjectId?: string;
  weeks: WorkWeek[];
  cells: PlanningScheduleCell[];
  assignments: PlanningScheduleSubject[];
  subjects: any[];
  loading: boolean;
  error: boolean;
  onSelectDate: (date: string) => void;
}

export function PlanningWeekSchedule({ classId, date, initialDate, subjectId, weeks, cells, assignments, subjects, loading, error, onSelectDate }: Props) {
  const [anchor, setAnchor] = useState(() => planningMonday(date || initialDate || getLocalDateISO()));
  useEffect(() => { if (date) setAnchor(planningMonday(date)); }, [date]);
  const days = useMemo(() => buildPlanningSchedule(anchor, classId, weeks, cells, assignments), [anchor, classId, weeks, cells, assignments]);
  const moveWeek = (offset: number) => setAnchor(format(addDays(parseISO(anchor), offset * 7), 'yyyy-MM-dd'));
  const selectedSubject = subjects.find(s => s.id === subjectId);
  const hasSubject = days.some(day => day.entries.some(e => e.subjects.some(s => s.subjectId === subjectId)));
  return <section aria-label="Raspored za odabrani tjedan" className="border border-slate-200 rounded bg-slate-50 overflow-hidden">
    <div className="p-3 border-b border-slate-200 space-y-2">
      <h4 className="font-bold text-[#005c8d] text-xs">Raspored za odabrani tjedan</h4>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Prethodni tjedan" onClick={() => moveWeek(-1)} className="p-2 border rounded bg-white hover:bg-sky-50"><ChevronLeft size={16} /></button>
          <span className="font-semibold text-xs" aria-live="polite">{format(parseISO(anchor), 'dd.MM.')} – {format(addDays(parseISO(anchor), 6), 'dd.MM.yyyy.')}</span>
          <button type="button" aria-label="Sljedeći tjedan" onClick={() => moveWeek(1)} className="p-2 border rounded bg-white hover:bg-sky-50"><ChevronRight size={16} /></button>
        </div>
        <label className="text-[11px] text-slate-600">Prikaži tjedan <input type="date" aria-label="Datum u tjednu rasporeda" value={anchor} onChange={e => { if (e.target.value) setAnchor(planningMonday(e.target.value)); }} className="border border-slate-300 rounded p-1.5 bg-white" /></label>
      </div>
      <p className="text-[11px] text-slate-600">{subjectId ? <><span className="inline-block w-2 h-2 bg-sky-600 rounded-full mr-1" />Istaknuto: {selectedSubject ? formatSubjectName(selectedSubject) : 'odabrani predmet'}. </> : 'Odaberite predmet za isticanje njegovih sati. '}Klikom na sat odaberite datum.</p>
    </div>
    {loading ? <p role="status" className="p-4 text-xs text-slate-600">Učitavanje rasporeda…</p> : error ? <p role="alert" className="p-4 text-xs text-red-700">Raspored nije moguće učitati. Datum možete unijeti ručno.</p> : <>
      {days.some((day, index) => (index < 5 || day.entries.length > 0) && (!day.week || !day.shift)) && <p className="px-3 pt-3 text-[11px] text-amber-800">Za dane bez određene smjene prikazane su obje smjene redovnog rasporeda.</p>}
      <div className="overflow-x-auto p-2">
        <div className="grid grid-cols-7 gap-1.5 min-w-[720px]">
          {days.map(day => <div key={day.date} className={`rounded border ${day.date === date ? 'border-sky-600 ring-1 ring-sky-600' : 'border-slate-200'} bg-white`}>
            <div className="p-2 border-b border-slate-100 text-center">
              <div className="font-bold text-[11px] text-slate-700">{day.label}</div>
              <div className="text-[11px] text-slate-500">{format(parseISO(day.date), 'dd.MM.')}</div>
              {day.week && day.shift && <div className="text-[9px] text-slate-500">{day.shift === 'MORNING' ? 'Ujutro' : day.shift === 'AFTERNOON' ? 'Popodne' : 'Cjelodnevna'}</div>}
            </div>
            <div className="p-1 space-y-1">
              {!day.teaching ? <p className="p-2 text-[10px] text-slate-500">Nenastavni dan</p> : day.entries.length === 0 ? <p className="p-2 text-[10px] text-slate-400">Nema sati u rasporedu</p> : day.entries.map(entry => {
                const highlighted = !!subjectId && entry.subjects.some(s => s.subjectId === subjectId);
                return <button type="button" key={entry.id} onClick={() => onSelectDate(day.date)} aria-label={`Odaberi ${format(parseISO(day.date), 'dd.MM.yyyy.')} — ${entry.periodNumber}. sat ${planningShift(entry.shift) === 'AFTERNOON' ? 'popodne' : 'ujutro'}`} className={`block w-full text-left rounded border p-2 text-[10px] hover:ring-2 hover:ring-sky-400 ${highlighted ? 'bg-sky-100 border-sky-500 text-sky-950 font-bold' : 'bg-white border-slate-100 text-slate-600'}`}>
                  <span className="block text-[9px] mb-1">{entry.periodNumber}. sat · {planningShift(entry.shift) === 'AFTERNOON' ? 'popodne' : 'ujutro'}</span>
                  {entry.subjects.map(s => <span key={s.id} className="block break-words">{subjects.some(subject => subject.id === s.subjectId) ? formatSubjectName(subjects.find(subject => subject.id === s.subjectId)) : 'Predmet nije dostupan'}</span>)}
                </button>;
              })}
            </div>
          </div>)}
        </div>
      </div>
      {subjectId && !hasSubject && <p className="px-3 pb-3 text-[11px] text-amber-800">Odabrani predmet nema sati u prikazanom tjednu.</p>}
      <p className="px-3 pb-3 text-[10px] text-slate-500">Promjena prikazanog tjedna ne mijenja datum unosa. Za odabir datuma kliknite sat ili ga unesite u obrazac.</p>
    </>}
  </section>;
}
