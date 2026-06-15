import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../_supabase.js';

type AccountType = 'STUDENT' | 'STAFF';
type ResetMode = 'DEFAULT' | 'GENERATE';

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function generateStudentPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!?-';
  const source = letters + numbers;
  const password = Array.from(
    { length: 6 },
    () => source[Math.floor(Math.random() * source.length)],
  );
  password.push(numbers[Math.floor(Math.random() * numbers.length)]);
  password.push(symbols[Math.floor(Math.random() * symbols.length)]);

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join('');
}

function generateStaffPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function authorizeAdministrator(token: string, targetSchoolId?: string) {
  if (!supabaseAdmin) throw new Error('Supabase Admin client nije konfiguriran.');

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { allowed: false, status: 401, error: 'Neispravan autorizacijski token.' };
  }

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, access_role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (profileError || !callerProfile) {
    return { allowed: false, status: 403, error: 'Profil administratora nije pronađen.' };
  }

  const profileRoles = [
    String(callerProfile.role ?? '').toUpperCase(),
    String(callerProfile.access_role ?? '').toUpperCase(),
  ];
  if (
    profileRoles.some((role) =>
      ['MAIN_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMINISTRATOR'].includes(role),
    )
  ) {
    return { allowed: true, callerProfileId: callerProfile.id, unrestricted: true };
  }

  let roleQuery = supabaseAdmin
    .from('user_school_roles')
    .select('role, school_id, status')
    .eq('user_id', callerProfile.id);
  if (targetSchoolId) roleQuery = roleQuery.eq('school_id', targetSchoolId);

  const { data: schoolRoles, error: rolesError } = await roleQuery;
  if (rolesError) {
    return { allowed: false, status: 500, error: rolesError.message };
  }

  const allowed = (schoolRoles ?? []).some((entry: any) => {
    const role = String(entry.role ?? '').toUpperCase();
    const status = String(entry.status ?? 'ACTIVE').toUpperCase();
    return ['SCHOOL_ADMIN', 'ADMIN', 'MAIN_ADMIN'].includes(role) && status !== 'INACTIVE';
  });

  return allowed
    ? { allowed: true, callerProfileId: callerProfile.id, unrestricted: false }
    : { allowed: false, status: 403, error: 'Nemate ovlasti za reset pristupnih podataka.' };
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return jsonResponse({ success: false, error: 'Supabase Admin client nije konfiguriran.' }, 500);
    }

    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) {
      return jsonResponse({ success: false, error: 'Nedostaje autorizacijski token.' }, 401);
    }

    const body = await req.json();
    const profileId = String(body.profileId ?? '');
    const schoolId = body.schoolId ? String(body.schoolId) : undefined;
    const accountType = String(body.accountType ?? '') as AccountType;
    const mode = String(body.mode ?? 'GENERATE') as ResetMode;
    const resetAuthenticator = Boolean(body.resetAuthenticator);

    if (!profileId || !['STUDENT', 'STAFF'].includes(accountType)) {
      return jsonResponse({ success: false, error: 'Nedostaju podaci o korisniku ili vrsti računa.' }, 400);
    }

    const authorizationResult = await authorizeAdministrator(token, schoolId);
    if (!authorizationResult.allowed) {
      return jsonResponse(
        { success: false, error: authorizationResult.error },
        authorizationResult.status,
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, auth_user_id, email, role, access_role')
      .eq('id', profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.auth_user_id) {
      return jsonResponse({ success: false, error: 'Korisnički Auth račun nije pronađen.' }, 404);
    }

    const { data: targetRoles, error: targetRolesError } = await supabaseAdmin
      .from('user_school_roles')
      .select('role, school_id, status')
      .eq('user_id', profileId);
    if (targetRolesError) throw targetRolesError;

    if (!authorizationResult.unrestricted) {
      if (!schoolId) {
        return jsonResponse({ success: false, error: 'Nije odabrana škola za reset korisnika.' }, 400);
      }
      const belongsToSchool = (targetRoles ?? []).some((entry: any) =>
        entry.school_id === schoolId &&
        String(entry.status ?? 'ACTIVE').toUpperCase() !== 'INACTIVE'
      );
      if (!belongsToSchool) {
        return jsonResponse(
          { success: false, error: 'Korisnik nije povezan s vašom školom.' },
          403,
        );
      }
    }

    const resolvedRoles = [
      String(profile.role ?? '').toUpperCase(),
      String(profile.access_role ?? '').toUpperCase(),
      ...(targetRoles ?? []).map((entry: any) => String(entry.role ?? '').toUpperCase()),
    ];
    const resolvedAccountType: AccountType = resolvedRoles.some((role) =>
      [
        'TEACHER',
        'ADMIN',
        'MAIN_ADMIN',
        'SUPER_ADMIN',
        'SCHOOL_ADMIN',
        'HOMEROOM',
        'DEPUTY',
        'HOMEROOM_TEACHER',
        'STAFF',
      ].includes(role),
    )
      ? 'STAFF'
      : 'STUDENT';
    if (resolvedAccountType !== accountType) {
      return jsonResponse(
        {
          success: false,
          error: resolvedAccountType === 'STAFF'
            ? 'Korisnik je zaposlenik; potrebno je resetirati PIN.'
            : 'Korisnik je učenik; potrebno je resetirati lozinku.',
        },
        400,
      );
    }

    const credential =
      accountType === 'STAFF'
        ? generateStaffPin()
        : mode === 'DEFAULT'
          ? 'yupu8Ev4'
          : generateStudentPassword();

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.auth_user_id,
      { password: credential },
    );
    if (authUpdateError) throw authUpdateError;

    const profileUpdate =
      accountType === 'STAFF'
        ? {
            pin_hash: await bcrypt.hash(credential, 10),
            password_type: 'staff_with_authenticator',
            requires_password_change: false,
            ...(resetAuthenticator
              ? { authenticator_secret: null, requires_authenticator_setup: true }
              : {}),
          }
        : {
            password_type: 'student_static',
            requires_password_change: false,
          };

    const { error: profileUpdateError } = await supabaseAdmin
      .from('user_profiles')
      .update(profileUpdate)
      .eq('id', profileId);
    if (profileUpdateError) throw profileUpdateError;

    console.log('[RESET_CREDENTIALS] Completed', {
      profileId,
      schoolId,
      accountType,
      mode,
      resetAuthenticator,
      callerProfileId: authorizationResult.callerProfileId,
    });

    return jsonResponse({
      success: true,
      credential,
      credentialType: accountType === 'STAFF' ? 'PIN' : 'PASSWORD',
      authenticatorReset: accountType === 'STAFF' && resetAuthenticator,
    });
  } catch (error: any) {
    console.error('[RESET_CREDENTIALS] Error:', error);
    return jsonResponse(
      { success: false, error: error?.message || 'Reset pristupnih podataka nije uspio.' },
      500,
    );
  }
}
