import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, ScheduleCell, ScheduleCellSubject, StudentSubjectEnrollment, Role } from '../../types';
import { cn } from '../../lib/utils';
import { Clock, Monitor, BookOpen } from 'lucide-react';
import { mappers } from '../../lib/mappers';

export default function RasporedPage() {
  const { user } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [classData, setClassData] = useState<Class | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<StudentSubjectEnrollment[]>([]);
  const [scheduleCells, setScheduleCells] = useState<ScheduleCell[]>([]);
  const [scheduleSubjects, setScheduleSubjects] = useState<ScheduleCellSubject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const isParent = user.globalRole === Role.PARENT;
    const targetId = isParent ? selectedChildId : user.id;
    setTargetStudentId(targetId);
    
    if (user.globalRole === Role.STUDENT) {
      setTargetStudentId(user.id);
      setStudentData(user);
    }
  }, [user, selectedChildId]);

  useEffect(() => {
    if (!targetStudentId || !selectedClassId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // If parent, fetch student data
        let currentStudent = studentData;
        if (!currentStudent) {
          const { data: sData } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', targetStudentId)
            .single();
          currentStudent = sData;
          setStudentData(currentStudent);
        }

        if (selectedClassId) {
          const { data: cData } = await supabase
            .from('classes')
            .select('*')
            .eq('id', selectedClassId)
            .single();
          setClassData(cData as Class);

          // Fetch Enrollments for THIS class
          const { data: eData } = await supabase
            .from('student_subject_enrollments')
            .select('*')
            .eq('student_id', targetStudentId)
            .eq('class_id', selectedClassId);
          setEnrollments((eData || []) as unknown as StudentSubjectEnrollment[]);

          // Fetch Schedule for THIS class
          const { data: cellsData } = await supabase
            .from('schedule_cells')
            .select('*')
            .eq('class_id', selectedClassId);
          const cells = (cellsData || []).map(row => mappers.scheduleCell(row));
          setScheduleCells(cells);

          if (cells.length > 0) {
            const cellIds = cells.map(c => c.id);
            const { data: subjsData } = await supabase
              .from('schedule_cell_subjects')
              .select('*')
              .in('schedule_cell_id', cellIds);
            setScheduleSubjects((subjsData || []).map(row => mappers.scheduleCellSubject(row)));
          }
        }

        // Fetch Subjects for names
        const { data: subData } = await supabase.from('subjects').select('*');
        setSubjects((subData || []).map(row => mappers.subject(row)));

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [targetStudentId, selectedClassId]);

  const days = ['PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB'];
  const morningPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
  const afternoonPeriods = [0, 1, 2, 3, 4, 5, 6, 7];

  const getFilteredSubjects = (day: string, shift: 'MORNING' | 'AFTERNOON', period: number) => {
    const cell = scheduleCells.find(c => c.dayOfWeek === day && c.shift === shift && c.periodNumber === period);
    if (!cell) return [];
    
    return scheduleSubjects.filter(ss => {
      if (ss.scheduleCellId !== cell.id) return false;
      
      // Filter by enrollment
      const enrollment = enrollments.find(e => e.subjectId === ss.subjectId);
      return enrollment?.status === 'ACTIVE';
    });
  };

  if (loading) return <div className="p-8 text-center animate-pulse font-black text-gray-300 uppercase tracking-widest">Učitavanje rasporeda...</div>;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      <div className="bg-[#005c8d] p-4 text-white flex items-center justify-between border-b border-[#004a70]">
        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <BookOpen size={16} />
          Tjedni raspored sati: {classData?.name}
        </h2>
        <div className="text-[10px] font-bold opacity-70 uppercase tracking-tighter">
          Učenik: {studentData?.name} {studentData?.surname}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-8">
        <SimpleScheduleGrid 
          title="Jutarnja smjena" 
          shift="MORNING" 
          periods={morningPeriods} 
          days={days} 
          getSubjects={getFilteredSubjects} 
          allSubjects={subjects}
        />

        <SimpleScheduleGrid 
          title="Popodnevna smjena" 
          shift="AFTERNOON" 
          periods={afternoonPeriods} 
          days={days} 
          getSubjects={getFilteredSubjects} 
          allSubjects={subjects}
        />
      </div>
    </div>
  );
}

function SimpleScheduleGrid({ title, shift, periods, days, getSubjects, allSubjects }: any) {
  return (
    <div className="bg-white border border-gray-300 shadow-none">
      <div className="bg-gray-50 border-b border-gray-300 p-2 flex items-center gap-2">
        {shift === 'MORNING' ? <Monitor size={14} className="text-[#005c8d]"/> : <Clock size={14} className="text-[#005c8d]"/>}
        <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[700px]">
          <thead>
            <tr className="bg-gray-100/50 border-b border-gray-300">
              <th className="w-10 border-r border-gray-300"></th>
              {periods.map(p => (
                <th key={p} className="p-2 text-[9px] font-black text-gray-400 uppercase border-r border-gray-200 last:border-r-0">
                  {p}. sat
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(day => (
              <tr key={day} className="border-b border-gray-200 last:border-b-0">
                <td className="bg-gray-100/30 border-r border-gray-300 p-2 text-center align-middle">
                   <div className="text-[10px] font-black text-gray-400 -rotate-90">{day}</div>
                </td>
                {periods.map(period => {
                  const subjects = getSubjects(day, shift, period);
                  return (
                    <td key={`${day}-${period}`} className="p-1 border-r border-gray-200 last:border-r-0 align-top min-h-[50px]">
                      <div className="space-y-1">
                        {subjects.map((s: any) => {
                          const sub = allSubjects.find((sub: any) => sub.id === s.subject_id);
                          return (
                            <div key={s.id} className="bg-blue-50 border border-blue-100 p-1.5 rounded shadow-sm">
                              <div className="text-[9px] font-black text-[#005c8d] uppercase leading-tight">{sub?.name}</div>
                              {s.classroom && <div className="text-[7px] text-gray-400 font-bold uppercase mt-0.5">Uč: {s.classroom}</div>}
                            </div>
                          );
                        })}
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
