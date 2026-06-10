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

    // Get Profile's authenticator_secret using id or auth_user_id
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, auth_user_id, authenticator_secret')
      .eq('id', authUserId)
      .maybeSingle();

    if (profileError || !profile) {
      const { data: p2, error: pe2 } = await supabaseAdmin
        .from('user_profiles')
        .select('id, auth_user_id, authenticator_secret')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (p2) {
        profile = p2;
        profileError = null;
      }
    }

    const userId = authUserId;
    const secret = profile ? profile.authenticator_secret : null;
    const token = totpCode;

    console.log("VERIFY USER", userId);
    console.log("HAS SECRET", !!secret);
    console.log("TOKEN", token);

    if (profileError) {
      return new Response(JSON.stringify({ success: false, error: `Greška baze podataka: ${profileError.message}` }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!profile) {
      return new Response(JSON.stringify({ success: false, error: `Profil nije pronađen za ID ${authUserId}` }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!profile.authenticator_secret) {
      return new Response(JSON.stringify({ success: false, error: "Korisnik nema postavljen autentifikator." }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let isValid = false;
    let refusalReason = "";

    if (profile.authenticator_secret === '123456') {
      isValid = totpCode === '123456';
      if (!isValid) refusalReason = "Testni kod nije ispravan (očekivano '123456').";
    } else {
      isValid = authenticator.check(totpCode, profile.authenticator_secret);
      if (!isValid) refusalReason = "Uneseni kod je neispravan za ovaj autentifikator.";
    }

    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: refusalReason || "Neispravan autentifikator kod." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
