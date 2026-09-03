import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Subject, User, specialExamTypes } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { formatPersonName, formatSubjectDisplayName, formatSubjectName } from '../../lib/utils';
import { Calendar } from 'lucide-react';

interface ExamWithDetails {
  id: string;
  date: string;
  type: string;
  description?: string;
  value?: string;
  note?: string;
  subject: Subject | null;
  teachers: User[];
}

export default function StudentIspitiPage() {
  const { user, isParent } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamWithDetails[]>([]);
  const [specialExams, setSpecialExams] = useState<ExamWithDetails[]>([]);
  const [studentClassName, setStudentClassName] = useState('');

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

        const { data: classData } = await supabase
          .from('classes')
          .select('name')
          .eq('id', selectedClassId)
          .maybeSingle();
        setStudentClassName(String(classData?.name || ''));

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
          setSpecialExams([]);
          setLoading(false);
          return;
        }

        // 2. Fetch Subjects details
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .in('id', activeSubjectIds);

        const { data: classSubjs } = await supabase
          .from('class_subjects')
          .select('subject_id, subject_type')
          .eq('class_id', selectedClassId || '');

        const csMap = new Map<string, string>();
        if (classSubjs) {
          for (const cs of classSubjs) {
            csMap.set(cs.subject_id, cs.subject_type || 'REQUIRED');
          }
        }
        
        const activeSubjects = mapList(subjectsData, mappers.subject).map((sub: any) => ({
          ...sub,
          name: formatSubjectDisplayName(sub.name, csMap.get(sub.id) || 'REQUIRED')
        }));
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

        const regularRaw = (examsData || []).filter(raw => {
          const typeStr = (raw.exam_type || raw.type || '').toLowerCase();
          const isSpecial = specialExamTypes.includes(raw.exam_type || raw.type) ||
                            typeStr.includes('dopunsk') ||
                            typeStr.includes('popravn') ||
                            typeStr.includes('razlikovn') ||
                            raw.student_id !== null;
          return !isSpecial;
        });

        const specialRaw = (examsData || []).filter(raw => {
          const typeStr = (raw.exam_type || raw.type || '').toLowerCase();
          const isSpecial = specialExamTypes.includes(raw.exam_type || raw.type) ||
                            typeStr.includes('dopunsk') ||
                            typeStr.includes('popravn') ||
                            typeStr.includes('razlikovn') ||
                            raw.student_id !== null;
          return isSpecial;
        });

        const mapHelper = (raw: any) => {
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
            date: exam.date || raw.exam_date,
            type: exam.type || raw.exam_type,
            description: exam.description || raw.description || raw.note || '',
            value: exam.value || raw.grade_value || '',
            note: exam.note,
            subject: examSubject,
            teachers: matchedTeachers,
          };
        };

        const mappedExams: ExamWithDetails[] = regularRaw.map(mapHelper);
        const mappedSpecialExams: ExamWithDetails[] = specialRaw.map(mapHelper);

        setExams(mappedExams);
        setSpecialExams(mappedSpecialExams);
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

  const showSpecialExamSection = studentClassName.trim().toUpperCase() === '4.K';

  const groupExamsByMonth = (items: ExamWithDetails[]) => {
    const sorted = [...items].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return sorted.reduce<Array<{ key: string; label: string; items: ExamWithDetails[] }>>((groups, exam) => {
      const date = new Date(exam.date);
      const key = Number.isNaN(date.getTime())
        ? 'bez-datuma'
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = Number.isNaN(date.getTime())
        ? 'Bez datuma'
        : date.toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
      const existing = groups.find(group => group.key === key);
      if (existing) {
        existing.items.push(exam);
      } else {
        groups.push({ key, label, items: [exam] });
      }
      return groups;
    }, []);
  };

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

  const ExamsTable = ({ items, emptyText }: { items: ExamWithDetails[]; emptyText: string }) => {
    const groups = groupExamsByMonth(items);

    return (
      <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#f8f9fa] text-slate-600 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="border border-gray-200 px-3 py-2 text-left w-[150px]">Datum</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Predmet</th>
              <th className="border border-gray-200 px-3 py-2 text-left w-[150px]">Vrsta</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Nastavnik</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Opis / bilješka</th>
              <th className="border border-gray-200 px-3 py-2 text-left w-[90px]">Ocjena</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-gray-200 px-3 py-10 text-center text-gray-400 italic">
                  {emptyText}
                </td>
              </tr>
            ) : groups.map(group => (
              <React.Fragment key={group.key}>
                <tr>
                  <td colSpan={6} className="bg-[#eef5fb] border border-gray-200 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-[#005c8d]">
                    {group.label}
                  </td>
                </tr>
                {group.items.map(exam => {
                  const sName = exam.subject ? formatSubjectName(exam.subject) : 'Nepoznat predmet';
                  const teacherNames = exam.teachers.length > 0
                    ? exam.teachers.map(t => formatPersonName(t)).join(', ')
                    : 'Nije dodijeljen nastavnik';
                  const date = new Date(exam.date);
                  const dateLabel = Number.isNaN(date.getTime())
                    ? '-'
                    : date.toLocaleDateString('hr-HR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

                  return (
                    <tr key={exam.id} className="hover:bg-slate-50">
                      <td className="border border-gray-200 px-3 py-2 font-bold text-slate-800">{dateLabel}</td>
                      <td className="border border-gray-200 px-3 py-2 font-bold text-slate-900">{sName}</td>
                      <td className="border border-gray-200 px-3 py-2">
                        <span className={`inline-flex px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${getBadgeStyle(exam.type)}`}>
                          {exam.type || '-'}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-slate-700">{teacherNames}</td>
                      <td className="border border-gray-200 px-3 py-2 text-slate-600 whitespace-pre-wrap">{exam.description || exam.note || '-'}</td>
                      <td className="border border-gray-200 px-3 py-2 font-black text-[#005c8d]">{exam.value || '-'}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="w-full p-4 md:p-5 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-normal text-slate-900">ISPITI</h2>
          <div className="hidden md:flex gap-3">
            <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium">Kalendar</button>
            <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium">PDF</button>
            <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium min-w-[220px] text-left">Odaberite mjesec</button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase text-gray-600 tracking-wider flex items-center gap-2 border-b border-gray-300 pb-2">
            <Calendar size={14} className="text-blue-500" /> Ispiti i provjere po mjesecu održavanja
          </h3>
          <ExamsTable items={exams} emptyText="Nema upisanih ispita ili provjera znanja." />
        </div>

        {/* Special Exams (Dopunski / Razlikovni / Popravni) */}
        {showSpecialExamSection && <div className="space-y-4 pt-6">
          <h3 className="text-xs font-black uppercase text-[#005c8d] tracking-wider border-b-2 border-[#005c8d]/20 pb-2 flex items-center gap-2">
            Dopunski / razlikovni / popravni ispiti
          </h3>
          <ExamsTable items={specialExams} emptyText="Nema upisanih dopunskih, razlikovnih ili popravnih ispita za ovog učenika." />
        </div>}
      </div>
    </div>
  );
}
