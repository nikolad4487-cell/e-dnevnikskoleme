import { supabaseAdmin } from '../_supabase.js';
import { errorMessage, jsonResponse, requireAdmin } from './_helpers.js';

async function deleteUser(req: Request) {
  try {
    const body = await req.json();
    await requireAdmin(req, body.schoolId || null);
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    if (!body.profileId) throw new Error('Nedostaje profileId korisnika.');

    const { error } = body.softDelete
      ? await supabaseAdmin
          .from('user_school_roles')
          .update({ status: 'INACTIVE' })
          .eq('user_id', body.profileId)
          .eq('school_id', body.schoolId)
      : await supabaseAdmin
          .from('user_school_roles')
          .delete()
          .eq('user_id', body.profileId)
          .eq('school_id', body.schoolId);
    if (error) {
      console.error('DELETE USER SUPABASE ERROR', error);
      throw error;
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('DELETE USER API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('ovlasti') || message.includes('autorizacij') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}

export const POST = deleteUser;
export const DELETE = deleteUser;
