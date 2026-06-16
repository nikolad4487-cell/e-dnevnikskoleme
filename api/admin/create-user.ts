import { supabaseAdmin } from '../_supabase.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

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
    console.log("[ADMIN_CREATE_API] Incoming request body:", JSON.stringify(body));

    // Defensive defaults for roles and programs (preventing .includes() crash)
    const roles = Array.isArray(body.roles) ? body.roles : (Array.isArray(body.selectedRoles) ? body.selectedRoles : []);
    const globalRole = body.globalRole;
    if (globalRole && !roles.includes(globalRole)) roles.push(globalRole);

    const isStaff = roles.includes('TEACHER') || roles.includes('ADMIN') || roles.includes('MAIN_ADMIN') || roles.includes('SCHOOL_ADMIN');
    const isStudent = roles.includes('STUDENT');

    const programs = Array.isArray(body.programs) ? body.programs : (Array.isArray(body.selectedPrograms) ? body.selectedPrograms : []);

    let { email, name, surname, address, oib, schoolId, classId, studentData } = body;
    if (email && typeof email === 'string') {
      email = email.trim().toLowerCase();
      if (!email.includes('@')) {
        email = `${email}@skolehr.xyz`;
      }
    }
    
    const { data: existingUserList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("[ADMIN_CREATE_API] Error fetching existing users list:", listError);
      return new Response(JSON.stringify({ success: false, error: `Greška pri dohvaćanju baze korisnika: ${listError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!email) {
        const existingEmails = new Set<string>();
        existingUserList?.users?.forEach((u: any) => {
          if (u.email) existingEmails.add(u.email);
        });
        const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
        existingProfiles?.forEach((p: any) => {
          if (p.email) existingEmails.add(p.email);
        });
        email = generateUniqueEmail(name || '', surname || '', existingEmails);
        console.log("[ADMIN_CREATE_API] Generated unique email address:", email);
    }

    // Determination of password and role requirements
    let finalPassword = body.password;
    let requiresPasswordChange = true;
    let authenticatorSecret = null;
    let requiresAuthenticatorSetup = false;
    let passwordType: any = 'standard';

    if (isStudent) {
      finalPassword = 'yupu8Ev4';
      requiresPasswordChange = false;
      passwordType = 'student_static';
    } else if (isStaff) {
      finalPassword = '1234';
      requiresPasswordChange = true;
      authenticatorSecret = authenticator.generateSecret();
      requiresAuthenticatorSetup = true;
      passwordType = 'staff_with_authenticator';
    }

    const programId = studentData?.programId || body.programId;
    const dob = studentData?.dob || body.dob;
    const pob = studentData?.pob || body.pob;
    const mobile = studentData?.mobile || body.mobile;

    // 1. Auth User
    console.log("[ADMIN_CREATE_API] Checking and creating user in Supabase Auth");
    const existingUser = existingUserList?.users?.find((u: any) => u.email === email);
    
    let userId;
    let createdAuthUser;
    if (existingUser) {
      userId = existingUser.id;
      console.log("[ADMIN_CREATE_API] User already exists in Auth. Updating password for user_id:", userId);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: finalPassword });
      if (updateError) {
        console.error("[ADMIN_CREATE_API] Error updating existing user in Auth:", updateError);
        return new Response(JSON.stringify({ success: false, error: `Greška pri ažuriranju Auth korisnika: ${updateError.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      createdAuthUser = existingUser;
    } else {
      console.log("[ADMIN_CREATE_API] Creating new Auth user:", email);
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { name, surname }
      });
      if (authError || !authUser?.user) {
        console.error("[ADMIN_CREATE_API] Error creating user in Auth:", authError);
        return new Response(JSON.stringify({ success: false, error: `Greška pri kreiranju Auth korisnika: ${authError?.message || 'Nepoznata greška'}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      userId = authUser.user.id;
      createdAuthUser = authUser.user;
      console.log("[ADMIN_CREATE_API] Successfully created Auth user with ID:", userId);
    }

    if (body.authOnly) {
      return new Response(JSON.stringify({
        success: true,
        userId,
        createdAuthUser,
        password: finalPassword,
        email: email,
        student: { auth_user_id: userId, email, name: name || `${name} ${surname}` },
        message: "Korisnik uspješno kreiran (Auth samo)"
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 2. Profile
    console.log("[ADMIN_CREATE_API] Upserting user_profiles for user_id:", userId);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        auth_user_id: userId,
        email,
        name: name || (surname ? `${name} ${surname}` : name),
        address: address || studentData?.address,
        oib: oib || studentData?.oib,
        dob,
        pob,
        mobile,
        role: isStudent ? 'STUDENT' : (globalRole || 'TEACHER'),
        class_id: classId || studentData?.classId,
        school_id: schoolId || studentData?.schoolId,
        school_year_id: studentData?.schoolYearId,
        is_first_login: true,
        requires_password_change: requiresPasswordChange,
        password_type: passwordType,
        authenticator_secret: authenticatorSecret,
        requires_authenticator_setup: requiresAuthenticatorSetup
      }, { onConflict: 'auth_user_id' })
      .select()
      .maybeSingle();
    
    if (profileError || !profile) {
      console.error("[ADMIN_CREATE_API] Error during upsert user_profiles:", profileError);
      return new Response(JSON.stringify({ success: false, error: `Greška pri kreiranju profila u bazi: ${profileError?.message || 'Neuspjelo kreiranje profila'}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log("[ADMIN_CREATE_API] Profile updated/inserted successfully. Profile ID:", profile.id);

    // Generate QR Code if secret was created
    let qrCodeDataURL = null;
    if (authenticatorSecret) {
      try {
        const otpauthUrl = `otpauth://totp/e-Dnevnik:${email}?secret=${authenticatorSecret}&issuer=e-Dnevnik`;
         qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
      } catch (qrErr) {
        console.error("[ADMIN_CREATE_API] QR calculation error:", qrErr);
      }
    }

    // 3. School Roles
    if (schoolId && roles && Array.isArray(roles)) {
      console.log("[ADMIN_CREATE_API] Adding school roles:", roles, "for school:", schoolId);
      for (const role of roles) {
        const { error: roleErr } = await supabaseAdmin
          .from('user_school_roles')
          .upsert({
            user_id: profile.id,
            school_id: schoolId,
            role: role,
            status: 'ACTIVE'
          }, { onConflict: 'user_id,school_id,role' });
        if (roleErr) {
           console.error(`[ADMIN_CREATE_API] Error inserting school role ${role}:`, roleErr);
        }
      }
    }

    // 4. Student Enrollment
    if (roles.includes('STUDENT') && classId) {
      console.log("[ADMIN_CREATE_API] Registering enrollment for class:", classId);
      const { data: clsInfo, error: clsErr } = await supabaseAdmin.from('classes').select('school_year, school_year_id').eq('id', classId).maybeSingle();
      if (clsErr) {
        console.error("[ADMIN_CREATE_API] Error fetching class details for enrollment:", clsErr);
      }

      const { error: enrollErr } = await supabaseAdmin.from('student_class_enrollments').upsert({
        student_id: profile.id,
        class_id: classId,
        school_year_id: clsInfo?.school_year_id || null,
        school_year: clsInfo?.school_year || '2024/2025',
        program_id: programId,
        status: 'ACTIVE'
      }, { onConflict: 'student_id,class_id,school_year' });
      
      if (enrollErr) {
        console.error("[ADMIN_CREATE_API] Error enrolling student in class:", enrollErr);
        return new Response(JSON.stringify({ success: false, error: `Greška pri upisu učenika u razred: ${enrollErr.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      userId, 
      profileId: profile.id, 
      student: profile,
      password: finalPassword, 
      email: email, 
      message: "Korisnik uspješno kreiran",
      authenticatorSecret: authenticatorSecret,
      qrCode: qrCodeDataURL
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[ADMIN_CREATE_API] Exception:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
