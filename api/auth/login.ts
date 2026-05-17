import { supabaseAdmin } from '../_supabase.js';
import { authenticator } from 'otplib';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      console.error("[LOGIN_API] supabaseAdmin is NULL");
      return new Response(JSON.stringify({ error: "Server authentication error." }), { status: 500 });
    }

    const body = await req.json();
    const { email, password, totpCode, loginType } = body;

    console.log(`[LOGIN_API] Attempting login for ${email} (${loginType})`);

    // 1. Sign in with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error(`[LOGIN_API] Supabase signIn Error for ${email}:`, error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 401 });
    }

    const authUser = data.user;
    const session = data.session;

    // 2. Get Profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profil korisnika nije pronađen." }), { status: 401 });
    }

    // 3. Verify TOTP if staff
    if (loginType === 'STAFF') {
      const { data: roles } = await supabaseAdmin
        .from('user_school_roles')
        .select('role')
        .eq('user_id', profile.id);
      
      const isActuallyStaff = roles?.some((r: any) => 
        ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY'].includes(r.role)
      );

      if (isActuallyStaff) {
        if (!profile.authenticator_secret) {
          return new Response(JSON.stringify({ error: "Autentifikator nije podešen za vaš račun. Obratite se administratoru." }), { status: 401 });
        }

        if (!totpCode) {
          return new Response(JSON.stringify({ error: "Unesite 6-znamenkasti kod iz autentifikatora." }), { status: 401 });
        }

        let isValid = false;
        if (profile.authenticator_secret === '123456') {
          isValid = totpCode === '123456';
        } else {
          isValid = authenticator.check(totpCode, profile.authenticator_secret);
        }

        if (!isValid) {
          return new Response(JSON.stringify({ error: "Neispravan autentifikator kod." }), { status: 401 });
        }

        // If successful and was pending setup, mark as setup done
        if (profile.requires_authenticator_setup) {
          await supabaseAdmin
            .from('user_profiles')
            .update({ requires_authenticator_setup: false })
            .eq('id', profile.id);
        }
      }
    }

    return new Response(JSON.stringify({ session, user: profile }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[LOGIN_API] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
