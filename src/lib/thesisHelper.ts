const normalizeClassName = (value?: string | null) =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export const isClassEligibleForFinalThesis = (clazz: any, explicitProgram?: any): boolean => {
  if (!clazz || !clazz.grade_level) return false;

  if (normalizeClassName(clazz.name) === '4.K') {
    return false;
  }

  const rawProgram = explicitProgram ?? clazz.programs ?? clazz.program;
  const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;
  const duration = program?.duration_years;

  return Boolean(duration && Number(clazz.grade_level) === Number(duration));
};

export const isFinalGradeStudent = (
  studentProfile: any, // Need to define types better?
  clazz: any,
  program: any
): boolean => {
  return isClassEligibleForFinalThesis(clazz, program);
};
