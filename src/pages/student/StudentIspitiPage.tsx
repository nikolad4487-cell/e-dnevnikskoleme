import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Subject, User, specialExamTypes } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { formatSubjectDisplayName, formatSubjectName } from '../../lib/utils';
import { Calendar, ChevronDown, FileText } from 'lucide-react';

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
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!selectedMonthKey) return;
    const hasSelectedMonth = exams.some(exam => {
      const date = new Date(exam.date);
      const key = Number.isNaN(date.getTime())
        ? 'bez-datuma'
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return key === selectedMonthKey;
    });
    if (!hasSelectedMonth) setSelectedMonthKey('');
  }, [exams, selectedMonthKey]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-400 font-bold uppercase text-xs tracking-widest">
        Učitavanje ispita...
      </div>
    );
  }

  const showSpecialExamSection = studentClassName.trim().toUpperCase() === '4.K';

  const groupExamsByMonth = (items: ExamWithDetails[]) => {
    const sorted = [...items].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return sorted.reduce<Array<{ key: string; label: string; items: ExamWithDetails[] }>>((groups, exam) => {
      const date = new Date(exam.date);
      const key = Number.isNaN(date.getTime())
        ? 'bez-datuma'
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = Number.isNaN(date.getTime())
        ? 'Bez datuma'
        : date.toLocaleDateString('hr-HR', { month: 'long' });
      const existing = groups.find(group => group.key === key);
      if (existing) {
        existing.items.push(exam);
      } else {
        groups.push({ key, label, items: [exam] });
      }
      return groups;
    }, []);
  };

  const monthOptions = groupExamsByMonth(exams);
  const displayedExams = selectedMonthKey ? exams.filter(exam => {
    const date = new Date(exam.date);
    const key = Number.isNaN(date.getTime())
      ? 'bez-datuma'
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return key === selectedMonthKey;
  }) : exams;
  const selectedMonthLabel = monthOptions.find(option => option.key === selectedMonthKey)?.label;

  const ExamsByMonth = ({ items, emptyText }: { items: ExamWithDetails[]; emptyText: string }) => {
    const groups = groupExamsByMonth(items);

    if (groups.length === 0) {
      return (
        <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-gray-400 italic text-xs shadow-sm">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {groups.map(group => (
          <section key={group.key} className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#1780c2] text-white text-center py-2 text-base font-bold">
              {group.label.charAt(0).toUpperCase() + group.label.slice(1)}
            </div>
            <div className="divide-y divide-gray-100">
              {group.items.map(exam => {
                const sName = exam.subject ? formatSubjectName(exam.subject) : 'Nepoznat predmet';
                const date = new Date(exam.date);
                const dateLabel = Number.isNaN(date.getTime())
                  ? '-'
                  : date.toLocaleDateString('hr-HR', { day: 'numeric', month: 'numeric' });
                const detail = exam.description || exam.note || exam.type || '';

                return (
                  <div key={exam.id} className="grid grid-cols-[110px_minmax(0,1fr)] gap-5 px-4 md:px-16 py-2.5 text-base hover:bg-slate-50">
                    <div className="text-center text-slate-950 font-normal whitespace-nowrap">{dateLabel}</div>
                    <div className="min-w-0 leading-tight">
                      <div className="font-bold text-slate-950">{sName}</div>
                      {detail && <div className="text-slate-950">{detail}</div>}
                      {exam.value && <div className="text-xs font-bold text-[#005c8d] mt-1">Ocjena: {exam.value}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="w-full p-4 md:p-5 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-normal text-slate-900">ISPITI</h2>
          <div className="hidden md:flex gap-3">
            <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1">
              <Calendar size={14} />Kalendar
            </button>
            <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1">
              <FileText size={14} />PDF
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={monthOptions.length === 0}
                onClick={() => setIsMonthMenuOpen(open => !open)}
                className="bg-[#1780c2] disabled:bg-slate-300 text-white px-4 py-2 rounded-md text-sm font-medium min-w-[460px] text-left flex items-center justify-between"
              >
                <span>{selectedMonthLabel ? selectedMonthLabel.charAt(0).toUpperCase() + selectedMonthLabel.slice(1) : 'Odaberite mjesec'}</span>
                <ChevronDown size={16} className={isMonthMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {isMonthMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-xl z-40 py-2 max-h-[400px] overflow-y-auto">
                  {monthOptions.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSelectedMonthKey(option.key);
                        setIsMonthMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                    >
                      {option.label.charAt(0).toUpperCase() + option.label.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ExamsByMonth items={displayedExams} emptyText="Nema upisanih ispita ili provjera znanja." />
        </div>

        {/* Special Exams (Dopunski / Razlikovni / Popravni) */}
        {showSpecialExamSection && <div className="space-y-4 pt-6">
          <h3 className="text-xs font-black uppercase text-[#005c8d] tracking-wider border-b-2 border-[#005c8d]/20 pb-2 flex items-center gap-2">
            Dopunski / razlikovni / popravni ispiti
          </h3>
          <ExamsByMonth items={specialExams} emptyText="Nema upisanih dopunskih, razlikovnih ili popravnih ispita za ovog učenika." />
        </div>}
      </div>
    </div>
  );
}
