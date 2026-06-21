import type { Plugin } from 'vite';

const CLASS_SELECTION_MODULE = '/src/pages/ClassSelectionPage.tsx';
const DASHBOARD_LAYOUT_MODULE = '/src/components/ClassDashboardLayout.tsx';
const FINAL_THESIS_STUDENT_MODULE = '/src/pages/student/FinalThesisPage.tsx';
const APP_MODULE = '/src/App.tsx';

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`[student-portal-experience] Expected ${label} block was not found.`);
  }
  return source.replace(before, after);
}

function transformFinalThesisStudentPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    '  const fetchAppData = async () => {\n    if (!studentId) return;',
    '  const fetchAppData = async () => {\n    if (!studentId || !enrolledClassId) return;',
    'student thesis data guard'
  );

  transformed = replaceRequired(
    transformed,
    `      // Fetch mentors
      const { data: mentorsData } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .in('role', ['TEACHER', 'HOMEROOM', 'ADMIN', 'SCHOOL_ADMIN']);
      setMentors(mentorsData || []);`,
    `      // Prikaži samo nastavnike koji predaju predmete koje ovaj učenik pohađa.
      const { data: subjectEnrollments, error: subjectEnrollmentError } = await supabase
        .from('student_subject_enrollments')
        .select('subject_id')
        .eq('student_id', studentId)
        .eq('class_id', enrolledClassId)
        .eq('status', 'ACTIVE');

      if (subjectEnrollmentError) throw subjectEnrollmentError;

      const subjectIds = Array.from(
        new Set((subjectEnrollments || []).map((row: any) => row.subject_id).filter(Boolean))
      );

      if (subjectIds.length === 0) {
        setMentors([]);
      } else {
        const { data: teacherAssignments, error: teacherAssignmentsError } = await supabase
          .from('class_subject_teachers')
          .select(\`
            teacher_id,
            subject_id,
            teacher:user_profiles (
              id,
              name,
              role
            )
          \`)
          .eq('class_id', enrolledClassId)
          .in('subject_id', subjectIds);

        if (teacherAssignmentsError) throw teacherAssignmentsError;

        const uniqueTeachers = new Map<string, any>();
        (teacherAssignments || []).forEach((assignment: any) => {
          const rawTeacher = assignment.teacher;
          const teacher = Array.isArray(rawTeacher) ? rawTeacher[0] : rawTeacher;
          if (teacher?.id) uniqueTeachers.set(teacher.id, teacher);
        });

        setMentors(
          Array.from(uniqueTeachers.values()).sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'hr')
          )
        );
      }`,
    'student mentor query'
  );

  transformed = replaceRequired(
    transformed,
    '  }, [studentId, isAccessible]);',
    '  }, [studentId, isAccessible, enrolledClassId]);',
    'student thesis data effect dependencies'
  );

  return transformed;
}

function transformClassSelectionPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    "import { Loader2, ArrowRight, Calendar, ChevronLeft, Plus, Award, FileText, UserX, Clock } from 'lucide-react';",
    "import { Loader2, ArrowRight, Calendar, ChevronLeft, Plus, Award, FileText, UserX, Clock, GraduationCap, User, Settings, LogOut } from 'lucide-react';",
    'class selection icons'
  );

  transformed = replaceRequired(
    transformed,
    "import { Header } from '../components/Header';",
    "import { Header } from '../components/Header';\nimport { isFinalThesisClass } from '../lib/finalThesisAccess';",
    'class selection access helper import'
  );

  transformed = replaceRequired(
    transformed,
    '  programName?: string;\n}',
    '  programName?: string;\n  durationYears?: number;\n}',
    'class details duration property'
  );

  transformed = replaceRequired(
    transformed,
    '  const { user, isParent, isStaff, isMainAdmin, userSchoolRoles } = useAuth();',
    '  const { user, isParent, isStaff, isMainAdmin, userSchoolRoles, signOut } = useAuth();',
    'class selection auth actions'
  );

  transformed = replaceRequired(
    transformed,
    '  const { setSelectedClassId, setIsArchived, setSelectedSchoolId, selectedSchoolId, selectedChildId } = useSelection();',
    '  const { setSelectedClassId, setIsArchived, setSelectedSchoolId, selectedSchoolId, selectedChildId, clearSelection } = useSelection();',
    'class selection clear action'
  );

  transformed = replaceRequired(
    transformed,
    "            programName: cls.program?.name || `${cls.grade_level}. razred`",
    "            programName: cls.program?.name || `${cls.grade_level}. razred`,\n            durationYears: Number(cls.program?.duration_years || 0)",
    'staff class duration mapping'
  );

  transformed = replaceRequired(
    transformed,
    "            programName: env.classes.program?.name || `${env.classes.grade_level}. razred`",
    "            programName: env.classes.program?.name || `${env.classes.grade_level}. razred`,\n            durationYears: Number(env.classes.program?.duration_years || 0)",
    'student class duration mapping'
  );

  transformed = replaceRequired(
    transformed,
    `  const handleSelectMenu = (cls: ClassWithDetails, path: string) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
    setIsArchived(cls.status !== 'ACTIVE' || selectedYear?.status === 'ARCHIVED');
    navigate(\`/student/\${path}\`);
  };`,
    `  const handleSelectMenu = (cls: ClassWithDetails, path: string) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
    setIsArchived(cls.status !== 'ACTIVE' || selectedYear?.status === 'ARCHIVED');
    navigate(\`/student/\${path}\`);
  };

  const handleLogout = async () => {
    await signOut();
    clearSelection();
    navigate('/login');
  };`,
    'mobile account actions'
  );

  transformed = replaceRequired(
    transformed,
    `  const menuItems = [
    { label: 'Ocjene', path: 'ocjene', icon: Award, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100/70' },
    { label: 'Bilješke', path: 'biljeske', icon: FileText, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100/70' },
    { label: 'Ispiti', path: 'ispiti', icon: Calendar, color: 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100/70' },
    { label: 'Izostanci', path: 'izostanci', icon: UserX, color: 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100/70' },
    { label: 'Raspored', path: 'raspored', icon: Clock, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70' },
  ];`,
    `  const menuItems = [
    { label: 'Ocjene', path: 'ocjene', icon: Award, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100/70', desktopOnly: false },
    { label: 'Bilješke', path: 'biljeske', icon: FileText, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100/70', desktopOnly: false },
    { label: 'Ispiti', path: 'ispiti', icon: Calendar, color: 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100/70', desktopOnly: false },
    { label: 'Izostanci', path: 'izostanci', icon: UserX, color: 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100/70', desktopOnly: false },
    { label: 'Raspored', path: 'raspored', icon: Clock, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70', desktopOnly: false },
  ];`,
    'class card menu items'
  );

  transformed = replaceRequired(
    transformed,
    '      <Header showNav={false} />\n      <div className="flex-1 max-w-5xl mx-auto py-12 px-6 w-full">',
    `      <Header showNav={false} />

      {!isStaff && (
        <div className="lg:hidden sticky top-0 z-40 bg-[#005c8d] text-white border-b border-[#004a70] shadow-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-black truncate">{formatPersonName(user)}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-sky-100/80">Učenički račun</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/student/osobni-podaci')}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Osobni podaci"
                aria-label="Osobni podaci"
              >
                <User size={18} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/student/postavke')}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Postavke"
                aria-label="Postavke"
              >
                <Settings size={18} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-10 h-10 rounded-lg bg-red-500/25 hover:bg-red-500/40 flex items-center justify-center text-red-100"
                title="Odjava"
                aria-label="Odjava"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-5xl mx-auto py-5 sm:py-8 lg:py-12 px-4 sm:px-6 w-full">`,
    'mobile class selection account bar'
  );

  transformed = replaceRequired(
    transformed,
    '        <div className="flex justify-between items-center mb-8">',
    '        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 lg:mb-8">',
    'responsive class selection actions'
  );

  transformed = replaceRequired(
    transformed,
    '          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir razreda</h1>',
    '          <h1 className="text-xl sm:text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir razreda</h1>',
    'responsive class selection heading'
  );

  if (!transformed.includes('const classMenuItems = [')) {
  const formattedAverageIndex = transformed.indexOf('const formattedAverage');
  const remainingSource = formattedAverageIndex >= 0
    ? transformed.slice(formattedAverageIndex)
    : '';
  const returnMatch = remainingSource.match(/\n(\s*)return \(/);

  if (formattedAverageIndex < 0 || !returnMatch || returnMatch.index === undefined) {
    throw new Error('[student-portal-experience] Expected class final thesis card insertion point was not found.');
  }

  const returnIndex = formattedAverageIndex + returnMatch.index + 1;
  const indent = returnMatch[1];
  const classMenuBlock = `${indent}const classMenuItems = [
${indent}  ...menuItems,
${indent}  ...(isFinalThesisClass({
${indent}    name: cls.name,
${indent}    gradeLevel: cls.gradeLevel,
${indent}    durationYears: cls.durationYears,
${indent}  })
${indent}    ? [{
${indent}        label: 'Završni rad',
${indent}        path: 'zavrsni-rad',
${indent}        icon: GraduationCap,
${indent}        color: 'text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100/70',
${indent}        desktopOnly: true,
${indent}      }]
${indent}    : []),
${indent}];\n\n`;

  transformed =
    transformed.slice(0, returnIndex) +
    classMenuBlock +
    transformed.slice(returnIndex);
}

  transformed = replaceRequired(
    transformed,
    '                    <div key={cls.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between">',
    '                    <div key={cls.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all p-4 sm:p-6 flex flex-col justify-between min-w-0">',
    'responsive class card padding'
  );

  transformed = replaceRequired(
    transformed,
    '                      <div className="grid grid-cols-5 gap-1.5 my-5">\n                        {menuItems.map(item => {',
    '                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 my-5">\n                        {classMenuItems.map(item => {',
    'responsive class card menu grid'
  );

  transformed = replaceRequired(
    transformed,
    '                                "flex flex-col items-center justify-center p-2 rounded border border-slate-100 transition-all text-center cursor-pointer",\n                                item.color',
    '                                "flex-col items-center justify-center p-2.5 min-h-[62px] rounded border border-slate-100 transition-all text-center cursor-pointer",\n                                item.desktopOnly ? "hidden lg:flex" : "flex",\n                                item.color',
    'desktop final thesis card button'
  );

  return transformed;
}

function transformDashboardLayout(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    `const STUDENT_NAV: NavItem[] = [
  { label: 'Ocjene', path: '/student/ocjene' },
  { label: 'Bilješke', path: '/student/biljeske' },
  { label: 'Ispiti', path: '/student/ispiti' },
  { label: 'Izostanci', path: '/student/izostanci' },
  { label: 'Raspored', path: '/student/raspored' },
  { label: 'Kalendar škole', path: '/student/kalendar' },
  { label: 'Informativka', path: '/student/informativka' },
  { label: 'Završni rad', path: '/student/zavrsni-rad' },
];`,
    `const STUDENT_NAV: NavItem[] = [
  { label: 'Ocjene', path: '/student/ocjene', icon: <BookOpen size={14} /> },
  { label: 'Bilješke', path: '/student/biljeske', icon: <FileText size={14} /> },
  { label: 'Ispiti', path: '/student/ispiti', icon: <Calendar size={14} /> },
  { label: 'Izostanci', path: '/student/izostanci', icon: <Clock size={14} /> },
  { label: 'Raspored', path: '/student/raspored', icon: <Calendar size={14} /> },
  { label: 'Kalendar škole', path: '/student/kalendar', icon: <Calendar size={14} /> },
  { label: 'Informativka', path: '/student/informativka', icon: <ClipboardList size={14} /> },
  { label: 'Završni rad', path: '/student/zavrsni-rad', icon: <FileSpreadsheet size={14} /> },
];`,
    'student desktop navigation icons'
  );

  transformed = replaceRequired(
    transformed,
    `      )}

      {/* Main Content Area */}`,
    `      )}

      {/* Student top navigation is desktop/laptop only. Mobile and tablet use the existing bottom/"Više" navigation. */}
      {!isStaff && effectiveClassId && (
        <div className="bg-white border-b border-[#dee2e6] h-14 hidden xl:flex items-center px-6 shadow-sm z-30 overflow-x-auto">
          <div className="flex items-center gap-1 h-full min-w-max">
            {studentNavFiltered.map(tab => (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "px-3 h-full flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap cursor-pointer",
                  location.pathname.startsWith(tab.path)
                    ? "border-[#005c8d] text-[#005c8d] bg-sky-50"
                    : "text-gray-500 border-transparent hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}`,
    'student desktop upper navigation'
  );

  transformed = transformed
    .replace('h-14 hidden lg:flex items-center justify-between px-6', 'h-14 hidden xl:flex items-center justify-between px-6')
    .replaceAll('lg:hidden', 'xl:hidden')
    .replace('mb-16 lg:mb-0', 'mb-16 xl:mb-0');

  return transformed;
}

function transformApp(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    '  const location = window.location.pathname;\n\n  const [loading, setLoading] = React.useState(false);',
    `  const location = window.location.pathname;
  const canOpenStudentAccountWithoutClass =
    location.startsWith('/student/osobni-podaci') ||
    location.startsWith('/student/postavke');

  const [loading, setLoading] = React.useState(false);`,
    'class-independent student account routes'
  );

  transformed = replaceRequired(
    transformed,
    "  if (role === 'STUDENT' && !selectedClassId) {",
    "  if (role === 'STUDENT' && !selectedClassId && !canOpenStudentAccountWithoutClass) {",
    'student selection guard bypass'
  );

  return transformed;
}

export function studentPortalExperiencePlugin(): Plugin {
  return {
    name: 'student-portal-experience',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');

      if (cleanId.endsWith(FINAL_THESIS_STUDENT_MODULE)) {
        const transformed = transformFinalThesisStudentPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(CLASS_SELECTION_MODULE)) {
        const transformed = transformClassSelectionPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(DASHBOARD_LAYOUT_MODULE)) {
        const transformed = transformDashboardLayout(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(APP_MODULE)) {
        const transformed = transformApp(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      return null;
    },
  };
}
