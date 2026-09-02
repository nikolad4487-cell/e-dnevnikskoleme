from datetime import datetime, timedelta, timezone
from uuid import uuid4
import unittest

from backend_services.nispvu import (
    DeadlineExceededException,
    ExamLevel,
    InMemoryFacultyApplicationRepository,
    InMemoryMaturaRegistrationRepository,
    InMemoryStudentProfileRepository,
    InMemoryStudyProgramRepository,
    MaturaRegistrationService,
    MaxPrioritiesExceededException,
    MaturaExamRegistration,
    StudentProfile,
    StudyProgram,
    UnauthorizedAccessException,
    UniversityApplicationService,
    UniversityBridgeAccess,
    User,
    UserRole,
)


class NispvuServicesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.student = StudentProfile(id=uuid4(), user_id=uuid4(), high_school_gpa=4.5)
        self.university_id = uuid4()
        self.other_university_id = uuid4()
        self.program = StudyProgram(
            id=uuid4(),
            university_id=self.university_id,
            name="Računarstvo",
            max_quota=1,
            evaluation_formula={
                "high_school_gpa": 0.4,
                "matura_hrvatski": 0.2,
                "matura_matematika": 0.4,
            },
        )
        self.students = InMemoryStudentProfileRepository([self.student])
        self.registrations = InMemoryMaturaRegistrationRepository()
        self.programs = InMemoryStudyProgramRepository([self.program])
        self.applications = InMemoryFacultyApplicationRepository()

    def test_matura_registration_deadline_is_enforced(self) -> None:
        service = MaturaRegistrationService(
            self.registrations,
            registration_deadline=datetime.now(timezone.utc) - timedelta(days=1),
        )

        with self.assertRaises(DeadlineExceededException):
            service.register_exam(self.student, "Matematika", ExamLevel.A_RAZINA)

    def test_application_list_has_absolute_maximum_of_ten_priorities(self) -> None:
        service = self._application_service()
        program_ids = [(uuid4(), index) for index in range(1, 12)]

        with self.assertRaises(MaxPrioritiesExceededException):
            service.add_or_update_application_list(self.student, program_ids)

    def test_ranking_score_uses_a_level_multiplier(self) -> None:
        self.registrations.save(
            MaturaExamRegistration(
                student_id=self.student.id,
                subject_name="hrvatski",
                level=ExamLevel.B_RAZINA,
                score_percentage=70,
            )
        )
        self.registrations.save(
            MaturaExamRegistration(
                student_id=self.student.id,
                subject_name="matematika",
                level=ExamLevel.A_RAZINA,
                score_percentage=50,
            )
        )
        service = self._application_service()
        service.add_or_update_application_list(self.student, [(self.program.id, 1)])

        ranking = service.calculate_ranking_scores(self.program.id)

        self.assertEqual(len(ranking), 1)
        self.assertEqual(ranking[0].score, 82.0)
        self.assertTrue(ranking[0].is_within_quota)

    def test_admission_simulation_marks_highest_available_priority(self) -> None:
        second_program = StudyProgram(
            id=uuid4(),
            university_id=self.university_id,
            name="Elektrotehnika",
            max_quota=1,
            evaluation_formula={"high_school_gpa": 1.0},
        )
        self.programs = InMemoryStudyProgramRepository([self.program, second_program])
        service = self._application_service()
        service.add_or_update_application_list(self.student, [(self.program.id, 1), (second_program.id, 2)])

        service.update_admission_status_simulation()

        applications = self.applications.list_for_student(self.student.id)
        self.assertTrue(applications[0].is_currently_admitted)
        self.assertFalse(applications[1].is_currently_admitted)

    def test_university_admin_can_only_view_students_with_application(self) -> None:
        bridge = UniversityBridgeAccess(self.students, self.registrations, self.programs, self.applications)
        admin = User(id=uuid4(), role=UserRole.UNIVERSITY_ADMIN, university_id=self.other_university_id)

        with self.assertRaises(UnauthorizedAccessException):
            bridge.get_applicant_details(admin, self.student.id)

        self._application_service().add_or_update_application_list(self.student, [(self.program.id, 1)])
        allowed_admin = User(id=uuid4(), role=UserRole.UNIVERSITY_ADMIN, university_id=self.university_id)
        details = bridge.get_applicant_details(allowed_admin, self.student.id)
        self.assertEqual(details["student_profile"].id, self.student.id)

    def _application_service(self) -> UniversityApplicationService:
        return UniversityApplicationService(
            self.students,
            self.registrations,
            self.programs,
            self.applications,
        )


if __name__ == "__main__":
    unittest.main()
