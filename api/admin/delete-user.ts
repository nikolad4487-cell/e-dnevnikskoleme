import { supabaseAdmin } from '../_supabase.js';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Supabase Admin client not initialized." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { profileId, schoolId, softDelete } = body;

    if (softDelete) {
      // Deactivate in this school
      const { error } = await supabaseAdmin
        .from('user_school_roles')
        .update({ status: 'INACTIVE' })
        .eq('user_id', profileId)
        .eq('school_id', schoolId);
      if (error) throw error;
    } else {
      // Just remove roles for THIS school
      const { error } = await supabaseAdmin
        .from('user_school_roles')
        .delete()
        .eq('user_id', profileId)
        .eq('school_id', schoolId);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[ADMIN_DELETE_API] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
