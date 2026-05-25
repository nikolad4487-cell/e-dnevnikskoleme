import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, ScheduleCell, ScheduleCellSubject, Role } from '../../types';
import { formatPersonName } from '../../lib/utils';
import { Clock, Monitor, BookOpen } from 'lucide-react';
import { mappers } from '../../lib/mappers';

export default function RasporedPage() {
  const { user } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [classData, setClassData] = useState<Class | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scheduleCells, setScheduleCells] = useState<ScheduleCell[]>([]);
  const [scheduleSubjects, setScheduleSubjects] = useState<ScheduleCellSubject[]>([]);
  const [teacherProfiles, setTeacherProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const isParent = user.globalRole === Role.PARENT;
    const targetId = isParent ? selectedChildId : user.id;
    setTargetStudentId(targetId);
  }, [user, selectedChildId]);

  useEffect(() => {
    if (!targetStudentId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Student Profile with all its DB fields (specifically class_id)
        const { data: sData, error: sError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', targetStudentId)
          .maybeSingle();

        if (sError) {
          console.error("Error fetching student profile:", sError);
        }

        const student = sData || user;
        setStudentData(student);

        // Determine effective classId
        const studentClassId = student?.class_id || student?.classId || selectedClassId;

        if (studentClassId) {
          // Fetch Class info
          const { data: cData } = await supabase
            .from('classes')
            .select('*')
            .eq('id', studentClassId)
            .maybeSingle();
          setClassData(cData as Class);

          // Fetch active school_year_id
          const { data: activeYears } = await supabase
            .from('school_years')
            .select('*')
            .eq('is_active', true);
          const activeYear = activeYears?.[0];
          console.log("ACTIVE YEAR", activeYear);

          // Fetch Schedule Cells for targeting class
          const { data: cellsData } = await supabase
            .from('schedule_cells')
            .select('*')
            .eq('class_id', studentClassId);
          const cells = (cellsData || []).map(row => mappers.scheduleCell(row));
          setScheduleCells(cells);

          if (cells.length > 0) {
            const cellIds = cells.map(c => c.id);
            const { data: subjsData } = await supabase
              .from('schedule_cell_subjects')
              .select('*')
              .in('schedule_cell_id', cellIds);
            const mappedSubjects = (subjsData || []).map(row => mappers.scheduleCellSubject(row));
            setScheduleSubjects(mappedSubjects);

            // Fetch Teacher names for those subjects
            const teacherIds = [...new Set(mappedSubjects.map(s => s.teacherId).filter(Boolean))];
            if (teacherIds.length > 0) {
              const { data: tProfiles } = await supabase
                .from('user_profiles')
                .select('*')
                .in('id', teacherIds);
              setTeacherProfiles(tProfiles || []);
            }
          } else {
            setScheduleSubjects([]);
            setTeacherProfiles([]);
          }
        }

        // Fetch Subjects mapping table for subject names
        const { data: subData } = await supabase.from('subjects').select('*');
        setSubjects((subData || []).map(row => mappers.subject(row)));

      } catch (err) {
        console.error("Error fetching schedule data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [targetStudentId, selectedClassId]);

  // Debug Logging Requirements
  useEffect(() => {
    if (studentData) {
      const student = {
        ...studentData,
        class_id: studentData.class_id || studentData.classId
      };
      console.log("STUDENT CLASS ID", student.class_id);
      console.log("SCHEDULE CELLS", scheduleCells);
      console.log("SCHEDULE SUBJECTS", scheduleSubjects);
    }
  }, [studentData, scheduleCells, scheduleSubjects]);

  const days = ['PON', 'UTO', 'SRI', 'ČET', 'PET'];
  const morningPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
  const afternoonPeriods = [0, 1, 2, 3, 4, 5, 6, 7];

  const getSubjects = (day: string, shift: 'MORNING' | 'AFTERNOON', period: number) => {
    const cell = scheduleCells.find(c => c.dayOfWeek === day && c.shift === shift && c.periodNumber === period);
    if (!cell) return [];
    return scheduleSubjects.filter(ss => ss.scheduleCellId === cell.id);
  };

  const getTeacherName = (teacherId: string) => {
    const tp = teacherProfiles.find(t => t.id === teacherId);
    if (!tp) return '—';
    return formatPersonName(tp);
  };

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse font-black text-gray-400 uppercase tracking-widest text-[11px] h-full flex items-center justify-center">
        Učitavanje rasporeda...
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc]">
      <div className="bg-[#005c8d] p-4 text-white flex items-center justify-between border-b border-[#004a70] shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
          <BookOpen size={16} />
          Tjedni raspored sati {classData?.name ? `— Razred: ${classData.name}` : ''}
        </h2>
        <div className="text-[10px] font-black uppercase tracking-wide opacity-90 border-l border-white/20 pl-3">
          Učenik: {studentData ? formatPersonName(studentData) : '—'}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-8 w-full">
        {(!classData) ? (
          <div className="bg-orange-50 border border-orange-200 p-4 text-center rounded text-orange-800 text-xs font-bold uppercase tracking-wider">
            Niste raspoređeni u nijedan razred ili nema aktivnog razreda za pregled rasporeda.
          </div>
        ) : (
          <>
            <SimpleScheduleGrid 
              title="Jutarnja smjena" 
              shift="MORNING" 
              periods={morningPeriods} 
              days={days} 
              getSubjects={getSubjects} 
              allSubjects={subjects}
              getTeacherName={getTeacherName}
            />

            <SimpleScheduleGrid 
              title="Popodnevna smjena" 
              shift="AFTERNOON" 
              periods={afternoonPeriods} 
              days={days} 
              getSubjects={getSubjects} 
              allSubjects={subjects}
              getTeacherName={getTeacherName}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SimpleScheduleGrid({ title, shift, periods, days, getSubjects, allSubjects, getTeacherName }: any) {
  return (
    <div className="bg-white border border-gray-300 shadow-none w-full">
      <div className="bg-gray-50 border-b border-gray-300 p-3 flex items-center gap-2">
        {shift === 'MORNING' ? <Monitor size={15} className="text-[#005c8d]" /> : <Clock size={15} className="text-[#005c8d]" />}
        <h3 className="text-[11px] font-black uppercase text-gray-700 tracking-wider font-sans">{title}</h3>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse min-w-[800px] table-fixed">
          <thead>
            <tr className="bg-gray-100/70 border-b border-gray-300">
              <th className="w-[70px] border-r border-gray-300 p-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                SAT
              </th>
              {days.map((day: string) => (
                <th key={day} className="p-2.5 text-[10px] font-black text-gray-600 uppercase border-r border-gray-200 last:border-r-0 text-center">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {periods.map((period: number) => (
              <tr key={period} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/20 transition-colors">
                <td className="bg-gray-50/70 border-r border-gray-300 p-3 text-center align-middle font-black text-gray-600 text-xs w-[70px]">
                  {period}. sat
                </td>
                {days.map((day: string) => {
                  const subjects = getSubjects(day, shift, period);
                  return (
                    <td key={`${day}-${period}`} className="p-2 border-r border-gray-200 last:border-r-0 align-top min-h-[75px]">
                      <div className="space-y-1.5 h-full min-h-[50px] flex flex-col justify-start">
                        {subjects.length === 0 ? (
                          <div className="text-gray-300 text-[10px] text-center my-auto py-2 font-mono tracking-tighter">—</div>
                        ) : (
                          subjects.map((s: any) => {
                            const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                            const tName = getTeacherName(s.teacherId);
                            return (
                              <div key={s.id} className="bg-blue-50/60 border border-blue-100/90 p-2 rounded shadow-sm text-center">
                                <div className="text-[10.5px] font-black text-blue-900 uppercase leading-snug tracking-wide">
                                  {sub?.name || 'Nepoznat predmet'}
                                </div>
                                <div className="text-[9px] text-[#005c8d] font-bold uppercase mt-0.5 tracking-wider">
                                  {tName}
                                </div>
                                {s.classroom && (
                                  <div className="text-[8px] text-gray-400 font-extrabold uppercase mt-1 tracking-tight">
                                    Učionica: {s.classroom}
                                  </div>
                                )}
                              </div>
                            );
                          })
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
