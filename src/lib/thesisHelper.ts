import { ThesisApplication } from '../types';

export const isFinalGradeStudent = (
  studentProfile: any, // Need to define types better?
  clazz: any,
  program: any
): boolean => {
  if (!clazz || !program || !clazz.grade_level) return false;
  
  const duration = program.duration_years || 4; // Default to 4
  const finalGradeLevel = duration;
  
  return clazz.grade_level === finalGradeLevel;
};
