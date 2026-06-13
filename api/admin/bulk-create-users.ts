import { supabaseAdmin } from '../_supabase.js';
import {
  errorMessage,
  findAuthUserByEmail,
  jsonResponse,
  requireAdmin,
} from './_helpers.js';

type StudentInput = {
  name?: string;
  surname?: string;
  email?: string;
};

function parseStudentInput(student: StudentInput) {
  let rawName = String(student.name || '').trim();
  let rawSurname = String(student.surname || '').trim();
  let email = String(student.email || '').trim().toLowerCase();

  if (!rawSurname && (rawName.includes('|') || rawName.includes(','))) {
    const separator = rawName.includes('|') ? '|' : ',';
    const [namePart, emailPart] = rawName.split(separator, 2);
    rawName = namePart.trim();
    email = email || String(emailPart || '').trim().toLowerCase();
  }

  const nameParts = rawSurname ? [rawName] : rawName.split(/\s+/).filter(Boolean);
  const name = nameParts.shift() || '';
  const surname = rawSurname || nameParts.join(' ');
  return { name, surname, fullName: `${name} ${surname}`.trim(), email };
}

function normalizeForEmail(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

async function generateUniqueEmail(name: string, surname: string) {
  const base = normalizeForEmail(`${name}.${surname}`) || 'ucenik';
  let email = `${base}@eskole.me`;
  let suffix = 2;

  while (await findAuthUserByEmail(email)) {
    email = `${base}${suffix}@eskole.me`;
    suffix += 1;
  }

  return email;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const students: StudentInput[] = Array.isArray(body.students) ? body.students : [];
    const classId = body.classId || null;
    const schoolId = body.schoolId || null;
    const requestedSchoolYearId = body.school_year_id || body.schoolYearId || null;
    const requestedProgramId = body.programId || null;

    console.log('BULK CREATE USERS PAYLOAD', {
      count: students.length,
      classId,
      schoolId,
      schoolYearId: requestedSchoolYearId,
      programId: requestedProgramId,
    });

    await requireAdmin(req, schoolId);
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    if (!students.length) {
      return jsonResponse({ success: false, error: 'Lista učenika je prazna.' }, 400);
    }
    if (!classId || !schoolId) {
      return jsonResponse({ success: false, error: 'Razred i škola su obavezni.' }, 400);
    }

    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select('id, school_id, school_year_id, school_year, program_id')
      .eq('id', classId)
      .single();
    if (classError || !classData) {
      return jsonResponse({
        success: false,
        error: errorMessage(classError || 'Odabrani razred nije pronađen.'),
      }, 400);
    }
    if (classData.school_id !== schoolId) {
      return jsonResponse({
        success: false,
        error: 'Odabrani razred ne pripada odabranoj školi.',
      }, 400);
    }

    const schoolYearId = classData.school_year_id || requestedSchoolYearId;
    const programId = classData.program_id || requestedProgramId;
    const studentPassword = 'yupu8Ev4';
    const results: Array<Record<string, unknown>> = [];

    const { data: classSubjects, error: subjectsError } = await supabaseAdmin
      .from('class_subject_teachers')
      .select('subject_id')
      .eq('class_id', classId);
    if (subjectsError) {
      console.error('BULK CREATE SUBJECTS ERROR', subjectsError);
    }

    const { data: existingClassProfiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, auth_user_id, name, email')
      .eq('class_id', classId);
    if (profilesError) {
      console.error('BULK CREATE EXISTING PROFILES ERROR', profilesError);
    }

    for (const student of students) {
      const { name, surname, fullName, email: requestedEmail } = parseStudentInput(student);

      if (!fullName) {
        results.push({ ...student, success: false, error: 'Ime učenika je obavezno.' });
        continue;
      }

      let authUserId: string | null = null;
      let createdAuthUser = false;
      try {
        let email = requestedEmail;
        const malformedProfile = email
          ? (existingClassProfiles || []).find((profile) => {
              const profileName = String(profile.name || '').toLowerCase();
              return profileName.includes('|')
                && profileName.split('|').slice(1).join('|').trim() === email;
            })
          : null;

        let profile: any = null;
        if (malformedProfile?.auth_user_id) {
          authUserId = malformedProfile.auth_user_id;
          const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
            authUserId,
            {
              email,
              password: studentPassword,
              email_confirm: true,
              user_metadata: { name, surname },
            },
          );
          if (authUpdateError) throw authUpdateError;

          const { data: repairedProfile, error: repairError } = await supabaseAdmin
            .from('user_profiles')
            .update({ name: fullName, email })
            .eq('id', malformedProfile.id)
            .select()
            .single();
          if (repairError || !repairedProfile) {
            throw repairError || new Error('Pogrešno uneseni profil nije moguće popraviti.');
          }
          profile = repairedProfile;
        } else {
          if (!email || await findAuthUserByEmail(email)) {
            email = await generateUniqueEmail(name, surname);
          }

          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: studentPassword,
            email_confirm: true,
            user_metadata: { name, surname },
          });
          if (authError || !authData.user) throw authError || new Error('Auth korisnik nije stvoren.');
          authUserId = authData.user.id;
          createdAuthUser = true;

          const { data: createdProfile, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .upsert({
              auth_user_id: authUserId,
              email,
              name: fullName,
              role: 'STUDENT',
              is_first_login: true,
              requires_password_change: false,
              requires_authenticator_setup: false,
              password_type: 'student_static',
              class_id: classId,
              school_id: schoolId,
              school_year_id: schoolYearId,
            }, { onConflict: 'auth_user_id' })
            .select()
            .single();
          if (profileError || !createdProfile) {
            throw profileError || new Error('Profil učenika nije stvoren.');
          }
          profile = createdProfile;
        }

        if (!profile) {
          throw new Error('Profil učenika nije dostupan.');
        }

        const { error: roleError } = await supabaseAdmin.from('user_school_roles').upsert({
          user_id: profile.id,
          school_id: schoolId,
          role: 'STUDENT',
          status: 'ACTIVE',
        }, { onConflict: 'user_id,school_id,role' });
        if (roleError) throw roleError;

        const { error: enrollmentError } = await supabaseAdmin
          .from('student_class_enrollments')
          .upsert({
            student_id: profile.id,
            class_id: classId,
            school_year_id: schoolYearId,
            school_year: classData.school_year || null,
            program_id: programId,
            status: 'ACTIVE',
          }, { onConflict: 'student_id,class_id,school_year' });
        if (enrollmentError) throw enrollmentError;

        const subjectIds = Array.from(new Set(
          (classSubjects || []).map((row) => row.subject_id).filter(Boolean),
        ));
        if (subjectIds.length) {
          const { error: subjectEnrollmentError } = await supabaseAdmin
            .from('student_subject_enrollments')
            .upsert(subjectIds.map((subjectId) => ({
              student_id: profile.id,
              subject_id: subjectId,
              class_id: classId,
              school_year: classData.school_year || null,
              status: 'ACTIVE',
            })), { onConflict: 'student_id,subject_id,class_id,school_year' });
          if (subjectEnrollmentError) throw subjectEnrollmentError;
        }

        results.push({ ...student, success: true, email, password: studentPassword });
      } catch (studentError) {
        console.error('BULK CREATE USER ERROR', {
          student: fullName,
          error: errorMessage(studentError),
        });
        if (createdAuthUser && authUserId) {
          const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
          if (cleanupError) console.error('BULK CREATE CLEANUP ERROR', cleanupError);
        }
        results.push({ ...student, success: false, error: errorMessage(studentError) });
      }
    }

    const createdCount = results.filter((result) => result.success).length;
    const failures = results.filter((result) => !result.success);
    const firstFailure = failures[0];
    const firstFailureName = firstFailure
      ? `${String(firstFailure.name || '')} ${String(firstFailure.surname || '')}`.trim()
      : '';
    const firstFailureMessage = firstFailure
      ? `${firstFailureName ? `${firstFailureName}: ` : ''}${String(firstFailure.error || 'Nepoznata greška.')}`
      : null;

    return jsonResponse({
      success: createdCount > 0,
      createdCount,
      failedCount: results.length - createdCount,
      results,
      message: `Kreirano učenika: ${createdCount}.`,
      error: createdCount === 0
        ? firstFailureMessage || 'Nije moguće kreirati nijednog učenika.'
        : null,
    }, createdCount > 0 ? 200 : 400);
  } catch (error) {
    console.error('BULK CREATE USERS API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('token') || message.includes('Prijava') ? 401
      : message.includes('ovlasti') ? 403
        : 400;
    return jsonResponse({ success: false, error: message }, status);
  }
}
