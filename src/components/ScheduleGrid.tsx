import React from 'react';
import { Monitor, Clock } from 'lucide-react';
import { cn, formatPersonName, formatSubjectName } from '../lib/utils';

interface ScheduleGridProps {
  title: string;
  shift: 'MORNING' | 'AFTERNOON';
  periods: number[];
  days: string[];
  onCellClick?: (day: string, period: number) => void;
  getCellSubjects: (day: string, shift: 'MORNING' | 'AFTERNOON', period: number) => any[];
  allSubjects: any[];
  teachers: any[];
  readOnly?: boolean;
  showTeachers?: boolean;
}

export function ScheduleGrid({
  title,
  shift,
  periods,
  days,
  onCellClick,
  getCellSubjects,
  allSubjects,
  teachers,
  readOnly = true,
  showTeachers = false
}: ScheduleGridProps) {
  // Determine current day of week to highlight on mobile
  const dayIndex = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayLabels = ['NED', 'PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB'];
  const defaultDay = days.includes(dayLabels[dayIndex]) ? dayLabels[dayIndex] : (days[0] || 'PON');
  
  const [activeDay, setActiveDay] = React.useState(defaultDay);

  return (
    <div className="bg-white border border-gray-300">
      <div className="bg-[#f8f9fa] p-2 border-b border-gray-300 flex items-center justify-between">
        <h4 className="text-[11px] font-bold text-[#005c8d] uppercase tracking-tight flex items-center gap-2">
          {shift === 'MORNING' ? <Monitor size={12}/> : <Clock size={12}/>}
          {title}
        </h4>
        <span className="md:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 rounded px-1.5 py-0.5">
          Dan: {activeDay}
        </span>
      </div>

      {/* Mobile Day Selector Tabs */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto p-2 bg-slate-50 border-b border-gray-200">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setActiveDay(day)}
            className={cn(
              "px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-full border transition-all shrink-0 cursor-pointer select-none",
              activeDay === day
                ? "bg-[#005c8d] text-white border-[#005c8d]"
                : "bg-white text-slate-600 border-slate-200 active:bg-slate-50"
            )}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Mobile Day Schedule Cards */}
      <div className="md:hidden p-3 space-y-2">
        {periods.map((period) => {
          const cellSubjects = getCellSubjects(activeDay, shift, period);
          return (
            <div
              key={period}
              onClick={() => !readOnly && onCellClick && onCellClick(activeDay, period)}
              className={cn(
                "p-3 bg-white border border-slate-200 rounded-lg shadow-xs flex items-center justify-between min-h-[54px] select-none",
                (!readOnly && onCellClick) ? "cursor-pointer active:bg-slate-50 border-sky-200" : ""
              )}
            >
              <div className="flex items-center gap-3">
                <span className="w-12 text-center text-[10px] font-black uppercase text-slate-400 bg-slate-50 rounded py-1 px-1 border border-slate-100 shrink-0">
                  {period}. sat
                </span>
                <div className="space-y-1">
                  {cellSubjects.map((s: any) => {
                    const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                    const tea = teachers.find((t: any) => t.id === s.teacherId);
                    return (
                      <div key={s.id} className="space-y-0.5">
                        <div className="font-bold text-sm text-[#005c8d] uppercase leading-none">
                          {formatSubjectName(sub)}
                        </div>
                        {showTeachers && tea && (
                          <div className="text-[10px] text-gray-500 font-medium">
                            {formatPersonName(tea)}
                          </div>
                        )}
                        {s.classroom && (
                          <span className="text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 inline-block mt-0.5">
                            Učionica: {s.classroom}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {cellSubjects.length === 0 && (
                    <span className="text-xs text-slate-300 italic font-medium">Slobodan sat</span>
                  )}
                </div>
              </div>
              {!readOnly && onCellClick && (
                <span className="text-[9px] font-black uppercase text-sky-600">Uredi</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Grid Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300">
              <th className="w-20 border-r border-gray-300 bg-gray-100 p-2 text-[10px] font-bold text-gray-500 uppercase">Sat</th>
              {days.map((day: any) => (
                <th key={day} className="p-2 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-300 last:border-r-0">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period: any) => (
              <tr key={period} className="border-b border-gray-300 last:border-b-0">
                <td className="bg-gray-100 border-r border-gray-300 p-2 text-center align-middle font-bold text-[10px] text-gray-500 uppercase">
                  {period}. sat
                </td>
                {days.map((day: any) => {
                  const subjects = getCellSubjects(day, shift, period);
                  return (
                    <td 
                      key={`${day}-${period}`} 
                      onClick={() => !readOnly && onCellClick && onCellClick(day, period)}
                      className={cn(
                        "p-1 border-r border-gray-300 last:border-r-0 text-[10px] h-20 align-top",
                        (!readOnly && onCellClick) ? "cursor-pointer hover:bg-[#f0f9ff]" : ""
                      )}
                    >
                       <div className="flex flex-col gap-1">
                          {subjects.map((s: any) => {
                             const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                             const tea = teachers.find((t: any) => t.id === s.teacherId);
                             return (
                               <div key={s.id} className="bg-white border border-gray-200 p-1 rounded-lg text-center shadow-xs">
                                 <div className="font-bold text-[#005c8d] uppercase leading-tight">{formatSubjectName(sub)}</div>
                                 {s.classroom && <div className="text-[8px] font-black text-gray-400 bg-gray-100 rounded inline-block px-1 mt-0.5">Uč: {s.classroom}</div>}
                               </div>
                             );
                          })}
                          {subjects.length === 0 && (
                             <div className="text-center py-4 text-gray-100 italic font-bold uppercase text-[8px]">--</div>
                          )}
                       </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
