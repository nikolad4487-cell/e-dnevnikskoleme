import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ShieldAlert, Users } from 'lucide-react';
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
const SchoolYearsPage = lazy(() => import('./pages/admin/SchoolYearsPage'));
const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const ProgramsPage = lazy(() => import('./pages/admin/ProgramsPage'));
const RolloverPage = lazy(() => import('./pages/admin/RolloverPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

const ClassDashboardPage = lazy(() => import('./pages/teacher/ClassDashboardPage'));

function TeacherRedirectToClass({ subPath }: { subPath: string }) {
  const { selectedClassId } = useSelection();
  if (!selectedClassId) {
    return <Navigate to="/select-class" replace />;
  }
  return <Navigate to={`/class/${selectedClassId}/${subPath}`} replace />;
}

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
                  <Navigate to="/select-class" replace />
                </ProtectedRoute>
              } />

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
                      <Route path="razredi" element={<ClassManagementPage />} />
                      <Route path="korisnici" element={<UserManagementPage />} />
                      <Route path="ucenici" element={<StudentsPage />} />
                      <Route path="predmeti" element={<SubjectManagementPage />} />
                      <Route path="programi" element={<ProgramsPage />} />
                      <Route path="rollover" element={<RolloverPage />} />
                      <Route path="postavke" element={<AdminSettingsPage />} />
                      <Route path="raspored" element={<ScheduleManagementPage />} />
                      <Route path="informativka" element={<InformativkaAdminPage />} />
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

              {/* Teacher/Admin Routes - Contextless/Global */}
              <Route path="/teacher/*" element={
                <ProtectedRoute allowedRoles={[Role.TEACHER, Role.ADMIN, Role.MAIN_ADMIN, Role.SCHOOL_ADMIN]}>
                    <ClassDashboardLayout>
                      <Routes>
                        <Route path="pretrazivanje" element={<PretrazivanjePage />} />
                        <Route path="informativka" element={<InformativkaPage />} />
                        <Route path="svjedodzbe" element={<CertificateManagementPage />} />
                        <Route path="postavke" element={<SettingsPage />} />
                        
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

              {/* Student/Parent Routes */}
              <Route path="/student/*" element={
                <ProtectedRoute allowedRoles={[Role.STUDENT, Role.PARENT]}>
                  <SelectionGuard role="STUDENT">
                    <BasicLayout>
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
                    </BasicLayout>
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
