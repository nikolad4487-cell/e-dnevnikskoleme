import { supabaseAdmin } from '../_supabase.js';
import { authorizeAdministrator, jsonResponse } from './_user-admin.js';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return jsonResponse({ success: false, error: 'Supabase Admin client not initialized.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const profileId = String(body.profileId ?? '');
    const schoolId = body.schoolId ? String(body.schoolId) : undefined;
    const softDelete = body.softDelete !== false;
    const auth = await authorizeAdministrator(req, schoolId);
    if (!auth.allowed) {
      return jsonResponse({ success: false, error: auth.error }, auth.status);
    }
    if (!profileId) {
      return jsonResponse({ success: false, error: 'Nedostaje ID korisnika.' }, 400);
    }

    if (softDelete) {
      const { error } = await supabaseAdmin
        .from('user_school_roles')
        .update({ status: 'INACTIVE' })
        .eq('user_id', profileId)
        .eq('school_id', schoolId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    const { error } = await supabaseAdmin
      .from('user_school_roles')
      .delete()
      .eq('user_id', profileId)
      .eq('school_id', schoolId);
    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('[DELETE_USER_API]', error);
    return jsonResponse({ success: false, error: error?.message || 'Brisanje nije uspjelo.' }, 500);
  }
}
