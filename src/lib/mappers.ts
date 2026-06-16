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
  user: (raw: any) => {
    if (!raw) return null as any;
    const fullName = raw.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    return {
      id: raw.id,
      authUserId: raw.auth_user_id,
      email: raw.email,
      name: firstName,
      surname: lastName,
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
      classId: raw.class_id,
      class_id: raw.class_id,
      studentRegistryNumber: raw.student_registry_number,
      fatherName: raw.father_name,
      motherName: raw.mother_name,
      birthplace: raw.birthplace,
      birthCountry: raw.birth_country,
      citizenship: raw.citizenship,
      gender: raw.gender,
      programAdjustment: raw.program_adjustment,
    };
  },

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
    schoolYearName: raw.school_year_relation?.name,
    schoolYearIsActive: raw.school_year_relation?.is_active,
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

  exam: (raw: any) => {
    let examGradeLevel = raw.exam_grade_level;
    let note = raw.note || '';
    if (examGradeLevel === undefined || examGradeLevel === null) {
      if (typeof note === 'string') {
        const match = note.match(/__grade_level:(\d)__/);
        if (match) {
          examGradeLevel = parseInt(match[1]);
          note = note.replace(/__grade_level:(\d)__\s*/, '');
        }
      }
    }
    const val = (raw.grade_value !== undefined && raw.grade_value !== null) ? raw.grade_value.toString() : (raw.value ? raw.value.toString() : undefined);
    return {
      id: raw.id,
      classId: raw.class_id,
      subjectId: raw.subject_id,
      studentId: raw.student_id,
      teacherId: raw.teacher_id,
      schoolYearId: raw.school_year_id,
      value: val,
      gradeValue: val,
      note: note,
      date: raw.exam_date || raw.date,
      type: raw.exam_type || raw.type,
      description: raw.description,
      createdBy: raw.created_by,
      examGradeLevel: examGradeLevel ?? null,
    };
  },

  finalGrade: (raw: any) => ({
    id: raw.id,
    studentId: raw.student_id,
    classId: raw.class_id,
    subjectId: raw.subject_id,
    teacherId: raw.teacher_id,
    schoolYearId: raw.school_year_id,
    term: raw.term,
    period: raw.period,
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
    weekType: raw.week_type || 'INSTRUCTIONAL',
    holidayType: raw.holiday_type || null,
    isInstructional: raw.is_instructional !== undefined ? raw.is_instructional : true,
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
    schoolYearId: raw.school_year_id,
    school_year_id: raw.school_year_id,
    schoolYear: raw.school_year,
    average: raw.average,
    behavior: raw.behavior,
    finalResult: raw.final_result,
    status: raw.status,
    finalizedAt: raw.finalized_at,
    finalizedBy: raw.finalized_by,
    overallAverage: raw.average,
    overallSuccess: raw.overall_success || raw.final_result,
    conduct: raw.conduct || raw.behavior,
    calculatedAt: raw.calculated_at,
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
