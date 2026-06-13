import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { supabaseAdmin } from '../_supabase.js';
import { errorMessage, findAuthUserByEmail, jsonResponse, requireAdmin } from './_helpers.js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const schoolId = body.schoolId || body.studentData?.schoolId || null;
    await requireAdmin(req, schoolId);
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');

    const roles: string[] = Array.isArray(body.roles)
      ? [...body.roles]
      : body.globalRole
        ? [body.globalRole]
        : [];
    if (body.globalRole && !roles.includes(body.globalRole)) roles.push(body.globalRole);

    const email = String(body.email || '').trim().toLowerCase();
    if (!email) throw new Error('E-mail adresa je obavezna.');

    const name = String(body.name || '').trim();
    const surname = String(body.surname || '').trim();
    const fullName = surname && !name.toLowerCase().endsWith(surname.toLowerCase())
      ? `${name} ${surname}`.trim()
      : name;
    if (!fullName) throw new Error('Ime korisnika je obavezno.');

    const isStudent = roles.includes('STUDENT');
    const isStaff = roles.some((role) =>
      ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY'].includes(role),
    );
    const password = isStudent ? 'yupu8Ev4' : String(body.password || '1234');
    const authenticatorSecret = isStaff ? authenticator.generateSecret() : null;

    let authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: fullName },
      });
      if (error || !data.user) {
        console.error('SAVE USER SUPABASE AUTH CREATE ERROR', error);
        throw error || new Error('Auth korisnika nije moguće stvoriti.');
      }
      authUser = data.user;
    } else {
      console.log('SAVE USER AUTH ACCOUNT ALREADY EXISTS', {
        email,
        authUserId: authUser.id,
      });
    }

    if (body.authOnly) {
      return jsonResponse({ success: true, userId: authUser.id, email, password });
    }

    const studentData = body.studentData || {};
    const globalRole = isStudent ? 'STUDENT' : (body.globalRole || roles[0] || 'TEACHER');
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        auth_user_id: authUser.id,
        email,
        name: fullName,
        address: body.address || studentData.address || null,
        oib: body.oib || studentData.oib || null,
        dob: body.dob || studentData.dob || null,
        pob: body.pob || studentData.pob || null,
        mobile: body.mobile || studentData.mobile || null,
        role: globalRole,
        access_role: globalRole === 'SCHOOL_ADMIN' ? 'school_admin' : null,
        class_id: body.classId || studentData.classId || null,
        school_id: schoolId,
        school_year_id: studentData.schoolYearId || null,
        program_id: body.programId || studentData.programId || null,
        is_first_login: true,
        requires_password_change: !isStudent,
        password_type: isStudent ? 'student_static' : (isStaff ? 'staff_with_authenticator' : 'standard'),
        authenticator_secret: authenticatorSecret,
        requires_authenticator_setup: isStaff,
      }, { onConflict: 'auth_user_id' })
      .select()
      .single();
    if (profileError || !profile) {
      console.error('SAVE USER SUPABASE PROFILE ERROR', profileError);
      throw profileError || new Error('Profil korisnika nije moguće spremiti.');
    }

    if (schoolId && roles.length) {
      for (const role of roles) {
        const { error } = await supabaseAdmin.from('user_school_roles').upsert({
          user_id: profile.id,
          school_id: schoolId,
          role,
          status: 'ACTIVE',
        }, { onConflict: 'user_id,school_id,role' });
        if (error) {
          console.error('SAVE USER SUPABASE ROLE ERROR', { role, error });
          throw error;
        }
      }
    }

    const classId = body.classId || studentData.classId;
    if (isStudent && classId) {
      const { data: classData, error: classError } = await supabaseAdmin
        .from('classes')
        .select('school_year, school_year_id')
        .eq('id', classId)
        .single();
      if (classError) {
        console.error('SAVE USER SUPABASE CLASS ERROR', classError);
        throw classError;
      }

      const { error: enrollmentError } = await supabaseAdmin
        .from('student_class_enrollments')
        .upsert({
          student_id: profile.id,
          class_id: classId,
          school_year_id: classData?.school_year_id || studentData.schoolYearId || null,
          school_year: classData?.school_year || null,
          program_id: body.programId || studentData.programId || null,
          status: 'ACTIVE',
        }, { onConflict: 'student_id,class_id,school_year' });
      if (enrollmentError) {
        console.error('SAVE USER SUPABASE ENROLLMENT ERROR', enrollmentError);
        throw enrollmentError;
      }
    }

    let qrCode: string | null = null;
    if (authenticatorSecret) {
      const uri = authenticator.keyuri(email, 'e-Dnevnik', authenticatorSecret);
      qrCode = await QRCode.toDataURL(uri);
    }

    return jsonResponse({
      success: true,
      userId: authUser.id,
      profileId: profile.id,
      student: profile,
      email,
      password,
      authenticatorSecret,
      qrCode,
    });
  } catch (error) {
    console.error('SAVE USER API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('ovlasti') || message.includes('autorizacij') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}
