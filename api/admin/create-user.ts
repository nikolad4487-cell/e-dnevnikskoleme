import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../_supabase.js';
import { errorMessage, findAuthUserByEmail, jsonResponse, requireAdmin } from './_helpers.js';

const STAFF_ROLES = new Set([
  'TEACHER',
  'ADMIN',
  'MAIN_ADMIN',
  'SCHOOL_ADMIN',
  'HOMEROOM',
  'DEPUTY',
  'HOMEROOM_TEACHER',
  'STAFF'
]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('CREATE USER PAYLOAD', {
      ...body,
      password: body.password ? '[REDACTED]' : undefined,
      pin: body.pin ? '[REDACTED]' : undefined
    });

    const schoolId = body.schoolId || body.studentData?.schoolId || null;
    await requireAdmin(req, schoolId);
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');

    const roles: string[] = Array.isArray(body.roles)
      ? [...body.roles]
      : body.globalRole
        ? [body.globalRole]
        : [];
    if (body.globalRole && !roles.includes(body.globalRole)) roles.push(body.globalRole);

    const name = String(body.name || '').trim();
    const surname = String(body.surname || '').trim();
    const fullName = surname && !name.toLowerCase().endsWith(surname.toLowerCase())
      ? `${name} ${surname}`.trim()
      : name;
    if (!fullName) return jsonResponse({ success: false, error: 'Ime korisnika je obavezno.' }, 400);

    let email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      const normalizedParts = (surname ? `${name}.${surname}` : fullName)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .replace(/\.+/g, '.');
      const base = normalizedParts || 'korisnik';
      email = `${base}@eskole.me`;
      let suffix = 2;
      while (await findAuthUserByEmail(email)) {
        email = `${base}${suffix}@eskole.me`;
        suffix += 1;
      }
    }

    const isStudent = roles.includes('STUDENT');
    const isStaff = roles.some((role) => STAFF_ROLES.has(role));
    const initialPin = String(body.pin || body.password || '1234');
    if (isStaff && !/^\d{4}$/.test(initialPin)) {
      return jsonResponse({ success: false, error: 'PIN zaposlenika mora imati točno 4 znamenke.' }, 400);
    }

    const studentPassword = 'yupu8Ev4';
    const technicalPassword = process.env.STAFF_AUTH_TECHNICAL_PASSWORD || '123456';
    const authPassword = isStudent
      ? studentPassword
      : isStaff
        ? technicalPassword
        : String(body.password || technicalPassword);
    const pinHash = isStaff ? await bcrypt.hash(initialPin, 10) : null;
    const authenticatorSecret = isStaff ? authenticator.generateSecret() : null;

    const existingAuthUser = await findAuthUserByEmail(email);
    if (existingAuthUser) {
      return jsonResponse({ success: false, error: `Korisnik s adresom ${email} već postoji.` }, 409);
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
      user_metadata: { name: fullName },
    });
    if (authError || !authData.user) {
      console.error('CREATE USER SUPABASE AUTH ERROR', authError);
      return jsonResponse({
        success: false,
        error: errorMessage(authError || 'Auth korisnika nije moguće stvoriti.')
      }, 400);
    }
    const authUser = authData.user;

    if (body.authOnly) {
      return jsonResponse({
        success: true,
        userId: authUser.id,
        email,
        password: isStaff ? initialPin : authPassword
      });
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
        pin_hash: pinHash,
        is_first_login: true,
        requires_password_change: false,
        password_type: isStudent ? 'student_static' : (isStaff ? 'staff_pin_with_authenticator' : 'standard'),
        authenticator_secret: authenticatorSecret,
        requires_authenticator_setup: isStaff,
      }, { onConflict: 'auth_user_id' })
      .select()
      .single();

    if (profileError || !profile) {
      console.error('CREATE USER SUPABASE PROFILE ERROR', profileError);
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return jsonResponse({
        success: false,
        error: errorMessage(profileError || 'Profil korisnika nije moguće spremiti.')
      }, 400);
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
          console.error('CREATE USER SUPABASE ROLE ERROR', { role, error });
          return jsonResponse({ success: false, error: errorMessage(error) }, 400);
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
      if (classError) return jsonResponse({ success: false, error: errorMessage(classError) }, 400);

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
        return jsonResponse({ success: false, error: errorMessage(enrollmentError) }, 400);
      }
    }

    let qrCode: string | null = null;
    if (authenticatorSecret) {
      qrCode = await QRCode.toDataURL(authenticator.keyuri(email, 'e-Dnevnik', authenticatorSecret));
    }

    return jsonResponse({
      success: true,
      user: { id: authUser.id, email: authUser.email },
      profile,
      userId: authUser.id,
      profileId: profile.id,
      email,
      password: isStaff ? initialPin : authPassword,
      authenticatorSecret,
      qrCode,
    });
  } catch (error) {
    console.error('CREATE USER API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('token') || message.includes('Prijava') ? 401
      : message.includes('ovlasti') ? 403
        : 400;
    return jsonResponse({ success: false, error: message }, status);
  }
}
