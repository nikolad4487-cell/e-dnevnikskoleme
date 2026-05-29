import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, Settings, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { cn, formatPersonName } from '../lib/utils';
import { Role } from '../types';

interface HeaderProps {
  showNav?: boolean;
  hideClass?: boolean;
}

export function Header({ showNav = true, hideClass = false }: HeaderProps) {
  const { user, signOut, formattedRoles, userSchoolRoles } = useAuth();
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
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    console.log("EFFECT RUN: Header HandleClickOutside");
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* useEffect(() => {
    const fetchLabels = async () => {
      let sLabel = '';
      let yLabel = '';
      let cLabel = '';

      if (selectedSchoolId) {
        const { data: sData } = await supabase.from('schools').select('name').eq('id', selectedSchoolId).single();
        if (sData) sLabel = sData.name;
      }
      if (selectedYearId) {
        const { data: yData } = await supabase.from('school_years').select('name').eq('id', selectedYearId).single();
        if (yData) yLabel = yData.name;
      }
      if (selectedClassId) {
         const { data: cData } = await supabase.from('classes').select('name').eq('id', selectedClassId).single();
         if (cData) cLabel = cData.name;
      }

      if (sLabel !== schoolLabel) setSchoolLabel(sLabel);
      if (yLabel !== yearLabel) setYearLabel(yLabel);
      if (cLabel !== classLabel) setClassLabel(cLabel);
    };

    fetchLabels();
  }, [selectedSchoolId, selectedYearId, selectedClassId]); */

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  return (
    <header className="bg-[#005c8d] text-white z-50 h-[50px] flex items-center justify-between px-4">
      {/* Left Structure */}
      <div className="flex items-center gap-6">
        <Link to="/" className="font-black text-lg tracking-tight hover:underline">e-Dnevnik</Link>
        
        {/* Current Context Display */}
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest bg-black/10 px-3 py-1.5 rounded">
           {schoolLabel && <span>{schoolLabel}</span>}
           {yearLabel && <><span className="text-white/30">/</span><span className="text-white/80">{yearLabel}</span></>}
           {!hideClass && classLabel && <><span className="text-white/30">/</span><span className="bg-white text-[#005c8d] px-2 py-0.5 rounded-sm">{classLabel}</span></>}
           
           {!hideClass && showNav && (
             <button 
               onClick={() => navigate('/select-class')} 
               className="ml-4 flex items-center gap-1 hover:bg-white/20 p-1 px-2 rounded transition-colors"
               title="Promijeni razred"
             >
               <Repeat size={14} /> Promijeni
             </button>
           )}
        </div>
      </div>

      {/* User Info Right */}
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
    </header>
  );
}
