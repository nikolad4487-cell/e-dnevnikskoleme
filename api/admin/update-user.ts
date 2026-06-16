import { supabaseAdmin } from '../_supabase.js';
import { authorizeAdministrator, jsonResponse } from './_user-admin.js';

export async function PATCH(req: Request) {
  try {
    if (!supabaseAdmin) {
      return jsonResponse({ success: false, error: 'Supabase Admin client not initialized.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { profileId, authUserId, email, name, surname, address, oib, roles, schoolId, status } = body;
    const auth = await authorizeAdministrator(req, schoolId);
    if (!auth.allowed) {
      return jsonResponse({ success: false, error: auth.error }, auth.status);
    }
    if (!profileId) {
      return jsonResponse({ success: false, error: 'Nedostaje ID profila.' }, 400);
    }

    if (authUserId && email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { email });
      if (error) throw error;
    }

    const displayName = surname ? `${name ?? ''} ${surname}`.trim() : String(name ?? '').trim();
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({ email, name: displayName, address, oib })
      .eq('id', profileId);
    if (profileError) throw profileError;

    if (schoolId && Array.isArray(roles)) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_school_roles')
        .delete()
        .eq('user_id', profileId)
        .eq('school_id', schoolId);
      if (deleteError) throw deleteError;

      for (const role of roles) {
        const { error } = await supabaseAdmin.from('user_school_roles').insert({
          user_id: profileId,
          school_id: schoolId,
          role,
          status: status || 'ACTIVE',
        });
        if (error) throw error;
      }
    }

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('[UPDATE_USER_API]', error);
    return jsonResponse({ success: false, error: error?.message || 'Neuspjela obrada zahtjeva.' }, 500);
  }
}

export async function POST(req: Request) {
  return PATCH(req);
}
