import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, ScheduleCell, ScheduleCellSubject, Role } from '../../types';
import { formatPersonName } from '../../lib/utils';
import { Clock, Monitor, BookOpen } from 'lucide-react';
import { mappers } from '../../lib/mappers';
import { ScheduleGrid } from '../../components/ScheduleGrid';

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
            <ScheduleGrid 
              title="Jutarnja smjena" 
              shift="MORNING" 
              periods={morningPeriods} 
              days={days} 
              getCellSubjects={getSubjects} 
              allSubjects={subjects}
              teachers={teacherProfiles}
            />

            <ScheduleGrid 
              title="Popodnevna smjena" 
              shift="AFTERNOON" 
              periods={afternoonPeriods} 
              days={days} 
              getCellSubjects={getSubjects} 
              allSubjects={subjects}
              teachers={teacherProfiles}
            />
          </>
        )}
      </div>
    </div>
  );
}

