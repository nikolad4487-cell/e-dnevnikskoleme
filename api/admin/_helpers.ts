import { supabaseAdmin } from '../_supabase.js';

const ADMIN_ROLES = new Set(['MAIN_ADMIN', 'ADMIN', 'SCHOOL_ADMIN']);

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error || 'Nepoznata greška.');
}

export async function requireAdmin(req: Request, requestedSchoolId?: string | null) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Admin client nije inicijaliziran.');
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Nedostaje autorizacijski token.');

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    console.error('ADMIN API AUTH ERROR', authError);
    throw new Error(authError?.message || 'Prijava korisnika nije valjana.');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, access_role, school_id')
    .eq('auth_user_id', authData.user.id)
    .single();
  if (profileError || !profile) {
    console.error('ADMIN API PROFILE ERROR', profileError);
    throw new Error(profileError?.message || 'Profil administratora nije pronađen.');
  }

  const { data: roleRows, error: rolesError } = await supabaseAdmin
    .from('user_school_roles')
    .select('school_id, role, status')
    .eq('user_id', profile.id)
    .eq('status', 'ACTIVE');
  if (rolesError) {
    console.error('ADMIN API ROLES ERROR', rolesError);
    throw rolesError;
  }

  const isSuperAdmin = ['super_admin', 'main_admin'].includes(
    String(profile.access_role || '').toLowerCase(),
  ) || String(profile.role || '').toUpperCase() === 'MAIN_ADMIN';
  const hasSchoolAdminRole = (roleRows || []).some(
    (row) =>
      ADMIN_ROLES.has(String(row.role || '').toUpperCase())
      && (!requestedSchoolId || row.school_id === requestedSchoolId),
  );

  if (!isSuperAdmin && !hasSchoolAdminRole) {
    throw new Error('Nemate administratorske ovlasti za odabranu školu.');
  }

  return { authUser: authData.user, profile, isSuperAdmin };
}

export async function findAuthUserByEmail(email: string) {
  if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
  const normalized = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === normalized);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}
