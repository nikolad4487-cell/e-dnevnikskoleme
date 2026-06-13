import { supabaseAdmin } from '../_supabase.js';
import { errorMessage, jsonResponse, requireAdmin } from './_helpers.js';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    await requireAdmin(req, body.schoolId || null);
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    if (!body.profileId) throw new Error('Nedostaje profileId korisnika.');

    if (body.authUserId && body.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.authUserId, {
        email: String(body.email).trim().toLowerCase(),
      });
      if (error) {
        console.error('SAVE USER SUPABASE AUTH ERROR', error);
        throw error;
      }
    }

    const fullName = `${body.name || ''} ${body.surname || ''}`.trim();
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        email: String(body.email || '').trim().toLowerCase(),
        name: fullName,
        address: body.address || null,
        oib: body.oib || null,
      })
      .eq('id', body.profileId);
    if (profileError) {
      console.error('SAVE USER SUPABASE PROFILE ERROR', profileError);
      throw profileError;
    }

    if (body.schoolId && Array.isArray(body.roles)) {
      const { error: deleteRolesError } = await supabaseAdmin
        .from('user_school_roles')
        .delete()
        .eq('user_id', body.profileId)
        .eq('school_id', body.schoolId);
      if (deleteRolesError) {
        console.error('SAVE USER SUPABASE DELETE ROLES ERROR', deleteRolesError);
        throw deleteRolesError;
      }

      if (body.roles.length) {
        const { error: insertRolesError } = await supabaseAdmin
          .from('user_school_roles')
          .insert(body.roles.map((role: string) => ({
            user_id: body.profileId,
            school_id: body.schoolId,
            role,
            status: body.status || 'ACTIVE',
          })));
        if (insertRolesError) {
          console.error('SAVE USER SUPABASE INSERT ROLES ERROR', insertRolesError);
          throw insertRolesError;
        }
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('SAVE USER API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('ovlasti') || message.includes('autorizacij') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}
