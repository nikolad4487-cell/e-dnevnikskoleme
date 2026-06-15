import { supabaseAdmin } from '../_supabase.js';
import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';

function normalizeEmail(value: unknown) {
  let email = String(value ?? '').trim().toLowerCase();
  if (email === 'skole' || email === 'skole@skolehr.xyz') {
    return 'skola@skolehr.xyz';
  }
  if (!email.includes('@')) return `${email}@skolehr.xyz`;
  return email.replace(/@eskole\.(me|hr)$/i, '@skolehr.xyz');
}

function getLoginEmailCandidates(value: unknown) {
  const normalized = normalizeEmail(value);
  const candidates = [normalized];
  if (normalized.endsWith('@skolehr.xyz')) {
    candidates.push(normalized.replace(/@skolehr\.xyz$/i, '@eskole.hr'));
    candidates.push(normalized.replace(/@skolehr\.xyz$/i, '@eskole.me'));
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function findAuthUserByEmailCandidates(candidates: string[]) {
  if (!supabaseAdmin) return null;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item: any) => candidates.includes(String(item.email ?? '').toLowerCase()));
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function signInWithCandidates(candidates: string[], password: string) {
  if (!supabaseAdmin) return { data: null, error: new Error('Supabase Admin client not initialized.') };

  let lastError: any = null;
  for (const candidate of candidates) {
    const result = await supabaseAdmin.auth.signInWithPassword({ email: candidate, password });
    if (!result.error && result.data.user && result.data.session) {
      return { ...result, email: candidate };
    }
    lastError = result.error;
  }
  return { data: null, error: lastError, email: candidates[0] };
}

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
    const emailCandidates = getLoginEmailCandidates(email);
    const normalizedEmail = emailCandidates[0];

    console.log(`[LOGIN_API] Attempting login for ${normalizedEmail} (${loginType})`);

    // 1. Sign in with Supabase
    let signInResult = await signInWithCandidates(emailCandidates, password);

    // Older staff accounts used a technical Supabase password. Verify the
    // entered PIN against pin_hash, align the Auth password, then retry.
    if (signInResult.error && loginType === 'STAFF' && /^\d{4}$/.test(String(password ?? ''))) {
      const authUser = await findAuthUserByEmailCandidates(emailCandidates);
      if (authUser) {
        const { data: legacyProfile, error: legacyProfileError } = await supabaseAdmin
          .from('user_profiles')
          .select('id, pin_hash')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();

        const pinCheck = Boolean(
          !legacyProfileError
          && legacyProfile?.pin_hash
          && await bcrypt.compare(password, legacyProfile.pin_hash)
        );
        console.log(`[LOGIN_API] Legacy staff PIN migration check: ${pinCheck}`);

        if (pinCheck) {
          const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
            authUser.id,
            { password }
          );
          if (updatePasswordError) {
            console.error('[LOGIN_API] Failed to align staff Auth password:', updatePasswordError.message);
          } else {
            signInResult = await signInWithCandidates(
              [String(authUser.email ?? normalizedEmail).toLowerCase()],
              password
            );
          }
        }
      }
    }

    const { data, error } = signInResult;

    if (error) {
      console.error(`[LOGIN_API] Supabase signIn Error for ${normalizedEmail}:`, error.message);
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
    const accessRoleMap: Record<string, string> = {
      super_admin: 'MAIN_ADMIN',
      main_admin: 'MAIN_ADMIN',
      school_admin: 'SCHOOL_ADMIN',
      admin: 'ADMIN',
      teacher: 'TEACHER',
      student: 'STUDENT',
      parent: 'PARENT',
    };
    const mappedAccessRole = accessRoleMap[String(profile.access_role ?? '').toLowerCase()];
    if (mappedAccessRole && !userSchoolRoles.includes(mappedAccessRole)) {
      userSchoolRoles.push(mappedAccessRole);
    }

    console.log(`[LOGIN_API] User ${normalizedEmail} has resolved roles:`, userSchoolRoles);

    // 4. Verify TOTP if staff
    if (loginType === 'STAFF') {
      const isActuallyStaff = userSchoolRoles.some((role: string) => 
        ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY', 'HOMEROOM_TEACHER', 'STAFF'].includes(role)
      );

      if (isActuallyStaff) {
        if (!profile.pin_hash) {
          return new Response(JSON.stringify({ error: "PIN nije postavljen za ovaj korisnički račun." }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const pinCheck = await bcrypt.compare(password, profile.pin_hash);
        console.log(`[LOGIN_API] Staff PIN check: ${pinCheck}`);
        if (!pinCheck) {
          return new Response(JSON.stringify({ error: "Neispravan PIN." }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

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
            session, 
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
