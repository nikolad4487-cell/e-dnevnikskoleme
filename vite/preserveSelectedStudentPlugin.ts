import type { Plugin } from 'vite';

const TARGET_MODULE = '/src/pages/teacher/PedagoskaDokumentacijaPage.tsx';

const OLD_CLASS_SELECTION = `      // 3. Selection default
      if (sortedStudents.length > 0) {
        setSelectedStudent(sortedStudents[0]);
        loadStudentPedagogicalData(sortedStudents[0].id, cId, mappedClass.school_year_id);
      } else {
        setSelectedStudent(null);
        resetPedagogicalState();
      }
`;

const NEW_CLASS_SELECTION = `      // 3. Keep the currently selected student when class data is refreshed.
      if (sortedStudents.length > 0) {
        const studentToSelect =
          sortedStudents.find(student => student.id === selectedStudent?.id) ||
          sortedStudents[0];

        setSelectedStudent(studentToSelect);
        await loadStudentPedagogicalData(studentToSelect.id, cId, mappedClass.school_year_id);
      } else {
        setSelectedStudent(null);
        resetPedagogicalState();
      }
`;

const OLD_POST_SAVE_REFRESH = `        // 3. Complete actual refetch from the API / Supabase
        await loadClassData(activeClass.id);
        await loadStudentPedagogicalData(selectedStudent.id, activeClass.id, activeClass.school_year_id);
`;

const NEW_POST_SAVE_REFRESH = `        // Refresh only the selected student's datasets. Reloading the whole class
        // would reset the selection to the first student in the list.
        await loadStudentPedagogicalData(
          selectedStudent.id,
          activeClass.id,
          activeClass.school_year_id
        );
`;

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`[preserve-selected-student] Expected ${label} block was not found.`);
  }
  return source.replace(before, after);
}

/**
 * Keeps the current student selected after saving Pedagoška dokumentacija.
 *
 * The page previously reloaded the complete class after saving the basic
 * profile. That reload always selected the first student in the sorted list.
 * This pre-transform removes that class reload and preserves the current
 * student whenever class data is refreshed.
 */
export function preserveSelectedStudentPlugin(): Plugin {
  return {
    name: 'preserve-selected-student-after-pedagogical-save',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith(TARGET_MODULE)) return null;

      let transformed = replaceRequired(
        code,
        OLD_CLASS_SELECTION,
        NEW_CLASS_SELECTION,
        'class selection'
      );

      transformed = replaceRequired(
        transformed,
        OLD_POST_SAVE_REFRESH,
        NEW_POST_SAVE_REFRESH,
        'post-save refresh'
      );

      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
