import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Grade, Subject, User, ClassSubjectTeacher, specialExamTypes, specialExamTypeLabels } from '../../types';
import { cn, formatPersonName, finalGradeLabels } from '../../lib/utils';
import { BookOpen, GraduationCap, ChevronRight, ArrowLeft } from 'lucide-react';
import { mappers, mapList } from '../../lib/mappers';

export default function OcjenePage() {
  const { user, isParent } = useAuth();
  const { selectedClassId, selectedChildId, selectedSchoolId } = useSelection();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [finalGrades, setFinalGrades] = useState<any[]>([]);
  const [gradingElements, setGradingElements] = useState<any[]>([]);
  const [specialExams, setSpecialExams] = useState<any[]>([]);
  const [currentClass, setCurrentClass] = useState<any | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectTeachers, setSubjectTeachers] = useState<ClassSubjectTeacher[]>([]);
  const [teachers, setTeachers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [targetStudent, setTargetStudent] = useState<User | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (!targetStudent?.id || !selectedClassId || !selectedSubject || !selectedSchoolId) return;
    
    const fetchGradingElements = async () => {
      const { data } = await supabase
        .from('grading_elements')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('class_id', selectedClassId)
        .eq('subject_id', selectedSubject)
        .order('display_order', { ascending: true });
      
      const elements = data ? mapList(data, mappers.gradingElement) : [];
      setGradingElements(elements);
      
      console.log("STUDENT ASSESSMENT ELEMENTS", elements);
      console.log("SUBJECT ID", selectedSubject);
      console.log("CLASS ID", selectedClassId);
    };

    fetchGradingElements();
  }, [targetStudent?.id, selectedClassId, selectedSubject, selectedSchoolId]);

  const fetchSpecialExams = async () => {
    if (!targetStudent?.id || !selectedClassId || !selectedSubject || !currentClass?.school_year_id) return;

    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('student_id', targetStudent.id)
        .eq('class_id', selectedClassId)
        .eq('subject_id', selectedSubject)
        .eq('school_year_id', currentClass.school_year_id)
        .in('exam_type', specialExamTypes);
      
      console.log("INITIAL SPECIAL EXAMS LOAD");
      console.log("SPECIAL EXAMS FILTERS", { student_id: targetStudent.id, class_id: selectedClassId, subject_id: selectedSubject, school_year_id: currentClass.school_year_id, exam_type: specialExamTypes });
      console.log("SPECIAL EXAMS INITIAL RESULT", data);
      console.log("SPECIAL EXAMS INITIAL ERROR", error);

      if (error) throw error;
      setSpecialExams(mapList(data || [], mappers.exam));
    } catch (error) {
      console.error("Error fetching special exams:", error);
    }
  };

  useEffect(() => {
    if (!targetStudent?.id || !selectedClassId || !selectedSubject || !currentClass?.school_year_id) return;
    fetchSpecialExams();
  }, [
    targetStudent?.id,
    selectedClassId,
    selectedSubject,
    currentClass?.school_year_id
  ]);

  useEffect(() => {
    if (!user || !selectedClassId) return;
    
    const fetchData = async () => {
      setLoading(true);
      
      try {
        const targetStudentId = isParent ? selectedChildId : user.id;

        if (!targetStudentId) {
          setLoading(false);
          return;
        }

        // Get class
        const { data: classData } = await supabase.from('classes').select('*').eq('id', selectedClassId).single();
        if (classData) setCurrentClass(classData);

        // Fetch target student profile if it's parent view
        if (isParent) {
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', targetStudentId).maybeSingle();
          if (profile) {
            setTargetStudent(mappers.user(profile) as User);
          }
        } else {
          setTargetStudent(user);
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
          setSubjects([]);
          setLoading(false);
          return;
        }

        // 2. Get subjects for these enrollments
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .in('id', activeSubjectIds);
        
        const activeSubjects = mapList(subjectsData, mappers.subject);
        setSubjects(activeSubjects);

        // 3. Get teachers for these subjects in this class
        const { data: cstData } = await supabase
          .from('class_subject_teachers')
          .select('*')
          .eq('class_id', selectedClassId)
          .in('subject_id', activeSubjectIds);
        
        const csts = mapList(cstData, mappers.classSubjectTeacher);
        setSubjectTeachers(csts);

        // 4. Get teacher profiles
        const teacherIds = [...new Set(csts.map(c => c.teacherId))];
        if (teacherIds.length > 0) {
          const { data: teacherProfiles } = await supabase
            .from('user_profiles')
            .select('*')
            .in('id', teacherIds);
          
          const teacherMap: Record<string, User> = {};
          (teacherProfiles || []).forEach(tp => {
            const u = mappers.user(tp);
            teacherMap[u.id] = u as User;
          });
          setTeachers(teacherMap);
        }

        // 5. Get student's grades for THIS class
        const { data: gradesData } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        
        setGrades(mapList(gradesData, mappers.grade));

        // 6. Get final grades
        const { data: finalGradesData } = await supabase
          .from('final_grades')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        
        setFinalGrades(mapList(finalGradesData, mappers.finalGrade));

      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, selectedClassId, selectedChildId, isParent]);

  const [subjectLektire, setSubjectLektire] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedClassId || !selectedSubject) return;
    const fetchLektire = async () => {
      try {
        const res = await fetch(`/api/lektire?classId=${selectedClassId}&subjectId=${selectedSubject}`);
        if (res.ok) {
          const data = await res.json();
          setSubjectLektire(data || []);
        }
      } catch (err) {
        console.error("Error loading subject lektire:", err);
      }
    };
    fetchLektire();
  }, [selectedClassId, selectedSubject]);

  const MONTHS_ORDER = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const MONTH_MAP = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Učitavanje ocjena...</span>
        </div>
      </div>
    );
  }

  // --- SUBJECT SELECTION VIEW ---
  if (!selectedSubject) {
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-auto font-sans">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
          <div className="border-b-2 border-slate-200 pb-4">
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Odabir predmeta</h1>
            <p className="text-slate-500 font-medium text-xs mt-2 uppercase tracking-wider">Prikaz svih aktivnih predmeta i uspjeha</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {Object.values(subjects.reduce((acc, curr) => {
              if (!acc[curr.name]) {
                acc[curr.name] = { ...curr, ids: [curr.id] };
              } else {
                acc[curr.name].ids.push(curr.id);
              }
              return acc;
            }, {} as Record<string, Subject & { ids: string[] }>)).sort((a: any, b: any) => (String(a.name || "")).localeCompare(b.name)).map((subject: any) => {
              const subjectGrades = grades.filter(g => subject.ids.includes(g.subjectId) && !g.isFinal);
              const subjectAvg = subjectGrades.length > 0 
                ? (subjectGrades.reduce((acc, curr) => acc + curr.value, 0) / subjectGrades.length).toFixed(2)
                : '-';
              
              const matchedCsts = subjectTeachers.filter(c => subject.ids.includes(c.subjectId));
              const matchedTeachers = matchedCsts
                .map(c => teachers[c.teacherId])
                .filter(Boolean);
              
              const uniqueTeachers = Array.from(new Map(matchedTeachers.map(item => [item.id, item])).values());
              
              const teachersString = uniqueTeachers.length > 0 
                ? uniqueTeachers.map(t => formatPersonName(t)).join(', ')
                : 'Nastavnik nije dodijeljen';

              return (
                <button
                  key={subject.name}
                  onClick={() => setSelectedSubject(subject.ids[0])}
                  className="group bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between hover:border-[#005c8d] hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-[#005c8d] transition-colors">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none mb-1">{subject.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {teachersString}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Prosjek</p>
                      <p className={cn(
                        "text-lg font-black leading-none",
                        subjectAvg === '-' ? "text-slate-200" : "text-[#005c8d]"
                      )}>
                        {subjectAvg}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-[#005c8d] transition-colors" strokeWidth={3} />
                  </div>
                </button>
              );
            })}

            {subjects.length === 0 && (
              <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-3xl">
                <GraduationCap size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nema aktivnih upisa predmeta</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- SUBJECT DETAIL VIEW ---
  const activeSubject = subjects.find(s => s.id === selectedSubject)!;
  const activeGrades = grades.filter(g => g.subjectId === activeSubject.id);
  const activeFinalGrades = finalGrades.filter(g => g.subjectId === activeSubject.id);
  const average = activeGrades.length > 0 
    ? (activeGrades.reduce((acc, curr) => acc + curr.value, 0) / activeGrades.length).toFixed(2)
    : '0.00';

  const gridGrades: Record<string, Record<string, number[]>> = {};
  gradingElements.forEach(ge => gridGrades[ge.name] = {});
  activeGrades.forEach(g => {
    const month = new Date(g.date).getMonth() + 1;
    const monthLabel = MONTH_MAP[month as keyof typeof MONTH_MAP];
    if (monthLabel) {
      if (!gridGrades[g.category || '']) gridGrades[g.category || ''] = {};
      if (!gridGrades[g.category || ''][monthLabel]) gridGrades[g.category || ''][monthLabel] = [];
      gridGrades[g.category || ''][monthLabel].push(g.value);
    }
  });

  return (
    <div className="flex flex-col h-full bg-white overflow-auto font-sans">
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-8">
        {/* Back navigation & Subject Selector */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-slate-100 pb-6">
          <div>
            <button 
              onClick={() => setSelectedSubject(null)}
              className="flex items-center gap-1 text-slate-400 hover:text-[#005c8d] transition-colors uppercase font-black text-[9px] tracking-widest mb-2 group"
            >
              <ArrowLeft size={12} strokeWidth={3} className="group-hover:-translate-x-1 transition-transform" />
              Povratak na odabir predmeta
            </button>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{activeSubject.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-blue-50 text-[#005c8d] text-[9px] font-black uppercase rounded tracking-widest border border-blue-100">
                Aritmetička sredina: {average}
              </span>
            </div>
          </div>

          {/* Subject Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-[#005c8d] text-white text-[10px] font-black uppercase tracking-widest rounded transition-all hover:bg-[#004a73]">
              Odaberite predmet <ChevronRight size={14} className="rotate-90" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden hidden group-hover:block z-50">
              {subjects.sort((a,b) => (String(a.name || "")).localeCompare(b.name)).map(subject => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubject(subject.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors",
                    selectedSubject === subject.id ? "text-[#005c8d] bg-blue-50" : "text-slate-700"
                  )}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grade Grid */}
        <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="p-4 border-r border-slate-300 w-1/4">Elementi vrednovanja</th>
                  {MONTHS_ORDER.map(m => (
                    <th key={m} className="p-2 border-r border-slate-300 text-center w-12">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradingElements.length > 0 ? gradingElements.map((ge) => (
                  <tr key={ge.id} className="border-b border-slate-300">
                    <td className="p-4 border-r border-slate-300 font-bold text-slate-700 bg-slate-50/30 text-xs">{ge.name}</td>
                    {MONTHS_ORDER.map(m => (
                      <td key={m} className="p-1 border-r border-slate-300 text-center align-middle bg-white group hover:bg-slate-50 transition-colors">
                        <div className="flex flex-wrap justify-center gap-1.5 min-h-[30px]">
                          {gridGrades[ge.name]?.[m]?.map((v, i) => (
                            <span key={i} className="text-sm font-black text-[#005c8d]">{v}</span>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={13} className="p-4 text-center text-slate-400 text-xs font-bold uppercase">Nema definiranih elemenata ocjenjivanja.</td>
                  </tr>
                )}
                <tr className="border-b border-slate-300 bg-slate-50 font-black">
                  <td className="p-4 border-r border-slate-300 uppercase text-[10px] tracking-widest text-slate-400">ZAKLJUČENO</td>
                  <td className="p-4 border-r border-slate-300 text-center text-red-600 text-xs font-bold" colSpan={5}>
                    {(() => {
                      const fg = activeFinalGrades.find(f => f.period === 'FIRST_TERM' || f.term === 'FIRST_SEMESTER');
                      return fg ? (finalGradeLabels[fg.value] || fg.value) : '';
                    })()}
                  </td>
                  <td className="p-4 border-r border-slate-300 text-center text-red-600 text-xs font-bold" colSpan={5}>
                    {(() => {
                      const fg = activeFinalGrades.find(f => f.period === 'SECOND_TERM' || f.term === 'FINAL');
                      return fg ? (finalGradeLabels[fg.value] || fg.value) : '';
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* List of grades and notes */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b-2 border-slate-100 pb-2">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Bilješke i pojedinačne ocjene</h2>
          </div>
          
          <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-slate-400">
                  <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-28 border-r border-slate-200">Datum</th>
                  <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-20 border-r border-slate-200">Ocjena</th>
                  <th className="p-4 text-[9px] font-black uppercase tracking-widest border-r border-slate-200">Element</th>
                  <th className="p-4 text-[9px] font-black uppercase tracking-widest">Bilješka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {activeGrades.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(g => (
                  <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-center text-xs font-bold text-slate-500 border-r border-slate-200">
                      {new Date(g.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                    </td>
                    <td className="p-4 text-center text-lg font-black text-[#005c8d] border-r border-slate-200">{g.value}</td>
                    <td className="p-4 text-xs font-bold text-slate-700 border-r border-slate-200">
                      {g.category}
                    </td>
                    <td className="p-4 text-xs text-slate-600 leading-relaxed italic">
                      {g.note || '—'}
                    </td>
                  </tr>
                ))}
                {activeGrades.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-300 font-black uppercase tracking-widest text-[10px]">Nema unesenih ocjena</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lektire za Hrvatski jezik */}
        {(activeSubject?.name || '').toLowerCase().includes('hrvatski') && (
          <div className="space-y-6 pt-6">
            <div className="flex items-center gap-2 border-b-2 border-slate-100 pb-2">
              <BookOpen size={16} className="text-[#005c8d]" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Lektire / Obrađena djela</h2>
            </div>

            <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-400">
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-32 border-r border-slate-200">Datum obrade</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest border-r border-slate-200 w-1/3 text-left">Naslov djela</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-left">Način obrade / Detalji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {subjectLektire.map(lek => (
                    <tr key={lek.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-center text-xs font-bold text-slate-400 border-r border-slate-200">
                        {new Date(lek.completedDate || lek.completed_date).toLocaleDateString('hr-HR')}
                      </td>
                      <td className="p-4 text-xs font-bold text-slate-800 border-r border-slate-200">
                        {lek.title}
                      </td>
                      <td className="p-4 text-xs text-slate-600 italic whitespace-pre-wrap leading-relaxed">
                        {lek.description || 'Nema dodatnih napomena o obradi.'}
                      </td>
                    </tr>
                  ))}
                  {subjectLektire.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-slate-400 italic text-xs">
                        Nema unesenih lektira za ovaj predmet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Special exams section */}
        {specialExams.filter(se => se.subjectId === activeSubject.id).length > 0 && (
          <div className="space-y-6 pt-4 border-t-2 border-slate-100">
            <div className="flex items-center gap-2 border-b-2 border-slate-100 pb-2">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Dopunski i razlikovni ispiti</h2>
            </div>
            
            <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-400">
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-28 border-r border-slate-200">Datum</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest border-r border-slate-200">Vrsta ispita</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-20 border-r border-slate-200">Ocjena</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest border-r border-slate-200">Nastavnik</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest">Bilješka</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {specialExams
                    .filter(se => se.subjectId === activeSubject.id)
                    .sort((a,b) => (String(b.date || "")).localeCompare(a.date))
                    .map(se => {
                      const teacherStr = teachers[se.teacherId] ? formatPersonName(teachers[se.teacherId]) : (teachers[se.createdBy] ? formatPersonName(teachers[se.createdBy]) : '—');
                      return (
                        <tr key={se.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-center text-xs font-bold text-slate-500 border-r border-slate-200">
                            {new Date(se.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                          </td>
                          <td className="p-4 text-xs font-black text-slate-800 uppercase tracking-wide border-r border-slate-200">{specialExamTypeLabels[se.type] || se.type}</td>
                          <td className="p-4 text-center text-lg font-black text-[#005c8d] border-r border-slate-200">{se.gradeValue || '—'}</td>
                          <td className="p-4 text-xs font-bold text-slate-600 border-r border-slate-200">
                            {teacherStr}
                          </td>
                          <td className="p-4 text-xs text-slate-600 leading-relaxed italic">
                            {se.note || '—'}
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

