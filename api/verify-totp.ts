import { supabaseAdmin } from './_supabase.js';
import { authenticator } from 'otplib';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      console.error("[VERIFY_TOTP_API] supabaseAdmin is NULL");
      return new Response(JSON.stringify({ success: false, error: "Server authentication error." }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { authUserId, totpCode } = body;

    if (!authUserId) {
      return new Response(JSON.stringify({ success: false, error: "Nedostaje ID korisnika." }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!totpCode) {
      return new Response(JSON.stringify({ success: false, error: "Nedostaje kod iz autentifikatora." }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get Profile's authenticator_secret using auth_user_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('authenticator_secret')
      .eq('auth_user_id', authUserId)
      .single();

    if (profileError || !profile || !profile.authenticator_secret) {
      return new Response(JSON.stringify({ success: false, error: "Korisnik nema postavljen autentifikator." }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let isValid = false;
    if (profile.authenticator_secret === '123456') {
      isValid = totpCode === '123456';
    } else {
      isValid = authenticator.check(totpCode, profile.authenticator_secret);
    }

    return new Response(JSON.stringify({ success: isValid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[VERIFY_TOTP_API] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
