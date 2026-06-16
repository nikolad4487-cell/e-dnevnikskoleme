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
    const { profileId, type } = body; // type: 'DEFAULT' or 'GENERATE'

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ success: false, error: "Profil nije pronađen." }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let newPassword = 'yupu8Ev4';
    if (type === 'GENERATE') {
      const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const numbers = "0123456789";
      const symbols = "!?-" ;
      const all = letters + numbers;
      
      let pass = "";
      // 6 characters from letters/numbers
      for (let i = 0 ; i < 6; i++) {
        pass += all.charAt(Math.floor(Math.random() * all.length));
      }
      // 1 number (to be sure)
      pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
      // 1 symbol
      pass += symbols.charAt(Math.floor(Math.random() * symbols.length));
      
      // Shuffle
      newPassword = pass.split('').sort(() => Math.random() - 0.5).join('');
    }

    // Update Auth Password
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.auth_user_id, {
      password: newPassword
    });

    if (authError) {
      return new Response(JSON.stringify({ success: false, error: authError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update profile flags just in case they were set
    await supabaseAdmin.from('user_profiles').update({
      requires_password_change: false,
      password_type: 'student_static'
    }).eq('id', profileId);

    return new Response(JSON.stringify({
      success: true,
      newPassword
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[RESET_STUDENT_PASS_API] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
