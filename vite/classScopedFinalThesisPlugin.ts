import type { Plugin } from 'vite';

const TARGET_MODULE = '/src/pages/teacher/FinalThesisTeacherPage.tsx';

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`[class-scoped-final-thesis] Expected ${label} block was not found.`);
  }
  return source.replace(before, after);
}

export function classScopedFinalThesisPlugin(): Plugin {
  return {
    name: 'class-scoped-final-thesis',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith(TARGET_MODULE)) return null;

      let transformed = code;

      transformed = replaceRequired(
        transformed,
        "  const [activeTab, setActiveTab] = useState<'mentorship' | 'class' | 'all' | 'archive' | 'defense'>('mentorship');",
        "  const [activeTab, setActiveTab] = useState<'mentorship' | 'class' | 'all' | 'archive' | 'defense'>('class');",
        'default tab'
      );

      transformed = replaceRequired(
        transformed,
        '  const [canAccessClass, setCanAccessClass] = useState(true);',
        '  const [canAccessClass, setCanAccessClass] = useState(false);',
        'initial access state'
      );

      transformed = replaceRequired(
        transformed,
        `    } else {
        setCanAccessClass(true);
    }
  }, [selectedClassId]);`,
        `    } else {
        setCanAccessClass(false);
    }
  }, [selectedClassId]);`,
        'missing class access state'
      );

      transformed = replaceRequired(
        transformed,
        `  const fetchDefenseSchedules = async () => {
    if (!selectedSchoolId) return;
    try {
      const schedsRes = await fetch(\`/api/final-exam-defense-schedules?schoolId=\${selectedSchoolId}\`);
      if (schedsRes.ok) {
        const schedsData = await schedsRes.json();
        setDefenseSchedules(schedsData || []);
      }
    } catch (err) {
      console.error("FINAL EXAM DEFENSE LOAD ERROR:", err);
    }
  };`,
        `  const fetchDefenseSchedules = async () => {
    if (!selectedSchoolId || !selectedClassId) {
      setDefenseSchedules([]);
      return;
    }
    try {
      const schedsRes = await fetch(
        \`/api/final-exam-defense-schedules?schoolId=\${encodeURIComponent(selectedSchoolId)}&classId=\${encodeURIComponent(selectedClassId)}\`
      );
      if (schedsRes.ok) {
        const schedsData = await schedsRes.json();
        setDefenseSchedules((schedsData || []).filter((schedule: any) => schedule.class_id === selectedClassId));
      }
    } catch (err) {
      console.error("FINAL EXAM DEFENSE LOAD ERROR:", err);
    }
  };`,
        'defense schedule fetch'
      );

      transformed = replaceRequired(
        transformed,
        `  const fetchTeacherData = async () => {
    setLoading(true);
    try {`,
        `  const fetchTeacherData = async () => {
    setLoading(true);

    if (!selectedClassId) {
      setApplications([]);
      setDefenseSchedules([]);
      setStudents([]);
      setClasses([]);
      setLoading(false);
      return;
    }

    try {`,
        'teacher data guard'
      );

      transformed = replaceRequired(
        transformed,
        `      // 1. Fetch Students
      const { data: studentsData } = await supabase
        .from('user_profiles')
        .select('id, name, class_id')
        .eq('role', 'STUDENT');
      setStudents(studentsData || []);`,
        `      // 1. Fetch only students enrolled in the currently selected class
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(id, name)')
        .eq('class_id', selectedClassId)
        .eq('status', 'ACTIVE');

      if (enrollmentError) throw enrollmentError;

      const classStudents = (enrollmentData || [])
        .map((row: any) => row.student)
        .filter(Boolean);
      setStudents(classStudents);`,
        'class student query'
      );

      transformed = replaceRequired(
        transformed,
        `      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, homeroom_teacher_id, grade_level, school_year_id, school_id, programs:program_id(duration_years, name)');
      setClasses(classesData || []);`,
        `      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, homeroom_teacher_id, grade_level, school_year_id, school_id, programs:program_id(duration_years, name)')
        .eq('id', selectedClassId);
      setClasses(classesData || []);`,
        'selected class query'
      );

      transformed = replaceRequired(
        transformed,
        "      const response = await fetch('/api/final-thesis');",
        "      const response = await fetch(`/api/final-thesis?classId=${encodeURIComponent(selectedClassId)}`);",
        'final thesis API query'
      );

      transformed = replaceRequired(
        transformed,
        '        setApplications(data || []);',
        '        setApplications((data || []).filter((app: any) => app.class_id === selectedClassId));',
        'API applications filter'
      );

      transformed = replaceRequired(
        transformed,
        `          .from('final_thesis_applications')
          .select('*')
          .order('submitted_at', { ascending: false });`,
        `          .from('final_thesis_applications')
          .select('*')
          .eq('class_id', selectedClassId)
          .order('submitted_at', { ascending: false });`,
        'fallback applications query'
      );

      transformed = replaceRequired(
        transformed,
        '        if (data) setApplications(data as any[]);',
        '        if (data) setApplications((data as any[]).filter(app => app.class_id === selectedClassId));',
        'fallback applications filter'
      );

      transformed = replaceRequired(
        transformed,
        `  // Filters logic
  // tab logic
  let filtered = applications;
  if (activeTab === 'mentorship') {
    filtered = applications.filter(app => app.mentor_id === user?.id);
  } else if (activeTab === 'class') {
    filtered = applications.filter(app => app.class_id === selectedClassId);
  } else if (activeTab === 'all') {
    if (!isSchoolAdmin) {
      // Just in case non-admin tries to click, restrict
      filtered = applications.filter(app => app.mentor_id === user?.id || app.class_id === selectedClassId);
    }
  }`,
        `  // Every tab is scoped to the currently selected class.
  let filtered = applications.filter(app => app.class_id === selectedClassId);
  if (activeTab === 'mentorship') {
    filtered = filtered.filter(app => app.mentor_id === user?.id);
  } else if (activeTab === 'all' && !isSchoolAdmin) {
    filtered = filtered.filter(app => app.mentor_id === user?.id);
  }`,
        'tab filtering'
      );

      transformed = replaceRequired(
        transformed,
        '              Sve prijave škole ({applications.length})',
        '              Sve prijave razreda ({applications.length})',
        'class applications label'
      );

      transformed = replaceRequired(
        transformed,
        `                const visibleSchedules = isSchoolAdmin
                  ? defenseSchedules
                  : defenseSchedules.filter(s => (s.members || []).some((m: any) => m.teacher_profile_id === user?.id));`,
        `                const classSchedules = defenseSchedules.filter(s => s.class_id === selectedClassId);
                const visibleSchedules = isSchoolAdmin
                  ? classSchedules
                  : classSchedules.filter(s => (s.members || []).some((m: any) => m.teacher_profile_id === user?.id));`,
        'defense schedule visibility'
      );

      transformed = replaceRequired(
        transformed,
        'Nema rasporeda za odabranu školu.',
        'Nema rasporeda za odabrani razred.',
        'empty schedule message'
      );

      transformed = replaceRequired(
        transformed,
        '          classes={classes}',
        '          classes={classes.filter(c => c.id === selectedClassId)}',
        'modal class list'
      );

      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
