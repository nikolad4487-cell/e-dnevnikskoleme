import React from 'react';
import { cn, sortStudentsBySurname } from '../lib/utils';
import { Clock3, TriangleAlert } from 'lucide-react';

export function ImenikTable({ students, studentEnrollments, onStudentClick, classWarnings }: { 
  students: any[], 
  studentEnrollments: any[], 
  onStudentClick: (student: any) => void,
  classWarnings: { failingGrades: Record<string, number>, absenceWarnings: Record<string, boolean> }
}) {
  const sortedStudents = sortStudentsBySurname(students);

  return (
    <div className="bg-white p-6">
      <table className="w-full border-collapse text-black text-xs">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            <th className="p-2 text-center w-12">R.BR.</th>
            <th className="p-2 text-left">PREZIME I IME</th>
            <th className="p-2 text-center">UPOZORENJA</th>
          </tr>
        </thead>
        <tbody>
          {sortedStudents.map((student: any, i: number) => {
            const name = student.student?.full_name || student.student?.name || 'Nepoznato ime';
            const failingCount = classWarnings.failingGrades[student.student_id] || 0;
            const hasAbsence = classWarnings.absenceWarnings[student.student_id];

            return (
              <tr 
                key={student.id} 
                onClick={() => onStudentClick(student)}
                className="border-b hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-2 text-center">{i + 1}.</td>
                <td className="p-2 font-bold">{name}</td>
                <td className="p-2 text-center font-bold">
                  <div className="flex justify-center gap-2">
                    {failingCount > 0 && (
                      <span title={`${failingCount} jedinica u zadnjih 30 dana`} className="inline-flex items-center gap-1 text-orange-600">
                        <TriangleAlert size={15} aria-hidden="true" /> {failingCount}
                      </span>
                    )}
                    {hasAbsence && (
                      <span title="Izostanak čeka odluku" className="inline-flex text-black">
                        <Clock3 size={15} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 text-xs text-gray-500 font-bold">
        Ukupno učenika: {students.length}
      </div>
    </div>
  );
}
