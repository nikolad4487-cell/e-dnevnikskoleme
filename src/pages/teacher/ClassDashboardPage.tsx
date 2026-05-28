import React, { useState, useEffect, Suspense, lazy, useRef } from 'react';
import { useParams, useNavigate, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Role } from '../../types';
import { Loader2, ShieldAlert, BookOpen, List, ClipboardList, FileText, FileSpreadsheet, Settings, Search, Menu, Clock, Bookmark, HelpCircle, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { mappers } from '../../lib/mappers';

const TeacherIzostanciPage = lazy(() => import('./IzostanciPage'));
const BiljeskePage = lazy(() => import('./BiljeskePage'));
const DnevnikRadaPage = lazy(() => import('./DnevnikRadaPage'));
const ZapisniciPage = lazy(() => import('./ZapisniciPage'));
const IzvjestajiPage = lazy(() => import('./IzvjestajiPage'));
const InformativkaPage = lazy(() => import('../shared/InformativkaPage'));
const AdministrationPage = lazy(() => import('./AdministrationPage'));
const ImenikPage = lazy(() => import('./ImenikPage'));
const PedagoskaDokumentacijaPage = lazy(() => import('./PedagoskaDokumentacijaPage'));
const PretrazivanjePage = lazy(() => import('./PretrazivanjePage'));

export default function ClassDashboardPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setSelectedSchoolId, isArchived, setIsArchived } = useSelection();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

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
        .select(`
          *,
          program:program_id(*),
          homeroom:homeroom_teacher_id(*),
          deputy:deputy_teacher_id(*)
        `)
        .eq('id', classId)
        .single();

      if (classError || !rawClass) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const mappedClass = mappers.class(rawClass);

      // 1b. Check if archived (class status or school year is_active)
      const { data: yearData } = await supabase
        .from('school_years')
        .select('is_active')
        .eq('id', mappedClass.school_year_id)
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

  const [isBurgerOpen, setIsBurgerOpen] = useState(false);
  const burgerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (burgerRef.current && !burgerRef.current.contains(event.target as Node)) {
        setIsBurgerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tabs = [
    { id: 'imenik', label: 'Imenik', path: 'imenik', icon: BookOpen },
    { id: 'pregled-rada', label: 'Pregled rada', path: 'pregled-rada', icon: List },
    { id: 'dnevnik-rada', label: 'Dnevnik rada', path: 'dnevnik-rada', icon: ClipboardList },
    { id: 'zapisnici', label: 'Zapisnici', path: 'zapisnici', icon: FileText },
    { id: 'izvjestaji', label: 'Izvještaji', path: 'izvjestaji', icon: FileSpreadsheet },
    { id: 'admin', label: 'Administracija', path: 'admin', icon: Settings },
    { id: 'pretrazivanje', label: 'Pretraživanje', path: 'pretrazivanje', icon: Search },
  ];

  const burgerItems = [
    { label: 'Bilješke', path: 'biljeske', icon: Bookmark },
    { label: 'Izostanci', path: 'izostanci', icon: Clock },
    { label: 'Pedagoška dokumentacija', path: 'pedagoska-dokumentacija', icon: FileText },
    { label: 'Raspored sati', path: 'raspored', icon: Calendar },
    { label: 'Informativka', path: 'informativka', icon: HelpCircle },
  ];

  const currentTab = location.pathname.split('/')[3] || 'imenik';
  const isActive = (tabPath: string) => currentTab === tabPath || (tabPath === 'dnevnik-rada' && currentTab === 'pregled-rada'); // Simplified for now

  // New Sidebar Config
  const sidebarLinks: Record<string, { label: string, path: string }[]> = {
    'imenik': [
      { label: 'Imenik učenika', path: 'imenik' },
      { label: 'Pregled predmeta', path: 'pregled-predmeta' }, // Need to ensure this path exists or map accurately
      { label: 'Bilješke', path: 'biljeske' }
    ],
    'admin': [
      { label: 'Postavke razreda', path: 'admin' },
      { label: 'Predmeti u razredu', path: 'predmeti' },
      { label: 'Učenici u razredu', path: 'ucenici' },
      { label: 'Opći prosjek', path: 'prosjek' },
      { label: 'Svjedodžbe', path: 'svjedodzbe' }
    ]
  };

  const activeSidebarLinks = sidebarLinks[currentTab] || [];

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
    <div className="flex flex-col h-full bg-white">
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

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden bg-white w-full">
        {/* Sidebar */}
        {activeSidebarLinks.length > 0 && (
          <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 flex flex-col gap-2 shrink-0">
             {activeSidebarLinks.map(link => (
               <button
                 key={link.path}
                 onClick={() => navigate(`/class/${classId}/${link.path}`)}
                 className={cn(
                   "w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded transition-colors",
                   currentTab === link.path 
                     ? "bg-[#005c8d] text-white" 
                     : "text-slate-600 hover:bg-slate-200"
                 )}
               >
                 {link.label}
               </button>
             ))}
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6" key={classId}>
          <Suspense fallback={
            <div className="p-20 flex flex-col items-center justify-center opacity-50">
              <Loader2 className="w-8 h-8 animate-spin text-gray-300 mb-4" />
              <span className="text-[10px] font-bold uppercase text-gray-400">Priprema tablice...</span>
            </div>
          }>
            <Routes>
              <Route index element={<Navigate to="imenik" replace />} />
              <Route path="imenik" element={<ImenikPage />} />
              <Route path="pregled-rada" element={<DnevnikRadaPage initialView="WEEKS" />} />
              <Route path="dnevnik-rada" element={<DnevnikRadaPage initialView="WEEK_DETAIL" />} />
              <Route path="biljeske" element={<BiljeskePage />} />
              <Route path="izostanci" element={<TeacherIzostanciPage />} />
              <Route path="pedagoska-dokumentacija" element={<PedagoskaDokumentacijaPage />} />
              <Route path="raspored" element={<DnevnikRadaPage initialView="SCHEDULE" />} />
              <Route path="zapisnici" element={<ZapisniciPage />} />
              <Route path="izvjestaji" element={<IzvjestajiPage />} />
              <Route path="informativka" element={<InformativkaPage />} />
              <Route path="admin" element={<AdministrationPage />} />
              <Route path="pretrazivanje" element={<PretrazivanjePage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
