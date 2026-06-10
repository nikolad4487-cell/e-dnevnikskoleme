import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, Settings, Repeat, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { cn, formatPersonName } from '../lib/utils';
import { Role, Notification } from '../types';
import { getPortalConfig } from '../lib/portal';

interface HeaderProps {
  showNav?: boolean;
  hideClass?: boolean;
}

export function Header({ showNav = true, hideClass = false }: HeaderProps) {
  const portal = getPortalConfig();
  const { user, signOut, formattedRoles, userSchoolRoles, isStudent, isParent } = useAuth();
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

  const isSchoolAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/admin-skole');
  const finalHideClass = hideClass || isSchoolAdminRoute;
  
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
    
    return () => {
      // Notifications are currently disabled, so there is no realtime
      // channel to unsubscribe from during layout switches.
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

      if (selectedSchoolId) {
        const { data: sData } = await supabase.from('schools').select('name').eq('id', selectedSchoolId).single();
        if (sData && isMounted) sLabel = sData.name;
      }
      if (selectedYearId) {
        const { data: yData } = await supabase.from('school_years').select('name').eq('id', selectedYearId).single();
        if (yData && isMounted) yLabel = yData.name;
      }
      if (selectedClassId) {
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
  }, [selectedSchoolId, selectedYearId, selectedClassId]);

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  return (
    <header className="bg-[#005c8d] text-white z-50 h-[50px] flex items-center justify-between px-4">
      {/* Left Structure */}
      <div className="flex items-center gap-6">
        <Link to={portal.homePath} className="font-black text-lg tracking-tight hover:underline">{portal.shortTitle}</Link>
        
        {/* Current Context Display */}
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest bg-black/10 px-3 py-1.5 rounded">
           {schoolLabel && <span>{schoolLabel}</span>}
           {yearLabel && <><span className="text-white/30">|</span><span className="text-white/80">{yearLabel}</span></>}
           {!finalHideClass && classLabel && <><span className="text-white/30">|</span><span className="bg-white text-[#005c8d] px-2 py-0.5 rounded-sm font-black">{classLabel}</span></>}
           
           {!finalHideClass && showNav && (
             <>
               <span className="text-white/30">|</span>
               <button 
                 onClick={() => navigate('/select-class')} 
                 className="flex items-center gap-1 hover:bg-white/20 p-1 px-2 rounded transition-colors text-[10px]"
                 title="Promijeni razred"
               >
                 <Repeat size={12} /> Promijeni
               </button>
             </>
           )}
        </div>
      </div>

      {/* User Info Right */}
      <div className="flex items-center gap-4 relative">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 relative"
          >
            <Bell size={18} />
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#005c8d]"></span>
            )}
          </button>
          
          {isNotifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white text-gray-800 border border-gray-200 shadow-xl rounded py-2 z-[100] animate-in fade-in zoom-in-95 duration-100 max-h-[400px] overflow-y-auto">
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

        <div className="flex items-center gap-4 relative" ref={menuRef}>
          <div className="text-right">
               <div className="text-[12px] font-bold leading-tight">{formatPersonName(user)}</div>
               <div className="text-[10px] text-white/70 uppercase">{formattedRoles}</div>
          </div>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"
          >
            <User size={18} />
          </button>

          {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-white text-gray-800 border border-gray-200 shadow-xl rounded py-1 z-[100] animate-in fade-in zoom-in-95 duration-100">
            {(isStudent || isParent) && (
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/student/osobni-podaci');
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-slate-50 transition-colors border-b border-gray-100"
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
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-slate-50 transition-colors border-b border-gray-100"
            >
              <Settings size={14} />
              Postavke
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
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
