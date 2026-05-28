import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, ChevronDown, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { cn, formatPersonName } from '../lib/utils';
import { Role } from '../types';

export function Header() {
  const { user, signOut, formattedRoles, userSchoolRoles } = useAuth();
  const { 
    selectedSchoolId, 
    selectedYearId, 
    selectedClassId, 
    setSelectedSchoolId, 
    setSelectedYearId, 
    setSelectedClassId,
    clearSelection
  } = useSelection();
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSchoolMenuOpen, setIsSchoolMenuOpen] = useState(false);
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
  const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const selectedSchool = schools.find(s => s.id === selectedSchoolId);
  const selectedYear = schoolYears.find(y => y.id === selectedYearId);
  const selectedClass = classes.find(c => c.id === selectedClassId);

  useEffect(() => {
    // 1. Fetch User Schools
    const fetchSchools = async () => {
      const { data } = await supabase.from('schools').select('*');
      if (data) setSchools(data);
    };
    fetchSchools();
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setIsSchoolMenuOpen(false);
        setIsYearMenuOpen(false);
        setIsClassMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      // Fetch years
      const fetchYears = async () => {
        const { data } = await supabase.from('school_years')
          .select('*')
          .eq('school_id', selectedSchoolId)
          .order('starts_at', { ascending: false });
        if (data) setSchoolYears(data);
      };
      fetchYears();
    } else {
      setSchoolYears([]);
    }
  }, [selectedSchoolId]);

  useEffect(() => {
    // Determine current active year if not selected
    if (schoolYears.length > 0 && !selectedYearId) {
      const active = schoolYears.find(y => y.is_active) || schoolYears[0];
      setSelectedYearId(active.id);
    }
  }, [schoolYears, selectedYearId]);

  useEffect(() => {
    if (selectedSchoolId && selectedYearId) {
      const fetchClasses = async () => {
        const { data, error } = await supabase.from('classes')
          .select('*')
          .eq('school_id', selectedSchoolId)
          .eq('school_year_id', selectedYearId)
          .order('name');
        
        if (error) {
          console.error("DEBUG CLASSES ERROR", error);
        }
        if (data) {
          setClasses(data);
        }
      };
      fetchClasses();
    } else {
      setClasses([]);
    }
  }, [selectedSchoolId, selectedYearId]);

  useEffect(() => {
    console.log("HEADER SELECTED SCHOOL", selectedSchoolId);
    console.log("HEADER SELECTED YEAR", selectedYearId);
    console.log("HEADER AVAILABLE CLASSES", classes);
    console.log("HEADER SELECTED CLASS", selectedClassId);
  }, [selectedSchoolId, selectedYearId, classes, selectedClassId]);

  const selectClass = async (classItem: any) => {
    console.log("CLASS DROPDOWN CLICKED", classItem);
    console.log("SELECT CLASS FUNCTION CALLED", classItem.id);
    
    setSelectedClassId(classItem.id);
    localStorage.setItem("selectedClassId", classItem.id);
    if (classItem.name) {
      localStorage.setItem("selectedClassName", classItem.name);
    }
    
    console.log("SELECTED CLASS AFTER SET", classItem);
    console.log("SELECT CLASS SAVED", classItem.id);
    console.log("LOCAL STORAGE SELECTED CLASS", localStorage.getItem("selectedClassId"));
    
    setIsClassMenuOpen(false);

    if (location.pathname.startsWith('/class/')) {
      const currentTab = location.pathname.split('/')[3] || 'imenik';
      navigate(`/class/${classItem.id}/${currentTab}`);
    } else if (location.pathname.startsWith('/student/')) {
      // For students/parents, stay on the same path but context+key will force remount
      navigate(location.pathname);
    } else if (location.pathname.startsWith('/admin/')) {
      // Admin dashboard handling can stay put
      navigate('/admin/school-dashboard');
    } else {
      navigate(`/class/${classItem.id}/imenik`);
    }
  };

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
        
        {/* Dropdowns */}
        <div className="flex items-center gap-2">
           <div className="relative">
             <button onClick={() => setIsSchoolMenuOpen(!isSchoolMenuOpen)} className="flex items-center gap-1 text-xs font-medium hover:bg-[#004a70] p-2 rounded">
                {selectedSchool?.name || 'Odaberi školu'} <ChevronDown size={14} />
             </button>
             {isSchoolMenuOpen && (
               <div className="absolute top-full mt-1 w-48 bg-white text-gray-800 border rounded shadow-xl z-50 py-1">
                 {schools.map(s => <button key={s.id} onClick={() => { 
                   setSelectedSchoolId(s.id); 
                   setIsSchoolMenuOpen(false); 
                   setSelectedYearId(null); 
                   setSelectedClassId(null); 
                   if (location.pathname.startsWith('/class/')) {
                     navigate('/select-class');
                   }
                 }} className="w-full text-left px-4 py-2 hover:bg-slate-100 text-xs">{s.name}</button>)}
               </div>
             )}
           </div>

           <div className="relative">
             <button onClick={() => setIsYearMenuOpen(!isYearMenuOpen)} className="flex items-center gap-1 text-xs font-medium hover:bg-[#004a70] p-2 rounded">
                {selectedYear?.name || 'Odaberi godinu'} <ChevronDown size={14} />
             </button>
             {isYearMenuOpen && (
               <div className="absolute top-full mt-1 w-48 bg-white text-gray-800 border rounded shadow-xl z-50 py-1">
                 {schoolYears.map(y => <button key={y.id} onClick={() => { 
                   setSelectedYearId(y.id); 
                   setIsYearMenuOpen(false); 
                   setSelectedClassId(null); 
                   if (location.pathname.startsWith('/class/')) {
                     navigate('/select-class');
                   }
                 }} className="w-full text-left px-4 py-2 hover:bg-slate-100 text-xs">{y.name}</button>)}
               </div>
             )}
           </div>

           <div className="relative">
             <button onClick={() => setIsClassMenuOpen(!isClassMenuOpen)} className="flex items-center gap-1 text-xs font-medium hover:bg-[#004a70] p-2 rounded">
                {selectedClass?.name || 'Odaberi razred'} <ChevronDown size={14} />
             </button>
             {isClassMenuOpen && (
               <div className="absolute top-full mt-1 w-48 bg-white text-gray-800 border rounded shadow-xl z-50 py-1">
                 {classes.map(c => <button key={c.id} onClick={async () => { 
                   await selectClass(c);
                 }} className="w-full text-left px-4 py-2 hover:bg-slate-100 text-xs">{c.name}</button>)}
               </div>
             )}
           </div>
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
