import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, Grade, Subject, StudentNote, SpecialExam, ClassSubjectTeacher as SubjectTeachingAssignment, StudentSubjectEnrollment, StudentNotes, ClassNotes, StudentYearSummary } from '../../types';
import { cn } from '../../lib/utils';
import { mappers, mapList } from '../../lib/mappers';
import { Plus, Table as TableIcon, Users, ChevronLeft, BookOpen, MessageSquare, ClipboardList, Trash2, User as UserIcon, X, Copy, Edit2 } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { toast } from 'react-hot-toast';

type ViewMode = 'STUDENTS' | 'SUBJECTS' | 'GRADES' | 'NOTES';

export default function ImenikPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId, isArchived } = useSelection();
  
  const effectiveClassId = routeClassId;

  if (!effectiveClassId) {
    return (
      <div className="p-10 text-center">
        <p className="text-gray-500 font-bold uppercase text-xs">Razred nije pronađen.</p>
      </div>
    );
  }

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectTeachingAssignment[]>([]);
  const [enrollments, setEnrollments] = useState<StudentSubjectEnrollment[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('STUDENTS');
  const [activeStudent, setActiveStudent] = useState<User | null>(null);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);

  const [gradingElements, setGradingElements] = useState<any[]>([]);

  const gradingElementNames = gradingElements.length > 0 
    ? gradingElements.map(ge => ge.name)
    : [
        'usvojenost, razumijevanje i primjena programskih sadržaja - usmeno',
        'usvojenost, razumijevanje i primjena programskih sadržaja - pisano',
        'usvojenost, razumijevanje i primjena programskih sadržaja - domaći uradak'
      ];

  const MONTHS_ORDER = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const MONTH_MAP = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
  
  const [currentGrades, setCurrentGrades] = useState<Grade[]>([]);
  const [currentNotes, setCurrentNotes] = useState<StudentNote[]>([]);
  const [finalGrades, setFinalGrades] = useState<Grade[]>([]);
  const [specialExams, setSpecialExams] = useState<SpecialExam[]>([]);
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
  const [showGradingElementsModal, setShowGradingElementsModal] = useState(false);
  
  const [newGrade, setNewGrade] = useState({ 
    value: 5, 
    category: '', 
    note: '', 
    isImportant: true, 
    customDate: new Date().toISOString().split('T')[0] 
  });
  const [newSpecialExam, setNewSpecialExam] = useState({
    type: 'Dopunski' as 'Dopunski' | 'Razlikovni',
    note: '',
    grade: 5
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

  useEffect(() => {
    if (!effectiveClassId) return;
    const fetchStudents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('student_class_enrollments')
          .select('*, student:user_profiles(*)')
          .eq('class_id', effectiveClassId)
          .eq('status', 'ACTIVE');
        if (error) throw error;
        const mappedStudents = (data || []).map(row => {
          const u = mappers.user(row.student);
          return {
            ...u
          };
        }) as User[];
        
const uniqueStudents = Array.from(new Map(mappedStudents.map(s => [s.id, s])).values());
setStudents(uniqueStudents);

      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju učenika');
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, [effectiveClassId]);

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
    let gradeChannel: any = null;
    let noteChannel: any = null;

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
        const { data } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id)
          .eq('is_final', false);
        if (data) setCurrentGrades(mapList(data, mappers.grade));
      };
      
      const fetchNotes = async () => {
        const { data } = await supabase
          .from('student_notes')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id);
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

      const fetchSpecials = async () => {
        const { data } = await supabase
          .from('special_exams')
          .select('*')
          .eq('student_id', activeStudent.id)
          .eq('subject_id', activeSubject.id)
          .eq('class_id', effectiveClassId);
        if (data) setSpecialExams(data);
      };

      fetchGradingElements();
      fetchGrades();
      fetchNotes();
      fetchFinals();
      fetchSpecials();

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
    let snChannel: any = null;
    let cnChannel: any = null;

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
          .from('class_notes')
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

      const { data: finals } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('subject_id', activeSubject.id)
        .eq('class_id', effectiveClassId)
        .eq('is_final', true);
      setFinalGrades(mapList(finals || [], mappers.grade));

      const { data: specials } = await supabase
        .from('special_exams')
        .select('*')
        .eq('student_id', activeStudent.id)
        .eq('subject_id', activeSubject.id)
        .eq('class_id', effectiveClassId);
      setSpecialExams(mapList(specials || [], mappers.specialExam));
    } finally {
      setLoading(false);
    }
  };

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
        await supabase.from('class_notes').update(payload).eq('id', classOverallNotes.id);
      } else {
        await supabase.from('class_notes').insert([payload]);
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
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
          <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#005c8d] uppercase tracking-tight leading-none">{activeStudent.surname} {activeStudent.name}</h2>
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
            content={classOverallNotes?.homeroomInfo || (homeroomTeacher ? `${homeroomTeacher.name} ${homeroomTeacher.surname}` : '')}
            field="homeroomInfo"
            canEdit={isHomeroom}
            isClassLevel
          />

          <Section 
            title="Zamjenik razrednika" 
            content={classOverallNotes?.deputyInfo || (deputyTeacher ? `${deputyTeacher.name} ${deputyTeacher.surname}` : '')}
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
      fetchGradesAndNotes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGrade = async (gradeId: string) => {
    const grade = currentGrades.find(g => g.id === gradeId);
    if (!grade) return;
    
    if (!isMainAdmin && grade.teacherId !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ove ocjene.');
      return;
    }

    setDeleteDialog({ isOpen: true, id: gradeId, type: 'GRADE', loading: false });
  };

  const handleDeleteNote = async (noteId: string) => {
    const note = currentNotes.find(n => n.id === noteId);
    if (!note) return;

    if (!isMainAdmin && note.teacherId !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ove bilješke.');
      return;
    }

    setDeleteDialog({ isOpen: true, id: noteId, type: 'NOTE', loading: false });
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
    try {
      const { error } = await supabase.from('special_exams').insert([{
        student_id: activeStudent.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        school_id: selectedSchoolId,
        teacher_id: user.id,
        type: newSpecialExam.type,
        note: newSpecialExam.note,
        grade: newSpecialExam.grade,
        timestamp: new Date().toISOString()
      }]);
      if (error) throw error;
      setShowSpecialExamModal(false);
      fetchGradesAndNotes();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri dodavanju ispita');
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
      
      const { data: existing, error: fe } = await supabase
        .from('grades')
        .select('id')
        .eq('student_id', activeStudent.id)
        .eq('subject_id', activeSubject.id)
        .eq('class_id', effectiveClassId)
        .eq('is_final', true)
        .maybeSingle();

      if (fe) throw fe;
      
      const numericGrade = typeof val === 'number' ? val : 0;
      const payload = {
        student_id: activeStudent.id,
        subject_id: activeSubject.id,
        class_id: effectiveClassId,
        school_id: selectedSchoolId,
        teacher_id: user.id,
        value: numericGrade,
        note: typeof val === 'string' ? val : '',
        period: 'FINAL', // Always save as FINAL as requested
        grade_type: 'FINAL',
        is_final: true,
        date: new Date().toISOString().split('T')[0]
      };

      if (existing) {
        const { error } = await supabase.from('grades').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('grades').insert([payload]);
        if (error) throw error;
      }
      toast.success('Zaključna ocjena spremljena.');
      setShowFinalGradeModal(false);
      fetchGradesAndNotes();
    } catch (err: any) {
      console.error(err);
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
      case 'GRADE': tableName = 'grades'; break;
      case 'NOTE': tableName = 'student_notes'; break;
      case 'SPECIAL_EXAM': tableName = 'special_exams'; break;
      case 'FINAL_GRADE': tableName = 'grades'; break;
    }

    try {
      const { error } = await supabase.from(tableName).delete().eq('id', deleteDialog.id);
      if (error) throw error;
      toast.success('Zapis je uspješno obrisan.');
      fetchGradesAndNotes();
    } catch (err) {
      console.error(err);
      toast.error('Brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
    }
  };

  const [editingNote, setEditingNote] = useState<{ id: string, content: string, type: 'GRADE' | 'GENERAL' } | null>(null);
  const handleUpdateNote = async () => {
    if (!editingNote) return;
    try {
      if (editingNote.type === 'GRADE') {
        await supabase.from('grades').update({ note: editingNote.content }).eq('id', editingNote.id);
      } else {
        await supabase.from('student_notes').update({ content: editingNote.content }).eq('id', editingNote.id);
      }
      setEditingNote(null);
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
    const sorted = [...students].sort((a,b) => (String(a.surname || "")).localeCompare(b.surname));
    const idx = sorted.findIndex(s => s.id === activeStudent.id);
    if (dir === 'PREV' && idx > 0) setActiveStudent(sorted[idx - 1]);
    else if (dir === 'PREV') setActiveStudent(sorted[sorted.length - 1]);
    else if (dir === 'NEXT' && idx < sorted.length - 1) setActiveStudent(sorted[idx + 1]);
    else if (dir === 'NEXT') setActiveStudent(sorted[0]);
  };

  const handleRandomStudent = () => {
    if (students.length === 0) return;
    const rnd = Math.floor(Math.random() * students.length);
    setActiveStudent(students[rnd]);
  };

  const renderStudents = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between border-b pb-4 border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Imenik</h1>
        </div>
      </div>

      <div className="bg-white border border-gray-300">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="px-3 py-2 font-black uppercase text-gray-500 w-12 text-center border-r border-gray-300">R.br.</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Prezime i ime</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Program / OIB</th>
              <th className="px-4 py-2 font-black uppercase text-gray-500">E-mail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {students.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map((s, idx) => (
              <tr key={s.id} onClick={() => { setActiveStudent(s); setViewMode('SUBJECTS'); }} className="group hover:bg-[#eff6ff] cursor-pointer transition-colors">
                <td className="px-3 py-2 text-center font-bold text-gray-500 border-r border-gray-200">{idx + 1}.</td>
                <td className="px-4 py-2 font-bold text-[#005c8d] border-r border-gray-200 group-hover:underline">{s.name}</td>
                <td className="px-4 py-2 border-r border-gray-200">
                  <div className="text-[10px] font-bold text-gray-600 uppercase italic opacity-70">{s.program || 'Opći'}</div>
                  <div className="text-[10px] font-bold">{s.oib || 'N/A'}</div>
                </td>
                <td className="px-4 py-2 text-gray-500 text-[11px]">{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSubjectSelector = () => (
    <div className="p-4 space-y-4">
      <div className="border-b border-gray-200 pb-2 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-none">{activeStudent?.surname} {activeStudent?.name}</h1>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Učenička kartica - Popis predmeta</p>
        </div>
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
                const isActive = enrollments.some(e => e.studentId === activeStudent?.id && e.subjectId === sub.id && e.status === 'ACTIVE');
                if (!isActive) return false;
                
                if (isMainAdmin) return true;
                const activeClass = classes.find(c => c.id === effectiveClassId);
                const isHomeroomOrDeputy = activeClass?.homeroomTeacherId === user?.id || activeClass?.deputyTeacherId === user?.id;
                if (isHomeroomOrDeputy) return true;
                
                return subjectAssignments.some(a => a.classId === effectiveClassId && a.subjectId === sub.id && a.teacherId === user?.id);
              })
              .map(sub => {
                const assignment = subjectAssignments.find(a => a.classId === effectiveClassId && a.subjectId === sub.id);
                const teacher = teachers.find(t => t.id === assignment?.teacherId);
                return (
                  <tr key={sub.id} onClick={() => { setActiveSubject(sub); setViewMode('GRADES'); }} className="group hover:bg-[#eff6ff] cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-700">
                      <div className="flex items-center gap-3">
                        <BookOpen size={14} className="text-gray-300" />
                        <div>
                          <div className="text-sm">{sub.name}</div>
                          <div className="text-[10px] text-gray-400 font-normal uppercase tracking-wider">
                            {teacher ? `${teacher.name} ${teacher.surname}` : 'Nema dodijeljenog nastavnika'}
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
    const avg = (currentGrades.reduce((a, b) => a + b.value, 0) / (currentGrades.length || 1)).toFixed(2);
    
    const getSuggestedGrade = (avgValue: number) => {
      if (avgValue >= 4.5) return 5;
      if (avgValue >= 3.5) return 4;
      if (avgValue >= 2.5) return 3;
      if (avgValue >= 1.5) return 2;
      if (avgValue >= 1.0) return 1;
      return null;
    };

    const studentIndex = students.sort((a,b) => (String(a.surname || "")).localeCompare(b.surname)).findIndex(s => s.id === activeStudent?.id);
    
    const gridGrades: Record<string, Record<string, number[]>> = {};
    gradingElementNames.forEach(cat => gridGrades[cat] = {});
    currentGrades.forEach(g => {
      const m = MONTH_MAP[new Date(g.date).getMonth() + 1 as keyof typeof MONTH_MAP];
      if (m && gridGrades[g.category]) {
        if (!gridGrades[g.category][m]) gridGrades[g.category][m] = [];
        gridGrades[g.category][m].push(g.value);
      }
    });

    return (
      <div className="p-4 h-full flex flex-col space-y-4 max-w-[1400px] mx-auto pb-20">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between border-b border-[#005c8d] pb-2">
            <div className="flex items-center gap-4">
              <button onClick={() => setViewMode('SUBJECTS')} className="text-gray-400 hover:text-gray-600 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-[#005c8d] leading-none uppercase tracking-tight">
                  {studentIndex + 1}. {activeStudent?.surname} {activeStudent?.name}
                </h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tight">Učenička kartica · {activeSubject?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
               <button onClick={() => navigateStudent('PREV')} className="px-3 py-1 bg-gray-100 border border-gray-300 text-[10px] font-bold hover:bg-gray-200 uppercase">Prethodni</button>
               <button onClick={() => navigateStudent('NEXT')} className="px-3 py-1 bg-[#005c8d] text-white border border-[#004a70] text-[10px] font-bold hover:bg-[#004a70] uppercase">Sljedeći</button>
               <button onClick={handleRandomStudent} className="px-3 py-1 bg-gray-800 text-white border border-black text-[10px] font-bold hover:bg-black ml-2 uppercase">Slučajni</button>
            </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-300 overflow-x-auto overflow-y-hidden">
          <table className="w-full border-collapse table-fixed min-w-[1000px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border border-gray-300 text-[10px] font-bold uppercase text-gray-500 w-48 text-left flex items-center justify-between">
                  Element ocjenjivanja
                  {canEditGrades(activeSubject?.id || '') && (
                    <button onClick={() => setShowGradingElementsModal(true)} className="text-[8px] text-[#005c8d] hover:underline">UREDI</button>
                  )}
                </th>
                {MONTHS_ORDER.map(m => (
                  <th key={m} className="p-2 border border-gray-300 text-[10px] font-bold uppercase text-gray-400 text-center w-12">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
               {gradingElementNames.map(cat => (
                 <tr key={cat}>
                    <td className="p-2 border border-gray-300 text-[11px] font-bold text-gray-700 bg-white align-top">{cat}</td>
                    {MONTHS_ORDER.map(m => (
                      <td 
                        key={m} 
                        onClick={() => { 
                          if (isArchived) return;
                          setNewGrade({ ...newGrade, category: cat, note: '', value: 5 }); 
                          setShowGradeModal(true); 
                        }} 
                        className={cn(
                          "p-1 border border-gray-300 bg-white hover:bg-blue-50 transition-colors align-top text-center",
                          !isArchived && "cursor-pointer"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {gridGrades[cat]?.[m]?.map((v, i) => (
                            <span key={i} className={cn("inline-flex w-5 h-5 items-center justify-center text-[10px] font-bold border", v === 1 ? "bg-red-50 border-red-200 text-red-600" : "bg-blue-50 border-blue-200 text-[#005c8d]")}>{v}</span>
                          ))}
                        </div>
                      </td>
                    ))}
                 </tr>
               ))}
               <tr className="bg-gray-50">
                 <td className="p-2 border border-gray-300 text-[10px] font-bold text-[#005c8d] uppercase">Zaključna ocjena</td>
                 <td className="border border-gray-300 text-center" colSpan={4}>
                    {(() => {
                      const fg = finalGrades.find(f => f.period === '1');
                      const suggested = getSuggestedGrade(Number(avg));
                      return (
                        <div className="w-full h-full p-2 flex flex-col items-center justify-center min-h-[40px]">
                          {fg ? (
                            <div className="flex items-center gap-2 group">
                              <span className="text-[8px] font-bold text-gray-400 uppercase">1. pol:</span>
                              <span className="font-bold text-[#005c8d] text-base">{fg.value === 0 ? fg.note : fg.value}</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteFinalGrade(fg.id); }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-1"
                                >
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[8px] font-bold text-gray-300 uppercase">Zaključna ocjena nije unesena (1. pol)</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={() => { setSelectedFinalPeriod('1'); setShowFinalGradeModal(true); }}
                                  className="text-[8px] font-bold text-[#005c8d] uppercase hover:underline"
                                >
                                  Unesi ocjenu
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                 </td>
                 <td className="border border-gray-300 text-center" colSpan={6}>
                    {(() => {
                      const fg = finalGrades.find(f => f.period === 'FINAL');
                      const suggested = getSuggestedGrade(Number(avg));
                      return (
                        <div className="w-full h-full p-2 flex flex-col items-center justify-center min-h-[40px]">
                          {fg ? (
                            <div className="flex items-center gap-2 group">
                              <span className="text-[8px] font-bold text-gray-400 uppercase">Zaključna:</span>
                              <span className="font-bold text-[#005c8d] text-base">{fg.value === 0 ? fg.note : fg.value}</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteFinalGrade(fg.id); }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-1"
                                >
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[8px] font-bold text-gray-300 uppercase">Zaključna ocjena nije unesena</span>
                              {canEditGrades(activeSubject?.id || '') && (
                                <button 
                                  onClick={() => { setSelectedFinalPeriod('FINAL'); setShowFinalGradeModal(true); }}
                                  className="text-[8px] font-bold text-[#005c8d] uppercase hover:underline"
                                >
                                  Unesi ocjenu
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
           <span className="text-gray-500 uppercase">Ukupan broj ocjena: <span className="text-gray-900">{currentGrades.length}</span></span>
           <span className="text-gray-500 uppercase tracking-tight">Aritmetička sredina: <span className="text-[#005c8d] text-sm leading-none ml-1">{avg}</span></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Special exams */}
           <div className="space-y-1">
              <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                 <h2 className="text-[11px] font-bold uppercase text-gray-500">Dopunski i razlikovni ispiti</h2>
                 <button onClick={() => setShowSpecialExamModal(true)} className="text-[9px] font-bold text-[#005c8d] uppercase hover:underline">+ Dodaj</button>
              </div>
              <div className="bg-white border border-gray-300">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead><tr className="bg-gray-50 font-bold text-gray-400 uppercase border-b border-gray-300"><th className="p-2">Vrsta</th><th className="p-2">Bilješka</th><th className="p-2 text-center w-12 border-x border-gray-300">Ocjena</th><th className="p-2 w-8"></th></tr></thead>
                  <tbody>
                  {specialExams.length === 0 ? (<tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">Nema podataka</td></tr>) : 
                  specialExams.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(ex => (
                    <tr key={ex.id} className="group hover:bg-gray-50 border-b border-gray-200 last:border-0 text-[11px]">
                      <td className="p-2 font-bold text-[#005c8d]">{ex.type}</td>
                      <td className="p-2 text-gray-600">{ex.note}</td>
                      <td className="p-2 text-center border-x border-gray-200 font-bold">{ex.grade}</td>
                      <td className="p-2">
                        <button 
                          onClick={() => handleDeleteSpecialExam(ex.id)} 
                          className="text-gray-300 hover:text-red-500 p-1"
                        >
                          <Trash2 size={12}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
           </div>

           {/* History Table */}
           <div className="space-y-1">
              <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                 <h2 className="text-[11px] font-bold uppercase text-gray-500">Povijest unosa</h2>
                 <button onClick={() => setShowNoteModal(true)} className="text-[9px] font-bold text-[#005c8d] uppercase hover:underline">+ Bilješka</button>
              </div>
              <div className="bg-white border border-gray-300 flex flex-col h-64">
                 <div className="overflow-auto scrollbar-thin">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead className="sticky top-0 bg-gray-50 font-bold text-gray-400 uppercase border-b border-gray-300">
                        <tr>
                          <th className="p-2 border-r border-gray-300">Sadržaj / Napomena</th>
                          <th className="p-2 text-center w-10 border-r border-gray-300">Ocj.</th>
                          <th className="p-2 w-20">Datum</th>
                          <th className="p-2 w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {currentGrades.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(g => (
                          <tr key={g.id} className="group hover:bg-gray-50">
                            <td className="p-2 border-r border-gray-100">
                              <div className="font-bold text-gray-800">{g.category}</div>
                              <div className="text-[10px] text-gray-400 italic mt-0.5 line-clamp-1">{g.note || 'Nema bilješke'}</div>
                            </td>
                            <td className="p-2 text-center font-bold text-[#005c8d] border-r border-gray-100 bg-blue-50/30">{g.value}</td>
                            <td className="p-2 text-gray-400 font-bold uppercase">{new Date(g.date).toLocaleDateString('hr-HR')}</td>
                            <td className="p-2">
                              <button 
                                onClick={() => handleDeleteGrade(g.id)} 
                                className="text-gray-300 hover:text-red-500 p-1"
                              >
                                <Trash2 size={12}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {currentNotes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(n => (
                          <tr key={n.id} className="group hover:bg-gray-50">
                            <td className="p-2 border-r border-gray-100 bg-yellow-50/10">
                              <div className="text-[8px] font-bold text-gray-300 uppercase mb-0.5">Bilješka</div>
                              <div className="text-gray-600 italic line-clamp-1">{n.content}</div>
                            </td>
                            <td className="p-2 text-center text-gray-300 border-r border-gray-100">—</td>
                            <td className="p-2 text-gray-400 font-bold uppercase">{new Date(n.date).toLocaleDateString('hr-HR')}</td>
                            <td className="p-2">
                              <button 
                                onClick={() => handleDeleteNote(n.id)} 
                                className="text-gray-300 hover:text-red-500 p-1"
                              >
                                <Trash2 size={12}/>
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
             </div>
           )}

           <div className="mt-auto p-4 border-t border-gray-200">
              {activeStudent && (
                <button 
                  onClick={() => { setViewMode('STUDENTS'); setActiveStudent(null); }} 
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
              <div className="text-center"><h4 className="text-base font-bold text-gray-900 leading-tight">{activeStudent?.name} {activeStudent?.surname}</h4><p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{activeSubject?.name}</p></div>
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
                <div><h4 className="font-bold text-[#005c8d] text-base leading-tight">{activeStudent?.name} {activeStudent?.surname}</h4><div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{activeSubject?.name}</div></div>
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
             <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase"><h3>Dopunski / Razlikovni ispit</h3><button onClick={()=>setShowSpecialExamModal(false)}><X size={16}/></button></div>
             <div className="p-6 space-y-4 text-left">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-gray-400">Vrsta</label><select value={newSpecialExam.type} onChange={e => setNewSpecialExam({...newSpecialExam, type: e.target.value as any})} className="w-full border p-1 text-[11px] font-bold leading-tight"><option value="Dopunski">Dopunski</option><option value="Razlikovni">Razlikovni</option></select></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-gray-400">Ocjena</label><select value={newSpecialExam.grade} onChange={e => setNewSpecialExam({...newSpecialExam, grade: parseInt(e.target.value)})} className="w-full border p-1 text-[11px] font-bold leading-tight">{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-gray-400">Bilješka</label><textarea value={newSpecialExam.note} onChange={e => setNewSpecialExam({...newSpecialExam, note: e.target.value})} rows={2} className="w-full border p-2 text-[11px]" placeholder="npr. 1. razlikovni ispit..." /></div>
                <button onClick={handleAddSpecialExam} className="w-full py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px]">Spremi ispit</button>
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
                <div className="grid grid-cols-2 gap-1">
                   {['Neocijenjen', 'Oslobođen'].map(v => (<button key={v} onClick={()=>handleAddFinalGrade(v)} className="py-1 border bg-gray-50 text-[10px] font-bold uppercase text-gray-400 hover:bg-[#005c8d] hover:text-white transition-all">{v}</button>))}
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
                 <h3 className="tracking-tight">Grupni unos ocjena: {activeSubject?.name}</h3>
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
                    {students.sort((a,b)=>(String(a.surname || "")).localeCompare(b.surname)).map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                         <td className="p-2 text-[11px] font-bold text-gray-700">{s.surname} {s.name}</td>
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
                 <h3 className="tracking-tight">Grupni unos bilješki: {activeSubject?.name}</h3>
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
                    {students.sort((a,b)=>(String(a.surname || "")).localeCompare(b.surname)).map(s=>(
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-2 text-[11px] font-bold text-gray-700 border-r border-gray-200">{s.surname} {s.name}</td>
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

      {showGradingElementsModal && activeSubject && (
        <GradingElementsModal 
          isOpen={showGradingElementsModal} 
          onClose={() => setShowGradingElementsModal(false)} 
          subject={activeSubject}
          classId={effectiveClassId!}
          schoolId={selectedSchoolId!}
          teacherId={user?.id!}
          onRefresh={() => {
            // refresh logic
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
    try {
      const { error } = await supabase.from('grading_elements').insert([{
        school_id: schoolId,
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subject.id,
        name: newElementName.trim(),
        description: newElementDesc.trim() || null,
        display_order: elements.length
      }]);
      if (error) throw error;
      setNewElementName('');
      setNewElementDesc('');
      fetchElements();
      onRefresh();
    } catch (err) {
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
