import React from 'react';
import { TriangleAlert, Clock3 } from 'lucide-react';
import { sortStudentsBySurname } from '../lib/utils';

interface ClassWarnings {
  failingGrades: Record<string, number>;
  pendingAbsences: Record<string, boolean>;
}

export function ImenikTable({
  students,
  onStudentClick,
  classWarnings,
}: {
  students: any[];
  studentEnrollments: any[];
  onStudentClick: (student: any) => void;
  classWarnings: ClassWarnings;
}) {
  const sortedStudents = sortStudentsBySurname(students);

  return (
    <div className="bg-white p-6">
      <table className="w-full border-collapse text-black text-xs">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            <th className="p-2 text-center w-12">R.BR.</th>
            <th className="p-2 text-left">PREZIME I IME</th>
            <th className="p-2 text-center w-52">UPOZORENJA</th>
          </tr>
        </thead>
        <tbody>
          {sortedStudents.map((student: any, index: number) => {
            // Imenik receives mapped user profiles, while older callers may still
            // provide enrollment rows. Support both shapes so warning IDs always match.
            const studentId =
              student.id ||
              student.student_id ||
              student.studentId ||
              student.student?.id;

            const name =
              student.full_name ||
              student.fullName ||
              student.name ||
              student.student?.full_name ||
              student.student?.name ||
              'Nepoznato ime';

            const failingCount = studentId
              ? classWarnings.failingGrades[studentId] || 0
              : 0;
            const hasPendingAbsence = studentId
              ? Boolean(classWarnings.pendingAbsences[studentId])
              : false;

            return (
              <tr
                key={studentId || student.id || index}
                onClick={() => onStudentClick(student)}
                className="border-b hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-2 text-center">{index + 1}.</td>
                <td className="p-2 font-bold">{name}</td>
                <td className="p-2 text-center font-bold">
                  <div className="flex min-h-6 items-center justify-center gap-3">
                    {failingCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-red-600"
                        title={`${failingCount} nedovoljnih ocjena (1) upisanih u posljednjih 30 dana`}
                        aria-label={`${failingCount} nedovoljnih ocjena u posljednjih 30 dana`}
                      >
                        <TriangleAlert size={17} strokeWidth={2.5} />
                        <span className="min-w-5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-black leading-none">
                          {failingCount}
                        </span>
                      </span>
                    )}

                    {hasPendingAbsence && (
                      <span
                        className="inline-flex items-center text-orange-600"
                        title="Učenik ima jedan ili više izostanaka koji još nisu opravdani"
                        aria-label="Postoje izostanci koji još nisu opravdani"
                      >
                        <Clock3 size={17} strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 text-xs font-bold text-gray-500">
        Ukupno učenika: {students.length}
      </div>
    </div>
  );
}
