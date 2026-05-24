export enum Role {
  MAIN_ADMIN = 'MAIN_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  TEACHER = 'TEACHER',
  HOMEROOM = 'HOMEROOM',
  DEPUTY = 'DEPUTY',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
  ADMIN = 'ADMIN'
}

export type SchoolType = 'PRIMARY' | 'SECONDARY';
export type SecondarySubtype = 'GENERAL' | 'VOCATIONAL';

export type School = {
  id: string;
  name: string;
  type: SchoolType;
  subtype: SecondarySubtype | null;
  address?: string;
  city?: string;
};

export type User = {
  id: string;
  authUserId?: string;
  email?: string;
  name: string;
  surname?: string;
  address?: string;
  isFirstLogin?: boolean;
  requiresAuthenticatorSetup?: boolean;
  authenticatorSecret?: string;
  requiresPasswordChange?: boolean;
  password_type?: 'standard' | 'student_static' | 'staff_with_authenticator' | 'NORMAL_PASSWORD' | 'FIRST_LOGIN_OTP_SETUP';
  oib?: string;
  dob?: string;
  pob?: string;
  mobile?: string;
  programId?: string;
  status?: 'ACTIVE' | 'INACTIVE';
};

export type UserSchoolRole = {
  id: string;
  userId: string;
  schoolId: string;
  role: Role;
  status: string;
};

export const PROGRAM_TYPES = {
  VOCATIONAL_3Y: 'VOCATIONAL_3Y',
  COMMERCIALIST_4Y: 'COMMERCIALIST_4Y',
  CONTINUATION_FREE: 'CONTINUATION_FREE',
  CONTINUATION_PAID: 'CONTINUATION_PAID'
} as const;
export type ProgramType = typeof PROGRAM_TYPES[keyof typeof PROGRAM_TYPES];

export const CONTINUATION_TYPES = {
  NONE: 'NONE',
  FREE: 'FREE',
  PAID: 'PAID'
} as const;
export type ContinuationType = typeof CONTINUATION_TYPES[keyof typeof CONTINUATION_TYPES];

export const CLASS_VARIANTS = {
  REGULAR: 'REGULAR',
  DIFFERENTIAL: 'DIFFERENTIAL',
  CONTINUATION_FREE: 'CONTINUATION_FREE',
  CONTINUATION_PAID: 'CONTINUATION_PAID'
} as const;
export type ClassVariant = typeof CLASS_VARIANTS[keyof typeof CLASS_VARIANTS];

export type Class = {
  id: string;
  schoolId: string;
  school_year_id: string;
  schoolYear: string;
  name: string;
  gradeLevel: number;
  section?: string;
  status: string;
  homeroomTeacherId: string;
  deputyTeacherId?: string;
  homeroom?: User;
  deputy?: User;
  programId?: string;
  programType?: ProgramType;
  classVariant?: ClassVariant;
  isContinuationProgram?: boolean;
};

export type Subject = {
  id: string;
  schoolId: string;
  name: string;
  code?: string;
  gradingElements?: string[];
};

export type ClassSubject = {
  id: string;
  classId: string;
  subjectId: string;
  schoolId?: string;
  subjectType: string;
  isForeignLanguage: boolean;
  subjectPeriod: string;
  plannedHoursSemester1?: number;
  plannedHoursTotal?: number;
};

export type ClassSubjectTeacher = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  schoolId?: string;
  groupName?: string;
};

export type StudentClassEnrollment = {
  id: string;
  studentId: string;
  classId: string;
  schoolYear: string;
  status: 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED';
};

export type CurriculumPlan = {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  weeklyHours: number;
  schoolYear: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GradingElement = {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  displayOrder: number;
  createdAt?: string;
};

export type Note = {
  id: string;
  targetType: 'STUDENT' | 'CLASS';
  targetId: string;
  subjectId?: string;
  authorId?: string;
  content: string;
};

export type WorkWeek = {
  id: string;
  classId: string;
  schoolYear: string;
  name: string;
  startDate: string;
  endDate: string;
  shift: 'Ujutro' | 'Popodne' | 'Cjelodnevna';
  isTeachingWeek: boolean;
  onDutyStudentIds: string[];
  teachingDays: string[];
  non_teaching_reason?: string;
  non_teaching_reason_note?: string;
};

export type Lesson = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  date: string;
  hour: number;
  topic: string;
  homework?: string;
  notes?: string;
  materials?: string;
  groupName?: string;
  isHeld: boolean;
  isBlock: boolean;
  blockCount: number;
  createdByUserId?: string;
  teacherDisplayName?: string;
};

export enum AbsenceStatus {
  PENDING = 'PENDING',
  JUSTIFIED = 'JUSTIFIED',
  UNJUSTIFIED = 'UNJUSTIFIED',
  OTHER = 'OTHER'
}

export type Absence = {
  id: string;
  studentId: string;
  lessonId?: string;
  classId: string;
  date: string;
  hour?: number;
  status: AbsenceStatus;
  note?: string;
  teacherId: string;
  absenceType?: string;
  justifiedBy?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

export type Grade = {
  id: string;
  studentId: string;
  subjectId: string;
  teacherId: string;
  classId?: string;
  schoolId?: string;
  value: number;
  note?: string;
  element?: string;
  category?: string;
  gradeType?: string;
  isFinal?: boolean;
  period?: string;
  weight: number;
  isImportant: boolean;
  date: string;
  createdAt?: string;
};

export type FinalGrade = {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string;
  teacherId?: string;
  schoolYearId?: string;
  term: 'FIRST_SEMESTER' | 'FINAL';
  value: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const specialExamTypeLabels: Record<string, string> = {
  SUPPLEMENTARY_WORK: 'Dopunski ispit',
  MAKEUP_EXAM: 'Popravni ispit',
  DIFFERENTIAL_EXAM: 'Razlikovni ispit',
  CLASS_EXAM: 'Razredni ispit',
  SUBJECT_EXAM: 'Predmetni ispit'
};

export const specialExamTypes = Object.keys(specialExamTypeLabels);

export type Exam = {
  id: string;
  classId: string;
  subjectId: string;
  studentId?: string;      // Optional, used for individual student exams
  teacherId?: string;      // Optional
  schoolYearId?: string;   // Optional
  gradeValue?: string;     // Optional
  note?: string;           // Optional
  date: string;
  type: string;
  description?: string;
  createdBy?: string;
};

export type ScheduleCell = {
  id: string;
  classId: string;
  dayOfWeek: string;
  shift: 'MORNING' | 'AFTERNOON';
  periodNumber: number;
};

export type ScheduleCellSubject = {
  id: string;
  scheduleCellId: string;
  subjectId: string;
  teacherId: string;
  classroom?: string;
};

export type StudentYearSummary = {
  id: string;
  studentId: string;
  classId: string;
  school_year_id: string;
  schoolYear: string;
  average: number;
  behavior: string;
  finalResult?: number;
  status: string;
  finalizedAt?: string;
  finalizedBy?: string;
  calculated_at?: string; // added
  overall_average?: number; // added
  overall_success?: string; // added
};

export type StudentSubjectEnrollment = {
  id: string;
  studentId: string;
  subjectId: string;
  classId: string;
  status: 'ACTIVE' | 'EXEMPT';
  schoolYear: string;
};

export type SpecialExam = {
  id: string;
  studentId: string;
  subjectId: string;
  classId: string;
  schoolId: string;
  teacherId: string;
  type: 'Dopunski' | 'Razlikovni';
  note: string;
  grade: number;
  date: string;
};

export type StudentNote = {
  id: string;
  studentId: string;
  subjectId: string;
  classId: string;
  schoolId: string;
  teacherId: string;
  content: string;
  category?: string;
  date: string;
};

export type StudentNotes = {
  id: string;
  studentId: string;
  classId: string;
  schoolYear: string;
  homeroomNote: string;
  extracurricularActivities: string;
  schoolActivities: string;
  disciplinaryActions: string;
  createdAt: string;
  updatedAt: string;
};

export type ClassNotes = {
  id: string;
  classId: string;
  schoolYear: string;
  homeroomInfo: string;
  deputyInfo: string;
};

export type SchoolYear = {
  id: string;
  schoolId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type Program = {
  id: string;
  schoolId: string;
  name: string;
  durationYears: number;
  type: ProgramType;
};

export type RolloverLog = {
  id: string;
  fromSchoolYearId?: string;
  toSchoolYearId: string;
  fromClassId: string;
  toClassId?: string;
  createdBy?: string;
  studentsTransferred: number;
};


export type ConductRecord = {
  id: string;
  student_id: string;
  class_id: string;
  school_year_id: string;
  term: 'FIRST_TERM' | 'SECOND_TERM' | 'FINAL';
  conduct: 'EXEMPLARY' | 'GOOD' | 'POOR';
  note?: string;
  created_by: string;
  created_at: string;
};

export type StudentProgressOpinion = {
  id: string;
  student_id: string;
  school_year_id: string;
  term: 'FIRST_TERM' | 'SECOND_TERM' | 'FINAL';
  opinion: string;
  created_by: string;
  created_at: string;
};

export type StudentSupport = {
  id: string;
  student_id: string;
  support_type: string;
  specialist: string;
  hours: number;
  starts_at: string;
  ends_at: string;
  note?: string;
  assigned_staff_id?: string;
  created_by: string;
  created_at: string;
};

export type AssistantStudentAssignment = {
  id: string;
  assistant_user_id: string;
  student_id: string;
  school_year_id: string;
  created_at: string;
};

// Removed duplicate and conflicting type definitions

export type ChatGroup = {
  id: string;
  name: string;
  type: 'PRIVATE' | 'GROUP';
  created_by: string;
};

export type Message = {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  createdAt: string;
};
