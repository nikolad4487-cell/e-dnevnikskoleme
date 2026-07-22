import { supabase } from './supabase';
import { formatSubjectDisplayName, formatSubjectName } from './utils';

const normalizeRelated = (value: any) => Array.isArray(value) ? value[0] : value;

export type ClassSubjectOption = {
  id: string;
  classSubjectId: string;
  assignmentId: string;
  classId: string;
  schoolId?: string | null;
  subjectId: string;
  teacherId: string;
  primaryTeacherId: string;
  subjectType: string;
  subjectPeriod: string;
  groupName?: string | null;
  group_name?: string | null;
  subject: any;
  teacher: any | null;
  teachers: any[];
  class_subject: any;
  name: string;
  displayName: string;
  code?: string | null;
};

export async function fetchClassSubjectOptions(classId: string): Promise<ClassSubjectOption[]> {
  if (!classId) return [];

  const { data: classSubjects, error: classSubjectsError } = await supabase
    .from('class_subjects')
    .select(`
      *,
      subject:subjects(*)
    `)
    .eq('class_id', classId);

  if (classSubjectsError) throw classSubjectsError;

  const { data: subjectTeachers, error: subjectTeachersError } = await supabase
    .from('class_subject_teachers')
    .select(`
      *,
      teacher:user_profiles(*)
    `)
    .eq('class_id', classId);

  if (subjectTeachersError) throw subjectTeachersError;

  const teachersBySubjectId = new Map<string, any[]>();
  (subjectTeachers || []).forEach((assignment: any) => {
    const subjectId = assignment.subject_id;
    if (!subjectId) return;

    const list = teachersBySubjectId.get(subjectId) || [];
    list.push({
      ...assignment,
      teacher: normalizeRelated(assignment.teacher),
    });
    teachersBySubjectId.set(subjectId, list);
  });

  const options = (classSubjects || [])
    .map((classSubject: any) => {
      const subject = normalizeRelated(classSubject.subject);
      if (!subject || !classSubject.subject_id) return null;

      const teachers = teachersBySubjectId.get(classSubject.subject_id) || [];
      const primaryTeacherAssignment = teachers[0] || null;
      const subjectType = classSubject.subject_type || 'REDOVNI';
      const subjectPeriod = classSubject.subject_period || 'FULL_YEAR';
      const displayName = formatSubjectDisplayName(formatSubjectName(subject), subjectType);

      return {
        id: classSubject.id,
        classSubjectId: classSubject.id,
        assignmentId: primaryTeacherAssignment?.id || '',
        classId: classSubject.class_id,
        schoolId: classSubject.school_id,
        subjectId: classSubject.subject_id,
        teacherId: primaryTeacherAssignment?.teacher_id || '',
        primaryTeacherId: primaryTeacherAssignment?.teacher_id || '',
        subjectType,
        subjectPeriod,
        groupName: primaryTeacherAssignment?.group_name || null,
        group_name: primaryTeacherAssignment?.group_name || null,
        subject,
        teacher: primaryTeacherAssignment?.teacher || null,
        teachers,
        class_subject: {
          ...classSubject,
          subject_type: subjectType,
          subject_period: subjectPeriod,
        },
        name: subject.name || '',
        displayName,
        code: subject.code || null,
      };
    })
    .filter(Boolean) as ClassSubjectOption[];

  return options.sort((a, b) => a.displayName.localeCompare(b.displayName, 'hr', { sensitivity: 'base' }));
}