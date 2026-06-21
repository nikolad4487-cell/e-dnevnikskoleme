import type { Plugin } from 'vite';

const STUDENT_FINAL_THESIS_MODULE = '/src/pages/student/FinalThesisPage.tsx';
const TEACHER_FINAL_THESIS_MODULE = '/src/pages/teacher/FinalThesisTeacherPage.tsx';

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`[final-thesis-persistence] Expected ${label} block was not found.`);
  }
  return source.replace(before, after);
}

function transformStudentPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    `      // Get student's class and school from user profile or enrollment
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('class_id, school_id')
        .eq('id', studentId)
        .maybeSingle();

      const class_id = profile?.class_id || 'N/A';
      const school_id = profile?.school_id || 'N/A';`,
    `      // Always use the student's active enrollment. user_profiles.class_id can be empty or stale.
      if (!enrolledClassId) {
        throw new Error('Nije pronađen aktivni razred učenika.');
      }

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('school_id, school_year_id')
        .eq('id', enrolledClassId)
        .maybeSingle();

      if (classError || !classData?.school_id) {
        throw classError || new Error('Nije pronađena škola za aktivni razred učenika.');
      }

      const class_id = enrolledClassId;
      const school_id = classData.school_id;
      const school_year_id = classData.school_year_id || null;`,
    'student class and school resolution'
  );

  transformed = replaceRequired(
    transformed,
    `        class_id,
        school_id,
        thesis_title: title.trim(),`,
    `        class_id,
        school_id,
        school_year_id,
        thesis_title: title.trim(),`,
    'student application context payload'
  );

  return transformed;
}

function transformTeacherPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    '      setStudents(classStudents);',
    `      setStudents(classStudents);

      const classStudentIds = new Set(classStudents.map((student: any) => student.id));
      const normalizeClassApplications = (items: any[]) =>
        (items || [])
          .filter((application: any) =>
            application.class_id === selectedClassId ||
            (!application.class_id && classStudentIds.has(application.student_id))
          )
          .map((application: any) =>
            application.class_id
              ? application
              : { ...application, class_id: selectedClassId }
          );`,
    'legacy class application normalizer'
  );

  transformed = replaceRequired(
    transformed,
    '      const response = await fetch(`/api/final-thesis?classId=${encodeURIComponent(selectedClassId)}`);',
    "      const response = await fetch('/api/final-thesis');",
    'teacher final thesis API fetch'
  );

  transformed = replaceRequired(
    transformed,
    '        setApplications((data || []).filter((app: any) => app.class_id === selectedClassId));',
    '        setApplications(normalizeClassApplications(data || []));',
    'teacher API application normalization'
  );

  transformed = replaceRequired(
    transformed,
    `          .from('final_thesis_applications')
          .select('*')
          .eq('class_id', selectedClassId)
          .order('submitted_at', { ascending: false });`,
    `          .from('final_thesis')
          .select('*')
          .order('submitted_at', { ascending: false });`,
    'teacher fallback table'
  );

  transformed = replaceRequired(
    transformed,
    '        if (data) setApplications((data as any[]).filter(app => app.class_id === selectedClassId));',
    '        if (data) setApplications(normalizeClassApplications(data as any[]));',
    'teacher fallback application normalization'
  );

  return transformed;
}

export function finalThesisPersistencePlugin(): Plugin {
  return {
    name: 'final-thesis-persistence',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');

      if (cleanId.endsWith(STUDENT_FINAL_THESIS_MODULE)) {
        const transformed = transformStudentPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(TEACHER_FINAL_THESIS_MODULE)) {
        const transformed = transformTeacherPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      return null;
    },
  };
}
