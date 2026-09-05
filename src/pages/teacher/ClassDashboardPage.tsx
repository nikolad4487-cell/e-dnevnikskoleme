import React, { useState, useEffect, Suspense, lazy, useRef } from 'react';
import { useParams, useNavigate, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Role } from '../../types';
import { Loader2, ShieldAlert, BookOpen, List, ClipboardList, FileText, FileSpreadsheet, Settings, Search, Menu, Clock, Bookmark, HelpCircle, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { mappers } from '../../lib/mappers';
import { ImenikTable } from '../../components/ImenikTable';
import { canManageClassAdministration } from '../../hooks/useClassAdminAccess';

const TeacherIzostanciPage = lazy(() => import('./IzostanciPage'));
const BiljeskePage = lazy(() => import('./BiljeskePage'));
const DnevnikRadaPage = lazy(() => import('./DnevnikRadaPage'));
const ZapisniciPage = lazy(() => import('./ZapisniciPage'));
const IzvjestajiPage = lazy(() => import('./IzvjestajiPage'));
const InformativkaPage = lazy(() => import('../shared/InformativkaPage'));
const AdministrationPage = lazy(() => import('./AdministrationPage'));
const ImenikPage = lazy(() => import('./ImenikPage'));
const PedagoskaDokumentacijaPage = lazy(() => import('./PedagoskaDokumentacijaPage'));
const PretrazivanjePage = lazy(() => import('./PretrazivanjePage'));
const ClassSubjectsPage = lazy(() => import('../admin/ClassSubjectsPage'));
const ClassStudentsPage = lazy(() => import('../admin/ClassStudentsPage'));
const StudentSubjectEnrollmentPage = lazy(() => import('../admin/StudentSubjectEnrollmentPage'));
const RoditeljskiSastanciPage = lazy(() => import('./RoditeljskiSastanciPage'));
const IndividualniRazgovoriPage = lazy(() => import('./IndividualniRazgovoriPage'));
const DolasciRoditeljaPage = lazy(() => import('./DolasciRoditeljaPage'));
const StudentDashboard = lazy(() => import('./StudentDashboard'));
const StudentSubjectDetail = lazy(() => import('./StudentSubjectDetail'));
const DigitalniDosjePage = lazy(() => import('../shared/DigitalniDosjePage'));
const ClassNotesPage = BiljeskePage;

export default function ClassDashboardPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setSelectedSchoolId, isArchived, setIsArchived } = useSelection();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);

  useEffect(() => {
    const profile = user;
    const roles = userSchoolRoles;
    console.log("CLASS ID", classId);
    console.log("PROFILE", profile);
    console.log("ROLES", roles);
  }, [classId, user, userSchoolRoles]);

  useEffect(() => {
    if (classId) {
      checkAccessAndLoad();
    }
  }, [classId, user, userSchoolRoles]);

  const checkAccessAndLoad = async () => {
    if (!user || !classId) return;
    setLoading(true);
    setAccessDenied(false);
    setCurrentClass(null);

    console.log("CLASS PAGE load start", classId);

    try {
      // 1. Fetch class details (Glavni razredni kontekst)
      const { data: rawClass, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          program:program_id(*),
          homeroom:homeroom_teacher_id(*),
          deputy:deputy_teacher_id(*)
        `)
        .eq('id', classId)
        .single();

      console.log("CLASS CONTEXT result", rawClass, classError);

      if (classError || !rawClass) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const mappedClass = mappers.class(rawClass);
      const selectedClass = mappedClass;
      setCurrentClass(mappedClass);
      console.log("SELECTED CLASS", selectedClass);

      // 2. Fetch Students (Učenici)
      const { data: studentsData, error: studentsError } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', classId);
      
      console.log("STUDENTS result", studentsData, studentsError);
      if (studentsData) setStudents(studentsData);

      // 3. Parallel extra modules with Promise.allSettled
      // (Even if these fail, we don't break the page)
      const extraModulesPromise = Promise.allSettled([
        Promise.resolve({ data: [], error: null }),
        // other modules (digitalni dosje, kalendar, etc) could be added here
      ]).then((results) => {
        const notifResult = results[0];
        const notificationsData = notifResult.status === 'fulfilled' ? notifResult.value.data : null;
        const notificationsErr = notifResult.status === 'fulfilled' ? notifResult.value.error : notifResult.reason;
        
        console.log("NOTIFICATIONS result", notificationsData, notificationsErr);
        
        const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
        if (errors.length > 0) {
            console.error("EXTRA MODULES result errors", errors);
        } else {
            console.log("EXTRA MODULES result", "Success");
        }
      });

      // 1b. Check if archived (class status or school year is_active)
      const { data: yearData } = await supabase
        .from('school_years')
        .select('is_active')
        .eq('id', mappedClass.school_year_id)
        .maybeSingle();
      
      const archived = mappedClass.status === 'ARCHIVED' || (yearData && !yearData.is_active);
      setIsArchived(!!archived);

      // 2. Check access
      const isSchoolAdmin = (userSchoolRoles || []).some(r => 
        r && r.schoolId === mappedClass.schoolId && 
        [Role.ADMIN, Role.SCHOOL_ADMIN].includes(r.role as Role)
      );

      if (isMainAdmin || isSchoolAdmin) {
        // Admin has full access
        allowAccess(mappedClass);
        return;
      }

      // Check if Homeroom or Deputy
      if (mappedClass.homeroomTeacherId === user.id || mappedClass.deputyTeacherId === user.id) {
        allowAccess(mappedClass);
        return;
      }

      // Check if Teacher in this class
      const { data: assignments, error: assignError } = await supabase
        .from('class_subject_teachers')
        .select('id')
        .eq('class_id', classId)
        .eq('teacher_id', user.id)
        .limit(1);

      if (assignError) throw assignError;

      if (assignments && assignments.length > 0) {
        allowAccess(mappedClass);
        return;
      }

      // If nothing matched, deny
      setAccessDenied(true);
    } catch (error) {
      console.error('[CLASS DASHBOARD] Access Check Error:', error);
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const allowAccess = (cls: Class) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
  };

  const [isBurgerOpen, setIsBurgerOpen] = useState(false);
  const burgerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (burgerRef.current && !burgerRef.current.contains(event.target as Node)) {
        setIsBurgerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canAccessClassAdmin = canManageClassAdministration(user, userSchoolRoles, currentClass, isMainAdmin);

  const tabs = [
    { id: 'imenik', label: 'Imenik', path: 'imenik', icon: BookOpen },
    { id: 'pregled-rada', label: 'Pregled rada', path: 'pregled-rada', icon: List },
    { id: 'dnevnik-rada', label: 'Dnevnik rada', path: 'dnevnik-rada', icon: ClipboardList },
    { id: 'izostanci', label: 'Izostanci', path: 'izostanci', icon: Clock },
    { id: 'zapisnici', label: 'Zapisnici', path: 'zapisnici', icon: FileText },
    { id: 'pedagoska-dokumentacija', label: 'Pedagoška dokumentacija', path: 'pedagoska-dokumentacija', icon: FileText },
    { id: 'raspored', label: 'Raspored', path: 'raspored', icon: Calendar },
    ...(canAccessClassAdmin ? [{ id: 'admin', label: 'Admin razreda', path: 'admin', icon: Settings }] : []),
  ];

  const burgerItems = [
    { label: 'Bilješke', path: 'biljeske', icon: Bookmark },
    { label: 'Izostanci', path: 'izostanci', icon: Clock },
    { label: 'Pedagoška dokumentacija', path: 'pedagoska-dokumentacija', icon: FileText },
    { label: 'Raspored sati', path: 'raspored', icon: Calendar },
    { label: 'Informativka', path: 'informativka', icon: HelpCircle },
  ];

  let currentTab = location.pathname.split('/')[3] || 'imenik';
  if (currentTab === 'imenik-predmeti' || currentTab === 'biljeske') currentTab = 'imenik';
  if (currentTab === 'work-overview') currentTab = 'pregled-rada';
  if (currentTab === 'work-journal') currentTab = 'dnevnik-rada';
  if (currentTab === 'absences') currentTab = 'izostanci';
  if (currentTab === 'minutes' || currentTab === 'roditeljski-sastanci' || currentTab === 'individualni-razgovori' || currentTab === 'dolasci-roditelja') currentTab = 'zapisnici';
  if (currentTab === 'pedagogical') currentTab = 'pedagoska-dokumentacija';
  if (currentTab === 'schedule') currentTab = 'raspored';
  if (currentTab === 'administration' || currentTab === 'predmeti' || currentTab === 'ucenici' || currentTab === 'upisi-predmeta') currentTab = 'admin';

  const isActive = (tabPath: string) => currentTab === tabPath;

  const sidebarLinks: Record<string, { label: string, path: string }[]> = {
    'imenik': [
      { label: 'Imenik učenika', path: 'imenik' },
      { label: 'Pregled predmeta', path: 'imenik-predmeti' },
      { label: 'Bilješke', path: 'biljeske' }
    ],
    'pregled-rada': [
      { label: 'Pregled rada', path: 'pregled-rada' }
    ],
    'izostanci': [
      { label: 'Pregled izostanaka', path: 'izostanci' }
    ],
    'zapisnici': [
      { label: 'Zapisnici vijeća', path: 'zapisnici' },
      { label: 'Roditeljski sastanci', path: 'roditeljski-sastanci' },
      { label: 'Individualni razgovori', path: 'individualni-razgovori' },
      { label: 'Dolasci roditelja', path: 'dolasci-roditelja' },
      { label: 'Pedagoška dokumentacija', path: 'pedagoska-dokumentacija' }
    ],
    'admin': [
      { label: 'Administracija razreda', path: 'admin' },
      { label: 'Predmeti u razredu', path: 'predmeti' },
      { label: 'Učenici u razredu', path: 'ucenici' },
      { label: 'Predmeti učenika', path: 'upisi-predmeta' }
    ]
  };

  const renderStudentsTable = () => (
    <ImenikTable 
      students={students} 
      studentEnrollments={students} 
      onStudentClick={(student) => navigate(`/class/${classId}/student/${student.student?.id}`)}
      classWarnings={{ failingGrades: {}, pendingAbsences: {} }}
    />
  );

  const activeSidebarLinks = currentTab === 'admin' && !canAccessClassAdmin ? [] : (sidebarLinks[currentTab] || []);

  const renderClassAdminRoute = (element: React.ReactNode) => {
    if (loading) {
      return null;
    }

    if (!canAccessClassAdmin) {
      return <Navigate to={`/class/${classId}/imenik`} replace />;
    }

    return element;
  };

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 font-sans">
        <div className="bg-white p-12 border border-gray-300 max-w-md shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={24} strokeWidth={3} />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-2 tracking-tighter uppercase leading-none">Razred nije pronađen</h1>
          <div className="h-px w-8 bg-red-200 mx-auto mb-6"></div>
          <p className="text-[12px] text-slate-600 mb-8 leading-relaxed font-bold">
            Odabrani razredni odjel ({classId}) ne postoji ili mu niste ovlašteni pristupiti.
          </p>
          <button 
            onClick={() => navigate('/select-class')}
            className="w-full bg-[#005c8d] text-white py-3 border border-[#004a71] font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-all"
          >
            Povratak na odabir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {isArchived && (
        <div className="bg-amber-100 border-b border-amber-200 px-6 py-2 flex items-center gap-3 shrink-0">
          <div className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center shrink-0">
            <ShieldAlert size={12} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-amber-800 leading-none">Arhivirani podaci</span>
            <span className="text-[9px] font-bold text-amber-700">Ovaj razredni odjel je dio arhivirane školske godine. Izmjene su onemogućene.</span>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden bg-white w-full">
        {/* Sidebar */}
        {activeSidebarLinks.length > 0 && (
          <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 flex flex-col gap-2 shrink-0">
             {activeSidebarLinks.map(link => (
               <button
                 key={link.path}
                 onClick={() => navigate(`/class/${classId}/${link.path}`)}
                 className={cn(
                   "w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded transition-colors",
                   location.pathname.endsWith(link.path) 
                     ? "bg-[#005c8d] text-white" 
                     : "text-slate-600 hover:bg-slate-200"
                 )}
               >
                 {link.label}
               </button>
             ))}
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full" key={classId}>
          <Suspense fallback={null}>
            <Routes>
              <Route index element={<Navigate to="imenik" replace />} />
              <Route path="imenik" element={renderStudentsTable()} />
              <Route path="imenik-predmeti" element={<ImenikPage initialView="SUBJECTS" />} />
              <Route path="biljeske" element={<ClassNotesPage />} />
              
              <Route path="pregled-rada" element={<DnevnikRadaPage initialView="WEEKS" />} />
              <Route path="work-overview" element={<DnevnikRadaPage initialView="WEEKS" />} />
              
              <Route path="dnevnik-rada" element={<DnevnikRadaPage initialView="WEEK_DETAIL" />} />
              <Route path="work-journal" element={<DnevnikRadaPage initialView="WEEK_DETAIL" />} />
              <Route path="ispiti" element={<DnevnikRadaPage initialView="EXAMS" />} />
              <Route path="exams" element={<DnevnikRadaPage initialView="EXAMS" />} />
              
              <Route path="izostanci" element={<TeacherIzostanciPage />} />
              <Route path="absences" element={<TeacherIzostanciPage />} />
              
              <Route path="pedagoska-dokumentacija" element={<PedagoskaDokumentacijaPage />} />
              <Route path="pedagogical" element={<PedagoskaDokumentacijaPage />} />
              <Route path="dosje" element={<DigitalniDosjePage />} />
              
              <Route path="raspored" element={<DnevnikRadaPage initialView="SCHEDULE" />} />
              <Route path="schedule" element={<DnevnikRadaPage initialView="SCHEDULE" />} />
              <Route path="lektira" element={<DnevnikRadaPage initialView="LEKTIRA" />} />
              
              <Route path="zapisnici" element={<ZapisniciPage />} />
              <Route path="minutes" element={<ZapisniciPage />} />
              
              <Route path="roditeljski-sastanci" element={<RoditeljskiSastanciPage />} />
              <Route path="individualni-razgovori" element={<IndividualniRazgovoriPage />} />
              <Route path="dolasci-roditelja" element={<DolasciRoditeljaPage />} />
              
              <Route path="izvjestaji" element={<IzvjestajiPage />} />
              <Route path="informativka" element={<InformativkaPage />} />
              
              <Route path="admin" element={renderClassAdminRoute(<AdministrationPage />)} />
              <Route path="administration" element={renderClassAdminRoute(<AdministrationPage />)} />
              <Route path="predmeti" element={renderClassAdminRoute(<ClassSubjectsPage />)} />
              <Route path="ucenici" element={renderClassAdminRoute(<ClassStudentsPage />)} />
              <Route path="upisi-predmeta" element={renderClassAdminRoute(<StudentSubjectEnrollmentPage />)} />
              
              <Route path="student/:studentId" element={<StudentDashboard />} />
              <Route path="students/:studentId" element={<StudentDashboard />} />
              <Route path="student/:studentId/grades" element={<StudentDashboard />} />
              <Route path="students/:studentId/grades" element={<StudentDashboard />} />
              
              <Route path="student/:studentId/absences" element={<TeacherIzostanciPage />} />
              <Route path="students/:studentId/absences" element={<TeacherIzostanciPage />} />
              
              <Route path="student/:studentId/notes" element={<ClassNotesPage />} />
              <Route path="students/:studentId/notes" element={<ClassNotesPage />} />

              <Route path="student/:studentId/subject/:subjectId" element={<StudentSubjectDetail />} />
              <Route path="students/:studentId/subject/:subjectId" element={<StudentSubjectDetail />} />
              
              <Route path="pretrazivanje" element={<PretrazivanjePage />} />
              <Route path="*" element={<div className="bg-orange-500 text-white p-8 font-black uppercase">ROUTE NOT FOUND! Staza je: {location.pathname}</div>} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
