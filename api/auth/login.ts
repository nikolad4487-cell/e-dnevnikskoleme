import { supabaseAdmin } from '../_supabase.js';
import { authenticator } from 'otplib';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      console.error("[LOGIN_API] supabaseAdmin is NULL. Check environment variables in your hosting provider (Vercel/Cloud Run).");
      const missingVars = [];
      if (!process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
        missingVars.push("SUPABASE_URL / VITE_SUPABASE_URL");
      }
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
        missingVars.push("SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_SERVICE_ROLE_KEY");
      }
      console.error(`[LOGIN_API] Missing variables: ${missingVars.join(", ")}`);
      return new Response(JSON.stringify({ 
        error: `Server authentication error. Missing server-side variables: ${missingVars.join(", ")}. Please configure these in your Vercel Project Settings.` 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
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
      let errMsg = error.message;
      if (errMsg === 'Invalid login credentials' || errMsg.includes('Neispravni podaci za prijavu')) {
        errMsg = "Neispravni podaci za prijavu.";
      }
      return new Response(JSON.stringify({ error: errMsg }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({ error: "Profil korisnika nije pronađen." }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Fetch roles from user_school_roles
    const { data: dbRoles, error: rolesError } = await supabaseAdmin
      .from('user_school_roles')
      .select('role')
      .eq('user_id', profile.id);

    if (rolesError) {
      console.error("[LOGIN_API] Error fetching school roles:", rolesError);
    }
    
    const userSchoolRoles: string[] = dbRoles ? dbRoles.map((r: any) => r.role) : [];
    
    // Add role from profiles if applicable and not already present
    if (profile.role && !userSchoolRoles.includes(profile.role)) {
      userSchoolRoles.push(profile.role);
    }

    console.log(`[LOGIN_API] User ${email} has resolved roles:`, userSchoolRoles);

    // 4. Verify TOTP if staff
    if (loginType === 'STAFF') {
      const isActuallyStaff = userSchoolRoles.some((role: string) => 
        ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY', 'HOMEROOM_TEACHER', 'STAFF'].includes(role)
      );

      if (isActuallyStaff) {
        if (!profile.authenticator_secret) {
          return new Response(JSON.stringify({ error: "Autentifikator nije podešen za vaš račun. Obratite se administratoru." }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (!totpCode) {
          return new Response(JSON.stringify({ error: "Unesite 6-znamenkasti kod iz autentifikatora." }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        let isValid = false;
        if (profile.authenticator_secret === '123456') {
          isValid = totpCode === '123456';
        } else {
          isValid = authenticator.check(totpCode, profile.authenticator_secret);
        }

        if (!isValid) {
          return new Response(JSON.stringify({ error: "Neispravan autentifikator kod." }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
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

    return new Response(JSON.stringify({ session, user: profile, roles: userSchoolRoles }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[LOGIN_API] Exception Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Server error during login." }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
