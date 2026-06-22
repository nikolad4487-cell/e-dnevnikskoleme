import React from 'react';
import { TriangleAlert, Clock3 } from 'lucide-react';
import { sortStudentsBySurname } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface ClassWarnings {
  failingGrades: Record<string, number>;
  pendingAbsences: Record<string, boolean>;
}

export function ImenikTable({
  students,
  studentEnrollments,
  onStudentClick,
  classWarnings,
}: {
  students: any[];
  studentEnrollments: any[];
  onStudentClick: (student: any) => void;
  classWarnings: ClassWarnings;
}) {
  const sortedStudents = sortStudentsBySurname(students);
  const [resolvedWarnings, setResolvedWarnings] = React.useState<ClassWarnings>(classWarnings);

  const classId = React.useMemo(() => {
    const enrollment = (studentEnrollments || []).find((row: any) =>
      row?.class_id || row?.classId || row?.class?.id
    );

    return enrollment?.class_id || enrollment?.classId || enrollment?.class?.id || null;
  }, [studentEnrollments]);

  React.useEffect(() => {
    setResolvedWarnings((current) => ({
      failingGrades: {
        ...current.failingGrades,
        ...(classWarnings?.failingGrades || {}),
      },
      pendingAbsences: {
        ...current.pendingAbsences,
        ...(classWarnings?.pendingAbsences || {}),
      },
    }));
  }, [classWarnings]);

  React.useEffect(() => {
    if (!classId) {
      console.warn('[IMENIK_WARNINGS] classId nije pronađen iz upisa učenika.');
      return;
    }

    let cancelled = false;

    const loadWarnings = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error('Aktivna korisnička sesija nije pronađena.');
        }

        const response = await fetch(
          `/api/imenik-warnings?classId=${encodeURIComponent(classId)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
            cache: 'no-store',
          }
        );

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`API za upozorenja nije vratio JSON odgovor (${response.status}).`);
        }

        const payload = await response.json();
        console.log('[IMENIK_WARNINGS] API RESPONSE', payload);

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || `Upozorenja nije moguće učitati (${response.status}).`);
        }

        if (!cancelled) {
          setResolvedWarnings({
            failingGrades: payload.failingGrades || {},
            pendingAbsences: payload.pendingAbsences || {},
          });
        }
      } catch (error) {
        console.error('[IMENIK_WARNINGS] API ERROR', error);
      }
    };

    loadWarnings();
    window.addEventListener('focus', loadWarnings);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadWarnings);
    };
  }, [classId]);

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
              ? resolvedWarnings.failingGrades[studentId] || 0
              : 0;
            const hasPendingAbsence = studentId
              ? Boolean(resolvedWarnings.pendingAbsences[studentId])
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
