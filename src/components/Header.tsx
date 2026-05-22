import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, ChevronDown, Menu as MenuIcon, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Role } from '../types';
import { cn, formatPersonName } from '../lib/utils';

interface NavItem {
  label: string;
  path: string;
}

interface HeaderProps {
  navItems?: NavItem[];
  onMenuToggle?: () => void;
  showNav?: boolean;
}

export function Header({ navItems = [], onMenuToggle, showNav = true }: HeaderProps) {
  const { user, signOut, userSchoolRoles, formattedRoles, isStaff } = useAuth();
  const { selectedSchoolId, selectedClassId, clearSelection } = useSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  const profilePath = isStaff ? "/teacher/postavke" : "/student/postavke";

  return (
    <header className="bg-[#005c8d] text-white z-50 shadow-md flex-shrink-0">
      <div className="max-w-[1400px] mx-auto px-4 h-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showNav && (
            <button 
              className="lg:hidden p-1 hover:bg-[#004a70]"
              onClick={onMenuToggle}
            >
              <MenuIcon size={18} />
            </button>
          )}
          <Link to="/" className="text-base font-bold tracking-tight">e-Dnevnik</Link>
          
          <div className="hidden lg:flex items-center gap-1 ml-6">
             {selectedSchoolId && (
               <button 
                 onClick={() => navigate('/select-school')}
                 className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] font-black uppercase tracking-widest border border-white/20 transition-all active:scale-95"
                 title="Promijeni školu"
               >
                 Škola
               </button>
             )}
             {selectedClassId && (
               <button 
                 onClick={() => navigate('/select-class')}
                 className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] font-black uppercase tracking-widest border border-white/20 transition-all active:scale-95"
                 title="Promijeni razred"
               >
                 Razred
               </button>
             )}
             {userSchoolRoles.some(r => r.role === Role.PARENT) && (
               <button 
                 onClick={() => navigate('/select-child')}
                 className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] font-black uppercase tracking-widest border border-white/20 transition-all active:scale-95"
                 title="Promijeni učenika"
               >
                 Učenik
               </button>
             )}
          </div>
        </div>

        {showNav && navItems.length > 0 && (
          <div className="hidden">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "px-3 h-full flex items-center text-[12px] font-bold uppercase transition-colors",
                  location.pathname.startsWith(item.path) 
                    ? "bg-[#004a70]" 
                    : "hover:bg-[#004a70]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 hover:bg-white/10 px-2 py-1 transition-colors rounded cursor-pointer"
          >
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[11px] font-bold leading-tight">{formatPersonName(user)}</span>
              <span className="text-[9px] text-white/70 uppercase">
                {formattedRoles}
              </span>
            </div>
            <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center sm:hidden">
              <User size={16} />
            </div>
            <ChevronDown size={14} className={cn("transition-transform duration-200", isMenuOpen && "rotate-180")} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-xl rounded py-1 z-[100] animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-2 border-b border-gray-100 sm:hidden text-right">
                <div className="text-[11px] font-bold text-gray-800">{formatPersonName(user)}</div>
                <div className="text-[9px] text-gray-500 uppercase">{formattedRoles}</div>
              </div>
              <Link 
                to={profilePath}
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                id="user-menu-profile"
              >
                <User size={14} className="text-[#005c8d]" />
                Profil
              </Link>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                id="user-menu-logout"
              >
                <LogOut size={14} />
                Odjava
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
