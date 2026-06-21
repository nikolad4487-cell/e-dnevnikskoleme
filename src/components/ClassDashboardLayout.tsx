import React from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Menu, LogOut, Search, Settings, BookOpen, List, ClipboardList, FileText, FileSpreadsheet, Clock, Calendar, Home } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Role } from '../types';
import { cn, formatPersonName } from '../lib/utils';
import { Header } from './Header';

interface NavItem {
  id?: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
}

// TEACHER_NAV is defined dynamically inside ClassDashboardLayout component below

const STUDENT_NAV: NavItem[] = [
  { label: 'Ocjene', path: '/student/ocjene' },
  { label: 'Bilješke', path: '/student/biljeske' },
  { label: 'Ispiti', path: '/student/ispiti' },
  { label: 'Izostanci', path: '/student/izostanci' },
  { label: 'Raspored', path: '/student/raspored' },
  { label: 'Kalendar škole', path: '/student/kalendar' },
  { label: 'Informativka', path: '/student/informativka' },
  { label: 'Završni rad', path: '/student/zavrsni-rad' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Škole', path: '/admin-skole/schools' },
  { label: 'Admin. škole', path: '/admin-skole' },
  { label: 'Razredi', path: '/admin-skole/razredi' },
  { label: 'Korisnici', path: '/admin-skole/korisnici' },
  { label: 'Predmeti', path: '/admin-skole/predmeti' },
];

export function ClassDashboardLayout({ children }: { children: React.ReactNode }) {
  const { classId } = useParams<{ classId: string }>();
  const { user, signOut, userSchoolRoles, isMainAdmin, formattedRoles, isStaff } = useAuth();
  const { selectedSchoolId, selectedClassId, isArchived, clearSelection } = useSelection();
  const effectiveClassId = classId || selectedClassId;
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // isAdminPath is only for the specific /admin/* routes, not /admin-skole/*
  const isAdminPath = location.pathname.startsWith('/admin/') && !location.pathname.startsWith('/admin-skole');

  // Current roles in selected school
  const currentSchoolRoles = (userSchoolRoles || [])
    .filter(r => r && r.schoolId === selectedSchoolId)
    .map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);
  
  // Thesis visibility logic
  const [canAccessThesis, setCanAccessThesis] = React.useState(true);
  React.useEffect(() => {
    if (isAdminPath || !user) return;
    
    const checkAccess = async () => {
        try {
            if (!isStaff) {
                const { data: enrollment, error } = await supabase
                    .from('student_class_enrollments')
                    .select('class_id, student_id, classes:class_id(grade_level, program_id, programs:program_id(duration_years))')
                    .eq('student_id', user.id)
                    .eq('status', 'ACTIVE')
                    .maybeSingle();

                if (error) {
                    console.error('[ClassDashboardLayout] Error checking access:', error.message);
                    setCanAccessThesis(false);
                    return;
                }

                if (enrollment && enrollment.classes) {
                    const rawClazz = enrollment.classes as any;
                    const clazz = Array.isArray(rawClazz) ? rawClazz[0] : rawClazz;
                    if (clazz) {
                        const rawProgram = clazz.programs;
                        const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;
                        const gradeLevel = clazz.grade_level;
                        const durationYears = program?.duration_years;
                        if (gradeLevel && durationYears) {
                           setCanAccessThesis(gradeLevel === durationYears);
                        } else {
                           setCanAccessThesis(false);
                        }
                    } else {
                        setCanAccessThesis(false);
                    }
                } else {
                   setCanAccessThesis(false);
                }
            } else {
                if (effectiveClassId) {
                    const { data: rawClazz, error } = await supabase
                        .from('classes')
                        .select('grade_level, program_id, programs:program_id(duration_years)')
                        .eq('id', effectiveClassId)
                        .maybeSingle();
                    
                    if (error) {
                        console.error('[ClassDashboardLayout] Error checking class thesis access:', error.message);
                        setCanAccessThesis(false);
                        return;
                    }

                    if (rawClazz) {
                        const clazz = Array.isArray(rawClazz) ? rawClazz[0] : rawClazz;
                        const rawProgram = clazz.programs;
                        const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;
                        const gradeLevel = clazz.grade_level;
                        const durationYears = program?.duration_years;
                        if (gradeLevel && durationYears) {
                            setCanAccessThesis(gradeLevel === durationYears);
                        } else {
                            setCanAccessThesis(false);
                        }
                    } else {
                        setCanAccessThesis(false);
                    }
                } else {
                    setCanAccessThesis(true);
                }
            }
        } catch (e) {
            console.error('[ClassDashboardLayout] Critical checkAccess error:', e);
            setCanAccessThesis(false); // fallback to false safely
        }
    };
    checkAccess();
  }, [isStaff, isAdminPath, user, effectiveClassId]);

  const studentNavFiltered = STUDENT_NAV.filter(item => 
      item.label !== 'Završni rad' || canAccessThesis
  );
  
  const classPathPrefix = effectiveClassId ? `/class/${effectiveClassId}` : '';
  let teacherNavList: NavItem[] = effectiveClassId ? [
    { id: 'imenik', label: 'Imenik', path: `${classPathPrefix}/imenik`, icon: <BookOpen size={14} /> },
    { id: 'pregled-rada', label: 'Pregled rada', path: `${classPathPrefix}/pregled-rada`, icon: <List size={14} /> },
    { id: 'dnevnik-rada', label: 'Dnevnik rada', path: `${classPathPrefix}/dnevnik-rada`, icon: <ClipboardList size={14} /> },
    { id: 'izostanci', label: 'Izostanci', path: `${classPathPrefix}/izostanci`, icon: <Clock size={14} /> },
    { id: 'zapisnici', label: 'Zapisnici', path: `${classPathPrefix}/zapisnici`, icon: <FileText size={14} /> },
    { id: 'pedagoska-dokumentacija', label: 'Pedagoška dokumentacija', path: `${classPathPrefix}/pedagoska-dokumentacija`, icon: <FileText size={14} /> },
    { id: 'student-dosje', label: 'Digitalni Dosje', path: '/teacher/student-dosje', icon: <FileText size={14} /> },
    { id: 'zavrsni-rad', label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> },
    { id: 'kalendar-skole', label: 'Kalendar škole', path: '/teacher/kalendar', icon: <Calendar size={14} /> },
    { id: 'dokumenti-skole', label: 'Dokumenti škole', path: '/teacher/dokumenti', icon: <FileText size={14} /> },
    { id: 'raspored', label: 'Raspored', path: `${classPathPrefix}/raspored`, icon: <Calendar size={14} /> },
    { id: 'admin', label: 'Admin razreda', path: `${classPathPrefix}/admin`, icon: <Settings size={14} /> },
    ...(isSchoolAdmin ? [{ id: 'school-admin', label: 'Admin škole', path: '/admin-skole', icon: <Settings size={14} /> }] : [])
  ] : [
    { label: 'Pretraživanje', path: '/teacher/pretrazivanje' },
    { id: 'student-dosje', label: 'Digitalni Dosje', path: '/teacher/dosje', icon: <FileText size={14} /> },
    { id: 'zavrsni-rad', label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> },
    { id: 'kalendar-skole', label: 'Kalendar škole', path: '/teacher/kalendar', icon: <Calendar size={14} /> },
    { id: 'dokumenti-skole', label: 'Dokumenti škole', path: '/teacher/dokumenti', icon: <FileText size={14} /> },
    ...(isSchoolAdmin ? [{ id: 'school-admin', label: 'Admin škole', path: '/admin-skole', icon: <Settings size={14} /> }] : [])
  ];

  teacherNavList = teacherNavList.filter(item => 
      item.id !== 'zavrsni-rad' || canAccessThesis
  );

  const isTabActive = (tabId: string | undefined, itemPath: string) => {
    if (!tabId) return location.pathname.startsWith(itemPath);
    const path = location.pathname;
    if (tabId === 'imenik') {
      return path.includes('/imenik') || path.includes('/biljeske');
    }
    if (tabId === 'pregled-rada') {
      return path.includes('/pregled-rada') || path.includes('/work-overview');
    }
    if (tabId === 'dnevnik-rada') {
      return path.includes('/dnevnik-rada') || path.includes('/work-journal');
    }
    if (tabId === 'izostanci') {
      return path.includes('/izostanci') || path.includes('/absences');
    }
    if (tabId === 'zapisnici') {
      return path.includes('/zapisnici') || path.includes('/minutes');
    }
    if (tabId === 'pedagoska-dokumentacija') {
      return path.includes('/pedagoska-dokumentacija') || path.includes('/pedagogical');
    }
    if (tabId === 'student-dosje') {
      return path.includes('dosje');
    }
    if (tabId === 'zavrsni-rad') {
      return path.includes('zavrsni-radovi');
    }
    if (tabId === 'raspored') {
      return path.includes('/raspored') || path.includes('/schedule');
    }
    if (tabId === 'admin') {
      return path.includes('/admin-razreda') || path.includes('/admin') || path.includes('/administration');
    }
    return path.startsWith(itemPath);
  };

  let navItems = isStaff 
    ? teacherNavList
    : studentNavFiltered;

  if (isAdminPath) {
    navItems = ADMIN_NAV;
  }

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  const [isBurgerOpen, setIsBurgerOpen] = React.useState(false);

  // (Will add burger menu logic later if needed in layout, but for now focus on the structure)

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col font-sans">
      {/* Header */}
      <Header />
      
      {/* Main Teacher Nav (Global) */}
      {isStaff && effectiveClassId && (
        <div className="bg-white border-b border-[#dee2e6] h-14 flex items-center justify-between px-6 shadow-sm z-30">
           <div className="flex items-center gap-1 h-full">
             {teacherNavList.map(tab => (
               <Link
                 key={tab.label}
                 to={tab.path}
                 className={cn(
                   "px-2 xl:px-3 h-full flex items-center gap-1 text-xs font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap cursor-pointer",
                   isTabActive(tab.id, tab.path)
                    ? "border-[#005c8d] text-[#005c8d] bg-sky-50" 
                    : "text-gray-500 border-transparent hover:bg-slate-100 hover:text-slate-900"
                 )}
               >
                 {tab.icon || <div className="w-3.5" />}
                 {tab.label}
               </Link>
             ))}
           </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row">
        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[60] flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="relative w-72 h-full bg-[#005c8d] text-white flex flex-col shadow-xl animate-in slide-in-from-left duration-300">
              <div className="p-4 border-b border-[#004a70] flex items-center justify-between">
                <span className="font-bold uppercase tracking-tight">Izbornik</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 hover:bg-[#004a70]"><LogOut size={20} className="rotate-180" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto py-4">
                <div className="px-4 mb-4">
                  <div className="text-[11px] font-bold leading-tight">{formatPersonName(user)}</div>
                  <div className="text-[9px] text-white/60 uppercase">{formattedRoles}</div>
                </div>

                <nav className="flex flex-col">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "px-4 py-3 text-[12px] font-bold uppercase tracking-wide border-l-4 transition-colors",
                        location.pathname.startsWith(item.path) 
                          ? "bg-[#004a70] border-white" 
                           : "border-transparent hover:bg-[#004a70]"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="p-4 border-t border-[#004a70]">
                <button onClick={handleLogout} className="w-full py-2 bg-red-600/20 hover:bg-red-600/40 text-red-100 rounded text-[10px] font-black uppercase tracking-widest border border-red-500/30">Odjava</button>
              </div>
            </div>
          </div>
        )}

        {/* Student Sidebar (desktop only) */}
        {!isStaff && !isAdminPath && (
          <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col p-4 gap-2">
            {studentNavFiltered.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-[12px] font-bold uppercase tracking-wide rounded-lg transition-colors",
                  location.pathname.startsWith(item.path)
                    ? "bg-blue-50 text-[#005c8d]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {item.label}
              </Link>
            ))}
          </aside>
        )}

        <main className="flex-1 flex flex-col w-full mb-16 md:mb-0">
          <div key={effectiveClassId || 'none'} className="bg-white border-b border-r border-[#005c8d]/20 flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      {(() => {
        const homePath = "/select-class";
        const gradesPath = isStaff 
          ? (effectiveClassId ? `/class/${effectiveClassId}/imenik` : '/teacher/pretrazivanje')
          : '/student/ocjene';
        const schedulePath = isStaff
          ? (effectiveClassId ? `/class/${effectiveClassId}/raspored` : '/teacher/kalendar')
          : '/student/raspored';

        const isHomeActive = location.pathname === '/select-class' || location.pathname === '/select-school' || location.pathname === '/select-child' || location.pathname === '/';
        const isGradesActive = location.pathname.startsWith('/student/ocjene') || location.pathname.includes('/imenik') || location.pathname.includes('/pretrazivanje');
        const isScheduleActive = location.pathname.startsWith('/student/raspored') || location.pathname.includes('/raspored') || location.pathname.includes('/schedule') || location.pathname.includes('/kalendar');

        return (
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#005c8d] text-white flex justify-around items-center h-16 border-t border-[#004a70] z-50 shadow-lg">
            <Link
              to={homePath}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-colors",
                isHomeActive ? "bg-[#004a70] font-black" : "opacity-80"
              )}
            >
              <Home size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Početna</span>
            </Link>

            <Link
              to={gradesPath}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-colors",
                isGradesActive ? "bg-[#004a70] font-black" : "opacity-80"
              )}
            >
              <BookOpen size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">{isStaff ? "Imenik" : "Ocjene"}</span>
            </Link>

            <Link
              to={schedulePath}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-colors",
                isScheduleActive ? "bg-[#004a70] font-black" : "opacity-80"
              )}
            >
              <Calendar size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Raspored</span>
            </Link>

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-colors cursor-pointer"
            >
              <Menu size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Više</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
