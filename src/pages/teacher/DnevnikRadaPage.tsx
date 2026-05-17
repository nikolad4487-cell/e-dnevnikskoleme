import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Lesson, Class, WorkWeek, User, Role, Exam, ClassSubjectTeacher as SubjectTeachingAssignment, CurriculumPlan } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { cn } from '../../lib/utils';
import { Calendar, Clock, Book, Plus, ArrowLeft, ArrowRight, X, ChevronRight, User as UserIcon, List, Trash2, LayoutGrid, Monitor, MapPin, CheckCircle, XCircle, Edit2 } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { toast } from 'react-hot-toast';

export default function DnevnikRadaPage({ initialView }: { initialView?: 'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE' }) {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin } = useAuth();
  const { selectedSchoolId } = useSelection();
  
  const effectiveClassId = routeClassId;

  const [classes, setClasses] = useState<Class[]>([]);
  const selectedClass = classes.find(c => c.id === effectiveClassId);
  const [students, setStudents] = useState<User[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  
  const [weeks, setWeeks] = useState<WorkWeek[]>([]);
  const [view, setView] = useState<'WEEKS' | 'WEEK_DETAIL' | 'DAY_DETAIL' | 'ABSENCES' | 'EXAMS' | 'SCHEDULE'>(initialView || 'WEEKS');
  const [selectedWeek, setSelectedWeek] = useState<WorkWeek | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dailyLessons, setDailyLessons] = useState<Lesson[]>([]);
  const [currentWeekAbsences, setCurrentWeekAbsences] = useState<any[]>([]);
  const [currentClassExams, setCurrentClassExams] = useState<Exam[]>([]);

  // Modal State - Week
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [newWeek, setNewWeek] = useState({
    name: '',
    startDate: '',
    endDate: '',
    shift: 'Ujutro' as 'Ujutro' | 'Popodne' | 'Cjelodnevna',
    isTeachingWeek: true,
    teachingDays: [] as string[],
    // Track which days are teaching days (Pon-Sub)
    dailyTeachingStatus: {
      0: false, // Ned
      1: true,  // Pon
      2: true,  // Uto
      3: true,  // Sri
      4: true,  // Čet
      5: true,  // Pet
      6: false  // Sub
    } as Record<number, boolean>
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
    type: 'LESSON' | 'EXAM' | 'WEEK' | null;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false
  });

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
          return [u.id, {
            ...u,
            name: u.name?.split(' ')[0] || '',
            surname: u.name?.split(' ').slice(1).join(' ') || '',
          }];
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
            name: u.name?.split(' ')[0] || '',
            surname: u.name?.split(' ').slice(1).join(' ') || '',
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

        setDailyLessons(mapList(data || [], mappers.lesson));
      } catch (error) {
        console.error(error);
        toast.error('Greška pri učitavanju sati za dan');
      }
    };
    fetchLessonsForDay();
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
            .order('date', { ascending: false });
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
          .single();

        if (ce) throw ce;
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
        .single();

      if (se) throw se;

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

  const handleCreateWeek = async () => {
    if (!effectiveClassId) return;
    try {
      const studentCount = students.length || 1;
      const startIdx = (weeks.length * 2) % studentCount;
      const onDuty = Array.from(new Set([
        students[startIdx]?.id || '',
        students[(startIdx + 1) % studentCount]?.id || ''
      ])).filter(id => id !== '');

      const days: string[] = [];
      let current = new Date(newWeek.startDate);
      const end = new Date(newWeek.endDate);
      while(current <= end) {
        const dayOfWeek = current.getDay();
        if (newWeek.dailyTeachingStatus[dayOfWeek]) {
          days.push(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
      }

      const { data, error } = await supabase
        .from('work_weeks')
        .insert({
          class_id: effectiveClassId,
          school_id: selectedSchoolId,
          name: newWeek.name,
          start_date: newWeek.startDate,
          end_date: newWeek.endDate,
          on_duty_student_ids: onDuty,
          teaching_days: days,
          shift: newWeek.shift,
          is_teaching_week: newWeek.isTeachingWeek
        })
        .select()
        .single();
        
      if (error) throw error;

      setWeeks([...weeks, mappers.week(data)]);
      setShowWeekModal(false);
      setNewWeek({ 
        name: '', 
        startDate: '', 
        endDate: '', 
        teachingDays: [], 
        shift: 'Ujutro', 
        isTeachingWeek: true,
        dailyTeachingStatus: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false }
      });
    } catch (err) {
      console.error(err);
      toast.error('Greška pri kreiranju tjedna');
    }
  };

  const openLessonModal = async (hour: number, lesson?: Lesson, defaultValues?: { subjectId: string, teacherId: string }) => {
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
          groupName: lesson.groupName || '',
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
          groupName: '',
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

    // RBAC: Admin or the teacher who created the lesson
    if (!isMainAdmin && lesson.teacherId !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ovog sata.');
      return;
    }

    setDeleteDialog({ isOpen: true, id: lessonId, type: 'LESSON', loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id || !deleteDialog.type) return;
    setDeleteDialog(prev => ({ ...prev, loading: true }));

    try {
      if (deleteDialog.type === 'LESSON') {
        const lessonId = deleteDialog.id;
        // 1. Delete the lesson
        const { error: le } = await supabase
          .from('lessons')
          .delete()
          .eq('id', lessonId);
        if (le) throw le;
        
        // 2. Clear from local state
        setDailyLessons(prev => prev.filter(l => l.id !== lessonId));
        
        // 3. Delete associated absences
        const { error: ae } = await supabase
          .from('absences')
          .delete()
          .eq('lesson_id', lessonId);
        if (ae) throw ae;

        // Also refresh the local absences if we are in a view that uses them
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
          date: selectedDate,
          hour: currentHour,
          is_held: lessonForm.isHeld,
          subject_id: lessonForm.subjectId,
          group_name: lessonForm.groupName || '',
          is_block: lessonForm.isBlock || false,
          block_count: lessonForm.blockCount || 1,
          topic: lessonForm.topic || '',
          notes: lessonForm.notes || '',
          materials: lessonForm.materials || '',
          teacher_id: lessonForm.teacherId || user.id,
          created_by_user_id: user.id,
          teacher_display_name: `${user.surname} ${user.name}`,
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
            .single();
          if (error) throw error;
          finalId = data.id;
          setDailyLessons(prev => [...prev, mappers.lesson(data)]);
        }

        if (finalId) {
          await supabase.from('absences').delete().eq('lesson_id', finalId);
          if (selectedAbsentees.length > 0) {
            const absencesPayload = selectedAbsentees.map(sid => ({
              student_id: sid,
              lesson_id: finalId,
              class_id: effectiveClassId,
              school_id: selectedSchoolId,
              date: selectedDate,
              hour: currentHour,
              status: 'CEKA',
              teacher_id: user.id,
              timestamp: new Date().toISOString()
            }));
            await supabase.from('absences').insert(absencesPayload);
          }
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

  const saveExam = async () => {
    if (!effectiveClassId || !examForm.date || !examForm.subjectId) return;
    try {
      const { data, error } = await supabase
        .from('exams')
        .insert({
          subject_id: examForm.subjectId,
          date: examForm.date,
          type: examForm.type,
          description: examForm.description,
          class_id: effectiveClassId,
          school_id: selectedSchoolId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;

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
          {view === 'WEEKS' && (
            <button 
              onClick={() => setShowWeekModal(true)}
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
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#f0f2f5]">
        
        {/* WEEKS LIST */}
        {view === 'WEEKS' && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white border border-gray-300 shadow-sm">
               <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight">Popis radnih tjedana</div>
               <table className="w-full text-left border-collapse text-[12px] ed-table-dense">
                 <thead>
                   <tr className="bg-gray-50 border-b border-gray-300">
                     <th className="px-4 py-2 font-bold uppercase text-gray-500 border-r border-gray-300">Naziv tjedna</th>
                     <th className="px-4 py-2 font-bold uppercase text-gray-500 w-48 border-r border-gray-300">Period</th>
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
                          <div className="text-[10px] text-gray-400 italic">Radni tjedan</div>
                       </td>
                       <td className="px-4 py-2 border-r border-gray-200">
                          <div className="text-[11px] font-bold text-gray-600">
                           {w.startDate ? new Date(w.startDate).toLocaleDateString('hr-HR') : ''} - {w.endDate ? new Date(w.endDate).toLocaleDateString('hr-HR') : ''}
                          </div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase">{w.shift}</div>
                       </td>
                       <td className="px-4 py-2 border-r border-gray-200 text-[11px] text-gray-500">
                          {Array.from(new Set(w.onDutyStudentIds || [])).map(sid => students.find(s => s.id === sid)?.surname).filter(Boolean).join(', ') || 'Nema dežurnih'}
                       </td>
                       <td className="px-4 py-2 text-center">
                          {(isMainAdmin || user?.role === Role.ADMIN) && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteDialog({ isOpen: true, id: w.id, type: 'WEEK', loading: false });
                              }}
                              className="p-1 px-2 text-gray-300 hover:text-red-500 hover:bg-white border border-transparent hover:border-gray-200 transition-all rounded-sm"
                            >
                              <Trash2 size={14} />
                            </button>
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
        )}

        {/* WEEK DETAIL - List of Days */}
        {view === 'WEEK_DETAIL' && selectedWeek && (
          <div className="max-w-4xl mx-auto">
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
          <div className="max-w-6xl mx-auto">
             <div className="bg-white border border-gray-300 shadow-sm overflow-hidden overflow-x-auto">
                <div className="bg-[#f8f9fa] border-b border-gray-300 px-4 py-2 font-bold text-[#005c8d] text-[11px] uppercase tracking-tight">Tjedni pregled izostanaka: {selectedWeek?.name}</div>
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
                    {students.sort((a,b) => (String(a.surname || "")).localeCompare(b.surname)).map(s => {
                      let total = 0;
                      return (
                        <tr key={`absence-row-${s.id}`} className="hover:bg-gray-50 transition-colors">
                          <td className="p-2 font-bold text-gray-700 bg-gray-50/20 border-r border-gray-200">{s.surname} {s.name}</td>
                          {selectedWeek?.teachingDays?.map(date => {
                            const count = currentWeekAbsences.filter(abs => abs.studentId === s.id && abs.date === date).length;
                            total += count;
                            return (
                              <td key={`absence-cell-${s.id}-${date}`} className="p-2 text-center border-r border-gray-200">
                                {count > 0 ? (
                                  <span className="font-bold text-red-600">
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-gray-200">—</span>
                                )}
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
          <div className="max-w-4xl mx-auto">
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
          <div className="max-w-6xl mx-auto space-y-8 pb-20">
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
        {/* DAY DETAIL VIEW - REDESIGNED TABLE */}
        {view === 'DAY_DETAIL' && effectiveClassId && selectedDate && selectedWeek && (
          <div className="max-w-6xl mx-auto space-y-3">
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
                  {Array.from(new Set(selectedWeek?.onDutyStudentIds || [])).map(sid => students.find(s => s.id === sid)?.surname).filter(Boolean).join(', ') || 'Nema dežurnih'}
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
                                
                                return (
                                  <div key={lesson.id} className={cn("text-[11px] leading-tight flex flex-col gap-1", idx > 0 && "pt-2 border-t border-gray-100")}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="font-bold text-[#005c8d] uppercase mb-0.5">
                                          {(sub?.name || 'Predmet').toUpperCase()} - {lesson.teacherDisplayName || (teacher ? `${teacher.surname} ${teacher.name}` : 'Nepoznat nastavnik')} {lesson.groupName ? <span className="text-gray-400 font-normal italic lowercase ml-1">({lesson.groupName})</span> : ''}
                                        </div>
                                        <div className={cn("text-gray-800 font-medium whitespace-pre-wrap", !lesson.isHeld && "line-through text-red-400")}>
                                          {lesson.isHeld ? (lesson.topic || <span className="text-gray-300 italic">Nije upisana tema...</span>) : "SAT NIJE ODRŽAN"}
                                        </div>
                                      </div>
                                      
                                      {canEdit && (
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <label className="text-[9px] font-black text-gray-400 uppercase block tracking-widest">Grupa (opcionalno)</label>
                          <input 
                            type="text" 
                            className="w-full border border-gray-300 p-2 focus:border-[#005c8d] outline-none font-bold placeholder:font-normal placeholder:text-gray-300"
                            value={lessonForm.groupName}
                            onChange={e => setLessonForm({...lessonForm, groupName: e.target.value})}
                            placeholder="Npr. Grupa A"
                          />
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
                        {students.sort((a,b) => (String(a.surname || "")).localeCompare(b.surname)).map(s => {
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
                              <span className="text-[10px] font-bold truncate">{s.surname} {s.name}</span>
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
              <h3 className="text-xl font-black uppercase tracking-tight">Novi radni tjedan</h3>
              <button onClick={() => setShowWeekModal(false)} className="hover:rotate-90 transition-transform"><X /></button>
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

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Smjena</label>
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
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Nastavni tjedan</label>
                   <div className="flex items-center gap-4 h-[52px]">
                     <button 
                       onClick={() => setNewWeek({...newWeek, isTeachingWeek: true})}
                       className={cn("flex-1 h-full rounded-lg font-black uppercase text-xs transition-all", newWeek.isTeachingWeek ? "bg-[#005c8d] text-white" : "bg-gray-100 text-gray-400")}
                     >
                       Da
                     </button>
                     <button 
                       onClick={() => setNewWeek({...newWeek, isTeachingWeek: false})}
                       className={cn("flex-1 h-full rounded-lg font-black uppercase text-xs transition-all", !newWeek.isTeachingWeek ? "bg-[#005c8d] text-white" : "bg-gray-100 text-gray-400")}
                     >
                       Ne
                     </button>
                   </div>
                 </div>
               </div>

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
                    onClick={handleCreateWeek}
                    disabled={!newWeek.name || !newWeek.startDate || !newWeek.endDate}
                    className="flex-1 bg-[#005c8d] text-white font-black py-4 rounded-lg uppercase tracking-widest hover:bg-[#004a70] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    Kreiraj tjedan
                  </button>
                  <button 
                    onClick={() => setShowWeekModal(false)}
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
                        {teachers.find(t => t.id === cellSubjectForm.teacherId) ? 
                          `${teachers.find(t => t.id === cellSubjectForm.teacherId)?.surname} ${teachers.find(t => t.id === cellSubjectForm.teacherId)?.name}` : 
                          'Odaberite predmet s nastavnikom'
                        }
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
                          <div className="text-[9px] text-gray-400 font-bold uppercase">{tea?.surname} {tea?.name} {s.classroom && `• ${s.classroom}`}</div>
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
                                <div className="text-[8px] text-gray-400 font-bold uppercase">{tea?.surname} {s.classroom && `• ${s.classroom}`}</div>
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
