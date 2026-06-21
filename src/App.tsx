import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ShieldAlert, Users, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SelectionProvider, useSelection } from './contexts/SelectionContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BasicLayout } from './components/BasicLayout';
import { ClassDashboardLayout } from './components/ClassDashboardLayout';
import InactivityTracker from './components/InactivityTracker';
import { Role } from './types';

// Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SchoolSelectionPage = lazy(() => import('./pages/SchoolSelectionPage'));
const ClassSelectionPage = lazy(() => import('./pages/ClassSelectionPage'));
const ChildSelectionPage = lazy(() => import('./pages/ChildSelectionPage'));


// Teacher/Admin Pages
const ImenikPage = lazy(() => import('./pages/teacher/ImenikPage'));
const DnevnikRadaPage = lazy(() => import('./pages/teacher/DnevnikRadaPage'));
const ZapisniciPage = lazy(() => import('./pages/teacher/ZapisniciPage'));
const IzvjestajiPage = lazy(() => import('./pages/teacher/IzvjestajiPage'));
const AdministrationPage = lazy(() => import('./pages/teacher/AdministrationPage'));
const PretrazivanjePage = lazy(() => import('./pages/teacher/PretrazivanjePage'));
const PedagoskaDokumentacijaPage = lazy(() => import('./pages/teacher/PedagoskaDokumentacijaPage'));
const CertificateManagementPage = lazy(() => import('./pages/teacher/certificates/CertificateManagementPage'));


// Student/Parent Pages
const OcjenePage = lazy(() => import('./pages/student/OcjenePage'));
const BiljeskePage = lazy(() => import('./pages/student/BiljeskePage'));
const IzostanciPage = lazy(() => import('./pages/student/IzostanciPage'));
const RasporedPage = lazy(() => import('./pages/student/RasporedPage'));
const StudentIspitiPage = lazy(() => import('./pages/student/StudentIspitiPage'));
const OsobniPodaciPage = lazy(() => import('./pages/student/OsobniPodaciPage'));
const FinalThesisPage = lazy(() => import('./pages/student/FinalThesisPage'));
const FinalThesisTeacherPage = lazy(() => import('./pages/teacher/FinalThesisTeacherPage'));

const RavnateljDashboardPage = lazy(() => import('./pages/admin/RavnateljDashboardPage'));
const MaticnaKnjigaPage = lazy(() => import('./pages/admin/MaticnaKnjigaPage'));
const ArhivaPage = lazy(() => import('./pages/admin/ArhivaPage'));
const SkolskiKalendarPage = lazy(() => import('./pages/shared/SkolskiKalendarPage'));
const InterniDokumentiPage = lazy(() => import('./pages/shared/InterniDokumentiPage'));

// Shared
const InformativkaPage = lazy(() => import('./pages/shared/InformativkaPage'));
const InformativkaAdminPage = lazy(() => import('./pages/admin/InformativkaAdminPage'));
const SettingsPage = lazy(() => import('./pages/shared/SettingsPage'));
const AuthenticatorSetupPage = lazy(() => import('./pages/auth/AuthenticatorSetupPage'));
const DigitalniDosjePage = lazy(() => import('./pages/shared/DigitalniDosjePage'));

// Admin Pages
const SchoolsManagementPage = lazy(() => import('./pages/admin/SchoolsManagementPage'));
const SchoolAdminDashboard = lazy(() => import('./pages/admin/SchoolAdminDashboard'));
const ClassManagementPage = lazy(() => import('./pages/admin/ClassManagementPage'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const SubjectManagementPage = lazy(() => import('./pages/admin/SubjectManagementPage'));
const ClassSubjectsPage = lazy(() => import('./pages/admin/ClassSubjectsPage'));
const ClassStudentsPage = lazy(() => import('./pages/admin/ClassStudentsPage'));
const StudentSubjectEnrollmentPage = lazy(() => import('./pages/admin/StudentSubjectEnrollmentPage'));
const ScheduleManagementPage = lazy(() => import('./pages/admin/ScheduleManagementPage'));
const SchoolYearsPage = lazy(() => import('./pages/admin/SchoolYearsPage'));
const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const ProgramsPage = lazy(() => import('./pages/admin/ProgramsPage'));
const RolloverPage = lazy(() => import('./pages/admin/RolloverPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const ZamjenePage = lazy(() => import('./pages/admin/ZamjenePage'));
const SystemCheckPage = lazy(() => import('./pages/admin/SystemCheckPage'));
const SystemHealthPage = lazy(() => import('./pages/admin/SystemHealthPage'));

const ClassDashboardPage = lazy(() => import('./pages/teacher/ClassDashboardPage'));

function TeacherRedirectToClass({ subPath }: { subPath: string }) {
  const { selectedClassId } = useSelection();
  if (!selectedClassId) {
    return <Navigate to="/select-class" replace />;
  }
  return <Navigate to={`/class/${selectedClassId}/${subPath}`} replace />;
}

function RoutePersister() {
  const location = useLocation();
  const navigate = useNavigate();
  const isInitialized = useRef(false);

  useEffect(() => {
    sessionStorage.setItem("lastRoute", location.pathname + location.search + location.hash);
  }, [location]);

  useEffect(() => {
    if (!isInitialized.current) {
        const lastRoute = sessionStorage.getItem("lastRoute");
        if (lastRoute && lastRoute !== "/" && lastRoute !== "/login") {
            navigate(lastRoute, { replace: true });
        }
        isInitialized.current = true;
    }
  }, []);

  return null;
}

function TitleManager() {
  const location = useLocation();

  useEffect(() => {
    const pageTitles = [
      { match: "/admin-skole/korisnici", title: "e-Dnevnik - Korisnici i nastavnici" },
      { match: "/izostanci", title: "e-Dnevnik - Izostanci" },
      { match: "/admin-skole", title: "e-Dnevnik - Admin škole" },
      { match: "/admin-razreda", title: "e-Dnevnik - Admin razreda" },
      { match: "/imenik", title: "e-Dnevnik - Imenik" },
      { match: "/pregled-rada", title: "e-Dnevnik - Pregled rada" },
      { match: "/dnevnik-rada", title: "e-Dnevnik - Dnevnik rada" },
      { match: "/kalendar-skole", title: "e-Dnevnik - Kalendar škole" },
      { match: "/raspored", title: "e-Dnevnik - Raspored" },
    ];
    
    const current = pageTitles.find((item) =>
      location.pathname.includes(item.match)
    );

    document.title = current?.title || "e-Dnevnik";
  }, [location.pathname]);

  return null;
}

const APP_VERSION = '1.0.5';

export default function App() {
  console.log("[APP] App render/mount");
  const location = (window as any).location?.pathname || 'unknown';
  console.log(`[APP] Render | Path: ${location}`);
  
  if (typeof window !== 'undefined') {
    (window as any).__renderCount = ((window as any).__renderCount || 0) + 1;
    if ((window as any).__renderCount > 100) {
      console.error('CRITICAL: Infinite render loop detected (>100 renders). Stopping auto-reload logic.');
    }
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  console.log("HOSTNAME", hostname);

  const isTeacherDomain = hostname === "e-dnevnik.skolehr.xyz";
  const isStudentDomain = hostname === "ocjene.skolehr.xyz";

  const portalType = import.meta.env.VITE_APP_PORTAL || 'staff';
  const isStudentPortal = isStudentDomain || (!isTeacherDomain && (portalType === 'student'));

  useEffect(() => {
    console.log(`[APP] Mounted | Hostname: ${hostname} | Portal Type: ${portalType} | Is Student Portal: ${isStudentPortal}`);
  }, [hostname, portalType, isStudentPortal]);

  return (
    <AuthProvider>
      <SelectionProvider>
        <BrowserRouter>
          <RoutePersister />
          <TitleManager />
          <Toaster position="top-right" />
          <InactivityTracker />
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen font-sans">Učitavanje...</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/setup-authenticator" element={
                <ProtectedRoute>
                  <AuthenticatorSetupPage />
                </ProtectedRoute>
              } />
              
              <Route path="/select-school" element={
                <ProtectedRoute allowedRoles={isStudentPortal ? [Role.STUDENT, Role.PARENT] : [Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.STUDENT, Role.PARENT]}>
                  <SchoolSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/select-class" element={
                <ProtectedRoute allowedRoles={isStudentPortal ? [Role.STUDENT, Role.PARENT] : [Role.STUDENT, Role.PARENT, Role.MAIN_ADMIN, Role.TEACHER, Role.ADMIN, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY]}>
                  <ClassSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/select-child" element={
                <ProtectedRoute allowedRoles={isStudentPortal ? [Role.PARENT] : [Role.PARENT, Role.MAIN_ADMIN]}>
                  <ChildSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/" element={
                <ProtectedRoute>
                  <Navigate to="/select-class" replace />
                </ProtectedRoute>
              } />

              {/* Only register admin and teacher routes if not on the student portal */}
              {!isStudentPortal && (
                <>
                  <Route path="/admin/schools" element={
                    <ProtectedRoute allowedRoles={[Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.ADMIN]}>
                      <BasicLayout>
                        <SchoolsManagementPage />
                      </BasicLayout>
                    </ProtectedRoute>
                  } />

                  {/* Admin Routes */}
                  <Route path="/admin-skole/*" element={
                    <ProtectedRoute allowedRoles={[Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.ADMIN]}>
                      <BasicLayout>
                        <Routes>
                          <Route path="" element={<SchoolAdminDashboard />} />
                          <Route path="school-dashboard" element={<Navigate to="/admin-skole" replace />} />
                          <Route path="schools" element={<SchoolsManagementPage />} />
                          <Route path="skolske-godine" element={<SchoolYearsPage />} />
                          <Route path="kalendar" element={<SkolskiKalendarPage readOnly={false} />} />
                          <Route path="razredi" element={<ClassManagementPage />} />
                          <Route path="upisi-predmeta" element={<StudentSubjectEnrollmentPage />} />
                          <Route path="zamjene" element={<ZamjenePage />} />
                          <Route path="korisnici" element={<UserManagementPage />} />
                          <Route path="ucenici" element={<StudentsPage />} />
                          <Route path="predmeti" element={<SubjectManagementPage />} />
                          <Route path="programi" element={<ProgramsPage />} />
                          <Route path="rollover" element={<RolloverPage />} />
                          <Route path="postavke" element={<AdminSettingsPage />} />
                          <Route path="system-check" element={<SystemCheckPage />} />
                          <Route path="system-health" element={<SystemHealthPage />} />
                          <Route path="raspored" element={<ScheduleManagementPage />} />
                          <Route path="informativka" element={<InformativkaAdminPage />} />
                          <Route path="ravnatelj-dashboard" element={<RavnateljDashboardPage />} />
                          <Route path="maticna-knjiga" element={<MaticnaKnjigaPage />} />
                          <Route path="arhiva" element={<ArhivaPage />} />
                          <Route path="*" element={<Navigate to="/admin-skole" replace />} />
                        </Routes>
                      </BasicLayout>
                    </ProtectedRoute>
                  } />

                  <Route path="/class/:classId/*" element={
                    <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                      <ClassDashboardLayout>
                        <ClassDashboardPage />
                      </ClassDashboardLayout>
                    </ProtectedRoute>
                  } />

                  <Route path="/classes/:classId/*" element={
                    <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                      <ClassDashboardLayout>
                        <ClassDashboardPage />
                      </ClassDashboardLayout>
                    </ProtectedRoute>
                  } />

                  {/* Teacher/Admin Routes - Contextless/Global */}
                  <Route path="/teacher/*" element={
                    <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                        <ClassDashboardLayout>
                          <Routes>
                            <Route path="pretrazivanje" element={<PretrazivanjePage />} />
                            <Route path="informativka" element={<InformativkaPage />} />
                            <Route path="svjedodzbe" element={<CertificateManagementPage />} />
                            <Route path="zavrsni-radovi" element={<FinalThesisTeacherPage />} />
                            <Route path="kalendar" element={<SkolskiKalendarPage readOnly={true} />} />
                            <Route path="dokumenti" element={<InterniDokumentiPage />} />
                            <Route path="postavke" element={<SettingsPage />} />
                            <Route path="dosje" element={<DigitalniDosjePage />} />
                            
                            {/* Core class shortcuts / redirects */}
                            <Route path="imenik" element={<TeacherRedirectToClass subPath="imenik" />} />
                            <Route path="pregled-rada" element={<TeacherRedirectToClass subPath="pregled-rada" />} />
                            <Route path="work-overview" element={<TeacherRedirectToClass subPath="work-overview" />} />
                            <Route path="dnevnik-rada" element={<TeacherRedirectToClass subPath="dnevnik-rada" />} />
                            <Route path="work-journal" element={<TeacherRedirectToClass subPath="work-journal" />} />
                            <Route path="izostanci" element={<TeacherRedirectToClass subPath="izostanci" />} />
                            <Route path="absences" element={<TeacherRedirectToClass subPath="absences" />} />
                            <Route path="zapisnici" element={<TeacherRedirectToClass subPath="zapisnici" />} />
                            <Route path="minutes" element={<TeacherRedirectToClass subPath="minutes" />} />
                            <Route path="student-dosje" element={<TeacherRedirectToClass subPath="dosje" />} />
                            <Route path="roditeljski-sastanci" element={<TeacherRedirectToClass subPath="roditeljski-sastanci" />} />
                            <Route path="individualni-razgovori" element={<TeacherRedirectToClass subPath="individualni-razgovori" />} />
                            <Route path="dolasci-roditelja" element={<TeacherRedirectToClass subPath="dolasci-roditelja" />} />
                            <Route path="pedagoska-dokumentacija" element={<TeacherRedirectToClass subPath="pedagoska-dokumentacija" />} />
                            <Route path="pedagogical" element={<TeacherRedirectToClass subPath="pedagogical" />} />
                            <Route path="raspored" element={<TeacherRedirectToClass subPath="raspored" />} />
                            <Route path="schedule" element={<TeacherRedirectToClass subPath="schedule" />} />
                            <Route path="admin-razreda" element={<TeacherRedirectToClass subPath="admin" />} />
                            <Route path="administration" element={<TeacherRedirectToClass subPath="administration" />} />

                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </ClassDashboardLayout>
                    </ProtectedRoute>
                  } />
                </>
              )}

              {/* Student/Parent Routes */}
              {(isStudentPortal || portalType === 'staff') && (
                <Route path="/student/*" element={
                  <ProtectedRoute allowedRoles={[Role.STUDENT, Role.PARENT]}>
                    <SelectionGuard role="STUDENT">
                      <ClassDashboardLayout>
                        <Routes>
                          <Route path="ocjene" element={<OcjenePage />} />
                          <Route path="biljeske" element={<BiljeskePage />} />
                          <Route path="ispiti" element={<StudentIspitiPage />} />
                          <Route path="izostanci" element={<IzostanciPage />} />
                          <Route path="raspored" element={<RasporedPage />} />
                          <Route path="osobni-podaci" element={<OsobniPodaciPage />} />
                          <Route path="zavrsni-rad" element={<FinalThesisPage />} />
                          <Route path="kalendar" element={<SkolskiKalendarPage readOnly={true} />} />
                          <Route path="informativka" element={<InformativkaPage />} />
                          <Route path="informatika" element={<Navigate to="/student/informativka" replace />} />
                          <Route path="postavke" element={<SettingsPage />} />
                          <Route path="*" element={<Navigate to="/student/ocjene" replace />} />
                        </Routes>
                      </ClassDashboardLayout>
                    </SelectionGuard>
                  </ProtectedRoute>
                } />
              )}

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SelectionProvider>
    </AuthProvider>
  );
}

function SelectionGuard({ children, role }: { children: React.ReactNode, role: 'STAFF' | 'STUDENT' }) {
  const { 
    selectedSchoolId, 
    selectedClassId, 
    selectedChildId, 
    selectedYearId,
    setSelectedClassId,
    setSelectedSchoolId,
    setSelectedYearId
  } = useSelection();
  const { user, isMainAdmin, isParent } = useAuth();
  const location = window.location.pathname;

  const [loading, setLoading] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Only auto-resolve if role is STUDENT and selectedClassId is NOT set.
    if (role !== 'STUDENT' || selectedClassId) {
      return;
    }

    const targetStudentId = isParent ? selectedChildId : user?.id;
    if (!targetStudentId) {
      return;
    }

    const autoResolve = async () => {
      setLoading(true);
      setErrorText(null);
      try {
        const { data: enrollments, error } = await supabase
          .from('student_class_enrollments')
          .select(`
            id,
            status,
            class_id,
            classes:class_id (
              id,
              name,
              school_id,
              school_year_id
            )
          `)
          .eq('student_id', targetStudentId)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Auto resolve enrollments error:", error);
          setErrorText("Greška pri učitavanju razreda učenika.");
          return;
        }

        if (!enrollments || enrollments.length === 0) {
          setErrorText("Niste upisani ni u jedan razred.");
          return;
        }

        // If only one active enrollment, set it immediately!
        if (enrollments.length === 1) {
          const enroll = enrollments[0];
          const cls = enroll.classes as any;
          if (cls) {
            setSelectedClassId(cls.id);
            setSelectedSchoolId(cls.school_id);
            setSelectedYearId(cls.school_year_id);
          }
        }
      } catch (err: any) {
        console.error("Error in autoResolve:", err);
        setErrorText("Neočekivana greška pri obradi razreda.");
      } finally {
        setLoading(false);
      }
    };

    autoResolve();
  }, [role, selectedClassId, selectedChildId, user, isParent, setSelectedClassId, setSelectedSchoolId, setSelectedYearId]);

  console.log(`[GUARD] Guarding ${location} | Role: ${role}`);

  // Admins can bypass selection guards for browsing
  if (isMainAdmin) {
    console.log('[GUARD] Admin bypass');
    return <>{children}</>;
  }

  if (isParent && !selectedChildId) {
    console.log('[GUARD] Parent missing child selection');
    return <Navigate to="/select-child" replace />;
  }
  
  if (role === 'STAFF' && !selectedSchoolId) {
    console.log('[GUARD] Staff missing school selection');
    return <Navigate to="/select-school" replace />;
  }
  
  if (role === 'STUDENT' && !selectedClassId) {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-[#005c8d]" />
          <p className="mt-4 text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">
            Provjera podataka upisa...
          </p>
        </div>
      );
    }

    if (errorText) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
          <div className="bg-white p-8 max-w-md border border-gray-200 rounded-lg shadow-sm">
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">Upis u razred</h1>
            <p className="text-xs font-bold text-red-600 uppercase tracking-widest mt-4 bg-red-50 py-2.5 px-4 border border-red-100 rounded">
              {errorText}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed mt-4">
              Molimo kontaktirajte školskog administratora ili razrednika za dodjelu u razredni odjel.
            </p>
          </div>
        </div>
      );
    }

    // Checking if they have multiple active enrollments so we didn't auto-resolve
    // We let them go to select-class to make a choice
    if (!selectedSchoolId) {
      console.log('[GUARD] Student missing school selection');
      return <Navigate to="/select-school" replace />;
    }
    console.log('[GUARD] Student missing class selection (multiple active)');
    return <Navigate to="/select-class" replace />;
  }
  
  return <>{children}</>;
}
