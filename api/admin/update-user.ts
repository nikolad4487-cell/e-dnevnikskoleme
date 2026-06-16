import { supabaseAdmin } from '../_supabase.js';

export async function PATCH(req: Request) {
  try {
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Supabase Admin client not initialized." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { profileId, authUserId, email, name, surname, address, oib, roles, schoolId, status } = body;

    console.log(`[ADMIN_UPDATE_API] Updating user ${email} (Profile ID: ${profileId})`);

    // Update Auth Email if changed
    if (authUserId && email) {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { email });
    }

    // Update Profile
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        email,
        name: `${name} ${surname}`,
        address,
        oib
      })
      .eq('id', profileId);
    
    if (profileError) throw profileError;

    // Update Roles (Replace existing for this school)
    if (schoolId && roles && Array.isArray(roles)) {
      // Delete old roles for this school
      await supabaseAdmin
        .from('user_school_roles')
        .delete()
        .eq('user_id', profileId)
        .eq('school_id', schoolId);
      
      // Insert new ones
      for (const role of roles) {
        await supabaseAdmin
          .from('user_school_roles')
          .insert({
            user_id: profileId,
            school_id: schoolId,
            role: role,
            status: status || 'ACTIVE'
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[ADMIN_UPDATE_API] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
