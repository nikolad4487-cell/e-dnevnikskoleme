import type { Plugin } from 'vite';

const TARGET = '/src/pages/teacher/ImenikPage.tsx';

const OLD_WARNING_LOADER = `  const fetchWarningData = async () => {
    if (!effectiveClassId) return;
    try {
      console.log("REFETCH WARNINGS - Class:", effectiveClassId);
      const { data: grades } = await supabase
        .from('grades')
        .select('student_id')
        .eq('class_id', effectiveClassId)
        .eq('value', 1);
      
      const { data: absences } = await supabase
        .from('absences')
        .select('student_id')
        .eq('class_id', effectiveClassId)
        .eq('status', 'PENDING');

      const failing: Record<string, number> = {};
      grades?.forEach(g => {
        failing[g.student_id] = (failing[g.student_id] || 0) + 1;
      });

      const pending: Record<string, boolean> = {};
      absences?.forEach(a => {
        pending[a.student_id] = true;
      });

      const newData = { failingGrades: failing, pendingAbsences: pending };
      console.log("WARNING DATA UPDATED", newData);
      setClassWarnings(newData);
    } catch (e) {
      console.error("Error fetching warnings:", e);
    }
  };`;

const NEW_WARNING_LOADER = `  const fetchWarningData = async () => {
    if (!effectiveClassId) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceDate = thirtyDaysAgo.toISOString().slice(0, 10);

      const [gradesResult, absencesResult] = await Promise.all([
        supabase
          .from('grades')
          .select('student_id, date')
          .eq('class_id', effectiveClassId)
          .eq('value', 1)
          .gte('date', sinceDate),
        supabase
          .from('absences')
          .select('student_id')
          .eq('class_id', effectiveClassId)
          .eq('status', 'PENDING'),
      ]);

      if (gradesResult.error) throw gradesResult.error;
      if (absencesResult.error) throw absencesResult.error;

      const failingGrades: Record<string, number> = {};
      for (const grade of gradesResult.data || []) {
        if (!grade.student_id) continue;
        failingGrades[grade.student_id] = (failingGrades[grade.student_id] || 0) + 1;
      }

      const pendingAbsences: Record<string, boolean> = {};
      for (const absence of absencesResult.data || []) {
        if (!absence.student_id) continue;
        pendingAbsences[absence.student_id] = true;
      }

      setClassWarnings({ failingGrades, pendingAbsences });
    } catch (error) {
      console.error('IMENIK WARNING LOAD ERROR:', error);
      setClassWarnings({ failingGrades: {}, pendingAbsences: {} });
    }
  };`;

export function imenikWarningsPlugin(): Plugin {
  return {
    name: 'imenik-warnings',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith(TARGET)) return null;
      if (code.includes('IMENIK WARNING LOAD ERROR:')) return null;
      if (!code.includes(OLD_WARNING_LOADER)) {
        throw new Error('[imenik-warnings] Warning loader was not found.');
      }
      return { code: code.replace(OLD_WARNING_LOADER, NEW_WARNING_LOADER), map: null };
    },
  };
}
