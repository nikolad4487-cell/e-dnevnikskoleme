import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Grade, Subject, User, ClassSubjectTeacher, specialExamTypes } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { formatPersonName, formatSubjectDisplayName } from '../../lib/utils';
import { Calendar, FileText, User as UserIcon, BookOpen, Clock, AlertCircle } from 'lucide-react';

interface ExamWithDetails {
  id: string;
  date: string;
  type: string;
  description?: string;
  gradeValue?: string;
  note?: string;
  subject: Subject | null;
  teachers: User[];
}

export default function StudentIspitiPage() {
  const { user, isParent } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamWithDetails[]>([]);

  useEffect(() => {
    if (!user || !selectedClassId) return;

    const fetchExamsData = async () => {
      setLoading(true);
      try {
        const targetStudentId = isParent ? selectedChildId : user.id;

        if (!targetStudentId) {
          setLoading(false);
          return;
        }

        // 1. Get student's enrollments for THIS class (ONLY ACTIVE)
        const { data: enrollData } = await supabase
          .from('student_subject_enrollments')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId)
          .eq('status', 'ACTIVE');
        
        const enrollments = (enrollData || []).map(row => mappers.studentSubjectEnrollment(row));
        const activeSubjectIds = enrollments.map(e => e.subjectId);

        if (activeSubjectIds.length === 0) {
          setExams([]);
          setLoading(false);
          return;
        }

        // 2. Fetch Subjects details
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .in('id', activeSubjectIds);
        const activeSubjects = mapList(subjectsData, mappers.subject);
        const subjectsMap = new Map<string, Subject>();
        activeSubjects.forEach(s => subjectsMap.set(s.id, s));

        // 3. Get teachers for these subjects in this class
        const { data: cstData } = await supabase
          .from('class_subject_teachers')
          .select('*')
          .eq('class_id', selectedClassId)
          .in('subject_id', activeSubjectIds);
        const csts = mapList(cstData, mappers.classSubjectTeacher);

        // 4. Get teacher profiles
        const teacherIds = [...new Set(csts.map(c => c.teacherId))];
        const teacherMap = new Map<string, User>();
        if (teacherIds.length > 0) {
          const { data: teacherProfiles } = await supabase
            .from('user_profiles')
            .select('*')
            .in('id', teacherIds);
          (teacherProfiles || []).forEach(tp => {
            const u = mappers.user(tp) as User;
            teacherMap.set(u.id, u);
          });
        }

        // 5. Fetch Exams for this class and specifically for this student
        const { data: examsData, error: examsError } = await supabase
          .from('exams')
          .select('*')
          .eq('class_id', selectedClassId)
          .in('subject_id', activeSubjectIds)
          .or(`student_id.is.null,student_id.eq.${targetStudentId}`)
          .order('exam_date', { ascending: true });

        if (examsError) throw examsError;

        const mappedExams: ExamWithDetails[] = (examsData || []).filter(raw => {
          const typeStr = raw.exam_type || raw.type;
          return !specialExamTypes.includes(typeStr);
        }).map(raw => {
          const exam = mappers.exam(raw);
          const examSubject = subjectsMap.get(exam.subjectId) || null;
          
          // Find teachers for this specific subject
          const subjectTeacherIds = csts
            .filter(c => c.subjectId === exam.subjectId)
            .map(c => c.teacherId);
          
          // Include createdBy teacher if we have their profile
          if (exam.createdBy && !subjectTeacherIds.includes(exam.createdBy)) {
            subjectTeacherIds.push(exam.createdBy);
          }

          const matchedTeachers: User[] = [];
          subjectTeacherIds.forEach(tid => {
            const t = teacherMap.get(tid);
            if (t) matchedTeachers.push(t);
          });

          return {
            id: exam.id,
            date: exam.date,
            type: exam.type,
            description: exam.description,
            gradeValue: exam.gradeValue,
            note: exam.note,
            subject: examSubject,
            teachers: matchedTeachers,
          };
        });

        setExams(mappedExams);
      } catch (err) {
        console.error('Error fetching student exams:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExamsData();
  }, [user, selectedClassId, selectedChildId, isParent]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-400 font-bold uppercase text-xs tracking-widest">
        Učitavanje ispita...
      </div>
    );
  }

  // Split exams into upcoming and past
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingExams = exams.filter(e => e.date >= todayStr);
  const pastExams = exams.filter(e => e.date < todayStr).reverse(); // Order past exams descending

  const getBadgeStyle = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('pisan') || t.includes('test') || t.includes('kontrola')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (t.includes('usmen') || t.includes('ispiti')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    if (t.includes('inicijal')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const ExamCard = ({ exam }: { exam: ExamWithDetails }) => {
    const sName = exam.subject ? formatSubjectDisplayName(exam.subject.name, 'redovni') : 'Nepoznat predmet';
    const teacherNames = exam.teachers.length > 0
      ? exam.teachers.map(t => formatPersonName(t)).join(', ')
      : 'Nije dodijeljen nastavnik';

    return (
      <div className="bg-white border border-gray-300 p-5 shadow-sm hover:border-blue-500 hover:shadow transition-all relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="text-[#005c8d] shrink-0" size={18} />
            <h3 className="font-bold text-sm text-gray-900">{sName}</h3>
          </div>
          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${getBadgeStyle(exam.type)}`}>
            {exam.type}
          </span>
        </div>

        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400 shrink-0" size={14} />
            <span className="font-bold text-gray-800">
              {new Date(exam.date).toLocaleDateString('hr-HR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          <div className="flex items-start gap-2">
            <UserIcon className="text-gray-400 shrink-0 mt-0.5" size={14} />
            <div>
              <span className="text-gray-400">Nastavnik: </span>
              <span className="font-semibold text-gray-700">{teacherNames}</span>
            </div>
          </div>

          {exam.gradeValue && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
              <span className="text-gray-400">Ocjena: </span>
              <span className="font-bold text-[#005c8d] text-sm">{exam.gradeValue}</span>
            </div>
          )}

          {(exam.description || exam.note) && (
            <div className="mt-3 bg-gray-50/50 border border-gray-200 p-3 rounded text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
              <span className="block font-bold text-[9px] uppercase text-gray-400 tracking-wider mb-1">Opis / Bilješka</span>
              {exam.description || exam.note}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-[#f1f5f9]">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        <div className="flex items-center gap-3 border-b-2 border-[#005c8d]/10 pb-4">
          <FileText className="text-[#005c8d]" size={22} />
          <div>
            <h2 className="text-sm font-black uppercase text-[#005c8d] tracking-widest">Ispiti i pisane provjere</h2>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5 font-bold tracking-wider">Pregled planiranih ispitnih rokova i provjera znanja</p>
          </div>
        </div>

        {/* Upcoming Exams */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase text-gray-600 tracking-wider flex items-center gap-2 border-b border-gray-300 pb-2">
            <Clock size={14} className="text-blue-500" /> Nadolazeći ispiti i provjere
          </h3>
          {upcomingExams.length === 0 ? (
            <div className="bg-white border border-gray-200 p-8 text-center text-gray-400 italic text-xs shadow-sm">
              <AlertCircle size={28} className="mx-auto text-gray-300 mb-2" />
              Nema planiranih nadolazećih ispita ili provjera znanja.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingExams.map(exam => (
                <div key={exam.id}>
                  <ExamCard exam={exam} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past Exams */}
        <div className="space-y-4 pt-4">
          <h3 className="text-xs font-black uppercase text-gray-600 tracking-wider border-b border-gray-300 pb-2">
            Prošli ispiti i održane provjere
          </h3>
          {pastExams.length === 0 ? (
            <div className="bg-white border border-gray-200 p-8 text-center text-gray-400 italic text-xs shadow-sm">
              Nema prošlih ispita u sustavu.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-85">
              {pastExams.map(exam => (
                <div key={exam.id}>
                  <ExamCard exam={exam} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
