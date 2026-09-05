import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Lesson, Class, WorkWeek, User, Role, Exam, ClassSubjectTeacher as SubjectTeachingAssignment, CurriculumPlan, AbsenceStatus } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { cn, getSurname, formatPersonName, sortStudentsBySurname, formatSubjectDisplayName, formatSubjectName, getLocalDateISO } from '../../lib/utils';
import { Calendar, Clock, Book, Plus, ArrowLeft, ArrowRight, X, ChevronRight, List, Trash2, LayoutGrid, Monitor, MapPin, CheckCircle, XCircle, Edit2, UserX, AlertTriangle } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { ScheduleGrid as SharedScheduleGrid } from '../../components/ScheduleGrid';
import { toast } from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

const absenceTypeOptions = [
  'Bolest - roditelj',
  'Bolest - liječnik',
  'Smrtni slučaj',
  'Natjecanje',
  'Promet',
  'Obiteljski razlog',
  'Ostalo'
];

const getAbsenceStatusShortLabel = (status?: string) => {
  if (status === AbsenceStatus.JUSTIFIED) return 'opra.';
  if (status === AbsenceStatus.UNJUSTIFIED) return 'neopra.';
  if (status === AbsenceStatus.OTHER) return 'ostalo';
  return 'čeka';
};

const getAbsenceStatusCellClass = (status?: string) => {
  if (status === AbsenceStatus.JUSTIFIED) return 'bg-green-100 text-green-800 border-green-300';
  if (status === AbsenceStatus.UNJUSTIFIED) return 'bg-red-100 text-red-800 border-red-300';
  if (status === AbsenceStatus.OTHER) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-red-100 text-red-700 border-red-300';
};

export default function DnevnikRadaPage({ initialView }: { initialView?: 'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE' | 'LEKTIRA' }) {
  usePageTitle("Dnevnik rada");
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, highestRole, userSchoolRoles } = useAuth();
  const { selectedSchoolId: contextSchoolId, selectedClassId: contextClassId, selectedYearId } = useSelection();
  
  const selectedSchoolId = contextSchoolId || sessionStorage.getItem('selectedSchoolId') || localStorage.getItem('selectedSchoolId');
  const effectiveClassId = contextClassId || routeClassId;
  
  const [classes, setClasses] = useState<Class[]>([]);
  const selectedClass = classes.find(c => c.id === effectiveClassId);

  const isSchoolAdmin = userSchoolRoles.some(r => r.role === Role.SCHOOL_ADMIN && r.schoolId === selectedSchoolId);
  const isAdminUser = isMainAdmin || isSchoolAdmin || highestRole === Role.ADMIN || highestRole === Role.MAIN_ADMIN;

  const canManageClass = React.useMemo(() => {
    return isAdminUser || 
           user?.id === (selectedClass as any)?.homeroom_teacher_id || 
           user?.id === selectedClass?.homeroomTeacherId || 
           user?.id === (selectedClass as any)?.deputy_teacher_id ||
           user?.id === selectedClass?.deputyTeacherId;
  }, [isAdminUser, user?.id, selectedClass]);

  const canManageAbsencesForClass = React.useMemo(() => {
    return isAdminUser ||
           user?.id === (selectedClass as any)?.homeroom_teacher_id ||
           user?.id === selectedClass?.homeroomTeacherId;
  }, [isAdminUser, user?.id, selectedClass]);

  const [students, setStudents] = useState<User[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [rawSubjects, setRawSubjects] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  
  const [weeks, setWeeks] = useState<WorkWeek[]>([]);
  const [view, setView] = useState<'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE' | 'LEKTIRA'>(() => {
    if (initialView) return initialView;
    const saved = sessionStorage.getItem(`dnevnik_view_${effectiveClassId || 'default'}`);
    return (saved as any) || 'WEEKS';
  });
  const [selectedWeek, setSelectedWeek] = useState<WorkWeek | null>(null);
  
  useEffect(() => {
    if (rawSubjects.length > 0) {
      const mapped = rawSubjects.map(sub => {
        const cs = classSubjects.find(c => c.subject_id === sub.id || c.subject_id === sub.subject_id);
        return {
          ...sub,
          name: formatSubjectDisplayName(sub.name, cs?.subject_type || 'redovni')
        };
      });
      setAllSubjects(mapped);
    } else {
      setAllSubjects([]);
    }
  }, [rawSubjects, classSubjects]);

  // Restore state from sessionStorage on class or weeks change
  useEffect(() => {
    if (effectiveClassId) {
      const savedView = sessionStorage.getItem(`dnevnik_view_${effectiveClassId}`) as any;
      if (savedView) {
        setView(savedView);
      } else if (!initialView) {
        setView('WEEKS');
      }

      const savedDate = sessionStorage.getItem(`dnevnik_selectedDate_${effectiveClassId}`);
      setSelectedDate(savedDate || null);

      if (weeks.length > 0) {
        const savedWeekId = sessionStorage.getItem(`dnevnik_selectedWeekId_${effectiveClassId}`);
        if (savedWeekId) {
          const found = weeks.find(w => w.id === savedWeekId);
          setSelectedWeek(found || null);
        } else {
          setSelectedWeek(null);
        }
      }
    }
  }, [effectiveClassId, weeks, initialView]);

  // Persist view changes to sessionStorage
  useEffect(() => {
    if (effectiveClassId) {
      sessionStorage.setItem(`dnevnik_view_${effectiveClassId}`, view);
    }
  }, [view, effectiveClassId]);

  // Persist selectedWeek changes to sessionStorage
  useEffect(() => {
    if (effectiveClassId) {
      if (selectedWeek) {
        sessionStorage.setItem(`dnevnik_selectedWeekId_${effectiveClassId}`, selectedWeek.id);
      } else {
        sessionStorage.removeItem(`dnevnik_selectedWeekId_${effectiveClassId}`);
      }
    }
  }, [selectedWeek, effectiveClassId]);

  useEffect(() => {
    if (initialView) {
      setView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (view === 'WEEK_DETAIL' && !selectedWeek && weeks.length > 0) {
      // Find current week based on date or just pick the last one
      const today = getLocalDateISO();
      const activeWeek = weeks.find(w => today >= w.startDate && today <= w.endDate) || weeks[weeks.length - 1];
      setSelectedWeek(activeWeek);
    }
  }, [view, selectedWeek, weeks]);

  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    return sessionStorage.getItem(`dnevnik_selectedDate_${effectiveClassId || 'default'}`) || null;
  });

  // Persist selectedDate changes to sessionStorage
  useEffect(() => {
    if (effectiveClassId) {
      if (selectedDate) {
        sessionStorage.setItem(`dnevnik_selectedDate_${effectiveClassId}`, selectedDate);
      } else {
        sessionStorage.removeItem(`dnevnik_selectedDate_${effectiveClassId}`);
      }
    }
  }, [selectedDate, effectiveClassId]);
  const [dailyLessons, setDailyLessons] = useState<Lesson[]>([]);
  const [weekOverviewLessons, setWeekOverviewLessons] = useState<Lesson[]>([]);
  const [weekOverviewAbsences, setWeekOverviewAbsences] = useState<any[]>([]);
  const [currentWeekAbsences, setCurrentWeekAbsences] = useState<any[]>([]);
  const [dailyAbsences, setDailyAbsences] = useState<any[]>([]);
  const [currentClassExams, setCurrentClassExams] = useState<Exam[]>([]);

  // States for Absence Entry right after lesson entry (e-Dnevnik-style)
  const [showAbsenceEntryModal, setShowAbsenceEntryModal] = useState(false);
  const [absenceEntryLesson, setAbsenceEntryLesson] = useState<Lesson | null>(null);
  const [absenceEntrySelectedStudents, setAbsenceEntrySelectedStudents] = useState<string[]>([]);
  const [absenceEditModal, setAbsenceEditModal] = useState<{
    isOpen: boolean;
    studentId: string;
    absenceIds: string[];
    selectedIds: string[];
  }>({
    isOpen: false,
    studentId: '',
    absenceIds: [],
    selectedIds: []
  });
  const [absenceEditForm, setAbsenceEditForm] = useState({
    status: '' as AbsenceStatus | '',
    absenceType: '',
    note: ''
  });

  // Modal State - Week
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [newWeek, setNewWeek] = useState({
    name: '',
    startDate: '',
    endDate: '',
    shift: 'Ujutro' as 'Ujutro' | 'Popodne' | 'Cjelodnevna',
    isTeachingWeek: true,
    non_teaching_reason: '',
    non_teaching_reason_note: '',
    teachingDays: [] as string[],
    onDutyStudentIds: [] as string[],
    // Track which days are teaching days (Pon-Sub)
    dailyTeachingStatus: {
      0: false, // Ned
      1: true,  // Pon
      2: true,  // Uto
      3: true,  // Sri
      4: true,  // Čet
      5: true,  // Pet
      6: false  // Sub
    } as Record<number, boolean>,
    weekType: 'INSTRUCTIONAL' as 'INSTRUCTIONAL' | 'NON_INSTRUCTIONAL' | 'SCHOOL_HOLIDAY',
    holidayType: '' as 'WINTER_1' | 'WINTER_2' | 'SPRING' | 'SUMMER' | '',
    isInstructional: true
  });

  // Modal State - Lesson
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [activeLessonTab, setActiveLessonTab] = useState<'SADRZAJ' | 'IZOSTANCI' | 'MATERIJALI'>('SADRZAJ');
  const [editingHour, setEditingHour] = useState<number | null>(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [examForm, setExamForm] = useState<Partial<Exam>>({
    subjectId: '',
    date: '',
    type: 'PISANA',
    description: ''
  });
  const [lessonForm, setLessonForm] = useState<Partial<Lesson>>({
    isHeld: true,
    subjectId: '',
    groupName: '',
    isBlock: false,
    blockCount: 1,
    topic: '',
    notes: '',
    materials: '',
    teacherId: user?.id || ''
  });
  const [selectedAbsentees, setSelectedAbsentees] = useState<string[]>([]);

  // Schedule State
  const [scheduleCells, setScheduleCells] = useState<any[]>([]);
  const [scheduleSubjects, setScheduleSubjects] = useState<any[]>([]);
  const [curriculumPlans, setCurriculumPlans] = useState<any[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectTeachingAssignment[]>([]);

  const teachesCroatian = useMemo(() => {
    return subjectAssignments.some(a => {
      if (a.classId !== effectiveClassId) return false;
      const sub = allSubjects.find(s => s.id === a.subjectId);
      return sub && sub.name.toLowerCase().trim() === 'hrvatski jezik' && a.teacherId === user?.id;
    }) || classSubjects.some((cs) => {
      const subName = cs.subject?.name || allSubjects.find(sub => sub.id === cs.subject_id)?.name;
      return cs.class_id === effectiveClassId && subName?.toLowerCase().trim() === 'hrvatski jezik' && cs.teachers?.some((t: any) => t.id === user?.id);
    });
  }, [subjectAssignments, classSubjects, allSubjects, effectiveClassId, user?.id]);

  const canAccessLektira = isAdminUser || teachesCroatian;

  const canCreateExam = useMemo(() => {
    if (!user || !effectiveClassId) return false;
    if (isAdminUser) return true;
    return subjectAssignments.some(a => a.classId === effectiveClassId && a.teacherId === user.id);
  }, [user, isAdminUser, effectiveClassId, subjectAssignments]);

  const canTeachSubjectInClass = useMemo(() => {
    return (subjectId?: string) => {
      if (!subjectId || !effectiveClassId || !user) return false;
      if (isAdminUser) return true;
      return subjectAssignments.some(a =>
        a.classId === effectiveClassId &&
        a.subjectId === subjectId &&
        a.teacherId === user.id
      );
    };
  }, [effectiveClassId, isAdminUser, subjectAssignments, user]);

  const lessonSubjectOptions = useMemo(() => {
    if (!effectiveClassId) return [];
    return allSubjects.filter(s =>
      subjectAssignments.some(a =>
        a.subjectId === s.id &&
        a.classId === effectiveClassId &&
        (isAdminUser || a.teacherId === user?.id)
      )
    );
  }, [allSubjects, effectiveClassId, isAdminUser, subjectAssignments, user?.id]);

  const examSubjectOptions = useMemo(() => {
    if (!effectiveClassId) return [];

    const allowedSubjectIds = new Set<string>();

    if (isAdminUser) {
      classSubjects
        .filter(cs => (cs.class_id || cs.classId) === effectiveClassId)
        .forEach(cs => {
          const subjectId = cs.subject_id || cs.subjectId;
          if (subjectId) allowedSubjectIds.add(subjectId);
        });

      subjectAssignments
        .filter(a => a.classId === effectiveClassId)
        .forEach(a => allowedSubjectIds.add(a.subjectId));
    } else {
      subjectAssignments
        .filter(a => a.classId === effectiveClassId && a.teacherId === user?.id)
        .forEach(a => allowedSubjectIds.add(a.subjectId));
    }

    if (editingExam?.subjectId) {
      allowedSubjectIds.add(editingExam.subjectId);
    }

    return allSubjects.filter(subject => allowedSubjectIds.has(subject.id));
  }, [allSubjects, classSubjects, effectiveClassId, editingExam?.subjectId, isAdminUser, subjectAssignments, user?.id]);

  const canEditExam = useMemo(() => {
    return (exam: any) => {
      if (!user) return false;
      if (isAdminUser) return true;
      const isCreator = exam.createdBy === user.id || exam.teacherId === user.id;
      return isCreator;
    };
  }, [user, isAdminUser]);

  const canDeleteExam = useMemo(() => {
    return (exam: any) => {
      if (!user) return false;
      if (isAdminUser) return true;
      const isCreator = exam.createdBy === user.id || exam.teacherId === user.id;
      return isCreator;
    };
  }, [user, isAdminUser]);

  const canDeleteWeek = useMemo(() => {
    if (!user || !effectiveClassId) return false;
    if (isAdminUser) return true;
    const isHomeroom = selectedClass ? (selectedClass.homeroomTeacherId === user.id || (selectedClass as any).homeroom_teacher_id === user.id) : false;
    return isHomeroom;
  }, [user, isAdminUser, selectedClass, effectiveClassId]);

  const canManageWeeks = useMemo(() => {
    if (!user || !effectiveClassId) return false;
    if (isMainAdmin || highestRole === Role.ADMIN || isSchoolAdmin) return true;
    
    const isHomeroom = selectedClass ? (selectedClass.homeroomTeacherId === user.id || (selectedClass as any).homeroom_teacher_id === user.id) : false;
    const isDeputy = selectedClass ? (selectedClass.deputyTeacherId === user.id || (selectedClass as any).deputy_teacher_id === user.id) : false;
    const isTeachingThisClass = subjectAssignments.some(
      a => a.classId === effectiveClassId && a.teacherId === user.id
    );

    return isHomeroom || isDeputy || isTeachingThisClass;
  }, [user, isMainAdmin, isSchoolAdmin, highestRole, selectedClass, effectiveClassId, subjectAssignments]);

  const getAutoDutyStudents = (weekNum: number) => {
    if (!students || students.length === 0) return [];
    
    const sorted = sortStudentsBySurname(students);
    
    const total = sorted.length;
    const startIndex = ((weekNum - 1) * 2) % total;
    
    const student1 = sorted[startIndex];
    const student2 = sorted[(startIndex + 1) % total];
    
    const res: string[] = [];
    if (student1) res.push(student1.id);
    if (student2) res.push(student2.id);
    return res;
  };

  const getHrvatskiJezikSubjectId = () => {
    const classHrAssignments = subjectAssignments.filter(a => {
      if (a.classId !== effectiveClassId) return false;
      const sub = allSubjects.find(s => s.id === a.subjectId);
      return sub && sub.name.toLowerCase().includes('hrvatski');
    });
    
    if (classHrAssignments.length > 0) {
      return classHrAssignments[0].subjectId;
    }

    const classHrSubject = classSubjects.find(cs => {
      const subjectId = cs.subject_id || cs.subjectId;
      const subject = allSubjects.find(s => s.id === subjectId);
      return subject?.name?.toLowerCase().includes('hrvatski');
    });

    if (classHrSubject) {
      return classHrSubject.subject_id || classHrSubject.subjectId || '';
    }
    
    const hrSub = allSubjects.find(s => {
      if (!s.name.toLowerCase().includes('hrvatski')) return false;
      return classSubjects.some(cs => (cs.subject_id || cs.subjectId) === s.id);
    });
    return hrSub ? hrSub.id : '';
  };
  const [reloadScheduleTrigger, setReloadScheduleTrigger] = useState(0);
  const [consecutivePeriods, setConsecutivePeriods] = useState(1);
  const [isDeleteBlockModalOpen, setIsDeleteBlockModalOpen] = useState(false);
  const [deleteBlockSubjectId, setDeleteBlockSubjectId] = useState('');
  const [deleteSingleSubjectId, setDeleteSingleSubjectId] = useState('');

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{ dayOfWeek: string, shift: 'MORNING' | 'AFTERNOON', periodNumber: number } | null>(null);
  const [cellSubjectForm, setCellSubjectForm] = useState({
    subjectId: '',
    teacherId: '',
    classroom: ''
  });

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    type: 'LESSON' | 'EXAM' | 'WEEK' | 'ABSENCE' | null;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false
  });

  // Daily Notes State & Actions
  const [dailyNotes, setDailyNotes] = useState<any[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteEditContent, setNoteEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  const fetchDailyNotes = async () => {
    if (!effectiveClassId || !selectedDate) return;
    try {
      const res = await fetch(`/api/daily-notes?classId=${effectiveClassId}&date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setDailyNotes(data || []);
      }
    } catch (e) {
      console.error("Error loading daily notes:", e);
    }
  };

  const handleCreateDailyNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !effectiveClassId || !selectedDate) return;

    try {
      const res = await fetch('/api/daily-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classId: effectiveClassId,
          schoolYearId: selectedClass?.schoolYear || '2025/2026',
          date: selectedDate,
          content: newNoteContent,
          createdBy: user?.id,
          authorName: user?.name || 'Nastavnik'
        })
      });

      if (res.ok) {
        toast.success('Dnevna napomena uspješno spremljena!');
        setNewNoteContent('');
        fetchDailyNotes();
      } else {
        throw new Error();
      }
    } catch (e) {
      toast.error('Problem s pohranom dnevne napomene.');
    }
  };

  const handleUpdateDailyNote = async (id: string, content: string) => {
    try {
      const res = await fetch(`/api/daily-notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        toast.success('Dnevna napomena uspješno ažurirana!');
        setEditingNoteId(null);
        fetchDailyNotes();
      } else {
        throw new Error();
      }
    } catch (e) {
      toast.error('Problem s ažuriranjem napomene.');
    }
  };

  const handleDeleteDailyNote = async (id: string) => {
    if (!window.confirm('Sigurno želite obrisati ovu napomenu?')) return;
    try {
      const res = await fetch(`/api/daily-notes/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Dnevna napomena uspješno obrisana!');
        fetchDailyNotes();
      } else {
        throw new Error();
      }
    } catch (e) {
      toast.error('Problem s brisanjem napomene.');
    }
  };

  // Lektira State & Actions
  const [lektire, setLektire] = useState<any[]>([]);
  const [showLektiraModal, setShowLektiraModal] = useState(false);
  const [editingLektira, setEditingLektira] = useState<any | null>(null);
  const [isSavingLektira, setIsSavingLektira] = useState(false);
  const [lektiraForm, setLektiraForm] = useState({
    subjectId: '',
    completedDate: getLocalDateISO(),
    title: '',
    processingDetails: ''
  });

  const fetchLektire = async () => {
    if (!effectiveClassId) return;
    try {
      let hrSubjectId = getHrvatskiJezikSubjectId();
      if (!hrSubjectId) {
        const { data: classSubjs } = await supabase
          .from('class_subjects')
          .select('subject_id')
          .eq('class_id', effectiveClassId);
        const subIds = (classSubjs || []).map(cs => cs.subject_id);
        if (subIds.length > 0) {
          const { data: subjs } = await supabase
            .from('subjects')
            .select('id, name')
            .in('id', subIds);
          const hrSub = (subjs || []).find(s => s.name?.toLowerCase().includes('hrvatski'));
          if (hrSub) {
            hrSubjectId = hrSub.id;
          }
        }
      }

      if (!hrSubjectId) {
        setLektire([]);
        return;
      }

      const { data, error } = await supabase
        .from('reading_assignments')
        .select('*')
        .eq('class_id', effectiveClassId)
        .eq('subject_id', hrSubjectId)
        .order('processed_at', { ascending: false });

      if (error) throw error;
      setLektire(data || []);
    } catch (e) {
      console.error("Error loading lektire:", e);
    }
  };

  const handleCreateOrUpdateLektira = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingLektira) return;
    if (!canAccessLektira) {
      toast.error('Lektiru može uređivati samo admin ili nastavnik Hrvatskog jezika.');
      return;
    }

    let schoolId = selectedSchoolId || selectedClass?.schoolId || null;
    let schoolYearId = selectedYearId || selectedClass?.school_year_id || null;
    const classIdForLektira = effectiveClassId || null;

    if (!classIdForLektira) {
      toast.error('Nije moguće odrediti razred.');
      return;
    }

    if (!schoolId || !schoolYearId) {
      const { data: clsData } = await supabase
        .from('classes')
        .select('school_id, school_year_id')
        .eq('id', classIdForLektira)
        .maybeSingle();
      if (clsData) {
        schoolId = schoolId || clsData.school_id || null;
        schoolYearId = schoolYearId || clsData.school_year_id || null;
      }
    }

    if (!schoolId) {
      toast.error('Nije moguće odrediti školu.');
      return;
    }

    let targetSubjectId = getHrvatskiJezikSubjectId();
    if (!targetSubjectId) {
      const { data: classSubjs } = await supabase
        .from('class_subject_teachers')
        .select('subject_id')
        .eq('class_id', classIdForLektira);
      const subIds = (classSubjs || []).map(cs => cs.subject_id);
      if (subIds.length > 0) {
        const { data: subjs } = await supabase
          .from('subjects')
          .select('id, name')
          .in('id', subIds);
        const hrSub = (subjs || []).find(s => s.name?.toLowerCase().includes('hrvatski'));
        if (hrSub) {
          targetSubjectId = hrSub.id;
        }
      }
      if (!targetSubjectId) {
        const { data: globalSubjs } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('school_id', schoolId);
        const hrSub = (globalSubjs || []).find(s => s.name?.toLowerCase().includes('hrvatski'));
        if (hrSub) {
          targetSubjectId = hrSub.id;
        }
      }
    }

    if (!targetSubjectId) {
      toast.error('Nije pronađen predmet Hrvatski jezik za ovaj razred.');
      return;
    }

    if (!lektiraForm.title || !lektiraForm.completedDate) {
      toast.error('Molimo ispunite obavezna polja');
      return;
    }

    try {
      setIsSavingLektira(true);
      const isNew = !editingLektira;
      
      const payload = {
        class_id: classIdForLektira,
        subject_id: targetSubjectId,
        processed_at: lektiraForm.completedDate,
        title: lektiraForm.title,
        created_by: user?.id,
        school_id: schoolId,
        school_year_id: schoolYearId,
        teacher_id: user?.id,
        processing_details: lektiraForm.processingDetails || ''
      };

      if (isNew) {
        const { data, error } = await supabase
          .from("reading_assignments")
          .insert(payload)
          .select();
        
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Lektira nije dodana.");
        toast.success("Lektira uspješno dodana!");
      } else {
        const { data, error } = await supabase
          .from("reading_assignments")
          .update({
            title: lektiraForm.title,
            processed_at: lektiraForm.completedDate,
            processing_details: lektiraForm.processingDetails,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingLektira.id)
          .select();
        
        console.log("UPDATE READING RESULT", { data, error });
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Lektira nije ažurirana. Provjeri RLS UPDATE policy.");
        toast.success("Lektira ažurirana.");
      }

      setLektiraForm({
        subjectId: '',
        completedDate: getLocalDateISO(),
        title: '',
        processingDetails: ''
      });
      setEditingLektira(null);
      setShowLektiraModal(false);
      await fetchLektire();
    } catch (err: any) {
      toast.error(err.message || 'Greška pri spremanju lektire');
    } finally {
      setIsSavingLektira(false);
    }
  };

  const handleDeleteReading = async (reading: any) => {
    console.log("DELETE READING CLICKED", reading);
    console.log("READING ID", reading?.id);

    if (!reading?.id) {
      toast.error("Nedostaje ID lektire.");
      return;
    }

    console.log("BEFORE DELETE", reading.id);

    const { data, error } = await supabase
      .from("reading_assignments")
      .delete()
      .eq("id", reading.id)
      .select();

    console.log("DELETE READING RESULT", { data, error });

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data || data.length === 0) {
      toast("Lektira je već obrisana ili više ne postoji.", { icon: "ℹ️" });
      setLektire(prev => prev.filter(r => r.id !== reading.id));
      await fetchLektire();
      return;
    }

    toast.success("Lektira obrisana.");
    setLektire((prev) => prev.filter((r) => r.id !== reading.id));
    await fetchLektire();
  };

  useEffect(() => {
    const fetchInitial = async () => {
      if (!selectedSchoolId || !user) return;
      try {
        const { data: assignmentsData, error: ae } = await supabase
          .from('class_subject_teachers')
          .select('*');
        if (ae) throw ae;

        const formattedAssignments = mapList(assignmentsData || [], mappers.classSubjectTeacher);
        setSubjectAssignments(formattedAssignments);

        const { data: classesData, error: ce } = await supabase
          .from('classes')
          .select('*, program:program_id(*)')
          .eq('school_id', selectedSchoolId);
        if (ce) throw ce;

        const mappedClasses = mapList(classesData || [], mappers.class);
        
        let filteredClasses = mappedClasses;
        if (!isAdminUser) {
          const teachingClassIds = formattedAssignments
            .filter((a: any) => a.teacherId === user.id)
            .map((a: any) => a.classId);
          
          filteredClasses = mappedClasses.filter(c => 
            c.homeroomTeacherId === user.id || 
            c.deputyTeacherId === user.id ||
            teachingClassIds.includes(c.id)
          );
        }

        setClasses(filteredClasses);

        const { data: subjectsData, error: se } = await supabase
          .from('subjects')
          .select('*')
          .eq('school_id', selectedSchoolId);
        if (se) throw se;
        setRawSubjects(mapList(subjectsData || [], mappers.subject));

        const { data: rolesData, error: re } = await supabase
          .from('user_school_roles')
          .select('*, user:user_profiles(*)')
          .eq('school_id', selectedSchoolId);
        if (re) throw re;

        const staffRoles = (rolesData || []).filter(r => 
          [Role.TEACHER, Role.ADMIN, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.MAIN_ADMIN].includes(r.role as Role)
        );

        const uniqueTeachers = Array.from(new Map(staffRoles.map(r => {
          const u = mappers.user(r.user);
          return [u.id, u];
        })).values());
        
        setTeachers(uniqueTeachers as User[]);
      } catch (error) {
        console.error(error);
        toast.error('Greška pri dohvaćanju inicijalnih podataka');
      }
    };
    fetchInitial();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (!effectiveClassId) return;
    const fetchClassContext = async () => {
      setStudents([]);
      setWeeks([]);
      try {
        const { data: studentsData, error: se } = await supabase
          .from('student_class_enrollments')
          .select('*, student:user_profiles(*)')
          .eq('class_id', effectiveClassId)
          .eq('status', 'ACTIVE');
        if (se) throw se;

        const studentList = (studentsData || []).map(row => {
          const u = mappers.user(row.student);
          return {
            ...u,
            globalRole: Role.STUDENT
          };
        }) as User[];
        
const uniqueStudents = Array.from(new Map(studentList.map(s => [s.id, s])).values());
setStudents(uniqueStudents);


        const { data: weeksData, error: we } = await supabase
          .from('work_weeks')
          .select('*')
          .eq('class_id', effectiveClassId);
        if (we) throw we;

        const weekList = mapList(weeksData || [], mappers.week);
        setWeeks(weekList);

        const { data: csData, error: cse } = await supabase
          .from('class_subjects')
          .select('*')
          .eq('class_id', effectiveClassId);
        if (!cse && csData) {
          setClassSubjects(csData);
        } else {
          setClassSubjects([]);
        }
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju konteksta razreda');
      }
    };
    fetchClassContext();
  }, [effectiveClassId]);

  useEffect(() => {
    if (!effectiveClassId || weeks.length === 0) {
      setWeekOverviewLessons([]);
      setWeekOverviewAbsences([]);
      return;
    }

    const fetchWeekOverviewData = async () => {
      const datedWeeks = weeks.filter(w => w.startDate && w.endDate);
      if (datedWeeks.length === 0) {
        setWeekOverviewLessons([]);
        setWeekOverviewAbsences([]);
        return;
      }

      const startDate = datedWeeks.reduce((min, week) => week.startDate < min ? week.startDate : min, datedWeeks[0].startDate);
      const endDate = datedWeeks.reduce((max, week) => week.endDate > max ? week.endDate : max, datedWeeks[0].endDate);

      try {
        const [{ data: lessonsData, error: lessonsError }, { data: absencesData, error: absencesError }] = await Promise.all([
          supabase
            .from('lessons')
            .select('*')
            .eq('class_id', effectiveClassId)
            .gte('date', startDate)
            .lte('date', endDate),
          supabase
            .from('absences')
            .select('*')
            .eq('class_id', effectiveClassId)
            .gte('date', startDate)
            .lte('date', endDate)
        ]);

        if (lessonsError) throw lessonsError;
        if (absencesError) throw absencesError;

        setWeekOverviewLessons(mapList(lessonsData || [], mappers.lesson));
        setWeekOverviewAbsences(mapList(absencesData || [], mappers.absence));
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju pregleda radnih tjedana');
      }
    };

    fetchWeekOverviewData();
  }, [effectiveClassId, weeks]);

  useEffect(() => {
    if (!effectiveClassId) return;
    const fetchScheduleData = async () => {
      setScheduleCells([]);
      setScheduleSubjects([]);
      try {
        const { data: cellsData, error: ce } = await supabase
          .from('schedule_cells')
          .select('*')
          .eq('class_id', effectiveClassId);
        if (ce) throw ce;
        
        const cells = mapList(cellsData || [], mappers.scheduleCell);
        setScheduleCells(cells);

        if (cells.length > 0) {
          const cellIds = cells.map(c => c.id);
          const { data: subjectsData, error: sse } = await supabase
            .from('schedule_cell_subjects')
            .select('*')
            .in('schedule_cell_id', cellIds);
          if (sse) throw sse;

          setScheduleSubjects(mapList(subjectsData || [], mappers.scheduleCellSubject));
        } else {
          setScheduleSubjects([]);
        }

        const { data: plansData, error: pe } = await supabase
          .from('curriculum_plans')
          .select('*')
          .eq('class_id', effectiveClassId);
        if (pe) throw pe;

        setCurriculumPlans(mapList(plansData || [], mappers.curriculumPlan));
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju rasporeda');
      }
    };
    fetchScheduleData();
  }, [effectiveClassId, reloadScheduleTrigger]);

  const fetchAbsencesForDay = async () => {
    if (!selectedDate || !effectiveClassId) return;
    try {
      const { data, error } = await supabase
        .from('absences')
        .select('*')
        .eq('class_id', effectiveClassId)
        .eq('date', selectedDate);
      if (error) throw error;
      setDailyAbsences(mapList(data || [], mappers.absence));
    } catch (error) {
      console.error("fetchAbsencesForDay error:", error);
    }
  };

  useEffect(() => {
    if (!selectedDate || !effectiveClassId) return;
    const fetchLessonsForDay = async () => {
      try {
        const { data, error } = await supabase
          .from('lessons')
          .select('*')
          .eq('class_id', effectiveClassId)
          .eq('date', selectedDate);
        if (error) throw error;

        const transformed = (data || []).map(l => {
          let normalizedGroup = l.group_name;
          const rawGroup = (l.group_name || '').toLowerCase().trim();
          if (rawGroup === 'grupa a' || rawGroup === 'grupaa' || rawGroup === 'group_a') normalizedGroup = 'GROUP_A';
          else if (rawGroup === 'grupa b' || rawGroup === 'grupab' || rawGroup === 'group_b') normalizedGroup = 'GROUP_B';
          else if (rawGroup === 'cijeli razred' || rawGroup === 'full_class') normalizedGroup = 'FULL_CLASS';

          if (normalizedGroup !== l.group_name) {
            supabase.from('lessons').update({ group_name: normalizedGroup }).eq('id', l.id).then();
            l.group_name = normalizedGroup;
          }
          return l;
        });

        setDailyLessons(mapList(transformed, mappers.lesson));
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju sati za dan');
      }
    };
    fetchLessonsForDay();
    fetchAbsencesForDay();
    fetchDailyNotes();
  }, [selectedDate, effectiveClassId]);

  useEffect(() => {
    if (!effectiveClassId) return;
    const fetchAssignments = async () => {
      try {
        const { data, error } = await supabase
          .from('class_subject_teachers')
          .select('*')
          .eq('class_id', effectiveClassId);
        if (error) throw error;

        setSubjectAssignments(mapList(data || [], mappers.classSubjectTeacher));
      } catch (err) {
        console.error(err);
        toast.error('Greška pri učitavanju zaduženja');
      }
    };
    fetchAssignments();
  }, [effectiveClassId]);

  useEffect(() => {
    if (view === 'LEKTIRA' && !canAccessLektira && allSubjects.length > 0) {
      setView('WEEKS');
    }
  }, [view, canAccessLektira, allSubjects.length]);

  useEffect(() => {
    if (
      view === 'LEKTIRA' &&
      effectiveClassId &&
      canAccessLektira &&
      allSubjects.length > 0 &&
      (classSubjects.length > 0 || subjectAssignments.length > 0)
    ) {
      fetchLektire();
    }
  }, [view, effectiveClassId, canAccessLektira, allSubjects.length, classSubjects.length, subjectAssignments.length]);

  useEffect(() => {
    if (view === 'ABSENCES' && effectiveClassId && selectedWeek) {
      const fetchAbsences = async () => {
        try {
          const { data, error } = await supabase
            .from('absences')
            .select('*')
            .eq('class_id', effectiveClassId)
            .gte('date', selectedWeek.startDate)
            .lte('date', selectedWeek.endDate);
          if (error) throw error;
          setCurrentWeekAbsences(mapList(data || [], mappers.absence));
        } catch (error) {
          console.error(error);
          toast.error('Greška pri učitavanju izostanaka');
        }
      };
      fetchAbsences();
    }
    if (view === 'EXAMS' && effectiveClassId) {
      const fetchExams = async () => {
        try {
          const { data, error } = await supabase
            .from('exams')
            .select('*')
            .eq('class_id', effectiveClassId)
            .order('exam_date', { ascending: false });
          if (error) throw error;

          setCurrentClassExams(mapList(data || [], mappers.exam));
        } catch (error) {
          console.error(error);
          toast.error('Greška pri učitavanju ispita');
        }
      };
      fetchExams();
    }
  }, [view, effectiveClassId, selectedWeek]);

  const handleSaveCellSubject = async () => {
    if (!editingCell || !effectiveClassId || !cellSubjectForm.subjectId) return;
    
    // Find the assignment to get the teacher automatically
    const assignment = subjectAssignments.find(a => 
      a.subjectId === cellSubjectForm.subjectId && 
      a.classId === effectiveClassId
    );
    
    if (!assignment || !assignment.teacherId) {
      toast.error("Predmet nema dodijeljenog nastavnika u ovom razredu. Molimo nazovite administratora.");
      return;
    }

    const teacherId = assignment.teacherId;

    try {
      const res = await fetch('/api/admin/bulk-schedule-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classId: effectiveClassId,
          dayOfWeek: editingCell.dayOfWeek,
          shift: editingCell.shift,
          startPeriod: editingCell.periodNumber,
          consecutivePeriods: consecutivePeriods,
          subjectId: cellSubjectForm.subjectId,
          teacherId: teacherId,
          classroom: cellSubjectForm.classroom || null
        })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Neuspjelo spremanje rasporeda.');
      }

      toast.success('Raspored uspješno spremljen');
      setCellSubjectForm({ subjectId: '', teacherId: '', classroom: '' });
      setConsecutivePeriods(1);
      setReloadScheduleTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Greška pri spremanju rasporeda');
    }
  };

  const handleRemoveScheduleSubject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('schedule_cell_subjects')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setScheduleSubjects(scheduleSubjects.filter(s => s.id !== id));
      toast.success('Predmet uklonjen iz rasporeda');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri brisanju iz rasporeda');
    }
  };

  const handleDeleteScheduleSubjectClick = (assignedSubject: any) => {
    if (!canManageClass && !isAdminUser) {
      toast.error('Nemate dozvolu za mijenjanje rasporeda.');
      return;
    }

    const subjectId = assignedSubject.subjectId;
    const sameSubjectCells = scheduleSubjects.filter(ss => {
      const parentCell = scheduleCells.find(c => c.id === ss.scheduleCellId);
      return parentCell && 
             parentCell.dayOfWeek === editingCell?.dayOfWeek && 
             parentCell.shift === editingCell?.shift && 
             ss.subjectId === subjectId;
    });

    if (sameSubjectCells.length > 1) {
      setDeleteBlockSubjectId(subjectId);
      setDeleteSingleSubjectId(assignedSubject.id);
      setIsDeleteBlockModalOpen(true);
    } else {
      confirmSingleDelete(assignedSubject.id);
    }
  };

  const confirmSingleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('schedule_cell_subjects')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setScheduleSubjects(scheduleSubjects.filter(ss => ss.id !== id));
      toast.success('Sat obrisan iz rasporeda');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmBlockDelete = async () => {
    try {
      const searchParams = new URLSearchParams({
        classId: effectiveClassId,
        dayOfWeek: editingCell?.dayOfWeek || '',
        shift: editingCell?.shift || '',
        subjectId: deleteBlockSubjectId
      });

      const res = await fetch(`/api/admin/bulk-schedule-assign?${searchParams.toString()}`, {
        method: 'DELETE'
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Neuspjelo brisanje bloka.');
      }

      toast.success('Cijeli blok predmeta je uspješno obrisan.');
      setIsDeleteBlockModalOpen(false);
      setReloadScheduleTrigger(prev => prev + 1);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const days = ['PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB'];
  const morningPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
  const afternoonPeriods = [0, 1, 2, 3, 4, 5, 6, 7];

  const getCellSubjects = (day: string, shift: 'MORNING' | 'AFTERNOON', period: number) => {
    const cell = scheduleCells.find(c => c.classId === effectiveClassId && c.dayOfWeek === day && c.shift === shift && c.periodNumber === period);
    if (!cell) return [];
    return scheduleSubjects.filter(s => s.scheduleCellId === cell.id);
  };

  const getScheduledSubjectsForNow = (hour: number) => {
    if (!selectedDate || !selectedWeek) return [];
    const date = new Date(selectedDate);
    const dayNames = ['NED', 'PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB'];
    const day = dayNames[date.getDay()];
    
    let shift: 'MORNING' | 'AFTERNOON' = 'MORNING';
    if (selectedWeek.shift === 'Popodne' || (selectedWeek.shift as string) === 'AFTERNOON') shift = 'AFTERNOON';
    
    // Period structure cross-check
    if (shift === 'MORNING' && hour === 0) shift = 'AFTERNOON';
    if (shift === 'AFTERNOON' && hour === 8) shift = 'MORNING';

    const cell = scheduleCells.find(c => 
      c.dayOfWeek === day && 
      c.shift === shift && 
      c.periodNumber === hour
    );
    if (!cell) return [];
    return scheduleSubjects.filter(ss => ss.scheduleCellId === cell.id);
  };

  const getActivePeriodsForWeek = () => {
    if (!selectedWeek) return morningPeriods;
    const isAfternoonWeek = selectedWeek.shift === 'Popodne' || (selectedWeek.shift as string) === 'AFTERNOON';
    return isAfternoonWeek ? afternoonPeriods : morningPeriods;
  };

  const getLessonSubjectLabel = (lesson: Lesson) => {
    const subject = allSubjects.find(s => s.id === lesson.subjectId);
    return formatSubjectName(subject || { name: 'Predmet' });
  };

  const openAbsenceEntryForLesson = (lesson: Lesson) => {
    const lessonAbsences = dailyAbsences.filter(absence => absence.lessonId === lesson.id);
    setAbsenceEntryLesson(lesson);
    setAbsenceEntrySelectedStudents(lessonAbsences.map(absence => absence.studentId));
    setShowAbsenceEntryModal(true);
  };

  const openAbsenceEditModal = (studentId: string, targetAbsences: any[]) => {
    if (targetAbsences.length === 0) return;
    const firstAbsence = targetAbsences[0];
    setAbsenceEditModal({
      isOpen: true,
      studentId,
      absenceIds: targetAbsences.map(absence => absence.id),
      selectedIds: targetAbsences.map(absence => absence.id)
    });
    setAbsenceEditForm({
      status: firstAbsence.status || '',
      absenceType: firstAbsence.absenceType || '',
      note: firstAbsence.note || ''
    });
  };

  const closeAbsenceEditModal = () => {
    setAbsenceEditModal({ isOpen: false, studentId: '', absenceIds: [], selectedIds: [] });
    setAbsenceEditForm({ status: '', absenceType: '', note: '' });
  };

  const isRecordOlderThan = (record: { createdAt?: string; created_at?: string; updatedAt?: string; updated_at?: string } | null | undefined, limitMs: number) => {
    const timestamp = record?.createdAt || record?.created_at || record?.updatedAt || record?.updated_at;
    if (!timestamp) return false;
    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime())) return false;
    return Date.now() - createdAt.getTime() > limitMs;
  };

  const isRecordOlderThan48Hours = (record?: { createdAt?: string; created_at?: string; updatedAt?: string; updated_at?: string } | null) =>
    isRecordOlderThan(record, 48 * 60 * 60 * 1000);

  const handleAddWeek = () => {
    const nextWeekNum = weeks.length + 1;
    const defaultName = `${nextWeekNum}. radni tjedan`;
    const dutyIds = getAutoDutyStudents(nextWeekNum);

    setEditingWeekId(null);
    setNewWeek({ 
      name: defaultName, 
      startDate: '', 
      endDate: '', 
      teachingDays: [], 
      onDutyStudentIds: dutyIds,
      shift: 'Ujutro', 
      isTeachingWeek: true,
      non_teaching_reason: '',
      non_teaching_reason_note: '',
      dailyTeachingStatus: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false },
      weekType: 'INSTRUCTIONAL',
      holidayType: '',
      isInstructional: true
    });
    setShowWeekModal(true);
  };

  const handleEditWeek = (w: WorkWeek) => {
    setEditingWeekId(w.id);
    
    console.log("EDIT WORK WEEK CLICKED", w);
    
    // Set daily status based on teaching days
    const dailyTeachingStatus: Record<number, boolean> = {
      0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false
    };
    
    (w.teachingDays || []).forEach(dateStr => {
      const d = new Date(dateStr);
      dailyTeachingStatus[d.getDay()] = true;
    });

    setNewWeek({
      name: w.name,
      startDate: w.startDate,
      endDate: w.endDate || '',
      shift: ((w.shift as any) === 'MORNING' ? 'Ujutro' : ((w.shift as any) === 'AFTERNOON' ? 'Popodne' : w.shift)),
      isTeachingWeek: w.isTeachingWeek !== undefined ? w.isTeachingWeek : true,
      non_teaching_reason: w.non_teaching_reason || '',
      non_teaching_reason_note: w.non_teaching_reason_note || '',
      teachingDays: w.teachingDays || [],
      onDutyStudentIds: w.onDutyStudentIds || [],
      dailyTeachingStatus,
      weekType: w.weekType || 'INSTRUCTIONAL',
      holidayType: w.holidayType || '',
      isInstructional: w.isInstructional !== undefined ? w.isInstructional : true
    });
    
    setShowWeekModal(true);
  };

  const handleSaveWeek = async () => {
    if (!effectiveClassId) return;
    if (!canManageWeeks) {
      toast.error('Nemate ovlasti za spremanje radnih tjedana!');
      return;
    }
    
    // Ensure we are using current class context correctly
    const currentClass = classes.find(c => c.id === effectiveClassId);
    if (!currentClass) {
        toast.error('Razred nije pronađen');
        return;
    }

    try {
      if (newWeek.weekType === 'NON_INSTRUCTIONAL' && !newWeek.non_teaching_reason) {
        toast.error('Molimo odaberite razlog za nenastavni tjedan.');
        return;
      }
      
      const days: string[] = [];
      const isHoliday = newWeek.weekType === 'SCHOOL_HOLIDAY';
      
      // Calculate teaching days only if it's not a school holiday week
      if (!isHoliday) {
        let current = new Date(newWeek.startDate);
        const end = new Date(newWeek.endDate);
        while(current <= end) {
          const dayOfWeek = current.getDay();
          if (newWeek.dailyTeachingStatus[dayOfWeek]) {
            days.push(getLocalDateISO(current));
          }
          current.setDate(current.getDate() + 1);
        }
      }
      
      let finalShift = newWeek.shift === 'Ujutro' ? 'MORNING' : (newWeek.shift === 'Popodne' ? 'AFTERNOON' : 'ALL_DAY');

      const computedIsTeachingWeek = !isHoliday && (newWeek.weekType !== 'NON_INSTRUCTIONAL') && newWeek.isTeachingWeek;
      const computedIsInstructional = !isHoliday && (newWeek.weekType !== 'NON_INSTRUCTIONAL') && newWeek.isTeachingWeek;
      const computedHolidayType = isHoliday ? (newWeek.holidayType || 'WINTER_1') : null;

      if (editingWeekId) {
        const payload = {
          name: newWeek.name,
          start_date: newWeek.startDate,
          end_date: newWeek.endDate,
          shift: finalShift,
          is_teaching_week: computedIsTeachingWeek,
          non_teaching_reason: computedIsTeachingWeek ? null : (isHoliday ? 'SCHOOL_HOLIDAY' : newWeek.non_teaching_reason),
          non_teaching_reason_note: computedIsTeachingWeek ? null : (isHoliday ? 'Školski praznici' : newWeek.non_teaching_reason_note),
          teaching_days: days,
          on_duty_student_ids: newWeek.onDutyStudentIds,
          week_type: newWeek.weekType,
          holiday_type: computedHolidayType,
          is_instructional: computedIsInstructional,
          updated_at: new Date().toISOString()
        };
        
        console.log("UPDATE WORK WEEK PAYLOAD", payload);

        const { data, error } = await supabase
          .from('work_weeks')
          .update(payload)
          .eq('id', editingWeekId)
          .select()
          .single();
          
        console.log("UPDATE WORK WEEK ERROR", error);
        console.log("UPDATE WORK WEEK SUCCESS", data);

        if (error) {
          toast.error('Greška pri ažuriranju radnog tjedna: ' + error.message);
          throw error;
        }

        const mappedData = mappers.week(data);
        setWeeks(weeks.map(w => w.id === editingWeekId ? mappedData : w));
        if (selectedWeek?.id === editingWeekId) {
          setSelectedWeek(mappedData);
        }
        toast.success('Radni tjedan ažuriran.');
      } else {
        const existingWeek = weeks.find(w => w.startDate === newWeek.startDate);
        if (existingWeek) {
          toast.success('Prikazan je postojeći radni tjedan za ovaj datum.');
          setSelectedWeek(existingWeek);
          setView('WEEK_DETAIL');
          setShowWeekModal(false);
          return;
        }

        let onDuty = newWeek.onDutyStudentIds || [];
        if (onDuty.length === 0) {
          const studentCount = students.length || 1;
          const startIdx = (weeks.length * 2) % studentCount;
          onDuty = Array.from(new Set([
            students[startIdx]?.id || '',
            students[(startIdx + 1) % studentCount]?.id || ''
          ])).filter(id => id !== '');
        }

        const payload = {
            class_id: effectiveClassId,
            school_year_id: currentClass.school_year_id, // Ensure we use school_year_id
            school_year: currentClass.schoolYear,
            school_id: selectedSchoolId,
            name: newWeek.name,
            start_date: newWeek.startDate,
            end_date: newWeek.endDate,
            on_duty_student_ids: onDuty,
            teaching_days: days,
            shift: finalShift,
            is_teaching_week: computedIsTeachingWeek,
            non_teaching_reason: computedIsTeachingWeek ? null : (isHoliday ? 'SCHOOL_HOLIDAY' : newWeek.non_teaching_reason),
            non_teaching_reason_note: computedIsTeachingWeek ? null : (isHoliday ? 'Školski praznici' : newWeek.non_teaching_reason_note),
            week_type: newWeek.weekType,
            holiday_type: computedHolidayType,
            is_instructional: computedIsInstructional
        };
        
        console.log("WORK WEEK INSERT PAYLOAD:", payload);

        const { data, error } = await supabase
          .from('work_weeks')
          .insert(payload)
          .select()
          .single();
          
        console.log("WORK WEEK INSERT ERROR:", error);

        if (error) {
          toast.error('Greška pri kreiranju radnog tjedna: ' + error.message);
          throw error;
        }

        setWeeks([...weeks, mappers.week(data)]);
        toast.success('Radni tjedan dodan.');
      }

      setShowWeekModal(false);
      setEditingWeekId(null);
      setNewWeek({ 
        name: '', 
        startDate: '', 
        endDate: '', 
        teachingDays: [], 
        onDutyStudentIds: [],
        shift: 'Ujutro', 
        isTeachingWeek: true,
        non_teaching_reason: '',
        non_teaching_reason_note: '',
        dailyTeachingStatus: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false },
        weekType: 'INSTRUCTIONAL',
        holidayType: '',
        isInstructional: true
      });
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri spremanju radnog tjedna: ' + err.message);
    }
  };

  const openLessonModal = async (hour: number, lesson?: Lesson, defaultValues?: { subjectId: string, teacherId: string }) => {
      if (selectedWeek?.weekType === 'SCHOOL_HOLIDAY') {
        toast.error('Unos i uređivanje nastave nije moguće u tjednu označenom kao školski praznici.');
        return;
      }
      setEditingHour(hour);
      
      if (lesson) {
        try {
          // Fetch existing absences for this specific lesson
          const { data, error } = await supabase
            .from('absences')
            .select('student_id')
            .eq('lesson_id', lesson.id);
          if (error) throw error;
          
          const absIds = (data || []).map(d => d.student_id);
          setSelectedAbsentees(absIds);
        } catch (error) {
          console.error(error);
          toast.error('Greška pri dohvaćanju izostanaka');
        }

        setLessonForm({
          id: lesson.id,
          isHeld: lesson.isHeld,
          subjectId: lesson.subjectId,
          groupName: lesson.groupName || 'FULL_CLASS',
          isBlock: lesson.isBlock,
          blockCount: lesson.blockCount || 1,
          topic: lesson.topic,
          notes: lesson.notes,
          materials: lesson.materials || '',
          teacherId: lesson.teacherId
        });
      } else {
        setSelectedAbsentees([]);
        setLessonForm({
          isHeld: true,
          subjectId: defaultValues?.subjectId || '',
          groupName: 'FULL_CLASS',
          isBlock: false,
          blockCount: 1,
          topic: '',
          notes: '',
          materials: '',
          teacherId: defaultValues?.teacherId || (user?.id || '')
        });
      }
    setActiveLessonTab('SADRZAJ');
    setShowLessonModal(true);
  };

  const handleLessonDelete = (e: React.MouseEvent, lessonId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const lesson = dailyLessons.find(l => l.id === lessonId);
    if (!lesson) return;

    const canDeleteOwnLesson = lesson.teacherId === user?.id;
    const canDeleteAsAdmin = isAdminUser;

    if (!canDeleteAsAdmin && !canDeleteOwnLesson) {
       toast.error('Niste ovlašteni za brisanje ovog sata.');
       return;
    }

    if (!canDeleteAsAdmin && isRecordOlderThan48Hours(lesson as any)) {
       toast.error('Sat možete obrisati samo unutar 48 sati od unosa. Nakon toga brisanje može napraviti samo admin.');
       return;
    }

    setDeleteDialog({ isOpen: true, id: lessonId, type: 'LESSON', loading: false });
  };

  const confirmDelete = async (totpCode?: string) => {
    if (!deleteDialog.id || !deleteDialog.type) return;
    
    const requiresTotp = false;

    if (requiresTotp) {
      if (!totpCode) {
        toast.error('Potreban je autentifikator kod.');
        return;
      }
      
      const res = await fetch('/api/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUserId: user?.id, totpCode })
      });
      
      console.log("VERIFY RESPONSE STATUS", res.status);
      console.log("VERIFY RESPONSE URL", res.url);
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        toast.error("API ruta za provjeru autentifikatora nije dostupna.");
        return;
      }

      const data = await res.json();
      if (!data || !data.success) {
        toast.error(data?.error || 'Neispravan autentifikator kod.');
        return;
      }
    }

    setDeleteDialog(prev => ({ ...prev, loading: true }));

    try {
      if (deleteDialog.type === 'LESSON') {
        const lessonId = deleteDialog.id;
        
        // 1. Delete associated absences first
        const { error: ae } = await supabase
          .from('absences')
          .delete()
          .eq('lesson_id', lessonId);
        if (ae) throw ae;

        // 2. Delete the lesson
        const { error: le } = await supabase
          .from('lessons')
          .delete()
          .eq('id', lessonId);
        if (le) throw le;
        
        // Audit log
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actionType: 'DELETE_LESSON',
                recordId: lessonId,
                userId: user?.id,
                userRole: highestRole,
                details: `Deleted lesson ${lessonId}`
            })
        });
        
        // 3. Update local state
        setDailyLessons(prev => prev.filter(l => l.id !== lessonId));
        
        // Refresh absences in state
        if (view === 'ABSENCES') {
          setCurrentWeekAbsences(prev => prev.filter(a => a.lessonId !== lessonId));
        }

        toast.success('Sat je uspješno obrisan.');
      } else if (deleteDialog.type === 'EXAM') {
        const examToDelete = currentClassExams.find(ex => ex.id === deleteDialog.id);
        if (examToDelete && !canDeleteExam(examToDelete)) {
          toast.error('Možete obrisati samo provjere koje ste Vi kreirali!');
          return;
        }
        const { error } = await supabase
          .from('exams')
          .delete()
          .eq('id', deleteDialog.id);
        if (error) throw error;
        
        setCurrentClassExams(prev => prev.filter(ex => ex.id !== deleteDialog.id));
        toast.success('Ispit je uspješno obrisan.');
      } else if (deleteDialog.type === 'WEEK') {
        if (!canDeleteWeek) {
          toast.error('Nemate ovlasti za brisanje radnih tjedana!');
          return;
        }
        const { error } = await supabase
          .from('work_weeks')
          .delete()
          .eq('id', deleteDialog.id);
        if (error) throw error;

        setWeeks(prev => prev.filter(w => w.id !== deleteDialog.id));
        toast.success('Radni tjedan je uspješno obrisan.');
      }

    } catch (err) {
      console.error(err);
      toast.error('Brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
    }
  };


  const saveLessonDetailed = async () => {
    if (editingHour === null || !effectiveClassId || !selectedDate || !user) return;
    
    if (lessonForm.isHeld && !lessonForm.topic?.trim()) {
      toast.error('Molimo unesite nastavnu jedinicu.');
      return;
    }
    if (!lessonForm.subjectId) {
      toast.error('Molimo odaberite predmet.');
      return;
    }

    const assignment = subjectAssignments.find(a =>
      a.subjectId === lessonForm.subjectId &&
      a.classId === effectiveClassId &&
      (isAdminUser || a.teacherId === user.id)
    );

    if (!assignment && !isAdminUser) {
       toast.error('Možete unositi sate samo za predmete koje predajete ovom razredu.');
       return;
    }

    const currentClass = classes.find(c => c.id === effectiveClassId);

    try {
      const isEditing = !!lessonForm.id;
      const count = isEditing ? 1 : (lessonForm.blockCount || 1); 
      const startHour = editingHour;

      if (!isEditing) {
        for (let i = 0; i < count; i++) {
          const checkHour = startHour + i;
          const duplicate = dailyLessons.find(l => 
            l.hour === checkHour && 
            l.subjectId === lessonForm.subjectId && 
            l.teacherId === (lessonForm.teacherId || user.id)
          );
          if (duplicate) {
            const sub = allSubjects.find(s => s.id === lessonForm.subjectId);
            toast.error(`Već ste upisali predmet ${sub?.name || ''} za ${checkHour}. sat.`);
            return;
          }
        }
      }

      for (let i = 0; i < count; i++) {
        const currentHour = startHour + i;
        if (currentHour > 8) break;

        const lessonData: any = {
          class_id: effectiveClassId,
          school_id: selectedSchoolId,
          school_year_id: currentClass?.school_year_id,
          work_week_id: selectedWeek?.id,
          date: selectedDate,
          hour: currentHour,
          is_held: lessonForm.isHeld,
          subject_id: lessonForm.subjectId,
          group_name: lessonForm.groupName === 'FULL_CLASS' ? 'FULL_CLASS' : (lessonForm.groupName || 'FULL_CLASS'),
          is_block: lessonForm.isBlock || false,
          block_count: lessonForm.blockCount || 1,
          topic: lessonForm.topic || '',
          notes: lessonForm.notes || '',
          materials: lessonForm.materials || '',
          teacher_id: lessonForm.teacherId || user.id,
          created_by_user_id: user.id,
          teacher_display_name: formatPersonName(user),
          updated_at: new Date().toISOString()
        };

        let finalId = '';

        if (isEditing && i === 0) {
          finalId = lessonForm.id!;
          const { error } = await supabase
            .from('lessons')
            .update(lessonData)
            .eq('id', finalId);
          if (error) throw error;

          setDailyLessons(prev => prev.map(l => l.id === finalId ? mappers.lesson({ ...l, ...lessonData, id: finalId }) : l));
        } else {
          const { data, error } = await supabase
            .from('lessons')
            .insert({ ...lessonData, created_at: new Date().toISOString() })
            .select()
            .maybeSingle();
          if (error || !data) throw error || new Error("Lesson creation failed");
          finalId = data.id;
          setDailyLessons(prev => [...prev, mappers.lesson(data)]);
        }

        if (finalId) {
          // Smart sync of absences to preserve existing statuses (OPRAVDANO/NEOPRAVDANO) and update lesson properties
          try {
            const { data: existingAbs, error: fetchErr } = await supabase
              .from('absences')
              .select('*')
              .eq('lesson_id', finalId);
            
            if (!fetchErr && existingAbs) {
              const existingStudentIds = existingAbs.map(a => a.student_id);
              const idsToDelete = existingStudentIds.filter(id => !selectedAbsentees.includes(id));
              if (idsToDelete.length > 0) {
                await supabase
                  .from('absences')
                  .delete()
                  .eq('lesson_id', finalId)
                  .in('student_id', idsToDelete);
              }
              const idsToInsert = selectedAbsentees.filter(id => !existingStudentIds.includes(id));
              if (idsToInsert.length > 0) {
                const insertPayload = idsToInsert.map(sid => ({
                  student_id: sid,
                  lesson_id: finalId,
                  class_id: effectiveClassId,
                  date: selectedDate,
                  hour: currentHour,
                  status: 'PENDING',
                  teacher_id: user.id
                }));
                await supabase.from('absences').insert(insertPayload);
              }
              // For all existing or newly inserted absences for this lesson, sync updated lesson-related fields (date, hour, class_id)
              await supabase
                .from('absences')
                .update({
                  date: selectedDate,
                  hour: currentHour,
                  class_id: effectiveClassId
                })
                .eq('lesson_id', finalId);
            } else {
              // Fallback to simpler replaces if fetch error
              await supabase.from('absences').delete().eq('lesson_id', finalId);
              if (selectedAbsentees.length > 0) {
                const absencesPayload = selectedAbsentees.map(sid => ({
                  student_id: sid,
                  lesson_id: finalId,
                  class_id: effectiveClassId,
                  date: selectedDate,
                  hour: currentHour,
                  status: 'PENDING',
                  teacher_id: user.id
                }));
                await supabase.from('absences').insert(absencesPayload);
              }
            }
          } catch (syncErr) {
            console.error("Absences sync error:", syncErr);
          }
        }
      }

      await fetchAbsencesForDay();
      if (view === 'ABSENCES' && selectedWeek) {
        const { data: absData, error: absErr } = await supabase
          .from('absences')
          .select('*')
          .eq('class_id', effectiveClassId)
          .gte('date', selectedWeek.startDate)
          .lte('date', selectedWeek.endDate);
        if (!absErr) {
          setCurrentWeekAbsences(mapList(absData || [], mappers.absence));
        }
      }

      setShowLessonModal(false);
      setSelectedAbsentees([]);
      toast.success(isEditing ? 'Podaci o satu spremljeni.' : 'Sat(ovi) uspješno upisani.');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju sata');
    }
  };

  const handleSaveAbsenceEntry = async () => {
    if (!absenceEntryLesson || !user) return;
    const lesson = absenceEntryLesson;
    const selectedStudents = absenceEntrySelectedStudents;

    if (!canManageAbsencesForClass && (lesson.teacherId !== user.id || isRecordOlderThan48Hours(lesson as any))) {
      toast.error('Izostanke možete mijenjati samo za svoj sat unutar 48 sati od unosa. Nakon toga ih može mijenjati samo razrednik ili admin.');
      return;
    }
    
    console.log("OPEN ABSENCE ENTRY FOR LESSON", lesson);
    console.log("SELECTED ABSENT STUDENTS", selectedStudents);

    try {
      // 1. Fetch current absences for this lesson
      const { data: existingAbs, error: fetchErr } = await supabase
        .from('absences')
        .select('*')
        .eq('lesson_id', lesson.id);
      
      if (fetchErr) throw fetchErr;
      
      const existingStudentIds = (existingAbs || []).map(a => a.student_id);

      // 2. Identify student IDs to delete (were absent before, but are active/present now - i.e., unchecked)
      const idsToDelete = existingStudentIds.filter(id => !selectedStudents.includes(id));
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('absences')
          .delete()
          .eq('lesson_id', lesson.id)
          .in('student_id', idsToDelete);
        if (delErr) throw delErr;
      }

      // 3. Identify newly selected student IDs to insert (were unchecked before, but are checked now)
      const idsToInsert = selectedStudents.filter(id => !existingStudentIds.includes(id));
      let insertData = null;
      let insertError = null;
      let insertPayload: any[] = [];
      
      if (idsToInsert.length > 0) {
        insertPayload = idsToInsert.map(sid => ({
          student_id: sid,
          lesson_id: lesson.id,
          class_id: effectiveClassId,
          date: lesson.date,
          hour: lesson.hour,
          status: "PENDING",
          note: null,
          teacher_id: user.id
        }));

        console.log("ABSENCE INSERT PAYLOAD", insertPayload);

        const { data, error } = await supabase
          .from('absences')
          .insert(insertPayload)
          .select();

        insertData = data;
        insertError = error;

        console.log("ABSENCE INSERT ERROR", error);
        console.log("ABSENCE INSERT SUCCESS", data);

        if (error) throw error;
      } else {
        // Just logs as requested in debug section 9
        console.log("ABSENCE INSERT PAYLOAD", insertPayload);
        console.log("ABSENCE INSERT ERROR", insertError);
        console.log("ABSENCE INSERT SUCCESS", insertData);
      }

      toast.success("Izostanci su uspješno uneseni.");
      
      // 4. Refetch daily and weekly absences
      await fetchAbsencesForDay();
      if (view === 'ABSENCES' && selectedWeek) {
        const { data: absData, error: absErr } = await supabase
          .from('absences')
          .select('*')
          .eq('class_id', effectiveClassId)
          .gte('date', selectedWeek.startDate)
          .lte('date', selectedWeek.endDate);
        if (!absErr) {
          setCurrentWeekAbsences(mapList(absData || [], mappers.absence));
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Greška pri spremanju izostanaka: " + err.message);
    } finally {
      setShowAbsenceEntryModal(false);
      setAbsenceEntryLesson(null);
    }
  };

  const handleSaveAbsenceEdit = async () => {
    if (!user || absenceEditModal.selectedIds.length === 0) return;
    if (!canManageAbsencesForClass) {
      toast.error('Samo razrednik ili admin može opravdavati i mijenjati status izostanaka.');
      return;
    }
    if (!absenceEditForm.status) {
      toast.error('Odaberite status izostanka.');
      return;
    }
    if (!absenceEditForm.absenceType) {
      toast.error('Odaberite tip izostanka.');
      return;
    }
    if ((absenceEditForm.status === AbsenceStatus.UNJUSTIFIED || absenceEditForm.status === AbsenceStatus.OTHER) && !absenceEditForm.note.trim()) {
      toast.error('Za neopravdani ili ostalo izostanak upišite razlog.');
      return;
    }

    try {
      const { error } = await supabase
        .from('absences')
        .update({
          status: absenceEditForm.status,
          absence_type: absenceEditForm.absenceType,
          note: absenceEditForm.note.trim() || null,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          justified_by: user.name || user.id
        })
        .in('id', absenceEditModal.selectedIds);

      if (error) throw error;

      toast.success('Izostanci su ažurirani.');
      closeAbsenceEditModal();
      await fetchAbsencesForDay();
      if (view === 'ABSENCES' && selectedWeek && effectiveClassId) {
        const { data: absData, error: absErr } = await supabase
          .from('absences')
          .select('*')
          .eq('class_id', effectiveClassId)
          .gte('date', selectedWeek.startDate)
          .lte('date', selectedWeek.endDate);
        if (!absErr) {
          setCurrentWeekAbsences(mapList(absData || [], mappers.absence));
        }
      }
    } catch (err: any) {
      toast.error('Greška pri ažuriranju izostanka: ' + err.message);
    }
  };

  const saveExam = async () => {
    if (!effectiveClassId || !examForm.date || !examForm.subjectId) return;
    if (!examSubjectOptions.some(subject => subject.id === examForm.subjectId)) {
      toast.error(isAdminUser
        ? 'Odabrani predmet nije dodijeljen ovom razredu.'
        : 'Možete planirati provjeru samo za predmet koji predajete ovom razredu.'
      );
      return;
    }

    const examPayload = {
      subject_id: examForm.subjectId,
      exam_date: examForm.date,
      exam_type: 'PISANA',
      description: examForm.description || '',
      school_year_id: selectedYearId || (selectedClass as any)?.school_year_id || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (editingExam) {
        if (!canEditExam(editingExam)) {
          toast.error('Možete mijenjati samo provjere koje ste Vi kreirali!');
          return;
        }
        const { data, error } = await supabase
          .from('exams')
          .update({
            ...examPayload
          })
          .eq('id', editingExam.id)
          .select()
          .maybeSingle();
        if (error || !data) throw error || new Error("Exam update failed");

        setCurrentClassExams(prev => prev.map(ex => ex.id === editingExam.id ? mappers.exam(data) : ex));
        setShowExamModal(false);
        setEditingExam(null);
        setExamForm({ subjectId: '', date: '', type: 'PISANA', description: '' });
        toast.success('Pisana provjera je uspješno izmijenjena.');
      } else {
        if (!canCreateExam) {
          toast.error('Nemate ovlasti za planiranje ove provjere!');
          return;
        }
        const { data, error } = await supabase
          .from('exams')
          .insert({
            ...examPayload,
            class_id: effectiveClassId,
            created_by: user?.id,
            teacher_id: user?.id,
            created_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();
        if (error || !data) throw error || new Error("Exam creation failed");

        setCurrentClassExams(prev => [...prev, mappers.exam(data)]);
        setShowExamModal(false);
        setEditingExam(null);
        setExamForm({ subjectId: '', date: '', type: 'PISANA', description: '' });
        toast.success('Pisana provjera je uspješno planirana.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Greška pri spremanju ispita: ${err?.message || 'nepoznata greška'}`);
    }
  };

  const teachingDayNumberByDate = useMemo(() => {
    const entries = weeks
      .filter(w => w.weekType !== 'SCHOOL_HOLIDAY' && w.weekType !== 'NON_INSTRUCTIONAL' && w.isInstructional !== false)
      .flatMap(w => w.teachingDays || [])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return entries.reduce<Record<string, number>>((acc, dateStr, index) => {
      acc[dateStr] = index + 1;
      return acc;
    }, {});
  }, [weeks]);

  const getDayName = (dateStr: string) => {
    const days = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
    return days[new Date(dateStr).getDay()];
  };

  const formatWeekDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}.`;
  };

  const getWeekWorkDays = (week: WorkWeek) => {
    if (!week.startDate || !week.endDate) return [];
    const [startYear, startMonth, startDay] = week.startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = week.endDate.split('-').map(Number);
    const current = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    const days: string[] = [];

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        days.push(getLocalDateISO(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  const getWeekLessons = (week: WorkWeek) => {
    return weekOverviewLessons.filter(lesson => lesson.date >= week.startDate && lesson.date <= week.endDate);
  };

  const getWeekAbsences = (week: WorkWeek) => {
    return weekOverviewAbsences.filter(absence => absence.date >= week.startDate && absence.date <= week.endDate);
  };

  const getWeekLessonStats = (week: WorkWeek) => {
    const lessons = getWeekLessons(week);
    const held = lessons.filter(lesson => lesson.isHeld !== false).length;
    const notHeld = lessons.filter(lesson => lesson.isHeld === false).length;
    return { held, notHeld, total: lessons.length };
  };

  const getWeekAbsenceStats = (week: WorkWeek) => {
    const absences = getWeekAbsences(week);
    const justified = absences.filter(absence => absence.status === AbsenceStatus.JUSTIFIED).length;
    const unjustified = absences.filter(absence => absence.status === AbsenceStatus.UNJUSTIFIED).length;
    const other = absences.filter(absence => absence.status === AbsenceStatus.OTHER).length;
    return { justified, unjustified, other, total: absences.length };
  };

  const getShiftLabel = (shift?: string) => {
    if (shift === 'MORNING') return 'ujutro';
    if (shift === 'AFTERNOON') return 'popodne';
    if (shift === 'ALL_DAY') return 'cjelodnevna';
    return (shift || 'Ujutro').toLowerCase();
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] font-sans">
      {/* Header */}
      <div className="bg-[#005c8d] border-b border-[#004a70] px-4 py-1.5 flex items-center justify-between sticky top-0 z-10 text-white shadow-sm">
        <div className="flex items-center gap-6">
          <h2 className="text-[12px] font-bold flex items-center gap-2 uppercase tracking-tight">
            <Book size={14} />
            Dnevnik rada
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedWeek && (
            <div className="hidden md:flex items-center gap-2 text-[10px] font-bold bg-white/10 px-2.5 py-1 rounded border border-white/10 mr-2">
              <span className="text-blue-200 uppercase text-[9px] tracking-widest">Dežurni:</span>
              <span className="text-white">
                {Array.from(new Set(selectedWeek.onDutyStudentIds || [])).map(sid => {
                  const studentObj = students.find(s => s.id === sid);
                  return studentObj ? formatPersonName(studentObj) : '';
                }).filter(Boolean).join(', ') || 'Nema dežurnih'}
              </span>
            </div>
          )}

          {view === 'WEEKS' && canManageWeeks && (
            <button 
              onClick={handleAddWeek}
              className="bg-white text-[#005c8d] px-3 py-1 border border-white font-bold text-[10px] uppercase hover:bg-blue-50 transition-colors"
            >
              + Dodaj tjedan
            </button>
          )}

          {view !== 'WEEKS' && (
            <button 
              onClick={() => setView(view === 'DAY_DETAIL' ? 'WEEK_DETAIL' : 'WEEKS')}
              className="text-[10px] font-bold text-white bg-blue-700/30 px-3 py-1 border border-white/20 hover:bg-blue-700/50 uppercase flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Natrag
            </button>
          )}
        </div>
      </div>

      <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 flex items-center gap-0 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setView('WEEKS')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
            view === 'WEEKS' || view === 'WEEK_DETAIL' || view === 'DAY_DETAIL' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
          )}
        >
          <List size={12} /> Dnevnik
        </button>
        <button 
          onClick={() => setView('EXAMS')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
            view === 'EXAMS' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
          )}
        >
          <Calendar size={12} /> Ispiti
        </button>
        <button 
          onClick={() => setView('ABSENCES')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
            view === 'ABSENCES' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
          )}
        >
          <Clock size={12} /> Izostanci
        </button>
        <button 
          onClick={() => setView('SCHEDULE')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
            view === 'SCHEDULE' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
          )}
        >
          <Calendar size={12} /> Raspored
        </button>
        {canAccessLektira && (
          <button 
            onClick={() => setView('LEKTIRA')}
            className={cn(
               "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
               view === 'LEKTIRA' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
            )}
          >
            <Book size={12} /> Lektira
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#f0f2f5]">
        {/* WEEKS LIST */}
        {view === 'WEEKS' && (() => {
          const getRequiredWeeks = (cls: any) => {
            if (!cls) return 35;
            const name = (cls.name || '').trim().toUpperCase();
            const programName = (cls.program?.name || '').trim().toLowerCase();
            const gradeLevel = cls.gradeLevel;
            const durationYears = cls.program?.durationYears || cls.program?.duration_years;

            // - svi 1. razredi: 35
            if (gradeLevel === 1 || name.startsWith('1.')) return 35;
            // - svi 2. razredi: 35
            if (gradeLevel === 2 || name.startsWith('2.')) return 35;
            // - 3.D (Tehničar za ugostiteljstvo): 35
            if (name.includes('3.D') || (gradeLevel === 3 && programName.includes('ugostiteljstv'))) return 35;
            // - 4.K: 35
            if (name.includes('4.K')) return 35;

            // Ako je razred 3. (Kuhar, Konobar, Slastičar) koji traju 3 godine - oni imaju 32 tjedna.
            // 4-godišnji programi u 3. razredu imaju 35 tjedana.
            if (gradeLevel === 3 || name.startsWith('3.')) {
              if (durationYears === 4) return 35;
              if (durationYears === 3) return 32;

              // Fallback based on name if duration is not available
              if (
                programName.includes('komercijalist') || 
                programName.includes('ekonomist') || 
                programName.includes('gimnazija') ||
                programName.includes('tehničar') ||
                programName.includes('tehnicar')
              ) {
                return 35;
              }
              // By default, if it's 3.A, 3.B, 3.C and not explicitly 4-year, return 32 (assuming 3-year vocational)
              if (name.includes('3.A') || name.includes('3.B') || name.includes('3.C')) {
                // If it's literally 3.C and we know it's a 4-year program from the prompt, force 35:
                if (name.includes('3.C') && (programName.includes('komercijalist') || !programName)) {
                   return 35; 
                }
                return 32;
              }
              return 35;
            }

            // - svi završni 4. razredi osim 4.K: 32 (including 4.D, 4.I, etc.)
            if (gradeLevel === 4 || name.startsWith('4.')) {
              if (name.includes('4.K')) return 35;
              return 32;
            }

            return 35;
          };

          const requiredInstructionalWeeks = getRequiredWeeks(selectedClass);
          const actualInstructionalWeeks = weeks.filter(w => {
            if (w.weekType === 'SCHOOL_HOLIDAY') return false;
            if (w.weekType === 'NON_INSTRUCTIONAL') return false;
            return w.isInstructional !== false;
          });
          const actualInstructionalWeeksCount = actualInstructionalWeeks.length;

          const croatianHolidayNames: Record<string, string> = {
            WINTER_1: 'Zimski praznici - 1. dio',
            WINTER_2: 'Zimski praznici - 2. dio',
            SPRING: 'Proljetni praznici',
            SUMMER: 'Ljetni praznici'
          };

          const croatianReasonNames: Record<string, string> = {
            SPORTS_DAY: 'Školski športski dan',
            PROJECT_DAY: 'Projektni dan',
            EXCURSION: 'Terenska nastava / Izlet',
            HOLIDAY: 'Državni praznik / Blagdan',
            OTHER: 'Ostalo'
          };

          return (
            <div className="w-full space-y-4">
              {/* STATS SUMMARY BOX FOR INSTRUCTIONAL WEEKS */}
              <div className="bg-white border border-gray-300 p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Status školske godine (Nastavni tjedni)</h4>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black text-[#005c8d]">{actualInstructionalWeeksCount}</span>
                    <span className="text-gray-400 text-xs font-bold">/ {requiredInstructionalWeeks} tjedana</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {requiredInstructionalWeeks === 32
                      ? '🎓 Razred je prepoznat s fondom od 32 nastavna tjedna.' 
                      : '🏫 Razred je prepoznat s fondom od 35 nastavnih tjedana.'
                    }
                    {' Svi školski praznici i nenastavni tjedni izuzeti su iz ovog zbroja.'}
                  </p>
                </div>
                <div className="w-full md:w-64">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1 uppercase">
                    <span>Progres</span>
                    <span>{Math.round(Math.min(100, (actualInstructionalWeeksCount / requiredInstructionalWeeks) * 100))}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        actualInstructionalWeeksCount >= requiredInstructionalWeeks ? "bg-green-600" : "bg-[#005c8d]"
                      )}
                      style={{ width: `${Math.min(100, (actualInstructionalWeeksCount / requiredInstructionalWeeks) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {weeks.sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(w => {
                  const lessonStats = getWeekLessonStats(w);
                  const absenceStats = getWeekAbsenceStats(w);
                  const weekAbsences = getWeekAbsences(w);
                  const dutyStudents = Array.from(new Set(w.onDutyStudentIds || [])).map(sid => {
                    const studentObj = students.find(s => s.id === sid);
                    return studentObj ? formatPersonName(studentObj) : null;
                  }).filter(Boolean).join(' - ') || 'Nema dežurnih';
                  const weekDays = getWeekWorkDays(w);
                  const isSpecialWeek = w.weekType === 'SCHOOL_HOLIDAY' || w.weekType === 'NON_INSTRUCTIONAL' || w.isInstructional === false;

                  return (
                    <div key={w.id} className="bg-white border border-gray-300 shadow-sm">
                      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(520px,1fr)_300px]">
                        <div className="bg-[#d9eaf7] border-b xl:border-b-0 xl:border-r border-gray-300 min-h-[86px] flex flex-col justify-between">
                          <div className="px-3 py-2 flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-black text-gray-900 leading-tight">
                                {w.name} {getShiftLabel(w.shift)}
                              </div>
                              <div className="text-[10px] font-semibold text-gray-700 leading-tight mt-1">
                                {isSpecialWeek
                                  ? (w.weekType === 'SCHOOL_HOLIDAY'
                                      ? (croatianHolidayNames[w.holidayType || ''] || 'Školski praznici')
                                      : (croatianReasonNames[w.non_teaching_reason || ''] || w.non_teaching_reason || 'Nenastavni tjedan'))
                                  : dutyStudents}
                              </div>
                            </div>
                            {canManageWeeks && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditWeek(w);
                                }}
                                className="p-1 text-gray-500 hover:text-[#005c8d]"
                                title="Uredi radni tjedan"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                          </div>
                          <div className="border-t border-gray-300 bg-white px-3 py-1 text-[10px] text-gray-800 flex flex-wrap gap-x-3 gap-y-1">
                            <span><span className="font-bold">Sati</span></span>
                            <span>održani: {lessonStats.held}</span>
                            <span>neodržani: {lessonStats.notHeld}</span>
                            <span>ukupno: {lessonStats.total}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-5 border-b xl:border-b-0">
                          {weekDays.map(dateStr => {
                            const hasAbsence = weekAbsences.some(absence => absence.date === dateStr);
                            const teachingDayNumber = teachingDayNumberByDate[dateStr];
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => { setSelectedWeek(w); setSelectedDate(dateStr); setView('DAY_DETAIL'); }}
                                className="bg-[#f4f4f4] border-b sm:border-b-0 sm:border-r last:border-r-0 border-gray-300 px-2 py-3 text-center min-h-[72px] cursor-pointer"
                              >
                                <div className={cn("text-[11px] font-black lowercase leading-tight", hasAbsence ? "text-red-700" : "text-gray-900")}>
                                  {getDayName(dateStr).toLowerCase()}{teachingDayNumber ? ` (${teachingDayNumber})` : ''}
                                </div>
                                <div className={cn("text-[10px] font-semibold leading-tight mt-1", hasAbsence ? "text-red-700" : "text-gray-600")}>
                                  {formatWeekDate(dateStr)}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-col justify-between min-h-[86px] bg-white">
                          <div className="flex-1 flex items-center justify-end gap-2 px-3 py-2">
                            {canDeleteWeek && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteDialog({ isOpen: true, id: w.id, type: 'WEEK', loading: false });
                                }}
                                className="text-[10px] font-bold uppercase text-red-600 hover:text-red-700 flex items-center gap-1"
                                title="Obriši radni tjedan"
                              >
                                <Trash2 size={12} />
                                Obriši
                              </button>
                            )}
                          </div>
                          <div className="border-t border-gray-300 bg-white px-3 py-1 text-[10px] text-gray-800 flex flex-wrap justify-end gap-x-3 gap-y-1">
                            <span>Opravdano: {absenceStats.justified}</span>
                            <span>Neopravdano: {absenceStats.unjustified}</span>
                            <span>Ostalo: {absenceStats.other}</span>
                            <span>Ukupno: {absenceStats.total}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {weeks.length === 0 && (
                  <div className="bg-white border border-gray-300 p-12 text-center text-gray-400 italic shadow-sm">
                    Nema upisanih radnih tjedana.
                  </div>
                )}
              </div>
          </div>
        );
      })()}

        {view === 'WEEK_DETAIL' && !selectedWeek && (
          <div className="w-full bg-white border border-gray-300 p-8 text-center shadow-sm">
            <h3 className="text-gray-500 font-bold uppercase text-[11px] mb-2">Nema odabranog tjedna</h3>
            <p className="text-gray-400 text-xs mb-4">Trenutno ne postoji niti jedan radni tjedan u bazi za ovaj razred. Molimo dodajte tjedan u pregledu rada.</p>
            <button onClick={() => setView('WEEKS')} className="mx-auto block px-4 py-2 bg-[#005c8d] text-white font-bold uppercase text-[10px]">
              Prebaci na Pregled rada
            </button>
          </div>
        )}

        {/* WEEK DETAIL - List of Days */}
        {view === 'WEEK_DETAIL' && selectedWeek && (
          <div className="w-full">
            <div className="bg-white border border-gray-300 shadow-sm">
               <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight flex items-center justify-between">
                  <span>{selectedWeek.name} - Radni dani</span>
               </div>
               <table className="w-full text-left border-collapse text-[12px] ed-table-dense">
                 <tbody className="divide-y divide-gray-200">
                   {(selectedWeek.teachingDays || []).map(dateStr => {
                     const isToday = dateStr === getLocalDateISO();
                     return (
                     <tr
                       key={dateStr}
                       onClick={() => { setSelectedDate(dateStr); setView('DAY_DETAIL'); }}
                       className={cn(
                         "group cursor-pointer",
                         isToday ? "bg-red-50 hover:bg-red-100" : "hover:bg-[#eff6ff]"
                       )}
                     >
                       <td className={cn(
                         "px-4 py-2 w-20 align-middle border-r border-gray-200",
                         isToday ? "bg-red-100/80 border-red-200" : "bg-gray-100/30"
                       )}>
                          <div className="flex flex-col items-center">
                             <div className={cn("text-[9px] font-bold uppercase leading-none mb-1", isToday ? "text-red-700" : "text-[#005c8d]")}>{new Date(dateStr).toLocaleDateString('hr-HR', { month: 'short' })}</div>
                             <div className={cn("text-xl font-bold leading-none", isToday ? "text-red-700" : "text-gray-700")}>{new Date(dateStr).getDate()}.</div>
                          </div>
                       </td>
                       <td className="px-4 py-2">
                          <div className={cn("text-[13px] font-bold uppercase tracking-tight group-hover:underline", isToday ? "text-red-700" : "text-[#005c8d]")}>{getDayName(dateStr)}</div>
                          <div className={cn("text-[10px] font-bold uppercase", isToday ? "text-red-500" : "text-gray-400")}>{dateStr}</div>
                       </td>
                       <td className="px-4 py-2 text-right">
                          <div className={cn("text-[10px] font-bold", isToday ? "text-red-700" : "text-gray-500")}>
                             {dailyLessons.filter(l => l.date === dateStr).length} sati upisano
                          </div>
                       </td>
                       <td className="px-4 py-2 text-center w-10 border-l border-gray-200">
                          <ChevronRight size={14} className={cn("text-gray-300", isToday ? "group-hover:text-red-700" : "group-hover:text-[#005c8d]")} />
                       </td>
                     </tr>
                     );
                   })}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {/* ABSENCES WEEKLY VIEW */}
        {view === 'ABSENCES' && selectedClass && (
          <div className="w-full">
             {(() => {
               const absenceDate = selectedDate || selectedWeek?.teachingDays?.[0] || '';
               const dayAbsences = currentWeekAbsences.filter(abs => abs.date === absenceDate);
               const absencePeriods = Array.from({ length: 13 }, (_, index) => index);
               const firstLessonForDay = dailyLessons[0];
               return (
             <div className="space-y-2">
               <div className="flex items-center justify-between bg-white border border-gray-300 px-3 py-2">
                 <div className="flex items-center gap-4 text-[11px]">
                   <div className="font-bold">
                     <div>{selectedWeek?.name || 'Radni tjedan'}</div>
                     <div className="text-gray-500 font-medium normal-case">{selectedWeek?.shift || ''}</div>
                   </div>
                   <div className="h-8 border-l border-gray-200" />
                   <button
                     type="button"
                     onClick={() => {
                       const days = selectedWeek?.teachingDays || [];
                       const idx = days.indexOf(absenceDate);
                       if (idx > 0) setSelectedDate(days[idx - 1]);
                     }}
                     disabled={!selectedWeek || (selectedWeek.teachingDays || []).indexOf(absenceDate) <= 0}
                     className="p-1.5 bg-[#005c8d] text-white disabled:bg-gray-300"
                   >
                     <ArrowLeft size={14} />
                   </button>
                   <div className="font-bold text-center">
                     <div>{absenceDate ? getDayName(absenceDate).toLowerCase() : 'dan'}</div>
                     <div className="text-gray-500 font-medium">{absenceDate ? new Date(absenceDate).toLocaleDateString('hr-HR') : ''}</div>
                   </div>
                   <button
                     type="button"
                     onClick={() => {
                       const days = selectedWeek?.teachingDays || [];
                       const idx = days.indexOf(absenceDate);
                       if (idx >= 0 && idx < days.length - 1) setSelectedDate(days[idx + 1]);
                     }}
                     disabled={!selectedWeek || (selectedWeek.teachingDays || []).indexOf(absenceDate) >= (selectedWeek.teachingDays || []).length - 1}
                     className="p-1.5 bg-[#005c8d] text-white disabled:bg-gray-300"
                   >
                     <ArrowRight size={14} />
                   </button>
                 </div>
                 <button
                   type="button"
                   onClick={() => {
                     if (firstLessonForDay) {
                       openAbsenceEntryForLesson(firstLessonForDay);
                     } else {
                       toast.error('Za ovaj dan prvo unesite nastavni sat.');
                     }
                   }}
                   className="px-3 py-1.5 bg-[#005c8d] text-white text-[10px] font-bold"
                 >
                   Unesi izostanak
                 </button>
               </div>

             <div className="bg-white border border-gray-300 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full border-collapse min-w-[900px] ed-table-dense">
                  <thead>
                    <tr className="bg-[#eaf4fb] border-b border-gray-300">
                       <th colSpan={15} className="p-1 text-center text-[10px] font-bold uppercase text-slate-800 border-r border-gray-300">Izostanci učenika</th>
                       <th rowSpan={2} className="p-2 text-center text-[10px] font-bold uppercase text-slate-800 border-r border-gray-300">Razlog izostanka</th>
                       <th colSpan={2} className="p-1 text-center text-[10px] font-bold uppercase text-slate-800">Izostali sati</th>
                    </tr>
                    <tr className="bg-white border-b border-gray-300">
                       <th className="p-2 text-left text-[10px] font-bold text-slate-800 border-r border-gray-300">Prezime i ime</th>
                       <th className="p-2 text-center text-[10px] font-bold text-slate-800 border-r border-gray-300">Sati</th>
                       {absencePeriods.map(hour => (
                         <th key={`absence-hour-${hour}`} className="w-8 p-1 text-center text-[10px] font-bold text-slate-800 border-r border-gray-300">{hour}</th>
                       ))}
                       <th className="w-14 p-2 text-center text-[10px] font-bold text-slate-800 border-r border-gray-300">oprav.</th>
                       <th className="w-14 p-2 text-center text-[10px] font-bold text-slate-800">neoprav.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={18} className="p-12 text-center text-gray-400 italic">Nema učenika u razredu.</td>
                      </tr>
                    )}
                    {sortStudentsBySurname(students).map(s => {
                      const studentAbsences = dayAbsences.filter(abs => abs.studentId === s.id);
                      const justified = studentAbsences.filter(abs => abs.status === AbsenceStatus.JUSTIFIED).length;
                      const unjustified = studentAbsences.filter(abs => abs.status === AbsenceStatus.UNJUSTIFIED).length;
                      const reason = studentAbsences
                        .map(abs => [abs.absenceType, abs.note].filter(Boolean).join(' - '))
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <tr key={`absence-row-${s.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="p-2 font-bold text-gray-700 bg-gray-50/20 border-r border-gray-200">
                            {studentAbsences.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => openAbsenceEditModal(s.id, studentAbsences)}
                                className="text-left hover:text-[#005c8d] hover:underline"
                                title="Uredi sve izostanke učenika za ovaj dan"
                              >
                                {formatPersonName(s)}
                              </button>
                            ) : (
                              formatPersonName(s)
                            )}
                          </td>
                          <td className="p-1 text-center text-gray-400 border-r border-gray-200">/</td>
                          {absencePeriods.map(hour => {
                            const absence = studentAbsences.find(abs => Number(abs.hour) === hour);
                            return (
                              <td key={`absence-cell-${s.id}-${hour}`} className="p-1 text-center border-r border-gray-200">
                                {absence ? (
                                  <button
                                    type="button"
                                    onClick={() => openAbsenceEditModal(s.id, [absence])}
                                    className={cn("w-8 h-8 border text-sm font-bold leading-none hover:ring-2 hover:ring-[#005c8d]/30", getAbsenceStatusCellClass(absence.status))}
                                    title={`${hour}. sat - ${getAbsenceStatusShortLabel(absence.status)}`}
                                  >
                                    {hour}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">/</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center text-[10px] border-r border-gray-200">{reason || ''}</td>
                          <td className="p-2 text-center border-r border-gray-200">{justified}</td>
                          <td className="p-2 text-center">{unjustified}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
             </div>
             </div>
               );
             })()}
          </div>
        )}
        {view === 'ABSENCES' && !selectedClass && (
           <div className="w-full bg-white border border-gray-300 p-8 text-center text-gray-500 font-bold uppercase text-xs">
             Molimo odaberite razred za pregled izostanaka.
           </div>
        )}

        {/* EXAMS VIEW */}

        {view === 'EXAMS' && selectedClass && (
          <div className="w-full">
             <div className="bg-white border border-gray-300 shadow-sm overflow-hidden">
                <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight flex items-center justify-between">
                   <span>Plan pisanih provjera</span>
                   {canCreateExam && (
                     <button 
                       onClick={() => {
                         setEditingExam(null);
                         setExamForm({ subjectId: '', date: '', type: 'PISANA', description: '' });
                         setShowExamModal(true);
                       }}
                       className="bg-[#005c8d] text-white px-3 py-1 font-bold text-[10px] uppercase hover:bg-[#004a70]"
                     >
                       + Planiraj provjeru
                     </button>
                   )}
                </div>
                {/* Mobile View for Exams */}
                <div className="md:hidden space-y-2 p-3 bg-slate-50/50">
                  {currentClassExams.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(exam => {
                    const subject = allSubjects.find(s => s.id === exam.subjectId);
                    return (
                      <div key={exam.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-500">
                            {new Date(exam.date).toLocaleDateString('hr-HR')}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-[#005c8d] uppercase">{formatSubjectName(subject)}</div>
                        <div className="text-xs text-slate-600 italic">Opis: {exam.description}</div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                          {canEditExam(exam) && (
                            <button 
                              onClick={() => {
                                setEditingExam(exam);
                                setExamForm({
                                  subjectId: exam.subjectId,
                                  date: exam.date ? String(exam.date).split('T')[0] : '',
                                  type: exam.type,
                                  description: exam.description || ''
                                });
                                setShowExamModal(true);
                              }}
                              className="text-[#005c8d] hover:text-[#004a71] text-xs font-bold"
                            >
                              Uredi
                            </button>
                          )}
                          {canDeleteExam(exam) && (
                            <button 
                              onClick={() => setDeleteDialog({ isOpen: true, id: exam.id, type: 'EXAM', loading: false })}
                              className="text-red-600 hover:text-red-800 text-xs font-bold"
                            >
                              Obriši
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {currentClassExams.length === 0 && (
                    <div className="p-8 text-center text-slate-300 font-bold text-xs uppercase bg-white border border-slate-200 rounded-lg">Nema planiranih provjera.</div>
                  )}
                </div>

                {/* Desktop View for Exams */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse ed-table-dense">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-300">
                        <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Datum</th>
                        <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Predmet</th>
                        <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500">Opis</th>
                        <th className="p-2 text-center w-36 text-[10px] font-bold uppercase text-gray-500">Akcije</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                       {currentClassExams.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(exam => {
                         const subject = allSubjects.find(s => s.id === exam.subjectId);
                         return (
                           <tr key={exam.id} className="hover:bg-gray-50 transition-colors">
                             <td className="p-2 text-gray-700 font-bold border-r border-gray-200">{new Date(exam.date).toLocaleDateString('hr-HR')}</td>
                             <td className="p-2 font-bold text-[#005c8d] uppercase border-r border-gray-200">{formatSubjectName(subject)}</td>
                             <td className="p-2 text-gray-600 border-r border-gray-300">{exam.description}</td>
                             <td className="p-2 text-center h-full">
                               <div className="flex items-center justify-center gap-2">
                                 {canEditExam(exam) && (
                                   <button 
                                     onClick={() => {
                                       setEditingExam(exam);
                                       setExamForm({
                                         subjectId: exam.subjectId,
                                         date: exam.date ? String(exam.date).split('T')[0] : '',
                                         type: exam.type,
                                         description: exam.description || ''
                                       });
                                       setShowExamModal(true);
                                     }}
                                     className="text-[#005c8d] hover:text-[#004a71] p-1 flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all"
                                     title="Uredi"
                                   >
                                     <Edit2 size={12} />
                                     <span>Uredi</span>
                                   </button>
                                 )}
                                 {canDeleteExam(exam) && (
                                   <button 
                                     onClick={() => setDeleteDialog({ isOpen: true, id: exam.id, type: 'EXAM', loading: false })}
                                     className="text-red-500 hover:text-red-700 p-1 flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all"
                                     title="Obriši"
                                   >
                                     <Trash2 size={12} />
                                     <span>Obriši</span>
                                   </button>
                                 )}
                                 {!canEditExam(exam) && !canDeleteExam(exam) && (
                                   <span className="text-gray-400 text-[10px] italic">Nema ovlasti</span>
                                  )}
                               </div>
                             </td>
                           </tr>
                         );
                       })}
                       {currentClassExams.length === 0 && (
                         <tr>
                           <td colSpan={5} className="p-12 text-center text-gray-400 italic">Nema planiranih provjera.</td>
                         </tr>
                       )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        )}
        {view === 'EXAMS' && !selectedClass && (
           <div className="w-full bg-white border border-gray-300 p-8 text-center text-gray-500 font-bold uppercase text-xs">
             Molimo odaberite razred za pregled ispita.
           </div>
        )}

        {/* SCHEDULE VIEW */}
        {view === 'SCHEDULE' && selectedClass && (
          <div className="w-full space-y-8 pb-20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-[#005c8d] uppercase tracking-tight">Tjedni raspored sati</h3>
              <div className="bg-yellow-50 border border-yellow-200 px-3 py-1 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-yellow-400" />
                 <span className="text-[10px] font-bold text-yellow-700 uppercase">Kontrola satnice aktivna</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-1 gap-12">
               <ScheduleGrid 
                 title="SMJENA A: JUTARNJA" 
                 shift="MORNING" 
                 periods={morningPeriods} 
                 days={days} 
                 onCellClick={(day: string, period: number) => {
                    if (canManageClass) {
                      setEditingCell({ dayOfWeek: day, shift: 'MORNING', periodNumber: period });
                      setShowScheduleModal(true);
                    }
                 }}
                 getCellSubjects={getCellSubjects}
                 allSubjects={allSubjects}
                 teachers={teachers}
                 readOnly={!canManageClass}
               />

               <ScheduleGrid 
                 title="SMJENA B: POPODNEVNA" 
                 shift="AFTERNOON" 
                 periods={afternoonPeriods} 
                 days={days} 
                 onCellClick={(day: string, period: number) => {
                    if (canManageClass) {
                      setEditingCell({ dayOfWeek: day, shift: 'AFTERNOON', periodNumber: period });
                      setShowScheduleModal(true);
                    }
                 }}
                 getCellSubjects={getCellSubjects}
                 allSubjects={allSubjects}
                 teachers={teachers}
                 readOnly={!canManageClass}
               />
            </div>

            {/* Curriculum Comparison Warning */}
            <div className="bg-white border border-gray-300">
               <div className="bg-gray-50 border-b border-gray-300 px-4 py-2 font-bold text-gray-500 text-[11px] uppercase tracking-tight">Analiza usklađenosti s nastavnim planom</div>
               <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {curriculumPlans.map(plan => {
                    const subject = allSubjects.find(s => s.id === plan.subjectId);
                    // Count total occurrences in both shifts in schedule
                    const count = scheduleSubjects.filter(ss => ss.subjectId === plan.subjectId).length;
                    const diff = count - plan.weeklyHours;
                    const isMismatch = diff !== 0;

                    return (
                      <div key={plan.id} className={cn(
                        "p-3 border-l-4 flex items-center justify-between",
                        isMismatch ? "bg-red-50 border-red-500" : "bg-green-50 border-green-500"
                      )}>
                        <div>
                          <div className="text-[10px] font-black uppercase text-gray-700">{formatSubjectName(subject)}</div>
                          <div className="text-[9px] font-bold text-gray-500 mt-0.5">
                            Planirano: {plan.weeklyHours}h | U rasporedu: {count}h
                          </div>
                        </div>
                        {isMismatch ? (
                          <div className="text-right">
                             <div className="text-[10px] font-black text-red-600 uppercase">
                               {diff > 0 ? `Višak (+${diff})` : `Manjak (${diff})`}
                             </div>
                             <XCircle size={14} className="text-red-500 ml-auto mt-1" />
                          </div>
                        ) : (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                      </div>
                    );
                  })}
                  {curriculumPlans.length === 0 && (
                    <div className="col-span-full p-4 text-center text-gray-400 text-[10px] font-black uppercase italic">
                      Nema definiranih planova za ovaj razredni odjel.
                    </div>
                  )}
               </div>
               
               {curriculumPlans.some(p => scheduleSubjects.filter(ss => ss.subjectId === p.subjectId).length !== p.weeklyHours) && (
                 <div className="bg-red-600 text-white p-3 flex items-center gap-3 animate-pulse">
                    <XCircle size={20} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Upozorenje: Detektirana su odstupanja u tjednoj satnici!</span>
                 </div>
               )}
            </div>
          </div>
        )}
        {view === 'SCHEDULE' && !selectedClass && (
           <div className="w-full bg-white border border-gray-300 p-8 text-center text-gray-500 font-bold uppercase text-xs">
             Molimo odaberite razred za pregled rasporeda.
           </div>
        )}

        {/* LEKTIRA VIEW */}
        {view === 'LEKTIRA' && selectedClass && canAccessLektira && (
          <div className="w-full space-y-4">
            <div className="flex justify-between items-center bg-white p-3 border border-gray-300 shadow-sm">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Evidencija lektira ({lektire.length})
              </span>
              <button
                onClick={() => {
                  setEditingLektira(null);
                  setLektiraForm({
                    subjectId: getHrvatskiJezikSubjectId(),
                    completedDate: getLocalDateISO(),
                    title: '',
                    processingDetails: ''
                  });
                  setShowLektiraModal(true);
                }}
                className="bg-[#005c8d] text-white px-4 py-2 hover:bg-[#004a71] text-[10px] font-black uppercase tracking-wider shadow cursor-pointer active:scale-95 transition-all"
              >
                + Dodaj lektiru
              </button>
            </div>

            {/* Mobile Cards for Readings */}
            <div className="md:hidden space-y-2 p-3 bg-slate-50/50">
              {lektire.map((lek) => {
                const subject = allSubjects.find(s => s.id === lek.subjectId || s.id === lek.subject_id);
                return (
                  <div key={lek.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-[#005c8d] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded">
                        {formatSubjectName(subject || { name: 'Hrvatski jezik' })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">
                        Obrada: {(() => {
                          if (!lek.processed_at) return '—';
                          try {
                            const d = new Date(lek.processed_at);
                            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('hr-HR');
                          } catch {
                            return '—';
                          }
                        })()}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-800">{lek.title}</div>
                    <div className="text-xs text-slate-600 italic whitespace-pre-wrap">{lek.processing_details || '—'}</div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setEditingLektira(lek);
                          let processedDateString = '';
                          if (lek.processed_at) {
                            try {
                              const d = new Date(lek.processed_at);
                              if (!isNaN(d.getTime())) {
                                processedDateString = getLocalDateISO(d);
                              }
                            } catch (e) {
                              console.error('Error parsing processed_at date:', e);
                            }
                          }
                          setLektiraForm({
                            subjectId: lek.subject_id || lek.subjectId || '',
                            completedDate: processedDateString,
                            title: lek.title,
                            processingDetails: lek.processing_details || ''
                          });
                          setShowLektiraModal(true);
                        }}
                        className="text-[#005c8d] hover:text-[#004a71] text-xs font-bold"
                      >
                        Uredi
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteReading(lek);
                        }}
                        className="text-red-600 hover:text-red-800 text-xs font-bold"
                      >
                        Obriši
                      </button>
                    </div>
                  </div>
                );
              })}
              {lektire.length === 0 && (
                <div className="p-8 text-center text-slate-300 font-bold text-xs uppercase bg-white border border-slate-200 rounded-lg">Nema unesenih lektira za ovaj razred.</div>
              )}
            </div>

            {/* Desktop View for Readings */}
            <div className="hidden md:block bg-white border border-gray-300 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="p-3 border-r border-gray-200">Predmet</th>
                    <th className="p-3 border-r border-gray-200">Datum unosa / uređenja</th>
                    <th className="p-3 border-r border-gray-200">Datum obrade</th>
                    <th className="p-3 border-r border-gray-200">Naslov djela / članka</th>
                    <th className="p-3 border-r border-gray-200">Način obrade / detalji</th>
                    <th className="p-3 w-20 text-center">Akcije</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium">
                  {lektire.map((lek) => {
                    const subject = allSubjects.find(s => s.id === lek.subjectId || s.id === lek.subject_id);
                    return (
                      <tr key={lek.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 border-r border-gray-200 font-bold uppercase text-[#005c8d]">
                          {formatSubjectName(subject || { name: 'Hrvatski jezik' })}
                        </td>
                        <td className="p-3 border-r border-gray-200 text-slate-500">
                          {lek.updated_at 
                            ? new Date(lek.updated_at).toLocaleDateString('hr-HR') 
                            : lek.created_at 
                            ? new Date(lek.created_at).toLocaleDateString('hr-HR') 
                            : '—'}
                        </td>
                        <td className="p-3 border-r border-gray-200">
                          {(() => {
                            if (!lek.processed_at) return '—';
                            try {
                              const d = new Date(lek.processed_at);
                              return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('hr-HR');
                            } catch {
                              return '—';
                            }
                          })()}
                        </td>
                        <td className="p-3 border-r border-gray-200 font-semibold text-slate-800">
                          {lek.title}
                        </td>
                        <td className="p-3 border-r border-gray-200 text-slate-600 whitespace-pre-wrap">
                          {lek.processing_details || '—'}
                        </td>
                        <td className="p-3 text-center flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingLektira(lek);
                              let processedDateString = '';
                              if (lek.processed_at) {
                                try {
                                  const d = new Date(lek.processed_at);
                                  if (!isNaN(d.getTime())) {
                                    processedDateString = getLocalDateISO(d);
                                  }
                                } catch (e) {
                                  console.error('Error parsing processed_at date:', e);
                                }
                              }
                              setLektiraForm({
                                subjectId: lek.subject_id || lek.subjectId || '',
                                completedDate: processedDateString,
                                title: lek.title,
                                processingDetails: lek.processing_details || ''
                              });
                              setShowLektiraModal(true);
                            }}
                            className="text-[#005c8d] hover:text-[#004a71]"
                            title="Uredi"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("DELETE BUTTON CLICKED", lek.id);
                              handleDeleteReading(lek);
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-sm text-[10px] tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-red-200 shadow-sm"
                            title="Obriši"
                          >
                            <Trash2 size={12} className="pointer-events-none" />
                            <span>Obriši</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {lektire.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-gray-400 italic">
                        Nema unesenih lektira za ovaj razred.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

          {view === 'LEKTIRA' && !selectedClass && canAccessLektira && (
             <div className="w-full bg-white border border-gray-300 p-8 text-center text-gray-500 font-bold uppercase text-xs">
               Molimo odaberite razred za prikaz lektire.
             </div>
          )}

        {/* LEKTIRA MODAL */}
        {showLektiraModal && canAccessLektira && (
          <div className="fixed inset-0 bg-black/45 z-55 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="bg-[#005c8d] p-3 text-white flex items-center justify-between shrink-0">
                <h3 className="text-xs font-extrabold uppercase tracking-widest">
                  {editingLektira ? 'UREDI LEKTIRU/DJELO' : 'DODAJ NOVU LEKTIRU'}
                </h3>
                <button 
                  onClick={() => setShowLektiraModal(false)} 
                  className="text-white hover:text-red-200"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateOrUpdateLektira} className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Naslov djela / članka *</label>
                  <input
                    type="text"
                    required
                    value={lektiraForm.title}
                    onChange={(e) => setLektiraForm({...lektiraForm, title: e.target.value})}
                    className="w-full border border-gray-300 p-2.5 rounded font-semibold text-slate-800"
                    placeholder="Npr. Hamlet, Patnje mladog Werthera..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Datum obrade *</label>
                  <input
                    type="date"
                    required
                    value={lektiraForm.completedDate}
                    onChange={(e) => setLektiraForm({...lektiraForm, completedDate: e.target.value})}
                    className="w-full border border-gray-300 p-2.5 rounded font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Kako je obrađeno / Detalji</label>
                  <textarea
                    rows={3}
                    value={lektiraForm.processingDetails}
                    onChange={(e) => setLektiraForm({...lektiraForm, processingDetails: e.target.value})}
                    className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                    placeholder="Npr. Interpretacija likova, okrugli stol, rasprava..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowLektiraModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-gray-100 cursor-pointer"
                  >
                    Odustani
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingLektira}
                    className={`px-5 py-2 bg-[#005c8d] text-white hover:bg-[#004a71] text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer shadow-md ${isSavingLektira ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSavingLektira ? 'Spremanje...' : 'Spremi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DAY DETAIL VIEW - REDESIGNED TABLE */}
        {view === 'DAY_DETAIL' && effectiveClassId && selectedDate && selectedWeek && (
          <div className="w-full space-y-3">
            {/* Navigacija i dežurni */}
            <div className="flex items-center justify-between border border-gray-300 bg-white p-2">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    const idx = (selectedWeek.teachingDays || []).indexOf(selectedDate);
                    if (idx > 0) setSelectedDate((selectedWeek.teachingDays || [])[idx-1]);
                  }}
                  disabled={(selectedWeek.teachingDays || []).indexOf(selectedDate) === 0}
                  className="p-1 border border-gray-300 text-[#005c8d] hover:bg-gray-100 disabled:opacity-20 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex flex-col">
                  <h3 className="text-[12px] font-black text-gray-800 uppercase tracking-tight leading-none">{getDayName(selectedDate)}, {new Date(selectedDate).toLocaleDateString('hr-HR')}</h3>
                </div>
                <button 
                  onClick={() => {
                    const idx = (selectedWeek.teachingDays || []).indexOf(selectedDate);
                    if (idx < (selectedWeek.teachingDays || []).length - 1) setSelectedDate((selectedWeek.teachingDays || [])[idx+1]);
                  }}
                  disabled={(selectedWeek.teachingDays || []).indexOf(selectedDate) === (selectedWeek.teachingDays || []).length - 1}
                  className="p-1 border border-gray-300 text-[#005c8d] hover:bg-gray-100 disabled:opacity-20 transition-colors"
                >
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-bold">
                <span className="text-gray-400 uppercase text-[9px] tracking-widest">Dežurni:</span>
                <span className="text-[#005c8d]">
                  {Array.from(new Set(selectedWeek?.onDutyStudentIds || [])).map(sid => {
                    const studentObj = students.find(s => s.id === sid);
                    return studentObj ? formatPersonName(studentObj) : '';
                  }).filter(Boolean).join(', ') || 'Nema dežurnih'}
                </span>
              </div>
            </div>

            {/* KOMPAKTNA TABLICA - e-Dnevnik Stil */}
            <div className="bg-white border border-gray-300 shadow-sm overflow-hidden">
              <table className="w-full border-collapse table-fixed ed-table-dense">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 text-gray-500 text-[10px] uppercase font-bold tracking-tight">
                    <th className="w-12 border-r border-gray-300 p-2 text-center">Sat</th>
                    <th className="border-r border-gray-300 p-2 text-center">Sadržaj nastavnog sata</th>
                    <th className="w-10 border-r border-gray-300 p-2 text-center">
                      <UserX size={13} className="mx-auto text-slate-800" />
                    </th>
                    <th className="border-r border-gray-300 p-2 text-left w-64">Napomena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const activePeriods = getActivePeriodsForWeek();
                    return activePeriods.map(hour => {
                      const lessons = dailyLessons.filter(l => l.hour === hour);
                      const isOccupied = lessons.length > 0;
                      const scheduledSubjs = getScheduledSubjectsForNow(hour);
                      const hasSchedule = scheduledSubjs.length > 0;
                      
                      return (
                        <tr key={hour} className="group hover:bg-[#f0f9ff] transition-colors min-h-[40px]">
                          <td className="border-r border-gray-200 p-2 text-center align-middle bg-gray-50/20">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-sm font-bold text-[#005c8d]">{hour}.</span>
                              {hasSchedule && (
                                <div className="relative group/hint flex items-center">
                                  <button 
                                    onClick={() => {
                                      const first = scheduledSubjs.find(ss => canTeachSubjectInClass(ss.subjectId));
                                      openLessonModal(hour, undefined, {
                                        subjectId: first?.subjectId || '',
                                        teacherId: first?.teacherId || (user?.id || '')
                                      });
                                    }}
                                    className="text-[#005c8d]/30 hover:text-[#005c8d] transition-colors cursor-pointer"
                                  >
                                    <List size={10} strokeWidth={3} />
                                    <div className="absolute left-full ml-1 px-2 py-1 bg-gray-800 text-white text-[8px] rounded opacity-0 group-hover/hint:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                     {scheduledSubjs.map(ss => formatSubjectName(allSubjects.find(s=>s.id===ss.subjectId))).join(', ')}
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="border-r border-gray-200 p-2 align-middle overflow-hidden">
                            <div className="flex flex-col gap-2">
                              {isOccupied ? (
                                lessons.map((lesson, idx) => {
                                  const sub = allSubjects.find(s => s.id === lesson.subjectId);
                                  const teacher = teachers.find(t => t.id === lesson.teacherId);
                                  const canEdit = isAdminUser || lesson.teacherId === user?.id;
                                  const lessonAbsences = dailyAbsences.filter(a => a.lessonId === lesson.id);
                                  
                                  return (
                                    <div key={lesson.id} className={cn("text-[11px] leading-tight flex flex-col gap-1 pl-1 border-l-4 border-[#005c8d]", idx > 0 && "pt-2 border-t border-gray-100")}>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 animate-fadeIn">
                                          <div className="font-bold text-[#005c8d] uppercase mb-0.5">
                                            [{lesson.hour}] {formatSubjectName(sub || { name: 'Predmet' })} - {lesson.teacherDisplayName && !lesson.teacherDisplayName.includes('undefined') ? lesson.teacherDisplayName : (teacher ? formatPersonName(teacher) : 'Nepoznat nastavnik')}
                                            {lesson.groupName && ['GROUP_A', 'GROUP_B'].includes(lesson.groupName.toUpperCase()) ? <span className="text-gray-400 font-normal italic ml-1">({lesson.groupName === 'GROUP_A' ? 'Grupa A' : 'Grupa B'})</span> : (
                                              (lesson.groupName === 'grupa a' || lesson.groupName === 'Grupa A') ? <span className="text-gray-400 font-normal italic ml-1">(Grupa A)</span> :
                                              (lesson.groupName === 'grupa b' || lesson.groupName === 'Grupa B') ? <span className="text-gray-400 font-normal italic ml-1">(Grupa B)</span> : ''
                                            )}
                                            {!lesson.isHeld && " - SAT NIJE ODRŽAN"}
                                          </div>
                                          {lesson.topic ? (
                                            <div className="text-[10px] text-gray-500 italic whitespace-pre-wrap leading-snug">
                                              {lesson.topic}
                                            </div>
                                          ) : null}
  
                                        </div>
                                      </div>
                                      
                                      {canEdit && (
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button 
                                            onClick={() => openLessonModal(hour, lesson)}
                                            className="px-2 py-1 bg-[#005c8d] text-white font-bold text-[10px] hover:bg-[#004a70]"
                                            title="Uredi"
                                          >
                                            Uredi
                                          </button>
                                          <button 
                                            onClick={(e) => handleLessonDelete(e, lesson.id)}
                                            className="px-2 py-1 bg-red-600 text-white font-bold text-[10px] hover:bg-red-700"
                                            title="Obriši"
                                          >
                                            Obriši
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                );
                              })
                            ) : null}
                            
                            {isOccupied && (
                              <button 
                                onClick={() => openLessonModal(hour)}
                                className="text-[10px] font-bold text-[#005c8d] uppercase mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                + Dodaj grupu
                              </button>
                            )}

                            {!isOccupied && (
                              <button 
                                onClick={() => openLessonModal(hour)}
                                className="text-[10px] font-bold text-gray-300 uppercase tracking-tight hover:text-[#005c8d] transition-colors w-full text-left py-1 italic"
                              >
                                + Upiši nastavni sat
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="border-r border-gray-200 p-2 align-middle text-center">
                          {lessons.length > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              {lessons.map(lesson => {
                                const lessonAbsences = dailyAbsences.filter(a => a.lessonId === lesson.id);
                                const canEdit = isAdminUser || lesson.teacherId === user?.id;
                                return (
                                  <button
                                    key={`absence-action-${lesson.id}`}
                                    type="button"
                                    onClick={() => canEdit && openAbsenceEntryForLesson(lesson)}
                                    disabled={!canEdit}
                                    className={cn(
                                      "relative w-6 h-6 inline-flex items-center justify-center border text-slate-500",
                                      canEdit ? "hover:border-[#005c8d] hover:text-[#005c8d] bg-white" : "opacity-40 cursor-not-allowed",
                                      lessonAbsences.length > 0 && "border-red-300 text-red-700 bg-red-50"
                                    )}
                                    title="Unesi izostanak"
                                  >
                                    <UserX size={13} />
                                    {lessonAbsences.length > 0 && (
                                      <span className="absolute -right-1 -top-1 min-w-3 h-3 px-0.5 rounded-full bg-red-600 text-white text-[7px] leading-3 font-bold">
                                        {lessonAbsences.length}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </td>
                        <td className="border-r border-gray-200 p-2 align-middle text-[10px] text-gray-400 italic leading-tight">
                          {isOccupied ? (
                            <div className="flex flex-col gap-2">
                              {lessons.map((l, idx) => (
                                <div key={`note-${l.id}`} className={cn(idx > 0 && "pt-2 border-t border-transparent")}>
                                  {l.notes || '--'}
                                </div>
                              ))}
                            </div>
                          ) : '--'}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-4 p-2">
               <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
                  <div className="w-2 h-2 rounded bg-[#005c8d]/20"></div>
                  <span>Kliknite na redak ili ikonu za promjenu podataka</span>
               </div>
            </div>

            {/* DNEVNE NAPOMENE PANEL */}
            <div className="bg-white border border-gray-300 p-5 mt-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3 mb-4">
                <Edit2 size={16} className="text-[#005c8d]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">DNEVNE NAPOMENE (Dnevnik rada)</h3>
              </div>

              {/* Add daily note form */}
              <form onSubmit={handleCreateDailyNote} className="flex gap-3 mb-5 shrink-0">
                <input 
                  type="text"
                  placeholder="Dodaj novu dnevnu napomenu..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="flex-1 border border-gray-300 px-3 py-2 text-xs rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-[#005c8d]"
                />
                <button 
                  type="submit"
                  className="bg-[#005c8d] text-white px-5 py-2 hover:bg-[#004a71] text-[10px] font-black uppercase tracking-wider shadow active:scale-95 transition-all cursor-pointer"
                >
                  Dodaj
                </button>
              </form>

              {/* Daily notes list */}
              {dailyNotes.length === 0 ? (
                <p className="text-xs text-slate-400 italic font-medium py-3 text-center border border-dashed border-gray-200 rounded">Nema upisanih dnevnih napomena za ovaj dan.</p>
              ) : (
                <div className="space-y-3">
                  {dailyNotes.map((note) => {
                    const isAuthor = note.created_by === user?.id || note.createdBy === user?.id;
                    const canEdit = isAuthor || isMainAdmin || selectedClass?.homeroomTeacherId === user?.id || selectedClass?.deputyTeacherId === user?.id;
                    const isEditing = editingNoteId === note.id;

                    return (
                      <div key={note.id} className="bg-slate-50 border border-gray-200 p-3.5 rounded-md flex flex-col justify-between gap-2.5 hover:border-sky-200 transition-all">
                        {isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <input 
                              type="text"
                              value={noteEditContent}
                              onChange={(e) => setNoteEditContent(e.target.value)}
                              className="flex-1 border border-gray-300 px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-[#005c8d]"
                            />
                            <button
                              onClick={() => handleUpdateDailyNote(note.id, noteEditContent)}
                              className="bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 text-[10px] font-bold uppercase transition-all rounded"
                            >
                              Spremi
                            </button>
                            <button
                              onClick={() => setEditingNoteId(null)}
                              className="bg-slate-500 text-white px-3 py-1.5 hover:bg-slate-600 text-[10px] font-bold uppercase transition-all rounded"
                            >
                              Odustani
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-xs text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap">{note.content}</p>
                              <div className="flex items-center gap-2 mt-2 text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">
                                <span className="text-[#005c8d]">{note.authorName || 'Nastavnik'}</span>
                                <span>•</span>
                                <span>{new Date(note.created_at || note.createdAt).toLocaleTimeString('hr-HR', {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                            </div>

                            {canEdit && (
                              <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingNoteId(note.id);
                                    setNoteEditContent(note.content);
                                  }}
                                  className="p-1 border border-transparent hover:border-gray-200 hover:bg-white text-slate-500 hover:text-sky-600 rounded transition-all"
                                  title="Uredi"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteDailyNote(note.id)}
                                  className="p-1 border border-transparent hover:border-gray-200 hover:bg-white text-slate-500 hover:text-red-500 rounded transition-all"
                                  title="Obriši"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* LESSON ENTRY MODAL */}
      {showLessonModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-10">
          <div className="bg-white border border-gray-300 w-full max-w-[760px] flex flex-col max-h-[90vh] shadow-lg">
            <div className="bg-[#06476b] px-3 py-1.5 text-white flex items-center justify-between shrink-0">
              <h3 className="text-[16px] font-semibold">Unos sadržaja za {editingHour}. sat</h3>
              <button onClick={() => setShowLessonModal(false)} className="hover:text-red-200"><X size={22} strokeWidth={1.5} /></button>
            </div>
            
            <div className="flex border-b border-gray-300 shrink-0 bg-white text-[12px]">
              <button 
                onClick={() => setActiveLessonTab('SADRZAJ')}
                className={cn("px-4 py-2 border-r border-gray-300", activeLessonTab === 'SADRZAJ' ? "bg-white text-gray-900 font-bold border-t-2 border-t-[#06476b]" : "bg-gray-50 text-gray-700 hover:bg-gray-100")}
              >
                Sadržaj radnog sata
              </button>
              <button 
                onClick={() => setActiveLessonTab('IZOSTANCI')}
                className={cn("px-4 py-2 border-r border-gray-300", activeLessonTab === 'IZOSTANCI' ? "bg-white text-gray-900 font-bold border-t-2 border-t-[#06476b]" : "bg-gray-50 text-gray-700 hover:bg-gray-100")}
              >
                Izostanci
              </button>
              <button 
                onClick={() => setActiveLessonTab('MATERIJALI')}
                className={cn("px-4 py-2 border-r border-gray-300", activeLessonTab === 'MATERIJALI' ? "bg-white text-gray-900 font-bold border-t-2 border-t-[#06476b]" : "bg-gray-50 text-gray-700 hover:bg-gray-100")}
              >
                Nastavni materijali
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {activeLessonTab === 'SADRZAJ' && (
                <div className="text-[16px] border border-gray-300 p-2">
                  <div className="grid grid-cols-[115px_1fr] items-center gap-x-2 gap-y-2">
                    <label className="text-gray-700">Sat održan:</label>
                    <button
                      type="button"
                      onClick={() => setLessonForm({...lessonForm, isHeld: !lessonForm.isHeld})}
                      className={cn(
                        "w-[90px] border px-2 py-1 text-left text-[14px] font-semibold",
                        lessonForm.isHeld ? "bg-[#06476b] text-white border-[#06476b]" : "bg-white text-gray-700 border-gray-300"
                      )}
                    >
                      <span className={cn("inline-block h-5 w-5 mr-2 align-middle border", lessonForm.isHeld ? "bg-white border-white" : "bg-gray-100 border-gray-400")} />
                      Da
                    </button>

                    <label className="text-gray-700">Predmet:</label>
                    <select
                      className="w-full h-7 border border-gray-300 px-2 py-0.5 text-[14px] focus:border-[#005c8d] outline-none"
                      value={lessonForm.subjectId}
                      onChange={e => setLessonForm({...lessonForm, subjectId: e.target.value})}
                    >
                      <option value="">-- Odaberite predmet --</option>
                      {lessonSubjectOptions.map(s => (
                        <option key={s.id} value={s.id}>
                          {formatSubjectName(s)}
                        </option>
                      ))}
                    </select>

                    <label className="text-gray-700">Grupa:</label>
                    <select
                      className="w-full h-7 border border-gray-300 px-2 py-0.5 text-[14px] focus:border-[#005c8d] outline-none"
                      value={lessonForm.groupName || 'FULL_CLASS'}
                      onChange={e => setLessonForm({...lessonForm, groupName: e.target.value})}
                    >
                      <option value="FULL_CLASS">Nema grupe</option>
                      <option value="GROUP_A">Grupa A</option>
                      <option value="GROUP_B">Grupa B</option>
                    </select>

                    <label className="text-gray-700">Blok sat:</label>
                    <select
                      className="w-full h-7 border border-gray-300 px-2 py-0.5 text-[14px] focus:border-[#005c8d] outline-none"
                      value={lessonForm.blockCount || 1}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setLessonForm({
                          ...lessonForm,
                          blockCount: val,
                          isBlock: val > 1
                        });
                      }}
                    >
                      <option value="1">Ne</option>
                      <option value="2">2 sata</option>
                      <option value="3">3 sata</option>
                      <option value="4">4 sata</option>
                      <option value="5">5 sati</option>
                      <option value="6">6 sati</option>
                      <option value="7">7 sati</option>
                      <option value="8">8 sati</option>
                    </select>
                  </div>

                  <div className="mt-3 text-[15px] text-gray-500">
                    <div>Prethodno upisani sat:</div>
                    <div className="text-gray-400">
                      {dailyLessons
                        .filter(l => l.hour < editingHour && l.subjectId === lessonForm.subjectId)
                        .sort((a, b) => b.hour - a.hour)[0]
                        ? `[${dailyLessons.filter(l => l.hour < editingHour && l.subjectId === lessonForm.subjectId).sort((a, b) => b.hour - a.hour)[0].hour}] ${formatSubjectName(allSubjects.find(s => s.id === lessonForm.subjectId))} - ${dailyLessons.filter(l => l.hour < editingHour && l.subjectId === lessonForm.subjectId).sort((a, b) => b.hour - a.hour)[0].topic || ''}`
                        : '--'}
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block mb-1 text-gray-700">Nastavna jedinica: <span className="font-bold">*</span></label>
                    <textarea
                      rows={3}
                      className="w-full border border-gray-300 p-2 text-[14px] focus:border-[#005c8d] outline-none"
                      value={lessonForm.topic}
                      onChange={e => setLessonForm({...lessonForm, topic: e.target.value})}
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block mb-1 text-gray-700">Napomena:</label>
                    <textarea
                      rows={2}
                      className="w-full border border-gray-300 p-2 text-[14px] focus:border-[#005c8d] outline-none"
                      value={lessonForm.notes}
                      onChange={e => setLessonForm({...lessonForm, notes: e.target.value})}
                    />
                  </div>
                </div>
              )}

              {activeLessonTab === 'IZOSTANCI' && (
                <div className="border border-red-200 bg-red-50 p-2">
                      <h4 className="text-[15px] font-bold text-gray-900 mb-2">
                        Izostanci
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-[13px]">
                        {sortStudentsBySurname(students).map(s => {
                          const isSelected = selectedAbsentees.includes(s.id);
                          return (
                            <label
                              key={`absentee-btn-${s.id}`}
                              className={cn("flex items-center gap-1 border-b border-gray-300 py-1", isSelected ? "text-red-700" : "text-gray-400")}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) setSelectedAbsentees(prev => prev.filter(id => id !== s.id));
                                  else setSelectedAbsentees(prev => [...prev, s.id]);
                                }}
                                className="h-3 w-3 accent-red-600"
                              />
                              <span className={cn("truncate", isSelected && "font-semibold")}>{formatPersonName(s)}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-[11px] text-gray-500 font-semibold italic">
                         Odabrano učenika: {selectedAbsentees.length}
                      </div>
                </div>
              )}

              {activeLessonTab === 'MATERIJALI' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block tracking-tight">Napomena uz nastavni sat</label>
                    <textarea 
                      rows={4}
                      className="w-full border border-gray-300 p-2 focus:outline-none font-medium text-[11px]"
                      placeholder="Bilješke, napomene o radu, odrađenim provjerama..."
                      value={lessonForm.notes}
                      onChange={e => setLessonForm({...lessonForm, notes: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block tracking-tight">Korišteni materijali / poveznice</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-300 p-2 focus:outline-none font-medium text-[11px]"
                      placeholder="Poveznice na digitalne sadržaje..."
                      value={lessonForm.materials}
                      onChange={e => setLessonForm({...lessonForm, materials: e.target.value})}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-3 border-t border-gray-300 flex justify-center gap-2 shrink-0">
              <button 
                onClick={() => setShowLessonModal(false)}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 font-bold text-[11px] hover:bg-gray-50"
              >
                Odustani
              </button>
              <button 
                onClick={saveLessonDetailed}
                className="px-4 py-2 bg-[#06476b] text-white border border-[#06476b] font-semibold text-[13px] hover:bg-[#043a58]"
              >
                {lessonForm.id ? 'Spremi promjene' : 'Unesi novi radni sat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABSENCE ENTRY MODAL (e-Dnevnik style) */}
      {showAbsenceEntryModal && absenceEntryLesson && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 w-full max-w-3xl flex flex-col max-h-[88vh] shadow-lg animate-fadeIn">
            <div className="relative px-6 py-4 border-b border-gray-200 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowAbsenceEntryModal(false);
                  setAbsenceEntryLesson(null);
                }}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-900"
                title="Zatvori"
              >
                <X size={16} />
              </button>
              <h3 className="text-[16px] font-normal text-gray-800">
                Odsutni učenici - {selectedDate ? new Date(selectedDate).toLocaleDateString('hr-HR') : ''} ({selectedDate ? getDayName(selectedDate).toLowerCase() : ''})
              </h3>
              <div className="mt-1 text-[13px]">
                <span>Predmet: </span>
                <select
                  className="border border-gray-300 px-2 py-0.5 text-[12px] focus:border-[#005c8d] outline-none"
                  value={absenceEntryLesson.id}
                  onChange={(event) => {
                    const nextLesson = dailyLessons.find(l => l.id === event.target.value);
                    if (nextLesson) openAbsenceEntryForLesson(nextLesson);
                  }}
                >
                  {dailyLessons.map(lesson => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.hour}. sat , {formatSubjectName(allSubjects.find(s => s.id === lesson.subjectId))}
                    </option>
                  ))}
                </select>
                <span className="ml-1 font-bold">*</span>
              </div>
            </div>

            <div className="px-6 py-2 flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAbsenceEntry}
                  className="px-3 py-1.5 bg-[#005c8d] text-white font-bold hover:bg-[#004a70]"
                >
                  Unesi
                </button>
                <span>Odabrano učenika: <strong>{absenceEntrySelectedStudents.length}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAbsenceEntryModal(false);
                  setAbsenceEntryLesson(null);
                }}
                className="px-3 py-1.5 bg-[#005c8d] text-white font-bold hover:bg-[#004a70]"
              >
                Odustani
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="border-t border-gray-200">
                {sortStudentsBySurname(students).map((student, idx) => {
                  const isSelected = absenceEntrySelectedStudents.includes(student.id);
                  return (
                    <button
                      type="button"
                      key={student.id}
                      onClick={() => {
                        if (isSelected) {
                          setAbsenceEntrySelectedStudents(prev => prev.filter(id => id !== student.id));
                        } else {
                          setAbsenceEntrySelectedStudents(prev => [...prev, student.id]);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center justify-between border-b border-gray-200 px-2 py-2 text-left text-[13px]",
                        isSelected ? "bg-red-100 text-red-900" : "bg-gray-50 text-gray-400"
                      )}
                    >
                      <span>{idx + 1}. {formatPersonName(student)}</span>
                      {isSelected ? (
                        <CheckCircle size={17} className="text-green-600" />
                      ) : (
                        <XCircle size={17} className="text-gray-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABSENCE STATUS EDIT MODAL */}
      {absenceEditModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
          {(() => {
            const selectedStudentObj = students.find(s => s.id === absenceEditModal.studentId);
            const editableAbsences = [...dailyAbsences, ...currentWeekAbsences]
              .filter((absence, index, self) =>
                absenceEditModal.absenceIds.includes(absence.id) &&
                self.findIndex(item => item.id === absence.id) === index
              )
              .sort((a, b) => Number(a.hour || 0) - Number(b.hour || 0));
            const firstAbsence = editableAbsences[0];
            const firstLesson = firstAbsence ? dailyLessons.find(l => l.id === firstAbsence.lessonId) : null;

            return (
              <div className="bg-white border border-gray-700 w-full max-w-2xl shadow-lg">
                <div className="bg-[#06476b] text-white px-3 py-2 flex items-center justify-between">
                  <h3 className="text-[18px] font-normal">
                    {formatPersonName(selectedStudentObj || { name: 'Učenik' })}{editableAbsences.length === 1 && firstAbsence ? ` - ${firstAbsence.hour}. sat` : ''}
                  </h3>
                  <button type="button" onClick={closeAbsenceEditModal} className="text-white/80 hover:text-white">
                    <X size={22} />
                  </button>
                </div>

                <div className="p-4">
                  {editableAbsences.length === 1 && (
                    <div className="text-center text-[15px] mb-4">
                      {formatSubjectName(allSubjects.find(s => s.id === firstLesson?.subjectId)) || 'Predmet'}
                    </div>
                  )}

                  {editableAbsences.length > 1 && (
                    <div className="mb-5">
                      <label className="block mb-2 text-[12px] font-bold">Odaberite sate: <span className="text-[#005c8d]">*</span></label>
                      <div className="flex flex-wrap gap-2 bg-red-50 border border-red-200 p-2">
                        {editableAbsences.map(absence => {
                          const isSelected = absenceEditModal.selectedIds.includes(absence.id);
                          return (
                            <button
                              key={absence.id}
                              type="button"
                              onClick={() => {
                                setAbsenceEditModal(prev => ({
                                  ...prev,
                                  selectedIds: isSelected
                                    ? prev.selectedIds.filter(id => id !== absence.id)
                                    : [...prev.selectedIds, absence.id]
                                }));
                              }}
                              className={cn(
                                "w-9 h-8 border text-[12px] font-bold",
                                isSelected ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-red-100 text-red-300 border-red-200"
                              )}
                            >
                              {absence.hour}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-center mt-2">
                        <button
                          type="button"
                          onClick={() => setAbsenceEditModal(prev => ({ ...prev, selectedIds: [...prev.absenceIds] }))}
                          className="px-12 py-2 border border-red-300 bg-red-50 text-red-900 text-[12px] font-bold hover:bg-red-100"
                        >
                          Odaberi sve
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-red-50 border border-red-200 p-3">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 text-[13px]">
                      <label className="font-bold">Status:</label>
                      <select
                        className="border border-red-200 bg-white px-2 py-1"
                        value={absenceEditForm.status}
                        onChange={e => setAbsenceEditForm(prev => ({ ...prev, status: e.target.value as AbsenceStatus }))}
                      >
                        <option value="">---status---</option>
                        <option value={AbsenceStatus.JUSTIFIED}>opravdano</option>
                        <option value={AbsenceStatus.UNJUSTIFIED}>neopravdano</option>
                        <option value={AbsenceStatus.OTHER}>ostalo</option>
                      </select>
                      <span className="text-[#005c8d] font-bold">*</span>

                      <label className="font-bold md:ml-3">Tip:</label>
                      <select
                        className="border border-red-200 bg-white px-2 py-1 min-w-44"
                        value={absenceEditForm.absenceType}
                        onChange={e => setAbsenceEditForm(prev => ({ ...prev, absenceType: e.target.value }))}
                      >
                        <option value="">---tip---</option>
                        {absenceTypeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="text-[#005c8d] font-bold">*</span>
                    </div>

                    <div className="border-t border-red-200 mt-4 pt-4">
                      <label className="block mb-1 text-[13px] font-bold">Razlog:</label>
                      <textarea
                        rows={3}
                        className="w-full border border-blue-400 bg-white p-2 text-[13px] focus:outline-none"
                        value={absenceEditForm.note}
                        onChange={e => setAbsenceEditForm(prev => ({ ...prev, note: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 mt-5 pt-5 text-center">
                    <button
                      type="button"
                      onClick={handleSaveAbsenceEdit}
                      className="px-5 py-2 bg-[#005c8d] text-white font-bold hover:bg-[#004a70]"
                    >
                      Unesi
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* EXAM MODAL */}
      {showExamModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 text-[11px]">
          <div className="bg-white border border-gray-300 w-full max-w-lg shadow-[10px_10px_0px_rgba(0,0,0,0.05)]">
            <div className="bg-[#005c8d] p-2 text-white flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-tight">{editingExam ? 'Uredite provjeru' : 'Planiranje provjere'}</h3>
              <button onClick={() => { setShowExamModal(false); setEditingExam(null); }} className="hover:text-red-200"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block leading-none">Nastavni predmet</label>
                <select 
                  className="w-full border border-gray-300 p-1.5 focus:outline-none font-bold"
                  value={examForm.subjectId}
                  onChange={e => setExamForm({...examForm, subjectId: e.target.value})}
                >
                  <option value="">-- Odaberi predmet --</option>
                  {examSubjectOptions
                    .map(s => <option key={s.id} value={s.id}>{formatSubjectName(s)}</option>)}
                </select>
                {examSubjectOptions.length === 0 && (
                  <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1.5">
                    Nema predmeta dodijeljenih ovom razredu.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block leading-none">Datum</label>
                <input 
                  type="date"
                  className="w-full border border-gray-300 p-1.5 focus:outline-none font-bold"
                  value={examForm.date}
                  onChange={e => setExamForm({...examForm, date: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block leading-none">Opis (nastavna jedinica)</label>
                <textarea 
                  rows={3}
                  className="w-full border border-gray-300 p-2 focus:outline-none font-medium placeholder:font-normal placeholder:text-gray-200"
                  placeholder="Upišite opis provjere..."
                  value={examForm.description}
                  onChange={e => setExamForm({...examForm, description: e.target.value})}
                />
              </div>
            </div>
            <div className="bg-gray-50 border-t border-gray-300 p-3 flex justify-end gap-2">
              <button 
                onClick={() => { setShowExamModal(false); setEditingExam(null); }}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 font-bold text-[10px] uppercase hover:bg-white"
              >
                Odustani
              </button>
              <button 
                onClick={saveExam}
                className="px-6 py-1.5 bg-[#005c8d] text-white border border-[#004a70] font-bold text-[10px] uppercase hover:bg-[#004a70]"
              >
                {editingExam ? 'Spremi promjene' : 'Spremi plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWeekModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
            <div className="bg-[#005c8d] p-6 text-white flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tight">{editingWeekId ? 'Uredi radni tjedan' : 'Novi radni tjedan'}</h3>
              <button onClick={() => { setShowWeekModal(false); setEditingWeekId(null); }} className="hover:rotate-90 transition-transform"><X /></button>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-2">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Naziv tjedna</label>
                 <input 
                   type="text" 
                   placeholder="npr. 12. radni tjedan"
                   className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none font-bold"
                   value={newWeek.name}
                   onChange={e => setNewWeek({...newWeek, name: e.target.value})}
                 />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Od datuma</label>
                    <input 
                      type="date" 
                      className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none"
                      value={newWeek.startDate}
                      onChange={e => setNewWeek({...newWeek, startDate: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Do datuma</label>
                    <input 
                      type="date" 
                      className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none"
                      value={newWeek.endDate}
                      onChange={e => setNewWeek({...newWeek, endDate: e.target.value})}
                    />
                  </div>
               </div>

               <div className="space-y-2">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Tip tjedna</label>
                 <div className="flex gap-2">
                   <button 
                     type="button"
                     onClick={() => setNewWeek({...newWeek, weekType: 'INSTRUCTIONAL', isTeachingWeek: true})}
                     className={cn("flex-1 p-3 rounded-lg font-black uppercase text-[10px] tracking-wide border transition-all text-center", newWeek.weekType === 'INSTRUCTIONAL' ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}
                   >
                     🎓 Nastavni
                   </button>
                   <button 
                     type="button"
                     onClick={() => setNewWeek({...newWeek, weekType: 'NON_INSTRUCTIONAL', isTeachingWeek: false})}
                     className={cn("flex-1 p-3 rounded-lg font-black uppercase text-[10px] tracking-wide border transition-all text-center", newWeek.weekType === 'NON_INSTRUCTIONAL' ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}
                   >
                     ⚖️ Nenastavni
                   </button>
                   <button 
                     type="button"
                     onClick={() => setNewWeek({...newWeek, weekType: 'SCHOOL_HOLIDAY', isTeachingWeek: false})}
                     className={cn("flex-1 p-3 rounded-lg font-black uppercase text-[10px] tracking-wide border transition-all text-center", newWeek.weekType === 'SCHOOL_HOLIDAY' ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}
                   >
                     🌴 Praznici
                   </button>
                 </div>
               </div>

               {newWeek.weekType === 'SCHOOL_HOLIDAY' ? (
                 <div className="space-y-3 bg-amber-50/50 border border-amber-200 p-4 rounded-xl">
                   <label className="text-xs font-black text-amber-800 uppercase tracking-widest block">Vrsta školskih praznika</label>
                   <select
                     className="w-full border-2 border-amber-200 p-3 bg-white rounded-lg font-bold text-amber-950 focus:border-[#005c8d] outline-none"
                     value={newWeek.holidayType}
                     onChange={e => setNewWeek({...newWeek, holidayType: e.target.value as any})}
                   >
                     <option value="WINTER_1">Zimski praznici - 1. dio</option>
                     <option value="WINTER_2">Zimski praznici - 2. dio</option>
                     <option value="SPRING">Proljetni praznici</option>
                     <option value="SUMMER">Ljetni praznici</option>
                   </select>
                   <p className="text-[10px] text-amber-700 italic font-semibold mt-1">
                     🌴 Svi dani u ovom tjednu su nenastavni. Unos nastave u Dnevnik rada za ovaj tjedan bit će onemogućen te se tjedan neće računati u fond nastavnih tjedana.
                   </p>
                 </div>
               ) : newWeek.weekType === 'NON_INSTRUCTIONAL' ? (
                 <div className="space-y-4 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">Razlog</label>
                     <select
                       className="w-full border-2 border-slate-200 p-3 bg-white rounded-lg font-bold text-slate-800"
                       value={newWeek.non_teaching_reason || ''}
                       onChange={e => setNewWeek({...newWeek, non_teaching_reason: e.target.value})}
                     >
                       <option value="">- Odaberi razlog -</option>
                       <option value="SPORTS_DAY">Školski športski dan</option>
                       <option value="PROJECT_DAY">Projektni dan</option>
                       <option value="EXCURSION">Terenska nastava / Izlet</option>
                       <option value="HOLIDAY">Državni praznik / Blagdan</option>
                       <option value="OTHER">Ostalo</option>
                     </select>
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-700 uppercase tracking-widest block">Napomena / Detalji</label>
                     <input
                       type="text"
                       className="w-full border-2 border-slate-200 p-3 bg-white rounded-lg focus:border-[#005c8d] outline-none"
                       placeholder="npr. Dan škole, Dan sporta..."
                       value={newWeek.non_teaching_reason_note || ''}
                       onChange={e => setNewWeek({...newWeek, non_teaching_reason_note: e.target.value})}
                     />
                   </div>
                 </div>
               ) : (
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Smjena tjedna</label>
                   <select 
                    className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none font-bold"
                    value={newWeek.shift}
                    onChange={e => setNewWeek({...newWeek, shift: e.target.value as any})}
                   >
                     <option value="Ujutro">Ujutro</option>
                     <option value="Popodne">Popodne</option>
                     <option value="Cjelodnevna">Cjelodnevna</option>
                   </select>
                 </div>
               )}

               {newWeek.weekType !== 'SCHOOL_HOLIDAY' && (
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Dežurni učenici</label>
                   <div className="flex gap-4">
                     <select
                       className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none font-bold"
                       value={newWeek.onDutyStudentIds[0] || ''}
                       onChange={e => {
                         const next = [...newWeek.onDutyStudentIds];
                         next[0] = e.target.value;
                         setNewWeek({...newWeek, onDutyStudentIds: next.filter(Boolean)});
                       }}
                     >
                       <option value="">- Odaberi 1. redara -</option>
                       {sortStudentsBySurname(students).map(s => <option key={s.id} value={s.id}>{formatPersonName(s)}</option>)}
                     </select>
                   <select
                     className="w-full border-2 border-gray-100 p-3 rounded-lg focus:border-[#005c8d] outline-none font-bold"
                     value={newWeek.onDutyStudentIds[1] || ''}
                     onChange={e => {
                       const next = [...newWeek.onDutyStudentIds];
                       next[1] = e.target.value;
                       setNewWeek({...newWeek, onDutyStudentIds: next.filter(Boolean)});
                     }}
                   >
                     <option value="">- Odaberi 2. redara -</option>
                     {sortStudentsBySurname(students).map(s => <option key={s.id} value={s.id}>{formatPersonName(s)}</option>)}
                   </select>
                 </div>
               </div>
                )}

               <div className="space-y-4">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Radni dani (Pon - Sub)</label>
                  <div className="grid grid-cols-6 gap-2">
                    {[1, 2, 3, 4, 5, 6].map(day => {
                      const names = ['', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
                      const isTeaching = newWeek.dailyTeachingStatus[day];
                      return (
                        <div key={day} className="flex flex-col items-center gap-2">
                          <button 
                            onClick={() => setNewWeek({
                              ...newWeek, 
                              dailyTeachingStatus: { ...newWeek.dailyTeachingStatus, [day]: !isTeaching }
                            })}
                            className={cn(
                              "w-full aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all",
                              isTeaching ? "bg-red-50 border-red-200 text-red-900" : "bg-gray-50 border-gray-100 text-gray-300"
                            )}
                          >
                            <div className="text-[10px] font-black uppercase">{names[day]}</div>
                            {!isTeaching && <X size={14} />}
                          </button>
                          <div className="text-[9px] font-bold text-gray-400 uppercase">
                            {isTeaching ? 'Nastavni' : 'Nenastavni'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button 
                    onClick={() => setNewWeek({
                      ...newWeek,
                      dailyTeachingStatus: { ...newWeek.dailyTeachingStatus, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }
                    })}
                    className="w-full py-2 bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest rounded hover:bg-slate-800 transition-all"
                  >
                    Pon - Pet
                  </button>
               </div>

               <div className="flex gap-4 pt-4">
                  <button 
                    onClick={handleSaveWeek}
                    disabled={!newWeek.name || !newWeek.startDate || !newWeek.endDate}
                    className="flex-1 bg-[#005c8d] text-white font-black py-4 rounded-lg uppercase tracking-widest hover:bg-[#004a70] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {editingWeekId ? 'Spremi promjene' : 'Kreiraj tjedan'}
                  </button>
                  <button 
                    onClick={() => { setShowWeekModal(false); setEditingWeekId(null); }}
                    className="px-8 py-4 bg-gray-100 text-gray-600 font-black rounded-lg uppercase tracking-widest hover:bg-gray-200"
                  >
                    Odustani
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
      {/* SCHEDULE MODAL */}
      {showScheduleModal && editingCell && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-300 w-full max-w-md overflow-hidden">
            <div className="bg-[#005c8d] p-4 flex items-center justify-between">
              <h3 className="text-white font-black uppercase text-xs tracking-widest">
                Termin: {editingCell.dayOfWeek}, {editingCell.periodNumber}. sat ({editingCell.shift})
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-white/60 hover:text-white"><X size={18}/></button>
            </div>
            
            <div className="p-4 space-y-6">
              <div className="space-y-4">
                <div className="text-[10px] font-black text-gray-400 uppercase border-b pb-1">Dodaj predmet u termin</div>
                <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">Predmet</label>
                      <select 
                        value={cellSubjectForm.subjectId}
                        onChange={e => {
                          const subId = e.target.value;
                          const assignment = subjectAssignments.find(a => a.subjectId === subId && a.classId === effectiveClassId);
                          setCellSubjectForm({
                            ...cellSubjectForm, 
                            subjectId: subId,
                            teacherId: assignment?.teacherId || ''
                          });
                        }}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                      >
                        <option value="">-- Odaberi predmet --</option>
                        {allSubjects?.filter(s => 
                            subjectAssignments?.some(a => a.subjectId === s.id && a.classId === effectiveClassId)
                          )
                          .map(s => <option key={s.id} value={s.id}>{formatSubjectName(s)}</option>)
                        }
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">Nastavnik (Automatski dodijeljen)</label>
                      <div className="w-full border border-gray-100 bg-gray-50 p-2 text-xs font-bold text-gray-400 uppercase h-10 flex items-center">
                        {(() => {
                          const tea = teachers.find(t => t.id === cellSubjectForm.teacherId);
                          return tea ? formatPersonName(tea) : 'Odaberite predmet s nastavnikom';
                        })()}
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">Uzastopnih sati (1-8)</label>
                      <select
                        value={consecutivePeriods}
                        onChange={e => setConsecutivePeriods(Number(e.target.value))}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none mb-2"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n} {n === 1 ? 'sat' : n >= 2 && n <= 4 ? 'sata' : 'sati'}</option>
                        ))}
                      </select>
                      <label className="text-[9px] font-black text-gray-400 uppercase">Učionica (opcionalno)</label>
                      <input 
                        type="text"
                        value={cellSubjectForm.classroom}
                        onChange={e => setCellSubjectForm({...cellSubjectForm, classroom: e.target.value})}
                        placeholder="npr. 12"
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                      />
                   </div>
                   <button 
                     onClick={handleSaveCellSubject}
                     className="bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] tracking-widest mt-2"
                   >
                     Dodaj u ovaj termin
                   </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-black text-gray-400 uppercase border-b pb-1">Trenutno u ovom terminu</div>
                <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto pr-2">
                   {getCellSubjects(editingCell.dayOfWeek, editingCell.shift, editingCell.periodNumber).map(s => {
                    const sub = allSubjects.find(sub => sub.id === s.subjectId);
                    const tea = teachers.find(t => t.id === s.teacherId);
                    return (
                      <div key={s.id} className="py-2 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-black text-[#005c8d] uppercase">{formatSubjectName(sub)}</div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase">{formatPersonName(tea)} {s.classroom && `• ${s.classroom}`}</div>
                        </div>
                        <button 
                          onClick={() => handleDeleteScheduleSubjectClick(s)}
                          className="text-gray-300 hover:text-red-500 p-1"
                        >
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    );
                  })}
                  {getCellSubjects(editingCell.dayOfWeek, editingCell.shift, editingCell.periodNumber).length === 0 && (
                    <div className="py-4 text-center text-[10px] text-gray-400 italic">Prazan termin</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 p-3 border-t flex justify-end">
               <button onClick={() => setShowScheduleModal(false)} className="text-[10px] font-black uppercase text-gray-400 hover:text-gray-600">Zatvori</button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
        onConfirm={confirmDelete}
        loading={deleteDialog.loading}
        showTotp={false}
      />

      {/* Choice Dialog for Single vs Block Deletion */}
      {isDeleteBlockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[250] p-4 text-left">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-sm w-full overflow-hidden p-6 font-sans">
            <div className="flex gap-3 bg-rose-50 border border-rose-100 rounded-xl p-4 mb-5 text-left">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="text-xs font-black text-rose-800 uppercase tracking-wide">Pronađen je blok ponavljanja</h4>
                <p className="text-xs font-medium text-rose-600 mt-1">
                  Ovaj predmet se pojavljuje više puta u istom danu. Želite li obrisati:
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 font-sans">
              <button
                onClick={() => {
                  confirmSingleDelete(deleteSingleSubjectId);
                  setIsDeleteBlockModalOpen(false);
                }}
                className="w-full text-left px-4 py-3 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl text-slate-700 font-bold text-xs"
              >
                <div className="uppercase font-black text-slate-800 text-[10px] tracking-wide mb-1">Obriši samo ovaj sat</div>
                Ukloni isključivo selektirani sat iz rasporeda.
              </button>
              <button
                onClick={confirmBlockDelete}
                className="w-full text-left px-4 py-3 border border-rose-200 hover:border-rose-300 hover:bg-rose-50 rounded-xl text-rose-700 font-bold text-xs"
              >
                <div className="uppercase font-black text-rose-800 text-[10px] tracking-wide mb-1">Obriši cijeli blok</div>
                Ukloni sve sate ovog predmeta u danu/smjeni.
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-3 font-sans border-t pt-4">
              <button
                onClick={() => setIsDeleteBlockModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider"
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleGrid({ title, shift, periods, days, onCellClick, getCellSubjects, allSubjects, teachers, readOnly }: any) {
  return (
    <SharedScheduleGrid 
      title={title}
      shift={shift}
      periods={periods}
      days={days}
      onCellClick={onCellClick}
      getCellSubjects={getCellSubjects}
      allSubjects={allSubjects}
      teachers={teachers}
      readOnly={readOnly}
      showTeachers={false}
    />
  );
}

function OldScheduleGrid_Unused({ title, shift, periods, days, onCellClick, getCellSubjects, allSubjects, teachers, readOnly }: any) {
  return (
    <div className="bg-white border border-gray-300">
      <div className="bg-[#f8f9fa] p-2 border-b border-gray-300">
        <h4 className="text-[11px] font-bold text-[#005c8d] uppercase tracking-tight flex items-center gap-2">
          {shift === 'MORNING' ? <Monitor size={12}/> : <Clock size={12}/>}
          {title}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300">
              <th className="w-20 border-r border-gray-300 bg-gray-100 p-2 text-[10px] font-bold text-gray-500 uppercase">Sat</th>
              {days.map((day: any) => (
                <th key={day} className="p-2 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-300 last:border-r-0">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period: any) => (
              <tr key={period} className="border-b border-gray-300 last:border-b-0">
                <td className="bg-gray-100 border-r border-gray-300 p-2 text-center align-middle font-bold text-[10px] text-gray-500 uppercase">
                  {period}. sat
                </td>
                {days.map((day: any) => {
                  const subjects = getCellSubjects(day, shift, period);
                  return (
                    <td 
                      key={`${day}-${period}`} 
                      onClick={() => !readOnly && onCellClick(day, period)}
                      className={cn(
                        "p-1 border-r border-gray-300 last:border-r-0 text-[10px] h-20 align-top",
                        !readOnly ? "cursor-pointer hover:bg-[#f0f9ff]" : ""
                      )}
                    >
                       <div className="flex flex-col gap-1">
                         {subjects.map((s: any) => {
                            const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                            const tea = teachers.find((t: any) => t.id === s.teacherId);
                            return (
                              <div key={s.id} className="bg-white border border-gray-200 p-1">
                                <div className="font-bold text-[#005c8d] uppercase leading-tight">{formatSubjectName(sub)}</div>
                                {s.classroom && <div className="text-[8px] text-gray-400 font-bold uppercase">Uč: {s.classroom}</div>}
                              </div>
                            );
                         })}
                         {subjects.length === 0 && (
                            <div className="text-center py-4 text-gray-100 italic font-bold uppercase text-[8px]">--</div>
                         )}
                       </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
