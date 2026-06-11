import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Clock, MapPin, Users, Award, ShieldAlert } from 'lucide-react';

interface CommissionMember {
  id: string;
  schedule_id: string;
  teacher_profile_id: string;
  is_homeroom_teacher: boolean;
}

interface DefenseSchedule {
  id: string;
  school_id: string;
  school_year: string;
  class_id: string;
  defense_time: string;
  classroom: string;
  members: CommissionMember[];
  created_at: string;
}

export function FinalExamDefenseSchedule({ classId }: { classId?: string }) {
  const { user, isParent, isTeacher, isStaff, isMainAdmin } = useAuth();
  
  const [schedules, setSchedules] = useState<DefenseSchedule[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentClassId, setStudentClassId] = useState<string>('');

  // 1. Fetch Student Class Enrollment if Student/Parent and classId is not specified
  useEffect(() => {
    const resolveStudentClass = async () => {
      // Use logged in student or parent's active child
      const targetStudentId = isParent ? (window as any).selectedChildId || sessionStorage.getItem('selectedChildId') : user?.id;
      if (!targetStudentId || classId) {
        if (classId) setStudentClassId(classId);
        return;
      }

      try {
        const { data } = await supabase
          .from('student_class_enrollments')
          .select('class_id')
          .eq('student_id', targetStudentId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        
        if (data?.class_id) {
          setStudentClassId(data.class_id);
        }
      } catch (err) {
        console.error('Error resolving student class:', err);
      }
    };

    resolveStudentClass();
  }, [user, isParent, classId]);

  // 2. Fetch schedules, classes, and teachers/user_profiles
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch schedules from full-stack endpoint
      const response = await fetch('/api/final-exam-defense-schedules');
      let scheduleData: DefenseSchedule[] = [];
      if (response.ok) {
        scheduleData = await response.json();
      }

      // Fetch classes
      const { data: classesData } = await supabase
        .from('classes')
        .select('*, homeroom:homeroom_teacher_id(*)');
      
      // Fetch teachers profiles
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('*');
      
      setSchedules(scheduleData);
      setClasses(classesData || []);
      setTeachers(profilesData || []);
    } catch (err) {
      console.error('Error loading defense schedule details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [studentClassId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#005c8d]"></div>
      </div>
    );
  }

  // Determine user's active role context
  // MainAdmin / SchoolAdmin / Admin can see everything
  const isAdmin = isMainAdmin || (isStaff && !isTeacher);
  const isUserTeacher = isTeacher;
  const isStudentOrParent = !isAdmin && !isUserTeacher;

  // Filter schedules based on active role rules
  let visibleSchedules = [...schedules];

  if (isStudentOrParent) {
    // Only see schedule for own class
    const targetId = classId || studentClassId;
    visibleSchedules = schedules.filter(s => s.class_id === targetId);
  } else if (isUserTeacher && !isAdmin) {
    // Only see schedules where they are members of the commission
    visibleSchedules = schedules.filter(s => 
      s.members?.some(m => m.teacher_profile_id === user?.id)
    );
  }

  // Render Class specific empty display or general empty display
  if (visibleSchedules.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 flex items-start gap-3 text-amber-900 shadow-sm">
        <ShieldAlert size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-sm tracking-wide uppercase">Napomena o rasporedu</h4>
          <p className="text-xs font-semibold">Raspored obrane završnog rada još nije unesen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="defense-schedule-section">
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <Award size={15} className="text-[#005c8d]" />
          Raspored obrane završnog rada
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              <th className="p-4">Razred</th>
              <th className="p-4">Komisija</th>
              <th className="p-4">Razrednik</th>
              <th className="p-4">Vrijeme</th>
              <th className="p-4">Učionica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {visibleSchedules.map((schedule) => {
              const classObj = classes.find(c => c.id === schedule.class_id);
              const className = classObj?.name || 'Nepoznat razred';
              
              // Find homeroom / razrednik
              const homeroomTeacherId = classObj?.homeroom_teacher_id;
              const homeroomTeacher = teachers.find(t => t.id === homeroomTeacherId);
              const homeroomName = homeroomTeacher ? `${homeroomTeacher.name} ${homeroomTeacher.surname || ''}` : 'Nije dodijeljen';

              // Map commission members names
              const memberNames = (schedule.members || []).map(member => {
                const teacherObj = teachers.find(t => t.id === member.teacher_profile_id);
                if (!teacherObj) return 'Nepoznat nastavnik';
                
                const fullName = `${teacherObj.name} ${teacherObj.surname || ''}`;
                const suffix = member.teacher_profile_id === homeroomTeacherId ? ' (automatski)' : '';
                return fullName + suffix;
              });

              return (
                <tr key={schedule.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-4 font-black text-[#005c8d]">
                    {className}
                  </td>
                  <td className="p-4 max-w-sm">
                    {memberNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {memberNames.map((name, idx) => (
                          <span 
                            key={idx} 
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              name.includes('(automatski)') 
                                ? 'bg-[#005c8d]/10 text-[#005c8d] border border-[#005c8d]/30' 
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Nije određena</span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-slate-800">
                    {homeroomName}
                  </td>
                  <td className="p-4 font-semibold">
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                      <Clock size={12} />
                      {schedule.defense_time}h
                    </span>
                  </td>
                  <td className="p-4 font-bold text-slate-600">
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-100">
                      <MapPin size={11} />
                      Učionica {schedule.classroom}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
