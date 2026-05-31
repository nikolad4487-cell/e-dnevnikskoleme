import { Monitor, Clock } from 'lucide-react';
import { cn, formatPersonName } from '../lib/utils';

export function ScheduleGrid({ title, shift, periods, days, onCellClick, getCellSubjects, allSubjects, teachers }: any) {
  return (
    <div className="bg-white border border-gray-300">
      <div className="bg-[#f8f9fa] p-2 border-b border-gray-300">
        <h4 className="text-[11px] font-bold text-[#005c8d] uppercase tracking-tight flex items-center gap-2">
          {shift === 'MORNING' ? <Monitor size={12}/> : <Clock size={12}/>}
          {title}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300">
              <th className="w-20 border-r border-gray-300 bg-gray-100"></th>
              {periods.map((p: number) => (
                <th key={p} className="p-2 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-300 last:border-r-0">
                  {p}. sat
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day: string) => (
              <tr key={day} className="border-b border-gray-300 last:border-b-0">
                <td className="bg-gray-100 border-r border-gray-300 p-2 text-center align-middle font-bold text-[10px] text-gray-500 uppercase">
                   {day}
                </td>
                {periods.map((period: number) => {
                  const subjects = getCellSubjects(day, shift, period);
                  return (
                    <td 
                      key={`${day}-${period}`} 
                      onClick={() => onCellClick && onCellClick(day, period)}
                      className={cn(
                        "p-1 border-r border-gray-300 last:border-r-0 text-[10px] h-20 align-top",
                        onCellClick ? "cursor-pointer hover:bg-[#f0f9ff]" : ""
                      )}
                    >
                       <div className="flex flex-col gap-1">
                         {subjects.map((s: any) => {
                            const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                            const tea = teachers.find((t: any) => t.id === s.teacherId);
                            return (
                              <div key={s.id} className="bg-white border border-gray-200 p-1">
                                <div className="font-bold text-[#005c8d] uppercase leading-tight">{sub?.name || 'Nepoznat predmet'}</div>
                                <div className="text-[8px] text-gray-400 font-bold uppercase">{tea ? formatPersonName(tea) : '—'} {s.classroom && `• ${s.classroom}`}</div>
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
