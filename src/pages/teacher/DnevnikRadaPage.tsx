import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Lesson, Class, WorkWeek, User, Role, Exam, ClassSubjectTeacher as SubjectTeachingAssignment, CurriculumPlan } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { cn, getSurname, formatPersonName, sortStudentsBySurname } from '../../lib/utils';
import { Calendar, Clock, Book, Plus, ArrowLeft, ArrowRight, X, ChevronRight, User as UserIcon, List, Trash2, LayoutGrid, Monitor, MapPin, CheckCircle, XCircle, Edit2, UserX } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { toast } from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

export default function DnevnikRadaPage({ initialView }: { initialView?: 'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE' | 'LEKTIRA' }) {
  usePageTitle("Dnevnik rada");
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, highestRole } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId, selectedYearId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;
  const [classes, setClasses] = useState<Class[]>([]);
  const selectedClass = classes.find(c => c.id === effectiveClassId);
  const [students, setStudents] = useState<User[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  
  const [weeks, setWeeks] = useState<WorkWeek[]>([]);
  const [view, setView] = useState<'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE' | 'LEKTIRA'>(initialView || 'WEEKS');
  const [selectedWeek, setSelectedWeek] = useState<WorkWeek | null>(null);
  
  useEffect(() => {
    if (initialView) {
      setView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (view === 'WEEK_DETAIL' && !selectedWeek && weeks.length > 0) {
      // Find current week based on date or just pick the last one
      const today = new Date().toISOString().split('T')[0];
      const activeWeek = weeks.find(w => today >= w.startDate && today <= w.endDate) || weeks[weeks.length - 1];
      setSelectedWeek(activeWeek);
    }
  }, [view, selectedWeek, weeks]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dailyLessons, setDailyLessons] = useState<Lesson[]>([]);
  const [currentWeekAbsences, setCurrentWeekAbsences] = useState<any[]>([]);
  const [dailyAbsences, setDailyAbsences] = useState<any[]>([]);
  const [currentClassExams, setCurrentClassExams] = useState<Exam[]>([]);

  // States for Absence Entry right after lesson entry (e-Dnevnik-style)
  const [showAbsenceEntryModal, setShowAbsenceEntryModal] = useState(false);
  const [absenceEntryLesson, setAbsenceEntryLesson] = useState<Lesson | null>(null);
  const [absenceEntrySelectedStudents, setAbsenceEntrySelectedStudents] = useState<string[]>([]);

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

  const canManageWeeks = useMemo(() => {
    if (!user || !effectiveClassId) return false;
    if (isMainAdmin || highestRole === Role.ADMIN) return true;
    
    const isHomeroom = selectedClass ? selectedClass.homeroomTeacherId === user.id : false;
    const isDeputy = selectedClass ? selectedClass.deputyTeacherId === user.id : false;
    const isTeachingThisClass = subjectAssignments.some(
      a => a.classId === effectiveClassId && a.teacherId === user.id
    );

    return isHomeroom || isDeputy || isTeachingThisClass;
  }, [user, isMainAdmin, selectedClass, effectiveClassId, subjectAssignments]);

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
    
    const hrSub = allSubjects.find(s => s.name.toLowerCase().includes('hrvatski'));
    return hrSub ? hrSub.id : '';
  };
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
    completedDate: new Date().toISOString().split('T')[0],
    title: '',
    processingDetails: ''
  });

  const fetchLektire = async () => {
    if (!effectiveClassId) return;
    try {
      const url = new URL('/api/lektire', window.location.origin);
      url.searchParams.append('classId', effectiveClassId);
      
      let schoolId = selectedSchoolId || selectedClass?.schoolId || null;
      let yrId = selectedYearId || selectedClass?.school_year_id || null;

      if (!schoolId || !yrId) {
        const { data: clsData } = await supabase
          .from('classes')
          .select('school_id, school_year_id')
          .eq('id', effectiveClassId)
          .maybeSingle();
        if (clsData) {
          schoolId = schoolId || clsData.school_id || null;
          yrId = yrId || clsData.school_year_id || null;
        }
      }

      let hrSubjectId = getHrvatskiJezikSubjectId();
      if (!hrSubjectId && schoolId) {
        const { data: classSubjs } = await supabase
          .from('class_subject_teachers')
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
        if (!hrSubjectId) {
          const { data: globalSubjs } = await supabase
            .from('subjects')
            .select('id, name')
            .eq('school_id', schoolId);
          const hrSub = (globalSubjs || []).find(s => s.name?.toLowerCase().includes('hrvatski'));
          if (hrSub) {
            hrSubjectId = hrSub.id;
          }
        }
      }

      if (hrSubjectId) {
        url.searchParams.append('subjectId', hrSubjectId);
      }
      if (schoolId) {
        url.searchParams.append('schoolId', schoolId);
      }
      if (yrId) {
        url.searchParams.append('schoolYearId', yrId);
      }
      // Add cache-busting timestamp parameter
      url.searchParams.append('_t', Date.now().toString());
      
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        console.log("LOAD READINGS FILTERS", {
          school_id: schoolId,
          school_year_id: yrId,
          class_id: effectiveClassId,
          subject_id: hrSubjectId
        });
        console.log("LOAD READINGS RESULT", { data, error: !res.ok ? data : null });
        console.log("FETCH AFTER DELETE RESULT", data);
        console.log("STATE BEFORE SET", lektire);
        console.log("FETCH RESULT", data);
        setLektire(data || []);
      }
    } catch (e) {
      console.error("Error loading lektire:", e);
    }
  };

  const handleCreateOrUpdateLektira = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingLektira) return;

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
        completedDate: new Date().toISOString().split('T')[0],
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
          .select('*')
          .eq('school_id', selectedSchoolId);
        if (ce) throw ce;

        const mappedClasses = mapList(classesData || [], mappers.class);
        
        let filteredClasses = mappedClasses;
        if (!isMainAdmin) {
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
        setAllSubjects(mapList(subjectsData || [], mappers.subject));

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
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju konteksta razreda');
      }
    };
    fetchClassContext();
  }, [effectiveClassId]);

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
  }, [effectiveClassId]);

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
    fetchLektire();
  }, [effectiveClassId]);

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
      let cellId = '';
      const existingCell = scheduleCells.find(c => 
        c.dayOfWeek === editingCell.dayOfWeek && 
        c.shift === editingCell.shift && 
        c.periodNumber === editingCell.periodNumber
      );

      if (existingCell) {
        cellId = existingCell.id;
      } else {
        const payload = {
          class_id: effectiveClassId,
          day_of_week: editingCell.dayOfWeek,
          shift: editingCell.shift,
          period_number: editingCell.periodNumber
        };
        console.log("schedule cell upsert payload", payload);
        console.log("onConflict", "class_id,day_of_week,shift,period_number");

        const { data: newCellData, error: ce } = await supabase
          .from('schedule_cells')
          .upsert(payload, {
            onConflict: "class_id,day_of_week,shift,period_number"
          })
          .select()
          .maybeSingle();

        if (ce || !newCellData) throw ce || new Error("Cell creation failed");
        cellId = newCellData.id;
        
        let newCell = mappers.scheduleCell(newCellData);
        setScheduleCells([...scheduleCells, newCell]);
      }

      // Check if this subject is already in this cell
      const alreadyInCell = scheduleSubjects.some(ss => 
        ss.scheduleCellId === cellId && 
        ss.subjectId === cellSubjectForm.subjectId
      );

      if (alreadyInCell) {
        toast.error('Ovaj predmet je već u ovom terminu.');
        return;
      }

      const { data: subData, error: se } = await supabase
        .from('schedule_cell_subjects')
        .insert({
          schedule_cell_id: cellId,
          subject_id: cellSubjectForm.subjectId,
          teacher_id: teacherId, // Automatically assigned
          classroom: cellSubjectForm.classroom
        })
        .select()
        .maybeSingle();

      if (se || !subData) throw se || new Error("Subject assignment failed");

      const mappedSub = mappers.scheduleCellSubject(subData);
      setScheduleSubjects([...scheduleSubjects, mappedSub]);
      
      setCellSubjectForm({ subjectId: '', teacherId: '', classroom: '' });
      toast.success('Predmet dodan u raspored');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju rasporeda');
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
    if (selectedWeek.shift === 'Popodne') shift = 'AFTERNOON';
    
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
            days.push(current.toISOString().split('T')[0]);
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

    // Time-based check
    const createdAt = new Date((lesson as any).createdAt || (lesson as any).updatedAt || (lesson as any).created_at || Date.now());
    const now = new Date();
    const isOver24Hours = (now.getTime() - createdAt.getTime()) > (24 * 60 * 60 * 1000);

    // RBAC: Admins or Razrednik can bypass time check
    const isRazrednik = selectedClass && (selectedClass.homeroomTeacherId === user?.id || selectedClass.deputyTeacherId === user?.id);
    const canBypassTime = isMainAdmin || highestRole === Role.ADMIN || isRazrednik;

    if (!canBypassTime && lesson.teacherId !== user?.id) {
       toast.error('Niste ovlašteni za brisanje ovog sata.');
       return;
    }

    if (!canBypassTime && isOver24Hours) {
        toast.error('Prošlo je više od 24 sata od unosa sata. Sat više ne možete uređivati niti brisati. Obratite se razredniku ili administratoru.');
        return;
    }

    setDeleteDialog({ isOpen: true, id: lessonId, type: 'LESSON', loading: false });
  };

  const confirmDelete = async (totpCode?: string) => {
    if (!deleteDialog.id || !deleteDialog.type) return;
    
    // Check if TOTP is required for this deletion type and user
    const lesson = deleteDialog.type === 'LESSON' ? dailyLessons.find(l => l.id === deleteDialog.id) : null;
    const isRazrednik = selectedClass && (selectedClass.homeroomTeacherId === user?.id || selectedClass.deputyTeacherId === user?.id);
    const requiresTotp = (deleteDialog.type === 'LESSON' && (isMainAdmin || highestRole === Role.ADMIN || isRazrednik)) || deleteDialog.type === 'ABSENCE'; // Assuming we handle absence deletion confirmation too

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
        toast.error('Neispravan autentifikator kod.');
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
        const { error } = await supabase
          .from('exams')
          .delete()
          .eq('id', deleteDialog.id);
        if (error) throw error;
        
        setCurrentClassExams(prev => prev.filter(ex => ex.id !== deleteDialog.id));
        toast.success('Ispit je uspješno obrisan.');
      } else if (deleteDialog.type === 'WEEK') {
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

    const assignment = subjectAssignments.find(a => a.subjectId === lessonForm.subjectId && a.classId === effectiveClassId);
    // Allow if admin or if subject is assigned to this class (substitute case)
    if (!isMainAdmin && !assignment) {
       toast.error('Ovaj predmet nije dodijeljen ovom razredu.');
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

  const saveExam = async () => {
    if (!effectiveClassId || !examForm.date || !examForm.subjectId) return;
    try {
      const { data, error } = await supabase
        .from('exams')
        .insert({
          subject_id: examForm.subjectId,
          exam_date: examForm.date,
          exam_type: examForm.type,
          description: examForm.description,
          class_id: effectiveClassId,
          school_id: selectedSchoolId,
          created_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();
      if (error || !data) throw error || new Error("Exam creation failed");

      setCurrentClassExams(prev => [...prev, mappers.exam(data)]);
      setShowExamModal(false);
      setExamForm({ subjectId: '', date: '', type: 'PISANA', description: '' });
      toast.success('Pisana provjera je uspješno planirana.');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju ispita');
    }
  };

  const getDayName = (dateStr: string) => {
    const days = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
    return days[new Date(dateStr).getDay()];
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
        <button 
          onClick={() => setView('LEKTIRA')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all border-b-2 font-bold text-[11px] uppercase whitespace-nowrap", 
            view === 'LEKTIRA' ? "border-[#005c8d] text-[#005c8d] bg-white" : "border-transparent text-gray-500 hover:bg-gray-100"
          )}
        >
          <Book size={12} /> Lektira
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#f0f2f5]">
        
        {/* WEEKS LIST */}
        {view === 'WEEKS' && (() => {
          const isFinalYearClass = selectedClass && (selectedClass.gradeLevel === 4 || selectedClass.name?.includes('4.'));
          const requiredInstructionalWeeks = isFinalYearClass ? 32 : 35;
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
                    {isFinalYearClass 
                      ? '🎓 Razred je prepoznat kao završni (potreban fond: 32 nastavna tjedna).' 
                      : '🏫 Razred je prepoznat kao redovni (potreban fond: 35 nastavnih tjedana).'
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

              <div className="bg-white border border-gray-300 shadow-sm">
                 <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight">Popis radnih tjedana</div>
                 <table className="w-full text-left border-collapse text-[12px] ed-table-dense">
                   <thead>
                     <tr className="bg-gray-50 border-b border-gray-300">
                       <th className="px-4 py-2 font-bold uppercase text-gray-500 border-r border-gray-300">Naziv tjedna</th>
                       <th className="px-4 py-2 font-bold uppercase text-gray-500 w-64 border-r border-gray-300">Period i tip / razlog</th>
                       <th className="px-4 py-2 font-bold uppercase text-gray-500 border-r border-gray-300">Dežurni učenici</th>
                       <th className="px-4 py-2 font-bold uppercase text-gray-500 text-center w-24">Akcije</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                     {weeks.sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(w => (
                       <tr 
                         key={w.id} 
                         onClick={() => { setSelectedWeek(w); setView('WEEK_DETAIL'); }}
                         className="group hover:bg-[#eff6ff] cursor-pointer transition-colors"
                       >
                         <td className="px-4 py-2 border-r border-gray-200">
                            <div className="font-bold text-[#005c8d] uppercase tracking-tight group-hover:underline">{w.name}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {w.weekType === 'SCHOOL_HOLIDAY' ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black uppercase rounded-sm">🌴 Praznici</span>
                              ) : w.weekType === 'NON_INSTRUCTIONAL' ? (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[9px] font-black uppercase rounded-sm">⚖️ Nenastavni</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-black uppercase rounded-sm">🎓 Nastavni</span>
                              )}
                            </div>
                         </td>
                         <td className="px-4 py-2 border-r border-gray-200">
                            <div className="text-[11px] font-bold text-gray-600">
                             {w.startDate ? new Date(w.startDate).toLocaleDateString('hr-HR') : ''} - {w.endDate ? new Date(w.endDate).toLocaleDateString('hr-HR') : ''}
                            </div>
                            <div className="text-[10px] uppercase font-bold mt-0.5">
                              {w.weekType === 'SCHOOL_HOLIDAY' ? (
                                <span className="text-amber-700">🌴 {croatianHolidayNames[w.holidayType] || w.holidayType || 'Školski praznici'}</span>
                              ) : w.weekType === 'NON_INSTRUCTIONAL' ? (
                                <span className="text-slate-500">
                                  ⚖️ {croatianReasonNames[w.non_teaching_reason || ''] || w.non_teaching_reason || 'Nenastavno'}
                                  {w.non_teaching_reason_note && ` (${w.non_teaching_reason_note})`}
                                </span>
                              ) : (
                                <span className="text-gray-400">🕒 {w.shift || 'Ujutro'}</span>
                              )}
                            </div>
                         </td>
                        <td className="px-4 py-2 border-r border-gray-200 text-[11px] text-gray-500">
                           {w.weekType === 'SCHOOL_HOLIDAY' ? (
                             <span className="text-amber-600/70 italic font-semibold">Nema dežurstava za praznike</span>
                           ) : (
                             Array.from(new Set(w.onDutyStudentIds || [])).map(sid => students.find(s => s.id === sid)?.name).filter(Boolean).join(', ') || 'Nema dežurnih'
                           )}
                        </td>
                       <td className="px-4 py-2 text-center text-right flex justify-end">
                          {canManageWeeks && (
                            <div className="flex items-center gap-1 justify-end">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditWeek(w);
                                }}
                                className="p-1 px-2 text-gray-300 hover:text-[#005c8d] hover:bg-white border border-transparent hover:border-gray-200 transition-all rounded-sm"
                                title="Uredi"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteDialog({ isOpen: true, id: w.id, type: 'WEEK', loading: false });
                                }}
                                className="p-1 px-2 text-gray-300 hover:text-red-500 hover:bg-white border border-transparent hover:border-gray-200 transition-all rounded-sm"
                                title="Obriši"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                       </td>
                     </tr>
                   ))}
                   {weeks.length === 0 && (
                     <tr>
                        <td colSpan={4} className="p-12 text-center text-gray-400 italic">Nema upisanih radnih tjedana.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
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
                   {(selectedWeek.teachingDays || []).map(dateStr => (
                     <tr 
                       key={dateStr}
                       onClick={() => { setSelectedDate(dateStr); setView('DAY_DETAIL'); }}
                       className="group hover:bg-[#eff6ff] cursor-pointer"
                     >
                       <td className="px-4 py-2 w-20 align-middle border-r border-gray-200 bg-gray-100/30">
                          <div className="flex flex-col items-center">
                             <div className="text-[9px] font-bold uppercase text-[#005c8d] leading-none mb-1">{new Date(dateStr).toLocaleDateString('hr-HR', { month: 'short' })}</div>
                             <div className="text-xl font-bold text-gray-700 leading-none">{new Date(dateStr).getDate()}.</div>
                          </div>
                       </td>
                       <td className="px-4 py-2">
                          <div className="text-[13px] font-bold text-[#005c8d] uppercase tracking-tight group-hover:underline">{getDayName(dateStr)}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">{dateStr}</div>
                       </td>
                       <td className="px-4 py-2 text-right">
                          <div className="text-[10px] font-bold text-gray-500">
                             {dailyLessons.filter(l => l.date === dateStr).length} sati upisano
                          </div>
                       </td>
                       <td className="px-4 py-2 text-center w-10 border-l border-gray-200">
                          <ChevronRight size={14} className="text-gray-300 group-hover:text-[#005c8d]" />
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {/* ABSENCES WEEKLY VIEW */}
        {view === 'ABSENCES' && selectedClass && (
          <div className="w-full">
             <div className="bg-white border border-gray-300 shadow-sm overflow-hidden overflow-x-auto">
                <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight flex items-center justify-between">
                    <span>Tjedni pregled izostanaka: {selectedWeek?.name}</span>
                    <div className="flex gap-4 text-[9px]">
                       <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500"/> Opravdano</div>
                       <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500"/> Neopravdano</div>
                       <div className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400"/> Ostalo</div>
                       <div className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500"/> Čeka odluku</div>
                    </div>
                 </div>
                <table className="w-full border-collapse min-w-[800px] ed-table-dense">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-300">
                       <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Učenik</th>
                       {(selectedWeek?.teachingDays || []).map(date => (
                         <th key={date} className="p-2 text-center text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">
                           {getDayName(date).substring(0,3)}<br/>{new Date(date).getDate()}.{new Date(date).getMonth() + 1}.
                         </th>
                       ))}
                       <th className="p-2 text-center text-[10px] font-bold uppercase text-[#005c8d]">UKUPNO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortStudentsBySurname(students).map(s => {
                      let total = 0;
                      return (
                        <tr key={`absence-row-${s.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="p-2 font-bold text-gray-700 bg-gray-50/20 border-r border-gray-200">{s.name}</td>
                          {selectedWeek?.teachingDays?.map(date => {
                            const count = currentWeekAbsences.filter(abs => abs.studentId === s.id && abs.date === date).length;
                            total += count;
                            return (
                              <td key={`absence-cell-${s.id}-${date}`} className="p-2 border-r border-gray-200">
                               <div className="flex flex-wrap gap-1 items-center justify-center">
                                 {currentWeekAbsences
                                   .filter(abs => abs.studentId === s.id && abs.date === date)
                                   .map(abs => (
                                     <div 
                                       key={abs.id} 
                                       className={cn(
                                         "w-5 h-5 flex items-center justify-center text-[9px] font-bold text-white rounded-sm",
                                         abs.status === 'JUSTIFIED' ? 'bg-green-500' :
                                         abs.status === 'UNJUSTIFIED' ? 'bg-red-500' :
                                         abs.status === 'OTHER' ? 'bg-yellow-400' :
                                         'bg-orange-500' // PENDING
                                       )}
                                     >
                                       {abs.hour}
                                     </div>
                                   ))}
                               </div>
                              </td>
                            );
                          })}
                          <td className="p-2 text-center font-bold text-red-600 bg-red-50/30">
                            {total}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {/* EXAMS VIEW */}
        {view === 'EXAMS' && selectedClass && (
          <div className="w-full">
             <div className="bg-white border border-gray-300 shadow-sm overflow-hidden">
                <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight flex items-center justify-between">
                   <span>Plan pisanih provjera</span>
                   <button 
                     onClick={() => setShowExamModal(true)}
                     className="bg-[#005c8d] text-white px-3 py-1 font-bold text-[10px] uppercase hover:bg-[#004a70]"
                   >
                     + Planiraj provjeru
                   </button>
                </div>
                <table className="w-full border-collapse ed-table-dense">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Datum</th>
                      <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Predmet</th>
                      <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500 border-r border-gray-300">Vrsta</th>
                      <th className="p-2 text-left text-[10px] font-bold uppercase text-gray-500">Opis</th>
                      <th className="p-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                     {currentClassExams.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(exam => {
                       const subject = allSubjects.find(s => s.id === exam.subjectId);
                       return (
                         <tr key={exam.id} className="hover:bg-gray-50 transition-colors">
                           <td className="p-2 text-gray-700 font-bold border-r border-gray-200">{new Date(exam.date).toLocaleDateString('hr-HR')}</td>
                           <td className="p-2 font-bold text-[#005c8d] uppercase border-r border-gray-200">{subject?.name}</td>
                           <td className="p-2 border-r border-gray-200">
                             <span className={cn(
                               "px-2 py-0.5 text-[9px] font-bold uppercase border",
                               exam.type === 'PISANA' ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-purple-50 text-purple-700 border-purple-200"
                             )}>
                               {exam.type}
                             </span>
                           </td>
                           <td className="p-2 text-gray-600">{exam.description}</td>
                           <td className="p-2 text-center">
                             <button 
                               onClick={() => setDeleteDialog({ isOpen: true, id: exam.id, type: 'EXAM', loading: false })}
                               className="text-gray-300 hover:text-red-500 p-1"
                             >
                               <Trash2 size={12} />
                             </button>
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
                    setEditingCell({ dayOfWeek: day, shift: 'MORNING', periodNumber: period });
                    setShowScheduleModal(true);
                 }}
                 getCellSubjects={getCellSubjects}
                 allSubjects={allSubjects}
                 teachers={teachers}
               />

               <ScheduleGrid 
                 title="SMJENA B: POPODNEVNA" 
                 shift="AFTERNOON" 
                 periods={afternoonPeriods} 
                 days={days} 
                 onCellClick={(day: string, period: number) => {
                    setEditingCell({ dayOfWeek: day, shift: 'AFTERNOON', periodNumber: period });
                    setShowScheduleModal(true);
                 }}
                 getCellSubjects={getCellSubjects}
                 allSubjects={allSubjects}
                 teachers={teachers}
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
                          <div className="text-[10px] font-black uppercase text-gray-700">{subject?.name}</div>
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
        {/* LEKTIRA VIEW */}
        {view === 'LEKTIRA' && selectedClass && (
          <div className="w-full space-y-4">
            {(() => {
              console.log("RENDER LEKTIRE", lektire);
              return null;
            })()}
            <div className="flex justify-between items-center bg-white p-3 border border-gray-300 shadow-sm">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Evidencija lektira ({lektire.length})
              </span>
              <button
                onClick={() => {
                  setEditingLektira(null);
                  setLektiraForm({
                    subjectId: getHrvatskiJezikSubjectId(),
                    completedDate: new Date().toISOString().split('T')[0],
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

            <div className="bg-white border border-gray-300 shadow-sm overflow-hidden">
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
                          {subject?.name || 'Hrvatski jezik'}
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
                                    processedDateString = d.toISOString().split('T')[0];
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

        {/* LEKTIRA MODAL */}
        {showLektiraModal && (
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
                    <th className="border-r border-gray-300 p-2 text-left">Sadržaj nastavnog sata</th>
                    <th className="border-r border-gray-300 p-2 text-left w-64">Napomena</th>
                    <th className="w-16 p-2 text-center uppercase tracking-tight">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(hour => {
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
                                    const first = scheduledSubjs[0];
                                    openLessonModal(hour, undefined, { subjectId: first.subjectId, teacherId: first.teacherId || (user?.id || '') });
                                  }}
                                  className="text-[#005c8d]/30 hover:text-[#005c8d] transition-colors cursor-pointer"
                                >
                                  <List size={10} strokeWidth={3} />
                                  <div className="absolute left-full ml-1 px-2 py-1 bg-gray-800 text-white text-[8px] rounded opacity-0 group-hover/hint:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                     {scheduledSubjs.map(ss => allSubjects.find(s=>s.id===ss.subjectId)?.name).join(', ')}
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
                                const canEdit = isMainAdmin || lesson.teacherId === user?.id;
                                const lessonAbsences = dailyAbsences.filter(a => a.lessonId === lesson.id);
                                
                                return (
                                  <div key={lesson.id} className={cn("text-[11px] leading-tight flex flex-col gap-1", idx > 0 && "pt-2 border-t border-gray-100")}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 animate-fadeIn">
                                        <div className="font-bold text-[#005c8d] uppercase mb-0.5">
                                          {(sub?.name || 'Predmet').toUpperCase()} - {lesson.teacherDisplayName && !lesson.teacherDisplayName.includes('undefined') ? lesson.teacherDisplayName : (teacher ? formatPersonName(teacher) : 'Nepoznat nastavnik')}
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

                                        {/* Gumb "Unesi izostanak" i prikaz izostanaka za dan/sat */}
                                        <div className="mt-2 p-2 bg-red-50/40 border border-red-100/55 rounded flex flex-col gap-1.5">
                                          <div className="flex items-center justify-between gap-4">
                                            <span className="text-[9px] font-black uppercase text-red-700 tracking-wider flex items-center gap-1">
                                              <Clock size={10} /> Izostanci za sat:
                                            </span>
                                            {canEdit && (
                                              <button
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setAbsenceEntryLesson(lesson);
                                                  setAbsenceEntrySelectedStudents(lessonAbsences.map(a => a.studentId));
                                                  setShowAbsenceEntryModal(true);
                                                  console.log("OPEN ABSENCE ENTRY FOR LESSON", lesson);
                                                }}
                                                className="text-[9px] font-black uppercase text-red-600 hover:text-red-800 transition-colors flex items-center gap-1 bg-white border border-red-200 px-1.5 py-0.5 rounded shadow-sm hover:shadow active:scale-95 cursor-pointer"
                                              >
                                                <UserX size={10} /> Unesi izostanak
                                              </button>
                                            )}
                                          </div>
                                          {lessonAbsences.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                              {lessonAbsences.map(a => {
                                                const studentObj = students.find(s => s.id === a.studentId);
                                                const displayStatus = a.status === 'PENDING' ? 'Čeka odluku' : (a.status === 'JUSTIFIED' ? 'Opravdano' : 'Neopravdano');
                                                const badgeColor = a.status === 'JUSTIFIED' ? 'bg-green-100 text-green-700 border-green-200' : (a.status === 'UNJUSTIFIED' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200');
                                                return (
                                                  <span key={a.id} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border gap-1", badgeColor)}>
                                                    <span>{studentObj ? studentObj.name : 'Nepoznat učenik'}</span>
                                                    <span className="opacity-75 font-normal">({displayStatus})</span>
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-gray-400 italic">Nema prijavljenih izostanaka za ovaj sat.</div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {canEdit && (
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setAbsenceEntryLesson(lesson);
                                              setAbsenceEntrySelectedStudents(lessonAbsences.map(a => a.studentId));
                                              setShowAbsenceEntryModal(true);
                                              console.log("OPEN ABSENCE ENTRY FOR LESSON", lesson);
                                            }}
                                            className={cn(
                                              "p-1 px-2 border transition-all rounded-sm flex items-center gap-1 cursor-pointer",
                                              lessonAbsences.length > 0 
                                                ? "text-red-600 bg-red-50 border-red-200 hover:bg-red-100" 
                                                : "text-gray-400 border-transparent hover:text-red-700 hover:bg-red-50 hover:border-red-100"
                                            )}
                                            title={`Unesi izostanke${lessonAbsences.length > 0 ? ` (Prijavljeno: ${lessonAbsences.length})` : ''}`}
                                          >
                                            <UserX size={12} />
                                          </button>
                                          <button 
                                            onClick={() => openLessonModal(hour, lesson)}
                                            className="p-1 px-2 text-gray-400 hover:text-[#005c8d] hover:bg-white border border-transparent hover:border-gray-200 transition-all rounded-sm"
                                            title="Uredi"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button 
                                            onClick={(e) => handleLessonDelete(e, lesson.id)}
                                            className="p-1 px-2 text-gray-400 hover:text-red-500 hover:bg-white border border-transparent hover:border-gray-200 transition-all rounded-sm"
                                            title="Obriši"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
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
                        <td className="p-2 align-middle text-center">
                          {isOccupied ? (
                            <div className="flex flex-col gap-1 items-center">
                               {lessons.map(l => (
                                 <span key={`status-${l.id}`} className={cn("text-[8px] font-bold px-1 uppercase border", l.isHeld ? "bg-green-50 text-green-600 border-green-200" : "bg-red-50 text-red-600 border-red-200")}>
                                   {l.isHeld ? "Održano" : "Nije odr."}
                                 </span>
                               ))}
                            </div>
                          ) : (
                            <span className="text-[9px] text-gray-200 font-bold uppercase">Upis...</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 w-full max-w-4xl flex flex-col max-h-[95vh] shadow-[10px_10px_0px_rgba(0,0,0,0.05)]">
            <div className="bg-[#005c8d] p-2 text-white flex items-center justify-between shrink-0">
              <h3 className="text-[11px] font-bold uppercase tracking-tight">Unos podataka za {editingHour}. sat</h3>
              <button onClick={() => setShowLessonModal(false)} className="hover:text-red-200"><X size={16} /></button>
            </div>
            
            <div className="flex border-b border-gray-300 shrink-0 bg-gray-50 text-[10px] font-bold uppercase">
              <button 
                onClick={() => setActiveLessonTab('SADRZAJ')}
                className={cn("px-6 py-2 border-r border-gray-200", activeLessonTab === 'SADRZAJ' ? "bg-white text-[#005c8d] border-b-2 border-b-[#005c8d]" : "text-gray-500 hover:bg-gray-100")}
              >
                Sadržaj sata
              </button>
              <button 
                onClick={() => setActiveLessonTab('IZOSTANCI')}
                className={cn("px-6 py-2 border-r border-gray-200", activeLessonTab === 'IZOSTANCI' ? "bg-white text-[#005c8d] border-b-2 border-b-[#005c8d]" : "text-gray-500 hover:bg-gray-100")}
              >
                Učenici (Izostanci)
              </button>
              <button 
                onClick={() => setActiveLessonTab('MATERIJALI')}
                className={cn("px-6 py-2 border-r border-gray-200", activeLessonTab === 'MATERIJALI' ? "bg-white text-[#005c8d] border-b-2 border-b-[#005c8d]" : "text-gray-500 hover:bg-gray-100")}
              >
                Opis / Napomena
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeLessonTab === 'SADRZAJ' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
                   <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-gray-500 uppercase block tracking-tight">Status sata</label>
                        <div className="flex border border-gray-300">
                          <button 
                            onClick={() => setLessonForm({...lessonForm, isHeld: true})}
                            className={cn("flex-1 py-1 font-bold uppercase border-r border-gray-300", lessonForm.isHeld ? "bg-[#005c8d] text-white" : "bg-white text-gray-400")}
                          >
                            Održan
                          </button>
                          <button 
                            onClick={() => setLessonForm({...lessonForm, isHeld: false})}
                            className={cn("flex-1 py-1 font-bold uppercase", !lessonForm.isHeld ? "bg-red-600 text-white" : "bg-white text-gray-400")}
                          >
                            Nije održan
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase block tracking-widest">Nastavni predmet</label>
                        <select 
                          className="w-full border border-gray-300 p-2 focus:border-[#005c8d] outline-none font-bold"
                          value={lessonForm.subjectId}
                          onChange={e => setLessonForm({...lessonForm, subjectId: e.target.value})}
                        >
                          <option value="">-- Odaberite predmet --</option>
                          {allSubjects
                            .filter(s => {
                              // Show all subjects assigned to this class
                              return subjectAssignments.some(a => a.subjectId === s.id && a.classId === effectiveClassId);
                            })
                            .map(s => {
                              const isMySubject = subjectAssignments.some(a => a.subjectId === s.id && a.classId === effectiveClassId && a.teacherId === user?.id);
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.name} {isMySubject ? '(Moji sat)' : ''}
                                </option>
                              );
                            })}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase block tracking-widest">Grupa</label>
                          <select 
                            className="w-full border border-gray-300 p-2 focus:border-[#005c8d] outline-none font-bold"
                            value={lessonForm.groupName || 'FULL_CLASS'}
                            onChange={e => setLessonForm({...lessonForm, groupName: e.target.value})}
                          >
                            <option value="FULL_CLASS">Cijeli razred</option>
                            <option value="GROUP_A">Grupa A</option>
                            <option value="GROUP_B">Grupa B</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase block tracking-widest">Blok sat</label>
                          <select 
                            className="w-full border border-gray-300 p-2 focus:border-[#005c8d] outline-none font-bold"
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
                            <option value="1">1 sat</option>
                            <option value="2">2 sata</option>
                            <option value="3">3 sata</option>
                            <option value="4">4 sata</option>
                            <option value="5">5 sati</option>
                            <option value="6">6 sati</option>
                            <option value="7">7 sati</option>
                            <option value="8">8 sati</option>
                          </select>
                        </div>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase block tracking-widest">Nastavna jedinica (tema) *</label>
                        <textarea 
                          rows={6}
                          className="w-full border border-gray-300 p-3 focus:border-[#005c8d] outline-none font-medium placeholder:font-normal placeholder:text-gray-300"
                          placeholder="Upišite naziv/sadržaj nastavne jedinice..."
                          value={lessonForm.topic}
                          onChange={e => setLessonForm({...lessonForm, topic: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase block tracking-widest">Bilješka nastavnika</label>
                        <textarea 
                          rows={2}
                          className="w-full border-2 border-gray-100 p-4 rounded-lg focus:border-[#005c8d] outline-none font-medium text-sm"
                          placeholder="Napomene, zadaća..."
                          value={lessonForm.notes}
                          onChange={e => setLessonForm({...lessonForm, notes: e.target.value})}
                        />
                      </div>
                   </div>
                </div>
              )}

              {activeLessonTab === 'IZOSTANCI' && (
                <div className="space-y-4">
                   <div className="bg-red-50 p-4 border border-red-100">
                      <h4 className="text-[10px] font-bold text-red-800 uppercase mb-3 flex items-center gap-2">
                        <UserIcon size={14} /> Odaberi učenike koji nisu prisutni
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {sortStudentsBySurname(students).map(s => {
                          const isSelected = selectedAbsentees.includes(s.id);
                          return (
                            <button 
                              key={`absentee-btn-${s.id}`}
                              onClick={() => {
                                if (isSelected) setSelectedAbsentees(prev => prev.filter(id => id !== s.id));
                                else setSelectedAbsentees(prev => [...prev, s.id]);
                              }}
                              className={cn(
                                "flex items-center gap-2 p-2 border transition-all text-left",
                                isSelected ? "bg-red-600 border-red-700 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                              )}
                            >
                              <div className={cn("w-2 h-2 border", isSelected ? "bg-white border-white" : "bg-gray-100 border-gray-300")} />
                              <span className="text-[10px] font-bold truncate">{s.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-[9px] text-gray-400 font-bold uppercase italic">
                         Odabrano učenika: {selectedAbsentees.length}
                      </div>
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

            <div className="bg-gray-50 p-3 border-t border-gray-300 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setShowLessonModal(false)}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 font-bold text-[10px] uppercase hover:bg-white"
              >
                Odustani
              </button>
              <button 
                onClick={saveLessonDetailed}
                className="px-6 py-1.5 bg-[#005c8d] text-white border border-[#004a70] font-bold text-[10px] uppercase hover:bg-[#004a70]"
              >
                Spremi podatke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABSENCE ENTRY MODAL (e-Dnevnik style) */}
      {showAbsenceEntryModal && absenceEntryLesson && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 w-full max-w-lg flex flex-col max-h-[85vh] shadow-[10px_10px_0px_rgba(0,0,0,0.05)] animate-fadeIn">
            <div className="bg-red-700 p-2 text-white flex items-center justify-between shrink-0">
              <h3 className="text-[11px] font-bold uppercase tracking-tight flex items-center gap-1.5">
                <UserX size={14} />
                <span>Odsutni učenici - {selectedDate ? new Date(selectedDate).toLocaleDateString('hr-HR') : ''}.</span>
              </h3>
              <button 
                onClick={() => {
                  setShowAbsenceEntryModal(false);
                  setAbsenceEntryLesson(null);
                }} 
                className="hover:text-red-200 cursor-pointer text-white border-none bg-transparent"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 bg-red-50/50 border-b border-gray-200 shrink-0 text-[11px]">
              <div className="font-bold text-gray-700 uppercase">
                Predmet: <span className="text-red-800">{absenceEntryLesson.hour}. sat / {allSubjects.find(s => s.id === absenceEntryLesson.subjectId)?.name || 'Nepoznato'}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1 italic leading-tight">
                Označite učenike koji nisu prisutni na ovom nastavnom satu.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="border border-gray-300 divide-y divide-gray-100 bg-white">
                {sortStudentsBySurname(students)
                  .map((student, idx) => {
                    const isSelected = absenceEntrySelectedStudents.includes(student.id);
                    return (
                      <div 
                        key={student.id} 
                        onClick={() => {
                          if (isSelected) {
                            setAbsenceEntrySelectedStudents(prev => prev.filter(id => id !== student.id));
                          } else {
                            setAbsenceEntrySelectedStudents(prev => [...prev, student.id]);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between p-2.5 hover:bg-red-50/30 transition-colors cursor-pointer text-[11px]",
                          isSelected ? "bg-red-50/40" : ""
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 font-bold w-4 text-right">{idx + 1}.</span>
                          <span className={cn("font-bold text-gray-800", isSelected && "text-red-800")}>
                            {student.name}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 text-red-600 focus:ring-red-500 border-gray-300 rounded cursor-pointer pointer-events-none"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="bg-gray-50 p-3 border-t border-gray-300 flex justify-end items-center gap-3 shrink-0">
              <div className="text-[10px] text-gray-500 font-bold uppercase mr-auto flex items-center gap-1">
                <span>Odabrano odsutnih:</span>
                <span className="text-red-700 font-black">{absenceEntrySelectedStudents.length}</span>
              </div>
              <button 
                onClick={() => {
                  setShowAbsenceEntryModal(false);
                  setAbsenceEntryLesson(null);
                }}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 font-bold text-[10px] uppercase hover:bg-white cursor-pointer"
              >
                Odustani
              </button>
              <button 
                onClick={handleSaveAbsenceEntry}
                className="px-6 py-1.5 bg-red-700 text-white border border-red-800 font-bold text-[10px] uppercase hover:bg-red-800 shadow-sm active:scale-95 cursor-pointer"
              >
                Unesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXAM MODAL */}
      {showExamModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 text-[11px]">
          <div className="bg-white border border-gray-300 w-full max-w-lg shadow-[10px_10px_0px_rgba(0,0,0,0.05)]">
            <div className="bg-[#005c8d] p-2 text-white flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-tight">Planiranje provjere</h3>
              <button onClick={() => setShowExamModal(false)} className="hover:text-red-200"><X size={16} /></button>
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
                  {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-tight block leading-none">Tip provjere</label>
                    <select 
                      className="w-full border border-gray-300 p-1.5 focus:outline-none font-bold"
                      value={examForm.type}
                      onChange={e => setExamForm({...examForm, type: e.target.value as any})}
                    >
                      <option value="PISMENA">Pismena provjera</option>
                      <option value="USMENA">Usmena provjera</option>
                    </select>
                 </div>
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
                onClick={() => setShowExamModal(false)}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 font-bold text-[10px] uppercase hover:bg-white"
              >
                Odustani
              </button>
              <button 
                onClick={saveExam}
                className="px-6 py-1.5 bg-[#005c8d] text-white border border-[#004a70] font-bold text-[10px] uppercase hover:bg-[#004a70]"
              >
                Spremi plan
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
                       {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                     {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                          const assignment = subjectAssignments.find(a => a.subjectId === subId);
                          setCellSubjectForm({
                            ...cellSubjectForm, 
                            subjectId: subId,
                            teacherId: assignment?.teacherId || ''
                          });
                        }}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                      >
                        <option value="">-- Odaberi predmet --</option>
                        {allSubjects
                          .filter(s => subjectAssignments.some(a => a.subjectId === s.id && a.classId === effectiveClassId))
                          .map(s => <option key={s.id} value={s.id}>{s.name}</option>)
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
                          <div className="text-[11px] font-black text-[#005c8d] uppercase">{sub?.name}</div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase">{formatPersonName(tea)} {s.classroom && `• ${s.classroom}`}</div>
                        </div>
                        <button 
                          onClick={() => handleRemoveScheduleSubject(s.id)}
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
        showTotp={deleteDialog.type === 'LESSON' && (isMainAdmin || highestRole === Role.ADMIN || (selectedClass && (selectedClass.homeroomTeacherId === user?.id || selectedClass.deputyTeacherId === user?.id)))}
      />
    </div>
  );
}

function ScheduleGrid({ title, shift, periods, days, onCellClick, getCellSubjects, allSubjects, teachers }: any) {
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
              <th className="w-20 border-r border-gray-300 bg-gray-100"></th>
              {periods.map(p => (
                <th key={p} className="p-2 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-300 last:border-r-0">
                  {p}. sat
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(day => (
              <tr key={day} className="border-b border-gray-300 last:border-b-0">
                <td className="bg-gray-100 border-r border-gray-300 p-2 text-center align-middle font-bold text-[10px] text-gray-500 uppercase">
                   {day}
                </td>
                {periods.map(period => {
                  const subjects = getCellSubjects(day, shift, period);
                  return (
                    <td 
                      key={`${day}-${period}`} 
                      onClick={() => onCellClick(day, period)}
                      className="p-1 border-r border-gray-300 last:border-r-0 cursor-pointer hover:bg-[#f0f9ff] text-[10px] h-20 align-top"
                    >
                       <div className="flex flex-col gap-1">
                         {subjects.map((s: any) => {
                            const sub = allSubjects.find((sub: any) => sub.id === s.subjectId);
                            const tea = teachers.find((t: any) => t.id === s.teacherId);
                            return (
                              <div key={s.id} className="bg-white border border-gray-200 p-1">
                                <div className="font-bold text-[#005c8d] uppercase leading-tight">{sub?.name}</div>
                                <div className="text-[8px] text-gray-400 font-bold uppercase">{formatPersonName(tea)} {s.classroom && `• ${s.classroom}`}</div>
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
