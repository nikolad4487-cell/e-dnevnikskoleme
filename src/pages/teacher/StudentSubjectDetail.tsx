import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Role, DeletionReason, deletionReasonLabels } from '../../types';
import {
  sortStudentsBySurname,
  formatSubjectDisplayName,
  formatSubjectName,
  formatPersonName,
  getLocalDateISO,
  formatCroatianDate,
  formatCroatianDateTime,
  getGradeDateBounds,
  isGradeDateAllowed
} from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import GroupGradesModal from '../../components/GroupGradesModal';
import GroupNotesModal from '../../components/GroupNotesModal';
import GroupFinalGradesModal from '../../components/GroupFinalGradesModal';
import { 
  ChevronLeft, 
  ChevronRight, 
  Shuffle, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Users, 
  BookOpen, 
  FileText, 
  XCircle, 
  Clock, 
  Calculator,
  Calendar,
  AlertTriangle
} from 'lucide-react';

const deletionReasonOptions = Object.values(DeletionReason).map(value => ({
  value,
  label: deletionReasonLabels[value]
}));

const mapApiStudentNote = (note: any) => ({
  ...note,
  teacher_id: note.author_id || note.teacher_id,
  content: note.text_content || note.content,
  date: note.reference_date || note.date,
  author_name: note.author_name || note.author?.name,
  created_at: note.created_at
});

const todayDateISO = getLocalDateISO();
const gradeDateBounds = getGradeDateBounds();

const getProfileDisplayName = (profile: any) =>
  formatPersonName(profile) || profile?.full_name || profile?.name || 'Nastavnik';

interface ElementGroup {
  name: string;
  gradesByMonth: Record<string, any[]>;
}

interface GradeSelectorProps {
  value: number | string | null | undefined;
  onChange: (val: number | null) => void;
  allowClear?: boolean;
  clearLabel?: string;
}

function GradeSelector({ value, onChange, allowClear = false, clearLabel = "-- Bez ocjene --" }: GradeSelectorProps) {
  const gradesList = [1, 2, 3, 4, 5];
  const currentValue = value !== undefined && value !== null && value !== '' ? Number(value) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {gradesList.map((g) => {
          const isSelected = currentValue === g;
          return (
            <button
              key={g}
              type="button"
              id={`grade-selector-btn-${g}`}
              onClick={() => onChange(g)}
              className={`w-11 h-11 rounded border text-sm font-black transition-all duration-150 flex items-center justify-center select-none
                ${isSelected 
                  ? 'bg-[#005c8d] text-white border-[#005c8d] shadow-md scale-105' 
                  : 'bg-white text-slate-700 border-gray-300 hover:bg-slate-50 hover:border-gray-400'
                }
              `}
            >
              {g}
            </button>
          );
        })}
      </div>
      {allowClear && (
        <div className="pt-0.5">
          <button
            type="button"
            id="grade-selector-clear-btn"
            onClick={() => onChange(null)}
            className="text-[10px] font-black text-gray-400 hover:text-red-600 underline uppercase tracking-wider"
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function FinalGradeSelector({ value, status, onChange }: { value: string | null, status: string | null, onChange: (value: string | null, status: string | null) => void }) {
  const grades = [1, 2, 3, 4, 5];
  const statuses = ["NEOCIJENJEN", "OSLOBODEN", "ODRADENO", "NEODRADENO"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {grades.map(g => (
          <button
            key={g}
            type="button"
            onClick={() => onChange(String(g), null)}
            className={`w-11 h-11 rounded border text-sm font-black transition-all duration-150 flex items-center justify-center ${value === String(g) ? 'bg-[#005c8d] text-white' : 'bg-white text-slate-700'}`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {statuses.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => onChange(null, st)}
              className={`px-3 py-2 rounded text-xs font-bold transition-all ${status === st ? 'bg-[#005c8d] text-white' : 'bg-gray-200 text-slate-700'}`}
            >
              {st === 'NEOCIJENJEN' ? 'Neocijenjen' : st === 'OSLOBODEN' ? 'Oslobođen' : st === 'ODRADENO' ? 'Odrađeno' : 'Neodrađeno'}
            </button>
        ))}
      </div>
    </div>
  );
}
export default function StudentSubjectDetail() {
  const { classId, studentId, subjectId } = useParams();
  const navigate = useNavigate();
  const { user, isMainAdmin, isTeacher, userSchoolRoles } = useAuth();

  // App state
  const [loading, setLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [student, setStudent] = useState<any>(null);
  const [subject, setSubject] = useState<any>(null);
  const [classroom, setClassroom] = useState<any>(null);
  const [studentIndex, setStudentIndex] = useState<number>(0);
  const [isEnrolled, setIsEnrolled] = useState(true);
  const [allClassStudents, setAllClassStudents] = useState<any[]>([]);

  // Editing states
  const [editingGrade, setEditingGrade] = useState<any>(null);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editingExam, setEditingExam] = useState<any>(null);

  // New delete state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    type: 'GRADE' | 'NOTE' | null;
    loading: boolean;
    message: string;
    showTotp?: boolean;
    showReason?: boolean;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false,
    message: '',
    showTotp: false
  });
  
  // Data lists
  const [gradingElements, setGradingElements] = useState<string[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [finalGrades, setFinalGrades] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // Modals / Modifiers
  const [showAddGradeModal, setShowAddGradeModal] = useState(false);
  const [newGradeVal, setNewGradeVal] = useState<number | null>(null);
  const [newGradeElement, setNewGradeElement] = useState<string>('');
  const [newGradeNote, setNewGradeNote] = useState<string>('');
  const [newGradeDate, setNewGradeDate] = useState<string>(todayDateISO);

  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteDate, setNewNoteDate] = useState<string>(todayDateISO);

  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [newExamType, setNewExamType] = useState('Dopunski ispit');
  const [newExamNote, setNewExamNote] = useState('');
  const [newExamGrade, setNewExamGrade] = useState<number | ''>('');
  const [newExamDate, setNewExamDate] = useState<string>(todayDateISO);

  const [showFinalModal, setShowFinalModal] = useState<{ isOpen: boolean; term: 'FIRST_SEMESTER' | 'SECOND_SEMESTER' }>({ isOpen: false, term: 'FIRST_SEMESTER' });
  const [finalGradeValue, setFinalGradeValue] = useState<string>('');
  const [finalGradeStatus, setFinalGradeStatus] = useState<string | null>(null);

  const [showAddElementModal, setShowAddElementModal] = useState(false);
  const [newElementName, setNewElementName] = useState('');
  const [editingElementOriginalName, setEditingElementOriginalName] = useState<string>('');
  const [editingElementName, setEditingElementName] = useState<string>('');

  const [showGroupGradesModal, setShowGroupGradesModal] = useState(false);
  const [showGroupNotesModal, setShowGroupNotesModal] = useState(false);
  const [showGroupFinalGradesModal, setShowGroupFinalGradesModal] = useState(false);

  // Clock updating
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Niste prijavljeni.');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    };
  };

  const fetchStudentNotes = async () => {
    if (!studentId || !subjectId || !classId) return [];
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ studentId, subjectId, classId });
    const res = await fetch(`/api/student-notes?${params.toString()}`, { headers });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Greška pri dohvaćanju bilješki.');
    return (json.data || []).map(mapApiStudentNote);
  };

  const currentUserDisplayName = getProfileDisplayName(user);

  const getTeacherNamesById = async (teacherIds: string[]) => {
    const uniqueTeacherIds = Array.from(new Set(teacherIds.filter(Boolean)));
    if (uniqueTeacherIds.length === 0) return new Map<string, string>();

    const names = new Map<string, string>();
    const currentUserIds = [user?.id, user?.authUserId].filter(Boolean);
    currentUserIds.forEach(id => {
      if (uniqueTeacherIds.includes(String(id))) {
        names.set(String(id), currentUserDisplayName);
      }
    });

    const { data: profilesById, error: profileIdError } = await supabase
      .from('user_profiles')
      .select('id, auth_user_id, name, surname, first_name, last_name, full_name')
      .in('id', uniqueTeacherIds);

    if (profileIdError) {
      console.warn('Teacher profile fetch by id failed:', profileIdError);
    }

    (profilesById || []).forEach((profile: any) => {
      const displayName = getProfileDisplayName(profile);
      if (profile.id) names.set(profile.id, displayName);
      if (profile.auth_user_id) names.set(profile.auth_user_id, displayName);
    });

    const missingIds = uniqueTeacherIds.filter(id => !names.has(id));
    if (missingIds.length > 0) {
      const { data: profilesByAuthId, error: authIdError } = await supabase
        .from('user_profiles')
        .select('id, auth_user_id, name, surname, first_name, last_name, full_name')
        .in('auth_user_id', missingIds);

      if (authIdError) {
        console.warn('Teacher profile fetch by auth_user_id failed:', authIdError);
      }

      (profilesByAuthId || []).forEach((profile: any) => {
        const displayName = getProfileDisplayName(profile);
        if (profile.id) names.set(profile.id, displayName);
        if (profile.auth_user_id) names.set(profile.auth_user_id, displayName);
      });
    }

    return names;
  };

  // Main data fetch
  const loadAllData = async () => {
    if (!studentId || !classId || !subjectId) return;
    setLoading(true);

    console.log("LOAD DATA START");

    try {
      // Critical Loads: Must succeed for the page to function
      console.log("LOAD CRITICAL START");
      const [
        { data: profile, error: profileError },
        { data: subData, error: subError },
        { data: classData, error: classError },
        { data: enrollments, error: enrollError },
        { data: gemData, error: gemError },
        { data: grData, error: grError },
        { data: finGrData, error: finGrError },
        { data: examData, error: examError }
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', studentId).single(),
        supabase.from('subjects').select('*').eq('id', subjectId).single(),
        supabase.from('classes').select('*').eq('id', classId).single(),
        supabase.from('student_subject_enrollments')
          .select('student_id, student:user_profiles(*)')
          .eq('class_id', classId)
          .eq('subject_id', subjectId)
          .eq('status', 'ACTIVE'),
        supabase.from('grading_elements').select('name').eq('class_id', classId).eq('subject_id', subjectId),
        supabase.from('grades').select('*').eq('student_id', studentId).eq('subject_id', subjectId).eq('class_id', classId),
        supabase.from('final_grades').select('*').eq('student_id', studentId).eq('subject_id', subjectId).eq('class_id', classId),
        supabase.from('exams').select('*').eq('student_id', studentId).eq('subject_id', subjectId).eq('class_id', classId),
      ]);

      console.log("QUERY RESULTS", { profile, subData, classData, enrollments, gemData, grData, finGrData, examData });
      if (profileError) console.error("Profile Error", profileError);
      if (subError) console.error("Subject Error", subError);
      if (classError) console.error("Class Error", classError);
      if (enrollError) console.error("Enroll Error", enrollError);
      if (gemError) console.error("Gem Error", gemError);
      if (grError) console.error("Grades Error", grError);
      if (finGrError) console.error("Final Grades Error", finGrError);
      if (examError) console.error("Exams Error", examError);

      if (profile) setStudent(profile);
      if (subData) {
        let subjectType = 'REQUIRED';
        try {
          const { data: clsSub } = await supabase
            .from('class_subjects')
            .select('subject_type')
            .eq('class_id', classId)
            .eq('subject_id', subjectId)
            .maybeSingle();
          if (clsSub?.subject_type) {
            subjectType = clsSub.subject_type;
          }
        } catch (e) {
          console.error(e);
        }
        setSubject({
          ...subData,
          name: formatSubjectDisplayName(subData.name, subjectType)
        });
      }
      if (classData) setClassroom(classData);

      let enrolled = true;
      if (enrollments && enrollments.length > 0) {
        const sorted = sortStudentsBySurname(enrollments);
        setAllClassStudents(sorted);
        const currentIndex = sorted.findIndex(s => s.student_id === studentId);
        if (currentIndex !== -1) {
          setStudentIndex(currentIndex + 1);
        } else {
          enrolled = false;
        }
      } else {
        enrolled = false;
      }
      setIsEnrolled(enrolled);

      const elementNames = gemData?.map(g => g.name) || [];
      setGradingElements(elementNames);
      if (elementNames.length > 0 && !newGradeElement) {
        setNewGradeElement(elementNames[0]);
      }

      const teacherNames = await getTeacherNamesById((grData || []).map((g: any) => g.teacher_id || g.teacherId));
      setGrades((grData || []).map((grade: any) => ({
        ...grade,
        teacher_name: teacherNames.get(grade.teacher_id || grade.teacherId) || 'Nepoznato'
      })));
      const mappedFinGrData = (finGrData || []).map((fg: any) => {
        const isStatus = ["NEOCIJENJEN", "OSLOBODEN", "ODRADENO", "NEODRADENO"].includes(fg.value);
        return {
          ...fg,
          status: isStatus ? fg.value : null,
          value: isStatus ? '' : fg.value
        };
      });
      setFinalGrades(mappedFinGrData);
      setNotes(await fetchStudentNotes());
      setExams(examData || []);

      const { data: isTeacherAssigned } = await supabase
        .from('class_subject_teachers')
        .select('id')
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('teacher_id', user?.id)
        .maybeSingle();

      const schoolAdmin = (userSchoolRoles || []).some(r => 
        r && r.schoolId === classData?.school_id && 
        [Role.ADMIN, Role.SCHOOL_ADMIN].includes(r.role as Role)
      );

      const computedCanEdit = !!(isMainAdmin || schoolAdmin || isTeacherAssigned);
      setCanEdit(computedCanEdit);
      console.log("LOAD CRITICAL COMPLETED. CAN EDIT:", computedCanEdit);

    } catch (error) {
      console.error('Error fetching critical data:', error);
      toast.error('Greska pri učitavanju bitnih podataka.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [studentId, subjectId, classId]);

  // Navigate between students alphabetically
  const handlePrevStudent = () => {
    if (allClassStudents.length <= 1) return;
    const currentIndex = allClassStudents.findIndex(s => s.student_id === studentId);
    let prevId = '';
    if (currentIndex > 0) {
      prevId = allClassStudents[currentIndex - 1].student_id;
    } else {
      prevId = allClassStudents[allClassStudents.length - 1].student_id;
    }
    navigate(`/class/${classId}/student/${prevId}/subject/${subjectId}`);
  };

  const handleNextStudent = () => {
    if (allClassStudents.length <= 1) return;
    const currentIndex = allClassStudents.findIndex(s => s.student_id === studentId);
    let nextId = '';
    if (currentIndex !== -1 && currentIndex < allClassStudents.length - 1) {
      nextId = allClassStudents[currentIndex + 1].student_id;
    } else {
      nextId = allClassStudents[0].student_id;
    }
    navigate(`/class/${classId}/student/${nextId}/subject/${subjectId}`);
  };

  const handleRandomStudent = () => {
    if (allClassStudents.length <= 1) return;
    let randomIndex = Math.floor(Math.random() * allClassStudents.length);
    while (allClassStudents[randomIndex]?.student_id === studentId && allClassStudents.length > 1) {
      randomIndex = Math.floor(Math.random() * allClassStudents.length);
    }
    navigate(`/class/${classId}/student/${allClassStudents[randomIndex].student_id}/subject/${subjectId}`);
  };

  // Grade action trigger
  const handleAddNewGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !studentId || !subjectId || !classId) return;

    if (newGradeVal === null) {
      toast.error('Odaberite ocjenu prije spremanja.');
      return;
    }

    if (!isGradeDateAllowed(newGradeDate)) {
      toast.error('Datum ocjene može biti samo u prethodnom ili tekućem mjesecu.');
      return;
    }

    try {
      const payload = {
        student_id: studentId,
        subject_id: subjectId,
        class_id: classId,
        teacher_id: user.id,
        school_id: classroom?.school_id || classroom?.schoolId || null,
        value: newGradeVal,
        element: newGradeElement,
        note: newGradeNote || '',
        date: newGradeDate,
        is_final: false,
        weight: 1,
        is_important: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('grades').insert([payload]);
      if (error) throw error;

      setShowAddGradeModal(false);
      setNewGradeVal(null);
      setNewGradeNote('');
      loadAllData();
    } catch (err) {
      console.error('Error adding grade:', err);
    }
  };

  const isAdminForCurrentSchool = () => {
    const schoolId = classroom?.school_id || classroom?.schoolId;
    return isMainAdmin || (userSchoolRoles || []).some(r =>
      r?.schoolId === schoolId && [Role.ADMIN, Role.SCHOOL_ADMIN, Role.MAIN_ADMIN, Role.SUPER_ADMIN].includes(r.role as Role)
    );
  };

  const isWithinMinutes = (createdAt: string | undefined, minutes: number) => {
    const createdTime = createdAt ? new Date(createdAt).getTime() : Date.now();
    if (!Number.isFinite(createdTime)) return true;
    return Date.now() - createdTime <= minutes * 60 * 1000;
  };

  const canDeleteGrade = (g: any) => {
    if (isAdminForCurrentSchool()) return true;
    if (!isTeacher) return false;
    const isCreator = g?.teacher_id === user?.id || g?.teacherId === user?.id;
    return isCreator && isWithinMinutes(g?.created_at || g?.createdAt, 10);
  };

  const canDeleteNote = (n: any) => {
    if (isAdminForCurrentSchool()) return true;
    return n?.teacher_id === user?.id || n?.teacherId === user?.id;
  };

  const triggerDeleteGrade = (id: string) => {
    const grade = grades.find(g => g.id === id);
    const isGradeAdmin = isAdminForCurrentSchool();
    const isCreator = grade?.teacher_id === user?.id || grade?.teacherId === user?.id;
    const isOwnQuickDelete = isCreator && isWithinMinutes(grade?.created_at || grade?.createdAt, 10);
    const requiresAdminConfirmation = isGradeAdmin && !isOwnQuickDelete;

    if (!isGradeAdmin && !isCreator) {
      toast.error('Možete obrisati samo ocjene koje ste Vi unijeli.');
      return;
    }

    if (!isGradeAdmin && !isOwnQuickDelete) {
      toast.error('Ocjenu možete obrisati samo unutar 10 minuta od unosa. Nakon toga brisanje može napraviti samo admin.');
      return;
    }

    setDeleteDialog({
      isOpen: true,
      id,
      type: 'GRADE',
      loading: false,
      message: requiresAdminConfirmation
        ? 'Za brisanje ocjene unesite TOTP kod i razlog brisanja.'
        : 'Jeste li sigurni da želite obrisati ovu ocjenu i bilješku?',
      showTotp: requiresAdminConfirmation,
      showReason: requiresAdminConfirmation
    });
  };

  const triggerDeleteNote = (id: string) => {
    setDeleteDialog({
      isOpen: true,
      id,
      type: 'NOTE',
      loading: false,
      message: 'Jeste li sigurni da želite obrisati bilješku?'
    });
  };

  const confirmDelete = async (totpCode?: string, reason?: string, detailedNote?: string) => {
    if (!deleteDialog.id || !deleteDialog.type) return;

    if (deleteDialog.showTotp) {
      if (!totpCode) {
        toast.error('Potreban je TOTP kod.');
        return;
      }

      const res = await fetch('/api/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUserId: user?.id, totpCode })
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        toast.error('API ruta za provjeru autentifikatora nije dostupna.');
        return;
      }

      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || 'Neispravan TOTP kod.');
        return;
      }
    }

    if (deleteDialog.showReason && !Object.values(DeletionReason).includes(reason as DeletionReason)) {
      toast.error('Odaberite razlog brisanja.');
      return;
    }

    if (deleteDialog.showReason && !detailedNote?.trim()) {
      toast.error('Upišite detaljnu napomenu.');
      return;
    }

    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      const deletedGradeDetails = deleteDialog.type === 'GRADE'
        ? grades.find(g => g.id === deleteDialog.id)
        : null;
      const tableName = deleteDialog.type === 'GRADE' ? 'grades' : 'student_notes';
      if (deleteDialog.type === 'NOTE') {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/student-notes/${deleteDialog.id}`, {
          method: 'DELETE',
          headers
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Greška pri brisanju bilješke.');
      } else {
        const { error } = await supabase.from(tableName).delete().eq('id', deleteDialog.id);
        if (error) throw error;
      }

      if (deleteDialog.type === 'GRADE' && deleteDialog.showReason) {
        const deletedAt = new Date().toISOString();
        await fetch('/api/audit-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'DELETE_GRADE',
            recordId: deleteDialog.id,
            userId: user?.id,
            userRole: 'ADMIN',
            reason,
            details: JSON.stringify({
              deletedRecord: deletedGradeDetails,
              adminId: user?.id,
              deletedAt,
              deletionReason: reason,
              detailedNote: detailedNote?.trim()
            })
          })
        });
      }
      
      toast.success(deleteDialog.type === 'GRADE' ? 'Ocjena i bilješka uspješno obrisane.' : 'Bilješka uspješno obrisana.');
      loadAllData();
    } catch (err) {
      console.error('Error deleting record:', err);
      toast.error('Povezivanje/brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false, message: '', showTotp: false, showReason: false });
    }
  };

  const handleDeleteGrade = async (id: string) => {
    const gObj = grades.find(g => g.id === id);
    if (gObj && !canDeleteGrade(gObj)) {
      toast.error('Možete obrisati samo ocjene koje ste Vi unijeli.');
      return;
    }
    triggerDeleteGrade(id);
  };

  const handleAddElement = async () => {
    if (!newElementName.trim() || !classId || !subjectId) return;
    try {
      let targetTeacherId = user?.id;
      if (isMainAdmin) {
        const { data: assignData } = await supabase
          .from('class_subject_teachers')
          .select('teacher_id')
          .eq('class_id', classId)
          .eq('subject_id', subjectId)
          .maybeSingle();
        if (assignData?.teacher_id) {
          targetTeacherId = assignData.teacher_id;
        }
      }

      if (!targetTeacherId) {
        console.error("Missing teacher profile id");
        alert("Nije moguće dodati element ocjenjivanja jer nastavnik nije učitan.");
        return;
      }

      const name = newElementName.trim();
      const schoolIdToUse = classroom?.school_id || classroom?.schoolId || null;
      const { error } = await supabase
        .from('grading_elements')
        .insert([{
          class_id: classId,
          subject_id: subjectId,
          school_id: schoolIdToUse,
          teacher_id: targetTeacherId,
          name,
          display_order: gradingElements.length
        }]);
      if (error) throw error;
      setNewElementName('');
      setShowAddElementModal(false);
      loadAllData();
    } catch (err: any) {
      console.error('Error adding grading element:', err);
      toast.error('Dogodila se pogreška prilikom dodavanja elementa ocjenjivanja.');
    }
  };

  const handleEditElement = async (oldName: string, newName: string) => {
    if (!newName.trim() || !classId || !subjectId) return;
    try {
      const trimmedNewName = newName.trim();
      
      const { error: elError } = await supabase
        .from('grading_elements')
        .update({ name: trimmedNewName })
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('name', oldName);
        
      if (elError) throw elError;

      const { error: grError } = await supabase
        .from('grades')
        .update({ element: trimmedNewName })
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('element', oldName);
      
      if (grError) {
        console.warn('Non-blocking error updating grades:', grError);
      }

      setEditingElementOriginalName('');
      setEditingElementName('');
      loadAllData();
    } catch (err) {
      console.error('Error editing grading element Name:', err);
    }
  };

  const handleDeleteElement = async (nameToDelete: string) => {
    if (!window.confirm(`Jeste li sigurni da želite obrisati element vrednovanja "${nameToDelete.toUpperCase()}" i sve ocjene upisane pod njim?`)) {
      return;
    }
    
    try {
      const { error: grError } = await supabase
        .from('grades')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('element', nameToDelete);
        
      if (grError) {
        console.warn('Error deleting grades of deleted element:', grError);
      }

      const { error: elError } = await supabase
        .from('grading_elements')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('name', nameToDelete);

      if (elError) throw elError;

      loadAllData();
    } catch (err) {
      console.error('Error deleting grading element:', err);
    }
  };

  const getMonthDateString = (m: string): string => {
    let monthNum = 9;
    switch (m) {
      case 'IX': monthNum = 9; break;
      case 'X': monthNum = 10; break;
      case 'XI': monthNum = 11; break;
      case 'XII': monthNum = 12; break;
      case 'I': monthNum = 1; break;
      case 'II': monthNum = 2; break;
      case 'III': monthNum = 3; break;
      case 'IV': monthNum = 4; break;
      case 'V': monthNum = 5; break;
      case 'VI': monthNum = 6; break;
    }

    const today = new Date(getLocalDateISO());
    const currentMonth = today.getMonth() + 1;

    if (currentMonth === monthNum) {
      return getLocalDateISO();
    }

    const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    if (previousMonthDate.getMonth() + 1 === monthNum) {
      return getLocalDateISO(previousMonthDate);
    }

    return getLocalDateISO();
  };

  // Note actions
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !studentId || !subjectId || !classId) return;

    try {
      const headers = await getAuthHeaders();
      const payload = {
        student_id: studentId,
        subject_id: subjectId,
        class_id: classId,
        school_id: classroom?.school_id || classroom?.schoolId || null,
        text_content: newNoteContent,
        reference_date: newNoteDate
      };

      const res = await fetch('/api/student-notes', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Greška pri dodavanju bilješke.');

      setShowAddNoteModal(false);
      setNewNoteContent('');
      loadAllData();
    } catch (err) {
      console.error('Error adding note:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (note && !canDeleteNote(note)) {
      toast.error('Možete obrisati samo bilješke koje ste Vi unijeli.');
      return;
    }
    triggerDeleteNote(id);
  };

  const handleEditGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrade) return;

    const existingGrade = grades.find(g => g.id === editingGrade.id);
    const isGradeAdmin = isAdminForCurrentSchool();
    const isCreator = existingGrade?.teacher_id === user?.id || existingGrade?.teacherId === user?.id;
    const onlyNoteChanged = existingGrade &&
      Number(existingGrade.value) === Number(editingGrade.value) &&
      (existingGrade.element || '') === (editingGrade.element || '') &&
      (existingGrade.date || '') === (editingGrade.date || '');

    if (existingGrade && (existingGrade.date || '') !== (editingGrade.date || '') && !isGradeDateAllowed(editingGrade.date)) {
      toast.error('Datum ocjene može biti samo u prethodnom ili tekućem mjesecu.');
      return;
    }

    if (!canDeleteGrade(editingGrade) && !(isCreator && onlyNoteChanged)) {
      toast.error('Nakon 10 minuta možete mijenjati samo bilješku uz vlastitu ocjenu.');
      return;
    }

    try {
      const updatePayload = !canDeleteGrade(editingGrade) && !isGradeAdmin
        ? { note: editingGrade.note }
        : {
          value: Number(editingGrade.value),
          element: editingGrade.element,
          category: editingGrade.element,
          note: editingGrade.note,
          date: editingGrade.date
        };
      const { error } = await supabase
        .from('grades')
        .update(updatePayload)
        .eq('id', editingGrade.id);
      if (error) throw error;
      setEditingGrade(null);
      loadAllData();
      toast.success('Ocjena je uspješno izmijenjena.');
    } catch (err) {
      console.error('Error editing grade:', err);
      toast.error('Dogodila se pogreška prilikom izmjene ocjene.');
    }
  };

  const handleEditNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    const note = notes.find(n => n.id === editingNote.id);
    if (note && !canDeleteNote(note)) {
      toast.error('Možete uređivati samo bilješke koje ste Vi unijeli.');
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/student-notes/${editingNote.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          text_content: editingNote.content,
          reference_date: editingNote.date
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Greška pri izmjeni bilješke.');
      setEditingNote(null);
      loadAllData();
      toast.success('Bilješka je uspješno izmijenjena.');
    } catch (err) {
      console.error('Error editing note:', err);
      toast.error('Dogodila se pogreška prilikom izmjene bilješke.');
    }
  };

  const handleEditExamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;
    try {
      const { error } = await supabase
        .from('exams')
        .update({
          exam_type: editingExam.exam_type,
          description: editingExam.description,
          grade_value: editingExam.grade_value ? Number(editingExam.grade_value) : null,
          exam_date: editingExam.exam_date
        })
        .eq('id', editingExam.id);
      if (error) throw error;
      setEditingExam(null);
      loadAllData();
      toast.success('Ispit je uspješno izmijenjen.');
    } catch (err) {
      console.error('Error editing exam:', err);
      toast.error('Dogodila se pogreška prilikom izmjene ispita.');
    }
  };

  // Exam actions
  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !studentId || !subjectId || !classId) return;

    try {
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        student_id: studentId,
        teacher_id: user.id,
        school_year_id: classroom?.school_year_id || null,
        exam_date: newExamDate,
        exam_type: newExamType,
        grade_value: newExamGrade ? Number(newExamGrade) : null,
        description: newExamNote || ''
      };

      const { error } = await supabase.from('exams').insert([payload]);
      if (error) throw error;

      setShowAddExamModal(false);
      setNewExamNote('');
      setNewExamGrade('');
      loadAllData();
    } catch (err) {
      console.error('Error adding exam:', err);
    }
  };

  const handleDeleteExam = async (id: string) => {
    console.log("DELETE EXAM START", id);
    try {
      const { data, error } = await supabase.from('exams').delete().eq('id', id).select();
      console.log("DELETE EXAM RESULT", { data, error });
      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error("Ispit nije pronađen ili je već obrisan iz baze.");
      }

      loadAllData();
      toast.success('Ispit uspješno obrisan.');
    } catch (err: any) {
      console.error('Error deleting exam:', err);
      toast.error(err.message || 'Brisanje ispita nije uspjelo.');
    }
  };

  // Save term concluding grades
  const handleSaveFinalGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("FINAL GRADE SAVE CLICKED", { studentId, subjectId, classId, term: showFinalModal.term, finalGradeValue, finalGradeStatus });
    if (!user || !studentId || !subjectId || !classId) return;

    try {
      const { term } = showFinalModal;
      const period = term; 

      if (!finalGradeValue && !finalGradeStatus) {
        // Delete final grade
        const { error } = await supabase
          .from('final_grades')
          .delete()
          .eq('student_id', studentId)
          .eq('subject_id', subjectId)
          .eq('period', period)
          .eq('class_id', classId);
        if (error) throw error;
      } else {
        // Prepare row insertion/update
        const existingGrade = finalGrades.find(f => f.period === period);
        const payload: any = {
          student_id: studentId,
          subject_id: subjectId,
          class_id: classId,
          teacher_id: user.id,
          school_year_id: classroom?.school_year_id || null,
          period: period,
          term: period === 'FIRST_SEMESTER' ? 'FIRST_SEMESTER' : 'FINAL',
          value: finalGradeStatus || finalGradeValue || '',
          note: `Zaključena ocjena`
        };
        console.log("FINAL GRADE PAYLOAD", payload);

        if (existingGrade) {
          const { data, error } = await supabase
            .from('final_grades')
            .update(payload)
            .eq('id', existingGrade.id)
            .select();
          console.log("FINAL GRADE SAVE RESULT", { data, error });
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('final_grades')
            .insert([payload])
            .select();
          console.log("FINAL GRADE SAVE RESULT", { data, error });
          if (error) throw error;
        }
      }

      setShowFinalModal({ isOpen: false, term: 'FIRST_SEMESTER' });
      setFinalGradeValue('');
      setFinalGradeStatus(null);
      loadAllData();
      toast.success('Zaključna ocjena uspješno spremljena.');
    } catch (err: any) {
      console.error('Error saving final grade:', err);
      toast.error(err.message || 'Dogodila se pogreška prilikom spremanja zaključne ocjene.');
    }
  };

  const handleDeleteFinalGrade = async (finalGrade: any) => {
    console.log("DELETE FINAL GRADE START", finalGrade);

    if (!finalGrade?.id) {
      console.error("Missing final grade id", finalGrade);
      return;
    }

    try {
      console.log("BEFORE FINAL GRADE DELETE", finalGrade.id);

      const result = await supabase
        .from("final_grades")
        .delete()
        .eq("id", finalGrade.id)
        .select();

      console.log("DELETE FINAL GRADE RESULT", result);

      if (result.error) {
        console.error("DELETE FINAL GRADE ERROR", result.error);
        alert("Greška pri brisanju zaključne ocjene: " + result.error.message);
        return;
      }

      if (!result.data || result.data.length === 0) {
        console.error("DELETE FINAL GRADE DID NOT DELETE ROW", finalGrade.id);
        alert("Zaključna ocjena nije obrisana iz baze. Provjeri RLS policy ili ID.");
        return;
      }

      console.log("DELETE FINAL GRADE SUCCESS", result.data);

      await loadAllData();
    } catch (err) {
      console.error("DELETE FINAL GRADE CRASHED", err);
      alert("Greška pri brisanju zaključne ocjene.");
    }
  };

  // Helper mapping month indices (0-11) to column keys
  const getMonthColumnKey = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const m = d.getMonth();
    
    // Croatia school months schema: sep(8) -> IX, oct(9) -> X, nov(10) -> XI, dec(11) -> XII, jan(0) -> I, feb(1) -> II, mar(2) -> III, apr(3) -> IV, may(4) -> V, jun(5) -> VI
    switch (m) {
      case 8: return 'IX';
      case 9: return 'X';
      case 10: return 'XI';
      case 11: return 'XII';
      case 0: return 'I';
      case 1: return 'II';
      case 2: return 'III';
      case 3: return 'IV';
      case 4: return 'V';
      case 5: return 'VI';
      default: return 'IX'; // default fallback logic
    }
  };

  // Calculate averages
  const nonFinalGrades = grades.filter(g => !g.is_final);
  const mathSum = nonFinalGrades.reduce((acc, curr) => acc + (curr.value || 0), 0);
  const mathAverageNum = nonFinalGrades.length > 0 ? mathSum / nonFinalGrades.length : 0;
  const mathAverageString = mathAverageNum.toFixed(2);

  const formattedName = student 
    ? `${student.surname || ''} ${student.name || ''}`.toUpperCase().trim() 
    : 'UČENIK';

  const croSubjectName = formatSubjectName(subject || { name: (subjectId || 'PREDMET') }).toUpperCase();

  // Unified Chronological log
  const combinedLog: any[] = [];
  grades.forEach(g => {
    combinedLog.push({
      id: g.id,
      date: g.date,
      displayDate: formatCroatianDate(g.date),
      type: 'GRADE',
      value: g.value,
      element: g.element || 'Uobičajeno',
      note: g.note || '',
      authorName: g.teacher_name || g.author_name || 'Nepoznato',
      createdAt: formatCroatianDateTime(g.created_at || g.createdAt),
      raw: g
    });
  });
  notes.forEach(n => {
    combinedLog.push({
      id: n.id,
      date: n.date,
      displayDate: formatCroatianDate(n.date),
      type: 'NOTE',
      value: '-',
      element: 'BILJEŠKA NASTAVNIKA',
      note: n.content,
      authorName: n.author_name || 'Nepoznato',
      createdAt: n.created_at,
      raw: n
    });
  });
  // Sort descending by date
  combinedLog.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return null;
  }

  if (!isEnrolled) {
    return (
      <div className="p-16 flex flex-col items-center justify-center bg-white h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <span className="text-4xl text-gray-400">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900">Učenik nije upisan u ovaj predmet</h2>
          <p className="text-xs text-gray-500">Ovaj učenik nema aktivan upis u odabrani izborni ili fakultativni predmet.</p>
          <button
            onClick={() => window.history.back()}
            className="mt-2 px-4 py-2 bg-[#005c8d] text-white text-xs font-bold uppercase hover:bg-opacity-90 rounded transition-colors"
          >
            Natrag
          </button>
        </div>
      </div>
    );
  }

  // Month labels we represent
  const monthLabels = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];

  return (
    <div className="p-6 bg-white min-h-full">
      {/* Upper Navigation Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#005c8d] tracking-tight">
            {studentIndex ? `${studentIndex}. ` : ''}{formattedName}
          </h1>
          <p className="text-xs text-gray-500 font-extrabold uppercase mt-1 tracking-wider">
            UČENIČKA KARTICA - {croSubjectName}
          </p>
        </div>
        
        {/* Navigation helpers */}
        <div className="flex items-center gap-1 select-none">
          <button 
            onClick={handlePrevStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-xs transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            PRETHODNI
          </button>
          <button 
            onClick={handleRandomStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-xs transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" />
            SLUČAJNI ODABIR
          </button>
          <button 
            onClick={handleNextStudent}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-[11px] font-bold text-gray-700 rounded shadow-xs transition-colors"
          >
            SLJEDEĆI
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded flex items-center gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold uppercase tracking-wider block mb-0.5">PREGLED PODATAKA (Samo za čitanje)</span>
            Niste zaduženi za ovaj predmet u ovom razredu. Podatke možete pregledavati, ali nemate pravo unosa, izmjene ili brisanja ocjena i bilješki.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 mt-4">
        {/* Full-width interactive action bar instead of left menu */}
        <div className="bg-slate-50 border border-gray-200 rounded p-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-gray-200 pb-3">
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => navigate(`/class/${classId}/imenik`)} 
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase text-gray-600 bg-white hover:bg-gray-100 hover:text-gray-900 border border-gray-300 rounded transition-all duration-150 shadow-xs"
              >
                <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                Imenik učenika
              </button>
              <button 
                onClick={() => navigate(`/class/${classId}/student/${studentId}`)} 
                className="flex items-center gap-2 px-4 py-2 text-xs font-extrabold uppercase text-[#005c8d] bg-sky-50 border border-sky-300 rounded shadow-xs"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#005c8d] shrink-0" />
                Pregled predmeta
              </button>
              <button 
                onClick={() => navigate(`/class/${classId}/biljeske`)} 
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase text-gray-600 bg-white hover:bg-gray-100 hover:text-gray-900 border border-gray-300 rounded transition-all duration-150 shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                Bilješke
              </button>
            </div>

            <button 
              onClick={() => navigate(`/class/${classId}/imenik`)} 
              className="flex items-center gap-2 px-4 py-2 text-xs font-extrabold uppercase text-gray-500 hover:text-red-700 bg-white hover:bg-red-50 border border-gray-300 hover:border-red-200 rounded transition-all shadow-xs"
            >
              <XCircle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
              ZATVORI KARTICU
            </button>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider mr-1">Grupne Radnje:</span>
              <button 
                onClick={() => setShowGroupGradesModal(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[#005c8d] bg-white hover:bg-sky-50 text-[#005c8d] font-extrabold text-[10px] uppercase rounded shadow-xs transition-all"
              >
                Grupni unos ocjena
              </button>
              <button 
                onClick={() => setShowGroupNotesModal(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[#005c8d] bg-white hover:bg-sky-50 text-[#005c8d] font-extrabold text-[10px] uppercase rounded shadow-xs transition-all"
              >
                Grupni unos bilješki
              </button>
              <button 
                onClick={() => setShowGroupFinalGradesModal(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-[10px] uppercase rounded shadow-xs transition-all"
              >
                Grupno zaključivanje ocjena
              </button>
            </div>
          )}
        </div>

        {/* COMPACT GRADES ELEMENTS GRID & LOG CONTROLS */}
        <div className="w-full space-y-6">
          
          {/* Main Grades Table */}
          <div className="bg-white border border-gray-300 rounded-sm shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black border-b border-gray-300">
                    <th className="p-3 font-extrabold text-left border-r border-gray-300 w-1/4 uppercase tracking-wider text-[10px]">
                      <div className="flex items-center justify-between">
                        <span>ELEMENTI VREDNOVANJA</span>
                        {canEdit && (
                          <button 
                            onClick={() => setShowAddElementModal(true)}
                            className="px-2 py-1 bg-[#005c8d]/90 hover:bg-[#005c8d] text-white rounded text-[9px] uppercase font-bold tracking-wider flex items-center gap-1 select-none transition-all"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            DODAJ ELEMENT
                          </button>
                        )}
                      </div>
                    </th>
                    <th className="p-2 font-black border-r border-gray-200 w-16 text-[10px] bg-slate-50 uppercase tracking-wider">UREDI</th>
                    {monthLabels.map(m => (
                      <th key={m} className="p-2 font-black border-r border-gray-200 w-10 text-[10px] bg-slate-50">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {gradingElements.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-gray-500 font-semibold italic">
                        Nema unesenih elemenata vrednovanja za ovaj predmet u ovom razredu.
                        {canEdit && (
                          <button
                            onClick={() => setShowAddElementModal(true)}
                            className="block mx-auto mt-2 px-3 py-1.5 bg-[#005c8d] text-white text-xs font-extrabold uppercase rounded shadow-sm hover:brightness-105 transition-all"
                          >
                            DODAJ PRVI ELEMENT VREDNOVANJA
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    gradingElements.map((el) => {
                      const isEditingThis = editingElementOriginalName === el;

                      return (
                        <tr key={el} className="hover:bg-slate-50/50 group">
                          {/* ELEMENT NAME CELL */}
                          <td className="p-2.5 border-r border-gray-300 text-left font-black text-slate-800 uppercase text-[10px] tracking-wide align-middle min-w-[150px]">
                            {isEditingThis ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editingElementName}
                                  onChange={(e) => setEditingElementName(e.target.value)}
                                  className="border border-gray-300 rounded px-1.5 py-1 text-[10px] font-bold text-slate-900 bg-white focus:outline-none focus:border-[#005c8d] uppercase w-full"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleEditElement(el, editingElementName);
                                    if (e.key === 'Escape') setEditingElementOriginalName('');
                                  }}
                                />
                                <button
                                  onClick={() => handleEditElement(el, editingElementName)}
                                  className="p-1 bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                                  title="Spremi"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setEditingElementOriginalName('')}
                                  className="p-1 bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                                  title="Odustani"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span>{el}</span>
                            )}
                          </td>

                          {/* UREDI CELL */}
                          <td className="p-1 border-r border-gray-300 text-center align-middle whitespace-nowrap bg-slate-50/20">
                            {canEdit && (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingElementOriginalName(el);
                                    setEditingElementName(el);
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Uredi naziv elementa"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteElement(el)}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Obriši element vrednovanja"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          {monthLabels.map(m => {
                            // Find grades fitting in this element & this month
                            const matchingGrades = grades.filter(g => {
                              if (g.is_final) return false;
                              const elLower = (g.element || '').toLowerCase().trim();
                              const targetLower = el.toLowerCase().trim();
                              const matchesEl = elLower === targetLower || targetLower.includes(elLower) || elLower.includes(targetLower);
                              return matchesEl && getMonthColumnKey(g.date) === m;
                            });

                            return (
                              <td 
                                key={m} 
                                onClick={() => {
                                  if (!canEdit) return;
                                  setNewGradeElement(el);
                                  setNewGradeDate(getMonthDateString(m));
                                  setShowAddGradeModal(true);
                                }}
                                className={`p-1.5 border-r border-gray-200 align-middle transition-colors ${canEdit ? 'cursor-pointer hover:bg-sky-50/60' : ''}`}
                                title={canEdit ? "Kliknite za unos ocjene u ovaj mjesec" : undefined}
                              >
                                <div className="flex flex-wrap items-center justify-center gap-1 min-h-[22px]">
                                  {matchingGrades.map((gObj) => {
                                    const isNegative = gObj.value === 1;
                                    const isDeletable = canDeleteGrade(gObj);
                                    return (
                                      <div 
                                        key={gObj.id} 
                                        className={`
                                          inline-flex items-center justify-center font-black w-5 h-5 rounded-sm border cursor-pointer select-none relative group transition-all text-[11px]
                                          ${isNegative 
                                            ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100' 
                                            : 'bg-white text-slate-800 border-gray-300 hover:bg-slate-100 hover:border-gray-400'
                                          }
                                        `}
                                        onClick={(e) => {
                                          e.stopPropagation(); // Stop clicking cell
                                          if (!canEdit) return;
                                          handleDeleteGrade(gObj.id);
                                        }}
                                        title={canEdit ? `${gObj.date}: ${gObj.note || 'Nema opisa'}. ${isDeletable ? 'Kliknite za brisanje.' : 'Brisanje onemogućeno (rok od 45 min je istekao).'}` : `${gObj.date}: ${gObj.note || 'Nema opisa'}`}
                                      >
                                        {gObj.value}
                                        
                                        {/* Micro tooltip on hover */}
                                        <span className="invisible group-hover:visible absolute bottom-7 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded whitespace-nowrap z-30 shadow font-normal normal-case">
                                          {gObj.date} - {gObj.note || 'Nema opisa'} {isDeletable ? '' : '(Rok istekao)'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}

                  {/* Concluded Grades Row */}
                  <tr className="bg-sky-50/50 font-black">
                    <td colSpan={2} className="p-3 border-r border-gray-300 text-left text-[#005c8d] uppercase text-[10px] tracking-wider">
                      ZAKLJUČENA OCJENA
                    </td>
                    
                    {/* 1. POLUGODIŠTE (IX-XII) */}
                    <td colSpan={4} className="p-2 border-r border-gray-200 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-[9px] text-[#005c8d] uppercase tracking-wider font-bold">1. POLUGODIŠTE</span>
                        {finalGrades.find(fg => fg.period === 'FIRST_SEMESTER') ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => { setShowFinalModal({ isOpen: true, term: 'FIRST_SEMESTER' }); setFinalGradeValue(finalGrades.find(fg => fg.period === 'FIRST_SEMESTER')?.value || ''); setFinalGradeStatus(finalGrades.find(fg => fg.period === 'FIRST_SEMESTER')?.status || null); }}
                              className="inline-flex items-center justify-center px-2 py-1 rounded bg-[#005c8d] text-white font-extrabold text-[10px] shadow-sm hover:scale-105 transition-transform"
                            >
                              {(() => {
                                  const fg = finalGrades.find(fg => fg.period === 'FIRST_SEMESTER');
                                  if (fg?.status) return fg.status === 'NEOCIJENJEN' ? 'Neocijenjen' : fg.status === 'OSLOBODEN' ? 'Oslobođen' : fg.status === 'ODRADENO' ? 'Odrađeno' : 'Neodrađeno';
                                  const val = fg?.value;
                                  const labels: Record<string, string> = {'1': 'Nedovoljan (1)', '2': 'Dovoljan (2)', '3': 'Dobar (3)', '4': 'Vrlo dobar (4)', '5': 'Odličan (5)'};
                                  return labels[val || ''] || val;
                              })()}
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("DELETE FINAL GRADE BUTTON CLICKED", finalGrades.find(fg => fg.period === 'FIRST_SEMESTER'));
                                handleDeleteFinalGrade(finalGrades.find(fg => fg.period === 'FIRST_SEMESTER'));
                              }}
                              className="p-1 text-red-400 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Obriši zaključnu ocjenu"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setShowFinalModal({ isOpen: true, term: 'FIRST_SEMESTER' }); setFinalGradeValue(''); setFinalGradeStatus(null); }}
                            className="text-[9px] text-gray-400 border border-dashed border-gray-300 px-2 py-0.5 rounded hover:border-[#005c8d] hover:text-[#005c8d]"
                          >
                            UNESI
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 2. POLUGODIŠTE (I-VI) */}
                    <td colSpan={6} className="p-2 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-[9px] text-[#005c8d] uppercase tracking-wider font-bold">2. POLUGODIŠTE</span>
                        {finalGrades.find(fg => fg.period === 'SECOND_SEMESTER') ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => { setShowFinalModal({ isOpen: true, term: 'SECOND_SEMESTER' }); setFinalGradeValue(finalGrades.find(fg => fg.period === 'SECOND_SEMESTER')?.value || ''); setFinalGradeStatus(finalGrades.find(fg => fg.period === 'SECOND_SEMESTER')?.status || null); }}
                              className="inline-flex items-center justify-center px-2 py-1 rounded bg-[#005c8d] text-white font-extrabold text-[10px] shadow-sm hover:scale-105 transition-transform"
                            >
                              {(() => {
                                  const fg = finalGrades.find(fg => fg.period === 'SECOND_SEMESTER');
                                  if (fg?.status) return fg.status === 'NEOCIJENJEN' ? 'Neocijenjen' : fg.status === 'OSLOBODEN' ? 'Oslobođen' : fg.status === 'ODRADENO' ? 'Odrađeno' : 'Neodrađeno';
                                  const val = fg?.value;
                                  const labels: Record<string, string> = {'1': 'Nedovoljan (1)', '2': 'Dovoljan (2)', '3': 'Dobar (3)', '4': 'Vrlo dobar (4)', '5': 'Odličan (5)'};
                                  return labels[val || ''] || val;
                              })()}
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("DELETE FINAL GRADE BUTTON CLICKED", finalGrades.find(fg => fg.period === 'SECOND_SEMESTER'));
                                handleDeleteFinalGrade(finalGrades.find(fg => fg.period === 'SECOND_SEMESTER'));
                              }}
                              className="p-1 text-red-400 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Obriši zaključnu ocjenu"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setShowFinalModal({ isOpen: true, term: 'SECOND_SEMESTER' }); setFinalGradeValue(''); setFinalGradeStatus(null); }}
                            className="text-[9px] text-gray-400 border border-dashed border-gray-300 px-2 py-0.5 rounded hover:border-[#005c8d] hover:text-[#005c8d]"
                          >
                            UNESI
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* Sub banner with Arithmetic averages right-aligned */}
          <div className="bg-slate-50 border border-t-0 border-gray-300 p-3 rounded-b flex items-center justify-end font-bold text-xs text-slate-700 shadow-xs">
            <div className="flex items-center gap-1.5 pr-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>ARITMETIČKA SREDINA: <span className="font-black text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded shadow-xs">{mathAverageString}</span></span>
            </div>
          </div>

          {/* TWO DIVISION COLUMNS AT BOTTOM OF CARD */}
          <div className="flex flex-col gap-6">
            
            {/* COLUMN LEFT: SPECIAL EXAMS */}
            <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
              <div className="bg-slate-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  DOPUNSKI / RAZLIKOVNI / POPRAVNI ISPITI
                </h2>
                {canEdit && (
                  <button 
                    onClick={() => setShowAddExamModal(true)}
                    className="px-2 py-1 bg-[#005c8d] hover:brightness-115 text-white text-[10px] font-extrabold uppercase rounded shadow-xs select-none transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    DODAJ ISPIT
                  </button>
                )}
              </div>
              <div className="p-3">
                {exams.length === 0 ? (
                  <div className="text-center p-8 text-gray-400 text-xs italic">Nema unesenih podataka o ispitima</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-slate-50 text-[10px] font-extrabold text-gray-500 uppercase">
                          <th className="pb-2 pt-1 font-bold">VRSTA</th>
                          <th className="pb-2 pt-1 font-bold">ZABILJEŠKA</th>
                          <th className="pb-2 pt-1 font-bold text-center">OCJENA</th>
                          <th className="pb-2 pt-1 font-bold">DATUM</th>
                          {canEdit && <th className="pb-2 pt-1 font-bold text-right">AKCIJE</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {exams.map(ex => (
                          <tr key={ex.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 font-bold text-[#005c8d]">{ex.exam_type || ex.type || 'Ispit'}</td>
                            <td className="py-2.5 text-gray-600 whitespace-normal break-words">{ex.description || ex.note || '-'}</td>
                            <td className="py-2.5 text-center font-extrabold">{ex.grade_value || ex.value || '-'}</td>
                            <td className="py-2.5 text-gray-500 text-[11px]">{ex.exam_date || ex.date}</td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              {canEdit && (
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => setEditingExam(ex)}
                                    className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                    title="Uredi"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log("DELETE MAKEUP EXAM BUTTON CLICKED", ex);
                                      handleDeleteExam(ex.id);
                                    }}
                                    className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2 py-1 rounded-sm text-[10px] tracking-wide uppercase transition-all flex items-center gap-1 cursor-pointer border border-red-200"
                                    title="Obriši"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                                    <span>Obriši</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN RIGHT: CHRONOLOGY OF ENTRIES & NOTES */}
            <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
              <div className="bg-slate-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  BILJEŠKE I POJEDINAČNE OCJENE
                </h2>
                {canEdit && (
                  <button 
                    onClick={() => setShowAddNoteModal(true)}
                    className="px-2 py-1 bg-[#005c8d] hover:brightness-115 text-white text-[10px] font-extrabold uppercase rounded shadow-xs select-none transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    BILJEŠKA
                  </button>
                )}
              </div>
              <div className="p-3">
                {combinedLog.length === 0 ? (
                  <div className="text-center p-8 text-gray-400 text-xs italic">Nema unesenih podataka</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-slate-50 text-[10px] font-extrabold text-gray-500 uppercase sticky top-0 bg-white">
                          <th className="pb-2 pt-1 font-bold w-[12%]">DATUM</th>
                          <th className="pb-2 pt-1 font-bold text-center w-[7%]">OCJENA</th>
                          <th className="pb-2 pt-1 font-bold w-[51%]">BILJEŠKA</th>
                          <th className="pb-2 pt-1 font-bold text-right w-[30%]">UNOS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {combinedLog.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 text-gray-500 text-[11px] whitespace-nowrap w-[12%]">{item.displayDate}</td>
                            <td className="py-2.5 text-center font-extrabold text-slate-900 w-[7%]">{item.value}</td>
                            <td className="py-2.5 text-slate-700 italic w-[51%] whitespace-normal break-words">
                              <div>{item.note || '-'}</div>
                            </td>
                             <td className="py-2.5 text-right w-[30%]">
                               <div className="flex items-center justify-end gap-3">
                                 <div className="min-w-0 text-right">
                                   <div className="text-[10px] font-black uppercase text-slate-700 truncate">{item.authorName || 'Nepoznato'}</div>
                                   <div className="mt-0.5 text-[10px] font-semibold text-slate-400 whitespace-nowrap">{item.createdAt || '-'}</div>
                                 </div>
                                 {canEdit && (
                                   <div className="flex items-center justify-end gap-1.5 shrink-0">
                                   <button 
                                     onClick={() => {
                                       if (item.type === 'GRADE') {
                                         setEditingGrade({
                                           id: item.raw.id,
                                           value: item.raw.value,
                                           element: item.raw.element || 'Usmeni',
                                           note: item.raw.note || '',
                                           date: item.raw.date,
                                           created_at: item.raw.created_at
                                         });
                                       } else {
                                         setEditingNote({
                                           id: item.raw.id,
                                           content: item.raw.content,
                                           date: item.raw.date,
                                           created_at: item.raw.created_at
                                         });
                                       }
                                     }}
                                     className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
                                     title="Uredi"
                                   >
                                     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                     </svg>
                                   </button>
                                   {((item.type === 'GRADE' && canDeleteGrade(item.raw)) || (item.type === 'NOTE' && canDeleteNote(item.raw))) && (
                                     <button 
                                       onClick={() => {
                                         if (item.type === 'GRADE') {
                                           handleDeleteGrade(item.id);
                                         } else {
                                           handleDeleteNote(item.id);
                                         }
                                       }}
                                       className="p-1 text-gray-400 hover:text-red-700 rounded transition"
                                       title="Obriši"
                                     >
                                       <Trash2 className="w-3.5 h-3.5" />
                                     </button>
                                   )}
                                   </div>
                                 )}
                               </div>
                             </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ----------------- MODALS ----------------- */}

      {/* MODAL 1: ADD GRADE */}
      {showAddGradeModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UNOS NOVE OCJENE</span>
              <button onClick={() => setShowAddGradeModal(false)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddNewGrade} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">OCJENA (VRIJEDNOST)</label>
                <GradeSelector 
                  value={newGradeVal}
                  onChange={(val) => setNewGradeVal(val)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">ELEMENT OCJENJIVANJA</label>
                <select
                  value={newGradeElement}
                  onChange={(e) => setNewGradeElement(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d] font-black uppercase text-[11px]"
                >
                  {gradingElements.map(el => (
                    <option key={el} value={el}>{el.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">KRATKA BILJEŠKA / OPIS</label>
                <input 
                  type="text"
                  required
                  placeholder="npr. aktivnost na satu, pismeni..."
                  value={newGradeNote}
                  onChange={(e) => setNewGradeNote(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM</label>
                <input 
                  type="date"
                  required
                  value={newGradeDate}
                  min={gradeDateBounds.min}
                  max={gradeDateBounds.max}
                  onChange={(e) => setNewGradeDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowAddGradeModal(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  SPREMI OCJENU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NOTE */}
      {showAddNoteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UNOS NOVE BILJEŠKE PREMETA</span>
              <button onClick={() => setShowAddNoteModal(false)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddNote} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">SADRŽAJ BILJEŠKE</label>
                <textarea 
                  required
                  placeholder="Unesite opširnu bilješku o napretku..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={4}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d] resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM</label>
                <input 
                  type="date"
                  required
                  value={newNoteDate}
                  onChange={(e) => setNewNoteDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  SPREMI BILJEŠKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD SPECIAL EXAM */}
      {showAddExamModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UNOS DRŽAVNIH/RAZLIKOVNIH/DOPUNSKIH ISPITA</span>
              <button onClick={() => setShowAddExamModal(false)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddExam} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">VRSTA ISPITA</label>
                <select 
                  value={newExamType}
                  onChange={(e) => setNewExamType(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-slate-500 font-bold"
                >
                  <option value="Dopunski ispit">Dopunski ispit</option>
                  <option value="Razlikovni ispit">Razlikovni ispit</option>
                  <option value="Popravni ispit">Popravni ispit</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">KANDIDATNA BILJEŠKA / OPIS</label>
                <input 
                  type="text"
                  required
                  placeholder="npr. Razredni ili raznovrsni dio gradiva..."
                  value={newExamNote}
                  onChange={(e) => setNewExamNote(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">OCJENA (NEOBVEZNO)</label>
                <GradeSelector 
                  value={newExamGrade}
                  onChange={(val) => setNewExamGrade(val === null ? '' : val)}
                  allowClear={true}
                  clearLabel="BEZ OCJENE"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM POLAGANJA</label>
                <input 
                  type="date"
                  required
                  value={newExamDate}
                  onChange={(e) => setNewExamDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowAddExamModal(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded shadow-sm"
                >
                  DODAJ ISPIT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CONCLUDE GRADE */}
      {showFinalModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>
                ZAKLJUČIVANJE OCJENE: {showFinalModal.term === 'FIRST_SEMESTER' ? '1. POLUGODIŠTE' : 'KRAJ ŠKOLSKE GODINE'}
              </span>
              <button onClick={() => setShowFinalModal({ isOpen: false, term: 'FIRST_SEMESTER' })} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveFinalGrade} className="p-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs text-[#005c8d] flex items-start gap-2 file:">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Informativna aritmetička sredina: </span>
                  <span className="font-extrabold text-sm text-blue-900">{mathAverageString}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">ZAKLJUČENA OCJENA (VRIJEDNOST)</label>
                <FinalGradeSelector 
                  value={finalGradeValue}
                  status={finalGradeStatus}
                  onChange={(val, status) => {
                      setFinalGradeValue(val);
                      setFinalGradeStatus(status);
                  }}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowFinalModal({ isOpen: false, term: 'FIRST_SEMESTER' })}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  ZAKLJUČI OCJENU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD GRADING ELEMENT */}
      {showAddElementModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>Novi element vrednovanja</span>
              <button onClick={() => setShowAddElementModal(false)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">NAZIV ELEMENATA VREDNOVANJA</label>
                <input 
                  type="text"
                  required
                  placeholder="npr. jezično izražavanje, aktivnost..."
                  value={newElementName}
                  onChange={(e) => setNewElementName(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowAddElementModal(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  onClick={handleAddElement}
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  DODAJ ELEMENT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL 1: EDIT GRADE */}
      {editingGrade && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UREDI OCJENU</span>
              <button onClick={() => setEditingGrade(null)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditGradeSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">OCJENA (VRIJEDNOST)</label>
                <GradeSelector 
                  value={editingGrade.value}
                  onChange={(val) => setEditingGrade({ ...editingGrade, value: val || 5 })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">ELEMENT VREDNOVANJA</label>
                <select 
                  value={editingGrade.element}
                  onChange={(e) => setEditingGrade({ ...editingGrade, element: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                >
                  {gradingElements.map(el => (
                    <option key={el} value={el}>{el}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">NAPOMENA / OBRAZLOŽENJE</label>
                <textarea 
                  rows={3}
                  value={editingGrade.note}
                  onChange={(e) => setEditingGrade({ ...editingGrade, note: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                  placeholder="Unesite zabilješku uz ocjenu (npr. usmeni odgovor, diktat...)"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM</label>
                <input 
                  type="date"
                  value={editingGrade.date}
                  min={gradeDateBounds.min}
                  max={gradeDateBounds.max}
                  onChange={(e) => setEditingGrade({ ...editingGrade, date: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setEditingGrade(null)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  SPREMI PROMJENE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL 2: EDIT NOTE */}
      {editingNote && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UREDI BILJEŠKU</span>
              <button onClick={() => setEditingNote(null)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditNoteSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">SADRŽAJ BILJEŠKE</label>
                <textarea 
                  rows={4}
                  required
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                  placeholder="Sadržaj bilješke..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM</label>
                <input 
                  type="date"
                  value={editingNote.date || ''}
                  onChange={(e) => setEditingNote({ ...editingNote, date: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  SPREMI PROMJENE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL 3: EDIT EXAM */}
      {editingExam && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#005c8d] text-white px-4 py-3 flex items-center justify-between font-black text-xs uppercase tracking-wider">
              <span>UREDI ISPIT</span>
              <button onClick={() => setEditingExam(null)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditExamSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">VRSTA ISPITA</label>
                <select 
                  value={editingExam.exam_type}
                  onChange={(e) => setEditingExam({ ...editingExam, exam_type: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                >
                  <option value="Dopunski ispit">Dopunski ispit</option>
                  <option value="Razlikovni ispit">Razlikovni ispit</option>
                  <option value="Popravni ispit">Popravni ispit</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-2">OCJENA (OPCIONALNO)</label>
                <GradeSelector 
                  value={editingExam.grade_value}
                  onChange={(val) => setEditingExam({ ...editingExam, grade_value: val })}
                  allowClear={true}
                  clearLabel="BEZ OCJENE"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">ZABILJEŠKA / OPIS</label>
                <textarea 
                  rows={3}
                  value={editingExam.description || ''}
                  onChange={(e) => setEditingExam({ ...editingExam, description: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                  placeholder="Dodatni detalji..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">DATUM ISPITA</label>
                <input 
                  type="date"
                  value={editingExam.exam_date}
                  onChange={(e) => setEditingExam({ ...editingExam, exam_date: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2 border border-gray-300 hover:bg-slate-50 text-xs font-bold rounded"
                >
                  ODUSTANI
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#005c8d] hover:brightness-105 text-white text-xs font-bold rounded shadow-sm"
                >
                  SPREMI PROMJENE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM DIALOG */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, id: '', type: null, loading: false, message: '', showTotp: false, showReason: false })}
        onConfirm={confirmDelete}
        title="POTVRDA BRISANJA"
        message={deleteDialog.message || ''}
        showTotp={deleteDialog.showTotp}
        showReason={deleteDialog.showReason}
        reasonLabel="Razlog brisanja ocjene"
        reasonOptions={deletionReasonOptions}
        showDetailedNote={deleteDialog.showReason}
        detailedNoteLabel="Detaljna napomena"
        loading={deleteDialog.loading}
      />
      
      <GroupGradesModal 
        isOpen={showGroupGradesModal} 
        onClose={() => setShowGroupGradesModal(false)} 
        classId={classId} 
        subjectId={subjectId} 
        students={allClassStudents} 
        gradingElements={gradingElements} 
        onSuccess={loadAllData} 
      />
      <GroupNotesModal 
        isOpen={showGroupNotesModal} 
        onClose={() => setShowGroupNotesModal(false)} 
        classId={classId} 
        subjectId={subjectId} 
        students={allClassStudents} 
        onSuccess={loadAllData} 
      />
      <GroupFinalGradesModal 
        isOpen={showGroupFinalGradesModal} 
        onClose={() => setShowGroupFinalGradesModal(false)} 
        classId={classId} 
        subjectId={subjectId} 
        term={showFinalModal.term === 'FIRST_SEMESTER' ? 'FIRST_SEMESTER' : 'SECOND_SEMESTER'} // Placeholder for now, check how GroupFinalGradesModal expects props
        students={allClassStudents} 
        onSuccess={loadAllData} 
      />

    </div>
  );
}
