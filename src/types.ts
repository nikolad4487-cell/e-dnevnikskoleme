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
  requiresPasswordChange?: boolean;
  passwordType?: 'NORMAL_PASSWORD' | 'FIRST_LOGIN_OTP_SETUP';
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

export type Class = {
  id: string;
  schoolId: string;
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
  variant?: ClassVariant;
};

export type Subject = {
  id: string;
  schoolId: string;
  name: string;
  code?: string;
  gradingElements?: string[];
};

export type ClassSubjectTeacher = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  schoolId?: string;
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
  CEKA = 'CEKA',
  OPRAVDANO = 'OPRAVDANO',
  NEOPRAVDANO = 'NEOPRAVDANO'
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
};

export type Grade = {
  id: string;
  studentId: string;
  subjectId: string;
  teacherId: string;
  classId?: string;
  value: number;
  note?: string;
  category?: string;
  weight: number;
  isImportant: boolean;
  date: string;
};

export type Exam = {
  id: string;
  classId: string;
  subjectId: string;
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
  schoolYear: string;
  average: number;
  behavior: string;
  finalResult?: number;
  finalizedAt?: string;
  finalizedBy?: string;
};

export type StudentSubjectEnrollment = {
  id: string;
  studentId: string;
  subjectId: string;
  classId: string;
  status: 'ACTIVE' | 'EXEMPT';
  schoolYear?: string;
};

export type FinalGrade = {
  id: string;
  studentId: string;
  subjectId: string;
  classId: string;
  schoolId: string;
  teacherId: string;
  value: number | string;
  period: string;
  date: string;
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
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

export type Program = {
  id: string;
  schoolId: string;
  name: string;
  durationYears: number;
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


export type ClassVariant = 'Redovni' | 'Pošteni' | 'Posebni';
export type ContinuationType = 'REDOVNI' | 'PONAVLJA' | 'ZAVRŠAVA';

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
