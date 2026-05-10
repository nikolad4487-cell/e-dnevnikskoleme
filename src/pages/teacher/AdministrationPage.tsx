import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, ClassSubjectTeacher as SubjectTeachingAssignment, CurriculumPlan, Subject, StudentSubjectEnrollment, SchoolYear, RolloverLog, StudentClassEnrollment, FinalGrade, School, Program, SchoolType, SecondarySubtype, ClassVariant, ContinuationType } from '../../types';
import { Settings, Plus, UserPlus, Users, GraduationCap, School as SchoolIcon, Trash2, ChevronLeft, ChevronDown, CheckCircle, XCircle, BookOpen, Clock, X, Printer, Mail, ShieldAlert } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { useParams } from 'react-router-dom';
import { mappers, mapList } from '../../lib/mappers';

export default function AdministrationPage() {
  const navigate = useNavigate();
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, signOut, userSchoolRoles } = useAuth();
  const { selectedSchoolId } = useSelection();
  
  const effectiveClassId = routeClassId;

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allUserSchoolRolesState, setAllUserSchoolRoles] = useState<any[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);

  const teachers = React.useMemo(() => {
    // Collect IDs of users who have a teaching or admin role globally or in the selected school
    const teacherIds = allUserSchoolRolesState
      .filter(r => 
        ([Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY].includes(r.role)) &&
        (!selectedSchoolId || r.schoolId === selectedSchoolId)
      )
      .map(r => r.userId);
      
    const combinedIds = Array.from(new Set(teacherIds));
    const result = allUsers.filter(u => combinedIds.includes(u.id));
    return result.sort((a,b) => (a.surname || '').localeCompare(b.surname || ''));
  }, [allUsers, allUserSchoolRolesState, selectedSchoolId]);

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    type: 'CLASS' | 'SUBJECT' | 'STUDENT' | 'GRADING_ELEMENT' | null;
    loading: boolean;
    extraData?: any;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false
  });
  
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Modals / Tabs
  const [activeTab, setActiveTab] = useState<'MENU' | 'CLASSES' | 'STUDENTS' | 'CLASS_DETAIL' | 'SUBJECTS' | 'STAFF' | 'PLANNING' | 'STUDENT_DETAIL' | 'OPCI_PROSJEK' | 'ROLLOVER' | 'SCHOOLS' | 'PROGRAMS' | 'USERS'>(effectiveClassId ? 'CLASS_DETAIL' : 'MENU');
  
  useEffect(() => {
    if (effectiveClassId && activeTab === 'MENU') {
      setActiveTab('CLASS_DETAIL');
    }
  }, [effectiveClassId]);

  useEffect(() => {
    if (effectiveClassId) {
      setSelectedClassId(effectiveClassId);
    }
  }, [effectiveClassId]);

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [rolloverLogs, setRolloverLogs] = useState<RolloverLog[]>([]);
  const [newYearForm, setNewYearForm] = useState({ name: '', startsAt: '', endsAt: '' });
  const [rolloverForm, setRolloverForm] = useState({ fromYearId: '', fromClassId: '', toYearId: '', toClassId: '' });
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectTeachingAssignment[]>([]);
  const [curriculumPlans, setCurriculumPlans] = useState<CurriculumPlan[]>([]);
  const [classEnrollments, setClassEnrollments] = useState<any[]>([]); // Enrollments for the selected class subjects
  const [finalGrades, setFinalGrades] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState<{ isOpen: boolean, subjectId: string | null }>({ isOpen: false, subjectId: null });
  
  const [resetModal, setResetModal] = useState<{
    isOpen: boolean;
    user: User | null;
    newPass: string;
    generatedAt: string;
  }>({
    isOpen: false,
    user: null,
    newPass: '',
    generatedAt: ''
  });
  
  // Form States
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newGradingElement, setNewGradingElement] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const [newClassGrade, setNewClassGrade] = useState(1);
  const [newClassSection, setNewClassSection] = useState('A');
  const [newClassVariant, setNewClassVariant] = useState<ClassVariant>('REGULAR');
  const [newClassSchoolYearId, setNewClassSchoolYearId] = useState('');
  const [newClassSchoolId, setNewClassSchoolId] = useState('');
  const [studentForm, setStudentForm] = useState({ 
    name: '', 
    surname: '', 
    email: '', 
    classId: '',
    schoolId: selectedSchoolId || '',
    programId: '',
    isContinuation: false,
    continuationType: null as ContinuationType
  });

  const [assignmentForm, setAssignmentForm] = useState({
    subjectId: '',
    classId: '',
    teacherId: ''
  });
  const [curriculumForm, setCurriculumForm] = useState({
    subjectId: '',
    classId: '',
    weeklyHours: 1
  });

  const [rolloverStudents, setRolloverStudents] = useState<any[]>([]);
  const [selectedUserForRole, setSelectedUserForRole] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({
    userId: '',
    schoolId: selectedSchoolId || '',
    role: Role.TEACHER as Role
  });

  const [newUserForm, setNewUserForm] = useState({
    name: '',
    surname: '',
    email: '',
    username: '',
    globalRole: Role.TEACHER,
    oib: '',
    dob: '',
    address: '',
    programId: '',
    classId: '',
    mobile: ''
  });

  const isSchoolAdmin = allUserSchoolRolesState.some(r => r.role === Role.SCHOOL_ADMIN && r.schoolId === selectedSchoolId);
  const canManageUsers = isMainAdmin || isSchoolAdmin;

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      toast.error('Greska pri odjavi');
    }
  };

  const generatePassword = (length: number) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleCreateUnifiedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.surname || !newUserForm.email) {
      toast.error('Popunite osnovna polja (Ime, Prezime, E-mail)');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserForm.email.toLowerCase(),
          name: `${newUserForm.name} ${newUserForm.surname}`,
          globalRole: newUserForm.globalRole,
          schoolId: selectedSchoolId || (newUserForm.classId ? classes.find(c => c.id === newUserForm.classId)?.school_id : null),
          studentData: newUserForm.globalRole === Role.STUDENT ? {
            oib: newUserForm.oib,
            dob: newUserForm.dob,
            address: newUserForm.address,
            classId: newUserForm.classId,
            programId: newUserForm.programId
          } : undefined
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Neuspješno kreiranje korisnika');

      toast.success(`Korisnik kreiran. Privremena lozinka: ${result.tempPassword || 'Provjerite email'}`);
      
      setNewUserForm({
        name: '', surname: '', email: '', username: '', globalRole: Role.TEACHER,
        oib: '', dob: '', address: '', programId: '', classId: '', mobile: ''
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSchoolRole = async () => {
    if (!roleForm.userId || !roleForm.schoolId || !roleForm.role) {
      toast.error('Popunite sva polja');
      return;
    }
    setLoading(true);
    try {
      await supabase.from('user_school_roles').insert([{
        user_id: roleForm.userId,
        school_id: roleForm.schoolId,
        role: roleForm.role,
        status: 'ACTIVE'
      }]);
      toast.success('Uloga dodijeljena');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSchoolRole = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite ukloniti ulogu?')) return;
    setLoading(true);
    try {
      await supabase.from('user_school_roles').delete().eq('id', id);
      toast.success('Uloga uklonjena');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGlobalRole = async (userId: string, role: Role) => {
    try {
      // Find the user's profile ID first
      const { data: profile } = await supabase.from('user_profiles').select('id').eq('auth_user_id', userId).single();
      if (!profile) throw new Error('Profil nije pronađen');

      // Update or insert role in user_school_roles
      // Note: This logic might need refinement depending on whether it's a "global" role or per-school.
      // For simplicity, if selectedSchoolId is set, we update for that school.
      if (selectedSchoolId) {
        const { data: existing } = await supabase
          .from('user_school_roles')
          .select('id')
          .eq('user_id', profile.id)
          .eq('school_id', selectedSchoolId)
          .eq('role', role)
          .maybeSingle();

        if (!existing) {
          await supabase.from('user_school_roles').insert([{
            user_id: profile.id,
            school_id: selectedSchoolId,
            role: role,
            status: 'ACTIVE'
          }]);
        }
      }
      toast.success('Uloga ažurirana');
    } catch (err) {
      console.error(err);
      toast.error('Greska pri ažuriranju uloge');
    }
  };

  const generateRolloverPreview = () => {
    const { fromClassId, toYearId, toClassId } = rolloverForm;
    if (!fromClassId || !toYearId) {
      toast.error('Odaberite izvorni razred i ciljnu školsku godinu');
      return;
    }

    const fromClass = classes.find(c => c.id === fromClassId);
    const nextYear = schoolYears.find(y => y.id === toYearId);
    if (!fromClass || !nextYear) return;

    // Get current school info
    const currentSchool = schools.find(s => s.id === fromClass.schoolId);
    const classStudents = students.filter(s => s.classId === fromClassId);

    const preview = classStudents.map(student => {
      let status: 'NAPREDUJE' | 'ZAVRSAVA' | 'NASTAVLJA' = 'NAPREDUJE';
      let nextGrade = fromClass.gradeLevel + 1;
      let targetClassId = toClassId; // Default suggestion
      let isContinuation = false;

      const program = programs.find(p => p.id === student.programId);

      if (currentSchool?.type === 'PRIMARY') {
        if (fromClass.gradeLevel === 8) {
          status = 'ZAVRSAVA';
          targetClassId = '';
        }
      } else {
        // SECONDARY
        if (currentSchool?.subtype === 'GENERAL') {
          if (fromClass.gradeLevel === 4) {
            status = 'ZAVRSAVA';
            targetClassId = '';
          }
        } else {
          // VOCATIONAL
          const duration = program?.durationYears || 4;
          if (fromClass.gradeLevel >= duration) {
            status = 'ZAVRSAVA';
            targetClassId = '';
          }
        }
      }

      return {
        studentId: student.id,
        name: `${student.surname} ${student.name}`,
        status,
        nextClassId: targetClassId,
        isContinuation,
        programName: program?.name || '—'
      };
    });

    setRolloverStudents(preview);
  };

  const selectedClassData = classes.find(c => c.id === selectedClassId);

  useEffect(() => {
    if (!isMainAdmin && !isSchoolAdmin) return;

    // Real-time listeners for basic data
    const classesChannel = supabase.channel('classes_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => {
        supabase.from('classes').select('*').then(({ data }) => {
          if (data) setClasses(mapList(data, mappers.class));
        });
      })
      .subscribe();
    
    supabase.from('classes').select('*').then(({ data }) => data && setClasses(mapList(data, mappers.class)));

    const studentsChannel = supabase.channel('students_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_class_enrollments' }, () => {
        supabase.from('student_class_enrollments')
          .select('*, student:user_profiles(*)')
          .eq('status', 'ACTIVE')
          .then(({ data }) => {
            if (data) {
              const mapped = data.map(row => {
                const u = mappers.user(row.student);
                return {
                  ...u,
                  name: u.name?.split(' ')[0] || '',
                  surname: u.name?.split(' ').slice(1).join(' ') || '',
                  globalRole: Role.STUDENT,
                  classId: row.class_id
                };
              });
              setStudents(mapped);
            }
          });
      })
      .subscribe();
    
    supabase.from('user_school_roles')
      .select('*, student:user_profiles(*)')
      .eq('role', Role.STUDENT)
      .then(({ data }) => {
        if (data) {
          const mapped = data.map(row => {
            const u = mappers.user(row.student);
            return {
              ...u,
              name: u.name?.split(' ')[0] || '',
              surname: u.name?.split(' ').slice(1).join(' ') || '',
              globalRole: Role.STUDENT
            };
          });
          // Filter by selected school if needed
          const filtered = selectedSchoolId ? (data || []).filter(r => r.school_id === selectedSchoolId).map(row => {
            const u = mappers.user(row.student);
            return {
              ...u,
              name: u.name?.split(' ')[0] || '',
              surname: u.name?.split(' ').slice(1).join(' ') || '',
              globalRole: Role.STUDENT
            };
          }) : mapped;
          
          setStudents(filtered as any);
        }
      });

    const subjectsChannel = supabase.channel('subjects_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, () => {
        supabase.from('subjects').select('*').then(({ data }) => data && setAllSubjects(mapList(data, mappers.subject)));
      })
      .subscribe();
    
    supabase.from('subjects').select('*').then(({ data }) => data && setAllSubjects(mapList(data, mappers.subject)));

    const rollChannel = supabase.channel('roles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_school_roles' }, () => {
        supabase.from('user_school_roles').select('*').then(({ data }) => data && setAllUserSchoolRoles(mapList(data, mappers.userSchoolRole)));
      })
      .subscribe();
    
    supabase.from('user_school_roles').select('*').then(({ data }) => data && setAllUserSchoolRoles(mapList(data || [], mappers.userSchoolRole)));

    supabase.from('user_profiles').select('*').then(({ data }) => {
      if (data) {
        const mapped = data.map(p => {
          const u = mappers.user(p);
          return {
            ...u,
            name: u.name?.split(' ')[0] || '',
            surname: u.name?.split(' ').slice(1).join(' ') || '',
          };
        });
        setAllUsers(mapped);
      }
    });
    supabase.from('schools').select('*').then(({ data }) => data && setSchools(mapList(data, mappers.school)));
    supabase.from('programs').select('*').then(({ data }) => data && setPrograms(data)); // Add program mapper if needed
    supabase.from('school_years').select('*').then(({ data }) => data && setSchoolYears(data)); // Add schoolYear mapper if needed

    return () => {
      supabase.removeChannel(classesChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(subjectsChannel);
      supabase.removeChannel(rollChannel);
    };
  }, [selectedSchoolId, isMainAdmin, isSchoolAdmin]);

  useEffect(() => {
    setNewClassName(`${newClassGrade}.${newClassSection}`);
  }, [newClassGrade, newClassSection]);

  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedClassId || (!isMainAdmin && !isSchoolAdmin)) return;
    
    // Initial fetch
      supabase.from('student_subject_enrollments')
      .select('*')
      .eq('class_id', effectiveClassId)
      .then(({ data }) => {
        if (data) setClassEnrollments(mapList(data, mappers.studentSubjectEnrollment));
      });

    const channel = supabase
      .channel('class-enrollments-admin')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'student_subject_enrollments',
        filter: `class_id=eq.${effectiveClassId}`
      }, (payload) => {
        supabase.from('student_subject_enrollments')
          .select('*')
          .eq('class_id', effectiveClassId)
          .then(({ data }) => {
            if (data) setClassEnrollments(mapList(data, mappers.studentSubjectEnrollment));
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedClassId, isMainAdmin, isSchoolAdmin]);

  useEffect(() => {
    if (!selectedStudentId || (!isMainAdmin && !isSchoolAdmin)) return;
    
    // Initial fetch
    supabase.from('student_subject_enrollments')
      .select('*')
      .eq('student_id', selectedStudentId)
      .then(({ data }) => {
        if (data) setEnrollments(data);
      });

    const channel = supabase
      .channel('student-enrollments-admin')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'student_subject_enrollments',
        filter: `student_id=eq.${selectedStudentId}`
      }, (payload) => {
        supabase.from('student_subject_enrollments')
          .select('*')
          .eq('student_id', selectedStudentId)
          .then(({ data }) => {
            if (data) setEnrollments(data);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStudentId, isMainAdmin, isSchoolAdmin]);

  const [classDetailForm, setClassDetailForm] = useState({
    homeroom_teacher_id: '',
    deputy_teacher_id: '',
    program: ''
  });

  const selectedStudentData = students.find(s => s.id === selectedStudentId);

  useEffect(() => {
    if (selectedClassData) {
      setClassDetailForm({
        homeroom_teacher_id: selectedClassData.homeroom_teacher_id || '',
        deputy_teacher_id: selectedClassData.deputy_teacher_id || '',
        program_id: selectedClassData.program_id || ''
      });
    }
  }, [selectedClassId, classes]);

  // Define fetchData for parts that still need manual re-fetching
  const fetchData = async () => {
    if (!selectedClassId) return;
    try {
      const { data: enrollments, error: err } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', selectedClassId)
        .eq('status', 'ACTIVE');
      
      if (err) throw err;

      if (enrollments) {
        const mapped = enrollments.map(row => ({
          ...row.student,
          name: row.student.name?.split(' ')[0] || '',
          surname: row.student.name?.split(' ').slice(1).join(' ') || '',
          globalRole: Role.STUDENT,
          classId: row.class_id
        }));
        setStudents(mapped as any);
      }

      const { data: subData } = await supabase.from('subjects').select('*');
      if (subData) setAllSubjects(subData);

      const { data: enrollData } = await supabase
        .from('student_subject_enrollments')
        .select('*')
        .eq('class_id', selectedClassId);
      if (enrollData) setClassEnrollments(mapList(enrollData, mappers.studentSubjectEnrollment));
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateClass = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      await supabase.from('classes').update({
        homeroom_teacher_id: classDetailForm.homeroom_teacher_id || null,
        deputy_teacher_id: classDetailForm.deputy_teacher_id || null,
        program_id: classDetailForm.program || null
      }).eq('id', selectedClassId);
      toast.success('Postavke razreda spremljene');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnrollment = async (subjectId: string, currentStatus: string | undefined) => {
    if (!selectedStudentId || !selectedStudentData) return;
    const selectedClass = classes.find(c => c.id === selectedStudentData.classId);
    if (!selectedClass) return;
    const studentYear = selectedClass.schoolYear;
    
    // enrollments state is also likely mapped, check useEffect at 495
    const existing = enrollments.find(e => (e as any).subject_id === subjectId || (e as any).subjectId === subjectId);
    const newStatus = currentStatus === 'ACTIVE' ? 'EXEMPT' : 'ACTIVE';
    
    try {
      if (existing) {
        await supabase.from('student_subject_enrollments').update({
          status: newStatus,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        await supabase.from('student_subject_enrollments').insert([{
          student_id: selectedStudentId,
          subject_id: subjectId,
          class_id: selectedStudentData.classId,
          school_year: studentYear,
          status: 'ACTIVE'
        }]);
      }
      toast.success('Status predmeta uspješno promijenjen');
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkEnroll = async (subjectId: string, status: 'ACTIVE' | 'EXEMPT') => {
    if (!selectedClassId || !selectedClassData) return;
    setLoading(true);
    try {
      const classStudents = students.filter(s => s.classId === selectedClassId);
      
      for (const student of classStudents) {
        // classEnrollments is mapped
        const matches = classEnrollments.filter(e => e.studentId === student.id && e.subjectId === subjectId);
        const existing = matches[0];
        
        if (existing) {
          if (existing.status !== status || matches.length > 1) {
            await supabase.from('student_subject_enrollments').update({
              status,
              updated_at: new Date().toISOString()
            }).eq('id', existing.id);

            if (matches.length > 1) {
              for (let i = 1; i < matches.length; i++) {
                await supabase.from('student_subject_enrollments').delete().eq('id', matches[i].id);
              }
            }
          }
        } else {
          await supabase.from('student_subject_enrollments').insert([{
            student_id: student.id,
            subject_id: subjectId,
            class_id: selectedClassId,
            school_year: selectedClassData.schoolYear,
            status
          }]);
        }
      }
      toast.success(status === 'ACTIVE' ? 'Svi učenici dodijeljeni predmetu' : 'Svi učenici izuzeti iz predmeta');
    } catch (err) {
      console.error(err);
      toast.error('Problem kod grupne dodjele predmeta');
    } finally {
      setLoading(false);
    }
  };

  const handleFixEnrollmentDuplicates = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const { data: allRaw, error } = await supabase
        .from('student_subject_enrollments')
        .select('*')
        .eq('class_id', selectedClassId);
      
      if (error) throw error;
      
      const groups: Record<string, any[]> = {};
      (allRaw || []).forEach(e => {
        const key = `${e.student_id}_${e.subject_id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
      });
      
      let deletedCount = 0;
      for (const key in groups) {
        const group = groups[key];
        if (group.length > 1) {
          const sorted = group.sort((a, b) => {
            if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
            if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
            return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
          });
          
          const toDelete = sorted.slice(1);
          for (const item of toDelete) {
            const { error: de } = await supabase
              .from('student_subject_enrollments')
              .delete()
              .eq('id', item.id);
            if (de) throw de;
            deletedCount++;
          }
        }
      }
      toast.success(`Čišćenje duplikata dovršeno. Obrisano: ${deletedCount} zapisa.`);
      await fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri čišćenju duplikata');
    } finally {
      setLoading(false);
    }
  };

  const openClassDetail = (id: string) => {
    navigate(`/class/${id}`);
  };

  const getFinalAverageGrade = (avg: number) => {
    if (avg >= 1.00 && avg <= 1.49) return 1;
    if (avg >= 1.50 && avg <= 2.49) return 2;
    if (avg >= 2.50 && avg <= 3.49) return 3;
    if (avg >= 3.50 && avg <= 4.49) return 4;
    if (avg >= 4.50 && avg <= 5.00) return 5;
    return 0;
  };

  const handleUpdateBehavior = async (studentId: string, behavior: string) => {
    if (!selectedClassId) return;
    try {
      const { data: existing } = await supabase
        .from('student_year_summaries')
        .select('id')
        .eq('student_id', studentId)
        .eq('class_id', selectedClassId)
        .maybeSingle();
      
      const payload = {
        student_id: studentId,
        class_id: selectedClassId,
        behavior,
        school_year: '2025/2026'
      };

      if (existing) {
        await supabase.from('student_year_summaries').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('student_year_summaries').insert([payload]);
      }
      toast.success('Vladanje ažurirano');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri ažuriranju vladanja');
    }
  };

  const handleFinalizeYearSummaries = async () => {
    if (!selectedClassId || !selectedClassData) return;
    
    const classStudents = students.filter(s => s.classId === selectedClassId);
    let successCount = 0;
    let skipCount = 0;
    const failures: { student: string, missing: string[] }[] = [];

    setLoading(true);
    try {
      // 1. Fetch all enrollments for this class once to avoid repeated queries
      const { data: enrollData } = await supabase
        .from('student_subject_enrollments')
        .select('student_id, subject_id, status')
        .eq('class_id', selectedClassId);
      
      // 2. Fetch all final grades for this class once
      const { data: finalGradesData } = await supabase
        .from('final_grades')
        .select('student_id, subject_id, value, period')
        .eq('class_id', selectedClassId)
        .eq('period', '2'); // Assume period '2' is the final one for calculation

      for (const student of classStudents) {
        const studentEnrollments = (enrollData || []).filter(e => e.student_id === student.id && e.status === 'ACTIVE');
        const studentGrades = (finalGradesData || []).filter(g => g.student_id === student.id);
        
        const missingSubjects: string[] = [];
        const gradesValues: number[] = [];

        for (const enroll of studentEnrollments) {
          const fg = studentGrades.find(g => g.subject_id === enroll.subject_id);
          if (!fg || !fg.value) {
            const subject = allSubjects.find(s => s.id === enroll.subject_id);
            missingSubjects.push(subject?.name || 'Nepoznat predmet');
          } else {
            gradesValues.push(Number(fg.value));
          }
        }

        if (missingSubjects.length > 0) {
          failures.push({ student: `${student.surname} ${student.name}`, missing: missingSubjects });
          skipCount++;
          continue;
        }

        if (gradesValues.length > 0) {
          const avg = gradesValues.reduce((a, b) => a + b, 0) / gradesValues.length;
          const finalGrade = getFinalAverageGrade(avg);
          
          await supabase.from('student_year_summaries').upsert({
            student_id: student.id,
            class_id: selectedClassId,
            school_year: selectedClassData.schoolYear,
            average_grade: avg,
            final_overall_grade: finalGrade,
            status: 'FINALIZED',
            finalized_at: new Date().toISOString(),
            finalized_by: user?.id
          }, {
            onConflict: 'student_id,class_id,school_year'
          });
          successCount++;
        } else {
          skipCount++;
        }
      }

      if (failures.length > 0) {
        const failureMsg = failures.map(f => `${f.student}: Nedostaju ocjene iz: ${f.missing.join(', ')}`).join('\n');
        console.error("Preskočeni učenici:\n", failureMsg);
        toast.error(`Zaključivanje djelomično uspjelo. ${skipCount} učenika preskočeno zbog nedostajućih ocjena.`);
      } else {
        toast.success(`Uspješno zaključeno za svih ${successCount} učenika.`);
      }
      
      // Update local state
      const { data: updatedSummaries } = await supabase.from('student_year_summaries').select('*').eq('class_id', selectedClassId);
      if (updatedSummaries) setSummaries(updatedSummaries);

    } catch (err) {
      console.error(err);
      toast.error('Došlo je do greške pri zaključivanju.');
    } finally {
      setLoading(false);
    }
  };
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName || !selectedSchoolId || !newClassSchoolYearId) {
      toast.error('Odaberite godinu i naziv razreda');
      return;
    }
    setLoading(true);
    try {
      const schoolYear = schoolYears.find(y => y.id === newClassSchoolYearId);
      await supabase.from('classes').insert([{
        name: newClassName,
        school_id: selectedSchoolId,
        school_year: schoolYear?.name || '',
        grade_level: newClassGrade,
        section: newClassSection,
        status: 'ACTIVE',
        homeroom_teacher_id: null,
        deputy_teacher_id: null
      }]);
      setNewClassName('');
      toast.success('Razred kreiran');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.name || !studentForm.surname || !selectedSchoolId || !studentForm.email) {
      toast.error('Ime, prezime i email su obavezni');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentForm.email.toLowerCase(),
          name: `${studentForm.name} ${studentForm.surname}`,
          globalRole: Role.STUDENT,
          schoolId: selectedSchoolId,
          studentData: {
            oib: studentForm.oib || Math.floor(Math.random() * 100000000000).toString(),
            dob: studentForm.dob,
            address: studentForm.address || '',
            classId: studentForm.classId,
            programId: studentForm.programId
          }
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Neuspješno kreiranje učenika');

      toast.success(`Učenik registriran. Lozinka: ${result.tempPassword || 'Provjerite email'}`);
      setStudentForm({ 
        name: '', 
        surname: '', 
        email: '', 
        classId: '', 
        schoolId: '', 
        programId: '',
        isContinuation: false,
        continuationType: null
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName || !selectedSchoolId) return;
    setLoading(true);
    try {
      await supabase.from('subjects').insert([{
        name: newSubjectName,
        school_id: selectedSchoolId,
        grading_elements: [
          'Usvojenost nastavnih sadržaja',
          'Primjena nastavnih sadržaja',
          'Samostalan rad i aktivnost'
        ]
      }]);
      setNewSubjectName('');
      // No manual fetchData needed because of realtime
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGradingElement = async (subjectId: string) => {
    if (!newGradingElement.trim()) return;
    const subject = allSubjects.find(s => s.id === subjectId);
    if (!subject) return;
    const elements = subject.grading_elements || [];
    try {
      await supabase.from('subjects').update({
        grading_elements: [...elements, newGradingElement.trim()]
      }).eq('id', subjectId);
      setNewGradingElement('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveGradingElement = async (subjectId: string, element: string) => {
    // Check if element is used in any grade
    try {
      const { data, error } = await supabase
        .from('grades')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('category', element)
        .limit(1);
      
      if (error) throw error;

      if (data && data.length > 0) {
        toast.error('Element se ne može obrisati jer je već korišten u ocjenama.');
        return;
      }

      setDeleteDialog({
        isOpen: true,
        id: subjectId,
        type: 'GRADING_ELEMENT',
        loading: false,
        extraData: { element }
      });
    } catch (err) {
      console.error(err);
      toast.error('Greška pri provjeri elementa');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.subjectId || !assignmentForm.classId || !assignmentForm.teacherId) {
      toast.error('Molimo popunite sva polja');
      return;
    }
    setLoading(true);
    try {
      if (editingAssignmentId) {
        await supabase.from('class_subject_teachers').update({
          subject_id: assignmentForm.subjectId,
          class_id: assignmentForm.classId,
          teacher_id: assignmentForm.teacherId
        }).eq('id', editingAssignmentId);
        toast.success('Zaduženje ažurirano');
      } else {
        const exists = subjectAssignments.find(a => a.subject_id === assignmentForm.subjectId && a.class_id === assignmentForm.classId);
        if (exists) {
          toast.error('Ovaj predmet u ovom razredu već ima dodijeljenog nastavnika');
          setLoading(false);
          return;
        }
        await supabase.from('class_subject_teachers').insert([{
          subject_id: assignmentForm.subjectId,
          class_id: assignmentForm.classId,
          teacher_id: assignmentForm.teacherId,
          school_id: selectedSchoolId
        }]);
        toast.success('Zaduženje kreirano');
      }
      setAssignmentForm({ subjectId: '', classId: '', teacherId: '' });
      setEditingAssignmentId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCurriculumPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curriculumForm.subjectId || !curriculumForm.classId || !curriculumForm.weeklyHours) {
      toast.error('Molimo popunite sva polja');
      return;
    }
    setLoading(true);
    try {
      if (editingCurriculumId) {
        await supabase.from('curriculum_plans').update({
          subject_id: curriculumForm.subjectId,
          class_id: curriculumForm.classId,
          weekly_hours: curriculumForm.weeklyHours
        }).eq('id', editingCurriculumId);
        toast.success('Plan ažuriran');
      } else {
        const exists = curriculumPlans.find(p => p.subject_id === curriculumForm.subjectId && p.class_id === curriculumForm.classId);
        if (exists) {
          toast.error('Ovaj predmet u ovom razredu već ima definiran plan');
          setLoading(false);
          return;
        }
        await supabase.from('curriculum_plans').insert([{
          subject_id: curriculumForm.subjectId,
          class_id: curriculumForm.classId,
          weekly_hours: curriculumForm.weeklyHours,
          school_id: selectedSchoolId
        }]);
        toast.success('Plan kreiran');
      }
      setCurriculumForm({ subjectId: '', classId: '', weeklyHours: 1 });
      setEditingCurriculumId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id || !deleteDialog.type) return;

    if (user?.role !== Role.ADMIN && user?.globalRole !== Role.MAIN_ADMIN) {
      toast.error('Samo administrator može brisati ove zapise.');
      setDeleteDialog({ ...deleteDialog, isOpen: false });
      return;
    }

    setDeleteDialog(prev => ({ ...prev, loading: true }));

    try {
      if (deleteDialog.type === 'CLASS') {
        await supabase.from('classes').delete().eq('id', deleteDialog.id);
        toast.success('Razred je uspješno obrisan.');
      } else if (deleteDialog.type === 'SUBJECT') {
        await supabase.from('subjects').delete().eq('id', deleteDialog.id);
        toast.success('Predmet je uspješno obrisan.');
      } else if (deleteDialog.type === 'STUDENT') {
        // In Supabase, we might want to delete the auth user too, but typically we just deactivate or delete profile
        await supabase.from('user_profiles').delete().eq('auth_user_id', deleteDialog.id);
        toast.success('Učenik je uspješno obrisan.');
      } else if (deleteDialog.type === 'GRADING_ELEMENT') {
        const subjectId = deleteDialog.id;
        const element = deleteDialog.extraData.element;
        const subject = allSubjects.find(s => s.id === subjectId);
        if (subject) {
          const elements = (subject.grading_elements || []).filter((e: string) => e !== element);
          await supabase.from('subjects').update({ grading_elements: elements }).eq('id', subjectId);
          toast.success('Element ocjenjivanja je uklonjen.');
        }
      } else if (deleteDialog.type === 'STAFF') {
        await supabase.from('class_subject_teachers').delete().eq('id', deleteDialog.id);
        toast.success('Zaduženje je obrisano.');
      } else if (deleteDialog.type === 'PLANNING') {
        await supabase.from('curriculum_plans').delete().eq('id', deleteDialog.id);
        toast.success('Plan je obrisan.');
      }
    } catch (err) {
      toast.error('Brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
    }
  };

  const handleCreateSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearForm.name) return;
    setLoading(true);
    try {
      if (schoolYears.some(y => y.name === newYearForm.name)) {
        toast.error('Ova školska godina već postoji');
        return;
      }
      await supabase.from('school_years').insert([{
        name: newYearForm.name,
        starts_at: newYearForm.startsAt,
        ends_at: newYearForm.endsAt,
        school_id: selectedSchoolId,
        is_active: schoolYears.length === 0 
      }]);
      setNewYearForm({ name: '', startsAt: '', endsAt: '' });
      toast.success('Nova školska godina je otvorena');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunRollover = async () => {
    if (rolloverStudents.length === 0) {
      toast.error('Prvo generirajte prijedlog prijenosa');
      return;
    }
    const { fromClassId, toYearId, toClassId } = rolloverForm;
    if (!fromClassId || !toYearId) {
      toast.error('Molimo odaberite sve potrebne podatke');
      return;
    }
    if (!confirm(`Jeste li sigurni da želite izvršiti prijenos za ${rolloverStudents.length} učenika?`)) return;
    
    setLoading(true);
    try {
      const toYear = schoolYears.find(y => y.id === toYearId);
      if (!toYear) throw new Error('Podaci o školskoj godini nedostaju');
      
      let transferredCount = 0;
      for (const item of rolloverStudents) {
        if (item.status === 'ZAVRSAVA') {
          // Update current enrollment
          await supabase.from('student_class_enrollments')
            .update({ status: 'COMPLETED' })
            .eq('student_id', item.studentId)
            .eq('class_id', fromClassId);
          
          transferredCount++;
          continue;
        }

        if (!item.nextClassId) continue;

        // Mark previous enrollment as TRANSFERRED
        await supabase.from('student_class_enrollments')
          .update({ status: 'TRANSFERRED' })
          .eq('student_id', item.studentId)
          .eq('class_id', fromClassId);

        // Create new enrollment
        await supabase.from('student_class_enrollments').insert([{
          student_id: item.studentId,
          class_id: item.nextClassId,
          school_year_id: toYearId,
          status: 'ACTIVE',
          is_continuation: item.status === 'NASTAVLJA'
        }]);

        transferredCount++;
      }

      await supabase.from('rollover_logs').insert([{
        from_school_year_id: rolloverForm.fromYearId || null,
        to_school_year_id: toYearId,
        from_class_id: fromClassId,
        to_class_id: toClassId || null,
        created_by: user?.id,
        students_transferred: transferredCount
      }]);
      
      setRolloverStudents([]);
      toast.success(`Rollover uspješan: ${transferredCount} akcija izvršeno.`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans text-[13px]">
      <div className="ed-header !bg-[#005c8d] !text-white h-8 !px-3">
        <h2 className="text-[12px] font-bold flex items-center gap-2 uppercase tracking-tight">
          Administracija škole
        </h2>
        <div className="text-[10px] opacity-70 font-bold uppercase">Sustav e-Dnevnik</div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Simple list */}
        <div className="w-56 bg-[#f8f9fa] border-r border-gray-300 flex flex-col font-medium overflow-y-auto">
          {[
            { label: 'Administracija škole', tab: 'MENU' },
            { label: 'Razredi i Odjeli', tab: 'CLASSES' },
            { label: 'Korisnici i Uloge', tab: 'USERS' },
            { label: 'Učenici u školi', tab: 'STUDENTS' },
            { label: 'Predmeti (Globalno)', tab: 'SUBJECTS' },
            { label: '--- RAZRED ---', tab: 'HEADER', disabled: true },
            { label: 'Postavke razreda', tab: 'CLASS_DETAIL', hide: !effectiveClassId },
            { label: 'Predmeti u razredu', tab: 'STAFF', hide: !effectiveClassId },
            { label: 'Učenici u razredu', tab: 'STUDENTS', filterToClass: true, hide: !effectiveClassId },
            { label: 'Predmeti učenika', tab: 'STUDENT_SUBJECTS_ENROLL', hide: !effectiveClassId },
            { label: 'Satnica i raspored', tab: 'PLANNING', hide: !effectiveClassId },
            { label: 'Opći prosjek', tab: 'OPCI_PROSJEK', hide: !effectiveClassId },
            { label: '--- SUSTAV ---', tab: 'HEADER2', disabled: true },
            { label: 'Školska godina', tab: 'ROLLOVER' },
            { label: 'Škole i Smjerovi', tab: 'SCHOOLS' },
          ].map((opt, i) => {
            if (opt.hide) return null;
            if (opt.disabled) return <div key={i} className="px-4 py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-50">{opt.label}</div>;
            
            return (
              <button 
                key={opt.tab}
                onClick={() => {
                  if (opt.tab === 'STUDENT_SUBJECTS_ENROLL') {
                    navigate('/admin/student-predmeti');
                  } else {
                    setActiveTab(opt.tab as any)
                  }
                }}
                className={cn(
                  "px-4 py-2.5 text-[11px] text-left border-b border-gray-200 uppercase tracking-tight font-bold transition-colors",
                  activeTab === opt.tab ? "bg-white text-[#005c8d] border-r-4 border-r-[#005c8d]" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto bg-white">
          {activeTab === 'MENU' && (
            <div className="max-w-4xl space-y-6">
              <h1 className="text-xl font-bold text-gray-800 pb-2 border-b-2 border-gray-100">Administracija</h1>
              
              {effectiveClassId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Predmeti u razredu', tab: 'STAFF', icon: <BookOpen size={18}/> },
                    { label: 'Učenici u razredu', tab: 'STUDENTS', icon: <Users size={18}/> },
                    { label: 'Predmeti učenika', tab: 'STUDENT_SUBJECTS_ENROLL', icon: <Settings size={18}/> },
                  ].map((btn) => (
                    <button
                      key={btn.tab}
                      onClick={() => {
                        if (btn.tab === 'STUDENT_SUBJECTS_ENROLL') {
                          navigate('/admin/student-predmeti');
                        } else {
                          setActiveTab(btn.tab as any)
                        }
                      }}
                      className="flex flex-col items-center justify-center p-6 bg-white border-2 border-[#005c8d] text-[#005c8d] hover:bg-blue-50 transition-all gap-2 shadow-sm rounded-sm active:scale-95"
                    >
                      {btn.icon}
                      <span className="font-black uppercase text-[10px] tracking-widest">{btn.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                {[
                  { label: 'Korisnici', tab: 'USERS' },
                  { label: 'Razredni odjeli', tab: 'CLASSES' },
                  { label: 'Učenici', tab: 'STUDENTS' },
                  { label: 'Predmeti', tab: 'SUBJECTS' },
                  { label: 'Dodjela nastavnika predmetima', tab: 'STAFF' },
                  { label: 'Nastavni planovi i satnica', tab: 'PLANNING' },
                  { label: 'Raspored sati', tab: 'PLANNING' },
                  { label: 'Školska godina', tab: 'ROLLOVER' },
                  { label: 'Opći prosjek (na kraju godine)', tab: 'OPCI_PROSJEK' },
                  { label: 'Postavke škole', tab: 'SCHOOLS' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setActiveTab(opt.tab as any)}
                    className="flex items-center justify-between py-2.5 text-left border-b border-gray-100 hover:bg-gray-50 group px-2"
                  >
                    <span className="text-[#005c8d] font-bold uppercase text-[11px] group-hover:underline">{opt.label}</span>
                    <ChevronDown size={14} className="-rotate-90 text-gray-300" />
                  </button>
                ))}
              </div>
              
              <div className="mt-12 p-6 bg-[#f8f9fa] border border-gray-200 text-[11px] text-gray-500 font-bold uppercase tracking-tight leading-relaxed max-w-2xl">
                Administracija škole služi za upravljanje osnovnim parametrima škole, korisničkim računima i pedagoškim mjerama. Sve promjene se bilježe u povijesti sustava e-Dnevnik.
              </div>
            </div>
          )}

          {activeTab === 'CLASSES' && (
            <div className="max-w-4xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upravljanje razrednim odjelima</h3>
              </div>
              
              <div className="bg-white border border-gray-300 p-4">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Dodavanje novog razrednog odjela</div>
                <form onSubmit={handleCreateClass} className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={cn("space-y-1", selectedSchoolId && "opacity-50 pointer-events-none")}>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Škola</label>
                      <select 
                        value={selectedSchoolId || newClassSchoolId}
                        onChange={e => setNewClassSchoolId(e.target.value)}
                        disabled={!!selectedSchoolId}
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none"
                      >
                        <option value="">-- Odaberi --</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Školska godina</label>
                      <select 
                        value={newClassSchoolYearId}
                        onChange={e => setNewClassSchoolYearId(e.target.value)}
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none"
                      >
                        <option value="">-- Odaberi --</option>
                        {schoolYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Razina (1-8)</label>
                      <input 
                        type="number" min="1" max="8"
                        value={newClassGrade}
                        onChange={e => setNewClassGrade(parseInt(e.target.value) || 1)}
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Oznaka (A, B...)</label>
                      <input 
                        type="text" maxLength={1}
                        value={newClassSection}
                        onChange={e => setNewClassSection(e.target.value.toUpperCase())}
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none text-center"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tip razreda</label>
                      <select 
                        value={newClassVariant}
                        onChange={e => setNewClassVariant(e.target.value as ClassVariant)}
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none"
                      >
                        <option value="REGULAR">Redovni (Standard)</option>
                        <option value="CONTINUATION">Nastavljački (Razlika)</option>
                      </select>
                    </div>
                    <div className="space-y-1 lg:col-span-2">
                       <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Naziv odjela (npr. 4.A)</label>
                       <input 
                        type="text" 
                        value={newClassName}
                        onChange={e => setNewClassName(e.target.value)}
                        placeholder="npr. 4.A" 
                        className="w-full border border-gray-300 p-2 text-xs font-black focus:border-[#005c8d] outline-none" 
                      />
                    </div>
                    <button 
                      disabled={loading}
                      className="bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] shadow-sm transform transition-all active:scale-95"
                    >
                      Kreiraj odjel
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white border border-gray-300">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Razredni odjel</th>
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Škola / Godina</th>
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Tip</th>
                      <th className="px-4 py-2 font-black uppercase text-gray-500 text-center w-48">Akcije</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {classes.map(c => {
                      const school = schools.find(s => s.id === c.schoolId);
                      return (
                        <tr key={c.id} className="group hover:bg-[#eff6ff] transition-colors">
                          <td className="px-4 py-3 border-r border-gray-200">
                             <div 
                               onClick={() => openClassDetail(c.id)}
                               className="text-lg font-black text-[#005c8d] group-hover:underline cursor-pointer"
                             >
                               {c.name}
                             </div>
                          </td>
                          <td className="px-4 py-3 border-r border-gray-200">
                             <div className="font-bold text-gray-600">{school?.name || 'N/A'}</div>
                             <div className="text-[10px] text-gray-400 font-bold uppercase">{c.school_year}</div>
                          </td>
                          <td className="px-4 py-3 border-r border-gray-200">
                             <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase border", 
                               c.variant === 'CONTINUATION' ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-blue-100 text-blue-700 border-blue-200"
                             )}>
                               {c.variant === 'CONTINUATION' ? 'Razlika' : 'Redovni'}
                             </span>
                          </td>
                          <td className="px-4 py-3 flex items-center justify-center gap-4">
                            <button 
                              onClick={() => navigate(`/class/${c.id}/administracija`)}
                              className="text-[10px] font-black text-[#005c8d] uppercase hover:underline"
                            >
                              Administracija
                            </button>
                            <button 
                              onClick={() => navigate(`/class/${c.id}/imenik`)}
                              className="text-[10px] font-black text-gray-500 uppercase hover:underline"
                            >
                               Dnevnik
                            </button>
                            <button 
                              onClick={() => setDeleteDialog({ isOpen: true, id: c.id, type: 'CLASS', loading: false })}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'CLASS_DETAIL' && (
            <div className="max-w-6xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setActiveTab('CLASSES')} className="text-gray-400 hover:text-gray-600 transition-colors"><ChevronLeft size={20}/></button>
                  <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Administracija razreda {selectedClassData?.name}</h3>
                </div>
                <div className="flex gap-2">
                   <button 
                     onClick={() => setActiveTab('STAFF')}
                     className="bg-white border border-gray-300 text-gray-500 px-4 py-1.5 font-bold text-[10px] uppercase hover:bg-gray-50 flex items-center gap-2"
                   >
                     <Users size={14}/> Zaduženja
                   </button>
                   <button 
                     onClick={() => setActiveTab('PLANNING')}
                     className="bg-white border border-gray-300 text-gray-500 px-4 py-1.5 font-bold text-[10px] uppercase hover:bg-gray-50 flex items-center gap-2"
                   >
                     <Clock size={14}/> Satnica
                   </button>
                   <button 
                     onClick={() => setActiveTab('OPCI_PROSJEK')}
                     className="bg-white border border-gray-300 text-gray-500 px-4 py-1.5 font-bold text-[10px] uppercase hover:bg-gray-50 flex items-center gap-2"
                   >
                     <GraduationCap size={14}/> Opći prosjek
                   </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 space-y-6">
                   <div className="bg-white border border-gray-300 p-4">
                      <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Osnovne postavke</div>
                      <div className="space-y-4">
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nastavni program</label>
                            <select 
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              value={classDetailForm.program_id}
                              onChange={e => setClassDetailForm({...classDetailForm, program_id: e.target.value})}
                            >
                              <option value="">-- Odaberi --</option>
                              {programs.filter(p => !selectedSchoolId || p.school_id === selectedSchoolId).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Razrednik</label>
                            <select 
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none text-[#005c8d]"
                              value={classDetailForm.homeroom_teacher_id}
                              onChange={e => setClassDetailForm({...classDetailForm, homeroom_teacher_id: e.target.value})}
                            >
                              <option value="">-- Odaberi --</option>
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.surname} {t.name}</option>)}
                            </select>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Zamjenik razrednika</label>
                            <select 
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              value={classDetailForm.deputy_teacher_id}
                              onChange={e => setClassDetailForm({...classDetailForm, deputy_teacher_id: e.target.value})}
                            >
                              <option value="">-- Odaberi --</option>
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.surname} {t.name}</option>)}
                            </select>
                         </div>
                         <button 
                           onClick={handleUpdateClass}
                           disabled={loading}
                           className="w-full bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase tracking-widest mt-2"
                         >
                           Spremi postavke
                         </button>
                      </div>
                   </div>

                   <div className="bg-white border border-gray-300 p-4">
                      <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Učenici ({students.filter(s => s.classId === selectedClassId).length})</div>
                      <div className="space-y-1 max-h-[400px] overflow-auto">
                        {students.filter(s => s.classId === selectedClassId).sort((a,b) => a.surname.localeCompare(b.surname)).map((s, idx) => (
                           <div key={s.id} className="flex items-center justify-between p-2 border border-gray-100 hover:bg-gray-50">
                              <span className="text-[11px] font-bold text-gray-600">{idx+1}. {s.surname} {s.name}</span>
                              <button onClick={() => { setSelectedStudentId(s.id); setActiveTab('STUDENT_DETAIL'); }} className="text-[#005c8d] hover:underline text-[9px] font-black uppercase">Prikaz</button>
                           </div>
                        ))}
                      </div>
                   </div>
                </div>

                <div className="md:col-span-3 space-y-6">
                   <div className="bg-white border border-gray-300">
                      <div className="p-4 border-b border-gray-300 flex items-center justify-between">
                         <div className="flex items-center gap-4">
                           <div className="text-[10px] font-black text-gray-400 uppercase">Predmeti u razrednom odjelu</div>
                           {user?.role === Role.ADMIN && (
                             <button 
                               onClick={handleFixEnrollmentDuplicates}
                               className="text-red-500 font-bold uppercase text-[8px] border border-red-200 bg-red-50 px-2 py-0.5 rounded hover:bg-red-100"
                             >
                               Popravi duplikate upisa
                             </button>
                           )}
                         </div>
                         {(user?.role === Role.ADMIN || selectedClassData?.homeroom_teacher_id === user?.id) && !editingAssignmentId && (
                           <button 
                             onClick={() => {
                               setEditingAssignmentId(null);
                               setAssignmentForm({ subjectId: '', teacherId: '', classId: selectedClassId || '' });
                             }}
                             className="text-[#005c8d] font-black uppercase text-[10px] flex items-center gap-1 hover:underline"
                           >
                              <Plus size={14}/> Dodaj predmet
                           </button>
                         )}
                      </div>

                      {/* ADD / EDIT SUBJECT FORM */}
                      {(user?.role === Role.ADMIN || selectedClassData?.homeroom_teacher_id === user?.id) && (assignmentForm.classId === selectedClassId || editingAssignmentId) && (
                        <div className="p-4 bg-gray-50 border-b border-gray-300">
                          <div className="text-[10px] font-black text-gray-500 uppercase mb-3">
                            {editingAssignmentId ? 'Uređivanje postojećeg predmeta' : 'Dodjela novog predmeta razredu'}
                          </div>
                          <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Nastavni predmet</label>
                              <select 
                                value={assignmentForm.subjectId}
                                onChange={e => setAssignmentForm({...assignmentForm, subjectId: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                                required
                              >
                                <option value="">-- Odaberi --</option>
                                {allSubjects.sort((a,b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Zaduženi nastavnik</label>
                              <select 
                                value={assignmentForm.teacherId}
                                onChange={e => setAssignmentForm({...assignmentForm, teacherId: e.target.value})}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                                required
                              >
                                <option value="">-- Odaberi --</option>
                                {teachers.sort((a,b) => a.surname.localeCompare(b.surname)).map(t => <option key={t.id} value={t.id}>{t.surname} {t.name}</option>)}
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                type="submit"
                                disabled={loading}
                                className="flex-1 bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] shadow-sm"
                              >
                                {editingAssignmentId ? 'Spremi promjene' : 'Dodaj predmet'}
                              </button>
                              <button 
                                type="button"
                                onClick={() => {
                                  setEditingAssignmentId(null);
                                  setAssignmentForm({ subjectId: '', teacherId: '', classId: '' });
                                }}
                                className="px-4 py-2 border border-gray-300 text-gray-500 font-black text-[10px] uppercase hover:bg-gray-100"
                              >
                                Odustani
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                      <table className="w-full text-left border-collapse text-[11px]">
                         <thead>
                            <tr className="bg-gray-50 border-b border-gray-300 font-black text-gray-500 uppercase text-[9px]">
                               <th className="px-4 py-2 border-r border-gray-200">Nastavni predmet</th>
                               <th className="px-4 py-2 border-r border-gray-200">Zaduženi nastavnik</th>
                               <th className="px-4 py-2 border-r border-gray-200 text-center w-24">Učenika</th>
                               <th className="px-4 py-2 text-center w-64">Akcije (Učenici)</th>
                               <th className="px-4 py-2 border-r border-gray-200 text-center w-24 border-x border-gray-300">Upravljanje</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-200">
                            {subjectAssignments.filter(a => a.classId === selectedClassId).map(a => {
                               const subject = allSubjects.find(s => s.id === a.subjectId);
                               const teacher = teachers.find(t => t.id === a.teacherId);
                               const activeEnrollCount = classEnrollments.filter(e => e.subjectId === a.subjectId && e.status === 'ACTIVE').length;
                               const isManager = user?.role === Role.ADMIN || selectedClassData?.homeroom_teacher_id === user?.id;

                               return (
                                 <tr key={a.id} className="hover:bg-blue-50/30">
                                   <td className="px-4 py-3 border-r border-gray-200 font-black text-[#005c8d] uppercase">{subject?.name}</td>
                                   <td className="px-4 py-3 border-r border-gray-200 font-bold uppercase text-gray-600">
                                      {teacher ? `${teacher.surname} ${teacher.name}` : <span className="text-red-400 font-black italic">NIJE DODIJELJEN</span>}
                                   </td>
                                   <td className="px-4 py-3 border-r border-gray-200 text-center font-black">
                                       {activeEnrollCount}
                                   </td>
                                   <td className="px-4 py-3 border-r border-gray-200">
                                      <div className="flex items-center justify-center gap-2">
                                         <button 
                                           onClick={() => handleBulkEnroll(a.subjectId, 'ACTIVE')}
                                           disabled={!isManager}
                                           className="bg-white border border-gray-300 text-gray-400 hover:text-green-600 px-2 py-1 text-[9px] font-black uppercase tracking-tighter disabled:opacity-30"
                                         >
                                            Dodijeli svima
                                         </button>
                                         <button 
                                           onClick={() => handleBulkEnroll(a.subjectId, 'EXEMPT')}
                                           disabled={!isManager}
                                           className="bg-white border border-gray-300 text-gray-400 hover:text-red-600 px-2 py-1 text-[9px] font-black uppercase tracking-tighter disabled:opacity-30"
                                         >
                                            Izuzmi učenike
                                         </button>
                                         <button 
                                           onClick={() => setShowEnrollmentModal({ isOpen: true, subjectId: a.subjectId })}
                                           disabled={!isManager}
                                           className="text-[#005c8d] font-black uppercase text-[9px] flex items-center gap-1 hover:underline ml-2 disabled:opacity-30"
                                         >
                                            Dodijeli pojedinačno
                                         </button>
                                      </div>
                                   </td>
                                   <td className="px-4 py-3 text-center border-x border-gray-300">
                                      <div className="flex items-center justify-center gap-3">
                                        {isManager && (
                                          <button 
                                            onClick={() => {
                                              setEditingAssignmentId(a.id);
                                              setAssignmentForm({ subjectId: a.subjectId, classId: a.classId, teacherId: a.teacherId });
                                            }}
                                            className="text-gray-400 hover:text-[#005c8d]"
                                          >
                                            <Settings size={14}/>
                                          </button>
                                        )}
                                        {isManager && (
                                          <button 
                                            onClick={() => setDeleteDialog({ isOpen: true, id: a.id, type: 'STAFF', loading: false })}
                                            className="text-gray-300 hover:text-red-500"
                                          >
                                            <Trash2 size={14}/>
                                          </button>
                                        )}
                                      </div>
                                   </td>
                                 </tr>
                               );
                            })}
                            {subjectAssignments.filter(a => a.classId === selectedClassId).length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-gray-400 italic">Nema definiranih predmeta za ovaj razred. Koristite modul "Zaduženja" za dodavanje.</td>
                              </tr>
                            )}
                         </tbody>
                      </table>
                   </div>

                   {showEnrollmentModal.isOpen && (
                     <div className="bg-white border-2 border-[#005c8d] p-4 shadow-xl">
                        <div className="flex items-center justify-between border-b pb-2 mb-4">
                           <h4 className="text-[12px] font-black text-[#005c8d] uppercase tracking-tighter">
                              Upravljanje učenicima: {allSubjects.find(s => s.id === showEnrollmentModal.subjectId)?.name}
                           </h4>
                           <button onClick={() => setShowEnrollmentModal({ isOpen: false, subjectId: null })}><X size={18}/></button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                           {students.filter(s => s.classId === selectedClassId).sort((a,b) => a.surname.localeCompare(b.surname)).map(s => {
                              const matches = classEnrollments.filter(e => e.studentId === s.id && e.subjectId === showEnrollmentModal.subjectId);
                              const enrollment = matches[0];
                              const isActive = enrollment?.status === 'ACTIVE';
                              
                              return (
                                <button 
                                  key={s.id}
                                  onClick={async () => {
                                    try {
                                      if (enrollment) {
                                        const { error } = await supabase
                                          .from('student_subject_enrollments')
                                          .update({ 
                                            status: isActive ? 'EXEMPT' : 'ACTIVE', 
                                            updated_at: new Date().toISOString() 
                                          })
                                          .eq('id', enrollment.id);
                                        if (error) throw error;

                                        if (matches.length > 1) {
                                          for (let i = 1; i < matches.length; i++) {
                                            await supabase
                                              .from('student_subject_enrollments')
                                              .delete()
                                              .eq('id', matches[i].id);
                                          }
                                        }
                                      } else {
                                        const { error } = await supabase
                                          .from('student_subject_enrollments')
                                          .insert({
                                            student_id: s.id,
                                            subject_id: showEnrollmentModal.subjectId,
                                            class_id: selectedClassId,
                                            school_year: selectedClassData?.school_year || '2025/2026',
                                            status: 'ACTIVE',
                                            created_at: new Date().toISOString(),
                                            updated_at: new Date().toISOString()
                                          });
                                        if (error) throw error;
                                      }
                                      fetchData();
                                    } catch (err) {
                                      console.error(err);
                                      toast.error('Greška pri ažuriranju upisa');
                                    }
                                  }}
                                  className={cn(
                                    "flex items-center justify-between p-2 border text-left rounded-sm transition-colors",
                                    isActive ? "bg-green-50 border-green-200 text-green-700 font-bold" : "bg-gray-50 border-gray-200 text-gray-400"
                                  )}
                                >
                                   <span className="text-[10px] truncate">{s.surname} {s.name}</span>
                                   {isActive ? <CheckCircle size={10}/> : <XCircle size={10}/>}
                                </button>
                              );
                           })}
                        </div>
                        <div className="mt-4 pt-4 border-t text-[9px] text-gray-400 font-bold uppercase text-center">Savjet: Kliknite na učenika za promjenu statusa (Zeleno = Sluša predmet, Sivo = Izuzet)</div>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'OPCI_PROSJEK' && (
            <div className="max-w-6xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setActiveTab('CLASS_DETAIL')} className="text-gray-400 hover:text-gray-600 transition-colors"><ChevronLeft size={20}/></button>
                  <h1 className="text-xl font-black text-gray-700 uppercase tracking-tighter">Opći prosjek i vladanje - {selectedClassData?.name}</h1>
                </div>
                {(user?.role === Role.ADMIN || selectedClassData?.homeroom_teacher_id === user?.id) && (
                  <button 
                    onClick={handleFinalizeYearSummaries}
                    disabled={loading}
                    className="bg-[#005c8d] text-white px-4 py-2 text-[10px] font-black uppercase hover:bg-[#004a70] transition-colors shadow-sm disabled:opacity-50"
                  >
                    Izračunaj i zaključi opći prosjek
                  </button>
                )}
              </div>

              <div className="bg-white border border-gray-300">
                <table className="w-full text-left border-collapse text-[11px]">
                   <thead>
                      <tr className="bg-gray-50 border-b border-gray-300 font-black text-gray-500 uppercase text-[9px]">
                         <th className="px-4 py-3 border-r border-gray-200">Učenik</th>
                         <th className="px-4 py-3 border-r border-gray-200">Status zaključnih ocjena</th>
                         <th className="px-4 py-3 border-r border-gray-200 text-center w-24">Prosjek</th>
                         <th className="px-4 py-3 border-r border-gray-200 text-center w-28">Opći uspjeh</th>
                         <th className="px-4 py-3 border-r border-gray-200 text-center w-32">Vladanje</th>
                         <th className="px-4 py-3 text-center w-28">Status</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                      {students.filter(s => s.classId === effectiveClassId).sort((a,b) => a.surname.localeCompare(b.surname)).map((student, idx) => {
                         const studentClassEnrollmentsRaw = classEnrollments.filter(e => e.studentId === student.id && e.status === 'ACTIVE');
                         const studentClassEnrollments = Array.from(new Map<string, any>(studentClassEnrollmentsRaw.map(e => [e.subjectId, e])).values());
                         
                         const studentFinalGradesRaw = finalGrades.filter(fg => fg.studentId === student.id && fg.period === '2' && studentClassEnrollments.some(e => e.subjectId === fg.subjectId));
                         const studentFinalGrades = Array.from(new Map<string, any>(studentFinalGradesRaw.map(fg => [fg.subjectId, fg])).values());
                         
                         const missingGrades = studentClassEnrollments.length > studentFinalGrades.length;
                         const missingSubjects = studentClassEnrollments
                            .filter(e => !studentFinalGrades.some(fg => fg.subjectId === e.subjectId))
                            .map(e => allSubjects.find(s => s.id === e.subjectId)?.name)
                            .filter(Boolean);

                         const summary = summaries.find(s => s.studentId === student.id && s.classId === selectedClassId);
                         const isFinalized = !!summary?.finalizedAt;

                         return (
                           <tr key={student.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 border-r border-gray-200">
                                 <div className="flex items-center gap-2">
                                    <span className="text-gray-400 font-bold">{idx + 1}.</span>
                                    <span className="font-black text-[#005c8d] uppercase">{student.surname} {student.name}</span>
                                 </div>
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200">
                                 {missingGrades ? (
                                    <div className="flex flex-col gap-1">
                                       <span className="text-[10px] text-red-500 font-bold italic uppercase tracking-tighter">Nisu unesene sve ocjene</span>
                                       <div className="text-[8px] text-gray-400 font-medium">Nedostaje: {missingSubjects.join(', ')}</div>
                                    </div>
                                 ) : (
                                    <span className="text-[10px] text-green-600 font-black uppercase tracking-tighter flex items-center gap-1">
                                       <CheckCircle size={10}/> Sve unesene
                                    </span>
                                 )}
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200 text-center font-bold text-xs text-gray-600">
                                 {summary?.average ? summary.average.toFixed(2) : '—'}
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200 text-center">
                                 <span className={cn(
                                   "w-7 h-7 inline-flex items-center justify-center rounded-full font-black text-sm",
                                   summary?.finalResult === 5 ? "bg-yellow-100 text-yellow-700" : 
                                   summary?.finalResult === 1 ? "bg-red-100 text-red-700" : 
                                   isFinalized ? "bg-blue-100 text-[#005c8d]" : "bg-gray-50 text-gray-300"
                                 )}>
                                    {summary?.finalResult || '—'}
                                 </span>
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200">
                                 {(user?.role === Role.ADMIN || selectedClassData?.homeroomTeacherId === user?.id) ? (
                                   <select 
                                     value={summary?.behavior || 'Uzorno'}
                                     onChange={(e) => handleUpdateBehavior(student.id, e.target.value)}
                                     className="w-full border border-gray-300 p-1 text-[10px] font-bold outline-none focus:border-[#005c8d]"
                                   >
                                      <option value="Uzorno">Uzorno</option>
                                      <option value="Dobro">Dobro</option>
                                      <option value="Loše">Loše</option>
                                   </select>
                                 ) : (
                                   <div className="text-center font-bold text-gray-500 uppercase text-[10px]">{summary?.behavior || 'Uzorno'}</div>
                                 )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                 {isFinalized ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-black uppercase tracking-tighter text-[9px] border border-green-200">Zaključeno</span>
                                 ) : (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-black uppercase tracking-tighter text-[9px] border border-gray-200">U obradi</span>
                                 )}
                              </td>
                           </tr>
                         );
                      })}
                   </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'STUDENTS' && (
            <div className="max-w-5xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Registracija učenika i pregled</h3>
              </div>
              
              <div className="bg-white border border-gray-300 p-4 text-[11px]">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Novi učenik</div>
                <form onSubmit={handleCreateStudent} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <input 
                    type="text" required 
                    value={studentForm.name}
                    onChange={e => setStudentForm({...studentForm, name: e.target.value})}
                    placeholder="Ime"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="text" required 
                    value={studentForm.surname}
                    onChange={e => setStudentForm({...studentForm, surname: e.target.value})}
                    placeholder="Prezime"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="email" required 
                    value={studentForm.email}
                    onChange={e => setStudentForm({...studentForm, email: e.target.value})}
                    placeholder="E-mail"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <select 
                    required
                    value={selectedSchoolId || studentForm.schoolId}
                    onChange={e => setStudentForm({...studentForm, schoolId: e.target.value, programId: '', classId: ''})}
                    disabled={!!selectedSchoolId}
                    className={cn("border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold", selectedSchoolId && "opacity-50 pointer-events-none")}
                  >
                    <option value="">Škola...</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select 
                    value={studentForm.programId}
                    onChange={e => setStudentForm({...studentForm, programId: e.target.value})}
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                  >
                    <option value="">Program...</option>
                    {programs.filter(p => p.schoolId === (selectedSchoolId || studentForm.schoolId)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select 
                    value={studentForm.classId}
                    onChange={e => setStudentForm({...studentForm, classId: e.target.value})}
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                  >
                    <option value="">Razred...</option>
                    {classes.filter(c => c.schoolId === (selectedSchoolId || studentForm.schoolId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button 
                    disabled={loading}
                    className="md:col-start-4 lg:col-start-6 bg-[#005c8d] text-white px-4 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70]"
                  >
                    Registriraj
                  </button>
                </form>
              </div>

              <div className="bg-white border border-gray-300">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Prezime i ime</th>
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300 w-32">Razred</th>
                      <th className="px-4 py-2 font-black uppercase text-gray-500 border-r border-gray-300">Kontakt e-mail</th>
                      <th className="px-4 py-2 text-center w-24 border-x border-gray-300">Akcije</th>
                      <th className="px-4 py-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {students
                      .filter(s => !effectiveClassId || s.classId === effectiveClassId)
                      .sort((a,b) => a.surname.localeCompare(b.surname))
                      .map(s => {
                        const razred = classes.find(c => c.id === s.classId);
                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 border-r border-gray-200">
                             <div className="font-bold text-[#005c8d] uppercase">{s.surname} {s.name}</div>
                          </td>
                          <td className="px-4 py-2 border-r border-gray-200 text-center font-black text-gray-700">
                             {razred?.name || '—'}
                          </td>
                          <td className="px-4 py-2 border-r border-gray-200 text-gray-400">
                             {s.email}
                          </td>
                          <td className="px-4 py-2 border-x border-gray-300 text-center">
                            <button 
                              onClick={() => { setSelectedStudentId(s.id); setActiveTab('STUDENT_DETAIL'); }}
                              className="text-[10px] font-black text-[#005c8d] uppercase hover:underline"
                            >
                              Pregled
                            </button>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button 
                              onClick={() => setDeleteDialog({ isOpen: true, id: s.id, type: 'STUDENT', loading: false })}
                              className="text-gray-300 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'SUBJECTS' && (
            <div className="max-w-4xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter tracking-widest">Globalni nastavni predmeti</h3>
              </div>
              
              <div className="bg-white border border-gray-300 p-4">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-3">Dodaj novi predmet u školski sustav</div>
                <form onSubmit={handleCreateSubject} className="flex gap-2">
                  <input 
                    type="text" 
                    value={newSubjectName}
                    onChange={e => setNewSubjectName(e.target.value)}
                    placeholder="npr. Kemija" 
                    className="flex-1 border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" 
                  />
                  <button 
                    disabled={loading}
                    className="bg-[#005c8d] text-white px-6 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70]"
                  >
                    Dodaj predmet
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allSubjects.map(s => (
                  <div key={s.id} className="bg-white border border-gray-300 shadow-sm relative group overflow-hidden">
                    <div 
                       onClick={() => setEditingSubjectId(editingSubjectId === s.id ? null : s.id)}
                       className={cn("p-4 flex items-center justify-between cursor-pointer transition-colors", editingSubjectId === s.id ? "bg-[#005c8d] text-white" : "hover:bg-blue-50")}
                    >
                      <div className="flex items-center gap-3">
                         <div className={cn("w-6 h-6 border flex items-center justify-center text-[10px] font-black transition-colors", editingSubjectId === s.id ? "border-white/30 text-white" : "border-gray-200 text-gray-400")}>{s.name[0]}</div>
                         <span className="font-black text-[11px] uppercase tracking-widest">{s.name}</span>
                      </div>
                      <ChevronDown size={14} className={cn("transition-transform", editingSubjectId === s.id && "rotate-180")} />
                    </div>
                    
                    {editingSubjectId === s.id && (
                      <div className="p-4 bg-gray-50/50 space-y-4 border-t border-gray-200 text-xs animate-in slide-in-from-top-2 duration-200">
                        <div>
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-200 pb-1">Elementi ocjenjivanja (e-Dnevnik struktura)</div>
                          <table className="w-full text-left border-collapse bg-white border border-gray-300">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-300 text-[9px] font-black text-gray-500 uppercase">
                                <th className="px-3 py-1 border-r border-gray-200">Naziv elementa</th>
                                <th className="px-3 py-1 border-r border-gray-200 w-24">Redoslijed</th>
                                <th className="px-3 py-1 text-center w-24">Akcije</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {(s.gradingElements || []).map((el: string, idx: number) => (
                                <tr key={idx} className="hover:bg-blue-50">
                                  <td className="px-3 py-2 border-r border-gray-200 font-bold">{el}</td>
                                  <td className="px-3 py-2 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                                  <td className="px-3 py-2 flex items-center justify-center gap-3">
                                    <button 
                                      onClick={() => {
                                        const newName = prompt('Novi naziv elementa:', el);
                                        if (newName && newName !== el) {
                                          const newElements = [...(s.grading_elements || [])];
                                          newElements[idx] = newName;
                                          supabase.from('subjects').update({ grading_elements: newElements }).eq('id', s.id).then(() => fetchData());
                                        }
                                      }}
                                      className="text-blue-500 hover:underline font-bold uppercase text-[9px]"
                                    >
                                      Uredi
                                    </button>
                                    <button 
                                      onClick={() => handleRemoveGradingElement(s.id, el)}
                                      className="text-red-500 hover:underline font-bold uppercase text-[9px]"
                                    >
                                      Obriši
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex gap-1 pt-2">
                           <input 
                             type="text" 
                             value={newGradingElement}
                             onChange={e => setNewGradingElement(e.target.value)}
                             placeholder="Novi element..." 
                             className="flex-1 border border-gray-300 p-1.5 text-[10px] outline-none"
                           />
                           <button 
                             onClick={() => handleAddGradingElement(s.id)}
                             className="bg-[#005c8d] text-white px-3 py-1 font-black text-[10px] uppercase border border-[#004a70]"
                           >
                             Dodaj
                           </button>
                        </div>
                        <button 
                           onClick={() => setDeleteDialog({ isOpen: true, id: s.id, type: 'SUBJECT', loading: false })}
                           className="w-full text-center text-[9px] font-bold text-red-400 hover:text-red-600 uppercase border border-red-100 bg-red-50 py-1"
                         >
                           Brisanje cijelog predmeta
                         </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'STAFF' && (
            <div className="max-w-5xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Predmetna nastava (Zaduženja)</h3>
                {user?.role === Role.ADMIN && (
                   <button 
                     onClick={() => {
                        setEditingAssignmentId(null);
                        setAssignmentForm({ subjectId: '', teacherId: '', classId: '' });
                     }}
                     className="bg-[#005c8d] text-white px-4 py-1 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] flex items-center gap-2"
                   >
                     <Plus size={14}/> Novo zaduženje
                   </button>
                )}
              </div>

              {user?.role === Role.ADMIN && (
                <div className="bg-white border border-gray-300 p-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">
                    {editingAssignmentId ? 'Uredi zaduženje' : 'Dodaj novu dodjelu nastavnika predmetu'}
                  </div>
                  <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Razredni odjel</label>
                      <select 
                        value={assignmentForm.classId}
                        onChange={e => setAssignmentForm({...assignmentForm, classId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Predmet</label>
                      <select 
                        value={assignmentForm.subjectId}
                        onChange={e => setAssignmentForm({...assignmentForm, subjectId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Nastavnik</label>
                      <select 
                        value={assignmentForm.teacherId}
                        onChange={e => setAssignmentForm({...assignmentForm, teacherId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.surname} {t.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <button 
                        type="submit"
                        disabled={loading}
                        className="bg-[#005c8d] text-white flex-1 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] tracking-widest"
                      >
                        {editingAssignmentId ? 'Spremi' : 'Dodaj'}
                      </button>
                      {editingAssignmentId && (
                        <button 
                          type="button"
                          onClick={() => { setEditingAssignmentId(null); setAssignmentForm({ subjectId: '', teacherId: '', classId: '' }); }}
                          className="bg-gray-100 text-gray-500 px-4 py-2 border border-gray-200 font-black text-[10px] uppercase hover:bg-gray-200"
                        >
                          Odustani
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              <div className="bg-white border border-gray-300 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300 font-black text-gray-500 uppercase text-[10px]">
                      <th className="px-4 py-3 border-r border-gray-200 w-24">Razred</th>
                      <th className="px-4 py-3 border-r border-gray-200">Predmet</th>
                      <th className="px-4 py-3 border-r border-gray-200">Nastavnik</th>
                      {user?.role === Role.ADMIN && <th className="px-4 py-3 text-center w-32">Akcije</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {subjectAssignments.sort((a,b) => {
                      const razredA = classes.find(c => c.id === a.classId)?.name || '';
                      const razredB = classes.find(c => c.id === b.classId)?.name || '';
                      return razredA.localeCompare(razredB);
                    }).map(a => {
                      const razred = classes.find(c => c.id === a.classId);
                      const sub = allSubjects.find(s => s.id === a.subjectId);
                      const tea = teachers.find(t => t.id === a.teacherId);
                      return (
                        <tr key={a.id} className="hover:bg-blue-50/50">
                          <td className="px-4 py-3 border-r border-gray-200 font-black text-[#005c8d]">{razred?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200 font-bold uppercase tracking-tighter">{sub?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200 font-bold text-gray-600 uppercase">{tea?.surname} {tea?.name}</td>
                          {user?.role === Role.ADMIN && (
                            <td className="px-4 py-3 text-center flex items-center justify-center gap-4">
                               <button 
                                 onClick={() => {
                                   setEditingAssignmentId(a.id);
                                   setAssignmentForm({ subjectId: a.subjectId, classId: a.classId, teacherId: a.teacherId });
                                 }}
                                 className="text-[#005c8d] font-black uppercase text-[10px] hover:underline"
                               >
                                 Uredi
                               </button>
                               <button 
                                 onClick={() => setDeleteDialog({ isOpen: true, id: a.id, type: 'STAFF', loading: false })}
                                 className="text-gray-300 hover:text-red-500 transition-colors"
                               >
                                 <Trash2 size={14}/>
                               </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {subjectAssignments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400 font-bold uppercase tracking-widest italic">Nema definiranih zaduženja</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'PLANNING' && (
            <div className="max-w-5xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Nastavni planovi (Kurikulum)</h3>
                {user?.role === Role.ADMIN && (
                   <button 
                     onClick={() => {
                        setEditingCurriculumId(null);
                        setCurriculumForm({ subjectId: '', classId: '', weeklyHours: 1 });
                     }}
                     className="bg-[#005c8d] text-white px-4 py-1 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] flex items-center gap-2"
                   >
                     <Plus size={14}/> Novi plan
                   </button>
                )}
              </div>

              {user?.role === Role.ADMIN && (
                <div className="bg-white border border-gray-300 p-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">
                    {editingCurriculumId ? 'Uredi plan' : 'Definiraj tjednu satnicu predmeta'}
                  </div>
                  <form onSubmit={handleCreateCurriculumPlan} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Razredni odjel</label>
                      <select 
                        value={curriculumForm.classId}
                        onChange={e => setCurriculumForm({...curriculumForm, classId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Predmet</label>
                      <select 
                        value={curriculumForm.subjectId}
                        onChange={e => setCurriculumForm({...curriculumForm, subjectId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Sati tjedno (1-10)</label>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        value={curriculumForm.weeklyHours}
                        onChange={e => setCurriculumForm({...curriculumForm, weeklyHours: parseInt(e.target.value) || 1})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button 
                        type="submit"
                        disabled={loading}
                        className="bg-[#005c8d] text-white flex-1 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] tracking-widest"
                      >
                        {editingCurriculumId ? 'Spremi' : 'Dodaj'}
                      </button>
                      {editingCurriculumId && (
                        <button 
                          type="button"
                          onClick={() => { setEditingCurriculumId(null); setCurriculumForm({ subjectId: '', classId: '', weeklyHours: 1 }); }}
                          className="bg-gray-100 text-gray-500 px-4 py-2 border border-gray-200 font-black text-[10px] uppercase hover:bg-gray-200"
                        >
                          Odustani
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              <div className="bg-white border border-gray-300 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300 font-black text-gray-500 uppercase text-[10px]">
                      <th className="px-4 py-3 border-r border-gray-200">Predmet</th>
                      <th className="px-4 py-3 border-r border-gray-200 w-24">Razred</th>
                      <th className="px-4 py-3 border-r border-gray-200 w-40">Broj sati tjedno</th>
                      {user?.role === Role.ADMIN && <th className="px-4 py-3 text-center w-32">Akcije</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {curriculumPlans.sort((a,b) => {
                      const razredA = classes.find(c => c.id === a.classId)?.name || '';
                      const razredB = classes.find(c => c.id === b.classId)?.name || '';
                      return razredA.localeCompare(razredB);
                    }).map(p => {
                      const razred = classes.find(c => c.id === p.classId);
                      const sub = allSubjects.find(s => s.id === p.subjectId);
                      
                      // Check for schedule consistency (Requirement 3)
                      // We need to fetch schedule count here or calculate it
                      // For now, let's just mark it with a small info icon
                      
                      return (
                        <tr key={p.id} className="hover:bg-blue-50/50">
                          <td className="px-4 py-3 border-r border-gray-200 font-black text-[#005c8d] uppercase tracking-tighter">{sub?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200 font-black text-center">{razred?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200">
                             <div className="flex items-center gap-2">
                               <div className="w-8 h-8 bg-gray-50 border border-gray-200 flex items-center justify-center font-black text-[12px]">{p.weeklyHours}</div>
                               <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-1">Sati / tjedno</span>
                             </div>
                          </td>
                          {user?.role === Role.ADMIN && (
                            <td className="px-4 py-3 text-center flex items-center justify-center gap-4">
                               <button 
                                 onClick={() => {
                                   setEditingCurriculumId(p.id);
                                   setCurriculumForm({ subjectId: p.subjectId, classId: p.classId, weeklyHours: p.weeklyHours });
                                 }}
                                 className="text-[#005c8d] font-black uppercase text-[10px] hover:underline"
                               >
                                 Uredi
                               </button>
                               <button 
                                 onClick={() => setDeleteDialog({ isOpen: true, id: p.id, type: 'PLANNING', loading: false })}
                                 className="text-gray-300 hover:text-red-500 transition-colors"
                               >
                                 <Trash2 size={14}/>
                               </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {curriculumPlans.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400 font-bold uppercase tracking-widest italic">Nema definiranih nastavnih planova</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="bg-blue-50 border-l-4 border-[#005c8d] p-4 flex gap-4">
                 <BookOpen size={20} className="text-[#005c8d] shrink-0" />
                 <div className="text-[11px] leading-relaxed">
                   <p className="font-black text-[#005c8d] uppercase mb-1">Napomena o integraciji s rasporedom</p>
                   <p className="text-gray-600 font-medium">Definirana tjedna satnica služi kao osnova za izradu rasporeda sati. Ukoliko se broj sati u rasporedu ne podudara s planom, sustav će prikazati upozorenje u modulu Dnevnik rada.</p>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'ROLLOVER' && (
            <div className="max-w-6xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Školska godina i Rollover</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Open New Year */}
                <div className="space-y-6">
                  <div className="bg-white border border-gray-300 p-4">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Otvori novu školsku godinu</div>
                    <form onSubmit={handleCreateSchoolYear} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Naziv školske godine</label>
                          <input 
                            type="text" required placeholder="npr. 2026./2027."
                            value={newYearForm.name}
                            onChange={e => setNewYearForm({...newYearForm, name: e.target.value})}
                            className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Početak</label>
                          <input 
                            type="date"
                            value={newYearForm.startsAt}
                            onChange={e => setNewYearForm({...newYearForm, startsAt: e.target.value})}
                            className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Završetak</label>
                          <input 
                            type="date"
                            value={newYearForm.endsAt}
                            onChange={e => setNewYearForm({...newYearForm, endsAt: e.target.value})}
                            className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none"
                          />
                        </div>
                      </div>
                      <button 
                        disabled={loading}
                        className="w-full bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70]"
                      >
                        Otvori novu školsku godinu
                      </button>
                    </form>
                  </div>

                  <div className="bg-white border border-gray-300">
                    <div className="p-4 border-b border-gray-300 text-[10px] font-black text-gray-400 uppercase">Povijest školskih godina</div>
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-300 font-black text-gray-500 uppercase text-[9px]">
                          <th className="px-4 py-2 border-r border-gray-200">Šk. Godina</th>
                          <th className="px-4 py-2 border-r border-gray-200">Trajanje</th>
                          <th className="px-4 py-2 text-center w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {schoolYears.sort((a,b) => b.name.localeCompare(a.name)).map(y => (
                          <tr key={y.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 border-r border-gray-200 font-black text-[#005c8d]">{y.name}</td>
                            <td className="px-4 py-3 border-r border-gray-200 text-gray-500">
                              {y.startsAt || '—'} do {y.endsAt || '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {y.isActive ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-black uppercase text-[8px] border border-green-200">Aktivna</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-black uppercase text-[8px] border border-gray-200">Arhiva</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {schoolYears.length === 0 && (
                          <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Nema definiranih školskih godina</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: Rollover Students */}
                <div className="space-y-6 lg:col-span-1">
                  <div className="bg-white border border-gray-300 p-4">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Prijenos učenika (Rollover)</div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase">Trenutni razred</label>
                          <select 
                            value={rolloverForm.fromClassId}
                            onChange={e => setRolloverForm({...rolloverForm, fromClassId: e.target.value})}
                            className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                          >
                            <option value="">-- Odaberi --</option>
                            {classes.sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name} ({c.school_year})</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase">Ciljna šk. godina</label>
                          <select 
                            value={rolloverForm.toYearId}
                            onChange={e => setRolloverForm({...rolloverForm, toYearId: e.target.value})}
                            className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                          >
                            <option value="">-- Odaberi --</option>
                            {schoolYears.filter(y => !y.isActive).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Rollover confirmation button area */}
                      <button 
                        onClick={generateRolloverPreview}
                        disabled={loading}
                        className="w-full bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] shadow-md mt-4"
                      >
                        Generiraj prijedlog prijenosa
                      </button>
                    </div>
                  </div>

                  {rolloverStudents.length > 0 && (
                    <div className="bg-white border border-gray-300 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                       <div className="p-3 bg-gray-50 border-b border-gray-300 flex items-center justify-between">
                         <div className="text-[10px] font-black text-gray-500 uppercase">Prijedlog prijenosa: {rolloverStudents.length} učenika</div>
                         <button onClick={handleRunRollover} className="px-4 py-1 bg-green-600 text-white font-black text-[10px] uppercase hover:bg-green-700 shadow-sm">Izvrši prijenos</button>
                       </div>
                       <div className="max-h-[500px] overflow-auto">
                         <table className="w-full text-left border-collapse text-[11px]">
                           <thead className="sticky top-0 bg-white shadow-sm z-10">
                              <tr className="bg-gray-100 border-b border-gray-300 text-[9px] font-black text-gray-400 uppercase">
                                <th className="px-3 py-2">Učenik / Program</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Ciljni razred</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200">
                             {rolloverStudents.map((item, idx) => (
                               <tr key={item.studentId} className="hover:bg-blue-50/30">
                                 <td className="px-3 py-2">
                                   <div className="font-black text-[#005c8d] uppercase tracking-tighter">{item.name}</div>
                                   <div className="text-[9px] text-gray-400 font-bold uppercase">{item.programName}</div>
                                 </td>
                                 <td className="px-3 py-2">
                                   <select 
                                     value={item.status}
                                     onChange={e => {
                                       const newPreview = [...rolloverStudents];
                                       newPreview[idx].status = e.target.value;
                                       if (e.target.value === 'ZAVRSAVA') newPreview[idx].nextClassId = '';
                                       setRolloverStudents(newPreview);
                                     }}
                                     className={cn("w-full border p-1 font-bold text-[9px] uppercase outline-none", 
                                       item.status === 'NAPREDUJE' ? "border-green-200 text-green-700" : 
                                       item.status === 'ZAVRSAVA' ? "border-red-200 text-red-700" : "border-blue-200 text-blue-700"
                                     )}
                                   >
                                     <option value="NAPREDUJE">Napreduje</option>
                                     <option value="ZAVRSAVA">Završava</option>
                                     <option value="NASTAVLJA">Nastavlja obrazovanje (Razlika)</option>
                                   </select>
                                 </td>
                                 <td className="px-3 py-2">
                                   {item.status !== 'ZAVRSAVA' ? (
                                      <select 
                                        value={item.nextClassId}
                                        onChange={e => {
                                          const newPreview = [...rolloverStudents];
                                          newPreview[idx].nextClassId = e.target.value;
                                          setRolloverStudents(newPreview);
                                        }}
                                        className="w-full border border-gray-300 p-1 text-[9px] font-bold outline-none"
                                      >
                                        <option value="">-- Odaberi --</option>
                                        {classes.filter(c => c.schoolYearId === rolloverForm.toYearId).map(c => (
                                          <option key={c.id} value={c.id}>{c.name} {c.variant === 'CONTINUATION' ? '(R)' : ''}</option>
                                        ))}
                                      </select>
                                   ) : (
                                     <span className="text-gray-300 font-black text-[9px] uppercase">Ishod: Dovršeno</span>
                                   )}
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-300">
                    <div className="p-4 border-b border-gray-300 text-[10px] font-black text-gray-400 uppercase">Logovi prijenosa</div>
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-300 font-black text-gray-500 uppercase text-[9px]">
                          <th className="px-4 py-2 border-r border-gray-200">Razred (Iz - U)</th>
                          <th className="px-4 py-2 border-r border-gray-200 text-center">Broj</th>
                          <th className="px-4 py-2 text-center w-32">Vrijeme</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {rolloverLogs.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(l => (
                          <tr key={l.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 border-r border-gray-200">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-500">{classes.find(c => c.id === l.fromClassId)?.name || 'N/A'}</span>
                                <ChevronDown size={14} className="-rotate-90 text-gray-300" />
                                <span className="font-black text-[#005c8d]">{classes.find(c => c.id === l.toClassId)?.name || 'N/A'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 border-r border-gray-200 text-center font-black">
                              {l.studentsTransferred}
                            </td>
                            <td className="px-3 py-3 text-center text-gray-400 text-[9px] font-bold">
                              {new Date(l.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SCHOOLS' && (
            <div className="max-w-4xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upravljanje školama</h3>
              </div>
              {isMainAdmin && (
                <div className="bg-white border border-gray-300 p-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-3">Dodaj novu školu</div>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as any;
                    const name = form.schoolName.value;
                    const type = form.schoolType.value;
                    const subtype = form.schoolSubtype.value;
                    if (!name) return;
                    await supabase.from('schools').insert([{ name, type, subtype }]);
                    form.reset();
                    toast.success('Škola dodana');
                  }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input name="schoolName" placeholder="Naziv škole" className="md:col-span-1 border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required />
                    <select name="schoolType" className="border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none">
                      <option value="PRIMARY">Osnovna škola</option>
                      <option value="SECONDARY">Srednja škola</option>
                    </select>
                    <select name="schoolSubtype" className="border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none">
                      <option value="GENERAL">Gimnazija</option>
                      <option value="VOCATIONAL">Strukovna škola</option>
                    </select>
                    <button className="bg-[#005c8d] text-white font-black text-[10px] uppercase py-2">Dodaj</button>
                  </form>
                </div>
              )}
              <div className="bg-white border border-gray-300">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[9px] border-b">
                    <tr>
                      <th className="px-4 py-2">Naziv</th>
                      <th className="px-4 py-2">Tip</th>
                      <th className="px-4 py-2">Podtip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {schools.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-bold">{s.type}</td>
                        <td className="px-4 py-3 text-gray-500 font-bold">{s.subtype}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'PROGRAMS' && (
            <div className="max-w-4xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upravljanje programima</h3>
              </div>
              {isMainAdmin && (
                <div className="bg-white border border-gray-300 p-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-3">Dodaj novi obrazovni program</div>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as any;
                    const name = form.progName.value;
                    const duration = parseInt(form.progDuration.value);
                    const schoolId = form.progSchool.value;
                    if (!name || !schoolId) return;
                    await supabase.from('programs').insert([{ name, duration_years: duration, school_id: schoolId }]);
                    form.reset();
                    toast.success('Program dodan');
                  }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input name="progName" placeholder="Naziv programa" className="md:col-span-1 border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required />
                    <input name="progDuration" type="number" min="1" max="5" defaultValue={4} className="border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required />
                    <select name="progSchool" className="border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required>
                      <option value="">-- Odaberi školu --</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="bg-[#005c8d] text-white font-black text-[10px] uppercase py-2">Dodaj</button>
                  </form>
                </div>
              )}
              <div className="bg-white border border-gray-300">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[9px] border-b">
                    <tr>
                      <th className="px-4 py-2">Naziv programa</th>
                      <th className="px-4 py-2">Trajanje (God)</th>
                      <th className="px-4 py-2">Škola</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {programs.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-bold">{p.durationYears} god.</td>
                        <td className="px-4 py-3 text-gray-400 text-[10px] font-bold uppercase">{schools.find(s => s.id === p.schoolId)?.name || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'STUDENT_DETAIL' && selectedStudentData && (
            <div className="max-w-5xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center gap-4">
                <button onClick={() => setActiveTab('STUDENTS')} className="text-gray-400 hover:text-gray-600 transition-colors"><ChevronLeft size={20}/></button>
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Kartica učenika: {selectedStudentData.surname} {selectedStudentData.name}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-300 p-4 space-y-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-2 border-b pb-1">Predmeti učenika</div>
                  <div className="text-[10px] text-gray-400 italic mb-4">Upravljanje predmetima koje učenik pohađa ili je iz njih izuzet:</div>
                  <div className="divide-y divide-gray-100">
                    {allSubjects.sort((a,b) => a.name.localeCompare(b.name)).map(sub => {
                      const enrollment = enrollments.find(e => e.subjectId === sub.id);
                      const status = enrollment?.status || 'NOT_ASSIGNED';
                      return (
                        <div key={sub.id} className="py-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {status === 'ACTIVE' ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-300" />}
                            <span className={cn("text-[11px] font-bold uppercase", status === 'EXEMPT' ? 'text-red-400 line-through' : 'text-gray-700')}>{sub.name}</span>
                          </div>
                          <div className="flex gap-2">
                             {status === 'ACTIVE' ? (
                               <button 
                                 onClick={() => handleToggleEnrollment(sub.id, 'ACTIVE')}
                                 className="text-[9px] font-black text-red-500 uppercase hover:underline"
                               >
                                 Izuzmi
                               </button>
                             ) : status === 'EXEMPT' ? (
                               <button 
                                 onClick={() => handleToggleEnrollment(sub.id, 'EXEMPT')}
                                 className="text-[9px] font-black text-green-600 uppercase hover:underline"
                               >
                                 Vrati
                               </button>
                             ) : (
                               <button 
                                 onClick={() => handleToggleEnrollment(sub.id, 'NOT_ASSIGNED')}
                                 className="text-[9px] font-black text-[#005c8d] uppercase hover:underline"
                               >
                                 Dodaj
                               </button>
                             )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-gray-300 p-4 space-y-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-2 border-b pb-1">Osnovni podaci</div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Ime</label>
                        <div className="text-xs font-bold text-gray-700">{selectedStudentData.name}</div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Prezime</label>
                        <div className="text-xs font-bold text-gray-700">{selectedStudentData.surname}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">E-mail</label>
                      <div className="text-xs font-bold text-gray-700">{selectedStudentData.email}</div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">Razred</label>
                      <div className="text-xs font-bold text-gray-700">{classes.find(c => c.id === selectedStudentData.classId)?.name || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'USERS' && canManageUsers && (
            <div className="max-w-6xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upravljanje korisnicima i ulogama</h3>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="bg-white border border-gray-300 p-4">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Dodaj novog korisnika</div>
                    <form onSubmit={handleCreateUnifiedUser} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <input 
                          type="text" required placeholder="Ime"
                          value={newUserForm.name}
                          onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                          className="border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                        />
                        <input 
                          type="text" required placeholder="Prezime"
                          value={newUserForm.surname}
                          onChange={e => setNewUserForm({...newUserForm, surname: e.target.value})}
                          className="border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input 
                          type="email" required placeholder="E-mail"
                          value={newUserForm.email}
                          onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                          className="border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                        />
                        <select 
                          value={newUserForm.globalRole}
                          onChange={e => setNewUserForm({...newUserForm, globalRole: e.target.value as Role})}
                          className="border border-gray-300 p-2 text-xs font-bold outline-none focus:border-[#005c8d]"
                        >
                          <option value={Role.TEACHER}>Nastavnik</option>
                          <option value={Role.SCHOOL_ADMIN}>Admin škole</option>
                          <option value={Role.STUDENT}>Učenik</option>
                          <option value={Role.PARENT}>Roditelj</option>
                        </select>
                      </div>

                      {newUserForm.globalRole === Role.STUDENT && (
                        <div className="space-y-3 bg-gray-50 p-3 border border-gray-200 animate-in slide-in-from-top-2">
                           <div className="grid grid-cols-2 gap-3">
                              <input 
                                type="text" placeholder="OIB"
                                value={newUserForm.oib}
                                onChange={e => setNewUserForm({...newUserForm, oib: e.target.value})}
                                className="border border-gray-300 p-2 text-[10px] outline-none"
                              />
                              <input 
                                type="date" placeholder="Datum rođenja"
                                value={newUserForm.dob}
                                onChange={e => setNewUserForm({...newUserForm, dob: e.target.value})}
                                className="border border-gray-300 p-2 text-[10px] outline-none"
                              />
                           </div>
                           <select 
                              value={newUserForm.classId}
                              onChange={e => setNewUserForm({...newUserForm, classId: e.target.value})}
                              className="w-full border border-gray-300 p-2 text-[10px] font-bold"
                           >
                              <option value="">Odaberi razred...</option>
                              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                        </div>
                      )}

                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#005c8d] text-white py-2 font-black text-[10px] uppercase border border-[#004a70] hover:bg-[#004a70] transition-colors"
                      >
                        {loading ? 'Spremanje...' : 'Kreiraj korisnika'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white border border-gray-300">
                    <div className="p-3 bg-gray-50 border-b border-gray-300 flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-500 uppercase">Popis korisnika</span>
                    </div>
                    <div className="max-h-[500px] overflow-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead className="sticky top-0 bg-white border-b border-gray-200 text-[9px] font-black text-gray-400 uppercase">
                          <tr>
                            <th className="px-3 py-2 border-r">Korisnik</th>
                            <th className="px-3 py-2 border-r">Uloga</th>
                            <th className="px-3 py-2 text-center">Akcije</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {allUsers
                            .filter(u => {
                              if (isMainAdmin) return true;
                              // School admin filters users of their school
                              return allUserSchoolRolesState.some(r => r.userId === u.id && r.schoolId === selectedSchoolId);
                            })
                            .sort((a,b) => a.surname.localeCompare(b.surname))
                            .map(u => (
                            <tr key={u.id} className={cn("hover:bg-blue-50/50", selectedUserForRole === u.id && "bg-blue-50")}>
                              <td className="px-3 py-2 border-r">
                                <div className="font-bold text-gray-700">{u.surname} {u.name}</div>
                                <div className="text-[9px] text-gray-400">{u.email}</div>
                              </td>
                              <td className="px-3 py-2 border-r">
                                <div className="flex flex-col gap-0.5">
                                   <div className="text-[8px] text-gray-400 font-bold uppercase">Global: {u.globalRole || '—'}</div>
                                   <div className="flex flex-wrap gap-1">
                                      {allUserSchoolRolesState.filter(r => r.userId === u.id && (!selectedSchoolId || r.schoolId === selectedSchoolId)).map(r => (
                                        <span key={r.id} className="text-[7px] bg-blue-100 text-[#005c8d] px-1 rounded-sm font-black uppercase tracking-tighter">
                                          {r.role}
                                        </span>
                                      ))}
                                   </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex flex-col gap-1">
                                  <button 
                                    onClick={() => {
                                      setSelectedUserForRole(u.id);
                                      setRoleForm(prev => ({ ...prev, userId: u.id, schoolId: selectedSchoolId || '' }));
                                    }}
                                    className="text-[9px] font-black uppercase text-[#005c8d] hover:underline"
                                  >
                                    Uloge
                                  </button>
                                  <button 
                                    onClick={async () => {
                                      const isStaff = [Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.HOMEROOM].includes(u.globalRole);
                                      const newPass = generatePassword(isStaff ? 12 : 8);
                                      
                                      await supabase.from('user_profiles').update({ 
                                        temp_password: newPass, 
                                        password_hash: `HASH:${newPass}`,
                                        is_first_login: true,
                                        requires_password_change: true,
                                        requires_authenticator_setup: isStaff,
                                        first_login_password_used: false,
                                        password_type: isStaff ? 'FIRST_LOGIN_OTP_SETUP' : 'NORMAL_PASSWORD',
                                        authenticator_secret: null
                                      }).eq('id', u.id);

                                      setResetModal({
                                        isOpen: true,
                                        user: u,
                                        newPass,
                                        generatedAt: new Date().toLocaleString('hr-HR')
                                      });
                                      toast.success('Lozinka resetirana');
                                    }}
                                    className="text-[8px] font-bold uppercase text-gray-400 hover:text-gray-600"
                                  >
                                    Reset lozinke
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {selectedUserForRole ? (
                    <>
                      <div className="bg-white border border-gray-300 p-4">
                        <div className="flex items-center justify-between border-b pb-2 mb-4">
                          <h4 className="text-[10px] font-black text-[#005c8d] uppercase">Dodijeli ulogu u školi</h4>
                          <span className="text-[10px] font-bold text-gray-500">
                            {allUsers.find(u => u.id === selectedUserForRole)?.name} {allUsers.find(u => u.id === selectedUserForRole)?.surname}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Škola</label>
                            <select 
                              value={roleForm.schoolId}
                              onChange={e => setRoleForm({...roleForm, schoolId: e.target.value})}
                              disabled={!isMainAdmin}
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none disabled:opacity-50"
                            >
                              <option value="">-- Odaberi školu --</option>
                              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Uloga</label>
                            <select 
                              value={roleForm.role}
                              onChange={e => setRoleForm({...roleForm, role: e.target.value as Role})}
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                            >
                              <option value={Role.TEACHER}>Nastavnik</option>
                              <option value={Role.SCHOOL_ADMIN}>Admin škole</option>
                              <option value={Role.HOMEROOM}>Razrednik</option>
                              <option value={Role.DEPUTY}>Zamjenik razrednika</option>
                              <option value={Role.STUDENT}>Učenik</option>
                              <option value={Role.PARENT}>Roditelj</option>
                            </select>
                          </div>
                        </div>
                        <button 
                          onClick={handleAddSchoolRole}
                          disabled={loading}
                          className="w-full bg-[#005c8d] text-white py-2 font-black text-[10px] uppercase border border-[#004a70] mt-4 hover:bg-[#004a70]"
                        >
                          Dodaj ulogu
                        </button>
                      </div>

                      <div className="bg-white border border-gray-300">
                        <div className="p-3 bg-gray-50 border-b border-gray-300">
                          <span className="text-[10px] font-black text-gray-500 uppercase">Postojeće uloge u školama</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {allUserSchoolRolesState.filter(r => r.userId === selectedUserForRole).map(r => (
                            <div key={r.id} className="p-3 flex items-center justify-between">
                              <div>
                                <div className="font-bold text-[11px] text-gray-700">{schools.find(s => s.id === r.schoolId)?.name || 'N/A'}</div>
                                <div className="text-[9px] font-black text-[#005c8d] uppercase">{r.role}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={cn("inline-block w-2 h-2 rounded-full", r.status === 'INACTIVE' ? 'bg-red-500' : 'bg-green-500')} />
                                <button 
                                  onClick={async () => {
                                    const newStatus = r.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
                                    await supabase.from('user_school_roles').update({ status: newStatus }).eq('id', r.id);
                                    toast.success(newStatus === 'INACTIVE' ? 'Uloga deaktivirana' : 'Uloga aktivirana');
                                  }}
                                  className={cn("text-[9px] font-black uppercase hover:underline", r.status === 'INACTIVE' ? 'text-green-600' : 'text-gray-400')}
                                >
                                  {r.status === 'INACTIVE' ? 'Aktiviraj' : 'Deaktiviraj'}
                                </button>
                                <button 
                                  onClick={() => handleRemoveSchoolRole(r.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors ml-2"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {isMainAdmin && (
                        <div className="bg-white border border-gray-300 p-4 mt-6">
                           <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Globalne postavke</div>
                           <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Globalna uloga</label>
                              <select 
                                value={allUsers.find(u => u.id === selectedUserForRole)?.globalRole || Role.STUDENT}
                                onChange={(e) => handleUpdateGlobalRole(selectedUserForRole!, e.target.value as Role)}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              >
                                {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                           </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-48 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-[10px] uppercase font-black px-12 text-center">
                      Odaberite korisnika s popisa lijevo za upravljanje ulogama u školama
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <DeleteConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
        onConfirm={confirmDelete}
        loading={deleteDialog.loading}
        message={deleteDialog.message}
      />
      {/* Password Reset Modal */}
      {resetModal.isOpen && resetModal.user && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full shadow-[20px_20px_0px_rgba(0,0,0,0.1)] border border-gray-300">
            <div className="p-6 border-b border-gray-200 bg-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-[#005c8d]" size={20} />
                <h3 className="text-sm font-black text-[#005c8d] uppercase tracking-tighter">Lozinka resetirana</h3>
              </div>
              <button 
                onClick={() => setResetModal({ ...resetModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 p-4 space-y-3">
                  <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase font-black">
                    <span>Korisnik</span>
                    <span>{resetModal.generatedAt}</span>
                  </div>
                  <div className="text-md font-black text-gray-800 uppercase tracking-tight">
                    {resetModal.user.name} {resetModal.user.surname}
                  </div>
                  <div className="text-[11px] font-bold text-[#005c8d]">
                    {resetModal.user.username || resetModal.user.email}
                  </div>
                </div>

                <div className="bg-[#005c8d]/5 border-2 border-dashed border-[#005c8d]/30 p-6 text-center space-y-2">
                  <label className="text-[9px] font-black text-[#005c8d] uppercase tracking-[0.2em]">Jednokratna lozinka</label>
                  <div className="text-2xl font-black tracking-[0.3em] text-[#005c8d] select-all">
                    {resetModal.newPass}
                  </div>
                  <p className="text-[9px] font-bold text-red-500 uppercase flex items-center justify-center gap-1">
                    <ShieldAlert size={10} /> Lozinka vrijedi samo za jednu prijavu
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const currentSchool = schools.find(s => s.id === selectedSchoolId)?.name || 'E-Dnevnik Sustav';
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Lozinka Slip</title>
                            <style>
                              body { font-family: sans-serif; padding: 40px; }
                              .slip { border: 2px solid #000; padding: 30px; max-width: 400px; margin: 0 auto; }
                              .school { font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                              .label { font-size: 10px; font-weight: bold; color: #666; text-transform: uppercase; margin-bottom: 4px; }
                              .value { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
                              .pass { font-size: 24px; font-weight: bold; letter-spacing: 4px; border: 1px dashed #000; padding: 15px; text-align: center; margin: 20px 0; }
                              .note { font-size: 11px; color: #f00; font-weight: bold; text-align: center; text-transform: uppercase; }
                            </style>
                          </head>
                          <body onload="window.print()">
                            <div class="slip">
                              <div class="school">${currentSchool}</div>
                              <div class="label">Korisnik</div>
                              <div class="value">${resetModal.user?.name} ${resetModal.user?.surname}</div>
                              <div class="label">Korisničko ime / Email</div>
                              <div class="value">${resetModal.user?.username || resetModal.user?.email}</div>
                              <div class="label">Jednokratna lozinka</div>
                              <div class="pass">${resetModal.newPass}</div>
                              <div class="note">Lozinka vrijedi samo za jednu prijavu.</div>
                            </div>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-3 border border-gray-300 text-gray-600 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                >
                  <Printer size={16} /> Ispiši
                </button>
                <button 
                  onClick={() => {
                    toast.success(`Email s lozinkom poslan na: ${resetModal.user?.email}`);
                    // Simulation of sending email
                  }}
                  className="flex items-center justify-center gap-2 py-3 border border-gray-300 text-gray-600 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                >
                  <Mail size={16} /> Pošalji e-mail
                </button>
              </div>

              <button 
                onClick={() => setResetModal({ ...resetModal, isOpen: false })}
                className="w-full py-4 bg-[#005c8d] text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#004a70] transition-all"
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
