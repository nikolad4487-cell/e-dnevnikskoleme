import React from 'react';
import { cn } from '../../lib/utils';

export function ImenikTable({ students, studentEnrollments, onStudentClick, classWarnings }: { 
  students: any[], 
  studentEnrollments: any[], 
  onStudentClick: (student: any) => void,
  classWarnings: { failingGrades: Record<string, number>, pendingAbsences: Record<string, boolean> }
}) {
  const sortedStudents = [...students].sort((a, b) => {
    const nameA = (a.student?.full_name || a.student?.name || '').split(' ').pop() || '';
    const nameB = (b.student?.full_name || b.student?.name || '').split(' ').pop() || '';
    return nameA.localeCompare(nameB);
  });

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
            const hasPending = classWarnings.pendingAbsences[student.student_id];

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
                    {failingCount > 0 && <span className="text-red-600">⚠️ {failingCount}</span>}
                    {hasPending && <span className="text-red-500">🕒</span>}
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
