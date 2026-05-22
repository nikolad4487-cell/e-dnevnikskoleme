import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ShieldAlert, Users } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SelectionProvider, useSelection } from './contexts/SelectionContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import InactivityTracker from './components/InactivityTracker';
import { Role } from './types';

// Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SchoolSelectionPage = lazy(() => import('./pages/SchoolSelectionPage'));
const ClassSelectionPage = lazy(() => import('./pages/ClassSelectionPage'));
const ChildSelectionPage = lazy(() => import('./pages/ChildSelectionPage'));

const DashboardRedirect = () => {
  const { user, userSchoolRoles, isStaff, isStudent, isParent, isMainAdmin, loading, error, signOut } = useAuth();
  const { selectedSchoolId, selectedClassId, selectedChildId } = useSelection();
  const location = useLocation();

  useEffect(() => {
    console.count('[DASHBOARD] DashboardRedirect Render');
    console.log('[DASHBOARD] State check:', {
      user: user?.email,
      rolesCount: userSchoolRoles.length,
      loading,
      error: !!error,
      selection: { selectedSchoolId, selectedClassId, selectedChildId }
    });

    // Safety timeout removed in favor of AuthContext handled timeouts
    return () => {};
  }, [user, userSchoolRoles, loading, error, selectedSchoolId, selectedClassId, selectedChildId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Učitavanje podataka...</h2>
          <p className="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-tighter leading-none">Provjera ovlaštenja sustava e-Dnevnik</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('[DASHBOARD] Failed to load dashboard:', { error });
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 font-sans">
        <div className="bg-white p-12 border border-gray-300 max-w-md shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={24} strokeWidth={3} />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-2 tracking-tighter uppercase leading-none">
            Greška pri učitavanju
          </h1>
          <p className="text-[12px] text-slate-600 mb-8 leading-relaxed font-bold bg-red-50 p-4 border border-red-100">
            {error || 'Sustav se ne uspijeva povezati. Provjerite internetsku vezu i pokušajte ponovno.'}
          </p>
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#005c8d] text-white py-3 border border-[#004a71] font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-all"
            >
              Pokušaj ponovno
            </button>
            <button 
              onClick={() => signOut()} 
              className="w-full text-slate-400 font-bold uppercase tracking-[0.2em] text-[9px] hover:text-[#005c8d] py-2 transition-colors"
            >
              Odjava
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  
  if (user?.requiresAuthenticatorSetup && isStaff) {
    if (location.pathname === '/auth/setup-authenticator') return null;
    return <Navigate to="/auth/setup-authenticator" replace />;
  }

  const roleNames = userSchoolRoles.map(r => r.role);
  const hasAdminRole = roleNames.includes(Role.MAIN_ADMIN) || roleNames.includes(Role.ADMIN) || roleNames.includes(Role.SCHOOL_ADMIN);
  const hasTeacherRole = roleNames.includes(Role.TEACHER) || roleNames.includes(Role.HOMEROOM) || roleNames.includes(Role.DEPUTY);
  const hasStudentRole = roleNames.includes(Role.STUDENT);
  const hasParentRole = roleNames.includes(Role.PARENT);

  if (userSchoolRoles.length === 0 && !hasAdminRole && !hasTeacherRole && !hasStudentRole && !isParent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 font-sans">
        <div className="bg-white p-12 border border-gray-300 max-w-md shadow-sm">
          <h1 className="text-xl font-black text-slate-900 mb-4 tracking-tighter uppercase leading-none">Nema uloga</h1>
          <p className="text-[12px] text-slate-600 mb-8 font-bold">Korisnik nema dodijeljenu ulogu u sustavu.</p>
          <button onClick={() => signOut()} className="w-full bg-[#005c8d] text-white py-3 font-black uppercase text-[10px]">Odjava</button>
        </div>
      </div>
    );
  }

  // Final dashboard redirects with route matching check
  if (isParent && !isStaff && !selectedChildId) {
    if (location.pathname === '/select-child') return null; 
    return <Navigate to="/select-child" replace />;
  }

  if (!selectedSchoolId) {
    if (isMainAdmin) {
      if (location.pathname === '/admin/schools') return null;
      return <Navigate to="/admin/schools" replace />;
    }
    if (location.pathname === '/select-school') return null;
    return <Navigate to="/select-school" replace />;
  }

  if (!selectedClassId && (isStaff || isStudent)) {
    if (location.pathname === '/select-class') return null;
    return <Navigate to="/select-class" replace />;
  }

  if (isStaff) {
    const target = `/class/${selectedClassId || 'missing'}`;
    if (location.pathname.startsWith('/class/')) return null;
    return <Navigate to={target} replace />;
  }

  if (isStudent || isParent) {
    if (location.pathname.startsWith('/student/')) return null;
    return <Navigate to="/student/ocjene" replace />;
  }

  return <Navigate to="/login" replace />;
};

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

// Shared
const InformativkaPage = lazy(() => import('./pages/shared/InformativkaPage'));
const InformativkaAdminPage = lazy(() => import('./pages/admin/InformativkaAdminPage'));
const SettingsPage = lazy(() => import('./pages/shared/SettingsPage'));
const AuthenticatorSetupPage = lazy(() => import('./pages/auth/AuthenticatorSetupPage'));

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

const ClassDashboardPage = lazy(() => import('./pages/teacher/ClassDashboardPage'));

const APP_VERSION = '1.0.5';

export default function App() {
  const location = (window as any).location?.pathname || 'unknown';
  console.log(`[APP] Render | Path: ${location}`);
  
  if (typeof window !== 'undefined') {
    (window as any).__renderCount = ((window as any).__renderCount || 0) + 1;
    if ((window as any).__renderCount > 100) {
      console.error('CRITICAL: Infinite render loop detected (>100 renders). Stopping auto-reload logic.');
    }
  }

  useEffect(() => {
    console.log('[APP] Mounted');
  }, []);

  return (
    <AuthProvider>
      <SelectionProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          {/* InactivityTracker disabled temporarily to prevent loops */}
          {/* <InactivityTracker /> */}
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen font-sans">Učitavanje...</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/setup-authenticator" element={
                <ProtectedRoute>
                  <AuthenticatorSetupPage />
                </ProtectedRoute>
              } />
              
              <Route path="/select-school" element={
                <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN, Role.STUDENT, Role.PARENT]}>
                  <SchoolSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/select-class" element={
                <ProtectedRoute allowedRoles={[Role.STUDENT, Role.PARENT, Role.MAIN_ADMIN, Role.TEACHER, Role.ADMIN, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY]}>
                  <ClassSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/select-child" element={
                <ProtectedRoute allowedRoles={[Role.PARENT, Role.MAIN_ADMIN]}>
                  <ChildSelectionPage />
                </ProtectedRoute>
              } />

              <Route path="/" element={
                <ProtectedRoute>
                  <DashboardRedirect />
                </ProtectedRoute>
              } />

              {/* Admin Routes */}
              <Route path="/admin/*" element={
                <ProtectedRoute allowedRoles={[Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                  <Layout>
                    <Routes>
                      <Route path="schools" element={<SchoolsManagementPage />} />
                      <Route path="school-dashboard" element={<AdministrationPage />} />
                      <Route path="razredi" element={<ClassManagementPage />} />
                      <Route path="razred-predmeti" element={<ClassSubjectsPage />} />
                      <Route path="razred-ucenici" element={<ClassStudentsPage />} />
                      <Route path="student-predmeti" element={<StudentSubjectEnrollmentPage />} />
                      <Route path="raspored" element={<ScheduleManagementPage />} />
                      <Route path="informativka" element={<InformativkaAdminPage />} />
                      <Route path="korisnici" element={<UserManagementPage />} />
                      <Route path="predmeti" element={<SubjectManagementPage />} />
                      <Route path="*" element={<Navigate to="/admin/schools" replace />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              } />

              <Route path="/class/:classId/*" element={
                <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                  <Layout>
                    <ClassDashboardPage />
                  </Layout>
                </ProtectedRoute>
              } />

              {/* Teacher/Admin Routes - Contextless/Global */}
              <Route path="/teacher/*" element={
                <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                    <Layout>
                      <Routes>
                        <Route path="pretrazivanje" element={<PretrazivanjePage />} />
                        <Route path="informativka" element={<InformativkaPage />} />
                        <Route path="pedagoska-dokumentacija" element={<PedagoskaDokumentacijaPage />} />
                        <Route path="svjedodzbe" element={<CertificateManagementPage />} />
                        <Route path="postavke" element={<SettingsPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                </ProtectedRoute>
              } />

              {/* Student/Parent Routes */}
              <Route path="/student/*" element={
                <ProtectedRoute allowedRoles={[Role.STUDENT, Role.PARENT]}>
                  <SelectionGuard role="STUDENT">
                    <Layout>
                      <Routes>
                        <Route path="ocjene" element={<OcjenePage />} />
                        <Route path="biljeske" element={<BiljeskePage />} />
                        <Route path="ispiti" element={<StudentIspitiPage />} />
                        <Route path="izostanci" element={<IzostanciPage />} />
                        <Route path="raspored" element={<RasporedPage />} />
                        <Route path="informativka" element={<InformativkaPage />} />
                        <Route path="informatika" element={<Navigate to="/student/informativka" replace />} />
                        <Route path="postavke" element={<SettingsPage />} />
                        <Route path="*" element={<Navigate to="/student/ocjene" replace />} />
                      </Routes>
                    </Layout>
                  </SelectionGuard>
                </ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SelectionProvider>
    </AuthProvider>
  );
}

function SelectionGuard({ children, role }: { children: React.ReactNode, role: 'STAFF' | 'STUDENT' }) {
  const { selectedSchoolId, selectedClassId, selectedChildId } = useSelection();
  const { isMainAdmin, isParent } = useAuth();
  const location = window.location.pathname;
  
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
    if (!selectedSchoolId) {
      console.log('[GUARD] Student missing school selection');
      return <Navigate to="/select-school" replace />;
    }
    console.log('[GUARD] Student missing class selection');
    return <Navigate to="/select-class" replace />;
  }
  
  return <>{children}</>;
}
