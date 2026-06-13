import { supabaseAdmin } from '../_supabase.js';

const NIKOLA_EMAIL = 'nikola.duric@eskole.me';
const SYSTEM_EMAIL = 'skola@eskole.me';
const NIKOLA_SCHOOL_ID = 'srednja-kola-glina-zagreb';

async function findAuthUser(email: string) {
  const { data, error } = await supabaseAdmin!.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function recreateAuthUser(email: string, password: string, name: string) {
  const existingAuth = await findAuthUser(email);
  if (existingAuth) {
    const { error } = await supabaseAdmin!.auth.admin.deleteUser(existingAuth.id);
    if (error) throw error;
  }

  const { data, error } = await supabaseAdmin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) {
    throw error ?? new Error(`Auth account ${email} could not be created.`);
  }
  return data.user;
}

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return Response.json({ error: 'Supabase Admin client is not initialized.' }, { status: 500 });
  }

  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return Response.json({ error: 'Authorization is required.' }, { status: 401 });
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || callerData.user?.email?.toLowerCase() !== NIKOLA_EMAIL) {
      return Response.json({ error: 'This service call is not allowed.' }, { status: 403 });
    }

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, access_role')
      .eq('auth_user_id', callerData.user.id)
      .maybeSingle();

    if (
      profileError
      || !callerProfile
      || !['super_admin', 'main_admin'].includes(String(callerProfile.access_role ?? '').toLowerCase())
    ) {
      return Response.json({ error: 'The caller is not the current super administrator.' }, { status: 403 });
    }

    const body = await req.json();
    const nikolaPassword = String(body.nikolaPassword ?? '');
    const systemPassword = String(body.systemPassword ?? '');
    if (nikolaPassword.length < 10 || systemPassword.length < 10) {
      return Response.json(
        { error: 'Temporary passwords must contain at least 10 characters.' },
        { status: 400 },
      );
    }

    const { data: nikolaProfile, error: nikolaProfileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', NIKOLA_EMAIL)
      .maybeSingle();
    if (nikolaProfileError || !nikolaProfile) {
      throw nikolaProfileError ?? new Error('Nikola profile was not found.');
    }

    const { error: nikolaDetachError } = await supabaseAdmin
      .from('user_profiles')
      .update({ auth_user_id: null })
      .eq('id', nikolaProfile.id);
    if (nikolaDetachError) throw nikolaDetachError;

    const nikolaAuth = await recreateAuthUser(
      NIKOLA_EMAIL,
      nikolaPassword,
      'Nikola \u0110uri\u0107',
    );
    const { error: nikolaUpdateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        auth_user_id: nikolaAuth.id,
        name: 'Nikola \u0110uri\u0107',
        role: 'SCHOOL_ADMIN',
        access_role: 'school_admin',
        school_id: NIKOLA_SCHOOL_ID,
        active_school_id: NIKOLA_SCHOOL_ID,
        password_type: 'staff_with_authenticator',
        requires_password_change: true,
        authenticator_secret: '123456',
        requires_authenticator_setup: false,
        is_first_login: true,
      })
      .eq('id', nikolaProfile.id);
    if (nikolaUpdateError) throw nikolaUpdateError;

    const { error: nikolaRolesDeleteError } = await supabaseAdmin
      .from('user_school_roles')
      .delete()
      .eq('user_id', nikolaProfile.id);
    if (nikolaRolesDeleteError) throw nikolaRolesDeleteError;

    const { error: nikolaRoleError } = await supabaseAdmin
      .from('user_school_roles')
      .insert({
        user_id: nikolaProfile.id,
        school_id: NIKOLA_SCHOOL_ID,
        role: 'SCHOOL_ADMIN',
        status: 'ACTIVE',
      });
    if (nikolaRoleError) throw nikolaRoleError;

    const { data: existingSystemProfile, error: systemProfileLookupError } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', SYSTEM_EMAIL)
      .maybeSingle();
    if (systemProfileLookupError) throw systemProfileLookupError;

    if (existingSystemProfile) {
      const { error: systemDetachError } = await supabaseAdmin
        .from('user_profiles')
        .update({ auth_user_id: null })
        .eq('id', existingSystemProfile.id);
      if (systemDetachError) throw systemDetachError;
    }

    const systemAuth = await recreateAuthUser(
      SYSTEM_EMAIL,
      systemPassword,
      'Glavni administrator',
    );
    let systemProfileId = existingSystemProfile?.id;

    if (systemProfileId) {
      const { error } = await supabaseAdmin
        .from('user_profiles')
        .update({
          auth_user_id: systemAuth.id,
          name: 'Glavni administrator',
          role: 'MAIN_ADMIN',
          access_role: 'super_admin',
          school_id: null,
          active_school_id: null,
          password_type: 'staff_with_authenticator',
          requires_password_change: true,
          authenticator_secret: '123456',
          requires_authenticator_setup: false,
          is_first_login: true,
        })
        .eq('id', systemProfileId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          auth_user_id: systemAuth.id,
          email: SYSTEM_EMAIL,
          name: 'Glavni administrator',
          role: 'MAIN_ADMIN',
          access_role: 'super_admin',
          school_id: null,
          active_school_id: null,
          password_type: 'staff_with_authenticator',
          requires_password_change: true,
          authenticator_secret: '123456',
          requires_authenticator_setup: false,
          is_first_login: true,
        })
        .select('id')
        .single();
      if (error || !data) {
        throw error ?? new Error('The super administrator profile could not be created.');
      }
      systemProfileId = data.id;
    }

    const { error: systemRolesDeleteError } = await supabaseAdmin
      .from('user_school_roles')
      .delete()
      .eq('user_id', systemProfileId);
    if (systemRolesDeleteError) throw systemRolesDeleteError;

    return Response.json({
      success: true,
      nikola: {
        email: NIKOLA_EMAIL,
        profileId: nikolaProfile.id,
        authUserId: nikolaAuth.id,
        role: 'SCHOOL_ADMIN',
        schoolId: NIKOLA_SCHOOL_ID,
      },
      system: {
        email: SYSTEM_EMAIL,
        profileId: systemProfileId,
        authUserId: systemAuth.id,
        role: 'MAIN_ADMIN',
        accessRole: 'super_admin',
        schoolId: null,
      },
      temporaryAuthenticatorCode: '123456',
    });
  } catch (error) {
    console.error('[REPAIR_SYSTEM_ADMINS]', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Administrator repair failed.' },
      { status: 500 },
    );
  }
}
