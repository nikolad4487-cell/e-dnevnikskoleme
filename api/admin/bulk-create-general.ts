import { supabaseAdmin } from '../_supabase.js';

function normalizeForEmail(str: string): string {
    return (str || '').toLowerCase()
        .replace(/č/g, 'c')
        .replace(/ć/g, 'c')
        .replace(/š/g, 's')
        .replace(/ž/g, 'z')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();
}

function generateUniqueEmail(firstName: string, lastName: string, existingEmails: Set<string>): string {
    const normFirst = normalizeForEmail(firstName).replace(/\s+/g, '');
    const normLast = normalizeForEmail(lastName).replace(/\s+/g, '-');
    const baseAddress = normLast ? `${normFirst}.${normLast}` : normFirst;
    const baseEmail = `${baseAddress}@skolehr.xyz`;

    if (!existingEmails.has(baseEmail)) {
        return baseEmail;
    }

    let counter = 2;
    while (true) {
        const email = `${baseAddress}${counter}@skolehr.xyz`;
        if (!existingEmails.has(email)) {
            return email;
        }
        counter++;
    }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Supabase Admin client not initialized." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { users, role, schoolId } = body;
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Lista korisnika je prazna." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("BULK CREATE RECEIVED", { count: users.length, role, schoolId });

    const { data: existingUserList } = await supabaseAdmin.auth.admin.listUsers();
    const existingEmails = new Set<string>();
    existingUserList?.users?.forEach((u: any) => {
      if (u.email) existingEmails.add(u.email);
    });
    // Also check user_profiles
    const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
    existingProfiles?.forEach((p: any) => {
      if (p.email) existingEmails.add(p.email);
    });

    const results = [];
    const isStaff = role === 'ADMIN' || role === 'TEACHER';
    const userPassword = isStaff ? '1234' : 'yupu8Ev4';
    const passwordType = isStaff ? 'staff_with_authenticator' : (role === 'STUDENT' ? 'student_static' : 'parent_static');

    for (const userData of users) {
       let email = userData.email;
       if (email && typeof email === 'string') {
          email = email.trim().toLowerCase();
          if (!email.includes('@')) {
             email = `${email}@skolehr.xyz`;
          }
       }
       if (!email) {
          email = generateUniqueEmail(userData.name, userData.surname, existingEmails);
       } else if (existingEmails.has(email.toLowerCase())) {
          email = generateUniqueEmail(userData.name, userData.surname, existingEmails);
       }
       existingEmails.add(email.toLowerCase());

       const fullName = userData.surname ? `${userData.name} ${userData.surname}` : userData.name;

       console.log("BULK CREATE USER", userData);

       const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: userPassword,
          email_confirm: true,
          user_metadata: { name: userData.name, surname: userData.surname }
       });

       if (authError || !authUser?.user) {
          results.push({ ...userData, success: false, error: authError?.message || 'Greška pri kreiranju zabilježena auth' });
          continue;
       }

       const userId = authUser.user.id;
       console.log("CREATED AUTH USER", authUser.user);

       const { data: profile, error: profileError } = await supabaseAdmin
         .from('user_profiles')
         .upsert({
            auth_user_id: userId,
            email,
            name: fullName,
            role: role,
            is_first_login: true,
            requires_password_change: false,
            requires_authenticator_setup: isStaff,
            password_type: passwordType,
            school_id: schoolId
         }, { onConflict: 'auth_user_id' })
         .select()
         .maybeSingle();

       if (profileError || !profile) {
          results.push({ ...userData, success: false, error: profileError?.message || 'Greška u profilu' });
          continue;
       }
       console.log("CREATED PROFILE", profile);

       if (schoolId) {
          await supabaseAdmin.from('user_school_roles').upsert({
             user_id: profile.id,
             school_id: schoolId,
             role: role,
             status: 'ACTIVE'
          }, { onConflict: 'user_id,school_id,role' });
       }

       results.push({ ...userData, success: true, email, password: userPassword, profile });
    }

    return new Response(JSON.stringify({ success: true, results, message: "Korisnici obrađeni." }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[ADMIN_BULK_CREATE_GENERAL_API]", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
