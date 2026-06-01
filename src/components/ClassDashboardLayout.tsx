import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, LogOut, Search, Settings, BookOpen, List, ClipboardList, FileText, FileSpreadsheet, Clock, Calendar } from 'lucide-react';
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
  { label: 'Informativka', path: '/student/informativka' },
  { label: 'Osobni podaci', path: '/student/osobni-podaci' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Škole', path: '/admin-skole/schools' },
  { label: 'Admin. škole', path: '/admin-skole' },
  { label: 'Razredi', path: '/admin-skole/razredi' },
  { label: 'Korisnici', path: '/admin-skole/korisnici' },
  { label: 'Predmeti', path: '/admin-skole/predmeti' },
];

export function ClassDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, userSchoolRoles, isMainAdmin, formattedRoles, isStaff } = useAuth();
  const { selectedSchoolId, selectedClassId, isArchived, clearSelection } = useSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // isAdminPath is only for the specific /admin/* routes, not /admin-skole/*
  const isAdminPath = location.pathname.startsWith('/admin/') && !location.pathname.startsWith('/admin-skole');

  // Current roles in selected school
  const currentSchoolRoles = userSchoolRoles.filter(r => r.schoolId === selectedSchoolId).map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);
  
  const classPathPrefix = selectedClassId ? `/class/${selectedClassId}` : '';
  const teacherNavList: NavItem[] = selectedClassId ? [
    { id: 'imenik', label: 'Imenik', path: `${classPathPrefix}/imenik`, icon: <BookOpen size={14} /> },
    { id: 'pregled-rada', label: 'Pregled rada', path: `${classPathPrefix}/pregled-rada`, icon: <List size={14} /> },
    { id: 'dnevnik-rada', label: 'Dnevnik rada', path: `${classPathPrefix}/dnevnik-rada`, icon: <ClipboardList size={14} /> },
    { id: 'izostanci', label: 'Izostanci', path: `${classPathPrefix}/izostanci`, icon: <Clock size={14} /> },
    { id: 'zapisnici', label: 'Zapisnici', path: `${classPathPrefix}/zapisnici`, icon: <FileText size={14} /> },
    { id: 'pedagoska-dokumentacija', label: 'Pedagoška dokumentacija', path: `${classPathPrefix}/pedagoska-dokumentacija`, icon: <FileText size={14} /> },
    { id: 'raspored', label: 'Raspored', path: `${classPathPrefix}/raspored`, icon: <Calendar size={14} /> },
    { id: 'admin', label: 'Admin razreda', path: `${classPathPrefix}/admin`, icon: <Settings size={14} /> },
    ...(isSchoolAdmin ? [{ id: 'school-admin', label: 'Admin škole', path: '/admin-skole', icon: <Settings size={14} /> }] : [])
  ] : [
    { label: 'Pretraživanje', path: '/teacher/pretrazivanje' },
    ...(isSchoolAdmin ? [{ id: 'school-admin', label: 'Admin škole', path: '/admin-skole', icon: <Settings size={14} /> }] : [])
  ];

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
    : STUDENT_NAV;

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
      {isStaff && selectedClassId && (
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
          <div className="lg:hidden fixed inset-0 z-[60] flex">
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
          <aside className="w-64 bg-white border-r border-gray-200 hidden lg:flex flex-col p-4 gap-2">
            {STUDENT_NAV.map((item) => (
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

        <main className="flex-1 flex flex-col w-full mb-16 lg:mb-0">
          <div key={selectedClassId || 'none'} className="bg-white border-b border-r border-[#005c8d]/20 flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#005c8d] text-white flex justify-around items-center h-16 border-t border-[#004a70] z-50">
        {navItems.slice(0, 5).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-1",
              location.pathname.startsWith(item.path) ? "bg-[#004a70]" : ""
            )}
          >
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
