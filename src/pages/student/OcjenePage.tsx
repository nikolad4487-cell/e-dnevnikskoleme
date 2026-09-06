import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Grade, Subject, User, ClassSubjectTeacher, specialExamTypes, specialExamTypeLabels } from '../../types';
import { cn, formatPersonName, finalGradeLabels, formatSubjectDisplayName, formatSubjectName } from '../../lib/utils';
import { BookOpen, GraduationCap, ChevronRight, ArrowLeft } from 'lucide-react';
import { mappers, mapList } from '../../lib/mappers';
import { isClassEligibleForFinalThesis } from '../../lib/thesisHelper';
import { getDefaultGradingElementsForSubject } from '../../lib/gradingElementTemplates';

const normalizeElementName = (name?: string | null) => String(name || '').toLowerCase().trim();
const displayElementName = (name?: string | null) => String(name || '').toLocaleUpperCase('hr-HR');

const dedupeGradingElementsByName = (elements: any[]) => {
  const unique = new Map<string, any>();
  elements.forEach((element) => {
    const key = normalizeElementName(element.name);
    if (key && !unique.has(key)) {
      unique.set(key, element);
    }
  });
  return Array.from(unique.values());
};

const mergeDefaultGradingElements = (elements: any[], subjectName?: string | null) => {
  const merged = [...elements];
  const existingNames = new Set(merged.map(element => normalizeElementName(element.name)));
  getDefaultGradingElementsForSubject(subjectName || '').forEach((name, index) => {
    const key = normalizeElementName(name);
    if (!existingNames.has(key)) {
      merged.push({ id: `default-${key}`, name, displayOrder: elements.length + index });
      existingNames.add(key);
    }
  });
  return dedupeGradingElementsByName(merged);
};

export default function OcjenePage() {
  const navigate = useNavigate();
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
  const [showAllGrades, setShowAllGrades] = useState(false);

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
      
      const activeSubjectForElements = subjects.find(subject => subject.id === selectedSubject);
      const elements = mergeDefaultGradingElements(
        data ? mapList(data, mappers.gradingElement) : [],
        activeSubjectForElements?.name
      );
      setGradingElements(elements);
      
      console.log("STUDENT ASSESSMENT ELEMENTS", elements);
      console.log("SUBJECT ID", selectedSubject);
      console.log("CLASS ID", selectedClassId);
    };

    fetchGradingElements();
  }, [targetStudent?.id, selectedClassId, selectedSubject, selectedSchoolId, subjects]);

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
        const { data: classData } = await supabase
          .from('classes')
          .select('*, programs:program_id(*)')
          .eq('id', selectedClassId)
          .single();
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
        
        const mappedList = mapList(finalGradesData, mappers.finalGrade).map((fg: any) => {
          const isStatus = ["NEOCIJENJEN", "OSLOBODEN", "ODRADENO", "NEODRADENO"].includes(fg.value);
          return {
            ...fg,
            status: isStatus ? fg.value : null,
            value: isStatus ? '' : fg.value
          };
        });
        setFinalGrades(mappedList);

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
        const class_id = selectedClassId;
        const subject_id = selectedSubject;
        const school_year_id = currentClass?.school_year_id || null;

        console.log("STUDENT LOAD READINGS FILTERS", {
          class_id,
          subject_id,
          school_year_id
        });

        let query = supabase
          .from('reading_assignments')
          .select('*')
          .eq('class_id', class_id)
          .eq('subject_id', subject_id);

        if (school_year_id) {
          query = query.eq('school_year_id', school_year_id);
        }

        const { data, error } = await query;
        console.log("STUDENT LOAD READINGS RESULT", { data, error });

        if (error) throw error;
        setSubjectLektire(data || []);
      } catch (err) {
        console.error("Error loading subject lektire:", err);
      }
    };
    fetchLektire();
  }, [selectedClassId, selectedSubject, currentClass?.school_year_id]);

  const MONTHS_ORDER = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const MONTH_MAP = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
  const uniqueSubjects = Object.values(subjects.reduce((acc, curr) => {
    if (!acc[curr.name]) {
      acc[curr.name] = { ...curr, ids: [curr.id] };
    } else {
      acc[curr.name].ids.push(curr.id);
    }
    return acc;
  }, {} as Record<string, Subject & { ids: string[] }>)).sort((a: any, b: any) => (String(a.name || "")).localeCompare(b.name));

  const getSubjectTeachersString = (subjectIds: string[]) => {
    const matchedCsts = subjectTeachers.filter(c => subjectIds.includes(c.subjectId));
    const matchedTeachers = matchedCsts.map(c => teachers[c.teacherId]).filter(Boolean);
    const uniqueTeachers = Array.from(new Map(matchedTeachers.map(item => [item.id, item])).values());
    return uniqueTeachers.length > 0
      ? uniqueTeachers.map(t => formatPersonName(t)).join(', ')
      : 'Nastavnik nije dodijeljen';
  };

  const formatGradeDate = (date?: string) => date ? new Date(date).toLocaleDateString('hr-HR', { day: 'numeric', month: 'numeric' }) + '.' : '—';
  const canAccessFinalThesis = isClassEligibleForFinalThesis(currentClass);

  const downloadAllGradesPdf = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const studentName = targetStudent ? formatPersonName(targetStudent) : 'Ucenik';
    let y = 20;

    uniqueSubjects.forEach((subject: any) => {
      const rows = grades
        .filter(g => subject.ids.includes(g.subjectId) && !g.isFinal)
        .sort((a, b) => (String(b.date || '')).localeCompare(a.date || ''))
        .map(g => [
          formatGradeDate(g.date),
          g.note || '—',
          g.category || g.element || '—',
          String(g.value ?? '—')
        ]);

      if (rows.length === 0) return;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      autoTable(doc, {
        startY: y,
        head: [[formatSubjectName(subject), '', '', ''], ['Datum', 'Bilješka', 'Element vrednovanja', 'Ocjena']],
        body: rows,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2,
          textColor: [0, 0, 0],
          lineColor: [185, 193, 204],
          lineWidth: 0.1,
          valign: 'middle',
          halign: 'center'
        },
        headStyles: {
          fillColor: [238, 243, 247],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 100, halign: 'center' },
          2: { cellWidth: 48, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' }
        },
        didParseCell: data => {
          if (data.section === 'head' && data.row.index === 0 && data.column.index === 0) {
            data.cell.colSpan = 4;
          }
          if (data.section === 'head' && data.row.index === 0 && data.column.index > 0) {
            data.cell.text = [];
          }
        },
        margin: { left: 10, right: 10 }
      });
      y = (doc as any).lastAutoTable.finalY + 7;
    });

    doc.setFontSize(7);
    doc.text(`${studentName} - ${currentClass?.school_year || ''}`, 10, 290);
    doc.save(`${studentName.replace(/\s+/g, '-')}-${String(currentClass?.school_year || 'ocjene').replace(/[/.]/g, '_')}.pdf`);
  };

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
      <div className="flex flex-col h-full bg-white overflow-auto font-sans">
        <div className="p-4 md:p-5 w-full space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-base font-normal text-slate-900 leading-none">{showAllGrades ? 'SVE OCJENE' : 'ODABIR PREDMETA'}</h1>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => setShowAllGrades(prev => !prev)} className="px-4 py-2 bg-[#1780c2] text-white rounded-md text-sm font-medium">{showAllGrades ? 'Odabir predmeta' : 'Sve ocjene'}</button>
              <button onClick={downloadAllGradesPdf} className="px-4 py-2 bg-[#1780c2] text-white rounded-md text-sm font-medium">PDF</button>
              {canAccessFinalThesis && (
                <button onClick={() => navigate('/student/zavrsni-rad')} className="px-4 py-2 bg-[#1780c2] text-white rounded-md text-sm font-medium">Završni rad</button>
              )}
            </div>
          </div>

          {showAllGrades ? (
            <div className="space-y-5">
              <div className="flex justify-end">
                <div className="relative group">
                  <button className="bg-[#1780c2] text-white px-4 py-2 rounded-md text-sm font-medium min-w-[220px] text-left">Odaberite predmet</button>
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 shadow-xl rounded-md overflow-hidden hidden group-hover:block z-20">
                    {uniqueSubjects.map((subject: any) => (
                      <button
                        key={subject.name}
                        onClick={() => {
                          setSelectedSubject(subject.ids[0]);
                          setShowAllGrades(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        {formatSubjectName(subject)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {uniqueSubjects.map((subject: any) => {
                const subjectGrades = grades
                  .filter(g => subject.ids.includes(g.subjectId) && !g.isFinal)
                  .sort((a,b) => (String(b.date || "")).localeCompare(a.date || ''));
                if (subjectGrades.length === 0) return null;
                return (
                  <div key={subject.name} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="bg-[#1780c2] text-white text-center font-bold py-2">{formatSubjectName(subject)}</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-center text-slate-950 bg-white border border-slate-200 normal-case text-sm">Datum</th>
                          <th className="text-center text-slate-950 bg-white border border-slate-200 normal-case text-sm">Bilješka</th>
                          <th className="text-center text-slate-950 bg-white border border-slate-200 normal-case text-sm">Element vrednovanja</th>
                          <th className="text-center text-slate-950 bg-white border border-slate-200 normal-case text-sm">Ocjena</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectGrades.map(g => (
                          <tr key={g.id}>
                            <td className="text-center border border-slate-200 text-slate-950">{formatGradeDate(g.date)}</td>
                            <td className="border border-slate-200 text-slate-950 whitespace-pre-wrap">{g.note || '—'}</td>
                            <td className="text-center border border-slate-200 text-slate-950">{g.category || g.element || '—'}</td>
                            <td className="text-center border border-slate-200 text-slate-950">{g.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-2">
            {uniqueSubjects.map((subject: any) => {
              const subjectGrades = grades.filter(g => subject.ids.includes(g.subjectId) && !g.isFinal);
              const subjectAvg = subjectGrades.length > 0 
                ? (subjectGrades.reduce((acc, curr) => acc + curr.value, 0) / subjectGrades.length).toFixed(2)
                : '-';
              const teachersString = getSubjectTeachersString(subject.ids);

              return (
                <button
                  key={subject.name}
                  onClick={() => setSelectedSubject(subject.ids[0])}
                  className="group bg-white border border-slate-100 rounded-lg px-3 py-2.5 flex items-center justify-between hover:shadow-md transition-all text-left shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-tight">{formatSubjectName(subject)}</h3>
                      <p className="text-xs font-normal text-slate-700 leading-tight">
                        {teachersString}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className={cn(
                        "min-w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
                        subjectAvg === '-' ? "text-slate-300" : "bg-[#1780c2] text-white"
                      )}>
                        {subjectAvg}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {subjects.length === 0 && (
              <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-lg">
                <GraduationCap size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nema aktivnih upisa predmeta</p>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    );
  }

  // --- SUBJECT DETAIL VIEW ---
  const activeSubject = subjects.find(s => s.id === selectedSubject);
  if (!activeSubject) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-sm text-slate-500 font-bold uppercase">Predmet nije pronađen</p>
        <button onClick={() => setSelectedSubject(null)} className="mt-4 px-4 py-2 bg-[#005c8d] text-white text-xs font-bold rounded">ODABIR PREDMETA</button>
      </div>
    );
  }
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
      <div className="p-4 md:p-5 w-full space-y-8">
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
                  {formatSubjectName(subject)}
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
                <tr className="bg-[#1780c2] border-b border-[#1780c2] text-[10px] font-black text-white uppercase tracking-widest">
                  <th className="p-4 border-r border-blue-100/40 w-1/4">Elementi vrednovanja</th>
                  {MONTHS_ORDER.map(m => (
                    <th key={m} className="p-2 border-r border-blue-100/40 text-center w-12">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradingElements.length > 0 ? gradingElements.map((ge) => (
                  <tr key={ge.id} className="border-b border-slate-300">
                    <td className="p-4 border-r border-slate-300 font-bold text-slate-700 bg-slate-50/30 text-xs">{displayElementName(ge.name)}</td>
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
                  <td className="p-4 border-r border-slate-300 text-center text-[#005c8d] text-xs font-bold" colSpan={4}>
                    {(() => {
                      const fg = activeFinalGrades.find(f => f.period === 'FIRST_SEMESTER');
                      if (fg?.status) return fg.status === 'NEOCIJENJEN' ? 'Neocijenjen' : fg.status === 'OSLOBODEN' ? 'Oslobođen' : fg.status === 'ODRADENO' ? 'Odrađeno' : 'Neodrađeno';
                      return fg ? (finalGradeLabels[fg.value] || fg.value) : '';
                    })()}
                  </td>
                  <td className="p-4 border-r border-slate-300 text-center text-[#005c8d] text-xs font-bold" colSpan={6}>
                    {(() => {
                      const fg = activeFinalGrades.find(f => f.period === 'SECOND_SEMESTER');
                      if (fg?.status) return fg.status === 'NEOCIJENJEN' ? 'Neocijenjen' : fg.status === 'OSLOBODEN' ? 'Oslobođen' : fg.status === 'ODRADENO' ? 'Odrađeno' : 'Neodrađeno';
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
          
          {/* Mobile view */}
          <div className="md:hidden space-y-2">
            {activeGrades.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(g => (
              <div key={g.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">
                    {new Date(g.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                  </span>
                  <span className="px-2 py-0.5 bg-blue-50 text-[#005c8d] text-xs font-black rounded-sm">{g.value}</span>
                </div>
                <div>
                  <div className="text-xs font-black text-slate-700">{g.category}</div>
                  <div className="text-xs text-slate-500 italic mt-1 leading-normal">{g.note || '—'}</div>
                </div>
              </div>
            ))}
            {activeGrades.length === 0 && (
              <div className="p-8 text-center text-slate-300 font-bold text-xs uppercase bg-white border border-slate-200 rounded-lg">Nema unesenih ocjena</div>
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block bg-white border border-slate-300 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1780c2] border-b border-[#1780c2] text-white">
                  <th className="p-3 text-xs font-bold text-center w-28 border-r border-blue-100/40">Datum</th>
                  <th className="p-3 text-xs font-bold text-center w-20 border-r border-blue-100/40">Ocjena</th>
                  <th className="p-3 text-xs font-bold border-r border-blue-100/40">Element</th>
                  <th className="p-3 text-xs font-bold">Bilješka</th>
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

        {/* Lektire za predmet */}
        {activeSubject.isCroatianLanguage && (
          <div className="space-y-6 pt-6">
            <div className="flex items-center gap-2 border-b-2 border-slate-100 pb-2">
              <BookOpen size={16} className="text-[#005c8d]" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Lektire / Obrađena djela</h2>
            </div>

            {/* Mobile view */}
            <div className="md:hidden space-y-2">
              {subjectLektire && subjectLektire.length > 0 ? (
                subjectLektire.map(lek => (
                  <div key={lek.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                      <span>Datum: {lek.processed_at ? new Date(lek.processed_at).toLocaleDateString('hr-HR') : '—'}</span>
                    </div>
                    <div className="text-xs font-black text-slate-800">{lek.title}</div>
                    <div className="text-xs text-slate-600 italic leading-normal mt-1 whitespace-pre-wrap">{lek.processing_details || '—'}</div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-300 font-bold text-xs uppercase bg-white border border-slate-200 rounded-lg">Nema unesenih lektira za ovaj predmet.</div>
              )}
            </div>

            {/* Desktop view */}
            <div className="hidden md:block bg-white border border-slate-300 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-400">
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-center w-32 border-r border-slate-200">Datum obrade</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest border-r border-slate-200 w-1/3 text-left">Naslov djela</th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-left">Način obrade / Detalji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {subjectLektire && subjectLektire.length > 0 ? (
                    subjectLektire.map(lek => (
                      <tr key={lek.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-center text-xs font-bold text-slate-400 border-r border-slate-200">
                          {lek.processed_at ? new Date(lek.processed_at).toLocaleDateString('hr-HR') : '—'}
                        </td>
                        <td className="p-4 text-xs font-bold text-slate-800 border-r border-slate-200">
                          {lek.title}
                        </td>
                        <td className="p-4 text-xs text-slate-600 italic whitespace-pre-wrap leading-relaxed">
                          {lek.processing_details || '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-slate-300 font-black uppercase tracking-widest text-[10px]">
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
            
            {/* Mobile view */}
            <div className="md:hidden space-y-2">
              {specialExams
                .filter(se => se.subjectId === activeSubject.id)
                .sort((a,b) => (String(b.date || "")).localeCompare(a.date))
                .map(se => {
                  const teacherStr = teachers[se.teacherId] ? formatPersonName(teachers[se.teacherId]) : (teachers[se.createdBy] ? formatPersonName(teachers[se.createdBy]) : '—');
                  return (
                    <div key={se.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400">
                          {new Date(se.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-[#005c8d] text-xs font-black rounded">{se.gradeValue || '—'}</span>
                      </div>
                      <div className="text-xs font-black text-slate-800 uppercase tracking-wide">{specialExamTypeLabels[se.type] || se.type}</div>
                      <div className="text-xs text-slate-500 font-bold">Nastavnik: {teacherStr}</div>
                      <div className="text-xs text-slate-600 italic leading-normal mt-1">{se.note || '—'}</div>
                    </div>
                  );
                })}
            </div>

            {/* Desktop view */}
            <div className="hidden md:block bg-white border border-slate-300 overflow-hidden shadow-sm">
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

