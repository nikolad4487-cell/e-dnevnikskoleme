import type { Plugin } from 'vite';

const LAYOUT_MODULE = '/src/components/ClassDashboardLayout.tsx';
const STUDENT_PAGE_MODULE = '/src/pages/student/FinalThesisPage.tsx';
const TEACHER_PAGE_MODULE = '/src/pages/teacher/FinalThesisTeacherPage.tsx';

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`[hide-final-thesis-for-4k] Expected ${label} block was not found.`);
  }
  return source.replace(before, after);
}

function transformLayout(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    "import { Header } from './Header';",
    "import { Header } from './Header';\nimport { isFinalThesisClass } from '../lib/finalThesisAccess';",
    'layout access import'
  );

  transformed = replaceRequired(
    transformed,
    '  const [canAccessThesis, setCanAccessThesis] = React.useState(true);',
    '  const [canAccessThesis, setCanAccessThesis] = React.useState(false);',
    'layout initial thesis visibility'
  );

  transformed = replaceRequired(
    transformed,
    ".select('class_id, student_id, classes:class_id(grade_level, program_id, programs:program_id(duration_years))')",
    ".select('class_id, student_id, classes:class_id(name, grade_level, program_id, programs:program_id(duration_years))')",
    'student class access query'
  );

  transformed = replaceRequired(
    transformed,
    ".select('grade_level, program_id, programs:program_id(duration_years)')",
    ".select('name, grade_level, program_id, programs:program_id(duration_years)')",
    'teacher class access query'
  );

  const oldAccessCheck = `                        if (gradeLevel && durationYears) {
                           setCanAccessThesis(gradeLevel === durationYears);
                        } else {
                           setCanAccessThesis(false);
                        }`;

  const newAccessCheck = `                        setCanAccessThesis(isFinalThesisClass({
                          name: clazz.name,
                          gradeLevel,
                          durationYears,
                        }));`;

  if (!transformed.includes(newAccessCheck)) {
    if (!transformed.includes(oldAccessCheck)) {
      throw new Error('[hide-final-thesis-for-4k] Expected student access check was not found.');
    }
    transformed = transformed.replace(oldAccessCheck, newAccessCheck);
  }

  const oldStaffAccessCheck = `                        if (gradeLevel && durationYears) {
                            setCanAccessThesis(gradeLevel === durationYears);
                        } else {
                            setCanAccessThesis(false);
                        }`;

  const newStaffAccessCheck = `                        setCanAccessThesis(isFinalThesisClass({
                          name: clazz.name,
                          gradeLevel,
                          durationYears,
                        }));`;

  if (!transformed.includes(newStaffAccessCheck)) {
    if (!transformed.includes(oldStaffAccessCheck)) {
      throw new Error('[hide-final-thesis-for-4k] Expected teacher access check was not found.');
    }
    transformed = transformed.replace(oldStaffAccessCheck, newStaffAccessCheck);
  }

  transformed = transformed.replace(
    '                } else {\n                    setCanAccessThesis(true);\n                }',
    '                } else {\n                    setCanAccessThesis(false);\n                }'
  );

  return transformed;
}

function transformStudentPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    "import { FinalExamDefenseSchedule } from '../../components/FinalExamDefenseSchedule';",
    "import { FinalExamDefenseSchedule } from '../../components/FinalExamDefenseSchedule';\nimport { isFinalThesisClass } from '../../lib/finalThesisAccess';",
    'student page access import'
  );

  transformed = replaceRequired(
    transformed,
    ".select('class_id, student_id, classes:class_id(grade_level, program_id, programs:program_id(duration_years))')",
    ".select('class_id, student_id, classes:class_id(name, grade_level, program_id, programs:program_id(duration_years))')",
    'student page class query'
  );

  transformed = replaceRequired(
    transformed,
    `            const clazz = enrollment.classes as any;
            const program = clazz.programs as any;
            if (program && clazz.grade_level !== undefined) {
               setIsAccessible(clazz.grade_level === program.duration_years);
            } else {
               setIsAccessible(false);
            }`,
    `            const rawClass = enrollment.classes as any;
            const clazz = Array.isArray(rawClass) ? rawClass[0] : rawClass;
            const rawProgram = clazz?.programs;
            const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;

            setIsAccessible(isFinalThesisClass({
              name: clazz?.name,
              gradeLevel: clazz?.grade_level,
              durationYears: program?.duration_years,
            }));`,
    'student page access check'
  );

  return transformed;
}

function transformTeacherPage(code: string): string {
  let transformed = code;

  transformed = replaceRequired(
    transformed,
    "import FinalExamDefenseScheduleModal from '../../components/FinalExamDefenseScheduleModal';",
    "import FinalExamDefenseScheduleModal from '../../components/FinalExamDefenseScheduleModal';\nimport { isFinalThesisClass } from '../../lib/finalThesisAccess';",
    'teacher page access import'
  );

  transformed = replaceRequired(
    transformed,
    ".select('grade_level, program_id, programs:program_id(duration_years)')",
    ".select('name, grade_level, program_id, programs:program_id(duration_years)')",
    'teacher page class query'
  );

  transformed = replaceRequired(
    transformed,
    `            if (clazz) {
                const program = clazz.programs as any;
                if (program && clazz.grade_level) {
                    setCanAccessClass(clazz.grade_level === program.duration_years);
                } else {
                    setCanAccessClass(false);
                }
            } else {
                setCanAccessClass(false);
            }`,
    `            if (clazz) {
                const rawProgram = clazz.programs as any;
                const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;

                setCanAccessClass(isFinalThesisClass({
                  name: clazz.name,
                  gradeLevel: clazz.grade_level,
                  durationYears: program?.duration_years,
                }));
            } else {
                setCanAccessClass(false);
            }`,
    'teacher page access check'
  );

  return transformed;
}

export function hideFinalThesisFor4KPlugin(): Plugin {
  return {
    name: 'hide-final-thesis-for-4k',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');

      if (cleanId.endsWith(LAYOUT_MODULE)) {
        const transformed = transformLayout(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(STUDENT_PAGE_MODULE)) {
        const transformed = transformStudentPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      if (cleanId.endsWith(TEACHER_PAGE_MODULE)) {
        const transformed = transformTeacherPage(code);
        return transformed === code ? null : { code: transformed, map: null };
      }

      return null;
    },
  };
}
