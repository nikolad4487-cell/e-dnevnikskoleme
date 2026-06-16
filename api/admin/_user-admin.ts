import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { supabaseAdmin } from '../_supabase.js';

export const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function normalizeForEmail(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/č|ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
}

export function generateUniqueEmail(firstName: string, lastName: string, existingEmails: Set<string>): string {
  const normFirst = normalizeForEmail(firstName).replace(/\s+/g, '');
  const normLast = normalizeForEmail(lastName).replace(/\s+/g, '-');
  const baseAddress = normLast ? `${normFirst}.${normLast}` : normFirst || 'korisnik';
  const baseEmail = `${baseAddress}@skolehr.xyz`;

  if (!existingEmails.has(baseEmail)) return baseEmail;

  let counter = 2;
  while (true) {
    const email = `${baseAddress}${counter}@skolehr.xyz`;
    if (!existingEmails.has(email)) return email;
    counter += 1;
  }
}

export async function listExistingEmails() {
  if (!supabaseAdmin) throw new Error('Supabase Admin client not initialized.');
  const existingEmails = new Set<string>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((user: any) => {
      if (user.email) existingEmails.add(String(user.email).toLowerCase());
    });
    if (data.users.length < 1000) break;
  }

  const { data: existingProfiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('email');
  if (error) throw error;
  existingProfiles?.forEach((profile: any) => {
    if (profile.email) existingEmails.add(String(profile.email).toLowerCase());
  });

  return existingEmails;
}

export async function authorizeAdministrator(req: Request, schoolId?: string) {
  if (!supabaseAdmin) {
    return { allowed: false, status: 500, error: 'Supabase Admin client not initialized.' };
  }

  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    return { allowed: false, status: 401, error: 'Nedostaje autorizacijski token.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { allowed: false, status: 401, error: 'Neispravan autorizacijski token.' };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, access_role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return { allowed: false, status: 403, error: 'Profil administratora nije pronađen.' };
  }

  const globalRoles = [
    String(profile.role ?? '').toUpperCase(),
    String(profile.access_role ?? '').toUpperCase(),
  ];
  if (globalRoles.some((role) => ['MAIN_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role))) {
    return { allowed: true, profileId: profile.id, unrestricted: true };
  }

  let roleQuery = supabaseAdmin
    .from('user_school_roles')
    .select('role, school_id, status')
    .eq('user_id', profile.id);
  if (schoolId) roleQuery = roleQuery.eq('school_id', schoolId);

  const { data: roles, error: roleError } = await roleQuery;
  if (roleError) {
    return { allowed: false, status: 500, error: roleError.message };
  }

  const allowed = (roles ?? []).some((entry: any) => {
    const role = String(entry.role ?? '').toUpperCase();
    const status = String(entry.status ?? 'ACTIVE').toUpperCase();
    return ['MAIN_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'HOMEROOM'].includes(role) && status !== 'INACTIVE';
  });

  return allowed
    ? { allowed: true, profileId: profile.id, unrestricted: false }
    : { allowed: false, status: 403, error: 'Nemate ovlasti za upravljanje korisnicima.' };
}

export function resolveUserShape(body: any) {
  const roles = Array.isArray(body.roles)
    ? [...body.roles]
    : Array.isArray(body.selectedRoles)
      ? [...body.selectedRoles]
      : [];
  const globalRole = body.globalRole;
  if (globalRole && !roles.includes(globalRole)) roles.push(globalRole);

  const isStaff = roles.some((role: string) =>
    ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM'].includes(String(role).toUpperCase()),
  );
  const isStudent = roles.some((role: string) => String(role).toUpperCase() === 'STUDENT');
  return { roles, globalRole, isStaff, isStudent };
}

export async function createOrUpdateUserFromPayload(body: any) {
  if (!supabaseAdmin) throw new Error('Supabase Admin client not initialized.');

  const { roles, globalRole, isStaff, isStudent } = resolveUserShape(body);
  let { email, name, surname, address, oib, schoolId, classId, studentData } = body;
  const existingEmails = await listExistingEmails();

  const rawName = String(name ?? '').trim();
  const rawSurname = String(surname ?? '').trim();
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = rawSurname ? rawName : nameParts[0] ?? rawName;
  const lastName = rawSurname || nameParts.slice(1).join(' ');
  const fullName = rawSurname ? `${rawName} ${rawSurname}`.trim() : rawName;

  email = String(email ?? '').trim().toLowerCase();
  if (!email) {
    email = generateUniqueEmail(firstName, lastName, existingEmails);
  }

  let finalPassword = body.password;
  let requiresPasswordChange = true;
  let authenticatorSecret: string | null = null;
  let requiresAuthenticatorSetup = false;
  let passwordType = 'standard';

  if (isStudent) {
    finalPassword = 'yupu8Ev4';
    requiresPasswordChange = false;
    passwordType = 'student_static';
  } else if (isStaff) {
    finalPassword = '1234';
    requiresPasswordChange = false;
    authenticatorSecret = authenticator.generateSecret();
    requiresAuthenticatorSetup = true;
    passwordType = 'staff_with_authenticator';
  } else if (!finalPassword) {
    finalPassword = '1234';
  }

  let authUser = null;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    authUser = data.users.find((user: any) => String(user.email ?? '').toLowerCase() === email);
    if (authUser || data.users.length < 1000) break;
  }

  let userId = authUser?.id;
  if (authUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: finalPassword,
      email_confirm: true,
      user_metadata: { ...authUser.user_metadata, name: firstName, surname: lastName },
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { name: firstName, surname: lastName },
    });
    if (error || !data.user) throw new Error(error?.message || 'Greška pri kreiranju Auth korisnika.');
    authUser = data.user;
    userId = data.user.id;
  }

  if (body.authOnly) {
    return { success: true, userId, createdAuthUser: authUser, password: finalPassword, email };
  }

  const programId = studentData?.programId || body.programId;
  const dob = studentData?.dob || body.dob;
  const pob = studentData?.pob || body.pob;
  const mobile = studentData?.mobile || body.mobile;
  classId = classId || studentData?.classId;
  schoolId = schoolId || studentData?.schoolId;

  const profilePayload: Record<string, unknown> = {
    auth_user_id: userId,
    email,
    name: fullName || `${firstName} ${lastName}`.trim(),
    address: address || studentData?.address,
    oib: oib || studentData?.oib,
    dob,
    pob,
    mobile,
    role: isStudent ? 'STUDENT' : (globalRole || roles[0] || 'TEACHER'),
    class_id: classId || null,
    school_id: schoolId || null,
    school_year_id: studentData?.schoolYearId || null,
    is_first_login: true,
    requires_password_change: requiresPasswordChange,
    password_type: passwordType,
    requires_authenticator_setup: requiresAuthenticatorSetup,
  };
  if (authenticatorSecret) {
    profilePayload.authenticator_secret = authenticatorSecret;
    profilePayload.pin_hash = await bcrypt.hash(finalPassword, 10);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .upsert(profilePayload, { onConflict: 'auth_user_id' })
    .select()
    .maybeSingle();
  if (profileError || !profile) throw new Error(profileError?.message || 'Greška pri kreiranju profila.');

  if (schoolId && Array.isArray(roles)) {
    for (const role of roles) {
      const { error } = await supabaseAdmin.from('user_school_roles').upsert({
        user_id: profile.id,
        school_id: schoolId,
        role,
        status: 'ACTIVE',
      }, { onConflict: 'user_id,school_id,role' });
      if (error) throw error;
    }
  }

  if (isStudent && classId) {
    const { data: clsInfo, error: clsError } = await supabaseAdmin
      .from('classes')
      .select('school_year, school_year_id')
      .eq('id', classId)
      .maybeSingle();
    if (clsError) throw clsError;

    const { error } = await supabaseAdmin.from('student_class_enrollments').upsert({
      student_id: profile.id,
      class_id: classId,
      school_year_id: clsInfo?.school_year_id || null,
      school_year: clsInfo?.school_year || '2024/2025',
      program_id: programId || null,
      status: 'ACTIVE',
    }, { onConflict: 'student_id,class_id,school_year' });
    if (error) throw error;
  }

  let qrCode = null;
  if (authenticatorSecret) {
    qrCode = await QRCode.toDataURL(
      `otpauth://totp/e-Dnevnik:${email}?secret=${authenticatorSecret}&issuer=e-Dnevnik`,
    );
  }

  return {
    success: true,
    userId,
    profileId: profile.id,
    student: profile,
    profile,
    password: finalPassword,
    email,
    authenticatorSecret,
    qrCode,
    message: 'Korisnik uspješno kreiran',
  };
}
