import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, Settings, Repeat, Bell, Building2, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { cn, formatPersonName } from '../lib/utils';
import { Role, Notification, isSchoolAdminUser, isSuperAdminUser } from '../types';

interface HeaderProps {
  showNav?: boolean;
  hideClass?: boolean;
}

export function Header({ showNav = true, hideClass = false }: HeaderProps) {
  const { user, signOut, formattedRoles, userSchoolRoles, isStudent, isParent, isSuperAdmin: authIsSuperAdmin, isSchoolAdmin: authIsSchoolAdmin } = useAuth();
  const { 
    selectedSchoolId, 
    selectedYearId, 
    selectedClassId, 
    clearSelection
  } = useSelection();
  
  const [schoolLabel, setSchoolLabel] = useState('');
  const [yearLabel, setYearLabel] = useState('');
  const [classLabel, setClassLabel] = useState('');
  
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isClassSelectionPage = location.pathname === '/select-class';
  const isSchoolSelectionPage = location.pathname === '/select-school' || location.pathname === '/admin/schools';
  const hideContextLabels = isSchoolSelectionPage;
  const isSchoolAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/admin-skole');
  const finalHideClass = hideClass || isSchoolAdminRoute || isClassSelectionPage;
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      // Temporarily disabled to avoid 404s missing table
      const data = [];
      if (data) {
        setNotifications(data as Notification[]);
      }
    };
    
    fetchNotifications();
    
    const notifSub = { unsubscribe: () => {} };
      
    return () => {
      supabase.removeChannel(notifSub as any);
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    // await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  useEffect(() => {
    let isMounted = true;
    const fetchLabels = async () => {
      let sLabel = '';
      let yLabel = '';
      let cLabel = '';

      if (selectedSchoolId && !hideContextLabels) {
        const { data: sData } = await supabase.from('schools').select('name').eq('id', selectedSchoolId).single();
        if (sData && isMounted) sLabel = sData.name;
      }
      if (selectedYearId && !hideContextLabels && !isClassSelectionPage) {
        const { data: yData } = await supabase.from('school_years').select('name').eq('id', selectedYearId).single();
        if (yData && isMounted) yLabel = yData.name;
      }
      if (selectedClassId && !hideContextLabels && !isClassSelectionPage) {
         const { data: cData } = await supabase.from('classes').select('name, school_year').eq('id', selectedClassId).single();
         if (cData && isMounted) {
           cLabel = cData.name;
           if (!yLabel && cData.school_year) {
             yLabel = cData.school_year;
           }
         }
      }

      if (isMounted) {
        setSchoolLabel(sLabel);
        setYearLabel(yLabel);
        setClassLabel(cLabel);
      }
    };

    fetchLabels();
    return () => {
      isMounted = false;
    };
  }, [selectedSchoolId, selectedYearId, selectedClassId, location.pathname, hideContextLabels, isClassSelectionPage]);

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  return (
    <header className="bg-[#005c8d] text-white z-50 h-[44px] lg:h-[50px] flex items-center justify-between px-3 lg:px-4 sticky top-0 shadow-md">
      {/* Left Structure */}
      <div className="flex items-center gap-2 lg:gap-4 min-w-0">
        <Link to="/" className="font-black text-sm lg:text-lg tracking-tight hover:opacity-95 transition-opacity shrink-0">e-Dnevnik</Link>
        
        {/* Current Context Display */}
        {!hideContextLabels && (schoolLabel || classLabel) && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-0 lg:gap-2 bg-black/10 px-2 lg:px-3 py-0.5 lg:py-1.5 rounded transition-all min-w-0 max-w-[140px] sm:max-w-[260px] md:max-w-md lg:max-w-none">
             {schoolLabel && (
               <span className="text-[9px] lg:text-[11px] font-black uppercase tracking-wider lg:tracking-widest leading-tight lg:leading-normal truncate lg:overflow-visible block max-h-[22px] lg:max-h-none line-clamp-2" title={schoolLabel}>
                 {schoolLabel}
               </span>
             )}
             {yearLabel && <span className="text-white/30 hidden lg:inline">|</span>}
             {yearLabel && <span className="text-white/80 text-[10px] hidden lg:inline">{yearLabel}</span>}
             {!finalHideClass && classLabel && (
               <div className="flex items-center gap-1 shrink-0">
                 <span className="text-white/30 hidden lg:inline">|</span>
                 <span className="bg-white text-[#005c8d] px-1 lg:px-2 py-0.5 rounded-sm font-black text-[8px] lg:text-[10px]">{classLabel}</span>
               </div>
             )}
             
             {!finalHideClass && showNav && (
               <>
                 <span className="text-white/30 hidden lg:inline">|</span>
                 <button 
                   onClick={() => navigate('/select-class')} 
                   className="hidden lg:flex items-center gap-1 hover:bg-white/20 p-1 px-2 rounded transition-colors text-[10px]"
                   title="Promijeni razred"
                 >
                   <Repeat size={12} /> Promijeni
                 </button>
               </>
             )}
          </div>
        )}
      </div>


      {/* User Info Right */}
      <div className="flex items-center gap-1.5 lg:gap-4 relative shrink-0">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="w-[44px] h-[44px] lg:w-8 lg:h-8 rounded-full bg-white/0 lg:bg-white/20 flex items-center justify-center hover:bg-white/10 lg:hover:bg-white/30 relative"
          >
            <Bell size={18} />
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span className="absolute top-2 right-2 lg:top-0 lg:right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#005c8d]"></span>
            )}
          </button>
          
          {isNotifOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white text-gray-800 border border-gray-200 shadow-xl rounded py-2 z-[100] animate-in fade-in zoom-in-95 duration-100 max-h-[350px] overflow-y-auto">
              <div className="px-4 pb-2 border-b border-gray-100 font-bold text-sm">Obavijesti</div>
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-500">Nema novih obavijesti.</div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={cn("px-4 py-3 border-b border-gray-50 text-sm hover:bg-slate-50 cursor-pointer", n.is_read ? 'opacity-70' : 'bg-blue-50/30')} onClick={() => {
                    markAsRead(n.id);
                    if (n.link) navigate(n.link);
                    setIsNotifOpen(false);
                  }}>
                    <div className="font-semibold text-gray-800">{n.title}</div>
                    <div className="text-gray-600 text-xs mt-0.5 line-clamp-2">{n.message}</div>
                    <div className="text-gray-400 text-[10px] mt-1">{new Date(n.created_at).toLocaleDateString('hr-HR')}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 lg:gap-4 relative" ref={menuRef}>
          <div className="text-right hidden lg:block">
               <div className="text-[12px] font-bold leading-tight">{formatPersonName(user)}</div>
               <div className="text-[10px] text-white/70 uppercase">{formattedRoles}</div>
          </div>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-[44px] h-[44px] lg:w-8 lg:h-8 rounded-full bg-white/0 lg:bg-white/20 flex items-center justify-center hover:bg-white/10 lg:hover:bg-white/30"
          >
            <User size={18} />
          </button>

          {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-white text-gray-800 border border-gray-200 shadow-xl rounded py-1 z-[100] animate-in fade-in zoom-in-95 duration-100">
            {isSuperAdminUser(user, userSchoolRoles) && (
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/admin/schools');
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors border-b border-gray-100 min-h-[44px]"
              >
                <Shield size={14} className="text-[#005c8d]" />
                Administracija sustava
              </button>
            )}
            {isSchoolAdminUser(user, userSchoolRoles) && (
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/admin-skole');
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#005c8d] hover:bg-slate-50 transition-colors border-b border-gray-100 min-h-[44px]"
              >
                <Building2 size={14} className="text-[#005c8d]" />
                Administracija škole
              </button>
            )}
            {(isStudent || isParent) && (
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/student/osobni-podaci');
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-slate-50 transition-colors border-b border-gray-100 min-h-[44px]"
              >
                <User size={14} />
                Osobni podaci
              </button>
            )}
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                const isStudentOrParent = !userSchoolRoles.some(r => 
                  [Role.MAIN_ADMIN, Role.ADMIN, Role.SCHOOL_ADMIN, Role.TEACHER, Role.HOMEROOM, Role.DEPUTY].includes(r.role as Role)
                );
                if (isStudentOrParent) {
                  navigate('/student/postavke');
                } else {
                  navigate('/teacher/postavke');
                }
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-slate-50 transition-colors border-b border-gray-100 min-h-[44px]"
            >
              <Settings size={14} />
              Postavke
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors min-h-[44px]"
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
