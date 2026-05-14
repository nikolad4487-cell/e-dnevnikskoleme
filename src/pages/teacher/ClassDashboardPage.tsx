import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useParams, useNavigate, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Role } from '../../types';
import { Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { mappers } from '../../lib/mappers';

const TeacherIzostanciPage = lazy(() => import('./IzostanciPage'));
const BiljeskePage = lazy(() => import('./BiljeskePage'));
const DnevnikRadaPage = lazy(() => import('./DnevnikRadaPage'));
const ZapisniciPage = lazy(() => import('./ZapisniciPage'));
const IzvjestajiPage = lazy(() => import('./IzvjestajiPage'));
const AdministrationPage = lazy(() => import('./AdministrationPage'));
const ImenikPage = lazy(() => import('./ImenikPage'));

export default function ClassDashboardPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setSelectedSchoolId, isArchived, setIsArchived } = useSelection();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [currentClass, setCurrentClass] = useState<Class | null>(null);

  useEffect(() => {
    if (classId) {
      checkAccessAndLoad();
    }
  }, [classId, user]);

  const checkAccessAndLoad = async () => {
    if (!user || !classId) return;
    setLoading(true);
    setAccessDenied(false);

    try {
      // 1. Fetch class details
      const { data: rawClass, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError || !rawClass) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const mappedClass = mappers.class(rawClass);
      setCurrentClass(mappedClass);

      // 1b. Check if archived (class status or school year is_active)
      const { data: yearData } = await supabase
        .from('school_years')
        .select('is_active')
        .eq('id', mappedClass.schoolYearId)
        .maybeSingle();
      
      const archived = mappedClass.status === 'ARCHIVED' || (yearData && !yearData.is_active);
      setIsArchived(!!archived);

      // 2. Check access
      const isSchoolAdmin = userSchoolRoles.some(r => 
        r.schoolId === mappedClass.schoolId && 
        [Role.ADMIN, Role.SCHOOL_ADMIN].includes(r.role as Role)
      );

      if (isMainAdmin || isSchoolAdmin) {
        // Admin has full access
        allowAccess(mappedClass);
        return;
      }

      // Check if Homeroom or Deputy
      if (mappedClass.homeroomTeacherId === user.id || mappedClass.deputyTeacherId === user.id) {
        allowAccess(mappedClass);
        return;
      }

      // Check if Teacher in this class
      const { data: assignments, error: assignError } = await supabase
        .from('class_subject_teachers')
        .select('id')
        .eq('class_id', classId)
        .eq('teacher_id', user.id)
        .limit(1);

      if (assignError) throw assignError;

      if (assignments && assignments.length > 0) {
        allowAccess(mappedClass);
        return;
      }

      // If nothing matched, deny
      setAccessDenied(true);
    } catch (error) {
      console.error('[CLASS DASHBOARD] Access Check Error:', error);
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const allowAccess = (cls: Class) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
  };

  const tabs = [
    { id: 'imenik', label: 'Imenik', path: 'imenik' },
    { id: 'dnevnik-rada', label: 'Dnevnik rada', path: 'dnevnik-rada' },
    { id: 'biljeske', label: 'Bilješke', path: 'biljeske' },
    { id: 'izostanci', label: 'Izostanci', path: 'izostanci' },
    { id: 'raspored', label: 'Raspored sati', path: 'raspored' },
    { id: 'zapisnici', label: 'Zapisnici', path: 'zapisnici' },
    { id: 'izvjestaji', label: 'Izvještaji', path: 'izvjestaji' },
    { id: 'administracija', label: 'Administracija', path: 'admin' },
  ];

  const currentTab = location.pathname.split('/').pop() || 'imenik';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#005c8d] mb-4" />
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Učitavanje razreda...</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 font-sans">
        <div className="bg-white p-12 border border-gray-300 max-w-md shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={24} strokeWidth={3} />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-2 tracking-tighter uppercase leading-none">Razred nije pronađen</h1>
          <div className="h-px w-8 bg-red-200 mx-auto mb-6"></div>
          <p className="text-[12px] text-slate-600 mb-8 leading-relaxed font-bold">
            Odabrani razredni odjel ({classId}) ne postoji ili mu niste ovlašteni pristupiti.
          </p>
          <button 
            onClick={() => navigate('/select-class')}
            className="w-full bg-[#005c8d] text-white py-3 border border-[#004a71] font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-all"
          >
            Povratak na odabir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Header Info Bar */}
      <div className="bg-[#005c8d] text-white px-6 py-2 flex items-center justify-between shadow-md z-20 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black uppercase tracking-tighter">{currentClass?.name}</h2>
          <div className="h-4 w-px bg-white/20"></div>
          <div className="flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-none">
              Školska godina: {currentClass?.schoolYear || 'Nije definirano'}
            </p>
            {!currentClass?.schoolYear && (
              <span className="text-[8px] font-black text-amber-300 uppercase animate-pulse mt-1">
                Upozorenje: Školska godina nije postavljena
              </span>
            )}
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest bg-white/10 px-3 py-1">
          {currentClass?.gradeLevel}. RAZRED • {currentClass?.section} ODJEL
        </div>
      </div>

      {isArchived && (
        <div className="bg-amber-100 border-b border-amber-200 px-6 py-2 flex items-center gap-3 shrink-0">
          <div className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center shrink-0">
            <ShieldAlert size={12} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-amber-800 leading-none">Arhivirani podaci</span>
            <span className="text-[9px] font-bold text-amber-700">Ovaj razredni odjel je dio arhivirane školske godine. Izmjene su onemogućene.</span>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="bg-[#f8f9fa] border-b border-[#dee2e6] px-6 flex items-center overflow-x-auto no-scrollbar shrink-0">
         {tabs.map(tab => (
           <button
             key={tab.id}
             onClick={() => navigate(`/class/${classId}/${tab.path}`)}
             className={cn(
               "px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-4 whitespace-nowrap",
               currentTab === tab.id || location.pathname.includes(tab.path)
                ? "bg-white text-[#005c8d] border-[#005c8d]" 
                : "text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-100/50"
             )}
           >
             {tab.label}
           </button>
         ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-white">
        <Suspense fallback={
          <div className="p-20 flex flex-col items-center justify-center opacity-50">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300 mb-4" />
            <span className="text-[10px] font-bold uppercase text-gray-400">Priprema tablice...</span>
          </div>
        }>
          <Routes>
            <Route index element={<Navigate to="imenik" replace />} />
            <Route path="imenik" element={<ImenikPage />} />
            <Route path="dnevnik-rada" element={<DnevnikRadaPage />} />
            <Route path="biljeske" element={<BiljeskePage />} />
            <Route path="izostanci" element={<TeacherIzostanciPage />} />
            <Route path="raspored" element={<DnevnikRadaPage initialView="SCHEDULE" />} />
            <Route path="zapisnici" element={<ZapisniciPage />} />
            <Route path="izvjestaji" element={<IzvjestajiPage />} />
            <Route path="admin" element={<AdministrationPage />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
