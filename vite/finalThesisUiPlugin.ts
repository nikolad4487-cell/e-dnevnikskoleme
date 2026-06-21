import type { Plugin } from 'vite';

const TARGET = '/src/pages/teacher/FinalThesisTeacherPage.tsx';

function cut(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from < 0) return source;
  const to = source.indexOf(end, from + start.length);
  if (to < 0) throw new Error('Expected final thesis UI marker was not found.');
  return source.slice(0, from) + source.slice(to);
}

export function finalThesisUiPlugin(): Plugin {
  return {
    name: 'final-thesis-ui',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith(TARGET)) return null;

      let result = code;
      result = cut(
        result,
        '  // Defense schedule schedule state',
        '  const [canAccessClass, setCanAccessClass]'
      );
      result = cut(
        result,
        '  const handleDefenseSubmit = async (e: React.FormEvent) => {',
        '  const handleRejectSubmit = async (e: React.FormEvent) => {'
      );
      result = cut(
        result,
        '                          {/* Defense calendaring schedule button */}',
        '                          {/* Mentor can approve or reject newly submitted ones */}'
      );
      result = cut(
        result,
        '      {/* Raspored obrane modal */}',
        '      {(isDefenseScheduleModalOpen || editDefenseSchedule) && selectedSchoolId && ('
      );

      return result === code ? null : { code: result, map: null };
    },
  };
}
