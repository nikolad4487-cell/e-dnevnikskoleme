import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, Users, BookOpen, FileText, XCircle, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { sortStudentsBySurname } from '../../lib/utils';

export default function StudentDashboard() {
  const { classId, studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [studentIndex, setStudentIndex] = useState<number>(0);
  const [allClassStudents, setAllClassStudents] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!studentId || !classId) return;
      setLoading(true);

      try {
        // 1. Fetch Current Student Profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', studentId)
          .single();
        
        if (profile) {
          setStudent(profile);
        }

        // 2. Fetch all student enrollments in class, sort alphabetically, and find index
        const { data: enrollments } = await supabase
          .from('student_class_enrollments')
          .select('student_id, student:user_profiles(*)')
          .eq('class_id', classId);

        if (enrollments && enrollments.length > 0) {
          const sorted = sortStudentsBySurname(enrollments);
          setAllClassStudents(sorted);
          const index = sorted.findIndex(s => s.student_id === studentId);
          if (index !== -1) {
            setStudentIndex(index + 1);
          }
        }

        // 3. Fetch subjects and teachers for this class
        const { data: classSubs } = await supabase
          .from('class_subjects')
          .select('subject_id, subject_type')
          .eq('class_id', classId);

        const { data: subs } = await supabase
          .from('subjects')
          .select('*');

        const { data: studentEnrolledSubjects } = await supabase
          .from('student_subject_enrollments')
          .select('subject_id')
          .eq('student_id', studentId)
          .eq('class_id', classId);

        const enrolledSubjectIds = new Set<string>(
          studentEnrolledSubjects ? studentEnrolledSubjects.map((se: any) => se.subject_id) : []
        );

        const { data: assignments } = await supabase
          .from('class_subject_teachers')
          .select('subject_id, teacher_id')
          .eq('class_id', classId);

        const { data: teachers } = await supabase
          .from('user_profiles')
          .select('id, name');

        // Map assignments to a teacher map
        const teacherMap: Record<string, string[]> = {};
        if (assignments && teachers) {
          assignments.forEach((asg: any) => {
            const tProfile = teachers.find(t => t.id === asg.teacher_id);
            if (tProfile) {
              const fullName = (tProfile.name || '').trim();
              if (fullName) {
                if (!teacherMap[asg.subject_id]) {
                  teacherMap[asg.subject_id] = [];
                }
                if (!teacherMap[asg.subject_id].includes(fullName)) {
                  teacherMap[asg.subject_id].push(fullName);
                }
              }
            }
          });
        }

        // Standard Croatia highschool/primary school fallback subjects if none defined in DB
        const defaultSubjectsList = [
          { id: 'hrvatski', name: 'Hrvatski jezik', code: 'HRV', teacher: 'NIKOLA ĐURIĆ' },
          { id: 'matematika', name: 'Matematika', code: 'MAT', teacher: 'IVANA PURIĆ' },
          { id: 'engleski', name: 'Engleski jezik', code: 'ENG', teacher: 'BORIS SREĆKOVIĆ' },
          { id: 'povijest', name: 'Povijest', code: 'POV', teacher: 'MARIJA MAJDIC' },
          { id: 'fizika', name: 'Fizika', code: 'FIZ', teacher: 'STJEPAN KOS' },
          { id: 'kemija', name: 'Kemija', code: 'KEM', teacher: 'LUKA MATIĆ' },
          { id: 'biologija', name: 'Biologija s higijenom i ekologijom', code: 'BIO', teacher: 'IVANA PURIĆ' },
          { id: 'racunalstvo', name: 'Računalstvo', code: 'RAC', teacher: 'BORIS SREĆKOVIĆ' },
          { id: 'sat-razrednika', name: 'Sat razrednika', code: 'SR', teacher: 'MARIJA MARIĆ' },
        ];

        let mappedSubjects: any[] = [];
        if (classSubs && classSubs.length > 0 && subs && subs.length > 0) {
          const seenSubjectIds = new Set<string>();
          classSubs.forEach((cs: any) => {
            if (seenSubjectIds.has(cs.subject_id)) return;
            seenSubjectIds.add(cs.subject_id);

            // Filter: limit to enrolled subjects if enrollment table has data for this student
            if (enrolledSubjectIds.size > 0 && !enrolledSubjectIds.has(cs.subject_id)) {
              return;
            }

            const matchedSub = subs.find(s => s.id === cs.subject_id);
            if (matchedSub) {
              const teachersList = teacherMap[cs.subject_id] || [];
              mappedSubjects.push({
                id: cs.subject_id,
                name: matchedSub.name || 'Nepoznat predmet',
                code: matchedSub.code || '',
                teacher: teachersList.length > 0 ? teachersList.join(', ') : 'NEMA DODIJELJENOG NASTAVNIKA'
              });
            }
          });
          // Sort alphabetically
          mappedSubjects.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (mappedSubjects.length === 0) {
          // Fallback to defaults so the teacher doesn't see a blank page
          mappedSubjects = defaultSubjectsList;
        }

        if (mappedSubjects.length > 0) {
          console.log("SUBJECT WITH TEACHERS", mappedSubjects[0]);
        }

        setSubjects(mappedSubjects);

      } catch (err) {
        console.error('Error loading student dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [studentId, classId]);

  // Navigate between students alphabetically
  const handlePrevStudent = () => {
    if (allClassStudents.length <= 1) return;
    const currentIndex = allClassStudents.findIndex(s => s.student_id === studentId);
    if (currentIndex > 0) {
      navigate(`/class/${classId}/student/${allClassStudents[currentIndex - 1].student_id}`);
    } else {
      // Loop to end
      navigate(`/class/${classId}/student/${allClassStudents[allClassStudents.length - 1].student_id}`);
    }
  };

  const handleNextStudent = () => {
    if (allClassStudents.length <= 1) return;
    const currentIndex = allClassStudents.findIndex(s => s.student_id === studentId);
    if (currentIndex !== -1 && currentIndex < allClassStudents.length - 1) {
      navigate(`/class/${classId}/student/${allClassStudents[currentIndex + 1].student_id}`);
    } else {
      // Loop to top
      navigate(`/class/${classId}/student/${allClassStudents[0].student_id}`);
    }
  };

  const handleRandomStudent = () => {
    if (allClassStudents.length <= 1) return;
    let randomIndex = Math.floor(Math.random() * allClassStudents.length);
    // Ensure we don't pick the current student unless only 1 exists
    while (allClassStudents[randomIndex]?.student_id === studentId && allClassStudents.length > 1) {
      randomIndex = Math.floor(Math.random() * allClassStudents.length);
    }
    navigate(`/class/${classId}/student/${allClassStudents[randomIndex].student_id}`);
  };

  if (loading) {
    return (
      <div className="p-16 flex items-center justify-center bg-white h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-[#005c8d]" />
          <span className="text-xs uppercase font-extrabold text-[#005c8d]">Učitavanje podataka...</span>
        </div>
      </div>
    );
  }

  const formattedName = student 
    ? `${student.surname || ''} ${student.name || ''}`.toUpperCase().trim() 
    : 'UČENIK';

  return (
    <div className="p-6 bg-white min-h-full">
      {/* Upper Navigation & Student title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#005c8d] tracking-tight">
            {studentIndex ? `${studentIndex}. ` : ''}{formattedName}
          </h1>
          <p className="text-xs text-gray-500 font-extrabold uppercase mt-1 tracking-wider">
            UČENIČKA KARTICA - POPIS PREDMETA
          </p>
        </div>
        
        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <button 
            onClick={handlePrevStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-sm select-none transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            PRETHODNI
          </button>
          <button 
            onClick={handleRandomStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-sm select-none transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" />
            SLUČAJNI ODABIR
          </button>
          <button 
            onClick={handleNextStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-sm select-none transition-colors"
          >
            SLJEDEĆI
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-4">
        {/* LEFT COMPARTMENT SIDEBAR styled in true e-Dnevnik fashion */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="bg-[#005c8d] text-white text-xs font-black px-4 py-2.5 uppercase tracking-wider rounded-t border border-[#005c8d]">
            IZBORNIK
          </div>
          <div className="border border-t-0 border-gray-200 bg-gray-50/50 p-2 flex flex-col gap-1 rounded-b">
            <button 
              onClick={() => navigate(`/class/${classId}/imenik`)} 
              className="flex items-center gap-2.5 w-full text-left p-2.5 text-xs font-semibold text-gray-700 hover:bg-white hover:text-[#005c8d] border border-transparent hover:border-gray-100 rounded transition-all duration-150"
            >
              <Users className="w-4 h-4 text-gray-400 shrink-0" />
              Imenik učenika
            </button>
            <button 
              className="flex items-center gap-2.5 w-full text-left p-2.5 text-xs font-black text-[#005c8d] bg-white border border-[#005c8d]/20 rounded shadow-sm"
              disabled
            >
              <BookOpen className="w-4 h-4 text-[#005c8d] shrink-0" />
              Pregled predmeta
            </button>
            <button 
              onClick={() => navigate(`/class/${classId}/biljeske`)} 
              className="flex items-center gap-2.5 w-full text-left p-2.5 text-xs font-semibold text-gray-700 hover:bg-white hover:text-[#005c8d] border border-transparent hover:border-gray-100 rounded transition-all duration-150"
            >
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              Bilješke
            </button>
            <hr className="my-1.5 border-gray-200" />
            <button 
              onClick={() => navigate(`/class/${classId}/imenik`)} 
              className="flex items-center justify-center gap-2 w-full p-2 text-xs font-bold text-gray-600 hover:text-red-700 bg-white hover:bg-red-50/50 border border-gray-200 hover:border-red-100 rounded transition-all shadow-xs"
            >
              <XCircle className="w-4 h-4 text-red-500" />
              ZATVORI KARTICU
            </button>
          </div>
        </div>

        {/* RIGHT COMPARTMENT: SUBJECTS LISTING */}
        <div className="flex-1">
          <div className="border border-gray-200 rounded-sm overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse bg-white">
              <thead>
                <tr className="bg-gray-100 text-gray-700 text-xs uppercase font-extrabold tracking-wider border-b border-gray-200">
                  <th className="p-4 font-extrabold w-3/4">NASTAVNI PREDMET</th>
                  <th className="p-4 font-extrabold text-right">AKCIJA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subjects.map((sub) => (
                  <tr 
                    key={sub.id} 
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/class/${classId}/student/${studentId}/subject/${sub.id}`)}
                  >
                    <td className="p-4">
                      <div className="font-bold text-[#005c8d] text-sm group-hover:underline transition-all">
                        {sub.name}
                      </div>
                      <div className="text-[10px] text-gray-500 font-extrabold uppercase mt-1 tracking-wider">
                        {sub.teacher}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/class/${classId}/student/${studentId}/subject/${sub.id}`);
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-gray-200 hover:border-slate-300 rounded font-black text-xs text-[#005c8d] hover:text-blue-800 transition-colors shadow-xs select-none"
                      >
                        PRIKAŽI OCJENE →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
