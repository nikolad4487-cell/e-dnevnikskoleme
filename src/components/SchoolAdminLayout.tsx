import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { cn, formatPersonName } from '../lib/utils';
import { Header } from './Header';

interface NavItem {
  id?: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Škole', path: '/admin-skole/schools' },
  { label: 'Admin. škole', path: '/admin-skole' },
  { label: 'Razredi', path: '/admin-skole/razredi' },
  { label: 'Zamjene', path: '/admin-skole/zamjene' },
  { label: 'Korisnici', path: '/admin-skole/korisnici' },
  { label: 'Predmeti', path: '/admin-skole/predmeti' },
  { label: 'Raspored', path: '/admin-skole/raspored' },
];

export function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, formattedRoles } = useAuth();
  const { clearSelection } = useSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin-skole') {
      return location.pathname === '/admin-skole';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col font-sans">
      <Header showNav={false} hideClass={true} />
      
      <div className="bg-white border-b border-[#dee2e6] h-14 flex items-center justify-between px-6 shadow-sm z-30">
        <div className="flex items-center gap-1 h-full">
          {ADMIN_NAV.map(tab => (
            <Link
              key={tab.label}
              to={tab.path}
              className={cn(
                "px-5 h-full flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap cursor-pointer",
                isActive(tab.path)
                  ? "border-[#005c8d] text-[#005c8d] bg-sky-50" 
                  : "text-gray-500 border-transparent hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

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
                {ADMIN_NAV.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "px-4 py-3 text-[12px] font-bold uppercase tracking-wide border-l-4 transition-colors",
                      isActive(item.path)
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

      <main className="flex-1 flex flex-col w-full mb-16 lg:mb-0 min-h-0 bg-white">
        {children}
      </main>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#005c8d] text-white flex justify-around items-center h-16 border-t border-[#004a70] z-50">
        {ADMIN_NAV.slice(0, 5).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-1",
              isActive(item.path) ? "bg-[#004a70]" : ""
            )}
          >
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
