import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, Grade, Subject, StudentNote, Exam, FinalGrade, ClassSubjectTeacher as SubjectTeachingAssignment, StudentSubjectEnrollment, StudentNotes, ClassNotes, StudentYearSummary, specialExamTypeLabels } from '../../types';
import { cn, formatName, getSurname, formatSubjectDisplayName, finalGradeLabels, sortStudentsBySurname } from '../../lib/utils';
import { mappers, mapList } from '../../lib/mappers';
import { Plus, Table as TableIcon, Users, ChevronLeft, BookOpen, MessageSquare, ClipboardList, Trash2, User as UserIcon, X, Copy, Edit2, Check } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { SpecialExamReGradeModal } from '../../components/SpecialExamReGradeModal';
import { toast } from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

type ViewMode = 'STUDENTS' | 'SUBJECTS' | 'GRADES' | 'NOTES';



function GroupFinalGradeModal({ isOpen, onClose, students, activeSubject, effectiveClassId, selectedSchoolId, user, classes, onRefresh }: any) {
  const [period, setPeriod] = useState<'FIRST_TERM' | 'SECOND_TERM'>('FIRST_TERM');
  const [studentData, setStudentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, period]);

  const fetchData = async () => {
    setLoading(true);
    const { data: grades } = await supabase
        .from('grades')
        .select('*')
        .eq('subject_id', activeSubject?.id)
        .eq('class_id', effectiveClassId)
        .eq('is_final', false);
    
    const { data: finals } = await supabase
        .from('final_grades')
        .select('*')
        .eq('subject_id', activeSubject?.id)
        .eq('class_id', effectiveClassId)
        .eq('period', period);

    const mapped = students.map((s: any) => {
        const studentGrades = (grades || []).filter((g: any) => g.student_id === s.id);
        const sum = studentGrades.reduce((a: number, c: any) => a + c.value, 0);
        const avg = studentGrades.length ? (sum / studentGrades.length).toFixed(2) : '-';
        const existing = (finals || []).find((f: any) => f.student_id === s.id);
        return { ...s, avg, existing, newGrade: existing ? existing.value : '' };
    });
    setStudentData(mapped);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const selectedClass = classes.find((c: any) => c.id === effectiveClassId);
    const schoolYearId = selectedClass?.school_year_id || '';
    const teacherId = user?.id;

    const upserts = studentData.filter((s:any) => s.newGrade !== (s.existing?.value || '')).map((s:any) => ({
        student_id: s.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        teacher_id: teacherId,
        school_year_id: schoolYearId,
        period: period,
        term: period, // term should be the same as period
        value: s.newGrade,
        updated_at: new Date().toISOString()
    }));

    if (upserts.length > 0) {
        console.log("UPSERT FINAL GRADE PAYLOAD Chunks", upserts);
        console.log("UPSERT FINAL GRADE ON CONFLICT", "student_id,subject_id,class_id,school_year_id,period");

        try {
            const { error } = await supabase
              .from('final_grades')
              .upsert(upserts, {
                onConflict: "student_id,subject_id,class_id,school_year_id,period"
              });

            if (error && error.code === '42P10') {
               console.warn("DB UNIQUE CONSTRAINT MISSING. Running fallback bulk select-then-write...");
               for (const row of upserts) {
                   const { data: existing, error: fe } = await supabase
                     .from('final_grades')
                     .select('id')
                     .eq('student_id', row.student_id)
                     .eq('subject_id', row.subject_id)
                     .eq('class_id', row.class_id)
                     .eq('period', row.period)
                     .maybeSingle();

                   if (existing) {
                       await supabase
                         .from('final_grades')
                         .update(row)
                         .eq('id', existing.id);
                   } else {
                       await supabase
                         .from('final_grades')
                         .insert([row]);
                   }
               }
            } else if (error) {
               throw error;
            }
        } catch (saveError: any) {
            console.error("Group final grades upsert error:", saveError);
            toast.error("Greška pri spremanju.");
            setSaving(false);
            return;
        }

        toast.success("Spremljeno.");
        onRefresh();
    }
    setSaving(false);
    onClose();
  };

  if(!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#005c8d]/60 z-[300] p-4 pt-10 overflow-auto">
        <div className="bg-white w-full max-w-4xl mx-auto border border-gray-400">
            <div className="p-3 bg-[#005c8d] text-white flex justify-between uppercase font-bold text-[11px] items-center">
                <h3>Grupno zaključivanje: {activeSubject?.name}</h3>
                <button onClick={onClose}><X size={16}/></button>
            </div>
            <div className="p-4 bg-gray-50 flex gap-4 text-[11px] font-bold">
                <label className="flex items-center gap-2"><input type="radio" checked={period === 'FIRST_TERM'} onChange={() => setPeriod('FIRST_TERM')} /> 1. polugodište</label>
                <label className="flex items-center gap-2"><input type="radio" checked={period === 'SECOND_TERM'} onChange={() => setPeriod('SECOND_TERM')} /> 2. polugodište</label>
            </div>
            {loading ? <div className="p-10 text-center">Učitavanje...</div> : 
            <table className="w-full text-[11px] border-collapse">
                <thead className="text-gray-400 uppercase font-bold text-left border-b">
                    <tr><th className="p-2">Učenik</th><th className="p-2">Prosjek</th><th className="p-2">Zaključak</th></tr>
                </thead>
                <tbody className="divide-y">
                    {studentData.map((s:any) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                            <td className="p-2 font-bold">{s.name}</td>
                            <td className="p-2">{s.avg}</td>
                            <td className="p-2">
                                <select value={s.newGrade} onChange={e => setStudentData(studentData.map((st:any) => st.id === s.id ? {...st, newGrade: e.target.value} : st))} className="border p-0.5 w-full">
                                    <option value="">--</option>
                                    {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                                    <option value="Neocijenjen">Neocijenjen</option>
                                    <option value="Oslobođen">Oslobođen</option>
                                    <option value="Odrađeno">Odrađeno</option>
                                    <option value="Neodrađeno">Neodrađeno</option>
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>}
            <div className="p-4 border-t flex justify-center gap-2">
                <button onClick={onClose} className="p-2 px-6 border text-[10px] font-bold uppercase">Odustani</button>
                <button onClick={handleSave} disabled={saving} className="p-2 px-6 bg-[#005c8d] text-white text-[10px] font-bold uppercase">{saving ? 'Spremanje...' : 'Spremi'}</button>
            </div>
        </div>
    </div>
  );
}

export default function ImenikPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId, isArchived } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  usePageTitle("Imenik");

  if (!effectiveClassId) {
    return (
      <div className="p-10 text-center">
        <p className="text-gray-500 font-bold uppercase text-xs">Razred nije pronađen.</p>
      </div>
    );
  }

  const [classes, setClasses] = useState<Class[]>([]);
  const is4K = useMemo(() => classes.find((c: any) => c.id === effectiveClassId)?.name === '4.K', [classes, effectiveClassId]);
  const [students, setStudents] = useState<User[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectTeachingAssignment[]>([]);
  const [enrollments, setEnrollments] = useState<StudentSubjectEnrollment[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('STUDENTS');
  const [activeStudent, setActiveStudent] = useState<User | null>(null);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);

  const [gradingElements, setGradingElements] = useState<any[]>([]);

  const gradingElementNames = gradingElements.map(ge => ge.name);

  const MONTHS_ORDER = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const MONTH_MAP = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
  
  const [currentGrades, setCurrentGrades] = useState<Grade[]>([]);
  const [currentNotes, setCurrentNotes] = useState<StudentNote[]>([]);
  const [finalGrades, setFinalGrades] = useState<FinalGrade[]>([]);
  const [specialExams, setSpecialExams] = useState<Exam[]>([]);
  const [studentOverallNotes, setStudentOverallNotes] = useState<StudentNotes | null>(null);
  const [classOverallNotes, setClassOverallNotes] = useState<ClassNotes | null>(null);
  const [studentYearSummary, setStudentYearSummary] = useState<StudentYearSummary | null>(null);
  const [isEditingOverallNotes, setIsEditingOverallNotes] = useState(false);
  const [isEditingClassNotes, setIsEditingClassNotes] = useState(false);
  const [overallNotesForm, setOverallNotesForm] = useState<Partial<StudentNotes>>({});
  const [classNotesForm, setClassNotesForm] = useState<Partial<ClassNotes>>({});

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    type: 'GRADE' | 'NOTE' | 'SPECIAL_EXAM' | 'FINAL_GRADE' | null;
    loading: boolean;
    message?: string;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false
  });

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showGroupGradeModal, setShowGroupGradeModal] = useState(false);
  const [showGroupNoteModal, setShowGroupNoteModal] = useState(false);
  const [showFinalGradeModal, setShowFinalGradeModal] = useState(false);
  const [showSpecialExamModal, setShowSpecialExamModal] = useState(false);
  const [showSpecialExamReGradeModal, setShowSpecialExamReGradeModal] = useState(false);
  const [selectedSpecialExamForReGrade, setSelectedSpecialExamForReGrade] = useState<{
    student: any,
    subject: any,
    exams: any[],
    finalGrade: any,
  } | null>(null);
  const [showGroupFinalGradeModal, setShowGroupFinalGradeModal] = useState(false);
  const [showGradingElementsModal, setShowGradingElementsModal] = useState(false);
  
  const [newGrade, setNewGrade] = useState({ 
    value: 5, 
    category: '', 
    note: '', 
    isImportant: true, 
    customDate: new Date().toISOString().split('T')[0] 
  });
  const [newSpecialExam, setNewSpecialExam] = useState<{
    type: 'SUPPLEMENTARY' | 'REMEDIAL' | 'DIFFERENCE' | 'SUPPLEMENTARY_WORK' | 'MAKEUP_EXAM' | 'DIFFERENTIAL_EXAM' | 'CLASS_EXAM' | 'SUBJECT_EXAM';
    note: string;
    grade: number;
    customDate: string;
    gradeLevel: number;
    subjectId: string;
  }>({
    type: 'SUPPLEMENTARY',
    note: '',
    grade: 0,
    customDate: new Date().toISOString().split('T')[0],
    gradeLevel: 1,
    subjectId: ''
  });
  const [newNote, setNewNote] = useState({
    content: '',
    customDate: new Date().toISOString().split('T')[0]
  });
  const [selectedFinalPeriod, setSelectedFinalPeriod] = useState<'1' | '2' | 'FINAL'>('2');
  const [groupGradeForm, setGroupGradeForm] = useState({
    category: '',
    isImportant: true,
    customDate: new Date().toISOString().split('T')[0],
    note: '',
    studentGrades: {} as Record<string, { value: number | null, note: string }>
  });
  const [groupNoteForm, setGroupNoteForm] = useState({
    customDate: new Date().toISOString().split('T')[0],
    content: '',
    studentNotes: {} as Record<string, string>
  });

  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [isEditingGrade, setIsEditingGrade] = useState(false);
  const [gradeEditForm, setGradeEditForm] = useState({ note: '' });
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const [showAdminDeleteAuth, setShowAdminDeleteAuth] = useState(false);
  const [randomSelectedStudentId, setRandomSelectedStudentId] = useState<string | null>(null);

  const [classSubjects, setClassSubjects] = useState<any[]>([]);

  const activeClassSubject = classSubjects.find(cs => cs.subjectId === activeSubject?.id && cs.classId === effectiveClassId);
  const subjectDisplayName = activeSubject ? formatSubjectDisplayName(activeSubject.name || '', activeClassSubject?.subjectType || 'redovni') : '';

  useEffect(() => {
    const fetchInitial = async () => {
      if (!selectedSchoolId || !user) return;
      try {
        const { data: assignmentsRaw, error: ae } = await supabase
          .from('class_subject_teachers')
          .select('*');
        if (ae) throw ae;
        
        const formattedAssignments = mapList(assignmentsRaw || [], mappers.classSubjectTeacher);
        setSubjectAssignments(formattedAssignments);

        const { data: csRaw } = await supabase.from('class_subjects').select('*').eq('school_id', selectedSchoolId);
        if (csRaw) setClassSubjects(mapList(csRaw, mappers.classSubject));

        const { data: classesRaw, error: ce } = await supabase
          .from('classes')
          .select('*')
          .eq('school_id', selectedSchoolId);
        if (ce) throw ce;
        
        const mappedClasses = mapList(classesRaw || [], mappers.class);
        let filteredClasses = mappedClasses;

        if (!isMainAdmin) {
          const teachingClassIds = (assignmentsRaw || [])
            .filter(a => a.teacher_id === user.id)
            .map(a => a.class_id);
          
          filteredClasses = mappedClasses.filter(c => 
            c.homeroomTeacherId === user.id || 
            c.deputyTeacherId === user.id ||
            teachingClassIds.includes(c.id)
          );
        }

        setClasses(filteredClasses);

        const { data: subjectsRaw, error: se } = await supabase
          .from('subjects')
          .select('*')
          .eq('school_id', selectedSchoolId);
        if (se) throw se;
        setAllSubjects(mapList(subjectsRaw || [], mappers.subject));

        const { data: programsRaw, error: pe } = await supabase
          .from('programs')
          .select('*')
          .eq('school_id', selectedSchoolId);
        if (pe) throw pe;
        setPrograms(programsRaw || []);

        const { data: teachersRaw, error: te } = await supabase
          .from('user_school_roles')
          .select('*, user:user_profiles(*)')
          .eq('school_id', selectedSchoolId)
          .in('role', [Role.TEACHER, Role.HOMEROOM]);
        if (te) throw te;

        const mappedTeachers = (teachersRaw || []).map(r => {
          const u = mappers.user(r.user);
          return {
            ...u,
            globalRole: r.role
          };
        }) as User[];
        setTeachers(mappedTeachers);
      } catch (error) {
        console.error(error);
        toast.error('Greška pri inicijalnom učitavanju');
      }
    };
    fetchInitial();
  }, [selectedSchoolId]);

  const [classWarnings, setClassWarnings] = useState<{
    failingGrades: Record<string, number>,
    pendingAbsences: Record<string, boolean>
  }>({ failingGrades: {}, pendingAbsences: {} });

  const fetchWarningData = async () => {
    if (!effectiveClassId) return;
    try {
      console.log("REFETCH WARNINGS - Class:", effectiveClassId);
      const { data: grades } = await supabase
        .from('grades')
        .select('student_id')
        .eq('class_id', effectiveClassId)
        .eq('value', 1);
      
      const { data: absences } = await supabase
        .from('absences')
        .select('student_id')
        .eq('class_id', effectiveClassId)
        .eq('status', 'PENDING');

      const failing: Record<string, number> = {};
      grades?.forEach(g => {
        failing[g.student_id] = (failing[g.student_id] || 0) + 1;
      });

      const pending: Record<string, boolean> = {};
      absences?.forEach(a => {
        pending[a.student_id] = true;
      });

      const newData = { failingGrades: failing, pendingAbsences: pending };
      console.log("WARNING DATA UPDATED", newData);
      setClassWarnings(newData);
    } catch (e) {
      console.error("Error fetching warnings:", e);
    }
  };

  useEffect(() => {
    console.log("IMENIK MOUNTED FOR CLASS:", effectiveClassId);
    console.log("IMENIK selectedClass FROM CONTEXT:", contextClassId);
  }, []);

  const fetchStudentsData = async () => {
    if (!effectiveClassId) return;
    console.log("IMENIK fetchStudents classId", effectiveClassId);
    console.log("FETCHING DATA FOR CLASS", effectiveClassId);
    setLoading(true);
    setStudents([]); // Force clear old data
    try {
      const { data, error } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', effectiveClassId)
        .eq('status', 'ACTIVE');
      if (error) throw error;
      const mappedStudents = (data || []).map(row => {
        const u = mappers.user(row.student);
        return { ...u };
      }) as User[];
      
      setStudentEnrollments(data || []);
      const uniqueStudents = Array.from(new Map(mappedStudents.map(s => [s.id, s])).values());
      setStudents(uniqueStudents);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju učenika');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveClassId) {
      setActiveStudent(null);
      setActiveSubject(null);
      setViewMode('STUDENTS');
      fetchStudentsData();
      fetchWarningData();
    }
  }, [effectiveClassId]);

  useEffect(() => {
    if (viewMode === 'STUDENTS' && effectiveClassId) {
      fetchWarningData();
    }
  }, [viewMode, effectiveClassId, activeStudent?.id, activeSubject?.id]);

  useEffect(() => {
    // Real-time listener for enrollments (DISABLED)
    /*
    const enrollChannel = supabase
      .channel('public:student_subject_enrollments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_subject_enrollments' }, () => {
        supabase.from('student_subject_enrollments').select('*').then(({ data }) => {
          if (data) setEnrollments(mapList(data, mappers.studentSubjectEnrollment));
        });
      })
      .subscribe();
    */

    supabase.from('student_subject_enrollments').select('*').then(({ data }) => {
      if (data) setEnrollments(mapList(data, mappers.studentSubjectEnrollment));
    });

    return () => {
      // supabase.removeChannel(enrollChannel);
    };
  }, []);

  useEffect(() => {
    const gradeChannel: any = null;
    const noteChannel: any = null;

    if (viewMode === 'GRADES' && activeStudent && activeSubject) {
      const fetchGradingElements = async () => {
        const { data } = await supabase
          .from('grading_elements')
          .select('*')
          .eq('school_id', selectedSchoolId)
          .eq('class_id', effectiveClassId)
          .eq('subject_id', activeSubject.id)
          .eq('teacher_id', user?.id)
          .order('display_order', { ascending: true });
        if (data) setGradingElements(mapList(data, mappers.gradingElement));
      };

      const fetchGrades = async () => {
        const selectedClass = classes.find(c => c.id === effectiveClassId);
        const isClassAdmin = isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;

        let query = supabase
          .from('grades')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id)
          .eq('is_final', false);
        
        if (!isClassAdmin) {
          query = query.eq('teacher_id', user?.id);
        }

        const { data } = await query;
        if (data) setCurrentGrades(mapList(data, mappers.grade));
      };
      
      const fetchNotes = async () => {
        const selectedClass = classes.find(c => c.id === effectiveClassId);
        const isClassAdmin = isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;

        let query = supabase
          .from('student_notes')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id);

        if (!isClassAdmin) {
          query = query.eq('teacher_id', user?.id);
        }

        const { data } = await query;
        if (data) setCurrentNotes(mapList(data, mappers.note) as any);
      };

      const fetchFinals = async () => {
        const { data } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id)
          .eq('class_id', effectiveClassId)
          .eq('is_final', true);
        if (data) setFinalGrades(mapList(data, mappers.grade));
      };

      fetchGradingElements();
      fetchGrades();
      fetchNotes();
      fetchFinals();
      fetchSpecialExams();

      /* Realtime disabled to prevent loops
      gradeChannel = supabase.channel('grades_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grades', filter: `student_id=eq.${activeStudent.id}` }, fetchGrades)
        .subscribe();
      
      noteChannel = supabase.channel('notes_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_notes', filter: `student_id=eq.${activeStudent.id}` }, fetchNotes)
        .subscribe();
      */
    }

    return () => {
      /*
      if (gradeChannel) supabase.removeChannel(gradeChannel);
      if (noteChannel) supabase.removeChannel(noteChannel);
      */
    };
  }, [viewMode, activeStudent, activeSubject, effectiveClassId]);

  useEffect(() => {
    const snChannel: any = null;
    const cnChannel: any = null;

    if (viewMode === 'NOTES' && activeStudent && effectiveClassId) {
      const selectedClass = classes.find(c => c.id === effectiveClassId);
      const schoolYear = selectedClass?.schoolYear || '2025/2026';

      const fetchSN = async () => {
        const { data } = await supabase
          .from('student_overall_notes')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('class_id', effectiveClassId)
          .limit(1)
          .maybeSingle();
        
        if (data) {
          const formatted = mappers.studentOverallNotes(data);
          setStudentOverallNotes(formatted);
          if (!isEditingOverallNotes) setOverallNotesForm(formatted);
        } else {
          setStudentOverallNotes(null);
          if (!isEditingOverallNotes) setOverallNotesForm({});
        }
      };

      const fetchCN = async () => {
        const { data } = await supabase
        .from('class_overall_notes')
          .select('*')
          .eq('class_id', effectiveClassId)
          .eq('school_year', schoolYear)
          .limit(1)
          .maybeSingle();
        if (data) {
          const formatted = mappers.classOverallNotes(data);
          setClassOverallNotes(formatted);
          if (!isEditingClassNotes) setClassNotesForm(formatted);
        } else {
          setClassOverallNotes(null);
          if (!isEditingClassNotes) setClassNotesForm({});
        }
      };

      const fetchSummary = async () => {
        const { data } = await supabase
          .from('student_year_summaries')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('class_id', effectiveClassId)
          .limit(1)
          .maybeSingle();
        if (data) {
          setStudentYearSummary(mappers.studentYearSummary(data));
        } else {
          setStudentYearSummary(null);
        }
      };

      fetchSN();
      fetchCN();
      fetchSummary();

      /* Realtime disabled
      snChannel = supabase.channel('sn_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_overall_notes', filter: `student_id=eq.${activeStudent.id}` }, fetchSN)
        .subscribe();
      */
    }
    return () => { 
      // if (snChannel) supabase.removeChannel(snChannel); 
    };
  }, [viewMode, activeStudent, effectiveClassId, isEditingOverallNotes]);

  const fetchSpecialExams = async () => {
    if (!activeStudent?.id || !activeSubject?.id || !effectiveClassId) return;

    const selectedClass = classes.find(c => c.id === effectiveClassId);
    
    if (!selectedClass) return;
    
    const schoolYearId = selectedClass.school_year_id;
    if (!schoolYearId) return;

    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('class_id', effectiveClassId)
        .eq('subject_id', activeSubject.id)
        .eq('school_year_id', schoolYearId)
        .in('exam_type', [
            'SUPPLEMENTARY_WORK',
            'MAKEUP_EXAM',
            'DIFFERENTIAL_EXAM',
            'CLASS_EXAM',
            'SUBJECT_EXAM',
            'DIFFERENCE',
            'SUPPLEMENTARY',
            'REMEDIAL'
        ]);
      
      console.log("TEACHER INITIAL SPECIAL EXAMS LOAD");
      console.log("TEACHER SPECIAL EXAMS FILTERS", { student_id: activeStudent.id, class_id: effectiveClassId, subject_id: activeSubject.id, school_year_id: schoolYearId });
      console.log("TEACHER SPECIAL EXAMS RESULT", data);
      console.log("TEACHER SPECIAL EXAMS ERROR", error);

      if (error) throw error;
      setSpecialExams(mapList(data || [], mappers.exam));
    } catch (err) {
      console.error("Error fetching special exams:", err);
    }
  };

  const fetchGradesAndNotes = async () => {
    if (!activeStudent || !activeSubject) return;
    setLoading(true);
    try {
      const { data: grades } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('subject_id', activeSubject.id)
        .eq('is_final', false)
        .order('created_at', { ascending: false });
      setCurrentGrades(mapList(grades, mappers.grade));

      const { data: notes } = await supabase
        .from('student_notes')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('subject_id', activeSubject.id)
        .order('created_at', { ascending: false });
      setCurrentNotes(mapList(notes, mappers.studentNote) as any);

      await fetchFinalGrades();
      await fetchSpecialExams();
    } finally {
      setLoading(false);
    }
  };

  const fetchFinalGrades = async () => {
    if (!activeStudent || !activeSubject || !effectiveClassId) return;
    
    const selectedClass = classes.find(c => c.id === effectiveClassId);
    const schoolYearId = selectedClass?.school_year_id || null;
    
    console.log("TEACHER FETCH FINAL GRADES START", {
      studentId: activeStudent.id,
      subjectId: activeSubject.id,
      classId: effectiveClassId,
      schoolYearId: schoolYearId
    });

    const query = supabase
      .from("final_grades")
      .select("*")
      .eq("student_id", activeStudent.id)
      .eq("subject_id", activeSubject.id)
      .eq("class_id", effectiveClassId)
      .in("period", ["FIRST_TERM", "SECOND_TERM"]);
      
    if (schoolYearId) {
      query.eq("school_year_id", schoolYearId);
    }

    const { data, error } = await query;
    console.log("TEACHER FETCH FINAL GRADES RESULT", data);
    console.log("FETCH FINAL GRADES RESULT", data);
    console.log("TEACHER FETCH FINAL GRADES ERROR", error);
    
    setFinalGrades(data || []);
  };

  useEffect(() => {
    if (activeStudent?.id && activeSubject?.id && effectiveClassId) {
      fetchFinalGrades();
    }
  }, [activeStudent?.id, activeSubject?.id, effectiveClassId, classes]);

  const canEditGrades = (subjectId: string) => {
    if (isArchived) return false;
    if (isMainAdmin) return true;
    const assignment = subjectAssignments.find(a => a.classId === effectiveClassId && a.subjectId === subjectId);
    return assignment?.teacherId === user?.id;
  };

  const isStudentActive = (studentId: string, subjectId: string) => {
    const enrollment = enrollments.find(e => e.studentId === studentId && e.subjectId === subjectId);
    return enrollment?.status === 'ACTIVE';
  };

  const handleSaveStudentNotes = async () => {
    if (!activeStudent || !effectiveClassId) return;
    setLoading(true);
    try {
      const selectedClass = classes.find(c => c.id === effectiveClassId);
      const schoolYear = selectedClass?.schoolYear || '2025/2026';
      
      const payload = {
        student_id: activeStudent.id,
        class_id: effectiveClassId,
        school_year: schoolYear,
        homeroom_note: overallNotesForm.homeroomNote || '',
        extracurricular_activities: overallNotesForm.extracurricularActivities || '',
        school_activities: overallNotesForm.schoolActivities || '',
        disciplinary_actions: overallNotesForm.disciplinaryActions || '',
        updated_at: new Date().toISOString()
      };

      if (studentOverallNotes?.id) {
        await supabase.from('student_overall_notes').update(payload).eq('id', studentOverallNotes.id);
      } else {
        await supabase.from('student_overall_notes').insert([payload]);
      }

      toast.success('Bilješke učenika spremljene');
      setIsEditingOverallNotes(false);
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju bilješki');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClassNotes = async () => {
    if (!effectiveClassId) return;
    setLoading(true);
    try {
      const selectedClass = classes.find(c => c.id === effectiveClassId);
      const schoolYear = selectedClass?.schoolYear || '2025/2026';
      
      const payload = {
        class_id: effectiveClassId,
        school_year: schoolYear,
        homeroom_info: classNotesForm.homeroomInfo || '',
        deputy_info: classNotesForm.deputyInfo || '',
      };

      if (classOverallNotes?.id) {
        await supabase.from('class_overall_notes').update(payload).eq('id', classOverallNotes.id);
      } else {
        await supabase.from('class_overall_notes').insert([payload]);
      }

      toast.success('Opće bilješke razreda spremljene');
      setIsEditingClassNotes(false);
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju bilješki razreda');
    } finally {
      setLoading(false);
    }
  };

  const renderNotesTab = () => {
    if (!activeStudent || !effectiveClassId) return null;
    const selectedClass = classes.find(c => c.id === effectiveClassId);
    const homeroomTeacher = teachers.find(t => t.id === selectedClass?.homeroomTeacherId);
    const deputyTeacher = teachers.find(t => t.id === selectedClass?.deputyTeacherId);

    const isHomeroom = user?.id === selectedClass?.homeroomTeacherId || isMainAdmin;
    const isDeputy = user?.id === selectedClass?.deputyTeacherId;

    const canModify = !isArchived && (isHomeroom || isDeputy);

    const Section = ({ title, content, field, canEdit, isClassLevel }: { title: string, content?: string, field: keyof StudentNotes | keyof ClassNotes, canEdit: boolean, isClassLevel?: boolean }) => (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase text-gray-500">{title}</h3>
          {canEdit && canModify && !(isClassLevel ? isEditingClassNotes : isEditingOverallNotes) && (
            <button onClick={() => isClassLevel ? setIsEditingClassNotes(true) : setIsEditingOverallNotes(true)} className="text-[9px] font-bold text-[#005c8d] uppercase hover:underline">
              Uredi
            </button>
          )}
        </div>
        <div className="bg-white border border-gray-300 p-2 text-[12px] min-h-[30px]">
          {(isClassLevel ? isEditingClassNotes : isEditingOverallNotes) && canEdit ? (
            <textarea 
              value={((isClassLevel ? classNotesForm[field as keyof ClassNotes] : overallNotesForm[field as keyof StudentNotes]) as string) || ''}
              onChange={e => isClassLevel 
                ? setClassNotesForm({ ...classNotesForm, [field]: e.target.value })
                : setOverallNotesForm({ ...overallNotesForm, [field]: e.target.value })
              }
              className="w-full min-h-[60px] p-2 border border-gray-100 focus:outline-[#005c8d] resize-none"
              placeholder="..."
            />
          ) : (
            <div className="text-gray-700 whitespace-pre-wrap leading-normal">
              {content || <span className="text-gray-300 italic">Nema unosa</span>}
            </div>
          )}
        </div>
      </div>
    );

    const isFinalized = !!studentYearSummary?.finalizedAt;

    return (
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
          <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#005c8d] uppercase tracking-tight leading-none">{activeStudent ? formatName(activeStudent) : ''}</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 tracking-tight">Bilješke i podaci</p>
              </div>
          </div>
          {(isEditingOverallNotes || isEditingClassNotes) && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { 
                  if (isEditingOverallNotes) { setIsEditingOverallNotes(false); setOverallNotesForm(studentOverallNotes || {}); }
                  if (isEditingClassNotes) { setIsEditingClassNotes(false); setClassNotesForm(classOverallNotes || {}); }
                }}
                className="px-3 py-1 border border-gray-300 text-gray-500 font-bold uppercase text-[10px] hover:bg-gray-50 bg-white"
              >
                Odustani
              </button>
              <button 
                onClick={isEditingClassNotes ? handleSaveClassNotes : handleSaveStudentNotes}
                className="px-3 py-1 bg-[#005c8d] text-white font-bold uppercase text-[10px] hover:bg-[#004a70]"
              >
                Spremi
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-300 p-4 space-y-4">
          <div className="bg-[#f8f9fa] p-2 border border-gray-200 mb-4">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase">Opće bilješke razreda</h4>
          </div>
          
          <Section 
            title="Razrednik" 
            content={classOverallNotes?.homeroomInfo || (homeroomTeacher ? formatName(homeroomTeacher) : '')}
            field="homeroomInfo"
            canEdit={isHomeroom}
            isClassLevel
          />

          <Section 
            title="Zamjenik razrednika" 
            content={classOverallNotes?.deputyInfo || (deputyTeacher ? formatName(deputyTeacher) : '')}
            field="deputyInfo"
            canEdit={isDeputy || isHomeroom}
            isClassLevel
          />

          <div className="bg-[#f8f9fa] p-2 border border-gray-200 mb-4 mt-6">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase">Bilješke za učenika</h4>
          </div>

          <Section 
            title="Bilješka razrednika" 
            content={studentOverallNotes?.homeroomNote}
            field="homeroomNote"
            canEdit={isHomeroom}
          />

          <Section 
            title="Izvanškolske aktivnosti" 
            content={studentOverallNotes?.extracurricularActivities}
            field="extracurricularActivities"
            canEdit={isHomeroom}
          />

          <Section 
            title="Izvannastavne aktivnosti" 
            content={studentOverallNotes?.schoolActivities}
            field="schoolActivities"
            canEdit={isHomeroom}
          />

          <Section 
            title="Pedagoške mjere" 
            content={studentOverallNotes?.disciplinaryActions}
            field="disciplinaryActions"
            canEdit={isHomeroom}
          />

          <div className="space-y-1">
            <h3 className="text-[11px] font-bold uppercase text-gray-500">Vladanje</h3>
            <div className="bg-white border border-gray-300 p-2 text-[12px] min-h-[30px]">
              {isFinalized ? (
                <div className="text-gray-700 font-bold uppercase">
                  {studentYearSummary?.behavior || 'Uzorno'}
                </div>
              ) : (
                <div className="text-gray-400 italic">Vladanje se prikazuje nakon zaključenja općeg prosjeka.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleAddGrade = async () => {
    if (!activeStudent || !activeSubject || !user) return;
    
    if (!canEditGrades(activeSubject.id)) {
      toast.error('Niste zaduženi za ovaj predmet u ovom razredu.');
      return;
    }

    if (!isStudentActive(activeStudent.id, activeSubject.id)) {
      toast.error('Učenik je oslobođen ovog predmeta.');
      return;
    }

    try {
      const { error } = await supabase.from('grades').insert([{
        student_id: activeStudent.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        school_id: selectedSchoolId,
        teacher_id: user.id,
        value: newGrade.value,
        element: newGrade.category || gradingElementNames[0],
        category: newGrade.category || gradingElementNames[0],
        note: newGrade.note,
        is_important: newGrade.isImportant,
        grade_type: 'REGULAR',
        is_final: false,
        weight: 1,
        date: newGrade.customDate
      }]);
      if (error) {
        toast.error(`Greška: ${error.message}`);
        throw error;
      }
      setShowGradeModal(false);
      await fetchGradesAndNotes();
      await fetchWarningData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateGradeNote = async () => {
    if (!selectedGrade) return;
    const payload = { note: gradeEditForm.note, updated_at: new Date().toISOString() };
    console.log("UPDATE GRADE NOTE PAYLOAD", payload);
    try {
       const { error } = await supabase
         .from('grades')
         .update(payload)
         .eq('id', selectedGrade.id);
       
       if (error) {
         console.log("UPDATE GRADE NOTE ERROR", error);
         throw error;
       }
       toast.success('Bilješka ažurirana');
       setIsEditingGrade(false);
       fetchGradesAndNotes();
    } catch (err) {
       console.error(err);
       toast.error('Greška pri ažuriranju bilješke');
    }
  };

  const handleDeleteGrade = async (gradeId: string, adminOverride = false) => {
    const grade = currentGrades.find(g => g.id === gradeId);
    if (!grade) return;

    const createdAt = grade.createdAt ? new Date(grade.createdAt) : new Date();
    const now = new Date();
    const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

    const selectedClass = classes.find(c => c.id === effectiveClassId);
    const isClassAdmin = isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;

    if (!isClassAdmin && diffMinutes > 45) {
      toast.error('Ocjena se može obrisati samo unutar 45 minuta od unosa. Nakon toga je može obrisati samo admin.');
      return;
    }

    if (isClassAdmin && diffMinutes > 45 && !adminOverride) {
      setSelectedGrade(grade);
      setShowAdminDeleteAuth(true);
      return;
    }

    if (isClassAdmin && diffMinutes > 45 && adminOverride) {
      if (deleteConfirmationCode !== '8899') {
         toast.error('Neispravan autorizacijski kod.');
         return;
      }
    }

    setDeleteDialog({
      isOpen: true,
      id: gradeId,
      type: 'GRADE',
      loading: false,
      message: 'Jeste li sigurni da želite obrisati ovu ocjenu?'
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    const note = currentNotes.find(n => n.id === noteId);
    if (!note) return;

    if (!isMainAdmin && note.teacherId !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ove bilješke.');
      return;
    }

    setDeleteDialog({ isOpen: true, id: noteId, type: 'NOTE', loading: false, message: 'Jeste li sigurni da želite obrisati ovu bilješku?' });
  };

  const handleAddNote = async () => {
    if (!activeStudent || !activeSubject || !user || !effectiveClassId || !selectedSchoolId) return;
    if (isArchived) {
      toast.error('Nije moguće uređivati arhivirane podatke.');
      return;
    }
    try {
      const { error } = await supabase.from('student_notes').insert([{
        student_id: activeStudent.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        school_id: selectedSchoolId,
        teacher_id: user.id,
        content: newNote.content,
        date: newNote.customDate
      }]);
      if (error) throw error;
      setShowNoteModal(false);
      setNewNote({ content: '', customDate: new Date().toISOString().split('T')[0] });
      fetchGradesAndNotes();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri dodavanju bilješke');
    }
  };

  const handleAddSpecialExam = async () => {
    if (!activeStudent || !activeSubject || !user || !effectiveClassId || !selectedSchoolId) return;
    if (isArchived) {
      toast.error('Nije moguće uređivati arhivirane podatke.');
      return;
    }
    
    const selectedClass = classes.find(c => c.id === effectiveClassId);
    const schoolYearId = selectedClass?.school_year_id || '';
    
    try {
      const targetSubjectId = newSpecialExam.subjectId || activeSubject.id;
      const payloadWithLevel = {
        student_id: activeStudent.id,
        subject_id: targetSubjectId,
        class_id: effectiveClassId,
        teacher_id: user.id,
        school_year_id: schoolYearId,
        exam_type: newSpecialExam.type,
        note: newSpecialExam.note || null,
        grade_value: newSpecialExam.grade || null,
        exam_date: newSpecialExam.customDate || new Date().toISOString().split('T')[0],
        exam_grade_level: newSpecialExam.gradeLevel
      };
      
      console.log("EXAM PAYLOAD WITH LEVEL", payloadWithLevel);
      
      const { error } = await supabase.from('exams').insert([payloadWithLevel]);
      
      if (error && (error.message?.includes('exam_grade_level') || error.code === 'PGRST204')) {
        console.warn("DB lacks exam_grade_level column. Retrying with serialized fallback...");
        const fallbackNote = `__grade_level:${newSpecialExam.gradeLevel}__ ${newSpecialExam.note || ''}`;
        const payloadFallback = {
          student_id: activeStudent.id,
          subject_id: targetSubjectId,
          class_id: effectiveClassId,
          teacher_id: user.id,
          school_year_id: schoolYearId,
          exam_type: newSpecialExam.type,
          note: fallbackNote,
          grade_value: payloadWithLevel.grade_value,
          exam_date: payloadWithLevel.exam_date
        };
        const { error: error2 } = await supabase.from('exams').insert([payloadFallback]);
        if (error2) throw error2;
      } else if (error) {
        throw error;
      }
      
      setShowSpecialExamModal(false);
      fetchGradesAndNotes();
    } catch (err: any) {
      console.error("EXAM ERROR", err);
      toast.error(`Greška: ${err.message}`);
    }
  };

  const handleDeleteSpecialExam = async (examId: string) => {
    const exam = specialExams.find(e => e.id === examId);
    if (!exam) return;

    if (!isMainAdmin && exam.teacherId !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ovog ispita.');
      return;
    }

    setDeleteDialog({ isOpen: true, id: examId, type: 'SPECIAL_EXAM', loading: false });
  };

  const handleAddFinalGrade = async (val: number | string) => {
    if (!activeStudent || !activeSubject || !user || !selectedFinalPeriod || !effectiveClassId || !selectedSchoolId) return;
    try {
      setLoading(true);
      
      const selectedClass = classes.find(c => c.id === effectiveClassId);
      const schoolYearId = selectedClass?.school_year_id || '';
      
      const period = selectedFinalPeriod === '1' ? 'FIRST_TERM' : 'SECOND_TERM';

      const gradeText = typeof val === 'number' ? val.toString() : val;
      const payload = {
        student_id: activeStudent.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        teacher_id: user.id,
        school_year_id: schoolYearId,
        period: period,
        term: period, // term should be the same as period
        value: gradeText,
      };
      
      console.log("UPSERT FINAL GRADE PAYLOAD", payload);
      console.log("UPSERT FINAL GRADE ON CONFLICT", "student_id,subject_id,class_id,school_year_id,period");

      try {
        const { error: upsertErr } = await supabase
          .from('final_grades')
          .upsert(payload, {
            onConflict: "student_id,subject_id,class_id,school_year_id,period"
          });

        if (upsertErr && upsertErr.code === '42P10') {
          console.warn("DB UNIQUE CONSTRAINT MISSING. Running fallback select-then-write...");
          const { data: existing, error: fe } = await supabase
            .from('final_grades')
            .select('id')
            .eq('student_id', activeStudent.id)
            .eq('subject_id', activeSubject.id)
            .eq('class_id', effectiveClassId)
            .eq('period', period)
            .maybeSingle();

          if (fe) throw fe;

          if (existing) {
            const { error: updErr } = await supabase
              .from('final_grades')
              .update(payload)
              .eq('id', existing.id);
            if (updErr) throw updErr;
          } else {
            const { error: insErr } = await supabase
              .from('final_grades')
              .insert([payload]);
            if (insErr) throw insErr;
          }
        } else if (upsertErr) {
          throw upsertErr;
        }
      } catch (innerErr) {
        throw innerErr;
      }

      toast.success('Zaključna ocjena spremljena.');
      setShowFinalGradeModal(false);
      await fetchFinalGrades();
      fetchGradesAndNotes();
    } catch (err: any) {
      console.error("FINAL GRADE ERROR", err);
      toast.error(`Greška: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFinalGrade = async (fgId: string) => {
    setDeleteDialog({
      isOpen: true,
      id: fgId,
      type: 'FINAL_GRADE',
      loading: false,
      message: "Jeste li sigurni da želite obrisati zaključnu ocjenu?"
    });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id || !deleteDialog.type) return;
    
    setDeleteDialog(prev => ({ ...prev, loading: true }));
    let tableName = '';
    
    switch (deleteDialog.type) {
      case 'GRADE': tableName = 'grades'; console.log("DELETE GRADE CLICKED", { id: deleteDialog.id }); break;
      case 'NOTE': tableName = 'student_notes'; console.log("DELETE NOTE CLICKED", { id: deleteDialog.id }); break;
      case 'SPECIAL_EXAM': tableName = 'exams'; break;
      case 'FINAL_GRADE': tableName = 'final_grades'; console.log("DELETE FINAL GRADE CLICKED", { id: deleteDialog.id }); break;
    }

    try {
      const { error } = await supabase.from(tableName).delete().eq('id', deleteDialog.id);
      if (error) throw error;
      
      if (deleteDialog.type === 'FINAL_GRADE') console.log("FINAL GRADE DELETE SUCCESS", deleteDialog.id);

      toast.success('Zapis je uspješno obrisan.');
      if (deleteDialog.type === 'GRADE') {
        setSelectedGrade(null);
        setShowAdminDeleteAuth(false);
        setDeleteConfirmationCode('');
      }

      await fetchGradesAndNotes();
      await fetchStudentsData();
      await fetchWarningData();
    } catch (err: any) {
      console.error("DELETE ERROR", err);
      if (deleteDialog.type === 'GRADE') console.log("DELETE GRADE ERROR", err);
      if (deleteDialog.type === 'NOTE') console.log("DELETE NOTE ERROR", err);
      if (deleteDialog.type === 'FINAL_GRADE') console.log("DELETE FINAL GRADE ERROR", err);
      toast.error('Brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
    }
  };

  const [editingNote, setEditingNote] = useState<{ id: string, content: string, type: 'GRADE' | 'GENERAL' } | null>(null);
  const handleUpdateNote = async () => {
    if (!editingNote) return;
    const payload = { content: editingNote.content };
    console.log("UPDATE STUDENT NOTE PAYLOAD", payload);
    try {
      if (editingNote.type === 'GRADE') {
        const { error } = await supabase.from('grades').update({ note: editingNote.content }).eq('id', editingNote.id);
        if (error) console.log("UPDATE GRADE NOTE ERROR", error);
      } else {
        const { error } = await supabase.from('student_notes').update(payload).eq('id', editingNote.id);
        if (error) {
            console.log("UPDATE STUDENT NOTE ERROR", error);
            throw error;
        }
      }
      setEditingNote(null);
      fetchGradesAndNotes();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri ažuriranju bilješke');
    }
  };

  const handleGroupGradeSubmit = async () => {
    if (!activeSubject || !user || !effectiveClassId || !selectedSchoolId) return;
    setLoading(true);
    try {
      const inserts = [];
      for (const [studentId, data] of Object.entries(groupGradeForm.studentGrades)) {
        const studentData = data as { value: number | null, note: string };
        if (studentData.value !== null) {
          inserts.push({
            student_id: studentId,
            subject_id: activeSubject.id,
            class_id: effectiveClassId,
            school_id: selectedSchoolId,
            teacher_id: user.id,
            value: studentData.value,
            element: groupGradeForm.category || gradingElementNames[0],
            category: groupGradeForm.category || gradingElementNames[0],
            note: studentData.note || groupGradeForm.note,
            is_important: groupGradeForm.isImportant,
            grade_type: 'REGULAR',
            is_final: false,
            weight: 1,
            date: groupGradeForm.customDate
          });
        }
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('grades').insert(inserts);
        if (error) throw error;
      }
      setShowGroupGradeModal(false);
      await fetchWarningData();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri grupnom upisu ocjena');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupNoteSubmit = async () => {
    if (!activeSubject || !user || !effectiveClassId || !selectedSchoolId) return;
    setLoading(true);
    try {
      const inserts = [];
      for (const [studentId, content] of Object.entries(groupNoteForm.studentNotes)) {
        const noteContent = content as string;
        if (noteContent.trim()) {
          inserts.push({
            student_id: studentId,
            subject_id: activeSubject.id,
            class_id: effectiveClassId,
            school_id: selectedSchoolId,
            teacher_id: user.id,
            content: noteContent,
            date: groupNoteForm.customDate
          });
        }
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('student_notes').insert(inserts);
        if (error) throw error;
      }
      setShowGroupNoteModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Greška pri grupnom upisu bilješki');
    } finally {
      setLoading(false);
    }
  };

  const navigateStudent = (dir: 'PREV' | 'NEXT') => {
    if (!activeStudent || students.length === 0) return;
    const sorted = sortStudentsBySurname(students);
    const idx = sorted.findIndex(s => s.id === activeStudent.id);
    
    if (idx === -1) return;
    
    const previousStudent = idx > 0 ? sorted[idx - 1] : null;
    const nextStudent = idx < sorted.length - 1 ? sorted[idx + 1] : null;

    console.log("CURRENT INDEX:", idx);
    console.log("PREVIOUS:", previousStudent);
    console.log("NEXT:", nextStudent);

    if (dir === 'PREV' && previousStudent) setActiveStudent(previousStudent);
    else if (dir === 'NEXT' && nextStudent) setActiveStudent(nextStudent);
  };

  const getMonthFromDate = (dateString: string) => new Date(dateString).getMonth() + 1;
  const getCurrentSchoolYearMonth = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    return month;
  };

  const canEnterGrade = (monthNumber: number) => {
    if (is4K) return false;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    
    // Previous month logic
    let previousMonth = currentMonth - 1;
    if (currentMonth === 1) previousMonth = 12; // Jan -> Dec

    // School year months for checking: 9, 10, 11, 12, 1, 2, 3, 4, 5, 6
    const allowedMonths = [currentMonth, previousMonth];
    
    return allowedMonths.includes(monthNumber);
  };

  const handleRandomStudent = async () => {
    console.log("RANDOM BUTTON CLICKED");
    if (!students || students.length === 0) {
      toast.error("Nema učenika za odabir.");
      return;
    }

    // Set loading state conceptually (we can just use toast.loading)
    const toastId = toast.loading("Odabirem slučajnog učenika...");

    try {
      const randomIndex = Math.floor(Math.random() * students.length);
      const selectedStudent = students[randomIndex];

      console.log("RANDOM STUDENT", selectedStudent);

      // Determine visible subjects for this student
      // First check if student has any active enrollments
      const studentEnrollments = enrollments.filter(e => e.studentId === selectedStudent.id && e.status === 'ACTIVE');
      
      let studentSubjectIds = studentEnrollments.map(e => e.subjectId);
      
      // Fallback: If no enrollments exist for this student, use all class subjects
      if (studentSubjectIds.length === 0) {
        studentSubjectIds = classSubjects.filter(cs => cs.classId === effectiveClassId).map(cs => cs.subjectId);
      }

      const visibleSubjects = allSubjects.filter(sub => {
        if (!studentSubjectIds.includes(sub.id)) return false;
        
        if (isMainAdmin) return true;
        const activeClass = classes.find(c => c.id === effectiveClassId);
        const isHomeroomOrDeputy = activeClass?.homeroomTeacherId === user?.id || activeClass?.deputyTeacherId === user?.id;
        if (isHomeroomOrDeputy) return true;
        
        return subjectAssignments.some(a => a.classId === effectiveClassId && a.subjectId === sub.id && a.teacherId === user?.id);
      });

      console.log("VISIBLE SUBJECTS", visibleSubjects);
      
      const activeClass = classes.find(c => c.id === effectiveClassId);
      const roles = {
        isMainAdmin,
        isHomeroom: activeClass?.homeroomTeacherId === user?.id,
        isDeputy: activeClass?.deputyTeacherId === user?.id,
      };
      console.log("CURRENT USER ROLE", roles);

      const autoOpenSubject = visibleSubjects.length === 1 ? visibleSubjects[0] : null;
      console.log("AUTO OPEN SUBJECT", autoOpenSubject);

      if (autoOpenSubject) {
        setActiveStudent(selectedStudent);
        setActiveSubject(autoOpenSubject);
        setViewMode('GRADES');
      } else {
        setActiveStudent(selectedStudent);
        setViewMode('SUBJECTS');
      }
      
      setRandomSelectedStudentId(selectedStudent.id);
      toast.success("Učenik odabran.", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Greška pri odabiru.", { id: toastId });
    }
  };

  const renderStudents = () => {
    if (students.length === 0) {
      return (
        <div className="p-10 text-center flex flex-col items-center justify-center">
          <Users className="w-12 h-12 text-gray-300 mb-4" />
          <h2 className="text-sm font-bold text-gray-500 uppercase">Nema učenika u ovom razredu</h2>
          <p className="text-xs text-gray-400 mt-2">U administraciji škole možete dodati učenike u ovaj razredni odjel.</p>
        </div>
      );
    }
    
    return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between border-b pb-4 border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Imenik</h1>
        </div>
        <button 
          onClick={handleRandomStudent}
          className="bg-[#005c8d] text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-all shadow-md active:scale-95 flex items-center gap-2"
        >
          <Users size={16} />
          Slučajan odabir
        </button>
      </div>

      <div className="bg-white border border-gray-300">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="px-3 py-2 font-black uppercase text-gray-500 w-12 text-center border-r border-gray-300">R.br.</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Prezime i ime</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Program</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500">Upozorenja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortStudentsBySurname(students).map((s, idx) => {
              const failingCount = classWarnings.failingGrades[s.id] || 0;
              const hasPending = classWarnings.pendingAbsences[s.id];

              return (
                <tr 
                  key={s.id} 
                  onClick={() => { 
                    setActiveStudent(s); 
                    setViewMode('SUBJECTS'); 
                    setRandomSelectedStudentId(null);
                  }} 
                  className={cn(
                    "group cursor-pointer transition-colors",
                    s.id === randomSelectedStudentId ? "bg-blue-100 border-l-4 border-l-[#005c8d]" : "hover:bg-[#eff6ff]"
                  )}
                >
                  <td className="px-3 py-2 text-center font-bold text-gray-500 border-r border-gray-200">{idx + 1}.</td>
                  <td className="px-4 py-2 font-bold text-[#005c8d] border-r border-gray-200 group-hover:underline">
                    {s.name}
                    {s.programAdjustment === 'REGULAR_WITH_ADAPTATION' && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200" title="Redovni program uz prilagodbu">P</span>
                    )}
                    {s.programAdjustment === 'REGULAR_WITH_INDIVIDUALIZATION' && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200" title="Redovni program uz individualizaciju">I</span>
                    )}
                  </td>
                  <td className="px-4 py-2 border-r border-gray-200">
                    {(() => {
                      const enrollment = studentEnrollments.find(e => e.student_id === s.id);
                      const progId = enrollment?.program_id || classes.find(c => c.id === effectiveClassId)?.programId;
                      const prog = programs.find(p => p.id === progId);
                      return (
                        <div className="text-[10px] font-bold text-gray-600 uppercase italic opacity-70">{prog ? prog.name : "Nije dodijeljen program"}</div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {failingCount > 0 && (
                        <div className="flex items-center gap-1 text-red-600 font-black px-1.5 py-0.5 rounded bg-red-50 border border-red-100" title={`Učenik ima ${failingCount} negativnih ocjena`}>
                          <span className="text-[14px]">⚠</span>
                          <span className="text-[11px]">{failingCount}</span>
                        </div>
                      )}
                      {hasPending && (
                        <div className="text-red-500" title="Učenik ima neažurirane izostanke">
                          <span className="text-[16px] animate-pulse">🕒</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

  const sortedStudents = sortStudentsBySurname(students);
  const studentIndex = sortedStudents.findIndex(s => s.id === activeStudent?.id);

  const renderNavButtons = () => (
    <div className="flex items-center gap-1">
      <button 
        disabled={studentIndex <= 0}
        onClick={() => navigateStudent('PREV')}
        className="px-3 py-1 bg-white border border-gray-300 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ← Prethodni
      </button>
      <button 
        onClick={handleRandomStudent}
        className="px-3 py-1 bg-white border border-gray-300 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-100"
      >
        Slučajni odabir
      </button>
      <button 
        disabled={studentIndex >= sortedStudents.length - 1}
        onClick={() => navigateStudent('NEXT')}
        className="px-3 py-1 bg-white border border-gray-300 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Sljedeći →
      </button>
    </div>
  );

  const renderSubjectSelector = () => (
    <div className="p-4 space-y-4">
      <div className="border-b border-gray-200 pb-2 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-none">{activeStudent ? formatName(activeStudent) : ''}</h1>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Učenička kartica - Popis predmeta</p>
        </div>
        {renderNavButtons()}
      </div>

      <div className="bg-white border border-gray-300">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="px-4 py-2 font-black uppercase text-gray-500">Nastavni predmet</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500 text-right">Akcija</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {allSubjects
              .filter(sub => {
                const isEnrollActive = enrollments.some(e => e.studentId === activeStudent?.id && e.subjectId === sub.id && e.status === 'ACTIVE');
                if (!isEnrollActive) return false;
                
                const isClassSubject = classSubjects.some(cs => cs.subjectId === sub.id && cs.classId === effectiveClassId);
                if (!isClassSubject) return false;
                
                if (isMainAdmin) return true;
                const activeClass = classes.find(c => c.id === effectiveClassId);
                const isHomeroomOrDeputy = activeClass?.homeroomTeacherId === user?.id || activeClass?.deputyTeacherId === user?.id;
                if (isHomeroomOrDeputy) return true;
                
                return subjectAssignments.some(a => a.classId === effectiveClassId && a.subjectId === sub.id && a.teacherId === user?.id);
              })
              .map(sub => {
                const assignments = subjectAssignments.filter(a => a.classId === effectiveClassId && a.subjectId === sub.id);
                const assignedTeachers = assignments.map(a => teachers.find(t => t.id === a.teacherId)).filter(Boolean) as User[];
                
                return (
                  <tr key={sub.id} onClick={() => { setActiveSubject(sub); setViewMode('GRADES'); }} className="group hover:bg-[#eff6ff] cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-700">
                      <div className="flex items-center gap-3">
                        < BookOpen size={14} className="text-gray-300" />
                        <div>
                          <div className="text-sm">
                            {(() => {
                              const cs = classSubjects.find(cs => cs.subjectId === sub.id && cs.classId === effectiveClassId);
                              return formatSubjectDisplayName(sub.name || '', cs?.subjectType || 'redovni');
                            })()}
                          </div>
                          <div className="text-[10px] text-gray-400 font-normal uppercase tracking-wider">
                            {assignedTeachers.length > 0 
                              ? assignedTeachers.map(t => t.name).join(', ') 
                              : 'Nema dodijeljenog nastavnika'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[9px] font-black uppercase text-[#005c8d] group-hover:underline">Prikaži ocjene →</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderGrades = () => {
    const avg = is4K ? null : (currentGrades.reduce((a, b) => a + b.value, 0) / (currentGrades.length || 1)).toFixed(2);
    
    const getSuggestedGrade = (avgValue: number) => {
      if (avgValue >= 4.5) return 5;
      if (avgValue >= 3.5) return 4;
      if (avgValue >= 2.5) return 3;
      if (avgValue >= 1.5) return 2;
      if (avgValue >= 1.0) return 1;
      return null;
    };

    const sortedStudents = sortStudentsBySurname(students);
    const studentIndex = sortedStudents.findIndex(s => s.id === activeStudent?.id);
    
    const gridGrades: Record<string, Record<string, Grade[]>> = {};
    gradingElementNames.forEach(cat => gridGrades[cat] = {});
    currentGrades.forEach(g => {
      const m = MONTH_MAP[new Date(g.date).getMonth() + 1 as keyof typeof MONTH_MAP];
      if (m && gridGrades[g.category]) {
        if (!gridGrades[g.category][m]) gridGrades[g.category][m] = [];
        gridGrades[g.category][m].push(g);
      }
    });

    return (
      <div className="p-4 h-full flex flex-col space-y-4 w-full pb-20">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between border-b border-[#005c8d] pb-2">
            <div className="flex items-center gap-4">
              <button onClick={() => setViewMode('SUBJECTS')} className="text-gray-400 hover:text-gray-600 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-[#005c8d] leading-none uppercase tracking-tight">
                  {studentIndex + 1}. {activeStudent?.name}
                </h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tight">Učenička kartica · {subjectDisplayName}</p>
              </div>
            </div>
            {renderNavButtons()}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-300 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-300 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-3 border-r border-slate-300 w-1/4">
                  <div className="flex items-center justify-between">
                    <span>Elementi vrednovanja</span>
                    {canEditGrades(activeSubject?.id || '') && (
                      <button onClick={() => setShowGradingElementsModal(true)} className="text-[8px] text-[#005c8d] hover:underline">UREDI</button>
                    )}
                  </div>
                </th>
                {MONTHS_ORDER.map(m => (
                  <th key={m} className="p-2 border-r border-slate-300 text-center w-12 font-bold">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
               {gradingElementNames.length > 0 ? gradingElementNames.map(cat => (
                 <tr key={cat} className="border-b border-slate-300">
                    <td className="p-3 border-r border-slate-300 font-bold text-slate-700 bg-slate-50/10 text-xs align-middle">{cat}</td>
                    {MONTHS_ORDER.map(m => {
                      const MONTH_TO_NUMBER_MAP: Record<string, number> = { 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12, 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
                      const monthNumber = MONTH_TO_NUMBER_MAP[m];
                      return (
                        <td 
                          key={m} 
                          className={cn(
                            "p-1 border-r border-slate-300 align-middle text-center bg-white hover:bg-slate-50 transition-colors",
                            !isArchived && "cursor-pointer"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-center gap-1 min-h-[30px]" onClick={(e) => {
                            if (isArchived) return;
                            if (e.target === e.currentTarget) {
                              if (!canEnterGrade(monthNumber)) {
                                toast.error("Ocjene se mogu unositi samo za trenutni i prethodni mjesec.");
                                return;
                              }
                              setNewGrade({ ...newGrade, category: cat, note: '', value: 5 }); 
                              setShowGradeModal(true);
                            }
                          }}>
                            {gridGrades[cat]?.[m]?.map((g, i) => (
                              <button 
                                key={g.id} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGrade(g);
                                  setIsEditingGrade(false);
                                  setGradeEditForm({ note: g.note || '' });
                                }}
                                className={cn("inline-flex w-5 h-5 items-center justify-center text-[10px] font-bold border rounded-sm", g.value === 1 ? "bg-red-50 border-red-200 text-red-600" : "bg-blue-50 border-blue-200 text-[#005c8d]")}
                              >
                                {g.value}
                              </button>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                 </tr>
               )) : (
                 <tr>
                   <td colSpan={11} className="p-4 text-center text-slate-400 text-xs font-bold uppercase">Nema definiranih elemenata ocjenjivanja.</td>
                 </tr>
               )}
               <tr className={cn("border-b border-slate-300 bg-slate-50 font-black", is4K && "hidden")}>
                 <td className="p-3 border-r border-slate-300 uppercase text-[10px] tracking-widest text-slate-400 align-middle">ZAKLJUČENO</td>
                 <td className="border-r border-slate-300 text-center text-red-600 text-xs font-bold p-2 align-middle" colSpan={4}>
                    {(() => {
                      const fg = finalGrades.find(f => f.period === 'FIRST_TERM');
                      return (
                        <div className="w-full flex items-center justify-center min-h-[32px]">
                          {fg ? (
                            <div className="flex items-center gap-2 group">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">1. pol:</span>
                              <span className="font-bold text-[#005c8d] text-sm">{finalGradeLabels[fg.value] || fg.value}</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteFinalGrade(fg.id); }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-1"
                                  title="Obriši zaključnu ocjenu"
                                >
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={() => { setSelectedFinalPeriod('1'); setShowFinalGradeModal(true); }}
                                  className="text-[9px] font-bold text-[#005c8d] uppercase hover:underline"
                                >
                                  Unesi ocjenu (1. pol)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                 </td>
                 <td className="text-center text-red-600 text-xs font-bold p-2 align-middle" colSpan={6}>
                    {(() => {
                      const fg = finalGrades.find(f => f.period === 'SECOND_TERM');
                      return (
                        <div className="w-full flex items-center justify-center min-h-[32px]">
                          {fg ? (
                            <div className="flex items-center gap-2 group">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">2. pol:</span>
                              <span className="font-bold text-[#005c8d] text-sm">{finalGradeLabels[fg.value] || fg.value}</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteFinalGrade(fg.id); }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-1"
                                  title="Obriši zaključnu ocjenu"
                                >
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={() => { setSelectedFinalPeriod('2'); setShowFinalGradeModal(true); }}
                                  className="text-[9px] font-bold text-[#005c8d] uppercase hover:underline"
                                >
                                  Unesi ocjenu (2. pol)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                 </td>
               </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center bg-[#f8f9fa] p-2 border border-gray-300 text-[10px] font-bold">
           <span className="text-gray-400 uppercase tracking-tight">Vrijeme: {new Date().toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}</span>
           {!is4K && <span className="text-gray-500 uppercase tracking-tight">Aritmetička sredina: <span className="text-[#005c8d] text-sm leading-none ml-1">{avg}</span></span>}
        </div>

        {/* 2. BILJEŠKE I POJEDINAČNE OCJENE */}
        <div className="space-y-4 pt-2">
           <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">BILJEŠKE I POJEDINAČNE OCJENE</h2>
              <button onClick={() => setShowNoteModal(true)} className="text-[10px] font-bold text-[#005c8d] uppercase hover:underline">+ Bilješka</button>
           </div>
           
           <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="bg-slate-50 border-b border-slate-300 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                   <th className="p-3 border-r border-slate-300 text-center w-28">Datum</th>
                   <th className="p-3 border-r border-slate-300 text-center w-20">Ocjena</th>
                   <th className="p-3 border-r border-slate-300">Element</th>
                   <th className="p-3 border-r border-slate-300">Bilješka</th>
                   <th className="p-3 text-center w-12">Akcije</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-200">
                 {(() => {
                   const combinedHistory = [
                     ...currentGrades.map(g => ({
                       id: g.id,
                       type: 'GRADE',
                       date: g.date,
                       value: g.value,
                       category: g.category,
                       note: g.note,
                       raw: g
                     })),
                     ...currentNotes.map(n => ({
                       id: n.id,
                       type: 'NOTE',
                       date: n.date,
                       value: '—',
                       category: 'Bilješka',
                       note: n.content,
                       raw: n
                     }))
                   ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                   if (combinedHistory.length === 0) {
                     return (
                       <tr>
                         <td colSpan={5} className="p-8 text-center text-slate-400 italic font-bold">Nema unesenih podataka</td>
                       </tr>
                     );
                   }

                   return combinedHistory.map(item => (
                     <tr key={item.id} className="hover:bg-slate-50 text-[11px] text-slate-700 font-medium">
                       <td className="p-3 text-center border-r border-slate-300 text-slate-500 font-bold w-28">
                         {new Date(item.date).toLocaleDateString('hr-HR')}.
                       </td>
                       <td className="p-3 text-center border-r border-slate-300 font-black text-[#005c8d] w-20 text-xs">
                         {item.value}
                       </td>
                       <td className="p-3 border-r border-slate-300 font-bold text-slate-700 max-w-[150px] truncate">
                         {item.category}
                       </td>
                       <td className="p-3 border-r border-slate-300 text-slate-600 leading-relaxed italic whitespace-pre-wrap">
                         {item.note || '—'}
                       </td>
                       <td className="p-3 text-center w-12">
                         {item.type === 'GRADE' ? (
                           <button 
                             onClick={() => handleDeleteGrade(item.id)} 
                             className="text-slate-300 hover:text-red-500 p-1"
                             title="Obriši ocjenu"
                           >
                             <Trash2 size={12}/>
                           </button>
                         ) : (
                           <button 
                             onClick={() => handleDeleteNote(item.id)} 
                             className="text-slate-300 hover:text-red-500 p-1"
                             title="Obriši bilješku"
                           >
                             <Trash2 size={12}/>
                           </button>
                         )}
                       </td>
                     </tr>
                   ));
                 })()}
               </tbody>
             </table>
           </div>
        </div>

        {/* 3. DOPUNSKI / RAZLIKOVNI / POPRAVNI ISPITI */}
        <div className="space-y-4 pt-2">
           <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">DOPUNSKI / RAZLIKOVNI / POPRAVNI ISPITI</h2>
              <button onClick={() => {
                setNewSpecialExam({
                  type: 'SUPPLEMENTARY',
                  note: '',
                  grade: 0,
                  customDate: new Date().toISOString().split('T')[0],
                  gradeLevel: 1,
                  subjectId: activeSubject?.id || ''
                });
                setShowSpecialExamModal(true);
              }} className="text-[10px] font-bold text-[#005c8d] uppercase hover:underline">+ Dodaj ispit</button>
           </div>
           
            <div className="bg-white border border-slate-300 overflow-hidden shadow-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <th className="p-3 border-r border-slate-300 w-1/4">Vrsta</th>
                    <th className="p-3 border-r border-slate-300 w-24 text-center">Za razred</th>
                    <th className="p-3 border-r border-slate-300 w-1/4">Predmet</th>
                    <th className="p-3 border-r border-slate-300">Bilješka</th>
                    <th className="p-3 text-center w-20 border-r border-slate-300">Ocjena</th>
                    <th className="p-3 text-center w-28 border-r border-slate-300">Datum</th>
                    <th className="p-3 text-center w-12">Akcije</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {specialExams.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic font-bold">Nema unesenih ispita</td>
                    </tr>
                  ) : (
                    specialExams.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(ex => (
                      <tr key={ex.id} className="hover:bg-slate-50 text-[11px] text-slate-700 font-medium">
                        <td className="p-3 border-r border-slate-300 font-bold text-[#005c8d]">
                          {specialExamTypeLabels[ex.type] || ex.type}
                        </td>
                        <td className="p-3 border-r border-slate-300 text-center font-bold text-slate-600">
                          {ex.examGradeLevel ? `${ex.examGradeLevel}. razred` : '—'}
                        </td>
                        <td className="p-3 border-r border-slate-300 font-bold text-slate-600">
                          {allSubjects.find(s => s.id === ex.subjectId)?.name || 'Opći predmet'}
                        </td>
                        <td className="p-3 border-r border-slate-300 text-slate-600">
                          {ex.note || '—'}
                        </td>
                        <td className="p-3 text-center border-r border-slate-300 font-black text-[#005c8d] text-xs">
                          {ex.gradeValue || '—'}
                        </td>
                        <td className="p-3 text-center border-r border-slate-300 font-bold text-slate-500">
                          {ex.date ? new Date(ex.date).toLocaleDateString('hr-HR') + '.' : '—'}
                        </td>
                        <td className="p-3 text-center w-12">
                          <button 
                            onClick={() => handleDeleteSpecialExam(ex.id)} 
                            className="text-slate-300 hover:text-red-500 p-1"
                            title="Obriši ispit"
                          >
                            <Trash2 size={12}/>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex sm:flex-row flex-col flex-1 bg-white min-h-0 overflow-hidden font-sans">
      {loading && (<div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[200] flex flex-col items-center justify-center"><div className="w-10 h-10 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-2" /><span className="font-black text-[10px] uppercase text-[#005c8d]">Učitavanje...</span></div>)}

      {/* Sidebar - Izbornik */}
      <div className="w-full sm:w-64 bg-[#f8f9fa] border-r border-gray-300 flex flex-col shrink-0 overflow-hidden">
        <div className="p-2 border-b border-gray-300 bg-[#005c8d] text-white shrink-0">
          <h2 className="font-bold text-[11px] uppercase tracking-tight">Izbornik</h2>
        </div>
        <div className="flex-1 overflow-auto">
           <div className="border-b border-gray-200">
              <button 
                onClick={() => { setViewMode('STUDENTS'); setActiveStudent(null); setActiveSubject(null); }} 
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-[11px] font-bold uppercase transition-all border-l-4",
                  viewMode === 'STUDENTS' ? "bg-white border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-500 hover:bg-gray-100"
                )}
              >
                <Users size={14} /> Imenik učenika
              </button>
              <button 
                disabled={!activeStudent} 
                onClick={() => { setViewMode('SUBJECTS'); setActiveSubject(null); }} 
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-[11px] font-bold uppercase transition-all border-l-4",
                  viewMode === 'SUBJECTS' ? "bg-white border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                )}
              >
                <BookOpen size={14} /> Pregled predmeta
              </button>
              <button 
                disabled={!activeStudent} 
                onClick={() => { setViewMode('NOTES'); setActiveSubject(null); }} 
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-[11px] font-bold uppercase transition-all border-l-4",
                  viewMode === 'NOTES' ? "bg-white border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                )}
              >
                <ClipboardList size={14} /> Bilješke
              </button>
           </div>

           {activeSubject && (
             <div className="p-3 space-y-2">
                <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">Radnje</h3>
                <button 
                  onClick={() => setGroupGradeForm({ ...groupGradeForm, studentGrades: students.reduce((acc, s) => ({ ...acc, [s.id]: { value: null, note: '' } }), {}) })} 
                  onClickCapture={() => setShowGroupGradeModal(true)}
                  className="w-full flex items-center gap-3 p-2 text-[10px] font-bold uppercase text-[#005c8d] bg-white border border-[#005c8d] hover:bg-[#005c8d] hover:text-white transition-all"
                >
                  Grupni unos ocjena
                </button>
                <button 
                  onClick={() => setGroupNoteForm({ ...groupNoteForm, studentNotes: students.reduce((acc, s) => ({ ...acc, [s.id]: '' }), {}) })} 
                  onClickCapture={() => setShowGroupNoteModal(true)}
                  className="w-full flex items-center gap-3 p-2 text-[10px] font-bold uppercase text-[#005c8d] bg-white border border-[#005c8d] hover:bg-[#005c8d] hover:text-white transition-all"
                >
                  Grupni unos bilješki
                </button>
                <button 
                  onClick={() => setShowGroupFinalGradeModal(true)}
                  className="w-full flex items-center gap-3 p-2 text-[10px] font-bold uppercase text-[#005c8d] bg-white border border-[#005c8d] hover:bg-[#005c8d] hover:text-white transition-all"
                >
                  Grupno zaključivanje ocjena
                </button>
             </div>
           )}

           <div className="mt-auto p-4 border-t border-gray-200">
              {activeStudent && (
                <button 
                  onClick={async () => { 
                    await fetchWarningData();
                    setViewMode('STUDENTS'); 
                    setActiveStudent(null); 
                  }} 
                  className="w-full py-1.5 bg-gray-100 text-gray-500 border border-gray-300 text-[10px] font-bold uppercase hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                >
                  Zatvori karticu
                </button>
              )}
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'STUDENTS' && renderStudents()}
        {viewMode === 'SUBJECTS' && renderSubjectSelector()}
        {viewMode === 'GRADES' && renderGrades()}
        {viewMode === 'NOTES' && (
          <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto bg-white">
             {renderNotesTab()}
          </div>
        )}
      </div>

      {/* MODALS */}
      {showGradeModal && (
        <div className="fixed inset-0 bg-[#005c8d]/60 backdrop-blur-none flex items-center justify-center z-[300] p-4">
          <div className="bg-white max-w-lg w-full relative overflow-hidden border border-gray-400">
            <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase"><h3 className="tracking-tight">Unos ocjene</h3><button onClick={() => setShowGradeModal(false)}><X size={16}/></button></div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <h4 className="text-base font-bold text-gray-900 leading-tight">{activeStudent ? formatName(activeStudent) : ''}</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                  {(() => {
                    const cs = classSubjects.find(cs => cs.subjectId === activeSubject?.id && cs.classId === effectiveClassId);
                    return formatSubjectDisplayName(activeSubject?.name || '', cs?.subjectType || 'redovni');
                  })()}
                </p>
              </div>
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map(v => (<button key={v} onClick={() => setNewGrade({...newGrade, value: v})} className={cn("w-10 h-10 border font-bold text-lg", newGrade.value === v ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-white text-gray-400 border-gray-300 hover:border-[#005c8d]")}>{v}</button>))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-gray-400">Datum</label><input type="date" value={newGrade.customDate} onChange={e => setNewGrade({...newGrade, customDate: e.target.value})} className="w-full border p-1 text-[11px] font-bold" /></div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-400">Važno</label>
                  <div className="flex border overflow-hidden">
                    <button onClick={()=>setNewGrade({...newGrade, isImportant:true})} className={cn("flex-1 py-1 text-[10px] font-bold", newGrade.isImportant ? "bg-[#005c8d] text-white" : "text-gray-400 bg-gray-50")}>DA</button>
                    <button onClick={()=>setNewGrade({...newGrade, isImportant:false})} className={cn("flex-1 py-1 text-[10px] font-bold", !newGrade.isImportant ? "bg-[#005c8d] text-white" : "text-gray-400 bg-gray-50")}>NE</button>
                  </div>
                </div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-gray-400">Bilješka</label><textarea value={newGrade.note} onChange={e => setNewGrade({...newGrade, note: e.target.value})} rows={2} className="w-full border p-2 text-[11px]" /></div>
              <button onClick={handleAddGrade} className="w-full py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px] hover:bg-[#004a70]">Unesi ocjenu</button>
            </div>
          </div>
        </div>
      )}

      {showNoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-none flex items-center justify-center z-[300] p-4 text-center">
          <div className="bg-white max-w-xl w-full relative overflow-hidden border border-gray-400">
             <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase"><h3>Upis bilješke</h3><button onClick={()=>setShowNoteModal(false)}><X size={16}/></button></div>
             <div className="p-6 space-y-4">
                <div><h4 className="font-bold text-[#005c8d] text-base leading-tight">{activeStudent?.name}</h4><div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{subjectDisplayName}</div></div>
                <div className="text-left"><label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Datum</label><input type="date" value={newNote.customDate} onChange={e => setNewNote({...newNote, customDate: e.target.value})} className="border p-1 text-[11px] font-bold" /></div>
                <div className="text-left"><label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Sadržaj bilješke</label><textarea value={newNote.content} onChange={e => setNewNote({...newNote, content: e.target.value})} rows={5} className="w-full border p-2 text-[11px]" /></div>
                <button onClick={handleAddNote} className="px-8 py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px]">Spremi bilješku</button>
             </div>
          </div>
        </div>
      )}

      {showSpecialExamModal && (
        <div className="fixed inset-0 bg-[#005c8d]/60 backdrop-blur-none flex items-center justify-center z-[300] p-4 text-center">
          <div className="bg-white max-w-xl w-full relative overflow-hidden border border-gray-400">
             <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase"><h3>Unošenje ispita</h3><button onClick={()=>setShowSpecialExamModal(false)}><X size={16}/></button></div>
             <div className="p-6 space-y-4 text-left">
                <div className="font-bold text-sm text-[#005c8d] border-b pb-2 mb-2">Unos razlikovnog / dopunskog / popravnog ispita za učenika: {activeStudent?.name}</div>
                
                {/* 1. Predmet Select */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Predmet</label>
                  <select 
                    value={newSpecialExam.subjectId || activeSubject?.id || ''} 
                    onChange={e => setNewSpecialExam({...newSpecialExam, subjectId: e.target.value})} 
                    className="w-full border p-1.5 text-[11px] font-bold leading-tight"
                  >
                    <option value="">Aktivni predmet ({subjectDisplayName})</option>
                    {allSubjects.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* 2. Vrsta ispita Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Vrsta ispita</label>
                    <select 
                      value={newSpecialExam.type} 
                      onChange={e => setNewSpecialExam({...newSpecialExam, type: e.target.value as any})} 
                      className="w-full border p-1.5 text-[11px] font-bold leading-tight"
                    >
                      <option value="SUPPLEMENTARY">Dopunski ispit</option>
                      <option value="REMEDIAL">Popravni ispit</option>
                      <option value="DIFFERENCE">Razlikovni ispit</option>
                      <option value="CLASS_EXAM">Razredni ispit</option>
                      <option value="SUBJECT_EXAM">Predmetni ispit</option>
                    </select>
                  </div>

                  {/* 3. Razred Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Razred za koji se polaže</label>
                    <select 
                      value={newSpecialExam.gradeLevel} 
                      onChange={e => setNewSpecialExam({...newSpecialExam, gradeLevel: parseInt(e.target.value)})} 
                      className="w-full border p-1.5 text-[11px] font-bold leading-tight"
                    >
                      <option value="1">1. razred</option>
                      <option value="2">2. razred</option>
                      <option value="3">3. razred</option>
                      <option value="4">4. razred</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* 4. Ocjena Select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Ocjena</label>
                    <select 
                      value={newSpecialExam.grade} 
                      onChange={e => setNewSpecialExam({...newSpecialExam, grade: parseInt(e.target.value)})} 
                      className="w-full border p-1.5 text-[11px] font-bold leading-tight"
                    >
                      <option value="0">Odaberi ocjenu...</option>
                      {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* 5. Datum Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Datum ispita</label>
                    <input 
                      type="date" 
                      value={newSpecialExam.customDate || new Date().toISOString().split('T')[0]} 
                      onChange={e => setNewSpecialExam({...newSpecialExam, customDate: e.target.value})} 
                      className="w-full border p-1.5 text-[11px] font-bold leading-tight" 
                    />
                  </div>
                </div>

                {/* 6. Opis / Bilješka Textarea */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Opis / Bilješka</label>
                  <textarea 
                    value={newSpecialExam.note} 
                    onChange={e => setNewSpecialExam({...newSpecialExam, note: e.target.value})} 
                    rows={2} 
                    className="w-full border p-2 text-[11px]" 
                    placeholder="npr. Pismeni dio, opis rezultata..." 
                  />
                </div>

                <button onClick={handleAddSpecialExam} className="w-full py-2 bg-[#005c8d] hover:bg-[#004e78] text-white font-bold uppercase text-[11px] transition-colors mt-2">Spremi ispit</button>
             </div>
          </div>
        </div>
      )}

      {showFinalGradeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-none flex items-center justify-center z-[300] p-4">
          <div className="bg-white max-w-md w-full relative overflow-hidden border border-gray-400">
             <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase"><h3>Zaključna ocjena</h3><button onClick={()=>setShowFinalGradeModal(false)}><X size={16}/></button></div>
             <div className="p-6 space-y-6">
                <div className="text-center font-bold text-gray-900 text-sm">Zaključna ocjena za {selectedFinalPeriod === '1' ? '1.' : '2.'} polugodište</div>
                <div className="grid grid-cols-5 gap-1">
                   {[1,2,3,4,5].map(v => (<button key={v} onClick={()=>handleAddFinalGrade(v)} className="h-10 border bg-blue-50 text-[#005c8d] font-bold text-lg hover:bg-[#005c8d] hover:text-white transition-all">{v}</button>))}
                </div>
                <div className="grid grid-cols-2 gap-1 mb-1">
                   {['Neocijenjen', 'Oslobođen'].map(v => (<button key={v} onClick={()=>handleAddFinalGrade(v)} className="py-1 border bg-gray-50 text-[10px] font-bold uppercase text-gray-400 hover:bg-[#005c8d] hover:text-white transition-all">{v}</button>))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                   {['Odrađeno', 'Neodrađeno'].map(v => (<button key={v} onClick={()=>handleAddFinalGrade(v)} className="py-1 border bg-gray-50 text-[10px] font-bold uppercase text-gray-400 hover:bg-[#005c8d] hover:text-white transition-all">{v}</button>))}
                </div>
                <button onClick={()=>setShowFinalGradeModal(false)} className="w-full py-2 bg-gray-200 text-gray-700 font-bold uppercase text-[11px] hover:bg-gray-300">Odustani</button>
             </div>
          </div>
        </div>
      )}

      {showGroupGradeModal && (
        <div className="fixed inset-0 bg-[#005c8d]/60 backdrop-blur-none flex items-start justify-center z-[300] p-4 overflow-y-auto pt-4">
           <div className="bg-white w-full max-w-6xl relative overflow-hidden flex flex-col min-h-[500px] mb-4 border border-gray-400">
              <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase shrink-0">
                 <h3 className="tracking-tight">Grupni unos ocjena: {subjectDisplayName}</h3>
                 <button onClick={()=>setShowGroupGradeModal(false)}><X size={16}/></button>
              </div>
              <div className="p-4 bg-gray-50 border-b border-gray-300 shrink-0">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Element</label><select value={groupGradeForm.category} onChange={e=>setGroupGradeForm({...groupGradeForm, category: e.target.value})} className="w-full border p-1 text-[11px] font-bold leading-tight"><option value="">--odaberi--</option>{gradingElementNames.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Datum</label><input type="date" value={groupGradeForm.customDate} onChange={e=>setGroupGradeForm({...groupGradeForm, customDate: e.target.value})} className="w-full border p-1 text-[11px] font-bold" /></div>
                    <div className="md:col-span-2"><label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Vrijednost za sve (napomena)</label><div className="flex gap-1"><input type="text" value={groupGradeForm.note} onChange={e=>setGroupGradeForm({...groupGradeForm, note: e.target.value})} className="flex-1 border p-1 text-[11px]" /><button onClick={()=>{const newG={...groupGradeForm.studentGrades}; students.forEach(s=>{if(!newG[s.id])newG[s.id]={value:null,note:''};newG[s.id].note=groupGradeForm.note;});setGroupGradeForm({...groupGradeForm, studentGrades:newG});}} className="bg-[#005c8d] text-white px-2 py-1 text-[10px] font-bold uppercase">Kopiraj</button></div></div>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse ed-table-dense">
                  <thead className="sticky top-0 bg-white z-10 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-300">
                    <tr><th className="p-2 w-64">Učenik</th><th className="p-2 w-32 border-x border-gray-300 text-center">Ocjena</th><th className="p-2">Bilješka</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortStudentsBySurname(students).map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                         <td className="p-2 text-[11px] font-bold text-gray-700">{s.name}</td>
                         <td className="p-1 border-x border-gray-200">
                            <select 
                              value={groupGradeForm.studentGrades[s.id]?.value || ''} 
                              onChange={e=>{const v=e.target.value===''?null:parseInt(e.target.value);setGroupGradeForm({...groupGradeForm,studentGrades:{...groupGradeForm.studentGrades,[s.id]:{...groupGradeForm.studentGrades[s.id],value:v}}})}} 
                              className="w-full border p-0.5 text-[11px] font-bold text-[#005c8d] leading-none"
                            >
                              <option value="">--</option>
                              {[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}
                            </select>
                         </td>
                         <td className="p-1"><input type="text" value={groupGradeForm.studentGrades[s.id]?.note || ''} onChange={e=>setGroupGradeForm({...groupGradeForm,studentGrades:{...groupGradeForm.studentGrades,[s.id]:{...groupGradeForm.studentGrades[s.id],note:e.target.value}}})} className="w-full border p-0.5 text-[11px]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-300 flex justify-center shrink-0">
                <button onClick={handleGroupGradeSubmit} className="px-12 py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px] hover:bg-[#004a70]">SPREMI OCJENE</button>
              </div>
           </div>
        </div>
      )}

      {showGroupNoteModal && (
        <div className="fixed inset-0 bg-[#005c8d]/60 backdrop-blur-none flex items-start justify-center z-[300] p-4 overflow-y-auto pt-4">
           <div className="bg-white w-full max-w-6xl relative overflow-hidden flex flex-col min-h-[500px] mb-4 border border-gray-400">
              <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase shrink-0">
                 <h3 className="tracking-tight">Grupni unos bilješki: {subjectDisplayName}</h3>
                 <button onClick={()=>setShowGroupNoteModal(false)}><X size={16}/></button>
              </div>
              <div className="p-4 bg-gray-50 border-b border-gray-300 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Datum</label>
                      <input type="date" value={groupNoteForm.customDate} onChange={e=>setGroupNoteForm({...groupNoteForm, customDate: e.target.value})} className="border p-1 text-[11px] font-bold" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Napomena za sve</label>
                      <div className="flex gap-1">
                        <textarea rows={1} value={groupNoteForm.content} onChange={e=>setGroupNoteForm({...groupNoteForm, content: e.target.value})} className="flex-1 border p-2 text-[11px] resize-none" />
                        <button onClick={()=>{const n={...groupNoteForm.studentNotes};students.forEach(s=>{n[s.id]=groupNoteForm.content;});setGroupNoteForm({...groupNoteForm,studentNotes:n});}} className="bg-[#005c8d] text-white px-2 text-[10px] font-bold uppercase flex items-center gap-1"><Copy size={12}/> Kopiraj</button>
                      </div>
                   </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse ed-table-dense">
                  <thead className="sticky top-0 bg-white z-10 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-300">
                    <tr><th className="p-2 w-64 border-r border-gray-300">Učenik</th><th className="p-2">Bilješka</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortStudentsBySurname(students).map(s=>(
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-2 text-[11px] font-bold text-gray-700 border-r border-gray-200">{s.name}</td>
                        <td className="p-1"><textarea rows={2} value={groupNoteForm.studentNotes[s.id]||''} onChange={e=>setGroupNoteForm({...groupNoteForm,studentNotes:{...groupNoteForm.studentNotes,[s.id]:e.target.value}})} className="w-full border p-1 text-[11px]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-300 flex justify-center shrink-0">
                <button onClick={handleGroupNoteSubmit} className="px-12 py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px] hover:bg-[#004a70]">SPREMI BILJEŠKE</button>
              </div>
           </div>
        </div>
      )}

      <DeleteConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
        onConfirm={confirmDelete}
        loading={deleteDialog.loading}
        message={deleteDialog.message}
      />

      <GroupFinalGradeModal
        isOpen={showGroupFinalGradeModal}
        onClose={() => setShowGroupFinalGradeModal(false)}
        students={students}
        activeSubject={activeSubject}
        effectiveClassId={effectiveClassId}
        selectedSchoolId={selectedSchoolId}
        user={user}
        classes={classes}
        onRefresh={fetchGradesAndNotes}
      />

      {showGradingElementsModal && activeSubject && (
        <GradingElementsModal 
          isOpen={showGradingElementsModal} 
          onClose={() => setShowGradingElementsModal(false)} 
          subject={activeSubject}
          classId={effectiveClassId!}
          schoolId={selectedSchoolId!}
          teacherId={user?.id!}
          onRefresh={() => {
            const fetchGE = async () => {
              const { data } = await supabase
                .from('grading_elements')
                .select('*')
                .eq('school_id', selectedSchoolId)
                .eq('class_id', effectiveClassId)
                .eq('subject_id', activeSubject.id)
                .eq('teacher_id', user?.id)
                .order('display_order', { ascending: true });
              if (data) setGradingElements(mapList(data, mappers.gradingElement));
            };
            fetchGE();
          }}
        />
      )}

      <SpecialExamReGradeModal
        isOpen={showSpecialExamReGradeModal}
        onClose={() => setShowSpecialExamReGradeModal(false)}
        student={selectedSpecialExamForReGrade?.student}
        subject={selectedSpecialExamForReGrade?.subject}
        exams={selectedSpecialExamForReGrade?.exams}
        finalGrade={selectedSpecialExamForReGrade?.finalGrade}
        onRefresh={fetchGradesAndNotes}
      />


      {selectedGrade && (
        <GradeDetailsModal 
          grade={selectedGrade}
          onClose={() => setSelectedGrade(null)}
          onUpdateNote={handleUpdateGradeNote}
          onDelete={handleDeleteGrade}
          isEditing={isEditingGrade}
          setIsEditing={setIsEditingGrade}
          editForm={gradeEditForm}
          setEditForm={setGradeEditForm}
          user={user}
          classes={classes}
          effectiveClassId={effectiveClassId}
          isMainAdmin={isMainAdmin}
          showAdminAuth={showAdminDeleteAuth}
          setShowAdminAuth={setShowAdminDeleteAuth}
          authCode={deleteConfirmationCode}
          setAuthCode={setDeleteConfirmationCode}
        />
      )}
    </div>
  );
}

function GradeDetailsModal({ 
  grade, 
  onClose, 
  onUpdateNote, 
  onDelete, 
  isEditing, 
  setIsEditing, 
  editForm, 
  setEditForm,
  user,
  classes,
  effectiveClassId,
  isMainAdmin,
  showAdminAuth,
  setShowAdminAuth,
  authCode,
  setAuthCode
}: any) {
  const createdAt = grade.createdAt ? new Date(grade.createdAt) : new Date();
  const now = new Date();
  const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
  
  const selectedClass = classes.find((c: any) => c.id === effectiveClassId);
  const isClassAdmin = isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;
  const canDeleteDirectly = diffMinutes <= 45 || (isClassAdmin && diffMinutes <= 45);
  const canDeleteWithAuth = isClassAdmin && diffMinutes > 45;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full border border-gray-400 shadow-2xl relative overflow-hidden">
        <div className="p-3 bg-[#005c8d] text-white flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
           <div className="flex items-center gap-2"><TableIcon size={14}/> Detalji ocjene</div>
           <button onClick={onClose} className="hover:rotate-90 transition-transform"><X size={16}/></button>
        </div>

        <div className="p-6 space-y-6">
           <div className="flex justify-between items-start">
             <div>
               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Element ocjenjivanja</p>
               <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight">{grade.category}</h4>
             </div>
             <div className={cn(
               "w-12 h-12 flex items-center justify-center text-2xl font-black border-2",
               grade.value === 1 ? "bg-red-50 border-red-200 text-red-600" : "bg-blue-50 border-blue-200 text-[#005c8d]"
             )}>
               {grade.value}
             </div>
           </div>

           <div className="grid grid-cols-2 gap-4 border-y border-gray-100 py-4">
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1">Datum unosa</p>
                <p className="text-xs font-bold text-gray-700">{new Date(grade.date).toLocaleDateString('hr-HR')}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1">Vrijeme unosa</p>
                <p className="text-xs font-bold text-gray-700">{createdAt.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
           </div>

           <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-gray-400 uppercase leading-none">Bilješka / Napomena</p>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="text-[9px] font-black text-[#005c8d] uppercase hover:underline flex items-center gap-1">
                    <Edit2 size={10}/> Uredi bilješku
                  </button>
                )}
              </div>
              <div className="bg-gray-50 p-3 border border-gray-200 min-h-[80px]">
                 {isEditing ? (
                   <div className="space-y-3">
                     <textarea 
                       value={editForm.note}
                       onChange={e => setEditForm({...editForm, note: e.target.value})}
                       className="w-full text-xs p-2 border border-[#005c8d] outline-none"
                       rows={4}
                     />
                     <div className="flex gap-2">
                        <button onClick={onUpdateNote} className="flex-1 bg-[#005c8d] text-white py-1.5 text-[10px] font-black uppercase hover:bg-[#004a70]">Spremi</button>
                        <button onClick={() => setIsEditing(false)} className="px-4 py-1.5 bg-white border border-gray-300 text-gray-400 text-[10px] font-black uppercase hover:bg-gray-50">Odustani</button>
                     </div>
                   </div>
                 ) : (
                   <p className="text-xs text-gray-600 leading-relaxed italic">{grade.note || 'Nema bilješke'}</p>
                 )}
              </div>
           </div>

           {showAdminAuth ? (
              <div className="p-4 bg-red-50 border border-red-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                 <p className="text-[10px] font-black text-red-700 uppercase text-center">Admin autorizacija za brisanje (45min+)</p>
                 <input 
                   type="password" 
                   value={authCode}
                   onChange={e => setAuthCode(e.target.value)}
                   placeholder="Unesite kod s authenticatora"
                   className="w-full border border-red-200 p-2 text-center font-mono tracking-[0.5em] focus:outline-red-500"
                   autoFocus
                 />
                 <div className="flex gap-2">
                    <button onClick={() => onDelete(grade.id, true)} className="flex-1 bg-red-600 text-white py-2 text-[10px] font-black uppercase hover:bg-red-700">Potvrdi brisanje</button>
                    <button onClick={() => { setShowAdminAuth(false); setAuthCode(''); }} className="px-4 py-2 border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-white">Odustani</button>
                 </div>
              </div>
           ) : (
             <div className="pt-4 border-t border-gray-100">
               {(canDeleteDirectly || canDeleteWithAuth) && (
                 <button 
                   onClick={() => onDelete(grade.id, false)}
                   className="w-full py-2 bg-white border border-red-200 text-red-500 text-[10px] font-black uppercase hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                 >
                   <Trash2 size={12}/> Obriši ocjenu
                 </button>
               )}
               {diffMinutes > 45 && !isClassAdmin && (
                 <p className="text-[9px] text-gray-400 italic text-center">Ocjena je starija od 45 minuta i ne može se obrisati.</p>
               )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

function GradingElementsModal({ isOpen, onClose, subject, classId, schoolId, teacherId, onRefresh }: { isOpen: boolean, onClose: () => void, subject: Subject, classId: string, schoolId: string, teacherId: string, onRefresh: () => void }) {
  const [elements, setElements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newElementName, setNewElementName] = useState('');
  const [newElementDesc, setNewElementDesc] = useState('');
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingElementName, setEditingElementName] = useState('');
  const [editingElementDesc, setEditingElementDesc] = useState('');

  const fetchElements = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('grading_elements')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class_id', classId)
        .eq('subject_id', subject.id)
        .eq('teacher_id', teacherId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (data) setElements(data); // mapList deleted because we want native DB row shape with description
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchElements();
  }, [isOpen]);

  const handleAdd = async () => {
    if (!newElementName.trim()) return;
    
    const payload = {
      school_id: schoolId,
      class_id: classId,
      subject_id: subject.id,
      teacher_id: teacherId,
      name: newElementName.trim(),
      description: newElementDesc.trim() || null,
      display_order: elements.length
    };
    
    console.log("GRADING ELEMENT INSERT PAYLOAD:", payload);

    try {
      const { data, error } = await supabase
        .from("grading_elements")
        .insert([payload])
        .select()
        .maybeSingle();
        
      console.log("GRADING ELEMENT INSERT RESULT:", data);
      console.log("GRADING ELEMENT INSERT ERROR:", error);

      if (error) {
        toast.error("Greška pri dodavanju elementa: " + error.message);
        return;
      }

      setNewElementName('');
      setNewElementDesc('');
      fetchElements();
      onRefresh();
    } catch (err: any) {
      toast.error('Greška pri dodavanju elementa.');
    }
  };

  const handleEdit = async () => {
    if (!editingElementId || !editingElementName.trim()) return;
    try {
      const { error } = await supabase
        .from('grading_elements')
        .update({
          name: editingElementName.trim(),
          description: editingElementDesc.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingElementId)
        .eq('teacher_id', teacherId);
        
      if (error) throw error;
      setEditingElementId(null);
      setEditingElementName('');
      setEditingElementDesc('');
      fetchElements();
      onRefresh();
      toast.success('Element uspješno ažuriran.');
    } catch (err) {
      toast.error('Greska pri ažuriranju.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const { count } = await supabase.from('grades').select('*', { count: 'exact', head: true }).eq('category', name);
    if (count && count > 0) {
      toast.error('Element se ne može obrisati jer postoje ocjene u toj kategoriji.');
      return;
    }
    
    try {
      await supabase.from('grading_elements').delete().eq('id', id).eq('teacher_id', teacherId);
      fetchElements();
      onRefresh();
      toast.success('Element uspješno obrisan.');
    } catch (err) {
      toast.error('Greska pri brisanju.');
    }
  };

  const handleMove = async (id: string, dir: 'UP' | 'DOWN') => {
    const idx = elements.findIndex(e => e.id === id);
    if (dir === 'UP' && idx === 0) return;
    if (dir === 'DOWN' && idx === elements.length - 1) return;
    
    const newElements = [...elements];
    const targetIdx = dir === 'UP' ? idx - 1 : idx + 1;
    [newElements[idx], newElements[targetIdx]] = [newElements[targetIdx], newElements[idx]];
    
    try {
      const updates = newElements.map((e, index) => ({
        id: e.id,
        school_id: schoolId,
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subject.id,
        name: e.name,
        description: e.description,
        display_order: index
      }));
      await supabase.from('grading_elements').upsert(updates);
      fetchElements();
      onRefresh();
    } catch (err) {
      toast.error('Greška pri reoslijedu.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[400] p-4">
      <div className="bg-white max-w-md w-full border border-gray-400 shadow-2xl">
        <div className="p-3 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
          <span>Elementi ocjenjivanja: {subject.name}</span>
          <button onClick={onClose} className="hover:text-amber-300 transition-colors"><X size={16}/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            {elements.length === 0 && (
               <div className="text-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-widest">
                 Nema definiranih elemenata.
               </div>
            )}
            {elements.map((e) => (
              <div key={e.id} className="flex flex-col gap-2 p-3 bg-slate-50 border-l-[3px] border-[#005c8d] shadow-sm">
                {editingElementId === e.id ? (
                  <div className="flex flex-col gap-2">
                    <input 
                      type="text" 
                      value={editingElementName} 
                      onChange={ev => setEditingElementName(ev.target.value)} 
                      className="px-3 py-1.5 border-2 border-[#005c8d] bg-white text-xs font-bold text-slate-900 outline-none"
                      placeholder="Naziv elementa"
                      autoFocus
                    />
                    <input 
                      type="text" 
                      value={editingElementDesc} 
                      onChange={ev => setEditingElementDesc(ev.target.value)} 
                      className="px-3 py-1.5 border border-slate-300 bg-white text-xs text-slate-600 outline-none"
                      placeholder="Opis (opcionalno)"
                    />
                    <div className="flex gap-2 justify-end mt-1">
                      <button onClick={handleEdit} className="p-1.5 px-3 bg-[#005c8d] text-white hover:bg-[#004a70] text-[10px] font-bold uppercase flex items-center gap-1"><Check size={12}/> Spremi</button>
                      <button onClick={() => setEditingElementId(null)} className="p-1.5 px-3 bg-slate-200 text-slate-600 hover:bg-slate-300 text-[10px] uppercase font-bold flex items-center gap-1"><X size={12}/> Odustani</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{e.name}</span>
                      <div className="flex gap-1.5 items-center">
                         <button onClick={() => { setEditingElementId(e.id); setEditingElementName(e.name); setEditingElementDesc(e.description || ''); }} className="text-[9px] font-black uppercase text-[#005c8d] hover:underline">Uredi</button>
                         <span className="text-slate-300 text-[9px]">|</span>
                         <button onClick={() => handleDelete(e.id, e.name)} className="text-[9px] font-black uppercase text-red-600 hover:underline">Obriši</button>
                      </div>
                    </div>
                    {e.description && <p className="text-[10px] text-slate-500 italic">{e.description}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
            <input 
              type="text" 
              value={newElementName} 
              onChange={e => setNewElementName(e.target.value)}
              placeholder="Novi element (npr. Domaća zadaća)"
              className="px-3 py-2 border-2 border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-[#005c8d]"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input 
              type="text" 
              value={newElementDesc} 
              onChange={e => setNewElementDesc(e.target.value)}
              placeholder="Opis (opcionalno)"
              className="px-3 py-2 border border-slate-200 bg-white text-xs text-slate-600 outline-none focus:border-[#005c8d]"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button onClick={handleAdd} className="mt-1 bg-[#005c8d] text-white px-4 py-2 text-[10px] font-black uppercase hover:bg-[#004a70] transition-colors leading-none tracking-widest">Dodaj element</button>
          </div>
        </div>
      </div>
    </div>
  );
}
