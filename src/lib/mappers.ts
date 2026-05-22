/**
 * Mapping Layer: DB snake_case -> frontend camelCase
 */

export function mapObject<T>(obj: any, mapper: (item: any) => T): T {
  if (!obj) return null as any;
  return mapper(obj);
}

export function mapList<T>(list: any[] | null, mapper: (item: any) => T): T[] {
  if (!list) return [];
  return list.map(mapper);
}

export const mappers = {
  user: (raw: any) => ({
    id: raw.id,
    authUserId: raw.auth_user_id,
    email: raw.email,
    name: raw.name,
    surname: raw.surname,
    address: raw.address,
    oib: raw.oib,
    status: raw.status,
    isFirstLogin: raw.is_first_login,
    requiresAuthenticatorSetup: raw.requires_authenticator_setup,
    authenticatorSecret: raw.authenticator_secret,
    requiresPasswordChange: raw.requires_password_change,
    dob: raw.dob,
    pob: raw.pob,
    mobile: raw.mobile,
    programId: raw.program_id,
  }),

  userSchoolRole: (raw: any) => ({
    id: raw.id,
    userId: raw.user_id,
    schoolId: raw.school_id,
    role: raw.role,
    status: raw.status,
  }),

  school: (raw: any) => ({
    id: raw.id,
    name: raw.name,
    type: raw.type,
    subtype: raw.subtype,
    address: raw.address,
    city: raw.city,
  }),

  class: (raw: any) => ({
    id: raw.id,
    schoolId: raw.school_id,
    school_year_id: raw.school_year_id,
    schoolYear: raw.school_year,
    name: raw.name,
    gradeLevel: raw.grade_level,
    section: raw.section,
    status: raw.status,
    homeroomTeacherId: raw.homeroom_teacher_id,
    deputyTeacherId: raw.deputy_teacher_id,
    programId: raw.program_id,
    programType: raw.program?.type,
    classVariant: raw.class_variant,
    variant: raw.variant,
    homeroom: raw.homeroom ? mappers.user(raw.homeroom) : undefined,
    deputy: raw.deputy ? mappers.user(raw.deputy) : undefined,
    program: raw.program ? mappers.program(raw.program) : undefined,
  }),

  subject: (raw: any) => ({
    id: raw.id,
    schoolId: raw.school_id,
    name: raw.name,
    code: raw.code,
  }),

  lesson: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    date: raw.date,
    hour: raw.hour,
    topic: raw.topic,
    homework: raw.homework,
    notes: raw.notes,
    materials: raw.materials,
    groupName: raw.group_name,
    isHeld: raw.is_held,
    isBlock: raw.is_block,
    blockCount: raw.block_count,
    createdByUserId: raw.created_by_user_id,
    teacherDisplayName: raw.teacher_display_name,
  }),

  grade: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    classId: raw.class_id,
    schoolId: raw.school_id,
    value: raw.value,
    note: raw.note,
    element: raw.element,
    category: raw.category,
    gradeType: raw.grade_type,
    isFinal: raw.is_final,
    period: raw.period,
    weight: raw.weight,
    isImportant: raw.is_important,
    date: raw.date,
  }),

  absence: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    lessonId: raw.lesson_id,
    classId: raw.class_id,
    date: raw.date,
    hour: raw.hour,
    status: raw.status,
    note: raw.note,
    teacherId: raw.teacher_id,
    absenceType: raw.absence_type,
    justifiedBy: raw.justified_by,
    resolvedBy: raw.resolved_by,
    resolvedAt: raw.resolved_at,
  }),

  note: (raw: any) => ({
    id: raw.id,
    targetType: raw.target_type,
    targetId: raw.target_id,
    subjectId: raw.subject_id,
    authorId: raw.author_id,
    content: raw.content,
  }),

  exam: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    studentId: raw.student_id,
    teacherId: raw.teacher_id,
    schoolYearId: raw.school_year_id,
    gradeValue: raw.grade_value ? raw.grade_value.toString() : undefined,
    note: raw.note,
    date: raw.exam_date || raw.date, // fallback for backwards compat if needed momentarily
    type: raw.exam_type || raw.type,
    description: raw.description,
    createdBy: raw.created_by,
  }),

  finalGrade: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    schoolYearId: raw.school_year_id,
    term: raw.term,
    value: raw.value,
    note: raw.note,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }),
  
  classSubject: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    schoolId: raw.school_id,
    subjectType: raw.subject_type,
    isForeignLanguage: raw.is_foreign_language,
    subjectPeriod: raw.subject_period,
    plannedHoursSemester1: raw.planned_hours_semester_1,
    plannedHoursTotal: raw.planned_hours_total,
  }),

  classSubjectTeacher: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    schoolId: raw.school_id,
    groupName: raw.group_name,
  }),

  curriculumPlan: (raw: any) => ({
    id: raw.id,
    schoolId: raw.school_id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    weeklyHours: raw.weekly_hours,
    schoolYear: raw.school_year,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }),

  scheduleCell: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    dayOfWeek: raw.day_of_week,
    shift: raw.shift,
    periodNumber: raw.period_number,
  }),

  scheduleCellSubject: (raw: any) => ({
    id: raw.id,
    scheduleCellId: raw.schedule_cell_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    classroom: raw.classroom,
  }),

  week: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    schoolYear: raw.school_year,
    name: raw.name,
    startDate: raw.start_date,
    endDate: raw.end_date,
    shift: raw.shift,
    isTeachingWeek: raw.is_teaching_week,
    onDutyStudentIds: raw.on_duty_student_ids,
    teachingDays: raw.teaching_days,
  }),

  studentOverallNotes: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    classId: raw.class_id,
    schoolYear: raw.school_year,
    homeroomNote: raw.homeroom_note,
    extracurricularActivities: raw.extracurricular_activities,
    schoolActivities: raw.school_activities,
    disciplinaryActions: raw.disciplinary_actions,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }),

  classOverallNotes: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    schoolYear: raw.school_year,
    homeroomInfo: raw.homeroom_info,
    deputyInfo: raw.deputy_info,
  }),

  studentYearSummary: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    classId: raw.class_id,
    school_year_id: raw.school_year_id,
    schoolYear: raw.school_year,
    average: raw.average,
    behavior: raw.behavior,
    finalResult: raw.final_result,
    status: raw.status,
    finalizedAt: raw.finalized_at,
    finalizedBy: raw.finalized_by,
  }),

  schoolYear: (raw: any) => ({
    id: raw.id,
    schoolId: raw.school_id,
    name: raw.name,
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    isActive: raw.is_active,
  }),

  specialExam: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    subjectId: raw.subject_id,
    classId: raw.class_id,
    schoolId: raw.school_id,
    teacherId: raw.teacher_id,
    type: raw.type,
    note: raw.note,
    grade: raw.grade,
    date: raw.date,
  }),

  studentNote: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    subjectId: raw.subject_id,
    classId: raw.class_id,
    schoolId: raw.school_id,
    teacherId: raw.teacher_id,
    content: raw.content,
    category: raw.category,
    date: raw.date,
  }),

  studentSubjectEnrollment: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    subjectId: raw.subject_id,
    classId: raw.class_id,
    schoolYear: raw.school_year,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }),

  gradingElement: (raw: any) => ({
    id: raw.id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    name: raw.name,
    displayOrder: raw.display_order,
    createdAt: raw.created_at,
  }),

  program: (raw: any) => ({
    id: raw.id,
    schoolId: raw.school_id,
    name: raw.name,
    durationYears: raw.duration_years,
    type: raw.type,
  }),
};
