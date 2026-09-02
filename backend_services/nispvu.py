from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Iterable, List, Mapping, Optional, Protocol, Sequence
from uuid import UUID, uuid4


class MaxPrioritiesExceededException(Exception):
    pass


class UnauthorizedAccessException(Exception):
    pass


class DeadlineExceededException(Exception):
    pass


class ValidationException(Exception):
    pass


class ExamLevel(str, Enum):
    A_RAZINA = "A_RAZINA"
    B_RAZINA = "B_RAZINA"


class ExamRegistrationStatus(str, Enum):
    REGISTERED = "REGISTERED"
    CANCELED = "CANCELED"


class UserRole(str, Enum):
    STUDENT = "STUDENT"
    UNIVERSITY_ADMIN = "UNIVERSITY_ADMIN"
    ADMIN = "ADMIN"


@dataclass(frozen=True)
class User:
    id: UUID
    role: UserRole
    university_id: Optional[UUID] = None


@dataclass
class StudentProfile:
    id: UUID
    user_id: UUID
    high_school_gpa: float
    academic_history: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 1.0 <= self.high_school_gpa <= 5.0:
            raise ValidationException("High school GPA must be between 1.0 and 5.0.")


@dataclass
class MaturaExamRegistration:
    student_id: UUID
    subject_name: str
    level: ExamLevel
    status: ExamRegistrationStatus = ExamRegistrationStatus.REGISTERED
    exam_location: Optional[str] = None
    score_percentage: Optional[float] = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        if self.score_percentage is not None and not 0 <= self.score_percentage <= 100:
            raise ValidationException("Matura score percentage must be between 0 and 100.")


@dataclass(frozen=True)
class StudyProgram:
    id: UUID
    university_id: UUID
    name: str
    max_quota: int
    evaluation_formula: Mapping[str, float]

    def __post_init__(self) -> None:
        if self.max_quota < 1:
            raise ValidationException("Study program quota must be at least 1.")
        if not self.evaluation_formula:
            raise ValidationException("Study program evaluation formula is required.")
        if any(weight < 0 for weight in self.evaluation_formula.values()):
            raise ValidationException("Evaluation weights cannot be negative.")


@dataclass
class FacultyApplication:
    student_id: UUID
    study_program_id: UUID
    priority_index: int
    is_currently_admitted: bool = False
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        if not 1 <= self.priority_index <= 10:
            raise ValidationException("Priority index must be between 1 and 10.")


@dataclass(frozen=True)
class RankedApplicant:
    student_id: UUID
    study_program_id: UUID
    priority_index: int
    score: float
    rank: int
    is_within_quota: bool


class StudentProfileRepository(Protocol):
    def get(self, student_id: UUID) -> StudentProfile: ...


class MaturaRegistrationRepository(Protocol):
    def get(self, registration_id: UUID) -> MaturaExamRegistration: ...
    def find_for_student_subject(self, student_id: UUID, subject_name: str) -> Optional[MaturaExamRegistration]: ...
    def list_for_student(self, student_id: UUID) -> List[MaturaExamRegistration]: ...
    def save(self, registration: MaturaExamRegistration) -> MaturaExamRegistration: ...


class StudyProgramRepository(Protocol):
    def get(self, study_program_id: UUID) -> StudyProgram: ...


class FacultyApplicationRepository(Protocol):
    def list_for_student(self, student_id: UUID) -> List[FacultyApplication]: ...
    def list_for_program(self, study_program_id: UUID) -> List[FacultyApplication]: ...
    def list_all(self) -> List[FacultyApplication]: ...
    def replace_student_applications(self, student_id: UUID, applications: Sequence[FacultyApplication]) -> None: ...
    def save(self, application: FacultyApplication) -> FacultyApplication: ...


class InMemoryStudentProfileRepository:
    def __init__(self, profiles: Optional[Iterable[StudentProfile]] = None) -> None:
        self._profiles = {profile.id: profile for profile in profiles or []}

    def get(self, student_id: UUID) -> StudentProfile:
        try:
            return self._profiles[student_id]
        except KeyError as exc:
            raise ValidationException("Student profile not found.") from exc


class InMemoryMaturaRegistrationRepository:
    def __init__(self, registrations: Optional[Iterable[MaturaExamRegistration]] = None) -> None:
        self._registrations = {registration.id: registration for registration in registrations or []}

    def get(self, registration_id: UUID) -> MaturaExamRegistration:
        try:
            return self._registrations[registration_id]
        except KeyError as exc:
            raise ValidationException("Matura registration not found.") from exc

    def find_for_student_subject(self, student_id: UUID, subject_name: str) -> Optional[MaturaExamRegistration]:
        normalized_subject = subject_name.strip().casefold()
        return next(
            (
                registration
                for registration in self._registrations.values()
                if registration.student_id == student_id
                and registration.subject_name.strip().casefold() == normalized_subject
            ),
            None,
        )

    def list_for_student(self, student_id: UUID) -> List[MaturaExamRegistration]:
        return [registration for registration in self._registrations.values() if registration.student_id == student_id]

    def save(self, registration: MaturaExamRegistration) -> MaturaExamRegistration:
        registration.updated_at = datetime.now(timezone.utc)
        self._registrations[registration.id] = registration
        return registration


class InMemoryStudyProgramRepository:
    def __init__(self, programs: Optional[Iterable[StudyProgram]] = None) -> None:
        self._programs = {program.id: program for program in programs or []}

    def get(self, study_program_id: UUID) -> StudyProgram:
        try:
            return self._programs[study_program_id]
        except KeyError as exc:
            raise ValidationException("Study program not found.") from exc


class InMemoryFacultyApplicationRepository:
    def __init__(self, applications: Optional[Iterable[FacultyApplication]] = None) -> None:
        self._applications = {application.id: application for application in applications or []}

    def list_for_student(self, student_id: UUID) -> List[FacultyApplication]:
        return sorted(
            [application for application in self._applications.values() if application.student_id == student_id],
            key=lambda application: application.priority_index,
        )

    def list_for_program(self, study_program_id: UUID) -> List[FacultyApplication]:
        return [application for application in self._applications.values() if application.study_program_id == study_program_id]

    def list_all(self) -> List[FacultyApplication]:
        return list(self._applications.values())

    def replace_student_applications(self, student_id: UUID, applications: Sequence[FacultyApplication]) -> None:
        self._applications = {
            application_id: application
            for application_id, application in self._applications.items()
            if application.student_id != student_id
        }
        for application in applications:
            self._applications[application.id] = application

    def save(self, application: FacultyApplication) -> FacultyApplication:
        application.updated_at = datetime.now(timezone.utc)
        self._applications[application.id] = application
        return application


class MaturaRegistrationService:
    def __init__(self, registrations: MaturaRegistrationRepository, registration_deadline: datetime) -> None:
        self._registrations = registrations
        self._registration_deadline = registration_deadline

    def register_exam(
        self,
        student: StudentProfile,
        subject: str,
        level: ExamLevel,
        exam_location: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> MaturaExamRegistration:
        self._assert_before_deadline(now)
        if not subject.strip():
            raise ValidationException("Subject name is required.")

        existing = self._registrations.find_for_student_subject(student.id, subject)
        if existing:
            existing.level = level
            existing.status = ExamRegistrationStatus.REGISTERED
            existing.exam_location = exam_location or existing.exam_location
            return self._registrations.save(existing)

        return self._registrations.save(
            MaturaExamRegistration(
                student_id=student.id,
                subject_name=subject.strip(),
                level=level,
                exam_location=exam_location,
            )
        )

    def cancel_exam(
        self,
        student: StudentProfile,
        registration_id: UUID,
        now: Optional[datetime] = None,
    ) -> MaturaExamRegistration:
        self._assert_before_deadline(now)
        registration = self._registrations.get(registration_id)
        if registration.student_id != student.id:
            raise UnauthorizedAccessException("Students can only cancel their own exam registrations.")

        registration.status = ExamRegistrationStatus.CANCELED
        return self._registrations.save(registration)

    def _assert_before_deadline(self, now: Optional[datetime]) -> None:
        current_time = now or datetime.now(timezone.utc)
        if current_time > self._registration_deadline:
            raise DeadlineExceededException("Matura registration deadline has passed.")


class UniversityApplicationService:
    A_LEVEL_MULTIPLIER = 1.6
    B_LEVEL_MULTIPLIER = 1.0
    MAX_PRIORITIES = 10

    def __init__(
        self,
        students: StudentProfileRepository,
        registrations: MaturaRegistrationRepository,
        programs: StudyProgramRepository,
        applications: FacultyApplicationRepository,
    ) -> None:
        self._students = students
        self._registrations = registrations
        self._programs = programs
        self._applications = applications

    def add_or_update_application_list(
        self,
        student: StudentProfile,
        program_ids_with_priorities: Sequence[tuple[UUID, int]],
    ) -> List[FacultyApplication]:
        if len(program_ids_with_priorities) > self.MAX_PRIORITIES:
            raise MaxPrioritiesExceededException("A student can select a maximum of 10 study programs.")

        priorities = [priority for _, priority in program_ids_with_priorities]
        if sorted(priorities) != list(range(1, len(priorities) + 1)):
            raise ValidationException("Priorities must be contiguous values from 1 through N.")

        program_ids = [program_id for program_id, _ in program_ids_with_priorities]
        if len(set(program_ids)) != len(program_ids):
            raise ValidationException("The same study program cannot be selected more than once.")

        applications = [
            FacultyApplication(
                student_id=student.id,
                study_program_id=program_id,
                priority_index=priority,
            )
            for program_id, priority in sorted(program_ids_with_priorities, key=lambda item: item[1])
        ]
        self._applications.replace_student_applications(student.id, applications)
        return applications

    def calculate_ranking_scores(self, study_program_id: UUID) -> List[RankedApplicant]:
        program = self._programs.get(study_program_id)
        scored = [
            (
                application,
                self._calculate_student_score(self._students.get(application.student_id), program),
            )
            for application in self._applications.list_for_program(study_program_id)
        ]
        scored.sort(key=lambda item: (-item[1], item[0].priority_index, str(item[0].student_id)))

        return [
            RankedApplicant(
                student_id=application.student_id,
                study_program_id=application.study_program_id,
                priority_index=application.priority_index,
                score=round(score, 4),
                rank=index,
                is_within_quota=index <= program.max_quota,
            )
            for index, (application, score) in enumerate(scored, start=1)
        ]

    def update_admission_status_simulation(self) -> None:
        all_applications = self._applications.list_all()
        for application in all_applications:
            application.is_currently_admitted = False
            self._applications.save(application)

        admitted_students: set[UUID] = set()
        remaining_quota = {
            application.study_program_id: self._programs.get(application.study_program_id).max_quota
            for application in all_applications
        }

        for priority in range(1, self.MAX_PRIORITIES + 1):
            priority_applications = [
                application
                for application in all_applications
                if application.priority_index == priority and application.student_id not in admitted_students
            ]
            program_ids = sorted({application.study_program_id for application in priority_applications}, key=str)

            for program_id in program_ids:
                seats_left = remaining_quota.get(program_id, 0)
                if seats_left <= 0:
                    continue

                program = self._programs.get(program_id)
                candidates = [
                    application
                    for application in priority_applications
                    if application.study_program_id == program_id and application.student_id not in admitted_students
                ]
                candidates.sort(
                    key=lambda application: (
                        -self._calculate_student_score(self._students.get(application.student_id), program),
                        str(application.student_id),
                    )
                )

                for application in candidates[:seats_left]:
                    application.is_currently_admitted = True
                    self._applications.save(application)
                    admitted_students.add(application.student_id)
                    remaining_quota[program_id] -= 1

    def _calculate_student_score(self, student: StudentProfile, program: StudyProgram) -> float:
        total_score = 0.0
        for formula_key, weight in program.evaluation_formula.items():
            normalized_key = formula_key.strip().casefold()
            if normalized_key == "high_school_gpa":
                total_score += self._normalized_gpa(student.high_school_gpa) * weight
                continue

            if normalized_key.startswith("matura_"):
                subject = formula_key[len("matura_") :]
                total_score += self._weighted_matura_score(student.id, subject) * weight
                continue

            raise ValidationException(f"Unsupported evaluation formula key: {formula_key}")

        return total_score

    def _normalized_gpa(self, gpa: float) -> float:
        return (gpa / 5.0) * 100.0

    def _weighted_matura_score(self, student_id: UUID, subject: str) -> float:
        registration = self._registrations.find_for_student_subject(student_id, subject)
        if not registration or registration.status != ExamRegistrationStatus.REGISTERED:
            return 0.0
        if registration.score_percentage is None:
            return 0.0

        multiplier = self.A_LEVEL_MULTIPLIER if registration.level == ExamLevel.A_RAZINA else self.B_LEVEL_MULTIPLIER
        return min(registration.score_percentage * multiplier, 100.0)


class UniversityBridgeAccess:
    def __init__(
        self,
        students: StudentProfileRepository,
        registrations: MaturaRegistrationRepository,
        programs: StudyProgramRepository,
        applications: FacultyApplicationRepository,
    ) -> None:
        self._students = students
        self._registrations = registrations
        self._programs = programs
        self._applications = applications

    def get_applicant_details(self, requesting_university_admin: User, target_student_id: UUID) -> Dict[str, object]:
        if requesting_university_admin.role != UserRole.UNIVERSITY_ADMIN or not requesting_university_admin.university_id:
            raise UnauthorizedAccessException("Only university administrators can access applicant details.")

        active_applications = [
            application
            for application in self._applications.list_for_student(target_student_id)
            if self._programs.get(application.study_program_id).university_id == requesting_university_admin.university_id
        ]

        if not active_applications:
            raise UnauthorizedAccessException("The student has no active application for this university.")

        student = self._students.get(target_student_id)
        return {
            "student_profile": student,
            "matura_results": self._registrations.list_for_student(target_student_id),
            "applications_for_university": active_applications,
        }
