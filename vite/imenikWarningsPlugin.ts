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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error('Aktivna korisnička sesija nije pronađena.');
      }

      const response = await fetch(
        '/api/imenik-warnings?classId=' + encodeURIComponent(effectiveClassId),
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            Accept: 'application/json',
          },
          cache: 'no-store',
        }
      );

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('API za upozorenja nije vratio JSON odgovor.');
      }

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Upozorenja nije moguće učitati.');
      }

      setClassWarnings({
        failingGrades: payload.failingGrades || {},
        pendingAbsences: payload.pendingAbsences || {},
      });
    } catch (error) {
      console.error('IMENIK WARNING API ERROR:', error);
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

      if (code.includes('IMENIK WARNING API ERROR:')) {
        return null;
      }

      if (!code.includes(OLD_WARNING_LOADER)) {
        throw new Error('[imenik-warnings] Warning loader was not found.');
      }

      return {
        code: code.replace(OLD_WARNING_LOADER, NEW_WARNING_LOADER),
        map: null,
      };
    },
  };
}
