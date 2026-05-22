import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, ClassSubjectTeacher as SubjectTeachingAssignment, CurriculumPlan, Subject, StudentSubjectEnrollment, SchoolYear, RolloverLog, StudentClassEnrollment, School, Program, SchoolType, SecondarySubtype, ClassVariant, ContinuationType, PROGRAM_TYPES, CONTINUATION_TYPES, CLASS_VARIANTS, ProgramType, ClassSubject } from '../../types';
import { Settings, Plus, UserPlus, Users, GraduationCap, School as SchoolIcon, Trash2, ChevronLeft, ChevronDown, CheckCircle, XCircle, BookOpen, Clock, X, Printer, Mail, ShieldAlert, ArrowRight, Eye, Settings2, Shield, User as UserIcon, Info, FileText } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { toast } from 'react-hot-toast';
import { cn, getSurname, formatSubjectDisplayName, formatPersonName } from '../../lib/utils';
import { mappers, mapList } from '../../lib/mappers';
import CertificateManagementPage from './certificates/CertificateManagementPage';

export default function AdministrationPage() {
  const navigate = useNavigate();
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const { user, isMainAdmin, signOut, userSchoolRoles } = useAuth();
  const { selectedSchoolId, isArchived, setSelectedSchoolId } = useSelection();

  const isAnyAdmin = React.useMemo(() => {
    // Current user's roles for the selected school
    const rolesForSchool = userSchoolRoles
      .filter(r => !selectedSchoolId || r.schoolId === selectedSchoolId)
      .map(r => r.role);
    
    // Check if user has ANY admin role (global or school-specific)
    const canDelete = isMainAdmin || 
                      rolesForSchool.includes(Role.MAIN_ADMIN) || 
                      rolesForSchool.includes(Role.SCHOOL_ADMIN) || 
                      rolesForSchool.includes(Role.ADMIN);
    
    console.log("CURRENT USER ROLES (School):", rolesForSchool);
    console.log("IS GLOBAL MAIN ADMIN:", isMainAdmin);
    console.log("CAN DELETE:", canDelete);
    
    return canDelete;
  }, [userSchoolRoles, isMainAdmin, selectedSchoolId]);
  
  const effectiveClassId = routeClassId;
  const isClassAdminMode = !!effectiveClassId;

  const [classes, setClasses] = useState<Class[]>([]);
  const [activeStudentClasses, setActiveStudentClasses] = useState<any[]>([]);
  const setClassesUnified = (newClasses: Class[] | ((prev: Class[]) => Class[])) => {
    setClasses(prev => {
      const updated = typeof newClasses === 'function' ? newClasses(prev) : newClasses;
      const uniqueClasses = Array.from(
        new Map(updated.map(c => [c.id, c])).values()
      );
      return uniqueClasses;
    });
  };
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
    const uniqueTeachers = Array.from(new Map(result.map(t => [t.id, t])).values());
    console.log('RAW TEACHERS:', result);
    console.log('UNIQUE TEACHERS:', uniqueTeachers);
    return uniqueTeachers.sort((a: any, b: any) => {
      const surnameA = getSurname(String(a.name || ''));
      const surnameB = getSurname(String(b.name || ''));
      return surnameA.localeCompare(surnameB, 'hr', { sensitivity: 'base' });
    });
  }, [allUsers, allUserSchoolRolesState, selectedSchoolId]);


  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id?: string;
    item?: any;
    type: 'CLASS' | 'SUBJECT' | 'STUDENT' | 'GRADING_ELEMENT' | 'STAFF' | 'PLANNING' | 'PROGRAM' | 'SCHOOL_YEAR' | null;
    loading: boolean;
    extraData?: any;
    message?: string;
  }>({
    isOpen: false,
    id: '',
    type: null,
    loading: false
  });
  
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  const selectedClassData = classes.find(c => c.id === selectedClassId);

  // If we are in class administration mode but data hasn't arrived yet
  const isMissingClassData = isClassAdminMode && !selectedClassData && !loading;

  const filteredPrograms = React.useMemo(() => {
    if (!selectedClassData || !programs) return [];
    console.log('CURRENT CLASS USED FOR STUDENTS:', selectedClassData);
    console.log('ALL LOADED PROGRAMS:', programs);
    
    const filtered = programs.filter(program => {
        if (selectedClassData.variant === 'REGULAR') {
            return ['VOCATIONAL_3Y', 'COMMERCIALIST_4Y'].includes(program.type);
        }
        if (selectedClassData.variant === 'CONTINUATION_FREE') {
            return program.type === 'CONTINUATION_FREE';
        }
        if (selectedClassData.variant === 'CONTINUATION_PAID') {
            return program.type === 'CONTINUATION_PAID';
        }
        return true;
     }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
     
     console.log('FILTERED PROGRAMS:', filtered);
     return filtered;
  }, [selectedClassData, programs]);

  const isSchoolAdminMode = location.pathname.startsWith('/admin/');

  // Modals / Tabs
  const [activeTab, setActiveTab] = useState<'MENU' | 'CLASSES' | 'STUDENTS' | 'CLASS_DETAIL' | 'SUBJECTS' | 'STAFF' | 'PLANNING' | 'STUDENT_DETAIL' | 'OPCI_PROSJEK' | 'SCHOOL_YEARS' | 'SCHOOLS' | 'PROGRAMS' | 'USERS' | 'ROLLOVER' | 'GRADUATES_ADMIN' | 'CONDUCT' | 'PROGRESS' | 'SUPPORTS' | 'ASSIGNMENTS' | 'DOCUMENTS'>(
    isClassAdminMode ? 'CLASS_DETAIL' : (isSchoolAdminMode ? 'SCHOOL_YEARS' : 'MENU')
  );

  const [graduatesAdmin, setGraduatesAdmin] = useState<{
    sourceYearId: string;
    sourceClassId: string;
    targetClassId: string;
    selectedStudentIds: string[];
    isTransferring: boolean;
  }>({
    sourceYearId: '',
    sourceClassId: '',
    targetClassId: '',
    selectedStudentIds: [],
    isTransferring: false
  });
  
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

  useEffect(() => {
    const shouldOpenAddClass = searchParams.get('openAddClass') === 'true';
    const yearId = searchParams.get('schoolYearId');
    if (shouldOpenAddClass && yearId && isAnyAdmin) {
      setActiveTab('SCHOOL_YEARS');
      setClassCreationYearId(yearId);
      setNewClassGrade(1);
      setNewClassSection('A');
    }
  }, [searchParams, isAnyAdmin]);

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [rolloverLogs, setRolloverLogs] = useState<RolloverLog[]>([]);
  const [newYearForm, setNewYearForm] = useState({ name: '', startsAt: '', endsAt: '' });
  
  // NEW ROLLOVER WIZARD STATE
  const [rolloverWizard, setRolloverWizard] = useState<{
    step: 1 | 2 | 3;
    sourceYearId: string;
    targetYearId: string;
    createEmptyFirstGrades: boolean;
    mappings: {
      fromClassId: string;
      toClassName: string;
      toClassId?: string;
      type: 'TRANSFER' | 'GRADUATE' | 'MANUAL';
      isNew?: boolean;
    }[];
  }>({
    step: 1,
    sourceYearId: '',
    targetYearId: '',
    createEmptyFirstGrades: true,
    mappings: []
  });
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectTeachingAssignment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [curriculumPlans, setCurriculumPlans] = useState<CurriculumPlan[]>([]);
  const [classEnrollments, setClassEnrollments] = useState<any[]>([]); // Enrollments for the selected class subjects
  const [finalGrades, setFinalGrades] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [overallNotes, setOverallNotes] = useState<any[]>([]);
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
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const [newClassGrade, setNewClassGrade] = useState(1);
  const [newClassSection, setNewClassSection] = useState('A');
  const [newClassVariant, setNewClassVariant] = useState<ClassVariant>(CLASS_VARIANTS.REGULAR);
  const [newProgramType, setNewProgramType] = useState<ProgramType>(PROGRAM_TYPES.VOCATIONAL_3Y);
  const [newContinuationType, setNewContinuationType] = useState<ContinuationType>(CONTINUATION_TYPES.NONE);
  const [classCreationYearId, setClassCreationYearId] = useState<string | null>(null);
  const [newClassHomeroomTeacherId, setNewClassHomeroomTeacherId] = useState<string>('');
  const [newClassDeputyTeacherId, setNewClassDeputyTeacherId] = useState<string>('');
  const [activeYearId, setActiveYearId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState({ 
    name: '',
    email: '',
    classId: '',
    schoolId: selectedSchoolId || '',
    programId: '',
    oib: '',
    dob: '',
    pob: '',
    address: '',
    mobile: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    isContinuation: false,
    continuationType: null as ContinuationType,
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    parentNotes: '',
    enrollSubjects: true
  });

  const [assignmentForm, setAssignmentForm] = useState({
    subjectId: '',
    classId: '',
    teacherId: '',
    groupName: '',
    subjectType: 'redovni',
    isForeignLanguage: false,
    subjectPeriod: 'FULL_YEAR',
    plannedHoursSemester1: '',
    plannedHoursTotal: '',
    addToAllStudents: true
  });
  const [curriculumForm, setCurriculumForm] = useState({
    subjectId: '',
    classId: '',
    weeklyHours: 1
  });

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
    mobile: '',
    parentEmail: '',
    password: '',
    isContinuation: false,
    continuationType: null as ContinuationType | null
  });

  const [programForm, setProgramForm] = useState({
    name: '',
    durationYears: 4,
    schoolId: selectedSchoolId || '',
    type: PROGRAM_TYPES.VOCATIONAL_3Y
  });

  const [createdStaffTotp, setCreatedStaffTotp] = useState<{
    email: string;
    name: string;
    secret: string;
    qrCode: string;
    tempPassword?: string;
  } | null>(null);

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

  const handleResetStaffAuthenticator = async (profileId: string, name: string, surname: string, email: string) => {
    if (!confirm(`Jeste li sigurni da želite resetirati Microsoft Authenticator za korisnika ${name} ${surname}? Korisnik će se morati ponovno postaviti pri sljedećoj prijavi.`)) return;

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-authenticator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Greška pri resetiranju');

      setCreatedStaffTotp({
        email,
        name: `${name} ${surname}`,
        secret: result.authenticatorSecret,
        qrCode: result.qrCode,
        tempPassword: 'Zadržana postojeća'
      });
      toast.success('Authenticator resetiran. Pokažite novi QR kod korisniku.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Greška pri resetiranju');
    } finally {
      setLoading(false);
    }
  };

  const handleResetStudentPassword = async (profileId: string, type: 'DEFAULT' | 'GENERATE') => {
    if (!confirm(`Jeste li sigurni da želite resetirati lozinku za učenika?`)) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin/reset-student-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, type })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Greška pri resetiranju');

      setResetModal({
        isOpen: true,
        user: students.find(s => s.id === profileId) || null,
        newPass: result.newPassword,
        generatedAt: new Date().toLocaleTimeString()
      });
      toast.success('Lozinka je uspješno resetirana.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Greška pri resetiranju lozinke');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUnifiedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.surname) {
      toast.error('Popunite osnovna polja (Ime, Prezime)');
      return;
    }

    console.log("CREATE UNIFIED USER CLICKED", newUserForm);

    setLoading(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserForm.email?.toLowerCase() || '',
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
      console.log("CREATE UNIFIED USER RESULT:", { status: response.status, result });
      
      if (!response.ok) throw new Error(result.error || 'Neuspješno kreiranje korisnika');

      const generatedPassword = result.password || "Nije vraćena";
      const isStudent = newUserForm.globalRole === Role.STUDENT;
      const isStaff = [Role.TEACHER, Role.SCHOOL_ADMIN, Role.ADMIN].includes(newUserForm.globalRole);

      if (isStaff && result.authenticatorSecret) {
        setCreatedStaffTotp({
          email: result.email || '',
          name: `${newUserForm.name} ${newUserForm.surname}`,
          secret: result.authenticatorSecret,
          qrCode: result.qrCode,
          tempPassword: generatedPassword
        });
        toast.success(`Korisnik ${newUserForm.name} kreiran. Postavite autentifikator.`);
      } else {
        toast.success(
          `Korisnik uspješno kreiran!\nEmail: ${result.email || ''}\nLozinka: ${generatedPassword}${isStudent ? '' : '\n\nKorisnik mora promijeniti lozinku pri prvoj prijavi.'}`,
          { duration: 10000 }
        );
      }
      
      setNewUserForm({
        name: '', surname: '', email: '', username: '', globalRole: Role.TEACHER,
        oib: '', dob: '', address: '', programId: '', classId: '', mobile: '',
        parentEmail: '', password: '', isContinuation: false, continuationType: null
      });
      if (typeof fetchData === 'function') fetchData();
    } catch (err: any) {
      console.error("CREATE UNIFIED USER ERROR:", err);
      toast.error(err.message || 'Greška pri kreiranju korisnika');
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
      const { data: profile } = await supabase.from('user_profiles').select('id').eq('auth_user_id', userId).maybeSingle();
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

  const parseClassName = (name: string) => {
    const match = name.match(/^(\d+)\.(.+)$/);
    if (!match) return { grade: 0, section: name.toUpperCase() };
    return { grade: parseInt(match[1]), section: match[2].toUpperCase() };
  };

  const calculateRolloverMappings = async (targetIdOverride?: string) => {
    const targetYearId = targetIdOverride || rolloverWizard.targetYearId;
    if (!rolloverWizard.sourceYearId || !targetYearId) return;
    
    setLoading(true);
    try {
      // Direct query to ensure we get ALL classes (including ARCHIVED) for the source year
      const { data: sourceClassesRaw, error: sourceError } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('school_year_id', rolloverWizard.sourceYearId)
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true });

      if (sourceError) throw sourceError;
      
      const sourceClasses = mapList(sourceClassesRaw || [], mappers.class);
      const targetClasses = classes.filter(c => c.school_year_id === targetYearId);
      
      const newMappings = sourceClasses.map(fromClass => {
        // Find program info
        const program = programs.find(p => p.id === fromClass.programId);
        const { grade, section } = parseClassName(fromClass.name);

        // --- NEW ROLLOVER LOGIC BASED ON PROGRAM TYPE ---
        
        // 1. VOCATIONAL_3Y (3-year programs: 1->2, 2->3, 3->GRAD)
        if (program?.type === 'VOCATIONAL_3Y') {
          if (grade >= 3) {
            return {
              fromClassId: fromClass.id,
              toClassName: 'ZAVRŠAVA',
              type: 'GRADUATE' as const,
              homeroomTeacherId: fromClass.homeroomTeacherId,
              deputyTeacherId: fromClass.deputyTeacherId,
              programId: fromClass.programId,
              variant: fromClass.classVariant || fromClass.variant
            };
          }
          const nextGrade = grade + 1;
          const nextName = `${nextGrade}.${section}`;
          const target = targetClasses.find(c => c.name.toUpperCase() === nextName);
          return {
            fromClassId: fromClass.id,
            toClassName: nextName,
            toClassId: target?.id,
            type: 'TRANSFER' as const,
            isNew: !target,
            homeroomTeacherId: fromClass.homeroomTeacherId,
            deputyTeacherId: fromClass.deputyTeacherId,
            programId: fromClass.programId,
            variant: fromClass.classVariant || fromClass.variant
          };
        }

        // 2. COMMERCIALIST_4Y (4-year programs: 1->2, 2->3, 3->4, 4->GRAD)
        if (program?.type === 'COMMERCIALIST_4Y') {
          if (grade >= 4) {
            return {
              fromClassId: fromClass.id,
              toClassName: 'ZAVRŠAVA',
              type: 'GRADUATE' as const,
              homeroomTeacherId: fromClass.homeroomTeacherId,
              deputyTeacherId: fromClass.deputyTeacherId,
              programId: fromClass.programId,
              variant: fromClass.classVariant || fromClass.variant
            };
          }
          const nextGrade = grade + 1;
          const nextName = `${nextGrade}.${section}`;
          const target = targetClasses.find(c => c.name.toUpperCase() === nextName);
          return {
            fromClassId: fromClass.id,
            toClassName: nextName,
            toClassId: target?.id,
            type: 'TRANSFER' as const,
            isNew: !target,
            homeroomTeacherId: fromClass.homeroomTeacherId,
            deputyTeacherId: fromClass.deputyTeacherId,
            programId: fromClass.programId,
            variant: fromClass.classVariant || fromClass.variant
          };
        }

        // 3. Fallback for others (CONTINUATION_FREE/PAID are manual only)
        return {
          fromClassId: fromClass.id,
          toClassName: 'RUČNI UPIS',
          type: 'MANUAL' as const,
          homeroomTeacherId: fromClass.homeroomTeacherId,
          deputyTeacherId: fromClass.deputyTeacherId,
          programId: fromClass.programId,
          variant: fromClass.classVariant || fromClass.variant
        };
      });

      setRolloverWizard(prev => ({ 
        ...prev, 
        step: 3, 
        mappings: newMappings 
      }));
    } catch (err: any) {
      toast.error('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunRollover = async () => {
    if (rolloverWizard.mappings.length === 0) return;
    
    setLoading(true);
    const toastId = toast.loading('Pokretanje školskog rollovera...');
    
    try {
      const targetYear = schoolYears.find(y => y.id === rolloverWizard.targetYearId);
      if (!targetYear) throw new Error('Ciljna godina nije pronađena');

      let totalStudentsTransferred = 0;

      for (const mapping of rolloverWizard.mappings) {
        const fromClass = classes.find(c => c.id === mapping.fromClassId);
        if (!fromClass) continue;

        // --- 1. ALWAYS Archive the 'from' class ---
        await supabase.from('classes').update({ status: 'ARCHIVED' }).eq('id', mapping.fromClassId);

        // --- 2. Handle Graduates ---
        if (mapping.type === 'GRADUATE') {
          // Mark students as GRADUATED
          await supabase.from('student_class_enrollments')
            .update({ status: 'GRADUATED' })
            .eq('class_id', mapping.fromClassId)
            .eq('status', 'ACTIVE');
          continue;
        }

        // --- 3. Skip Manual ---
        if (mapping.type === 'MANUAL') continue;

        // --- 4. Process Transfer ---
        // Ensure target class exists
        let targetClassId = mapping.toClassId;
        
        console.log('Saving class with school_year_id:', rolloverWizard.targetYearId);
        if (mapping.isNew || !targetClassId) {
          const { grade, section } = parseClassName(mapping.toClassName);
          const { data: newClass, error: classError } = await supabase.from('classes').insert([{
            name: mapping.toClassName,
            school_id: selectedSchoolId,
            school_year_id: rolloverWizard.targetYearId,
            school_year: targetYear.name,
            grade_level: grade || 1, 
            section: section || '',
            status: 'ACTIVE',
            homeroom_teacher_id: (mapping as any).homeroomTeacherId,
            deputy_teacher_id: (mapping as any).deputyTeacherId,
            program_id: (mapping as any).programId,
            variant: (mapping as any).variant || 'REGULAR'
          }]).select().single();
          
          if (classError) throw classError;
          targetClassId = newClass.id;
        }

        // Transfer students
        const { data: enrolls } = await supabase
          .from('student_class_enrollments')
          .select('student_id')
          .eq('class_id', mapping.fromClassId)
          .eq('status', 'ACTIVE');
        
        if (enrolls && enrolls.length > 0) {
          const newEnrollments = enrolls.map(e => ({
            student_id: e.student_id,
            class_id: targetClassId,
            school_year: targetYear.name,
            school_year_id: rolloverWizard.targetYearId,
            status: 'ACTIVE'
          }));
          
          const { error: insError } = await supabase.from('student_class_enrollments').insert(newEnrollments);
          if (insError) throw insError;
          
          // Mark old as TRANSFERRED
          await supabase.from('student_class_enrollments')
            .update({ status: 'TRANSFERRED' })
            .eq('class_id', mapping.fromClassId)
            .eq('status', 'ACTIVE');
          
          totalStudentsTransferred += enrolls.length;
        }
      }

      // Archive source year
      await supabase.from('school_years')
        .update({ is_active: false, status: 'ARCHIVED' })
        .eq('id', rolloverWizard.sourceYearId);
        
      // Activate target year
      await supabase.from('school_years')
        .update({ is_active: true, status: 'ACTIVE' })
        .eq('id', rolloverWizard.targetYearId);

      // 4. Create empty 1st grades if requested (1.A, 1.B, 1.C, 1.D)
      if (rolloverWizard.createEmptyFirstGrades) {
        const standardFirstGrades = ['A', 'B', 'C', 'D'];
        const targetClassesAfterInsert = (await supabase.from('classes').select('name').eq('school_year_id', rolloverWizard.targetYearId)).data || [];
        
        for (const section of standardFirstGrades) {
          const name = `1.${section}`;
          const exists = targetClassesAfterInsert.some(c => c.name.toUpperCase() === name.toUpperCase());
          if (!exists) {
            await supabase.from('classes').insert([{
              name,
              school_id: selectedSchoolId,
              school_year_id: rolloverWizard.targetYearId,
              school_year: targetYear.name,
              grade_level: 1,
              section: section,
              status: 'ACTIVE'
            }]);
          }
        }
      }

      toast.success(`Rollover uspješan! Preneseno ${totalStudentsTransferred} učenika.`, { id: toastId });
      setRolloverWizard({ step: 1, sourceYearId: '', targetYearId: '', createEmptyFirstGrades: true, mappings: [] });
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri rolloveru: ' + err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };


  const [graduatesAdminStudents, setGraduatesAdminStudents] = useState<any[]>([]);

  const fetchGraduatesStudents = async (classId: string) => {
    if (!classId) {
      setGraduatesAdminStudents([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', classId);
      
      if (error) throw error;
      if (data) {
        setGraduatesAdminStudents(data.map(d => ({
          ...mappers.user(d.student),
          enrollmentId: d.id,
          status: d.status
        })));
      }
    } catch (err: any) {
      toast.error('Greška pri dohvaćanju učenika: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollGraduates = async () => {
    if (!graduatesAdmin.targetClassId || graduatesAdmin.selectedStudentIds.length === 0) {
      toast.error('Odaberite ciljni razred i barem jednog učenika');
      return;
    }

    const targetClass = classes.find(c => c.id === graduatesAdmin.targetClassId);
    if (!targetClass) return;

    setLoading(true);
    const toastId = toast.loading('Upisivanje učenika...');
    try {
      const enrollments = graduatesAdmin.selectedStudentIds.map(studentId => ({
        student_id: studentId,
        class_id: graduatesAdmin.targetClassId,
        school_year: targetClass.schoolYear,
        school_year_id: targetClass.school_year_id,
        status: 'ACTIVE'
      }));

      const { error } = await supabase.from('student_class_enrollments').insert(enrollments);
      if (error) throw error;

      toast.success(`Uspješno upisano ${enrollments.length} u razred ${targetClass.name}`, { id: toastId });
      setGraduatesAdmin(prev => ({ ...prev, selectedStudentIds: [] }));
      fetchData();
    } catch (err: any) {
      toast.error('Greška pri upisu: ' + err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const fetchSchoolYears = async () => {
    if (!selectedSchoolId) return;
    const { data, error } = await supabase
      .from('school_years')
      .select('*')
      .eq('school_id', selectedSchoolId)
      .order('starts_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching school years:", error);
      return;
    }
    
    if (data) {
      const years = mapList(data, mappers.schoolYear);
      setSchoolYears(years);
      const active = years.find(y => y.isActive);
      if (active) {
        setActiveYearId(active.id);
        if (!selectedYearId) {
          setSelectedYearId(active.id);
        }
      }
    }
  };

  useEffect(() => {
    if (!selectedSchoolId || (!isMainAdmin && !isSchoolAdmin)) return;
    
    const checkAndCreateSchoolYear = async () => {
      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('starts_at', { ascending: false });
      
      if (error) return;
      
      if (data && data.length === 0) {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        const name = `${currentYear}./${nextYear}.`;
        console.log('Creating school year for school:', selectedSchoolId);
        
        const { data: newYear, error: createError } = await supabase
          .from('school_years')
          .insert([{
            school_id: selectedSchoolId,
            name,
            starts_at: `${currentYear}-09-01`,
            ends_at: `${nextYear}-06-30`,
            is_active: true
          }])
          .select()
          .single();
          
        if (createError) console.error("School year creation error:", createError);
          
        if (!createError && newYear) {
          fetchSchoolYears();
        }
      } else {
        const years = mapList(data, mappers.schoolYear);
        setSchoolYears(years);
        const active = years.find(y => y.isActive);
        if (active) setActiveYearId(active.id);
      }
    };

    checkAndCreateSchoolYear();
  }, [selectedSchoolId, isMainAdmin, isSchoolAdmin]);

  useEffect(() => {
    if (newClassVariant === 'CONTINUATION_FREE') {
      setNewClassName(`4.K`);
    } else if (newClassVariant === 'CONTINUATION_PAID') {
      setNewClassName(`4.${newClassSection}`);
    } else {
      setNewClassName(`${newClassGrade}.${newClassSection}`);
    }
  }, [newClassGrade, newClassSection, newClassVariant]);

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

  useEffect(() => {
    if (selectedSchoolId) {
      setProgramForm(prev => ({ ...prev, schoolId: selectedSchoolId }));
      setStudentForm(prev => ({ ...prev, schoolId: selectedSchoolId }));
      setRoleForm(prev => ({ ...prev, schoolId: selectedSchoolId }));
    }
  }, [selectedSchoolId]);

  const [classDetailForm, setClassDetailForm] = useState({
    homeroom_teacher_id: '',
    deputy_teacher_id: '',
    program_id: ''
  });

  const selectedStudentData = students.find(s => s.id === selectedStudentId);

  useEffect(() => {
    if (selectedClassData) {
      setClassDetailForm({
        homeroom_teacher_id: selectedClassData.homeroomTeacherId || '',
        deputy_teacher_id: selectedClassData.deputyTeacherId || '',
        program_id: selectedClassData.programId || ''
      });
    }
  }, [selectedClassId, classes]);

  // Define fetchData for parts that still need manual re-fetching
  const fetchData = async () => {
    const classToFetch = effectiveClassId || selectedClassId;
    let currentSchoolId = selectedSchoolId;

    console.log('DEBUG: fetchData START', { classToFetch, currentSchoolId, effectiveClassId, selectedClassId });
    
    try {
      // 0. Recover school context if missing but class is present
      if (classToFetch && !currentSchoolId) {
        console.log('DEBUG: Missing school context, attempting recovery from class:', classToFetch);
        const { data: clsInfo, error: infoErr } = await supabase
          .from('classes')
          .select('school_id')
          .eq('id', classToFetch)
          .maybeSingle();
        
        if (clsInfo?.school_id) {
          console.log('DEBUG: Recovered school_id:', clsInfo.school_id);
          currentSchoolId = clsInfo.school_id;
          if (setSelectedSchoolId) setSelectedSchoolId(clsInfo.school_id);
        } else if (infoErr) {
          console.error('DEBUG: School recovery error:', infoErr);
        }
      }

      if (!currentSchoolId) {
        console.warn('DEBUG: fetchData aborted - no school context');
        return;
      }

      // Global fetches
      const { data: schoolsData } = await supabase.from('schools').select('*');
      if (schoolsData) setSchools(mapList(schoolsData, mappers.school));

      const { data: progsData, error: progsError } = await supabase.from('programs').select('*').eq('school_id', currentSchoolId).order('name');
      if (progsData) setPrograms(mapList(progsData, mappers.program));

      const { data: yearRoles } = await supabase.from('user_school_roles').select('*').eq('school_id', currentSchoolId);
      if (yearRoles) setAllUserSchoolRoles(mapList(yearRoles, mappers.userSchoolRole));

      // Fetch assignments and curriculum plans
      const { data: assignmentsData } = await supabase.from('class_subject_teachers').select('*').eq('school_id', currentSchoolId);
      if (assignmentsData) setSubjectAssignments(mapList(assignmentsData, mappers.classSubjectTeacher));

      const { data: curricData } = await supabase.from('curriculum_plans').select('*').eq('school_id', currentSchoolId);
      if (curricData) setCurriculumPlans(mapList(curricData, mappers.curriculumPlan));

      const { data: classSubjectsData } = await supabase.from('class_subjects').select('*').eq('school_id', currentSchoolId);
      if (classSubjectsData) setClassSubjects(mapList(classSubjectsData, mappers.classSubject));

      // Fetch teachers/staff for this school
      const staffUserIds = (yearRoles || []).map(r => r.user_id);
      const { data: teachersData } = await supabase.from('user_profiles').select('*').in('id', staffUserIds);
      if (teachersData) {
        const mapped = teachersData.map(p => {
          const u = mappers.user(p);
          return {
            ...u,
            name: p.name || '',
          };
        });
        setAllUsers(mapped);
      }

      // 1. Fetch Classes for this school
      const { data: clsData, error: clsError } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', currentSchoolId)
        .order('grade_level')
        .order('section');

      console.log('CLASSES FETCH RESULT (Raw Data):', clsData);                
      console.log('ACTIVE FILTERS', { school_id: currentSchoolId, school_year_id: selectedYearId, status: 'ACTIVE' });

      if (clsError) {
        console.error('LOAD ADMIN CLASSES ERROR:', clsError);
        throw clsError;
      }

      if (clsData) {
        const mappedClasses = mapList(clsData, mappers.class);
        console.log('MAPPED CLASSES (to be set in state):', mappedClasses);
        setClassesUnified(mappedClasses);
        setActiveStudentClasses(clsData); 
        
        // If we have a specific class we're looking for, and it's not in the list (maybe because of filters), fetch it
        let fetchedClass = clsData.find(c => c.id === classToFetch);
        
        if (classToFetch && !fetchedClass) {
          console.log('DEBUG: Class not found in filtered results, fetching specifically:', classToFetch);
          const { data: specificClass, error: specError } = await supabase
            .from('classes')
            .select(`
              *,
              program:program_id(*),
              homeroom:homeroom_teacher_id(*),
              deputy:deputy_teacher_id(*)
            `)
            .eq('id', classToFetch)
            .maybeSingle();
          
          if (specError) {
             console.error('DEBUG: SPECIFIC CLASS FETCH ERROR:', specError);
          }

          if (specificClass) {
            console.log('DEBUG: Specific class found:', specificClass.name);
            fetchedClass = specificClass;
            // Add to the list if not there
            setClassesUnified(prev => {
              if (prev.find(p => p.id === specificClass.id)) return prev;
              const mapped = mappers.class(specificClass);
              console.log('ADDING FETCHED SPECIFIC CLASS TO STATE:', mapped);
              return [...prev, mapped];
            });
          }
        }

        console.log('DEBUG: FINAL FETCHED CLASS:', fetchedClass ? mappers.class(fetchedClass).name : 'NOT FOUND');
      }

      const { data: subAll } = await supabase.from('subjects').select('*').eq('school_id', currentSchoolId);
      if (subAll) {
const mappedSub = mapList(subAll, mappers.subject);
const uniqueSub = Array.from(new Map(mappedSub.map(s => [s.id, s])).values());
setAllSubjects(uniqueSub);
}


      // Fetch all school students if we are in STUDENTS tab or no class is selected
      if (!classToFetch || activeTab === 'STUDENTS') {
        const { data: allSchoolEnrollments, error: allErr } = await supabase
          .from('user_school_roles')
          .select('*, user:user_profiles(*)')
          .eq('school_id', currentSchoolId)
          .eq('role', 'STUDENT');
        
        if (allSchoolEnrollments) {
          const { data: currentEnrollments } = await supabase
            .from('student_class_enrollments')
            .select('student_id, class_id, program_id, status')
            .eq('status', 'ACTIVE');

          const mapped = allSchoolEnrollments.map(row => {
            const profile = row.user;
            const enrollment = currentEnrollments?.find(e => e.student_id === profile.id);
            return {
              ...mappers.user(profile),
              name: profile.name || '',
              globalRole: Role.STUDENT,
              classId: enrollment?.class_id || profile.class_id,
              programId: enrollment?.program_id,
              status: enrollment?.status || 'ACTIVE',
              oib: profile.oib,
              dob: profile.dob,
              pob: profile.pob,
              address: profile.address,
              mobile: profile.mobile,
              school_id: profile.school_id
            };
          });
          
const uniqueMapped = Array.from(new Map(mapped.map(m => [m.id, m])).values());
setStudents(uniqueMapped as any);

        }
      }

      if (!classToFetch) return;

      const { data: enrollments, error: err } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', classToFetch)
        .eq('status', 'ACTIVE');
      
      if (err) throw err;

      if (enrollments) {
        const mapped = enrollments.map(row => ({
          ...mappers.user(row.student), // Use mapper consistently
          name: row.student.name || '',
          globalRole: Role.STUDENT,
          classId: row.class_id
        }));
        
const uniqueMapped = Array.from(new Map(mapped.map(m => [m.id, m])).values());
setStudents(uniqueMapped as any);

      }

      const { data: enrollData } = await supabase
        .from('student_subject_enrollments')
        .select('*')
        .eq('class_id', classToFetch);
      if (enrollData) setClassEnrollments(mapList(enrollData, mappers.studentSubjectEnrollment));

      const { data: summaryData } = await supabase
        .from('student_year_summaries')
        .select('*')
        .eq('class_id', classToFetch);
      if (summaryData) setSummaries(mapList(summaryData, mappers.studentYearSummary));

      const { data: notesData } = await supabase
        .from('student_overall_notes')
        .select('*')
        .eq('class_id', classToFetch);
      if (notesData) setOverallNotes(mapList(notesData, mappers.studentOverallNotes));

      const { data: gradesData } = await supabase
        .from('grades')
        .select('*')
        .eq('class_id', classToFetch)
        .eq('is_final', true);
      // Removed period check as requested
      if (gradesData) setFinalGrades(mapList(gradesData, mappers.grade));

    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedClassId, activeTab, selectedSchoolId, selectedYearId]);

  const handleUpdateClass = async () => {
    if (isArchived) {
      toast.error('Nije moguće uređivati arhivirane razrede.');
      return;
    }
    if (!selectedClassId) return;
    setLoading(true);
    
    const payload = {
      homeroom_teacher_id: classDetailForm.homeroom_teacher_id || null,
      deputy_teacher_id: classDetailForm.deputy_teacher_id || null,
      program_id: classDetailForm.program_id || null
    };
    
    console.log('SAVE CLASS SETTINGS PAYLOAD', payload);
    console.log('CURRENT CLASS ID', selectedClassId);

    try {
      const { data: beforeUpdate } = await supabase.from('classes').select('*').eq('id', selectedClassId).single();
      console.log('CLASS DATA BEFORE UPDATE:', beforeUpdate);

      const { data: updatedRow, error } = await supabase.from('classes').update(payload).eq('id', selectedClassId).select().single();
      if (error) throw error;
      
      console.log('CLASS DATA AFTER UPDATE (returned row):', updatedRow);
      
      toast.success('Postavke razreda spremljene');
      
      // Refetch and verify
      console.log('FETCHING CLASS ID', selectedClassId);
      const { data: verifiedRow, error: verifiedError } = await supabase.from('classes')
        .select('*')
        .eq('id', selectedClassId)
        .single();
      console.log('CLASS FETCH RESULT', verifiedRow);
      console.log('CLASS FETCH ERROR', verifiedError);
      
      await fetchData(); 
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri spremanju postavki: ' + err.message);
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
    if (!selectedClassId || !selectedClassData) return;
    try {
      const payload = {
        student_id: studentId,
        class_id: selectedClassId,
        school_year_id: selectedClassData.school_year_id,
        school_year: selectedClassData.schoolYear,
        behavior,
      };

      const { error: upsertError } = await supabase.from('student_year_summaries').upsert(payload, {
        onConflict: 'student_id,class_id,school_year'
      });
      
      if (upsertError) throw upsertError;

      toast.success('Vladanje ažurirano');
      
      const { data: updatedSummaries } = await supabase
        .from('student_year_summaries')
        .select('*')
        .eq('class_id', selectedClassId);
      if (updatedSummaries) setSummaries(mapList(updatedSummaries, mappers.studentYearSummary));
    } catch (err) {
      console.error(err);
      toast.error('Greška pri ažuriranju vladanja');
    }
  };

  const handleFinalizeYearSummaries = async (classId: string) => {
    if (!classId || !selectedClassData) return;
    if (!confirm('Želite li izračunati i zaključiti opći uspjeh za sve učenike u ovom razredu? Ovo će prepisati postojeće nezaključene podatke.')) return;

    const classStudents = students.filter(s => s.classId === classId);
    console.log("FINALIZING FOR CLASS:", classId, "STUDENT COUNT:", classStudents.length);
    let successCount = 0;
    let skipCount = 0;
    const failures: { student: string, missing: string[] }[] = [];

    setLoading(true);
    try {
      // 1. Fetch all enrollments for this class once
      const { data: enrollData } = await supabase
        .from('student_subject_enrollments')
        .select('student_id, subject_id, status')
        .eq('class_id', classId);
      
      // 2. Fetch all final grades for this class once
      const { data: finalGradesData } = await supabase
        .from('grades')
        .select('student_id, subject_id, value, period, is_final')
        .eq('class_id', classId)
        .eq('is_final', true);
      
      // 3. Fetch overall notes for vladanje
      const { data: overallNotesData } = await supabase
        .from('student_overall_notes')
        .select('student_id, disciplinary_actions')
        .eq('class_id', classId);

      for (const student of classStudents) {
        const studentEnrollments = (enrollData || []).filter(e => e.student_id === student.id && e.status === 'ACTIVE');
        const studentGrades = (finalGradesData || []).filter(g => g.student_id === student.id);
        const studentNotes = (overallNotesData || []).find(n => n.student_id === student.id);
        
        let behavior = 'Uzorno';
        if (studentNotes?.disciplinary_actions) {
          const da = studentNotes.disciplinary_actions.toLowerCase();
          if (da.includes('ukor')) behavior = 'Loše';
          else if (da.includes('opomena')) behavior = 'Dobro';
        }
        
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
          const hasFail = gradesValues.some(v => v === 1);
          const avg = gradesValues.reduce((a, b) => a + b, 0) / gradesValues.length;
          const finalResultGrade = hasFail ? 1 : getFinalAverageGrade(avg);
          
          const payload = {
            student_id: student.id,
            class_id: classId,
            school_year_id: selectedClassData.school_year_id,
            school_year: selectedClassData.schoolYear,
            average: Number(avg.toFixed(2)),
            final_result: finalResultGrade,
            behavior,
            status: 'FINALIZED',
            finalized_at: new Date().toISOString(),
            finalized_by: user?.id
          };

          const { error: upsertError } = await supabase.from('student_year_summaries').upsert(payload, {
            onConflict: 'student_id,class_id,school_year'
          });

          if (upsertError) console.error(`Upsert error for ${student.id}:`, upsertError);
          else successCount++;
        } else {
          skipCount++;
        }
      }

      if (failures.length > 0) {
        toast(`${successCount} uspješnih, ${skipCount} preskočenih. provjerite ocjene.`, { icon: '⚠️' });
      } else {
        toast.success(`Uspješno zaključeno za svih ${successCount} učenika.`);
      }
      
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Greska pri zaključivanju.');
    } finally {
      setLoading(false);
    }
  };
  const getProgramRule = (grade: number | string, section: string) => {
    if (['1', '2', '3'].includes(String(grade)) && section === 'A') return { name: 'Kuhar/Kuharica', type: 'VOCATIONAL_3Y' };
    if (['1', '2', '3'].includes(String(grade)) && section === 'B') return { name: 'Konobar/Konobarica', type: 'VOCATIONAL_3Y' };
    if (['1', '2', '3'].includes(String(grade)) && section === 'C') return { name: 'Slastičar/Slastičarka', type: 'VOCATIONAL_3Y' };
    if (['1', '2', '3', '4'].includes(String(grade)) && section === 'D') return { name: 'Tehničar za ugostiteljstvo / Tehničarka za ugostiteljstvo', type: 'COMMERCIALIST_4Y' };
    if (String(grade) === '4' && ['A', 'B', 'C'].includes(section)) return { name: 'Turističko-hotelijerski komercijalist', type: 'CONTINUATION_PAID' };
    if (String(grade) === '4' && section === 'K') return { name: 'Turističko-hotelijerski komercijalist', type: 'CONTINUATION_FREE' };
    if (String(grade) === '4' && section === 'I') return { name: 'Turističko-hotelijerski komercijalist', type: 'COMMERCIALIST_4Y' };
    return null;
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const yearId = classCreationYearId;
    if (!newClassName || !selectedSchoolId || !yearId) {
      toast.error('Greška: Nedostaju podaci za kreiranje razreda');
      return;
    }
    if (!newClassHomeroomTeacherId) {
      toast.error('Odaberite razrednika.');
      return;
    }
    
    let finalGradeLevel = newClassGrade;
    let finalSection = newClassSection;
    let finalName = newClassName;

    if (newClassVariant === 'REGULAR') {
      finalGradeLevel = Number(newClassGrade);
      finalSection = newClassSection.toUpperCase();
      finalName = `${finalGradeLevel}.${finalSection}`;
    } else if (newClassVariant === 'CONTINUATION_FREE') {
      finalGradeLevel = 4;
      finalSection = 'K';
      finalName = '4.K';
    } else if (newClassVariant === 'CONTINUATION_PAID') {
      finalGradeLevel = 4;
      finalSection = newClassSection.toUpperCase();
      finalName = `4.${finalSection}`;
    }

    console.log("CREATE CLASS CLICKED", { name: finalName, variant: newClassVariant, yearId, selectedSchoolId });
    
    setLoading(true);
    try {
      const rule = getProgramRule(finalGradeLevel, finalSection);
      let programIdToUse = newUserForm.programId || null;

      if (rule) {
          const { data: programsData, error: progError } = await supabase
            .from('programs')
            .select('*')
            .eq('school_id', selectedSchoolId)
            .eq('name', rule.name)
            .eq('type', rule.type);

          console.log('SCHOOL ID:', selectedSchoolId);
          console.log('RULE:', rule);
          console.log('LOADED PROGRAMS:', programsData);

          if (progError) throw progError;
          if (programsData && programsData.length > 0) {
              programIdToUse = programsData[0].id;
              console.log('SELECTED PROGRAM ID:', programIdToUse);
          } else {
              toast.error("Nije pronađen odgovarajući program za ovaj razred. Prvo ga dodajte u Smjerovi / Programi.");
              setLoading(false);
              return;
          }
      }

      const currentYear = schoolYears.find(y => y.id === yearId);
      console.log('Saving class with school_year_id:', yearId);

      // PRE-INSERT CHECK: Check if class with same name already exists in this school year
      const { data: existingClass, error: checkError } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('school_year_id', yearId)
        .eq('name', finalName)
        .maybeSingle();
      
      if (checkError) {
        console.error('PRE-INSERT CHECK ERROR:', checkError);
      }

      if (existingClass) {
        toast.error(
          (t) => (
            <div className="flex flex-col gap-2">
              <span className="font-bold">Razred {finalName} već postoji u ovoj školskoj godini.</span>
              <button 
                onClick={() => {
                  toast.dismiss(t.id);
                  setSelectedClassId(existingClass.id);
                  setActiveTab('CLASS_DETAIL');
                }}
                className="bg-white text-[#005c8d] px-3 py-1 rounded text-[10px] font-black uppercase border border-[#005c8d] hover:bg-blue-50"
              >
                Otvori taj razred
              </button>
            </div>
          ),
          { duration: 6000 }
        );
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('classes').insert([{
        name: finalName,
        school_id: selectedSchoolId,
        school_year_id: yearId,
        school_year: currentYear?.name || '',
        grade_level: finalGradeLevel,
        section: finalSection,
        variant: newClassVariant,
        program_id: programIdToUse,
        status: 'ACTIVE',
        homeroom_teacher_id: newClassHomeroomTeacherId,
        deputy_teacher_id: newClassDeputyTeacherId || null
      }]).select();

      console.log("CREATE CLASS RESULT:", { data, error });

      if (error) {
        throw error;
      } else {
        setClassCreationYearId(null);
        toast.success('Razredni odjel uspješno kreiran');
        // Fetch all classes again using the main data fetcher
        await fetchData();
      }
    } catch (err: any) {
      console.error("CREATE CLASS ERROR:", err);
      toast.error(`Greška pri kreiranju razreda: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openStudentDetail = (student: any) => {
    setSelectedStudentId(student.id);
    handleEditStudent(student);
    setActiveTab('STUDENT_DETAIL');
  };
  const handleEditStudent = async (student: any) => {
    setEditingStudentId(student.id);
    
    // Fetch parent contact info
    const { data: parentData } = await supabase
      .from('student_parent_contacts')
      .select('*')
      .eq('student_id', student.id)
      .maybeSingle();

    setStudentForm({
      name: student.name || '',
      email: student.email || '',
      classId: student.classId || '',
      schoolId: student.school_id || selectedSchoolId || '',
      programId: student.programId || '',
      oib: student.oib || '',
      dob: student.dob || '',
      pob: student.pob || '',
      address: student.address || '',
      mobile: student.mobile || '',
      status: (student.status as any) || 'ACTIVE',
      isContinuation: false,
      continuationType: null,
      parentName: parentData?.parent_name || '',
      parentPhone: parentData?.parent_phone || '',
      parentEmail: parentData?.parent_email || '',
      parentNotes: parentData?.notes || ''
    });
  };

  const [isBulkAddingStudents, setIsBulkAddingStudents] = useState<boolean>(false);
  const [bulkStudentText, setBulkStudentText] = useState<string>('');
  const [bulkStudentClassId, setBulkStudentClassId] = useState<string>('');
  const [bulkStudentProgramId, setBulkStudentProgramId] = useState<string>('');

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.name || !selectedSchoolId) {
      toast.error('Ime i prezime i škola su obavezni');
      return;
    }
    setLoading(true);
    try {
      if (editingStudentId) {
        // UPDATE EXISTING STUDENT
        // 1. Update user profile - ONLY profile fields
        const currentYear = schoolYears.find(y => y.id === activeYearId) || schoolYears.find(y => y.isActive);
        
        const updatePayload: any = {
            name: studentForm.name,
            oib: studentForm.oib,
            dob: studentForm.dob || null,
            pob: studentForm.pob,
            address: studentForm.address,
            mobile: studentForm.mobile,
            class_id: studentForm.classId || null,
            school_id: selectedSchoolId,
            school_year_id: currentYear?.id || null
        };
        if (studentForm.email) {
            updatePayload.email = studentForm.email.toLowerCase();
        }

        console.log('UPDATE STUDENT ID:', editingStudentId);
        console.log('UPDATE PAYLOAD:', updatePayload);

        const { data: updatedProfile, error: profileError } = await supabase
          .from('user_profiles')
          .update(updatePayload)
          .eq('id', editingStudentId)
          .select()
          .maybeSingle();
        
        // Define aliases to match requested logs format precisely
        const student = { id: editingStudentId };
        const payload = updatePayload;
        const data = updatedProfile;
        const error = profileError;
        console.log("EDIT STUDENT ID", student.id);
        console.log("EDIT STUDENT PAYLOAD", payload);
        console.log("EDIT STUDENT RESULT", data);
        console.log("EDIT STUDENT ERROR", error);

        if (profileError) throw profileError;

        if (!updatedProfile) {
          toast.error('Nijedan zapis nije ažuriran.');
          setLoading(false);
          return;
        }

        // 2. Update/Upsert enrollment - for program and class history
        const { error: enrollmentError } = await supabase
          .from('student_class_enrollments')
          .upsert({
            student_id: editingStudentId,
            class_id: studentForm.classId || null,
            school_year_id: currentYear?.id,
            school_year: currentYear?.name,
            program_id: studentForm.programId || null,
            status: studentForm.status || 'ACTIVE'
          }, {
            onConflict: 'student_id,school_year_id'
          });

        if (enrollmentError) throw enrollmentError;

        // 3. Update parent contacts
        await supabase
          .from('student_parent_contacts')
          .upsert({
            student_id: editingStudentId,
            parent_name: studentForm.parentName,
            parent_phone: studentForm.parentPhone,
            parent_email: studentForm.parentEmail,
            notes: studentForm.parentNotes
          }, {
            onConflict: 'student_id'
          });

        toast.success('Učenik uspješno ažuriran');
        setEditingStudentId(null);
      } else {
        // CREATE NEW STUDENT
        const classIdToUse = isClassAdminMode ? selectedClassId : studentForm.classId;
        const classToUse = classes.find(c => c.id === classIdToUse);
        const programIdToUse = classToUse?.programId || studentForm.programId || null;

        if (!classIdToUse) {
          throw new Error("Razred nije odabran");
        }
        if (!classToUse) {
          throw new Error("Razred ne postoji");
        }

        const studentEmail = studentForm.email?.toLowerCase().trim() || '';
        const originalFullName = studentForm.name.trim();

        const profilePayload = {
          email: studentEmail || undefined,
          name: originalFullName,
          globalRole: 'STUDENT',
          schoolId: classToUse.school_id || selectedSchoolId,
          authOnly: true,
          studentData: {
            oib: studentForm.oib || Math.floor(Math.random() * 100000000000).toString(),
            dob: studentForm.dob,
            pob: studentForm.pob,
            mobile: studentForm.mobile,
            address: studentForm.address || '',
            classId: classIdToUse,
            programId: programIdToUse
          }
        };

        const response = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profilePayload)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Neuspješno kreiranje korisničkog računa');

        const createdAuthUser = { id: result.userId, email: result.email || studentEmail };

        console.log("CREATED AUTH USER", createdAuthUser);

        // 1. user_profiles
        const profileInsertPayload = {
          auth_user_id: createdAuthUser.id,
          email: createdAuthUser.email,
          name: originalFullName,
          role: 'STUDENT',
          class_id: classIdToUse,
          school_id: classToUse.school_id || selectedSchoolId,
          school_year_id: classToUse.school_year_id || null,
          requires_password_change: false,
          requires_authenticator_setup: false,
          password_type: 'student_static',
          dob: studentForm.dob || null,
          pob: studentForm.pob || null,
          mobile: studentForm.mobile || null,
          address: studentForm.address || '',
          oib: studentForm.oib || Math.floor(Math.random() * 100000000000).toString()
        };

        const { data: createdProfile, error: profileErr } = await supabase
          .from('user_profiles')
          .insert([profileInsertPayload])
          .select()
          .single();

        if (profileErr) {
          console.error("Profile creation failed:", profileErr);
          throw new Error("Greška pri kreiranju profila učenika: " + profileErr.message);
        }

        console.log("CREATED PROFILE", createdProfile);

        // 2. user_school_roles
        const roleInsertPayload = {
          user_id: createdProfile.id,
          school_id: classToUse.school_id || selectedSchoolId,
          role: 'STUDENT'
        };

        const { data: roleResult, error: roleErr } = await supabase
          .from('user_school_roles')
          .insert([roleInsertPayload])
          .select()
          .single();

        if (roleErr) {
          console.error("School role creation failed:", roleErr);
          throw new Error("Greška pri kreiranju uloge u školi: " + roleErr.message);
        }

        console.log("CREATED USER SCHOOL ROLE", roleResult);

        // 3. student_class_enrollments
        const enrollmentInsertPayload = {
          student_id: createdProfile.id,
          class_id: classIdToUse,
          school_year_id: classToUse.school_year_id || null,
          school_year: classToUse.schoolYear || '2024/2025',
          program_id: programIdToUse,
          status: 'ACTIVE'
        };

        const { data: enrollmentResult, error: enrollErr } = await supabase
          .from('student_class_enrollments')
          .insert([enrollmentInsertPayload])
          .select()
          .single();

        if (enrollErr) {
          console.error("Enrollment failed:", enrollErr);
          throw new Error("Greška pri kreiranju upisa u razred: " + enrollErr.message);
        }

        console.log("CREATED STUDENT ENROLLMENT", enrollmentResult);

        // 4. Enroll subjects if selected
        if (studentForm.enrollSubjects) {
          const { data: classSubjects } = await supabase
            .from('class_subject_teachers')
            .select('subject_id')
            .eq('class_id', classIdToUse);

          if (classSubjects && classSubjects.length > 0) {
            const uniqueSubjectIds = Array.from(new Set(classSubjects.map(cs => cs.subject_id)));
            const subjectEnrollments = uniqueSubjectIds.map(subId => ({
              student_id: createdProfile.id,
              subject_id: subId,
              class_id: classIdToUse,
              school_year_id: classToUse.school_year_id || null,
              school_year: classToUse.schoolYear || '2024/2025',
              status: 'ACTIVE'
            }));

            console.log("SAVING SUBJECT ENROLLMENTS", subjectEnrollments);
            const { error: subjectEnrollErr } = await supabase
              .from('student_subject_enrollments')
              .upsert(subjectEnrollments, { onConflict: 'student_id,subject_id,class_id,school_year' });

            if (subjectEnrollErr) {
              console.error("Greška pri upisu predmeta:", subjectEnrollErr);
            }
          }
        }

        // Save parent contacts for new student
        await supabase
          .from('student_parent_contacts')
          .insert({
            student_id: createdProfile.id,
            parent_name: studentForm.parentName,
            parent_phone: studentForm.parentPhone,
            parent_email: studentForm.parentEmail,
            notes: studentForm.parentNotes
          });

        toast.success(`Učenik ${studentForm.name} stvoren i upisan u razred.`);
        setStudentForm({
          name: '',
          email: '',
          classId: '',
          schoolId: selectedSchoolId || '',
          programId: '',
          oib: '',
          dob: '',
          pob: '',
          address: '',
          mobile: '',
          status: 'ACTIVE',
          isContinuation: false,
          continuationType: null,
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentNotes: '',
          enrollSubjects: true
        });
        await fetchData();
        setActiveTab('CLASS_DETAIL');
        
        console.log('LOAD STUDENTS FOR CLASS', classIdToUse);
        await fetchData();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCreateStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    const classIdToUse = isClassAdminMode ? selectedClassId : bulkStudentClassId;
    const programIdToUse = isClassAdminMode ? selectedClassData?.programId : bulkStudentProgramId;
    
    if (!classIdToUse || !programIdToUse || !bulkStudentText.trim()) {
      toast.error('Razred, program i lista učenika su obavezni.');
      return;
    }

    const lines = bulkStudentText.split('\n').filter(l => l.trim().length > 0);
    const parsedStudents: {name: string, surname: string, email?: string}[] = [];

    for (const line of lines) {
        const parts = line.split(',');
        const fullName = parts[0].trim();
        const email = parts[1]?.trim();
        
        const name = fullName;
        const surname = '';

        parsedStudents.push({ name, surname, email: email || undefined });
    }

    setLoading(true);
    try {
        const currentYear = schoolYears.find(y => y.id === activeYearId) || schoolYears.find(y => y.isActive);
        const res = await fetch('/api/admin/bulk-create-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                students: parsedStudents,
                classId: classIdToUse,
                schoolId: selectedSchoolId,
                programId: programIdToUse,
                school_year_id: currentYear?.id
            })
        });
        
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Greška pri grupnom dodavanju');
        }

        toast.success(`Učenici uspješno dodani. Dodano ${parsedStudents.length} učenika.\nLozinka za učenike: yupu8Ev4`, { duration: 8000 });
        setBulkStudentText('');
        setIsBulkAddingStudents(false);
        fetchData();
    } catch (err: any) {
        console.error(err);
        toast.error('Dogodila se greška: ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName || !selectedSchoolId) return;
    
    console.log("CREATE SUBJECT CLICKED", { name: newSubjectName, schoolId: selectedSchoolId });
    
    setLoading(true);
    try {
      const { data, error } = await supabase.from('subjects').insert([{
        name: newSubjectName,
        school_id: selectedSchoolId
      }]).select();
      
      console.log("CREATE SUBJECT RESULT:", { data, error });
      
      if (error) throw error;
      
      toast.success('Predmet uspješno kreiran');
      setNewSubjectName('');
      
      // Update local subjects list
      const { data: updatedSubjects } = await supabase.from('subjects').select('*').eq('school_id', selectedSchoolId);
      if (updatedSubjects) {
const mappedSub2 = mapList(updatedSubjects, mappers.subject);
const uniqueSub2 = Array.from(new Map(mappedSub2.map(s => [s.id, s])).values());
setAllSubjects(uniqueSub2);
}

    } catch (err: any) {
      console.error("CREATE SUBJECT ERROR:", err);
      toast.error('Problem kod kreiranja predmeta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isArchived) {
      toast.error('Nije moguće uređivati arhivirane razrede.');
      return;
    }
    if (!assignmentForm.subjectId || !assignmentForm.classId || !assignmentForm.teacherId) {
      toast.error('Molimo popunite sva polja');
      return;
    }
    
    console.log("CREATE ASSIGNMENT CLICKED", assignmentForm);
    
    setLoading(true);
    try {
      const payload = {
        subject_id: assignmentForm.subjectId,
        class_id: assignmentForm.classId,
        teacher_id: assignmentForm.teacherId,
        school_id: selectedSchoolId,
        group_name: assignmentForm.groupName || null
      };

      const classSubjectPayload = {
        class_id: assignmentForm.classId,
        subject_id: assignmentForm.subjectId,
        school_id: selectedSchoolId,
        subject_type: assignmentForm.subjectType,
        is_foreign_language: assignmentForm.isForeignLanguage,
        subject_period: assignmentForm.subjectPeriod,
        planned_hours_semester_1: assignmentForm.plannedHoursSemester1 ? parseInt(assignmentForm.plannedHoursSemester1) : null,
        planned_hours_total: assignmentForm.plannedHoursTotal ? parseInt(assignmentForm.plannedHoursTotal) : null
      };

      console.log("CLASS SUBJECT CREATE PAYLOAD", classSubjectPayload);
      console.log("CLASS SUBJECT TEACHER PAYLOAD", payload);
      console.log("GROUP NAME", assignmentForm.groupName);
      console.log("ADD SUBJECT TO ALL STUDENTS", assignmentForm.addToAllStudents);

      const { error: csError } = await supabase.from('class_subjects').upsert([classSubjectPayload], { onConflict: 'class_id,subject_id' });
      if (csError) throw csError;

      if (editingAssignmentId) {
        const { data, error } = await supabase.from('class_subject_teachers').update(payload).eq('id', editingAssignmentId).select();
        
        console.log("UPDATE ASSIGNMENT RESULT:", { data, error });
        if (error) throw error;
        toast.success('Zaduženje ažurirano');
      } else {
        const { data, error } = await supabase.from('class_subject_teachers').insert([payload]).select();
        
        console.log("CREATE ASSIGNMENT RESULT:", { data, error });
        if (error) throw error;
        toast.success('Zaduženje kreirano');

        if (assignmentForm.addToAllStudents) {
           const classData = classes.find(c => c.id === assignmentForm.classId);
           if (classData) {
              const { data: students } = await supabase.from('student_class_enrollments').select('*').eq('class_id', assignmentForm.classId).eq('status', 'ACTIVE');
              if (students && students.length > 0) {
                 const enrollments = students.map(s => ({
                   student_id: s.student_id,
                   subject_id: assignmentForm.subjectId,
                   class_id: assignmentForm.classId,
                   school_year_id: classData.school_year_id,
                   school_year: classData.schoolYear,
                   status: 'ACTIVE'
                 }));
                 console.log("STUDENT SUBJECT ENROLLMENTS CREATED", enrollments);
                 const { error: enrollError } = await supabase.from('student_subject_enrollments').upsert(enrollments, { onConflict: 'student_id,subject_id,class_id,school_year' });
                 if (enrollError) console.error("ENROLL ERROR:", enrollError);
              }
           }
        }
      }
      setAssignmentForm({ 
        subjectId: '', classId: '', teacherId: '', groupName: '',
        subjectType: 'redovni', isForeignLanguage: false, subjectPeriod: 'FULL_YEAR',
        plannedHoursSemester1: '', plannedHoursTotal: '', addToAllStudents: true
      });
      setEditingAssignmentId(null);
      
      // Refresh assignments
      const { data: updatedAssignments } = await supabase.from('class_subject_teachers').select('*').eq('school_id', selectedSchoolId);
      if (updatedAssignments) setSubjectAssignments(mapList(updatedAssignments, mappers.classSubjectTeacher));

      const { data: classSubjectsData } = await supabase.from('class_subjects').select('*').eq('school_id', selectedSchoolId);
      if (classSubjectsData) setClassSubjects(mapList(classSubjectsData, mappers.classSubject));

    } catch (err: any) {
      console.error("ASSIGNMENT ERROR:", err);
      toast.error('Greška pri spremanju zaduženja: ' + err.message);
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
    console.log("CONFIRM DELETE CLICKED", deleteDialog);

    if (!deleteDialog.type) return;

    // Permissions check
    if (!isAnyAdmin) {
      toast.error('Samo administrator može brisati ove zapise.');
      setDeleteDialog({ ...deleteDialog, isOpen: false });
      return;
    }

    setDeleteDialog(prev => ({ ...prev, loading: true }));

    try {
      if (deleteDialog.type === 'CLASS') {
        const classId = deleteDialog.id;
        console.log("DELETE CLASS CONFIRMED", classId);
        
        // MAIN_ADMIN can force delete with cascade
        if (isAnyAdmin) {
          console.log("EXECUTING CASCADE DELETE FOR CLASS:", classId);
          // Manual cascade for safety
          const cleanupResults = await Promise.all([
            supabase.from('grades').delete().eq('class_id', classId),
            supabase.from('absences').delete().eq('class_id', classId),
            supabase.from('lessons').delete().eq('class_id', classId),
            supabase.from('schedule_cells').delete().eq('class_id', classId),
            supabase.from('student_class_enrollments').delete().eq('class_id', classId),
            supabase.from('student_subject_enrollments').delete().eq('class_id', classId),
            supabase.from('curriculum_plans').delete().eq('class_id', classId),
            supabase.from('class_subject_teachers').delete().eq('class_id', classId),
            supabase.from('student_year_summaries').delete().eq('class_id', classId),
            supabase.from('student_overall_notes').delete().eq('class_id', classId),
            supabase.from('class_overall_notes').delete().eq('class_id', classId),
          ]);

          console.log("CASCADE CLEANUP RESULTS:", cleanupResults);

          const { error: deleteError, count } = await supabase
            .from('classes')
            .delete({ count: 'exact' })
            .eq('id', classId);
            
          console.log('DELETE CLASS RESULT', { error: deleteError, count });

          if (deleteError) {
            console.error("SUPABASE DELETE ERROR:", deleteError);
            throw deleteError;
          }
          
          if (count === 0) {
            console.warn('Razred nije obrisan jer nije pronađen u bazi.');
          }
          
          toast.success('Razred i svi povezani podaci su obrisani.');
          await fetchData();
        } else {
          const { error: deleteError, count } = await supabase
            .from('classes')
            .delete({ count: 'exact' })
            .eq('id', classId);
            
          console.log('DELETE CLASS RESULT', { error: deleteError, count });
          
          if (deleteError) throw deleteError;
          
          if (count === 0) {
            console.warn('Razred nije obrisan jer nije pronađen u bazi.');
          }
          
          toast.success('Razred je obrisan.');
          await fetchData();
        }
      } else if ((deleteDialog.type as string) === 'SCHOOL_YEAR') {
        const yearId = deleteDialog.id;
        // Delete all classes in year first
        const { data: yearClasses } = await supabase.from('classes').select('id').eq('school_year_id', yearId);
        if (yearClasses && yearClasses.length > 0) {
          for (const c of yearClasses) {
            await Promise.all([
              supabase.from('grades').delete().eq('class_id', c.id),
              supabase.from('absences').delete().eq('class_id', c.id),
              supabase.from('student_class_enrollments').delete().eq('class_id', c.id),
              supabase.from('class_subject_teachers').delete().eq('class_id', c.id),
              supabase.from('classes').delete().eq('id', c.id)
            ]);
          }
        }
        const { error } = await supabase.from('school_years').delete().eq('id', yearId);
        if (error) throw error;
        toast.success('Školska godina je obrisana.');
      } else if (deleteDialog.type === 'SUBJECT') {
        const subjectId = deleteDialog.id;
        if (isMainAdmin) {
          if (confirm('Obavijest: Brisanje predmeta uklonit će sva zaduženja, planove i upise povezane s ovim predmetom. Nastaviti?')) {
             await Promise.all([
               supabase.from('class_subject_teachers').delete().eq('subject_id', subjectId),
               supabase.from('curriculum_plans').delete().eq('subject_id', subjectId),
               supabase.from('student_subject_enrollments').delete().eq('subject_id', subjectId),
               supabase.from('grading_elements').delete().eq('subject_id', subjectId),
               supabase.from('grades').delete().eq('subject_id', subjectId),
               supabase.from('exams').delete().eq('subject_id', subjectId),
             ]);
             const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
             if (error) throw error;
             toast.success('Predmet je obrisan.');
          }
        } else {
          const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
          if (error) throw error;
          toast.success('Predmet je obrisan.');
        }
      } else if (deleteDialog.type === 'STUDENT') {
        const student = deleteDialog.item;
        
        if (!student || !student.id) {
            toast.error('Nije odabran učenik za brisanje.');
            setDeleteDialog(prev => ({ ...prev, loading: false }));
            return;
        }

        console.log('STUDENT TO DELETE:', student);
        const studentId = student.id;

        try {
            console.log('DELETE STUDENT ID', studentId);

            // Sequential deletion to ensure robust error handling
            const tablesToDeleteFrom = [
                { table: 'grades', column: 'student_id', id: studentId },
                { table: 'absences', column: 'student_id', id: studentId },
                { table: 'student_class_enrollments', column: 'student_id', id: studentId },
                { table: 'student_subject_enrollments', column: 'student_id', id: studentId },
                { table: 'student_year_summaries', column: 'student_id', id: studentId },
                { table: 'student_overall_notes', column: 'student_id', id: studentId },
                { table: 'user_school_roles', column: 'user_id', id: studentId },
            ];

            for (const item of tablesToDeleteFrom) {
                const { error, count } = await supabase.from(item.table).delete({ count: 'exact' }).eq(item.column, item.id);
                console.log(`DELETE ${item.table} RESULT`, { error, count });
                if (error) throw new Error(`Greška pri brisanju iz ${item.table}: ${error.message}`);
            }
            
            // Delete actual profile
            const { error: profileDeleteError, count: profileCount } = await supabase.from('user_profiles').delete({ count: 'exact' }).eq('id', studentId);
            console.log('DELETE USER_PROFILES RESULT', { error: profileDeleteError, count: profileCount });
            
            if (profileDeleteError) throw new Error(`Greška pri brisanju profila: ${profileDeleteError.message}`);
            if (profileCount === 0) throw new Error('Profil nije pronađen u bazi.');

            toast.success('Učenik i svi povezani podaci su obrisani.');
            await fetchData();
        } catch (err: any) {
            console.error('STUDENT DELETE ERROR', err);
            toast.error(err.message || 'Došlo je do pogreške pri brisanju učenika.');
        } finally {
            setDeleteDialog({ isOpen: false, id: null, type: null, loading: false });
        }

      } else if (deleteDialog.type === 'STAFF') {
        await supabase.from('class_subject_teachers').delete().eq('id', deleteDialog.id);
        toast.success('Zaduženje je obrisano.');
      } else if (deleteDialog.type === 'PLANNING') {
        await supabase.from('curriculum_plans').delete().eq('id', deleteDialog.id);
        toast.success('Plan je obrisan.');
      } else if (deleteDialog.type === 'PROGRAM') {
        const { error } = await supabase.from('programs').delete().eq('id', deleteDialog.id);
        if (error) throw error;
        toast.success('Program je obrisan.');
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error('Brisanje nije uspjelo: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setDeleteDialog({ isOpen: false, id: '', type: null, loading: false });
      if (typeof fetchData === 'function') fetchData();
    }
  };

  const handleCreateSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearForm.name || !selectedSchoolId) {
      toast.error('Naziv školske godine je obavezan');
      return;
    }
    
    console.log("CREATE SCHOOL YEAR CLICKED", { name: newYearForm.name, schoolId: selectedSchoolId });
    
    setLoading(true);
    try {
      if (schoolYears.some(y => y.name === newYearForm.name)) {
        toast.error('Ova školska godina već postoji');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from('school_years').insert([{
        name: newYearForm.name,
        starts_at: newYearForm.startsAt || null,
        ends_at: newYearForm.endsAt || null,
        school_id: selectedSchoolId,
        is_active: schoolYears.length === 0 
      }]).select().single();

      console.log("CREATE SCHOOL YEAR RESULT:", { data, error });

      if (error) {
        throw error;
      } else {
        setNewYearForm({ name: '', startsAt: '', endsAt: '' });
        toast.success(`Nova školska godina ${newYearForm.name} je otvorena`);
        await fetchSchoolYears();
      }
    } catch (err: any) {
      console.error("CREATE SCHOOL YEAR ERROR:", err);
      toast.error('Greška pri otvaranju školske godine: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSchoolYear = async (yearId: string) => {
    console.log('--- handleActivateSchoolYear CLICKED ---', { yearId, selectedSchoolId });
    if (!selectedSchoolId) {
      toast.error('Greska: Interni ID škole nije postavljen. Osvježite stranicu.');
      return;
    }
    const year = schoolYears.find(y => y.id === yearId);
    if (!year) {
      toast.error('Greska: Školska godina nije pronađena.');
      return;
    }
    
    // TEMPORARILY BYPASSING CONFIRMATION AS REQUESTED FOR TESTING
    console.log("BYPASSING CONFIRMATION FOR TESTING");
    const confirmed = true;
    
    /*
    const confirmed = window.confirm(`Postaviti ${year.name} kao aktivnu godinu? Sve ostale bit će arhivirane.`);
    console.log("CONFIRM RESULT:", confirmed);
    */
    
    if (!confirmed) {
      console.log('Activation cancelled by user.');
      return;
    }

    console.log("ACTIVATION EXECUTION START");
    const toastId = toast.loading(`Aktivacija školske godine ${year.name}...`);
    setLoading(true);
    try {
      console.log('--- AKTIVACIJA ŠKOLSKE GODINE START ---');
      console.log('Ciljna godina:', { id: yearId, name: year.name });

      // 1. Set all school years for selected school: is_active = false (and status = 'ARCHIVED' for others)
      const { error: deactivateError } = await supabase
        .from("school_years")
        .update({ is_active: false, status: 'ARCHIVED' })
        .eq("school_id", selectedSchoolId);
      
      if (deactivateError) {
        console.error('Greška pri deaktivaciji ostalih godina:', deactivateError);
        throw deactivateError;
      }
      console.log('Sve ostale godine deaktivirane/arhivirane.');

      // 2. Set selected school year: is_active = true, status = 'ACTIVE'
      const { error: activateError } = await supabase
        .from("school_years")
        .update({ is_active: true, status: "ACTIVE" })
        .eq("id", yearId);

      if (activateError) {
        console.error('Greška pri aktivaciji godine:', activateError);
        throw activateError;
      }
      console.log('Ciljna godina aktivirana.');

      toast.success(`Školska godina ${year.name} je sada aktivna.`, { id: toastId });
      
      // Update local state immediately for better UX
      setSchoolYears(prev => prev.map(y => ({
        ...y,
        isActive: y.id === yearId,
        status: y.id === yearId ? 'ACTIVE' : 'ARCHIVED'
      })));

      await fetchSchoolYears();
      if (typeof fetchData === 'function') await fetchData();
      console.log('--- AKTIVACIJA ŠKOLSKE GODINE USPJEŠNA ---');
    } catch (err: any) {
      console.error('KRITIČNA GREŠKA PRI AKTIVACIJI:', err);
      toast.error('Aktivacija nije uspjela: ' + (err.message || 'Nepoznata Supabase greška'), { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveSchoolYear = async (yearId: string) => {
    console.log('--- handleArchiveSchoolYear CLICKED ---', { yearId });
    const year = schoolYears.find(y => y.id === yearId);
    if (!year) return;
    
    const confirmed = window.confirm(`Arhivirati školsku godinu ${year.name}?`);
    console.log("ARCHIVE CONFIRM RESULT:", confirmed);
    if (!confirmed) return;

    console.log("ARCHIVE EXECUTION START");
    const toastId = toast.loading(`Arhiviranje školske godine ${year.name}...`);
    setLoading(true);
    try {
      const { error } = await supabase
        .from('school_years')
        .update({ is_active: false, status: 'ARCHIVED' })
        .eq('id', yearId);

      if (error) throw error;
      toast.success('Školska godina arhivirana', { id: toastId });
      await fetchSchoolYears();
    } catch (err: any) {
      console.error(err);
      toast.error('Arhiviranje nije uspjelo: ' + err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleFixSchoolYears = async () => {
    setLoading(true);
    console.log("selectedSchoolId", selectedSchoolId);
    try {
      // 1. Ensure we have school years loaded
      const { data: yearsData, error: yearsError } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('starts_at', { ascending: false });

      console.log("schoolYears found", yearsData);
      if (yearsError) console.error("schoolYears error", yearsError);

      const currentYears = yearsData ? mapList(yearsData, mappers.schoolYear) : [];
      let activeYear = currentYears.find(y => y.isActive);

      if (!activeYear && currentYears.length > 0) {
        activeYear = currentYears[0];
      }

      // If NO year exists at all, create one
      if (!activeYear) {
         const currentYear = new Date().getFullYear();
         const nextYear = currentYear + 1;
         const { data: newYear, error: createError } = await supabase.from('school_years').insert([{
           name: `${currentYear}./${nextYear}.`,
           school_id: selectedSchoolId,
           is_active: true,
           starts_at: `${currentYear}-09-01`,
           ends_at: `${nextYear}-06-30`
         }]).select().single();
         
         if (createError) throw createError;
         if (newYear) {
           activeYear = mappers.schoolYear(newYear);
           currentYears.push(activeYear);
         }
      }

      if (!activeYear) throw new Error("Nije moguće pronaći ili kreirati školsku godinu.");
      console.log("activeSchoolYear found", activeYear);

      let created = 0;
      let linked = 0;

      // Part A: Link by name
      const uniqueYearNames = Array.from(new Set(classes.map(c => c.schoolYear).filter(Boolean))) as string[];
      for (const name of uniqueYearNames) {
        let yearId = currentYears.find(y => y.name === name)?.id;
        if (!yearId) {
          const yearMatch = name.match(/(\d{4})/);
          const startYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
          console.log('Creating legacy school year by name:', name);
          const { data, error: insertError } = await supabase.from('school_years').insert([{
            name,
            school_id: selectedSchoolId,
            is_active: false,
            starts_at: `${startYear}-09-01`,
            ends_at: `${parseInt(startYear) + 1}-06-30`
          }]).select('id').single();
          
          if (insertError) {
             console.error("Error creating year during sync:", insertError);
             continue;
          }
          if (data) {
            yearId = data.id;
            created++;
          }
        }
        if (yearId) {
          const orphans = classes.filter(c => c.schoolYear === name && !c.school_year_id);
          if (orphans.length > 0) {
            console.log('Linking orphan classes to year_id:', yearId);
            const { error: updateError } = await supabase.from('classes').update({ 
               school_year_id: yearId 
            }).in('id', orphans.map(o => o.id));
            
            if (updateError) console.error("Error linking classes by name:", updateError);
            else linked += orphans.length;
          }
        }
      }

      // Part B: Link total orphans (no name, no id) or name-mismatch orphans to ACTIVE year
      const totalOrphans = classes.filter(c => !c.school_year_id);
      if (totalOrphans.length > 0) {
        console.log('Linking ALL remaining orphans to active year:', activeYear.id);
        const { error: updateOrphansError } = await supabase.from('classes').update({ 
          school_year_id: activeYear.id,
          school_year: activeYear.name 
        }).in('id', totalOrphans.map(o => o.id));
        
        if (updateOrphansError) console.error("Error linking remaining orphans:", updateOrphansError);
        else linked += totalOrphans.length;
      }

      toast.success(`Popravljeno: ${created} godina, ${linked} razrednih poveznica.`);
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Greska: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const createInitialClassesForYear = async () => {
    if (!selectedSchoolId || !selectedYearId) return;
    const year = schoolYears.find(y => y.id === selectedYearId);
    if (!year) return;

    setLoading(true);
    try {
      const classNames = ['1.A', '1.B', '1.C', '1.D'];
      const payloads = classNames.map(name => ({
        name,
        school_id: selectedSchoolId,
        school_year_id: selectedYearId,
        school_year: year.name,
        grade_level: 1,
        section: name.split('.')[1],
        status: 'ACTIVE'
      }));

      const { error } = await supabase.from('classes').insert(payloads);
      if (error) throw error;
      
      toast.success('Inicijalni razredi kreirani');
      fetchData();
    } catch (err: any) {
      toast.error('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans text-[13px]">
      {isMissingClassData && (
        <div className="flex-1 flex flex-col items-center justify-center bg-red-50 p-10 text-center">
           <ShieldAlert size={48} className="text-red-500 mb-4" />
           <h2 className="text-xl font-black text-red-700 uppercase">Pogreška: Kontekst razreda nije učitan</h2>
           <p className="text-sm text-red-600 mt-2 max-w-md">
             Sustav nije uspio dohvatiti podatke za razred ID: <span className="font-mono font-bold bg-white px-1">{selectedClassId}</span>. 
             Moguće je da razred ne postoji, da je izbrisanan ili da nemate ovlaštenja za pristup.
           </p>
           <div className="mt-6 flex gap-4">
              <button 
                onClick={() => fetchData()}
                className="bg-[#005c8d] text-white px-6 py-2 font-black text-[10px] uppercase hover:bg-[#004a70]"
              >
                Pokušaj ponovno
              </button>
              <button 
                onClick={() => navigate('/teacher/administration')}
                className="bg-white border border-gray-300 text-gray-600 px-6 py-2 font-black text-[10px] uppercase hover:bg-gray-50"
              >
                Povratak na listu
              </button>
           </div>
        </div>
      )}
      {!isMissingClassData && (
        <>
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
            // SCHOOL MODULES
            { label: 'Administracija škole', tab: 'MENU', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Školske godine', tab: 'SCHOOL_YEARS', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Razredni odjeli', tab: 'CLASSES', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Korisnici / Nastavnici', tab: 'USERS', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Učenici u školi', tab: 'STUDENTS', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Globalni predmeti', tab: 'SUBJECTS', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Smjerovi / programi', tab: 'PROGRAMS', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Prijenos (Rollover)', tab: 'ROLLOVER', mode: 'SCHOOL', hide: false, disabled: false },
            { label: 'Postavke škole', tab: 'SCHOOLS', mode: 'SCHOOL', hide: false, disabled: false },
            
            // CLASS MODULES
            { label: 'Postavke razreda', tab: 'CLASS_DETAIL', mode: 'CLASS', hide: false, disabled: false },
            { label: 'Predmeti u razredu', tab: 'STAFF', mode: 'CLASS', hide: false, disabled: false },
            { label: 'Učenici u razredu', tab: 'STUDENTS', filterToClass: true, mode: 'CLASS', hide: false, disabled: false },
            { label: 'Predmeti učenika', tab: 'STUDENT_SUBJECTS_ENROLL', mode: 'CLASS', hide: false, disabled: false },
            { label: 'Satnica i raspored', tab: 'PLANNING', mode: 'CLASS', hide: false, disabled: false },
            { label: 'Opći prosjek', tab: 'OPCI_PROSJEK', mode: 'CLASS', hide: false, disabled: false },
          ].map((opt: any, i) => {
            // Filter by mode
            if (isClassAdminMode && opt.mode !== 'CLASS') return null;
            if (isSchoolAdminMode && opt.mode !== 'SCHOOL') return null;

            if (opt.hide) return null;
            if (opt.disabled) return <div key={i} className="px-4 py-2 text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-50">{opt.label}</div>;
            
            return (
              <button 
                key={`${opt.tab}-${opt.label}`}
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
          {isArchived && selectedClassId && (
            <div className="mb-6 bg-amber-50 border border-amber-200 p-4 flex items-center gap-4">
              <ShieldAlert className="text-amber-500" size={24} />
              <div>
                <div className="text-[11px] font-black uppercase text-amber-800">Arhivirani razredni odjel</div>
                <div className="text-[10px] font-bold text-amber-700">Ovaj razredni odjel je dio arhivirane školske godine. Promjene su onemogućene.</div>
              </div>
            </div>
          )}

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
                  { label: 'Školske godine i prijenos', tab: 'SCHOOL_YEARS' },
                  { label: 'Upis završenih učenika', tab: 'GRADUATES_ADMIN' },
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
            <div className="space-y-6">
              <div className="bg-white border border-gray-300 shadow-sm p-4 sticky top-0 z-20 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Odabir školske godine</label>
                  <select 
                    value={selectedYearId}
                    onChange={e => setSelectedYearId(e.target.value)}
                    className="w-full border-2 border-gray-100 p-2 text-sm font-black text-gray-700 outline-none focus:border-[#005c8d]"
                  >
                    <option value="">-- SVE GODINE --</option>
                    {schoolYears.map(y => (
                      <option key={y.id} value={y.id}>{y.name} {y.isActive ? '(AKTIVNA)' : ''}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-2">
                  {!selectedYearId || classes.filter(c => !selectedYearId || c.school_year_id === selectedYearId).length === 0 && (
                    <button 
                      onClick={createInitialClassesForYear}
                      className="bg-amber-600 text-white px-4 py-2 font-black text-[10px] uppercase hover:bg-amber-700 flex items-center gap-2"
                    >
                      <Plus size={16} /> Kreiraj inicijalne razrede za ovu godinu
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setNewClassGrade(1);
                      setNewClassSection('');
                      setEditingClass(null);
                      setShowModal('NEW_CLASS');
                    }}
                    className="bg-[#005c8d] text-white px-4 py-2 font-black text-[10px] uppercase hover:bg-[#004a72] flex items-center gap-2"
                  >
                    <Plus size={16} /> Novi razred
                  </button>
                </div>
              </div>

              {classes.filter(c => !selectedYearId || c.school_year_id === selectedYearId).length === 0 ? (
                <div className="h-48 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                  <BookOpen size={40} className="mb-2 opacity-20" />
                  <div className="text-xs font-black uppercase">Nema pronađenih razreda za odabrane kriterije</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {classes
                    .filter(c => !selectedYearId || c.school_year_id === selectedYearId)
                    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')))
                    .map(cls => {
                    const year = schoolYears.find(y => y.id === cls.school_year_id);
                    return (
                      <div key={cls.id} className="bg-white border-2 border-gray-100 p-4 hover:border-[#005c8d] transition-all group relative">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-3xl font-black text-gray-800 tracking-tighter">{cls.name}</div>
                          <div className={cn(
                            "text-[8px] font-black px-1.5 py-0.5 rounded leading-none uppercase",
                            cls.status === 'ACTIVE' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          )}>
                            {cls.status === 'ACTIVE' ? 'Aktivan' : 'Arhiv'}
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-[9px] font-black text-gray-400 uppercase">Šk. godina: <span className="text-gray-600">{year?.name || cls.schoolYear}</span></div>
                          <div className="text-[9px] font-black text-gray-400 uppercase">Razrednik: <span className="text-gray-600 truncate block">
                            {(() => {
                              const ht = allUsers.find(u => u.id === cls.homeroomTeacherId);
                              return ht ? formatPersonName(ht) : 'Nije dodijeljen';
                            })()}
                          </span></div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex gap-2">
                             {isAnyAdmin && (
                               <>
                                 <button 
                                   onClick={() => {
                                     setEditingClass(cls);
                                     setNewClassGrade(cls.gradeLevel);
                                     setNewClassSection(cls.section || '');
                                     setShowModal('NEW_CLASS');
                                   }}
                                   className="p-1.5 text-gray-400 hover:text-[#005c8d] hover:bg-blue-50 rounded"
                                   title="Uredi"
                                 >
                                   <Settings2 size={16} />
                                 </button>
                                 <button 
                                   onClick={() => setDeleteDialog({ isOpen: true, id: cls.id, type: 'CLASS', loading: false, message: `Jeste li sigurni da želite obrisati razred ${cls.name}?` })}
                                   className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                   title="Obriši"
                                 >
                                   <Trash2 size={16} />
                                 </button>
                               </>
                             )}
                          </div>
                          <button 
                            onClick={() => setSelectedClassId(cls.id)}
                            className="text-[9px] font-black text-[#005c8d] uppercase border-b-2 border-transparent hover:border-[#005c8d]"
                          >
                            Upravljaj razredom
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                   <button 
                     onClick={() => setActiveTab('DOCUMENTS')}
                     className="bg-white border border-gray-300 text-gray-500 px-4 py-1.5 font-bold text-[10px] uppercase hover:bg-gray-50 flex items-center gap-2"
                   >
                     <FileText size={14}/> Svjedodžbe
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
                              {filteredPrograms.map(p => (
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
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Zamjenik razrednika</label>
                            <select 
                              className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              value={classDetailForm.deputy_teacher_id}
                              onChange={e => setClassDetailForm({...classDetailForm, deputy_teacher_id: e.target.value})}
                            >
                              <option value="">-- Nema (Opcionalno) --</option>
                              {teachers.filter(t => t.id !== classDetailForm.homeroom_teacher_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                         </div>
                         <button 
                           onClick={handleUpdateClass}
                           disabled={loading || isArchived}
                           className={cn(
                             "w-full text-white py-2 border font-black text-[10px] uppercase tracking-widest mt-2",
                             isArchived ? "bg-gray-400 border-gray-500 cursor-not-allowed" : "bg-[#005c8d] border-[#004a70]"
                           )}
                         >
                           {isArchived ? 'Arhivirano' : 'Spremi postavke'}
                         </button>
                      </div>
                   </div>

                   <div className="bg-white border border-gray-300 p-4">
                      <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Učenici ({students.filter(s => s.classId === selectedClassId).length})</div>
                      <div className="space-y-1 max-h-[400px] overflow-auto">
                        {students.filter(s => s.classId === selectedClassId).sort((a,b) => (a.name || '').localeCompare(b.name || '')).map((s, idx) => (
                           <div key={s.id} className="flex items-center justify-between p-2 border border-gray-100 hover:bg-gray-50">
                              <span className="text-[11px] font-bold text-gray-600">{idx+1}. {s.name}</span>
                              <button onClick={() => openStudentDetail(s)} className="text-[#005c8d] hover:underline text-[9px] font-black uppercase">Prikaz</button>
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
                           {isAnyAdmin && (
                             <button 
                               onClick={handleFixEnrollmentDuplicates}
                               className="text-red-500 font-bold uppercase text-[8px] border border-red-200 bg-red-50 px-2 py-0.5 rounded hover:bg-red-100"
                             >
                               Popravi duplikate upisa
                             </button>
                           )}
                         </div>
                         {(isAnyAdmin || selectedClassData?.homeroom_teacher_id === user?.id) && !editingAssignmentId && (
                           <button 
                             onClick={() => {
                               setEditingAssignmentId(null);
                               setAssignmentForm({ 
                                 subjectId: '', teacherId: '', classId: selectedClassId || '', groupName: '',
                                 subjectType: 'redovni', isForeignLanguage: false, subjectPeriod: 'FULL_YEAR',
                                 plannedHoursSemester1: '', plannedHoursTotal: '', addToAllStudents: true 
                               });
                             }}
                             className="text-[#005c8d] font-black uppercase text-[10px] flex items-center gap-1 hover:underline"
                           >
                              <Plus size={14}/> Dodaj predmet
                           </button>
                         )}
                      </div>

                      {/* ADD / EDIT SUBJECT FORM */}
                      {(isAnyAdmin || selectedClassData?.homeroom_teacher_id === user?.id) && (assignmentForm.classId === selectedClassId || editingAssignmentId) && (
                        <div className="p-4 bg-gray-50 border-b border-gray-300">
                          <div className="text-[10px] font-black text-gray-500 uppercase mb-3">
                            {editingAssignmentId ? 'Uređivanje postojećeg predmeta' : 'Dodjela novog predmeta razredu'}
                          </div>
                          <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="space-y-1 md:col-span-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Nastavni predmet</label>
                              <select 
                                value={assignmentForm.subjectId}
                                onChange={e => setAssignmentForm({...assignmentForm, subjectId: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                                required
                              >
                                <option value="">-- Odaberi --</option>
                                {allSubjects.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Vrsta predmeta</label>
                              <select 
                                value={assignmentForm.subjectType}
                                onChange={e => setAssignmentForm({...assignmentForm, subjectType: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                                required
                              >
                                <option value="redovni">Redovni</option>
                                <option value="izborni">Izborni</option>
                                <option value="fakultativni">Fakultativni</option>
                                <option value="praksa">Praksa</option>
                                <option value="dopunska nastava">Dopunska nastava</option>
                                <option value="dodatna nastava">Dodatna nastava</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Razdoblje</label>
                              <select 
                                value={assignmentForm.subjectPeriod}
                                onChange={e => setAssignmentForm({...assignmentForm, subjectPeriod: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                                required
                              >
                                <option value="FULL_YEAR">Cijela godina</option>
                                <option value="FIRST_SEMESTER">1. polugodište</option>
                                <option value="SECOND_SEMESTER">2. polugodište</option>
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
                    {teachers.sort((a, b) => {
                      const surnameA = getSurname(String(a.name || ''));
                      const surnameB = getSurname(String(b.name || ''));
                      return surnameA.localeCompare(surnameB, 'hr', { sensitivity: 'base' });
                    }).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Grupa (opcionalno)</label>
                              <input 
                                type="text"
                                value={assignmentForm.groupName}
                                onChange={e => setAssignmentForm({...assignmentForm, groupName: e.target.value})}
                                placeholder="npr. Grupa A"
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Pl. sati 1. pol.</label>
                              <input 
                                type="number"
                                value={assignmentForm.plannedHoursSemester1}
                                onChange={e => setAssignmentForm({...assignmentForm, plannedHoursSemester1: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Pl. sati ukupno</label>
                              <input 
                                type="number"
                                value={assignmentForm.plannedHoursTotal}
                                onChange={e => setAssignmentForm({...assignmentForm, plannedHoursTotal: e.target.value})}
                                disabled={!!editingAssignmentId}
                                className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-2 md:col-span-1 justify-center">
                              <label className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer">
                                <input 
                                  type="checkbox"
                                  checked={assignmentForm.isForeignLanguage}
                                  onChange={e => setAssignmentForm({...assignmentForm, isForeignLanguage: e.target.checked})}
                                  disabled={!!editingAssignmentId}
                                  className="w-4 h-4 cursor-pointer focus:outline-[#005c8d]"
                                />
                                Strani jezik
                              </label>
                              
                              {!editingAssignmentId && (
                                <label className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    checked={assignmentForm.addToAllStudents}
                                    onChange={e => setAssignmentForm({...assignmentForm, addToAllStudents: e.target.checked})}
                                    className="w-4 h-4 cursor-pointer focus:outline-[#005c8d]"
                                  />
                                  Dodaj svim učenicima
                                </label>
                              )}
                            </div>

                            <div className="flex gap-2 md:col-span-4 mt-2">
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
                                  setAssignmentForm({ 
                                    subjectId: '', classId: '', teacherId: '', groupName: '',
                                    subjectType: 'redovni', isForeignLanguage: false, subjectPeriod: 'FULL_YEAR',
                                    plannedHoursSemester1: '', plannedHoursTotal: '', addToAllStudents: true 
                                  });
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
                               <th className="px-4 py-2 border-r border-gray-200">Zaduženi nastavnici</th>
                               <th className="px-4 py-2 border-r border-gray-200 text-center w-24">Učenika</th>
                               <th className="px-4 py-2 text-center w-64">Akcije (Učenici)</th>
                               <th className="px-4 py-2 text-center w-24 border-x border-gray-300">Dodaj</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-200">
                            {(() => {
                              const assignmentsInClass = subjectAssignments.filter(a => a.classId === selectedClassId);
                              const classSubjectIds = classSubjects.filter(cs => cs.classId === selectedClassId).map(cs => cs.subjectId);
                              const assignmentSubjectIds = assignmentsInClass.map(a => a.subjectId);
                              const uniqueSubjectIds = Array.from(new Set([...classSubjectIds, ...assignmentSubjectIds])).filter(Boolean) as string[];
                              
                              return uniqueSubjectIds.map(sid => {
                                const assignmentsForThisSubject = assignmentsInClass.filter(a => a.subjectId === sid);
                                const subject = allSubjects.find(s => s.id === sid);
                                const classSubject = classSubjects.find(cs => cs.subjectId === sid && cs.classId === selectedClassId);
                                const activeEnrollCount = classEnrollments.filter(e => e.subjectId === sid && e.status === 'ACTIVE').length;
                                const isManager = isAnyAdmin || selectedClassData?.homeroom_teacher_id === user?.id;

                                return (
                                  <tr key={sid} className="hover:bg-blue-50/30">
                                    <td className="px-4 py-3 border-r border-gray-200">
                                       <div className="font-black text-[#005c8d] uppercase">
                                          {formatSubjectDisplayName(subject?.name || '', classSubject?.subjectType || 'redovni')}
                                       </div>
                                       {classSubject && (
                                         <div className="text-[9px] font-bold text-gray-500 uppercase mt-1 space-y-0.5">
                                           {classSubject.isForeignLanguage && <div className="text-purple-600">Strani jezik</div>}
                                           <div>
                                             {classSubject.subjectPeriod === 'FIRST_SEMESTER' 
                                               ? '1. polugodište' 
                                               : classSubject.subjectPeriod === 'SECOND_SEMESTER' 
                                                 ? '2. polugodište' 
                                                 : 'Cijela godina'}
                                           </div>
                                           {(classSubject.plannedHoursSemester1 || classSubject.plannedHoursTotal) && (
                                             <div className="text-gray-400">
                                               Sati: {classSubject.plannedHoursSemester1 ? `${classSubject.plannedHoursSemester1} (1. pol)` : ''} {classSubject.plannedHoursTotal ? `${classSubject.plannedHoursTotal} (uk)` : ''}
                                             </div>
                                           )}
                                         </div>
                                       )}
                                    </td>
                                    <td className="px-4 py-3 border-r border-gray-200 space-y-2">
                                       {assignmentsForThisSubject.map(a => {
                                         const t = teachers.find(teach => teach.id === a.teacherId);
                                         return (
                                           <div key={a.id} className="flex items-center justify-between group/teach">
                                              <span className="font-bold uppercase text-gray-600">
                                                {t ? formatPersonName(t) : <span className="text-red-400 font-black italic">NIJE DODIJELJEN</span>}
                                                {a.groupName && <span className="ml-2 text-[9px] text-[#005c8d] bg-blue-50 px-1 border border-blue-100">({a.groupName})</span>}
                                              </span>
                                              {isManager && (
                                                <div className="flex gap-2 opacity-0 group-hover/teach:opacity-100 transition-opacity">
                                                  <button 
                                                    onClick={() => {
                                                      setEditingAssignmentId(a.id);
                                                      setAssignmentForm({ 
                                                        subjectId: a.subjectId, 
                                                        classId: a.classId, 
                                                        teacherId: a.teacherId,
                                                        groupName: a.groupName || ''
                                                      });
                                                    }}
                                                    className="text-[#005c8d] hover:scale-110"
                                                  >
                                                    <Settings size={12}/>
                                                  </button>
                                                  <button 
                                                    onClick={() => setDeleteDialog({
                                                      isOpen: true,
                                                      type: 'STAFF',
                                                      id: a.id,
                                                      loading: false,
                                                      message: `Jeste li sigurni da želite maknuti nastavnika s predmeta?`
                                                    })}
                                                    className="text-red-400 hover:text-red-600"
                                                  >
                                                    <Trash2 size={12}/>
                                                  </button>
                                                </div>
                                              )}
                                           </div>
                                         );
                                       })}
                                       {isManager && (
                                         <button 
                                           onClick={() => {
                                             setEditingAssignmentId(null);
                                             setAssignmentForm({ subjectId: sid, teacherId: '', classId: selectedClassId || '', groupName: '' });
                                           }}
                                           className="text-[9px] font-black text-gray-400 uppercase hover:text-[#005c8d] flex items-center gap-1"
                                         >
                                           <Plus size={10}/> Dodaj nastavnika
                                         </button>
                                       )}
                                    </td>
                                    <td className="px-4 py-3 border-r border-gray-200 text-center font-black">
                                        {activeEnrollCount}
                                    </td>
                                    <td className="px-4 py-3 border-r border-gray-200 text-center">
                                       <div className="flex items-center justify-center gap-2">
                                          <button 
                                            onClick={() => handleBulkEnroll(sid, 'ACTIVE')}
                                            disabled={!isManager}
                                            className="bg-white border border-gray-300 text-gray-400 hover:text-green-600 px-2 py-1 text-[9px] font-black uppercase tracking-tighter disabled:opacity-30"
                                          >
                                             Dodijeli svima
                                          </button>
                                          <button 
                                            onClick={() => handleBulkEnroll(sid, 'EXEMPT')}
                                            disabled={!isManager}
                                            className="bg-white border border-gray-300 text-gray-400 hover:text-red-600 px-2 py-1 text-[9px] font-black uppercase tracking-tighter disabled:opacity-30"
                                          >
                                             Izuzmi učenike
                                          </button>
                                          <button 
                                            onClick={() => setShowEnrollmentModal({ isOpen: true, subjectId: sid })}
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
                                               setEditingAssignmentId(null);
                                               setAssignmentForm({ subjectId: sid, classId: selectedClassId || '', teacherId: '' });
                                             }}
                                             className="text-gray-400 hover:text-[#005c8d]"
                                           >
                                             <Plus size={14}/>
                                           </button>
                                         )}
                                       </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                            {subjectAssignments.filter(a => a.classId === selectedClassId).length === 0 && (
                               <tr>
                                 <td colSpan={5} className="p-8 text-center text-gray-400 italic">Nema definiranih predmeta za ovaj razred. Koristite gumb iznad za dodavanje prvi put.</td>
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
                           {students.filter(s => s.classId === selectedClassId).sort((a, b) => {
                             const surnameA = getSurname(String(a.name || ''));
                             const surnameB = getSurname(String(b.name || ''));
                             return surnameA.localeCompare(surnameB, 'hr', { sensitivity: 'base' });
                           }).map(s => {
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
                                   <span className="text-[10px] truncate">{s.name}</span>
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
    {(isMainAdmin || isSchoolAdmin || selectedClassData?.homeroom_teacher_id === user?.id) && (
                  <button 
                    onClick={handleFinalizeYearSummaries}
                    disabled={loading}
                    className="bg-[#005c8d] text-white px-4 py-2 text-[10px] font-black uppercase hover:bg-[#004a70] transition-colors shadow-sm disabled:opacity-50"
                  >
                    Izračunaj i zaključi opći uspjeh i vladanje
                  </button>
                )}
              </div>

                <div className="flex justify-between items-center bg-blue-50/50 p-3 border border-blue-100 mb-4">
                  <div className="flex gap-4 items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-blue-800 uppercase tracking-tighter">Zaključivanje godine</span>
                      <span className="text-[9px] text-blue-600 font-medium italic">Izračun prosjeka i automatsko određivanje vladanja</span>
                    </div>
                    <button 
                      onClick={() => handleFinalizeYearSummaries(effectiveClassId)}
                      disabled={loading}
                      className="bg-[#005c8d] text-white px-6 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70] shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle size={14} /> Izračunaj i zaključi opći uspjeh i vladanje
                    </button>
                  </div>
                  <div className="flex gap-2">
                     <span className="text-[9px] font-black text-gray-400 uppercase">Status razreda:</span>
                     {students.filter(s => s.classId === effectiveClassId).length === 
                      summaries.filter(s => (s.classId === selectedClassId || s.classId === effectiveClassId) && s.finalizedAt).length ? (
                        <span className="text-[9px] font-black text-green-600 uppercase">Svi zaključeni</span>
                      ) : (
                        <span className="text-[9px] font-black text-yellow-600 uppercase">U tijeku</span>
                      )}
                  </div>
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
                      {students.filter(s => s.classId === effectiveClassId).length === 0 && (
                        <tr>
                           <td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold uppercase text-[10px]">
                              Nema dodijeljenih učenika ovom razredu.
                           </td>
                        </tr>
                      )}
                      {students.filter(s => s.classId === effectiveClassId).sort((a,b) => (a.name || '').localeCompare(b.name || '')).map((student, idx) => {
                         const studentClassEnrollments = classEnrollments.filter(e => e.studentId === student.id && e.status === 'ACTIVE');
                         
                         const studentFinalGrades = finalGrades.filter(fg => fg.studentId === student.id);
                         
                         const missingSubjects = studentClassEnrollments
                            .filter(e => !studentFinalGrades.some(fg => fg.subjectId === e.subjectId))
                            .map(e => allSubjects.find(s => s.id === e.subjectId)?.name)
                            .filter(Boolean);

                         const missingGrades = missingSubjects.length > 0;

                         const summary = summaries.find(s => s.studentId === student.id && (s.classId === selectedClassId || s.classId === effectiveClassId));
                         const isFinalized = !!summary?.finalizedAt;

                         const studentNotes = overallNotes.find(n => n.studentId === student.id);
                         let autoBehavior = 'Uzorno';
                         if (studentNotes?.disciplinaryActions) {
                           const da = studentNotes.disciplinaryActions.toLowerCase();
                           if (da.includes('ukor')) autoBehavior = 'Loše';
                           else if (da.includes('opomena')) autoBehavior = 'Dobro';
                         }

                         return (
                           <tr key={student.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 border-r border-gray-200">
                                 <div className="flex items-center gap-2">
                                    <span className="text-gray-400 font-bold">{idx + 1}.</span>
                                    <span className="font-black text-[#005c8d] uppercase">{student.name}</span>
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
                                 {summary?.behavior || autoBehavior}
                              </td>
                              <td className="px-4 py-3 text-center">
                                 {isFinalized ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-black uppercase tracking-tighter text-[9px] border border-green-200">Zaključeno</span>
                                 ) : missingGrades ? (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-black uppercase tracking-tighter text-[9px] border border-red-200">Nedostaju ocjene</span>
                                 ) : (
                                    <span className="px-2 py-0.5 bg-blue-100 text-[#005c8d] rounded-full font-black uppercase tracking-tighter text-[9px] border border-blue-200">Spremno</span>
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

          {activeTab === 'STUDENT_DETAIL' && (
            <div className="max-w-6xl space-y-6 animate-in fade-in duration-500">
               <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                        setActiveTab('CLASS_DETAIL');
                        setEditingStudentId(null);
                    }} 
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ChevronLeft size={20}/>
                  </button>
                  <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">
                    Profil učenika: {selectedStudentData?.name}
                  </h3>
                </div>
                {isAnyAdmin && (
                   <button 
                     onClick={() => setDeleteDialog({ isOpen: true, id: selectedStudentData.id, item: selectedStudentData, type: 'STUDENT', loading: false })}
                     className="text-red-500 font-bold uppercase text-[10px] flex items-center gap-1 hover:underline"
                   >
                      <Trash2 size={14}/> Obriši učenika
                   </button>
                )}
              </div>

              <form onSubmit={handleCreateStudent} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  {/* Basic Information */}
                  <div className="bg-white border border-gray-300 p-6 shadow-sm space-y-6">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1 flex items-center gap-2">
                       <UserIcon size={14}/> Osnovni podaci
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ime i prezime</label>
                        <input 
                          required
                          value={studentForm.name}
                          onChange={e => setStudentForm({...studentForm, name: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none bg-gray-50/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Email (prijava)</label>
                        <input 
                          value={studentForm.email}
                          onChange={e => setStudentForm({...studentForm, email: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none bg-gray-50/30 text-gray-500"
                          disabled
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">OIB</label>
                        <input 
                          value={studentForm.oib}
                          onChange={e => setStudentForm({...studentForm, oib: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Datum rođenja</label>
                        <input 
                          type="date"
                          value={studentForm.dob}
                          onChange={e => setStudentForm({...studentForm, dob: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mjesto rođenja</label>
                        <input 
                          value={studentForm.pob}
                          onChange={e => setStudentForm({...studentForm, pob: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mobitel</label>
                        <input 
                          value={studentForm.mobile}
                          onChange={e => setStudentForm({...studentForm, mobile: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Adresa prebivališta</label>
                      <input 
                        value={studentForm.address}
                        onChange={e => setStudentForm({...studentForm, address: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                      />
                    </div>
                  </div>

                  {/* Program & Class */}
                  <div className="bg-white border border-gray-300 p-6 shadow-sm space-y-6">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1 flex items-center gap-2">
                       <GraduationCap size={14}/> Školovanje
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Razredni odjel</label>
                        <select 
                          value={studentForm.classId}
                          onChange={e => setStudentForm({...studentForm, classId: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none text-[#005c8d]"
                        >
                          <option value="">-- Odaberi --</option>
                          {activeStudentClasses.filter(c => c.school_id === selectedSchoolId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Program obrazovanja</label>
                        <select 
                          value={studentForm.programId}
                          onChange={e => setStudentForm({...studentForm, programId: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        >
                          <option value="">-- Odaberi --</option>
                          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Parent Information */}
                  <div className="bg-white border border-gray-300 p-6 shadow-sm space-y-4">
                    <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1 flex items-center gap-2">
                       <Info size={14}/> Kontakt roditelja / skrbnika
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Ime i prezime roditelja</label>
                        <input 
                          value={studentForm.parentName}
                          onChange={e => setStudentForm({...studentForm, parentName: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                          placeholder="npr. Ivan Horvat"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Kontakt telefon</label>
                        <input 
                          value={studentForm.parentPhone}
                          onChange={e => setStudentForm({...studentForm, parentPhone: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                          placeholder="+385 91..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Email adresa</label>
                        <input 
                          type="email"
                          value={studentForm.parentEmail}
                          onChange={e => setStudentForm({...studentForm, parentEmail: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                          placeholder="roditelj@email.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Napomene o kontaktu</label>
                        <textarea 
                          value={studentForm.parentNotes}
                          onChange={e => setStudentForm({...studentForm, parentNotes: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none min-h-[80px]"
                          placeholder="Dodatne informacije o kontaktu..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sticky top-4">
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#005c8d] text-white py-3 border border-[#004a71] font-black uppercase tracking-widest text-[11px] hover:bg-[#004a71] transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                         <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>Spremi promjene profila</>
                      )}
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                          setActiveTab('CLASS_DETAIL');
                          setEditingStudentId(null);
                      }}
                      className="w-full bg-white text-gray-500 font-black uppercase tracking-[0.2em] text-[9px] border border-gray-300 py-3 hover:bg-gray-50 transition-colors"
                    >
                      Odustani
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'STUDENTS' && (
            <div className="max-w-5xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Registracija učenika i pregled</h3>
              </div>
              
              <div className="bg-white border border-gray-300 p-4 text-[11px]">
                <div className="text-[10px] font-black text-[#005c8d] uppercase mb-4 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span>{editingStudentId ? 'Uredi učenika' : (isBulkAddingStudents ? 'Grupno dodavanje učenika' : 'Registriraj novog učenika')}</span>
                    {!editingStudentId && (
                      <button 
                        type="button"
                        onClick={() => {
                            console.log('CURRENT CLASS USED FOR STUDENTS:', selectedClassData);
                            setIsBulkAddingStudents(!isBulkAddingStudents);
                            if (!isBulkAddingStudents) {
                                setBulkStudentClassId(studentForm.classId || (selectedClassId || ''));
                            }
                        }}
                        className="bg-[#005c8d] text-white px-2 py-1.5 rounded-sm shadow-sm hover:bg-[#004a70]"
                      >
                        {isBulkAddingStudents ? 'Pojedinačno dodavanje' : 'Grupno dodavanje'}
                      </button>
                    )}
                  </div>
                  {editingStudentId && (
                    <button 
                      onClick={() => {
                        setEditingStudentId(null);
                        setStudentForm({
                          name: '', surname: '', email: '', classId: '', schoolId: selectedSchoolId || '', programId: '',
                          oib: '', dob: '', address: '', status: 'ACTIVE', isContinuation: false, continuationType: null
                        });
                      }}
                      className="text-red-600 hover:underline normal-case font-bold"
                    >
                      Odustani od uređivanja
                    </button>
                  )}
                </div>
                {isBulkAddingStudents ? (
                  <form onSubmit={handleBulkCreateStudents} className="space-y-4">
                      {isClassAdminMode ? (
                        <div className="bg-blue-50 p-3 border border-blue-200 text-blue-800 text-xs font-bold rounded">
                           <div>Razred: {selectedClassData?.name || 'Nepoznat razred'}</div>
                           <div>Program: {selectedClassData?.program?.name || (selectedClassData?.programId ? `Program ID: ${selectedClassData.programId}` : <span className="text-red-600">Razred nema dodijeljen program. Prvo dodijelite program u postavkama razreda.</span>)}</div>
                        </div>
                      ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-gray-400 uppercase">Razred <span className="text-red-500">*</span></label>
                           <select 
                             required
                             value={bulkStudentClassId}
                             onChange={e => setBulkStudentClassId(e.target.value)}
                             className="w-full border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                           >
                             <option value="">Odaberi razred...</option>
                             {activeStudentClasses.filter(c => c.school_id === selectedSchoolId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-gray-400 uppercase">Program obrazovanja <span className="text-red-500">*</span></label>
                           <select 
                             required
                             value={bulkStudentProgramId}
                             onChange={e => setBulkStudentProgramId(e.target.value)}
                             className="w-full border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                           >
                             <option value="">Odaberi program...</option>
                             {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                           </select>
                        </div>
                      </div>
                      )}
                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Lista učenika (1 u redak) <span className="text-red-500">*</span></label>
                          <textarea 
                             required
                             value={bulkStudentText}
                             onChange={e => setBulkStudentText(e.target.value)}
                             rows={10}
                             className="w-full border border-gray-300 p-3 outline-none focus:border-[#005c8d] font-medium font-mono text-sm"
                             placeholder={`Marko Marković\nAna Anić, ana.anic@email.com\nIvan Ivić`}
                          ></textarea>
                          <p className="text-gray-400 text-xs italic mt-1">Lozinke se automatski postavljaju na "yupu8Ev4". Unesite učenike u formatu: Ime Prezime, opcionalni@email.com</p>
                      </div>
                      <div className="flex justify-end">
                          <button 
                             type="submit"
                             disabled={loading}
                             className="bg-green-600 text-white px-6 py-2 border border-green-700 font-black text-[10px] uppercase hover:bg-green-700 disabled:opacity-50"
                          >
                            Dodaj učenike
                          </button>
                      </div>
                  </form>
                ) : (
                <form onSubmit={handleCreateStudent} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <input 
                    type="text" required 
                    value={studentForm.name}
                    onChange={e => setStudentForm({...studentForm, name: e.target.value})}
                    placeholder="Ime i prezime"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="email"
                    value={studentForm.email}
                    onChange={e => setStudentForm({...studentForm, email: e.target.value})}
                    placeholder="E-mail (opcionalno)"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="text"
                    value={studentForm.oib}
                    onChange={e => setStudentForm({...studentForm, oib: e.target.value})}
                    placeholder="OIB"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="date"
                    value={studentForm.dob}
                    onChange={e => setStudentForm({...studentForm, dob: e.target.value})}
                    placeholder="Datum rođenja"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="text"
                    value={studentForm.pob}
                    onChange={e => setStudentForm({...studentForm, pob: e.target.value})}
                    placeholder="Mjesto rođenja (pob)"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="text"
                    value={studentForm.address}
                    onChange={e => setStudentForm({...studentForm, address: e.target.value})}
                    placeholder="Adresa"
                    className="border border-gray-300 p-2 outline-none focus:border-[#005c8d]" 
                  />
                  <input 
                    type="text"
                    value={studentForm.mobile}
                    onChange={e => setStudentForm({...studentForm, mobile: e.target.value})}
                    placeholder="Mobitel"
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
                  {!isClassAdminMode && (
                    <>
                      <select 
                        value={studentForm.programId}
                        onChange={e => setStudentForm({...studentForm, programId: e.target.value})}
                        className="border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                      >
                        <option value="">Program...</option>
                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <select 
                        value={studentForm.classId}
                        onChange={e => setStudentForm({...studentForm, classId: e.target.value})}
                        className="border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                      >
                        <option value="">Razred...</option>
                        {activeStudentClasses.filter(c => c.school_id === (selectedSchoolId || studentForm.schoolId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </>
                  )}
                  {editingStudentId && (
                    <select 
                      value={studentForm.status}
                      onChange={e => setStudentForm({...studentForm, status: e.target.value as any})}
                      className="border border-gray-300 p-2 outline-none focus:border-[#005c8d] font-bold"
                    >
                      <option value="ACTIVE">Aktivan</option>
                      <option value="INACTIVE">Neaktivan</option>
                    </select>
                  )}
                  {!editingStudentId && (
                    <div className="flex items-center gap-2 md:col-start-1 lg:col-start-1 h-full py-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-500 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={studentForm.enrollSubjects}
                          onChange={e => setStudentForm({...studentForm, enrollSubjects: e.target.checked})}
                          className="w-4 h-4 cursor-pointer focus:outline-[#005c8d] accent-[#005c8d]"
                        />
                        Dodaj predmete svim učenicima
                      </label>
                    </div>
                  )}
                  <button 
                    disabled={loading}
                    className="md:col-start-4 lg:col-start-6 bg-[#005c8d] text-white px-4 py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70]"
                  >
                    {editingStudentId ? 'Spremi promjene' : 'Registriraj'}
                  </button>
                </form>
                )}
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
                      .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
                      .map(s => {
                        const razred = classes.find(c => c.id === s.classId);
                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 border-r border-gray-200">
                             <div className="font-bold text-[#005c8d] uppercase">{s.name}</div>
                          </td>
                          <td className="px-4 py-2 border-r border-gray-200 text-center font-black text-gray-700">
                             {razred?.name || '—'}
                          </td>
                          <td className="px-4 py-2 border-r border-gray-200 text-gray-400">
                             {s.email}
                          </td>
                          <td className="px-4 py-2 border-x border-gray-300 text-center">
                            <div className="flex justify-center gap-2">
                              <button 
                                onClick={() => openStudentDetail(s)}
                                className="text-[10px] font-black text-[#005c8d] uppercase hover:underline"
                              >
                                Pregled
                              </button>
                              <button 
                                onClick={() => handleEditStudent(s)}
                                className="text-[10px] font-black text-amber-600 uppercase hover:underline"
                              >
                                Uredi
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button 
                              onClick={() => setDeleteDialog({ isOpen: true, id: s.id, item: s, type: 'STUDENT', loading: false })}
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
                {isAnyAdmin && (
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
                  <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Razredni odjel</label>
                      <select 
                        value={assignmentForm.classId}
                        onChange={e => setAssignmentForm({...assignmentForm, classId: e.target.value})}
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                        required
                      >
                        <option value="">-- Odaberi --</option>
                        {classes.filter(c => !selectedYearId || c.school_year_id === selectedYearId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Grupa</label>
                      <input 
                        type="text"
                        value={assignmentForm.groupName}
                        onChange={e => setAssignmentForm({...assignmentForm, groupName: e.target.value})}
                        placeholder="Opcionalno"
                        className="w-full border border-gray-300 p-2 text-xs font-bold focus:border-[#005c8d] outline-none"
                      />
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
                      return (String(razredA || "")).localeCompare(razredB);
                    }).map(a => {
                      const razred = classes.find(c => c.id === a.classId);
                      const sub = allSubjects.find(s => s.id === a.subjectId);
                      const tea = teachers.find(t => t.id === a.teacherId);
                      return (
                        <tr key={a.id} className="hover:bg-blue-50/50">
                          <td className="px-4 py-3 border-r border-gray-200 font-black text-[#005c8d]">{razred?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200 font-bold uppercase tracking-tighter">{sub?.name}</td>
                          <td className="px-4 py-3 border-r border-gray-200 font-bold text-gray-600 uppercase">
                            {formatPersonName(tea)}
                            {a.groupName && <span className="ml-2 text-[9px] text-[#005c8d] font-black">[{a.groupName}]</span>}
                          </td>
                          {user?.role === Role.ADMIN && (
                            <td className="px-4 py-3 text-center flex items-center justify-center gap-4">
                               <button 
                                 onClick={() => {
                                   setEditingAssignmentId(a.id);
                                   setAssignmentForm({ 
                                     subjectId: a.subjectId, 
                                     classId: a.classId, 
                                     teacherId: a.teacherId,
                                     groupName: a.groupName || ''
                                   });
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
                        {classes.filter(c => !selectedYearId || c.school_year_id === selectedYearId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                      return (String(razredA || "")).localeCompare(razredB);
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

          {activeTab === 'GRADUATES_ADMIN' && (
             <div className="space-y-6">
                <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upis završenih učenika</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Ručni upis učenika iz arhiviranih godina (npr. iz 3.A u 4.A)</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('MENU')} 
                    className="text-[10px] font-black text-gray-400 uppercase hover:text-[#005c8d] flex items-center gap-1"
                  >
                    <ChevronLeft size={14} /> Povratak na menu
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* SOURCE */}
                  <div className="space-y-4 bg-gray-50 p-6 border border-gray-200">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b border-gray-200 pb-2">1. Odabir izvornog razreda (Arhiva)</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Školska godina</label>
                        <select 
                          className="w-full border-2 border-gray-200 p-3 text-sm font-black text-gray-700 outline-none focus:border-[#005c8d]"
                          value={graduatesAdmin.sourceYearId}
                          onChange={e => {
                            setGraduatesAdmin(prev => ({ ...prev, sourceYearId: e.target.value, sourceClassId: '', selectedStudentIds: [] }));
                            setGraduatesAdminStudents([]);
                          }}
                        >
                          <option value="">-- Odaberite godinu --</option>
                          {schoolYears.map(y => (
                            <option key={y.id} value={y.id}>{y.name} {y.isActive ? '(AKTIVNA)' : '(ARHIVA)'}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Izvorni razredni odjel</label>
                        <select 
                          className="w-full border-2 border-gray-200 p-3 text-sm font-black text-gray-700 outline-none focus:border-[#005c8d]"
                          value={graduatesAdmin.sourceClassId}
                          onChange={e => {
                            setGraduatesAdmin(prev => ({ ...prev, sourceClassId: e.target.value, selectedStudentIds: [] }));
                            fetchGraduatesStudents(e.target.value);
                          }}
                        >
                          <option value="">-- Odaberite razred --</option>
                          {classes.filter(c => c.school_year_id === graduatesAdmin.sourceYearId).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {graduatesAdmin.sourceClassId && (
                        <div className="mt-4">
                           <label className="text-[10px] font-black text-gray-400 uppercase block mb-2">Učenici ({graduatesAdminStudents.length})</label>
                           <div className="max-h-64 overflow-y-auto border border-gray-200 bg-white divide-y divide-gray-100">
                             {graduatesAdminStudents.map(s => (
                               <label key={s.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors group">
                                 <input 
                                   type="checkbox"
                                   checked={graduatesAdmin.selectedStudentIds?.includes(s.id)}
                                   onChange={e => {
                                      const ids = e.target.checked 
                                        ? [...(graduatesAdmin.selectedStudentIds || []), s.id]
                                        : (graduatesAdmin.selectedStudentIds || []).filter(id => id !== s.id);
                                      setGraduatesAdmin(prev => ({ ...prev, selectedStudentIds: ids }));
                                   }}
                                   className="w-4 h-4 rounded border-gray-300 text-[#005c8d] focus:ring-[#005c8d]"
                                 />
                                  <div className="flex-1">
                                    <div className="text-xs font-black text-gray-700 group-hover:text-[#005c8d]">{s.name}</div>
                                    <div className="text-[9px] text-gray-400 font-bold uppercase">{s.email}</div>
                                  </div>
                               </label>
                             ))}
                             {graduatesAdminStudents.length === 0 && (
                               <div className="p-8 text-center text-gray-400 italic text-[10px] uppercase">Nema učenika u ovom razredu</div>
                             )}
                           </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TARGET */}
                  <div className="space-y-4 bg-blue-50 p-6 border border-blue-100">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2">2. Odabir ciljnog razreda</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-blue-400 uppercase block mb-1">Ciljni razredni odjel (Nova godina)</label>
                        <select 
                          className="w-full border-2 border-blue-200 p-3 text-sm font-black text-gray-700 outline-none focus:border-[#005c8d] bg-white"
                          value={graduatesAdmin.targetClassId}
                          onChange={e => setGraduatesAdmin(prev => ({ ...prev, targetClassId: e.target.value }))}
                        >
                          <option value="">-- Odaberite cilj --</option>
                          {classes.filter(c => schoolYears.find(y => y.id === c.school_year_id)?.isActive).map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.schoolYear})</option>
                          ))}
                        </select>
                      </div>

                      <div className="pt-8">
                         <button 
                           onClick={handleEnrollGraduates}
                           disabled={loading || !graduatesAdmin.targetClassId || graduatesAdmin.selectedStudentIds.length === 0}
                           className="w-full bg-[#005c8d] text-white py-4 font-black text-xs uppercase hover:bg-[#004a72] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all flex items-center justify-center gap-3"
                         >
                           {loading ? <Clock className="animate-spin" size={18} /> : <GraduationCap size={18} />}
                           Upiši odabrane učenike ({graduatesAdmin.selectedStudentIds.length})
                         </button>
                         <p className="mt-4 text-[9px] text-blue-400 font-bold uppercase text-center leading-relaxed">
                           Ova akcija će kreirati upisnice za odabrane učenike u novom razredu. 
                           Učenici će zadržati povijest iz prethodnih godina.
                         </p>
                      </div>
                    </div>
                  </div>
                </div>
             </div>
          )}

          {activeTab === 'DOCUMENTS' && (
             <CertificateManagementPage currentClass={selectedClassData} currentSchoolId={selectedSchoolId || ''} />
          )}

          {activeTab === 'SCHOOL_YEARS' && (
            <React.Fragment>
              <div className="max-w-6xl space-y-6">
              <div className="border-b-2 border-[#005c8d] pb-2 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Upravljanje školskim godinama</h3>
                <div className="flex gap-2">
                  {isMainAdmin && (
                    <button 
                      onClick={handleFixSchoolYears}
                      className="text-[9px] font-black text-red-500 uppercase border border-red-200 px-3 py-1 bg-red-50 hover:bg-red-100"
                    >
                      Popravi strukturu
                    </button>
                  )}
                  <button 
                    onClick={() => setNewYearForm({ name: '', startsAt: '', endsAt: '' })} // In a real app maybe toggle visibility
                    className="bg-[#005c8d] text-white px-4 py-1.5 font-black text-[10px] uppercase hover:bg-[#004a70] flex items-center gap-2"
                  >
                    <Plus size={14}/> Otvori novu školsku godinu
                  </button>
                </div>
              </div>

              {/* NEW YEAR FORM (Collapsed by default in thought, but let's show it if name is being typed or just always available at top) */}
              <div className="bg-white border border-gray-300 p-4 shadow-sm">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Dodavanje nove školske godine</div>
                <form onSubmit={handleCreateSchoolYear} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Naziv (npr. 2025./2026.)</label>
                    <input 
                      type="text" required placeholder="2025./2026."
                      value={newYearForm.name}
                      onChange={e => setNewYearForm({...newYearForm, name: e.target.value})}
                      className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none font-bold"
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
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Kraj</label>
                    <input 
                      type="date"
                      value={newYearForm.endsAt}
                      onChange={e => setNewYearForm({...newYearForm, endsAt: e.target.value})}
                      className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none"
                    />
                  </div>
                  <button 
                    disabled={loading}
                    className="bg-[#005c8d] text-white py-2 border border-[#004a70] font-black text-[10px] uppercase hover:bg-[#004a70]"
                  >
                    Kreiraj godinu
                  </button>
                </form>
              </div>

              {/* Hierarchy Display */}
              <div className="space-y-4">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-1 mb-2">Popis školskih godina i razreda</div>
                {schoolYears.sort((a,b) => String(b.name || '').localeCompare(String(a.name || ''))).map(y => (
                  <div key={y.id} className={cn("border bg-white shadow-sm overflow-hidden", y.isActive ? "border-[#005c8d]" : "border-gray-200")}>
                    <div className={cn("p-4 flex items-center justify-between", y.isActive ? "bg-blue-50/50" : "bg-gray-50/50")}>
                      <div className="flex items-center gap-3">
                        <div className="text-xl font-black text-[#005c8d] tracking-tighter">{y.name}</div>
                        {y.isActive && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-black uppercase text-[8px] border border-green-200">ACTIVE</span>
                        )}
                        {!y.isActive && (
                           <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-black uppercase text-[8px] border border-gray-200 text-gray-400">ARCHIVE</span>
                        )}
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{y.startsAt || '—'} - {y.endsAt || '—'}</span>
                      </div>
                        <div className="flex gap-2">
                          <button 
                             onClick={() => {
                               setClassCreationYearId(y.id);
                               setNewClassGrade(1);
                               setNewClassSection('A');
                             }}
                             className="text-[9px] font-black text-green-600 uppercase border border-green-100 px-3 py-1 bg-green-50 hover:bg-green-100 flex items-center gap-1"
                           >
                             <Plus size={10}/> Dodaj razred
                           </button>
                            {!y.isActive && (
                              <button 
                                onClick={() => handleActivateSchoolYear(y.id)}
                                className="text-[9px] font-black text-[#005c8d] uppercase border border-blue-100 px-3 py-1 bg-blue-50 hover:bg-blue-100"
                              >
                                Aktiviraj školsku godinu
                              </button>
                            )}
                            {y.isActive && (
                              <button 
                                onClick={() => handleArchiveSchoolYear(y.id)}
                                className="text-[9px] font-black text-gray-500 uppercase border border-gray-100 px-3 py-1 bg-gray-50 hover:bg-gray-100"
                              >
                                Arhiviraj
                              </button>
                            )}
                            {isAnyAdmin && (
                              <button 
                                onClick={() => setDeleteDialog({ isOpen: true, id: y.id, type: 'SCHOOL_YEAR' as any, loading: false, message: `Jeste li sigurni da želite obrisati školsku godinu ${y.name}? Ovo će obrisati i sve razrede u njoj.` })}
                                className="text-[9px] font-black text-red-500 uppercase border border-red-100 px-3 py-1 bg-red-50 hover:bg-red-100"
                              >
                                Obriši
                              </button>
                            )}
                        </div>
                  </div>
                  
                  {/* Classes List inside Year */}
                  <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                    {(() => {
                      const yearClasses = classes.filter(c => c.school_year_id === y.id);
                      console.log('SCHOOL YEAR CARD:', y.id, y.name);
                      console.log('ALL CLASSES IN ADMIN:', classes);
                      console.log('CLASSES FOR THIS YEAR (DEBUG):', yearClasses);
                      return (
                        <>
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Razredni odjeli ({yearClasses.length})</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                             {yearClasses.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))).map(c => (
                               <div key={c.id} className="group relative">
                                  <button 
                                    onClick={() => openClassDetail(c.id)}
                                    className="w-full p-2 bg-white border border-gray-200 text-[#005c8d] font-black text-[11px] uppercase text-center hover:border-[#005c8d] transition-all hover:shadow-sm"
                                  >
                                    {c.name}
                                  </button>
                                  <button 
                                    onClick={() => setDeleteDialog({ isOpen: true, id: c.id, type: 'CLASS', loading: false })}
                                    className="absolute -top-1 -right-1 bg-white text-gray-300 hover:text-red-500 rounded-full border border-gray-100 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X size={8}/>
                                  </button>
                               </div>
                             ))}
                             {yearClasses.length === 0 && (
                               <div className="col-span-full text-[10px] text-gray-300 italic py-2">Nema definiranih razreda za ovu godinu.</div>
                             )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Inline Class Creation Form */}
                  {classCreationYearId === y.id && (
                    <div className="p-4 border-t border-green-100 bg-green-50/20 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center justify-between mb-3">
                         <div className="text-[10px] font-black text-green-700 uppercase tracking-tight flex items-center gap-2">
                           <Plus size={12}/> Novi razredni odjel u {y.name}
                         </div>
                         <button onClick={() => setClassCreationYearId(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                      </div>
                      <form onSubmit={handleCreateClass} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Razred (1-8)</label>
                          <input 
                            type="number" min="1" max="8"
                            value={newClassVariant.startsWith('CONTINUATION') ? 4 : newClassGrade}
                            onChange={e => setNewClassGrade(parseInt(e.target.value) || 1)}
                            disabled={newClassVariant.startsWith('CONTINUATION')}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d] disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1 text-center">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Oznaka (A, B...)</label>
                          <input 
                            type="text" maxLength={1}
                            value={newClassVariant === 'CONTINUATION_FREE' ? 'K' : newClassSection}
                            onChange={e => setNewClassSection(e.target.value.toUpperCase())}
                            disabled={newClassVariant === 'CONTINUATION_FREE'}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d] text-center disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Naziv (automatski)</label>
                          <div className="w-full border border-gray-100 bg-gray-50/50 p-1.5 text-xs font-black text-gray-400 select-none">
                            {newClassName}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Varijanta</label>
                          <select 
                            value={newClassVariant}
                            onChange={e => {
                              const val = e.target.value as ClassVariant;
                              setNewClassVariant(val);
                              setNewUserForm(prev => ({ ...prev, programId: '' }));
                              if (val === 'CONTINUATION_FREE') {
                                setNewClassGrade(4);
                                setNewClassSection('K');
                              } else if (val === 'CONTINUATION_PAID') {
                                setNewClassGrade(4);
                              }
                              console.log('VARIANT CHANGED:', val);
                              console.log('CLASS FORM:', { grade: newClassGrade, section: newClassSection, name: newClassName });
                            }}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d]"
                          >
                            <option value="REGULAR">Redovni program</option>
                            <option value="CONTINUATION_FREE">Nastavak / Razlika - besplatni</option>
                            <option value="CONTINUATION_PAID">Nastavak / Razlika - plaćeni</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Program</label>
                          <select 
                            value={newUserForm.programId}
                            onChange={e => setNewUserForm({...newUserForm, programId: e.target.value})}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d]"
                          >
                            <option value="">-- Odaberi --</option>
                            {programs.filter(program => {
                               if (newClassVariant === 'REGULAR') return ['VOCATIONAL_3Y', 'COMMERCIALIST_4Y'].includes(program.type);
                               if (newClassVariant === 'CONTINUATION_FREE') return program.type === 'CONTINUATION_FREE';
                               if (newClassVariant === 'CONTINUATION_PAID') return program.type === 'CONTINUATION_PAID';
                               return false;
                             }).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Razrednik <span className="text-red-500">*</span></label>
                          <select 
                            value={newClassHomeroomTeacherId}
                            onChange={e => setNewClassHomeroomTeacherId(e.target.value)}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d]"
                            required
                          >
                            <option value="">-- Odaberi --</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-gray-400 uppercase">Zamjenik</label>
                          <select 
                            value={newClassDeputyTeacherId}
                            onChange={e => setNewClassDeputyTeacherId(e.target.value)}
                            className="w-full border border-gray-200 p-1.5 text-xs font-bold outline-none focus:border-[#005c8d]"
                          >
                            <option value="">-- Nema (Opcionalno) --</option>
                            {teachers.filter(t => t.id !== newClassHomeroomTeacherId).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            type="submit"
                            disabled={loading}
                            onClick={() => {
                              // Ensure year ID is set before submit
                              // We use the local classCreationYearId
                            }}
                            className="flex-1 bg-green-600 text-white font-black text-[9px] uppercase py-2 hover:bg-green-700 shadow-sm"
                          >
                             Spremi
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
              {schoolYears.length === 0 && (
                <div className="p-12 text-center border-2 border-dashed border-gray-100">
                  <SchoolIcon size={48} className="mx-auto text-gray-200 mb-4" />
                  <div className="text-gray-400 font-bold uppercase text-xs tracking-widest">Nema definiranih školskih godina</div>
                  <div className="text-gray-300 text-[10px] mt-1">Otvorite novu školsku godinu koristeći gumb iznad</div>
                </div>
              )}
              </div>
            </div>
          </React.Fragment>
        )}

          {activeTab === 'ROLLOVER' && (
            <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
              <div className="border-b-2 border-[#005c8d] pb-3 flex items-center justify-between bg-white sticky top-0 z-20">
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-[#005c8d] uppercase tracking-tighter">Školski Rollover (Prijenos godine)</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Automatski prijenos cijele školske godine po ThinkWave modelu</p>
                </div>
                <div className="flex gap-2">
                  {rolloverWizard.step > 1 && (
                    <button 
                      onClick={() => setRolloverWizard(prev => ({ ...prev, step: prev.step - 1 as any }))}
                      className="px-4 py-2 border border-gray-300 text-gray-500 font-black text-[10px] uppercase hover:bg-gray-50 flex items-center gap-2"
                    >
                      <ChevronLeft size={16} /> Natrag
                    </button>
                  )}
                  {rolloverWizard.step === 3 && (
                    <button 
                      onClick={handleRunRollover}
                      disabled={loading}
                      className="px-6 py-2 bg-green-600 text-white font-black text-[10px] uppercase hover:bg-green-700 shadow-md flex items-center gap-2"
                    >
                      {loading ? 'U tijeku...' : 'Pokreni prijenos'}
                      {!loading && <ArrowRight size={16} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border-2 border-gray-100 p-8">
                {rolloverWizard.step === 1 && (
                  <div className="space-y-8 max-w-2xl mx-auto py-10">
                    <div className="text-center space-y-2">
                       <GraduationCap size={40} className="mx-auto text-gray-300" />
                       <h4 className="text-lg font-black text-gray-800 uppercase">1. Odabir izvorišne godine</h4>
                       <p className="text-xs text-gray-500 font-medium">Odaberite školsku godinu iz koje želite prenijeti učenike i razrede.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {schoolYears.map(y => (
                        <button 
                          key={y.id}
                          onClick={() => setRolloverWizard({ ...rolloverWizard, sourceYearId: y.id, step: 2 })}
                          className={cn(
                            "group p-6 border-2 text-left transition-all flex items-center justify-between",
                            rolloverWizard.sourceYearId === y.id ? "border-[#005c8d] bg-blue-50" : "border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                          )}
                        >
                          <div>
                            <div className="text-lg font-black text-gray-800 tracking-tighter">{y.name}</div>
                            <div className="text-[10px] font-black uppercase text-gray-400">
                              {y.isActive ? 'Aktivna godina' : 'Arhivirana'}
                            </div>
                          </div>
                          <ChevronDown className="-rotate-90 group-hover:translate-x-1 transition-transform text-gray-300" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {rolloverWizard.step === 2 && (
                  <div className="space-y-8 max-w-2xl mx-auto py-10">
                    <div className="text-center space-y-2">
                       <ArrowRight size={40} className="mx-auto text-gray-300" />
                       <h4 className="text-lg font-black text-gray-800 uppercase">2. Odabir ciljne godine</h4>
                       <p className="text-xs text-gray-500 font-medium">Odaberite godinu u koju će učenici biti premješteni (obično sljedeća godina).</p>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-gray-50 border border-gray-200 p-4 rounded-sm">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={rolloverWizard.createEmptyFirstGrades}
                            onChange={e => setRolloverWizard(prev => ({ ...prev, createEmptyFirstGrades: e.target.checked }))}
                            className="w-4 h-4 text-[#005c8d]"
                          />
                          <div>
                            <div className="text-[11px] font-bold text-gray-700 uppercase">Kreiraj prazne odjele 1. razreda</div>
                            <div className="text-[10px] text-gray-500">Automatski kreira prazne strukture za novu generaciju učenika (npr. 1.A, 1.B).</div>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {schoolYears
                          .filter(y => y.id !== rolloverWizard.sourceYearId)
                          .map(y => (
                          <button 
                            key={y.id}
                            onClick={() => {
                              setRolloverWizard(prev => ({ ...prev, targetYearId: y.id }));
                              calculateRolloverMappings(y.id);
                            }}
                            className={cn(
                              "group p-6 border-2 text-left transition-all flex items-center justify-between",
                              rolloverWizard.targetYearId === y.id ? "border-[#005c8d] bg-blue-50" : "border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                            )}
                          >
                            <div>
                              <div className="text-lg font-black text-gray-800 tracking-tighter">{y.name}</div>
                              <div className="text-[10px] font-black uppercase text-gray-400">Prijemište za novu generaciju</div>
                            </div>
                            {loading ? <div className="w-4 h-4 border-2 border-[#005c8d] border-t-transparent rounded-full animate-spin" /> : <ChevronDown className="-rotate-90 group-hover:translate-x-1 transition-transform text-gray-300" />}
                          </button>
                        ))}
                        <button 
                          onClick={() => setActiveTab('SCHOOL_YEAR_DETAIL' as any)} // Or SCHOOL_YEARS
                          onClickCapture={() => setActiveTab('SCHOOL_YEARS')}
                          className="p-6 border-2 border-dashed border-gray-200 text-gray-400 font-black text-[10px] uppercase hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                          <Plus size={16} /> Kreiraj novu školsku godinu u postavkama
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {rolloverWizard.step === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-blue-50 p-4 border border-blue-100">
                      <div>
                        <div className="text-[11px] font-black text-[#005c8d] uppercase">Izvor: {schoolYears.find(y => y.id === rolloverWizard.sourceYearId)?.name}</div>
                        <div className="text-xl font-black text-gray-800 tracking-tighter flex items-center gap-3">
                           Prijenos u: {schoolYears.find(y => y.id === rolloverWizard.targetYearId)?.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-gray-400 uppercase">Ukupno razreda</div>
                        <div className="text-2xl font-black text-gray-800">{rolloverWizard.mappings.length}</div>
                      </div>
                    </div>

                    <div className="border border-gray-200 overflow-hidden">
                       <table className="w-full text-left border-collapse">
                         <thead className="bg-gray-100 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase">
                            <tr>
                              <th className="px-6 py-4">TRENUTNI RAZRED</th>
                              <th className="px-6 py-4">CILJ</th>
                              <th className="px-6 py-4 text-center">RAZREDNIK / ZAMJENIK</th>
                              <th className="px-6 py-4 text-center">TIP</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                            {rolloverWizard.mappings.map(m => {
                              const sourceClass = classes.find(c => c.id === m.fromClassId);
                              const homeroom = teachers.find(t => t.id === (m as any).homeroomTeacherId);
                              const deputy = teachers.find(t => t.id === (m as any).deputyTeacherId);
                              
                              return (
                              <tr key={m.fromClassId} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="font-black text-gray-800 text-sm">{sourceClass?.name}</div>
                                  <div className="text-[9px] text-gray-400 font-bold uppercase">{programs.find(p => p.id === sourceClass?.programId)?.name || 'Nema programa'}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <ArrowRight size={14} className="text-gray-300" />
                                    <span className={cn(
                                      "font-black text-sm uppercase tracking-tighter",
                                      m.type === 'GRADUATE' ? 'text-blue-600' : 
                                      m.type === 'MANUAL' ? 'text-amber-500' : 'text-[#005c8d]'
                                    )}>
                                      {m.toClassName}
                                    </span>
                                    {m.isNew && <span className="bg-blue-100 text-[#005c8d] px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Novi razred</span>}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col gap-0.5 items-center">
                                     {homeroom ? (
                                       <div className="text-[10px] font-bold text-gray-700">{formatPersonName(homeroom)}</div>
                                     ) : <div className="text-[10px] text-gray-300 italic">Nije dodijeljen</div>}
                                     {deputy && (
                                       <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Zamj: {formatPersonName(deputy)}</div>
                                     )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={cn(
                                    "px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest leading-none block w-fit mx-auto border",
                                    m.type === 'GRADUATE' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                                    m.type === 'MANUAL' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-green-50 text-green-600 border-green-100'
                                  )}>
                                    {m.type === 'GRADUATE' ? 'Završava' : m.type === 'MANUAL' ? 'Ručno' : 'Prijenos'}
                                  </span>
                                </td>
                              </tr>
                              );
                            })}
                         </tbody>
                       </table>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-4 flex gap-4">
                       <ShieldAlert className="text-amber-600 shrink-0" size={24} />
                       <div className="space-y-1">
                          <div className="text-[11px] font-black text-amber-800 uppercase">Važna napomena prije prijenosa</div>
                          <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                            Pokretanjem prijenosa, svi učenici iz izvornih razreda bit će prebačeni u nove razrede u ciljnoj godini. 
                            Izvorna školska godina bit će <span className="font-bold">ARHIVIRANA</span> i zaključana za uređivanje. 
                            Zaduženja nastavnika i planovi se ne prenose automatski - njih je potrebno definirati nakon rollovera.
                          </p>
                       </div>
                    </div>
                  </div>
                )}
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
                    
                    setLoading(true);
                    try {
                      // 1. Create School
                      const schoolId = `sch-${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 4)}`;
                      const { error: schError } = await supabase.from('schools').insert([{ 
                        id: schoolId,
                        name, 
                        type, 
                        subtype 
                      }]);
                      
                      if (schError) throw schError;

                      // 2. Create Default School Year
                      const currentYear = new Date().getFullYear();
                      const nextYear = currentYear + 1;
                      await supabase.from('school_years').insert([{
                        name: `${currentYear}./${nextYear}.`,
                        school_id: schoolId,
                        is_active: true,
                        starts_at: `${currentYear}-09-01`,
                        ends_at: `${nextYear}-06-30`
                      }]);

                      form.reset();
                      toast.success('Škola i zadana školska godina kreirani');
                      fetchData();
                    } catch (err: any) {
                      toast.error('Greska pri kreiranju škole: ' + err.message);
                    } finally {
                      setLoading(false);
                    }
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
                    if (!programForm.name || !programForm.schoolId) return;
                    setLoading(true);
                    try {
                      const { error } = await supabase.from('programs').insert([{ 
                        name: programForm.name, 
                        duration_years: programForm.durationYears, 
                        school_id: programForm.schoolId,
                        type: programForm.type
                      }]);
                      if (error) throw error;
                      setProgramForm({
                        name: '',
                        durationYears: 4,
                        schoolId: programForm.schoolId,
                        type: PROGRAM_TYPES.VOCATIONAL_3Y
                      });
                      toast.success('Program dodan');
                      fetchData();
                    } catch (err: any) {
                      toast.error('Greska: ' + err.message);
                    } finally {
                      setLoading(false);
                    }
                  }} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Naziv programa</label>
                        <input 
                          value={programForm.name}
                          onChange={e => setProgramForm({...programForm, name: e.target.value})}
                          placeholder="npr. Tehničar za računalstvo" 
                          className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Škola</label>
                        <select 
                          value={programForm.schoolId}
                          onChange={e => setProgramForm({...programForm, schoolId: e.target.value})}
                          className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required
                        >
                          <option value="">-- Odaberi školu --</option>
                          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Trajanje (godina)</label>
                        <input 
                          type="number" min="1" max="5" 
                          value={programForm.durationYears}
                          onChange={e => setProgramForm({...programForm, durationYears: parseInt(e.target.value)})}
                          className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none" required 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Tip programa</label>
                        <select 
                          value={programForm.type}
                          onChange={e => setProgramForm({...programForm, type: e.target.value as any})}
                          className="w-full border border-gray-300 p-2 text-xs focus:border-[#005c8d] outline-none"
                        >
                          {Object.entries(PROGRAM_TYPES).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="w-full bg-[#005c8d] text-white font-black text-[10px] uppercase py-3 border border-[#004a70] hover:bg-[#004a70]">Dodaj Program</button>
                  </form>
                </div>
              )}
              <div className="bg-white border border-gray-300">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-50 font-black text-gray-400 uppercase text-[9px] border-b">
                    <tr>
                      <th className="px-4 py-2">Naziv programa</th>
                      <th className="px-4 py-2">Trajanje</th>
                      <th className="px-4 py-2">Tip</th>
                      <th className="px-4 py-2">Nastavak</th>
                      <th className="px-4 py-2">Škola</th>
                      <th className="px-4 py-2 text-right">Akcije</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {programs.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-bold">{p.durationYears} god.</td>
                        <td className="px-4 py-3 text-[9px] font-black text-blue-400 uppercase tracking-tighter">{p.type}</td>
                        <td className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-tighter">{p.continuationType}</td>
                        <td className="px-4 py-3 text-gray-400 text-[10px] font-bold uppercase">{schools.find(s => s.id === p.schoolId)?.name || 'N/A'}</td>
                        <td className="px-4 py-3 text-right">
                          {isMainAdmin && (
                            <button 
                              onClick={() => setDeleteDialog({
                                isOpen: true,
                                type: 'PROGRAM',
                                id: p.id,
                                loading: false,
                                message: `Jeste li sigurni da želite obrisati program "${p.name}"?`
                              })}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
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
                <h3 className="text-lg font-black text-[#005c8d] uppercase tracking-tighter">Kartica učenika: {selectedStudentData.name}</h3>
              </div>

              <div className="flex gap-2">
                 <button 
                   onClick={() => handleResetStudentPassword(selectedStudentData.id, 'DEFAULT')}
                   className="px-3 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 text-[10px] font-black uppercase hover:bg-yellow-100 transition-colors"
                 >
                   Resetiraj na zadano (yupu8Ev4)
                 </button>
                 <button 
                   onClick={() => handleResetStudentPassword(selectedStudentData.id, 'GENERATE')}
                   className="px-3 py-1 bg-[#005c8d] text-white border border-[#004a70] text-[10px] font-black uppercase hover:bg-[#004a70] transition-colors"
                 >
                   Generiraj novu lozinku
                 </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-300 p-4 space-y-4">
                  <div className="text-[10px] font-black text-gray-400 uppercase mb-2 border-b pb-1">Predmeti učenika</div>
                  <div className="text-[10px] text-gray-400 italic mb-4">Upravljanje predmetima koje učenik pohađa ili je iz njih izuzet:</div>
                  <div className="divide-y divide-gray-100">
                    {(() => {
                      const assignmentsInClass = subjectAssignments.filter(a => a.classId === selectedStudentData?.classId);
                      const classSubjectIds = classSubjects.filter(cs => cs.classId === selectedStudentData?.classId).map(cs => cs.subjectId);
                      const assignmentSubjectIds = assignmentsInClass.map(a => a.subjectId);
                      const uniqueSubjectIds = Array.from(new Set([...classSubjectIds, ...assignmentSubjectIds])).filter(Boolean) as string[];
                      const classSubs = uniqueSubjectIds.map(sid => allSubjects.find(s => s.id === sid)).filter(Boolean) as Subject[];
                      return classSubs.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))).map(sub => {
                        const enrollment = enrollments.find(e => e.subjectId === sub.id);
                        const classSubject = classSubjects.find(cs => cs.subjectId === sub.id && cs.classId === selectedStudentData?.classId);
                        const status = enrollment?.status || 'NOT_ASSIGNED';
                        return (
                          <div key={sub.id} className="py-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {status === 'ACTIVE' ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-300" />}
                              <span className={cn("text-[11px] font-bold uppercase", status === 'EXEMPT' ? 'text-red-400 line-through' : 'text-gray-700')}>
                                 {formatSubjectDisplayName(sub.name || '', classSubject?.subjectType || 'redovni')}
                              </span>
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
                                   Odaberi
                                 </button>
                               )}
                            </div>
                          </div>
                        );
                      });
                    })()}
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
                          type="email" placeholder="E-mail (opcionalno)"
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
                              {activeStudentClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                            .sort((a, b) => {
                              const surnameA = getSurname(String(a.name || ''));
                              const surnameB = getSurname(String(b.name || ''));
                              return surnameA.localeCompare(surnameB, 'hr', { sensitivity: 'base' });
                            })
                            .map(u => (
                            <tr key={u.id} className={cn("hover:bg-blue-50/50", selectedUserForRole === u.id && "bg-blue-50")}>
                              <td className="px-3 py-2 border-r">
                                <div className="font-bold text-gray-700">{u.name}</div>
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
                                  {([Role.TEACHER, Role.SCHOOL_ADMIN, Role.ADMIN].includes(u.globalRole)) && (
                                    <button 
                                      onClick={() => handleResetStaffAuthenticator(u.id, u.name, u.surname, u.email)}
                                      className="text-[8px] font-bold uppercase text-red-400 hover:text-red-600 mt-1 flex items-center justify-center gap-1"
                                      title="Resetiraj Authenticator"
                                    >
                                      <Shield size={8} /> Reset MFA
                                    </button>
                                  )}
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
                            {formatPersonName(allUsers.find(u => u.id === selectedUserForRole))}
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
                    {formatPersonName(resetModal.user)}
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
                              <div class="value">${formatPersonName(resetModal.user)}</div>
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

      {/* Staff TOTP Setup Modal */}
      {createdStaffTotp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full shadow-2xl border border-gray-300">
            <div className="p-6 border-b border-gray-200 bg-[#005c8d] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="text-white" size={20} />
                <h3 className="text-sm font-black uppercase tracking-tighter">Postavljanje autentifikatora</h3>
              </div>
              <button 
                onClick={() => setCreatedStaffTotp(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">
              <div className="text-center space-y-2">
                <div className="text-lg font-black text-gray-800 uppercase tracking-tight">
                  {createdStaffTotp.name}
                </div>
                <div className="text-sm font-bold text-[#005c8d]">
                  {createdStaffTotp.email}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4">
                    <img src={createdStaffTotp.qrCode} alt="TOTP QR Code" className="w-48 h-48 border-4 border-white shadow-sm" />
                    <div className="text-center">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Setup kod (Manualno)</p>
                      <code className="text-lg font-black tracking-widest text-gray-700 select-all px-4 py-2 bg-white border border-gray-200 block">
                        {createdStaffTotp.secret}
                      </code>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-400 uppercase leading-none">Početna lozinka</p>
                        <p className="text-sm font-black text-gray-800 tracking-widest bg-white p-2 border border-gray-100">{createdStaffTotp.tempPassword || '1234'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-400 uppercase leading-none">Tip potvrde</p>
                        <p className="text-[10px] font-bold text-[#005c8d] uppercase tracking-tight bg-white p-2 border border-gray-100 flex items-center gap-1">
                           <Shield size={10} /> Microsoft Authenticator
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">
                  <p className="font-black text-[#005c8d] mb-1">Upute za zaposlenika:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Instalirajte <span className="text-gray-900">Microsoft Authenticator</span> na mobitel.</li>
                    <li>Odaberite <span className="text-gray-900">Dodaj račun</span> → <span className="text-gray-900">Poslovni ili školski račun</span>.</li>
                    <li>Skenirajte gornji <span className="text-gray-900">QR kod</span>.</li>
                    <li>Prijavite se s emailom, lozinkom i 6-znamenkastim kodom.</li>
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button 
                    onClick={() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow && createdStaffTotp) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>Authenticator Setup - ${createdStaffTotp.name}</title>
                                <style>
                                  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.5; }
                                  .slip { border: 2px solid #005c8d; padding: 40px; max-width: 600px; margin: 0 auto; position: relative; }
                                  .header { border-bottom: 2px solid #005c8d; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
                                  .header h1 { margin: 0; font-size: 24px; color: #005c8d; text-transform: uppercase; letter-spacing: -1px; }
                                  .user-info { margin-bottom: 30px; }
                                  .user-info div { margin-bottom: 5px; }
                                  .label { font-size: 10px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 1px; }
                                  .value { font-size: 18px; font-weight: bold; }
                                  .setup-container { display: flex; gap: 40px; background: #f8f9fa; padding: 30px; border: 1px solid #eee; }
                                  .qr-section { text-align: center; }
                                  .qr-section img { width: 200px; height: 200px; background: white; padding: 10px; border: 1px solid #ddd; }
                                  .instructions { font-size: 12px; }
                                  .instructions h3 { margin-top: 0; color: #005c8d; text-transform: uppercase; font-size: 14px; }
                                  .instructions ol { padding-left: 20px; }
                                  .instructions li { margin-bottom: 10px; }
                                  .footer-note { margin-top: 30px; font-size: 10px; font-weight: bold; color: #d32f2f; text-transform: uppercase; text-align: center; }
                                  .password-box { margin-top: 20px; padding: 15px; border: 2px dashed #005c8d; text-align: center; }
                                  @media print { .no-print { display: none; } }
                                </style>
                              </head>
                              <body onload="window.print()">
                                <div class="slip">
                                  <div class="header">
                                    <h1>e-Dnevnik Pristup</h1>
                                    <span style="font-size: 10px; font-weight: bold; color: #888;">${new Date().toLocaleDateString('hr-HR')}</span>
                                  </div>
                                  
                                  <div class="user-info">
                                    <div class="label">Korisnik</div>
                                    <div class="value">${createdStaffTotp.name}</div>
                                    <div class="label" style="margin-top: 15px;">E-mail adresa</div>
                                    <div class="value" style="color: #005c8d;">${createdStaffTotp.email}</div>
                                  </div>

                                  <div class="setup-container">
                                    <div class="qr-section">
                                      <img src="${createdStaffTotp.qrCode}" />
                                      <div class="label" style="margin-top: 10px;">Setup kod (manualno)</div>
                                      <div style="font-weight: bold; font-family: monospace; font-size: 14px; letter-spacing: 2px;">${createdStaffTotp.secret}</div>
                                    </div>
                                    <div class="instructions">
                                      <h3>Upute za aktivaciju</h3>
                                      <ol>
                                        <li>Instalirajte <b>Microsoft Authenticator</b> aplikaciju.</li>
                                        <li>Kliknite na <b>"+" (Dodaj račun)</b>.</li>
                                        <li>Odaberite <b>"Poslovni ili školski račun"</b>.</li>
                                        <li>Odaberite <b>"Skeniraj QR kod"</b> i usmjerite kameru prema kodu lijevo.</li>
                                      </ol>
                                    </div>
                                  </div>

                                  <div class="password-box">
                                    <div class="label">Vaša početna lozinka</div>
                                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px;">${createdStaffTotp.tempPassword || '1234'}</div>
                                  </div>

                                  <div class="footer-note">Lozinka i autentifikator su tajni. Nemojte ih dijeliti s drugima.</div>
                                </div>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                        }
                    }}
                    className="flex items-center justify-center gap-2 py-3 bg-[#005c8d] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004a70] transition-all shadow-md"
                  >
                    <Printer size={16} /> Printaj podatke
                  </button>
                  <button 
                    onClick={() => setCreatedStaffTotp(null)}
                    className="flex items-center justify-center gap-2 py-3 border border-gray-300 text-gray-600 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                  >
                    Zatvori
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full animate-in zoom-in-95 duration-200 shadow-2xl relative overflow-hidden ring-1 ring-black/10">
            <div className="p-4 bg-yellow-500 text-white flex justify-between items-center text-xs font-black uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14}/>
                Nova lozinka za učenika
              </div>
              <button 
                onClick={() => setResetModal({ ...resetModal, isOpen: false })} 
                className="hover:rotate-90 transition-transform p-1 bg-white/10"
              >
                <X size={16}/>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Učenik</p>
                <h4 className="text-xl font-black text-gray-800 uppercase tracking-tighter">{resetModal.user?.name}</h4>
              </div>

              <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-6 text-center space-y-3">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Nova pristupna lozinka</p>
                 <div className="text-3xl font-black text-[#005c8d] tracking-[0.3em] font-mono break-all bg-white py-4 shadow-inner ring-1 ring-black/5">
                   {resetModal.newPass}
                 </div>
                 <p className="text-[9px] font-bold text-gray-400">Vrijeme generiranja: {resetModal.generatedAt}</p>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-sm">
                  <div className="flex gap-3">
                    <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase">
                      Zabilježite lozinku i predajte je učeniku. Lozinka je stalna i neće se tražiti promjena pri prijavi.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(resetModal.newPass);
                    toast.success('Kopirano u međuspremnik!');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
                >
                   Kopiraj lozinku
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
          </div>
        </div>
      </>
    )}
    </div>
  );
}
