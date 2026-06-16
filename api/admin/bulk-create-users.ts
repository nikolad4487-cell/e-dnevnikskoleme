import { supabaseAdmin } from '../_supabase.js';
import { authorizeAdministrator, createOrUpdateUserFromPayload, jsonResponse } from './_user-admin.js';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return jsonResponse({ success: false, error: 'Supabase Admin client not initialized.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { students, classId, schoolId, schoolYearId, school_year_id, programId } = body;
    const finalYearId = school_year_id || schoolYearId;
    const auth = await authorizeAdministrator(req, schoolId);
    if (!auth.allowed) {
      return jsonResponse({ success: false, error: auth.error }, auth.status);
    }
    if (!Array.isArray(students) || students.length === 0) {
      return jsonResponse({ success: false, error: 'Lista učenika je prazna.' }, 400);
    }

    let classDetails: any = {
      id: classId,
      school_id: schoolId,
      school_year_id: finalYearId,
      school_year: '2024/2025',
      program_id: programId,
    };
    if (classId) {
      const { data, error } = await supabaseAdmin
        .from('classes')
        .select('id, school_id, school_year_id, school_year, program_id')
        .eq('id', classId)
        .maybeSingle();
      if (error) throw error;
      if (data) classDetails = { ...classDetails, ...data };
    }

    const { data: classSubjects, error: subjectsError } = classDetails.id
      ? await supabaseAdmin.from('class_subject_teachers').select('subject_id').eq('class_id', classDetails.id)
      : { data: [], error: null };
    if (subjectsError) throw subjectsError;

    const results = [];
    for (const student of students) {
      try {
        const result = await createOrUpdateUserFromPayload({
          ...student,
          roles: ['STUDENT'],
          globalRole: 'STUDENT',
          schoolId: classDetails.school_id || schoolId,
          classId: classDetails.id,
          studentData: {
            ...(student.studentData || {}),
            schoolId: classDetails.school_id || schoolId,
            classId: classDetails.id,
            schoolYearId: classDetails.school_year_id,
            programId: classDetails.program_id || programId,
          },
        });

        if (classDetails.id && (classSubjects ?? []).length > 0) {
          const subjectIds = Array.from(new Set((classSubjects ?? []).map((item: any) => item.subject_id)));
          const subjectEnrollments = subjectIds.map((subjectId) => ({
            student_id: result.profileId,
            subject_id: subjectId,
            class_id: classDetails.id,
            school_year_id: classDetails.school_year_id || null,
            school_year: classDetails.school_year || '2024/2025',
            status: 'ACTIVE',
          }));
          const { error } = await supabaseAdmin
            .from('student_subject_enrollments')
            .upsert(subjectEnrollments, { onConflict: 'student_id,subject_id,class_id,school_year' });
          if (error) throw error;
        }

        results.push({ ...student, success: true, email: result.email, password: result.password });
      } catch (error: any) {
        results.push({ ...student, success: false, error: error?.message || 'Greška pri kreiranju učenika.' });
      }
    }

    return jsonResponse({ success: true, results, message: 'Korisnici obrađeni.' });
  } catch (error: any) {
    console.error('[BULK_CREATE_USERS_API]', error);
    return jsonResponse({ success: false, error: error?.message || 'Neuspjela obrada zahtjeva.' }, 500);
  }
}

export async function GET() {
  return jsonResponse({ success: false, error: 'Method Not Allowed', allowed: ['POST'] }, 405);
}
