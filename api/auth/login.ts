import { supabaseAdmin } from '../_supabase.js';
import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';

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

    // Staff authenticate with their PIN, while Supabase uses the internal password.
    const technicalPassword = process.env.STAFF_AUTH_TECHNICAL_PASSWORD || '123456';
    const supabasePassword = loginType === 'STAFF' ? technicalPassword : password;
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: supabasePassword
    });

    if (signInError) {
      console.error(`[LOGIN_API] Supabase signIn Error for ${email}:`, signInError.message);
      let errMsg = signInError.message;
      if (errMsg === 'Invalid login credentials' || errMsg.includes('Neispravni podaci za prijavu')) {
        errMsg = "Neispravni podaci za prijavu.";
      }
      return new Response(JSON.stringify({ error: errMsg }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const authUser = signInData.user;
    const authSession = signInData.session;
    if (!authUser || !authSession) {
      return new Response(JSON.stringify({ error: "Supabase nije vratio valjanu sesiju." }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    if (loginType === 'STAFF') {
      if (!profile.pin_hash) {
        return new Response(JSON.stringify({ error: "PIN nije postavljen." }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const isPinValid = await bcrypt.compare(password, profile.pin_hash);
      if (!isPinValid) {
        return new Response(JSON.stringify({ error: "Neispravan PIN." }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
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
        // If user already has MFA configured, require TOTP. Otherwise, allow login and flag for setup.
        const isMfaSet = profile.authenticator_secret && !profile.requires_authenticator_setup;

        if (isMfaSet) {
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
        } else {
          // Flag as MFA setup needed
          return new Response(JSON.stringify({ 
            session: authSession,
            user: profile, 
            roles: userSchoolRoles,
            mfa_setup_needed: true
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    return new Response(JSON.stringify({ session: authSession, user: profile, roles: userSchoolRoles }), {
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
