import React from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Menu, LogOut, Search, Settings, BookOpen, List, ClipboardList, FileText, FileSpreadsheet, Clock, Calendar, Home, GraduationCap, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Role } from '../types';
import { cn, formatPersonName } from '../lib/utils';
import { Header } from './Header';
import { useClassAdminAccess } from '../hooks/useClassAdminAccess';
import { isClassEligibleForFinalThesis } from '../lib/thesisHelper';

interface NavItem {
  id?: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
}

interface NavGroup {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

// TEACHER_NAV is defined dynamically inside ClassDashboardLayout component below

const STUDENT_NAV: NavItem[] = [
  { label: 'Ocjene', path: '/student/ocjene' },
  { label: 'Bilješke', path: '/student/biljeske' },
  { label: 'Ispiti', path: '/student/ispiti' },
  { label: 'Matura', path: '/student/matura' },
  { label: 'Izostanci', path: '/student/izostanci' },
  { label: 'Raspored', path: '/student/raspored' },
  { label: 'Kalendar škole', path: '/student/kalendar' },
  { label: 'Informativka', path: '/student/informativka' },
  { label: 'Završni rad', path: '/student/zavrsni-rad' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Škole', path: '/admin-skole/schools' },
  { label: 'Admin. škole', path: '/admin-skole' },
  { label: 'Razredi', path: '/admin-skole/razredi' },
  { label: 'Korisnici', path: '/admin-skole/korisnici' },
  { label: 'Predmeti', path: '/admin-skole/predmeti' },
  { label: 'Dodjele nastavnika', path: '/admin-skole/masovna-dodjela-nastavnika' },
];

export function ClassDashboardLayout({ children }: { children: React.ReactNode }) {
  const { classId } = useParams<{ classId: string }>();
  const { user, signOut, userSchoolRoles, isMainAdmin, formattedRoles, isStaff } = useAuth();
  const { selectedSchoolId, selectedClassId, isArchived, clearSelection } = useSelection();
  const effectiveClassId = classId || selectedClassId;
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { canAccessClassAdmin } = useClassAdminAccess(effectiveClassId);
  const [openDesktopNavId, setOpenDesktopNavId] = React.useState<string | null>(null);
  const [studentClassName, setStudentClassName] = React.useState('');

  React.useEffect(() => {
    setOpenDesktopNavId(null);
  }, [location.pathname]);

  // isAdminPath is only for the specific /admin/* routes, not /admin-skole/*
  const isAdminPath = location.pathname.startsWith('/admin/') && !location.pathname.startsWith('/admin-skole');

  // Current roles in selected school
  const currentSchoolRoles = (userSchoolRoles || [])
    .filter(r => r && r.schoolId === selectedSchoolId)
    .map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);
  const [canAccessLektira, setCanAccessLektira] = React.useState(false);

  React.useEffect(() => {
    if (!isStaff || !effectiveClassId || !user) {
      setCanAccessLektira(false);
      return;
    }

    if (isSchoolAdmin) {
      setCanAccessLektira(true);
      return;
    }

    let isMounted = true;

    const checkLektiraAccess = async () => {
      const { data: assignments, error: assignmentsError } = await supabase
        .from('class_subject_teachers')
        .select('subject_id')
        .eq('class_id', effectiveClassId)
        .eq('teacher_id', user.id);

      if (assignmentsError) {
        console.error('[ClassDashboardLayout] Error checking lektira access:', assignmentsError.message);
        if (isMounted) setCanAccessLektira(false);
        return;
      }

      const subjectIds = Array.from(new Set((assignments || []).map((assignment: any) => assignment.subject_id).filter(Boolean)));
      if (subjectIds.length === 0) {
        if (isMounted) setCanAccessLektira(false);
        return;
      }

      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name, code')
        .in('id', subjectIds);

      if (subjectsError) {
        console.error('[ClassDashboardLayout] Error loading subjects for lektira access:', subjectsError.message);
        if (isMounted) setCanAccessLektira(false);
        return;
      }

      const hasCroatian = (subjects || []).some((subject: any) => {
        const name = String(subject.name || '').trim().toLowerCase();
        const code = String(subject.code || '').trim().toUpperCase();
        return name === 'hrvatski jezik' || code === 'HRV';
      });

      if (isMounted) setCanAccessLektira(hasCroatian);
    };

    checkLektiraAccess();

    return () => {
      isMounted = false;
    };
  }, [isStaff, effectiveClassId, user, isSchoolAdmin]);
  
  // Thesis visibility logic
  const [canAccessThesis, setCanAccessThesis] = React.useState(true);
  React.useEffect(() => {
    if (isAdminPath || !user) return;
    
    const checkAccess = async () => {
        try {
            if (!isStaff) {
                const { data: enrollment, error } = await supabase
                    .from('student_class_enrollments')
                    .select('class_id, student_id, classes:class_id(name, grade_level, program_id, programs:program_id(duration_years))')
                    .eq('student_id', user.id)
                    .eq('status', 'ACTIVE')
                    .maybeSingle();

                if (error) {
                    console.error('[ClassDashboardLayout] Error checking access:', error.message);
                    setCanAccessThesis(false);
                    return;
                }

                if (enrollment && enrollment.classes) {
                    const rawClazz = enrollment.classes as any;
                    const clazz = Array.isArray(rawClazz) ? rawClazz[0] : rawClazz;
                    if (clazz) {
                        setStudentClassName(clazz.name || '');
                        setCanAccessThesis(isClassEligibleForFinalThesis(clazz));
                    } else {
                        setStudentClassName('');
                        setCanAccessThesis(false);
                    }
                } else {
                   setStudentClassName('');
                   setCanAccessThesis(false);
                }
            } else {
                if (effectiveClassId) {
                    const { data: rawClazz, error } = await supabase
                        .from('classes')
                        .select('name, grade_level, program_id, programs:program_id(duration_years)')
                        .eq('id', effectiveClassId)
                        .maybeSingle();
                    
                    if (error) {
                        console.error('[ClassDashboardLayout] Error checking class thesis access:', error.message);
                        setCanAccessThesis(false);
                        return;
                    }

                    if (rawClazz) {
                        const clazz = Array.isArray(rawClazz) ? rawClazz[0] : rawClazz;
                        setCanAccessThesis(isClassEligibleForFinalThesis(clazz));
                    } else {
                        setCanAccessThesis(false);
                    }
                } else {
                    setCanAccessThesis(true);
                }
            }
        } catch (e) {
            console.error('[ClassDashboardLayout] Critical checkAccess error:', e);
            setCanAccessThesis(false); // fallback to false safely
        }
    };
    checkAccess();
  }, [isStaff, isAdminPath, user, effectiveClassId]);

  const studentNavFiltered = STUDENT_NAV.filter(item => 
      (item.label !== 'Završni rad' || canAccessThesis) &&
      (item.label !== 'Matura' || (studentClassName.trim().startsWith('4.') && studentClassName.trim().toUpperCase() !== '4.K'))
  );
  
  const classPathPrefix = effectiveClassId ? `/class/${effectiveClassId}` : '';
  const teacherNavGroups: NavGroup[] = effectiveClassId ? [
    {
      id: 'imenik',
      label: 'Imenik',
      path: `${classPathPrefix}/imenik`,
      icon: <BookOpen size={14} />,
      children: [
        ...(canAccessThesis ? [{ id: 'zavrsni-rad', label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> }] : []),
      ],
    },
    { id: 'pregled-rada', label: 'Pregled rada', path: `${classPathPrefix}/pregled-rada`, icon: <List size={14} /> },
    {
      id: 'dnevnik-rada',
      label: 'Dnevnik rada',
      path: `${classPathPrefix}/pregled-rada`,
      icon: <ClipboardList size={14} />,
      children: [
        { id: 'pregled-tjedna', label: 'Pregled tjedna', path: `${classPathPrefix}/pregled-rada`, icon: <List size={14} /> },
        { id: 'ispiti', label: 'Ispiti', path: `${classPathPrefix}/ispiti`, icon: <Calendar size={14} /> },
        { id: 'izostanci', label: 'Izostanci', path: `${classPathPrefix}/izostanci`, icon: <Clock size={14} /> },
        { id: 'raspored', label: 'Raspored sati', path: `${classPathPrefix}/raspored`, icon: <Calendar size={14} /> },
        ...(canAccessLektira ? [{ id: 'lektira', label: 'Lektira', path: `${classPathPrefix}/lektira`, icon: <BookOpen size={14} /> }] : []),
        { id: 'pedagoska-dokumentacija', label: 'Pedagoška dokumentacija', path: `${classPathPrefix}/pedagoska-dokumentacija`, icon: <FileText size={14} /> },
      ],
    },
    { id: 'zapisnici', label: 'Zapisnici', path: `${classPathPrefix}/zapisnici`, icon: <FileText size={14} /> },
    { id: 'izvjestaji', label: 'Izvještaji', path: '/teacher/izvjestaji', icon: <FileText size={14} /> },
    ...(canAccessClassAdmin || isSchoolAdmin ? [{
      id: 'administracija',
      label: 'Administracija',
      path: canAccessClassAdmin ? `${classPathPrefix}/admin` : '/admin-skole',
      icon: <Settings size={14} />,
    }] : []),
    { id: 'pretrazivanje', label: 'Pretraživanje', path: '/teacher/pretrazivanje', icon: <Search size={14} /> },
    { id: 'vise', label: '', path: '#', icon: <Menu size={16} />, children: [
      { id: 'kalendar-skole', label: 'Kalendar škole', path: '/teacher/kalendar', icon: <Calendar size={14} /> },
      { id: 'dokumenti-skole', label: 'Dokumenti škole', path: '/teacher/dokumenti', icon: <FileText size={14} /> },
      { id: 'student-dosje', label: 'Digitalni dosje', path: '/teacher/student-dosje', icon: <FileText size={14} /> },
      { id: 'matura', label: 'Matura', path: '/teacher/matura', icon: <GraduationCap size={14} /> },
      { id: 'postavke', label: 'Postavke', path: '/teacher/postavke', icon: <Settings size={14} /> },
    ] },
  ] : [
    { id: 'pretrazivanje', label: 'Pretraživanje', path: '/teacher/pretrazivanje', icon: <Search size={14} /> },
    { id: 'dokumenti-skole', label: 'Dokumenti škole', path: '/teacher/dokumenti', icon: <FileText size={14} />, children: [
      { id: 'student-dosje', label: 'Digitalni dosje', path: '/teacher/dosje', icon: <FileText size={14} /> },
      { id: 'matura', label: 'Matura', path: '/teacher/matura', icon: <GraduationCap size={14} /> },
    ] },
    ...(canAccessThesis ? [{ id: 'zavrsni-rad', label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> }] : []),
    { id: 'kalendar-skole', label: 'Kalendar škole', path: '/teacher/kalendar', icon: <Calendar size={14} /> },
    ...(isSchoolAdmin ? [{ id: 'school-admin', label: 'Admin škole', path: '/admin-skole', icon: <Settings size={14} /> }] : []),
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
    if (tabId === 'ispiti') {
      return path.includes('/ispiti') || path.includes('/exams');
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
    if (tabId === 'student-dosje') {
      return path.includes('dosje');
    }
    if (tabId === 'zavrsni-rad') {
      return path.includes('zavrsni-radovi');
    }
    if (tabId === 'raspored') {
      return path.includes('/raspored') || path.includes('/schedule');
    }
    if (tabId === 'lektira') {
      return path.includes('/lektira');
    }
    if (tabId === 'admin') {
      return path.includes('/admin-razreda') || path.includes('/admin') || path.includes('/administration');
    }
    return path.startsWith(itemPath);
  };

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };

  const isTeacherNavGroupActive = (group: NavGroup) => {
    if (isTabActive(group.id, group.path)) return true;
    return (group.children || []).some(child => isTabActive(child.id, child.path));
  };

  // (Will add burger menu logic later if needed in layout, but for now focus on the structure)
  const canAccessStudentMatura = studentClassName.trim().startsWith('4.') && studentClassName.trim().toUpperCase() !== '4.K';
  const studentSidebarItems: NavItem[] = [
    { label: 'Ocjene', path: '/student/ocjene', icon: <BookOpen size={18} /> },
    { label: 'Bilješke', path: '/student/biljeske', icon: <FileText size={18} /> },
    { label: 'Ispiti', path: '/student/ispiti', icon: <ClipboardList size={18} /> },
    ...(canAccessStudentMatura ? [{ label: 'Matura', path: '/student/matura', icon: <GraduationCap size={18} /> }] : []),
    { label: 'Izostanci', path: '/student/izostanci', icon: <Clock size={18} /> },
    { label: 'Raspored', path: '/student/raspored', icon: <Calendar size={18} /> },
    { label: 'Informativka', path: '/student/informativka', icon: <List size={18} /> },
  ];

  const isStudentSidebarActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className={cn("min-h-screen flex flex-col font-sans", isStaff ? "bg-[#f0f2f5]" : "bg-white")}>
      {/* Header */}
      <Header />
      
      {/* Main Teacher Nav (Global) */}
      {isStaff && effectiveClassId && (
        <div className="bg-white border-b border-[#dee2e6] h-14 hidden lg:flex items-center justify-between px-6 shadow-sm z-30">
           <div className="flex items-center gap-1 h-full min-w-0 w-full">
             {teacherNavGroups.map(group => {
               const hasChildren = Boolean(group.children?.length);
               const isActive = isTeacherNavGroupActive(group);
               const content = (
                 <>
                   {group.icon}
                   {group.label && <span>{group.label}</span>}
                   {hasChildren && <ChevronDown size={13} className={cn("transition-transform", openDesktopNavId === group.id && "rotate-180")} />}
                 </>
               );

               return (
                 <div key={group.id} className={cn("relative h-full", group.id === 'vise' && "ml-auto")}>
                   {hasChildren || group.id === 'vise' ? (
                     <div
                       className={cn(
                         "h-full flex items-stretch border-b-4 transition-all",
                         isActive
                          ? "border-[#005c8d] text-[#005c8d] bg-sky-50"
                          : "text-gray-500 border-transparent hover:bg-slate-100 hover:text-slate-900"
                       )}
                     >
                       {group.id === 'vise' ? (
                         <button
                           type="button"
                           onClick={() => setOpenDesktopNavId(open => open === group.id ? null : group.id)}
                           className="px-3 h-full flex items-center gap-1.5 text-xs font-black uppercase tracking-wider whitespace-nowrap cursor-pointer"
                           aria-expanded={openDesktopNavId === group.id}
                           aria-label="Dodatni izbornik"
                         >
                           {group.icon}
                           <ChevronDown size={13} className={cn("transition-transform", openDesktopNavId === group.id && "rotate-180")} />
                         </button>
                       ) : (
                         <>
                           <Link
                             to={group.path}
                             onClick={() => setOpenDesktopNavId(null)}
                             className="pl-2 xl:pl-3 pr-1 h-full flex items-center gap-1.5 text-xs font-black uppercase tracking-wider whitespace-nowrap cursor-pointer"
                           >
                             {group.icon}
                             <span>{group.label}</span>
                           </Link>
                           <button
                             type="button"
                             onClick={() => setOpenDesktopNavId(open => open === group.id ? null : group.id)}
                             className="px-2 h-full flex items-center cursor-pointer"
                             aria-expanded={openDesktopNavId === group.id}
                             aria-label={`${group.label} podizbornik`}
                           >
                             <ChevronDown size={13} className={cn("transition-transform", openDesktopNavId === group.id && "rotate-180")} />
                           </button>
                         </>
                       )}
                     </div>
                   ) : (
                     <Link
                       to={group.path}
                       onClick={() => setOpenDesktopNavId(null)}
                       className={cn(
                         "px-2 xl:px-3 h-full flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap cursor-pointer",
                         isActive
                          ? "border-[#005c8d] text-[#005c8d] bg-sky-50"
                          : "text-gray-500 border-transparent hover:bg-slate-100 hover:text-slate-900"
                       )}
                     >
                       {content}
                     </Link>
                   )}

                   {hasChildren && openDesktopNavId === group.id && (
                     <div className={cn(
                       "absolute top-full mt-0 w-64 max-w-[calc(100vw-24px)] bg-white border border-slate-200 shadow-xl rounded-sm py-1 z-50",
                       group.id === 'vise' ? "right-0" : "left-0"
                     )}>
                       {group.children!.map(child => (
                         <Link
                           key={child.path}
                           to={child.path}
                           onClick={() => setOpenDesktopNavId(null)}
                           className={cn(
                             "flex items-center gap-2 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors whitespace-normal",
                             isTabActive(child.id, child.path)
                              ? "bg-sky-50 text-[#005c8d]"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                           )}
                         >
                           {child.icon}
                           {child.label}
                         </Link>
                       ))}
                     </div>
                   )}
                 </div>
               );
             })}
           </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row">
        {/* Mobile Sidebar Overlay (Sliding "Više" Menu) */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-[60] flex">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="relative w-80 max-w-[85vw] h-full bg-[#005c8d] text-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-250">
              <div className="p-4 border-b border-[#004a70] flex items-center justify-between">
                <span className="font-black uppercase tracking-widest text-[#00a8ff] text-xs">Izbornik Aplikacije</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 hover:bg-[#004a70] rounded-sm transition-colors text-white/80 hover:text-white cursor-pointer"><LogOut size={20} className="rotate-180" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
                <div className="bg-[#004a70]/50 rounded p-3 mb-2 border border-[#004a70]/30 mr-1">
                  <div className="text-[12px] font-black leading-tight text-white">{formatPersonName(user)}</div>
                  <div className="text-[9.5px] text-sky-200/80 font-bold uppercase tracking-wider mt-0.5">{formattedRoles}</div>
                </div>

                {(() => {
                  const categories = [];

                  if (isAdminPath) {
                    categories.push({
                      title: 'Administracija',
                      items: ADMIN_NAV.map(item => ({ label: item.label, path: item.path, icon: <Settings size={14} /> }))
                    });
                  } else if (isStaff) {
                    if (effectiveClassId) {
                      categories.push({
                        title: 'Nastava & Ocjenjivanje',
                        items: [
                          { label: 'Imenik / Učenici', path: `/class/${effectiveClassId}/imenik`, icon: <BookOpen size={14} /> },
                          { label: 'Pregled rada u razredu', path: `/class/${effectiveClassId}/pregled-rada`, icon: <List size={14} /> },
                          { label: 'Dnevnik rada', path: `/class/${effectiveClassId}/pregled-rada`, icon: <ClipboardList size={14} /> },
                          { label: 'Ispiti', path: `/class/${effectiveClassId}/ispiti`, icon: <Calendar size={14} /> },
                          { label: 'Izostanci', path: `/class/${effectiveClassId}/izostanci`, icon: <Clock size={14} /> },
                          ...(canAccessLektira ? [{ label: 'Lektira', path: `/class/${effectiveClassId}/lektira`, icon: <BookOpen size={14} /> }] : []),
                        ]
                      });
                      categories.push({
                        title: 'Zapisnici & Dokumentacija',
                        items: [
                          { label: 'Zapisnici sastanaka', path: `/class/${effectiveClassId}/zapisnici`, icon: <FileText size={14} /> },
                          { label: 'Pedagoška dokumentacija', path: `/class/${effectiveClassId}/pedagoska-dokumentacija`, icon: <FileText size={14} /> },
                          ...(canAccessThesis ? [{ label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> }] : []),
                          { label: 'Raspored sati', path: `/class/${effectiveClassId}/raspored`, icon: <Calendar size={14} /> },
                          ...(canAccessClassAdmin ? [{ label: 'Admin razreda', path: `/class/${effectiveClassId}/admin`, icon: <Settings size={14} /> }] : []),
                        ]
                      });
                    } else {
                      categories.push({
                        title: 'Nastava & Alati',
                        items: [
                          { label: 'Pretraživanje', path: '/teacher/pretrazivanje', icon: <Search size={14} /> },
                          ...(canAccessThesis ? [{ label: 'Završni radovi', path: '/teacher/zavrsni-radovi', icon: <FileSpreadsheet size={14} /> }] : []),
                        ]
                      });
                    }

                    categories.push({
                      title: 'Školske informacije',
                      items: [
                        { label: 'Digitalni Dosje učenika', path: '/teacher/student-dosje', icon: <FileText size={14} /> },
                        { label: 'Kalendar škole', path: '/teacher/kalendar', icon: <Calendar size={14} /> },
                        { label: 'Dokumenti škole', path: '/teacher/dokumenti', icon: <FileText size={14} /> },
                        { label: 'Matura', path: '/teacher/matura', icon: <GraduationCap size={14} /> },
                        { label: 'Obavijesti / Informativka', path: effectiveClassId ? `/class/${effectiveClassId}/informativka` : '/teacher/informativka', icon: <ClipboardList size={14} /> },
                      ]
                    });
                    
                    if (isSchoolAdmin) {
                      categories.push({
                        title: 'Administracija škole',
                        items: [
                          { label: 'Pregled sustava', path: '/admin-skole', icon: <Settings size={14} /> },
                          { label: 'Korisnici / Nastavnici', path: '/admin-skole/korisnici', icon: <Settings size={14} /> },
                          { label: 'Učenici', path: '/admin-skole/ucenici', icon: <Settings size={14} /> },
                          { label: 'Razredi', path: '/admin-skole/razredi', icon: <Settings size={14} /> },
                          { label: 'Predmeti', path: '/admin-skole/predmeti', icon: <Settings size={14} /> },
                          { label: 'Kalendar rada', path: '/admin-skole/kalendar', icon: <Calendar size={14} /> },
                          { label: 'Upravljanje rasporedom', path: '/admin-skole/raspored', icon: <Calendar size={14} /> },
                          { label: 'Matična knjiga', path: '/admin-skole/maticna-knjiga', icon: <FileText size={14} /> },
                          { label: 'Arhiva', path: '/admin-skole/arhiva', icon: <FileText size={14} /> },
                        ]
                      });
                    }
                  } else {
                    categories.push({
                      title: 'Nastava & Učenik',
                      items: [
                        { label: 'Ocjene', path: '/student/ocjene', icon: <BookOpen size={14} /> },
                        { label: 'Bilješke', path: '/student/biljeske', icon: <FileText size={14} /> },
                        { label: 'Ispiti', path: '/student/ispiti', icon: <FileText size={14} /> },
                        ...(canAccessStudentMatura ? [{ label: 'Matura', path: '/student/matura', icon: <GraduationCap size={14} /> }] : []),
                        { label: 'Izostanci', path: '/student/izostanci', icon: <Clock size={14} /> },
                      ]
                    });
                    categories.push({
                      title: 'Raspored & Alati',
                      items: [
                        { label: 'Raspored', path: '/student/raspored', icon: <Calendar size={14} /> },
                        { label: 'Kalendar škole', path: '/student/kalendar', icon: <Calendar size={14} /> },
                        { label: 'Informativka / Obavijesti', path: '/student/informativka', icon: <ClipboardList size={14} /> },
                        ...(canAccessThesis ? [{ label: 'Završni rad', path: '/student/zavrsni-rad', icon: <FileSpreadsheet size={14} /> }] : []),
                      ]
                    });
                    categories.push({
                      title: 'Korisnički račun',
                      items: [
                        { label: 'Osobni podaci', path: '/student/osobni-podaci', icon: <Settings size={14} /> },
                        { label: 'Postavke', path: '/student/postavke', icon: <Settings size={14} /> },
                      ]
                    });
                  }

                  categories.push({
                    title: 'Sustav',
                    items: [
                      { label: 'Početna / Odabir razreda', path: '/select-class', icon: <Home size={14} /> },
                      ...(isStaff ? [{ label: 'Postavke profila', path: '/teacher/postavke', icon: <Settings size={14} /> }] : []),
                    ]
                  });

                  return categories.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-sky-200 tracking-widest block px-1 my-1 opacity-70">{cat.title}</span>
                      <div className="flex flex-col gap-1">
                        {cat.items.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors",
                              location.pathname.startsWith(item.path) 
                                ? "bg-[#004a70] text-sky-100" 
                                : "text-white/85 hover:bg-[#004a70]/50"
                            )}
                          >
                            {item.icon}
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="p-4 border-t border-[#004a70] bg-[#004a70]/20">
                <button onClick={handleLogout} className="w-full py-2.5 bg-red-600/30 hover:bg-red-600/50 text-red-100 rounded text-[10px] font-black uppercase tracking-widest border border-red-500/20 transition-all cursor-pointer">Odjava</button>
              </div>
            </div>
          </div>
        )}

        {!isStaff && (
          <aside className="hidden lg:flex w-[345px] shrink-0 bg-[#f7f7f7] border-r border-slate-100 flex-col pt-6">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="w-12 h-12 flex items-center justify-center text-slate-900 hover:bg-slate-100 transition-colors ml-2 mb-4"
              aria-label="Izbornik"
            >
              <Menu size={22} />
            </button>

            <nav className="flex flex-col gap-1 pr-0">
              {studentSidebarItems
                .filter(item => item.label !== 'Završni rad' || canAccessThesis)
                .map(item => {
                  const active = isStudentSidebarActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "min-h-[44px] flex items-center gap-3 pl-5 pr-4 text-base font-bold transition-colors rounded-r-[22px] mr-0",
                        active
                          ? "bg-[#1780c2] text-white"
                          : "text-slate-900 hover:bg-slate-100"
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  );
                })}
            </nav>

            <div className="mt-auto px-6 pb-8 text-center text-slate-900">
              <div className="text-xs leading-tight mb-2">
                <div>CARNET Helpdesk</div>
                <div>Podrška obrazovnom sustavu</div>
              </div>
              <div className="text-[46px] font-black text-[#6f7277] leading-none tracking-tight">CARNET</div>
              <div className="text-xs mt-3 leading-tight">
                <div>tel: +385 1 6661 500</div>
                <div>e-mail: helpdesk@skole.hr</div>
              </div>
            </div>
          </aside>
        )}

        <main className={cn("flex-1 flex flex-col w-full", isStaff ? "mb-16 lg:mb-0" : "mb-16 lg:mb-0 bg-white")}>
          <div key={effectiveClassId || 'none'} className={cn("flex-1 flex flex-col min-h-0", isStaff ? "bg-white border-b border-r border-[#005c8d]/20" : "bg-white")}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      {(() => {
        const homePath = "/select-class";
        const notificationsPath = isStaff 
          ? (effectiveClassId ? `/class/${effectiveClassId}/informativka` : '/teacher/informativka')
          : '/student/informativka';

        const isHomeActive = location.pathname === '/select-class' || location.pathname === '/select-school' || location.pathname === '/select-child' || location.pathname === '/';
        const isNotificationsActive = location.pathname.includes('/informativka');

        return (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#005c8d] text-white flex justify-around items-center h-16 border-t border-[#004a70] z-50 shadow-lg select-none">
            <Link
              to={homePath}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-all duration-150",
                isHomeActive ? "bg-[#004a70]/80 font-black text-[#00a8ff]" : "opacity-80"
              )}
            >
              <Home size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Početna</span>
            </Link>

            <Link
              to={notificationsPath}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-all duration-150",
                isNotificationsActive ? "bg-[#004a70]/80 font-black text-[#00a8ff]" : "opacity-80"
              )}
            >
              <ClipboardList size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Obavijesti</span>
            </Link>

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 active:bg-[#004a70]/40 transition-all duration-150 cursor-pointer"
            >
              <Menu size={18} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Više</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
