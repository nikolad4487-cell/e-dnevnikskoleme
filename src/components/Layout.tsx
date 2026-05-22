import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, LogOut, User as UserIcon, Bell, Search, Info, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Role } from '../types';
import { cn, formatPersonName } from '../lib/utils';
import { Header } from './Header';

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const TEACHER_NAV: NavItem[] = [
  { label: 'Imenik', path: '/teacher/imenik' },
  { label: 'Dnevnik rada', path: '/teacher/dnevnik-rada' },
  { label: 'Zapisnici', path: '/teacher/zapisnici' },
  { label: 'Izvještaji', path: '/teacher/izvjestaji' },
  { label: 'Informativka', path: '/teacher/informativka' },
  { label: 'Pedagoška dokumentacija', path: '/teacher/pedagoska-dokumentacija' },
  { label: 'Administracija', path: '/admin/school-dashboard' },
  { label: 'Pretraživanje', path: '/teacher/pretrazivanje' },
];

const STUDENT_NAV: NavItem[] = [
  { label: 'Ocjene', path: '/student/ocjene' },
  { label: 'Bilješke', path: '/student/biljeske' },
  { label: 'Ispiti', path: '/student/ispiti' },
  { label: 'Izostanci', path: '/student/izostanci' },
  { label: 'Raspored', path: '/student/raspored' },
  { label: 'Informativka', path: '/student/informativka' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Škole', path: '/admin/schools' },
  { label: 'Administracija', path: '/admin/school-dashboard' },
  { label: 'Razredi', path: '/admin/razredi' },
  { label: 'Korisnici', path: '/admin/korisnici' },
  { label: 'Predmeti', path: '/admin/predmeti' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, userSchoolRoles, isMainAdmin, formattedRoles, isStaff } = useAuth();
  const { selectedSchoolId, selectedClassId, isArchived, clearSelection } = useSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const isAdminPath = location.pathname.startsWith('/admin');

  // Current roles in selected school
  const currentSchoolRoles = userSchoolRoles.filter(r => r.schoolId === selectedSchoolId).map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);
  
  let navItems = isStaff 
    ? TEACHER_NAV.filter(item => {
        if (item.path === '/admin/school-dashboard') return isSchoolAdmin;
        return true;
      })
    : STUDENT_NAV;

  if (isAdminPath) {
    navItems = ADMIN_NAV;
  }

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  const handleSwitch = () => {
    if (isStaff) {
      navigate('/select-school');
    } else {
      navigate('/select-class');
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col font-sans">
      {/* Header */}
      <Header 
        navItems={navItems} 
        onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
      />

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

              <div className="mt-8 border-t border-[#004a70] pt-4">
                <div className="px-4 text-[10px] font-black uppercase text-white/40 mb-2 tracking-widest">Brza promjena</div>
                {selectedSchoolId && (
                  <button onClick={() => { navigate('/select-school'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-[#004a70] text-[11px] font-bold uppercase tracking-wider">Promijeni školu</button>
                )}
                {selectedClassId && (
                  <button onClick={() => { navigate('/select-class'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-[#004a70] text-[11px] font-bold uppercase tracking-wider">Promijeni razred</button>
                )}
                {userSchoolRoles.some(r => r.role === Role.PARENT) && (
                  <button onClick={() => { navigate('/select-child'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-[#004a70] text-[11px] font-bold uppercase tracking-wider">Promijeni učenika</button>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#004a70]">
              <button onClick={handleLogout} className="w-full py-2 bg-red-600/20 hover:bg-red-600/40 text-red-100 rounded text-[10px] font-black uppercase tracking-widest border border-red-500/30">Odjava</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto p-3 lg:p-4 mb-16 lg:mb-0">
        <div className="bg-white border border-gray-300 flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </main>

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
