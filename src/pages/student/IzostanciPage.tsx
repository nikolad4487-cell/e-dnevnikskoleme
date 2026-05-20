import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Absence, AbsenceStatus, Role, Subject } from '../../types';
import { cn, formatPersonName, formatSubjectDisplayName } from '../../lib/utils';
import { Calendar as CalendarIcon, UserX, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';

interface AbsenceWithDetails extends Absence {
  lessonTopic?: string;
  subjectName?: string;
}

const CROATIAN_MONTHS = [
  'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
  'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
];

const DAYS_OF_WEEK = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

export default function IzostanciPage() {
  const { user } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [absences, setAbsences] = useState<AbsenceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !selectedClassId) return;

    const fetchAbsencesData = async () => {
      setLoading(true);
      try {
        const isParent = user.globalRole === Role.PARENT;
        const targetStudentId = isParent ? selectedChildId : user.id;

        if (!targetStudentId) {
          setLoading(false);
          return;
        }

        // 1. Fetch Absences
        const { data: absencesData, error: absError } = await supabase
          .from('absences')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId)
          .order('date', { ascending: false });

        if (absError) throw absError;

        const rawAbsences = absencesData || [];

        // 2. Fetch linked Lessons & Subjects details to show subject and topics of the absence
        const lessonIds = [...new Set(rawAbsences.map(a => a.lesson_id).filter(Boolean))];

        let lessonsMap = new Map<string, { topic: string, subjectId: string }>();
        let subjectsMap = new Map<string, string>();

        if (lessonIds.length > 0) {
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('id, topic, subject_id')
            .in('id', lessonIds);

          (lessonsData || []).forEach(l => {
            lessonsMap.set(l.id, { topic: l.topic, subjectId: l.subject_id });
          });

          const subjectIds = [...new Set((lessonsData || []).map(l => l.subject_id))];
          if (subjectIds.length > 0) {
            const { data: subjectsData } = await supabase
              .from('subjects')
              .select('id, name')
              .in('id', subjectIds);
            
            (subjectsData || []).forEach(s => {
              subjectsMap.set(s.id, s.name);
            });
          }
        }

        const enrichedAbsences: AbsenceWithDetails[] = rawAbsences.map(abs => {
          const lesson = abs.lesson_id ? lessonsMap.get(abs.lesson_id) : null;
          const subjectName = lesson ? subjectsMap.get(lesson.subjectId) : undefined;

          return {
            id: abs.id,
            studentId: abs.student_id,
            lessonId: abs.lesson_id,
            classId: abs.class_id,
            date: abs.date,
            hour: abs.hour,
            status: abs.status as AbsenceStatus,
            note: abs.note,
            teacherId: abs.teacher_id,
            lessonTopic: lesson?.topic,
            subjectName: subjectName,
          };
        });

        setAbsences(enrichedAbsences);
      } catch (error) {
        console.error('Greška pri učitavanju izostanaka:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAbsencesData();
  }, [user, selectedClassId, selectedChildId]);

  // Normalize status helper
  const getStatusType = (statusValue: string) => {
    const s = String(statusValue || '').toUpperCase();
    if (s === 'OPRAVDANO') return 'OPRAVDANO';
    if (s === 'NEOPRAVDANO') return 'NEOPRAVDANO';
    if (s === 'CEKA' || s === 'PENDING' || s === 'ČEKA') return 'CEKA';
    return 'OSTALO';
  };

  // Stats calculation
  const stats = {
    total: absences.length,
    justified: absences.filter(a => getStatusType(a.status) === 'OPRAVDANO').length,
    unjustified: absences.filter(a => getStatusType(a.status) === 'NEOPRAVDANO').length,
    pending: absences.filter(a => getStatusType(a.status) === 'CEKA').length,
    other: absences.filter(a => getStatusType(a.status) === 'OSTALO').length,
  };

  // Calendar parameters
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  // Adjust starting day to European format where index 0 = Monday, 6 = Sunday
  const euroFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDayStr(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDayStr(null);
  };

  // Map of date string 'YYYY-MM-DD' of absences in currently displayed month
  const absencesByDate: Record<string, AbsenceWithDetails[]> = {};
  absences.forEach(abs => {
    const absDateStr = abs.date; // assuming standard 'YYYY-MM-DD' format
    if (!absencesByDate[absDateStr]) {
      absencesByDate[absDateStr] = [];
    }
    absencesByDate[absDateStr].push(abs);
  });

  // Filter actual absences details to display
  // We show either of the selected day, or the entire active month
  const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  const displayedAbsences = absences.filter(abs => {
    if (selectedDayStr) {
      return abs.date === selectedDayStr;
    } else {
      // Show absences inside the current month
      return abs.date.startsWith(currentMonthStr);
    }
  });

  const getStatusBadgeStyles = (statusVal: string) => {
    const norm = getStatusType(statusVal);
    if (norm === 'OPRAVDANO') return 'bg-green-50 text-green-700 border-green-200';
    if (norm === 'NEOPRAVDANO') return 'bg-red-50 text-red-700 border-red-200';
    if (norm === 'CEKA') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getStatusDotColor = (absencesList: AbsenceWithDetails[]) => {
    if (absencesList.some(a => getStatusType(a.status) === 'NEOPRAVDANO')) return 'bg-red-500';
    if (absencesList.some(a => getStatusType(a.status) === 'CEKA')) return 'bg-amber-500';
    if (absencesList.some(a => getStatusType(a.status) === 'OPRAVDANO')) return 'bg-green-500';
    return 'bg-gray-400';
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
      {/* Title Header */}
      <div className="bg-white border-b border-gray-200 p-4 md:px-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#005c8d] flex items-center justify-center">
          <UserX size={18} />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase text-gray-800 tracking-wide">
            Pregled izostanaka učenika
          </h2>
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Izostanci, zakašnjenja i opravdanja po mjesecima i satima</p>
        </div>
      </div>

      {/* Grid Summary Stats */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 bg-white border-b border-gray-200 shadow-xs flex-shrink-0">
        <div className="border border-slate-200 p-3 bg-slate-50/50">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ukupno sati</div>
          <div className="text-xl font-bold text-slate-700 mt-1">{stats.total}</div>
        </div>
        <div className="border border-green-100 p-3 bg-green-50/20">
          <div className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Opravdano</div>
          <div className="text-xl font-bold text-green-600 mt-1">{stats.justified}</div>
        </div>
        <div className="border border-red-100 p-3 bg-red-50/20">
          <div className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Neopravdano</div>
          <div className="text-xl font-bold text-red-600 mt-1">{stats.unjustified}</div>
        </div>
        <div className="border border-amber-100 p-3 bg-amber-50/20">
          <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Čeka provjeru</div>
          <div className="text-xl font-bold text-amber-600 mt-1">{stats.pending}</div>
        </div>
        <div className="border border-slate-200 p-3 bg-slate-100/20">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ostalo</div>
          <div className="text-xl font-bold text-slate-500 mt-1">{stats.other}</div>
        </div>
      </div>

      {/* Main Container - Split View */}
      <div className="flex-1 overflow-auto p-4 flex flex-col lg:flex-row gap-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-bold uppercase text-xs tracking-widest py-10">
            Učitavanje povijesti izostanaka...
          </div>
        ) : (
          <>
            {/* Left Box: Monthly Calendar */}
            <div className="bg-white border border-gray-300 p-4 shadow-sm flex-1 lg:max-w-md h-fit">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                <button
                  onClick={prevMonth}
                  className="p-1.5 hover:bg-slate-100 text-gray-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <ChevronLeft size={16} />
                </button>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  {CROATIAN_MONTHS[month]} {year}.
                </h3>
                <button
                  onClick={nextMonth}
                  className="p-1.5 hover:bg-slate-100 text-gray-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                {DAYS_OF_WEEK.map(day => (
                  <span key={day} className="py-1">{day}</span>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1.5 text-xs">
                {/* Pad first week prefix */}
                {Array.from({ length: euroFirstDayIndex }).map((_, index) => (
                  <div key={`empty-${index}`} className="p-2 border border-transparent"></div>
                ))}

                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const dayNum = index + 1;
                  const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayAbsences = absencesByDate[dateString] || [];
                  const isToday = new Date().toISOString().split('T')[0] === dateString;
                  const isSelected = selectedDayStr === dateString;

                  return (
                    <button
                      key={`day-${dayNum}`}
                      onClick={() => {
                        if (dayAbsences.length > 0) {
                          setSelectedDayStr(isSelected ? null : dateString);
                        } else {
                          setSelectedDayStr(null);
                        }
                      }}
                      className={cn(
                        "p-2.5 h-11 border transition-all text-center flex flex-col justify-between items-center relative",
                        dayAbsences.length === 0 ? "text-gray-400 border-gray-100" : "text-gray-800 font-bold border-gray-300 cursor-pointer hover:border-[#005c8d]",
                        isToday && "bg-blue-50/50 text-blue-800 ring-1 ring-blue-300",
                        isSelected && "bg-blue-600 text-white! border-blue-600 hover:border-blue-700"
                      )}
                    >
                      <span>{dayNum}</span>
                      {dayAbsences.length > 0 && (
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full mt-0.5 shrink-0",
                          isSelected ? "bg-white" : getStatusDotColor(dayAbsences)
                        )}></span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400 flex items-center gap-4 justify-center">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Opravdano</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> Neopravdano</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> Na provjeri</span>
              </div>
            </div>

            {/* Right Box: Absences List */}
            <div className="bg-white border border-gray-300 p-4 shadow-sm flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3 flex-shrink-0">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  {selectedDayStr ? (
                    <span>Izostanci na dan: {new Date(selectedDayStr).toLocaleDateString('hr-HR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  ) : (
                    <span>Izostanci u {CROATIAN_MONTHS[month]}</span>
                  )}
                </h3>
                {selectedDayStr && (
                  <button
                    onClick={() => setSelectedDayStr(null)}
                    className="text-[10px] font-bold text-blue-600 uppercase hover:underline cursor-pointer"
                  >
                    Prikaži cijeli mjesec
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto space-y-3">
                {displayedAbsences.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 italic text-xs bg-slate-50 border border-slate-200 p-6">
                    {selectedDayStr 
                      ? "Nema unesenih izostanaka za odabrani dan." 
                      : `Nema unesenih izostanaka u mjesecu ${CROATIAN_MONTHS[month].toLowerCase()}.`
                    }
                  </div>
                ) : (
                  displayedAbsences.map(abs => {
                    const normStatus = getStatusType(abs.status);
                    
                    return (
                      <div key={abs.id} className="border border-slate-200 bg-white p-4 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-500 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-700 font-black text-[10px] px-2 py-0.5 rounded leading-none shrink-0 border border-slate-200">
                              {abs.hour ? `${abs.hour}. sat` : 'Nekategorizirano'}
                            </span>
                            <span className="font-bold text-slate-800 text-sm">
                              {abs.subjectName ? abs.subjectName : 'Izostanak / Sat razrednika'}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 font-medium">
                            Datum: {new Date(abs.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>

                          {abs.lessonTopic && (
                            <div className="text-xs text-gray-600 italic">
                              Nastavna tema: "{abs.lessonTopic}"
                            </div>
                          )}

                          {abs.note ? (
                            <div className="text-xs text-red-500/80 font-semibold bg-gray-50 border border-gray-100 p-2 rounded mt-1.5 italic">
                              Razlog / Napomena: "{abs.note}"
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 italic mt-1 bg-gray-50/50 p-2 rounded">
                              Nema upisane napomene o razlogu izostanka.
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                          {normStatus === 'CEKA' && <Clock size={15} className="text-amber-500" />}
                          {normStatus === 'OPRAVDANO' && <CheckCircle2 size={15} className="text-green-500" />}
                          {normStatus === 'NEOPRAVDANO' && <XCircle size={15} className="text-red-500" />}

                          <span className={cn(
                            "font-black uppercase text-[9px] tracking-wide px-2 py-1 rounded border",
                            getStatusBadgeStyles(abs.status)
                          )}>
                            {abs.status || 'NA PROVJERI'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
