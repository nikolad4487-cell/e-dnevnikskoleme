import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { authenticator } from "otplib";
import QRCode from "qrcode";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";

// Supabase Admin Client (Service Role)
let supabaseAdmin: any;
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn("[SERVER] Supabase credentials missing. Admin features and seeder will be unavailable.");
}

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.use(express.json());

    // Middleware to log requests
    app.use((req, res, next) => {
      console.log(`[${req.method}] ${req.url}`);
      next();
    });

    // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Ensure profile endpoint for missing profiles on login
  app.post("/api/ensure-profile", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { authUserId, email, name } = req.body;

      if (!authUserId || !email) {
        return res.status(400).json({ error: "authUserId and email are required" });
      }

      console.log(`[ENSURE_PROFILE] Checking/Creating profile for ${email}...`);

      const { data: existingProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (existingProfile) {
        return res.json({ profile: existingProfile, created: false });
      }

      // Create profile
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          auth_user_id: authUserId,
          email,
          name: name || email.split('@')[0],
          is_first_login: true,
          requires_password_change: false
        }, { onConflict: 'auth_user_id' })
        .select()
        .single();

      if (createError) throw createError;

      // If this is the very first user in the system (or a specific email), grant them MAIN_ADMIN
      const { count } = await supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true });
      
      const shouldBeAdmin = (count <= 1) || email === 'nikolad4487@gmail.com' || email.endsWith('@eskole.me');
      
      if (shouldBeAdmin) {
        const demoSchoolId = '00000000-0000-0000-0000-000000000001';
        
        // Ensure demo school exists
        await supabaseAdmin.from('schools').upsert({ 
          id: demoSchoolId, 
          name: 'Demo škola', 
          type: 'SECONDARY' 
        }, { onConflict: 'id' });

        await supabaseAdmin.from('user_school_roles').upsert({
          user_id: newProfile.id,
          school_id: demoSchoolId,
          role: 'MAIN_ADMIN',
          status: 'ACTIVE'
        }, { onConflict: 'user_id,school_id,role' });
      }

      res.json({ profile: newProfile, created: true });
    } catch (err: any) {
      console.error("[ENSURE_PROFILE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

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
    const baseEmail = `${baseAddress}@eskole.me`;

    if (!existingEmails.has(baseEmail)) {
        return baseEmail;
    }

    let counter = 2;
    while (true) {
        const email = `${baseAddress}${counter}@eskole.me`;
        if (!existingEmails.has(email)) {
            return email;
        }
        counter++;
    }
}

  // Admin bulk create users endpoint
  app.post("/api/admin/bulk-create-users", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      
      const { students, classId, schoolId, schoolYearId, school_year_id, programId } = req.body;
      const finalYearId = school_year_id || schoolYearId;
      
      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: "Lista učenika je prazna." });
      }

      // Fetch class details if available
      let classDetails = { id: classId, school_id: schoolId, school_year_id: finalYearId, school_year: '2024/2025', program_id: programId };
      if (classId) {
        const { data: clsData } = await supabaseAdmin.from('classes').select('id, school_id, school_year_id, school_year, program_id').eq('id', classId).maybeSingle();
        if (clsData) classDetails = { ...classDetails, ...clsData };
      }

      // Fetch subjects assigned to this class for automatic enrollments
      let classSubjects: any[] = [];
      if (classDetails.id) {
        const { data: subData } = await supabaseAdmin.from('class_subject_teachers').select('subject_id').eq('class_id', classDetails.id);
        if (subData) classSubjects = subData;
      }

      // Fetch all existing emails to avoid collisions
      const { data: existingUserList } = await supabaseAdmin.auth.admin.listUsers();
      const existingEmails = new Set<string>();
      existingUserList?.users?.forEach((u: any) => {
        if (u.email) existingEmails.add(u.email);
      });
      // Also check user_profiles just in case
      const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
      existingProfiles?.forEach((p: any) => {
        if (p.email) existingEmails.add(p.email);
      });

      const results = [];
      const studentPassword = 'yupu8Ev4';

      for (const student of students) {
         let email = student.email;
         if (!email) {
            email = generateUniqueEmail(student.name, student.surname, existingEmails);
         } else if (existingEmails.has(email.toLowerCase())) {
            email = generateUniqueEmail(student.name, student.surname, existingEmails);
         }
         existingEmails.add(email.toLowerCase());

         const fullName = student.surname ? `${student.name} ${student.surname}` : student.name;

         const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: studentPassword,
            email_confirm: true,
            user_metadata: { name: student.name, surname: student.surname }
         });

         if (authError || !authUser?.user) {
            results.push({ ...student, success: false, error: authError?.message || 'Greška pri kreiranju zabilježena auth' });
            continue;
         }

         const userId = authUser.user.id;

         const { data: profile, error: profileError } = await supabaseAdmin
           .from('user_profiles')
           .upsert({
              auth_user_id: userId,
              email,
              name: fullName,
              role: 'STUDENT',
              is_first_login: true,
              requires_password_change: false,
              requires_authenticator_setup: false,
              password_type: 'student_static',
              class_id: classDetails.id || null,
              school_id: classDetails.school_id || schoolId,
              school_year_id: classDetails.school_year_id || null
           }, { onConflict: 'auth_user_id' })
           .select()
           .maybeSingle();

         if (profileError || !profile) {
            results.push({ ...student, success: false, error: profileError.message });
            continue;
         }

         if (classDetails.school_id) {
            await supabaseAdmin.from('user_school_roles').upsert({
               user_id: profile.id,
               school_id: classDetails.school_id,
               role: 'STUDENT',
               status: 'ACTIVE'
            }, { onConflict: 'user_id,school_id,role' });
         }

         if (classDetails.id) {
             const { error: enrollmentError } = await supabaseAdmin.from('student_class_enrollments').upsert({
                 student_id: profile.id,
                 class_id: classDetails.id,
                 school_year_id: classDetails.school_year_id,
                 school_year: classDetails.school_year || '2024/2025',
                 program_id: classDetails.program_id || null,
                 status: 'ACTIVE'
             }, { onConflict: 'student_id,class_id,school_year' });

             if (enrollmentError) {
                 results.push({ ...student, success: false, error: enrollmentError.message });
                 continue;
             }

             // Also enroll in class subjects immediately if available
             if (classSubjects.length > 0) {
                 const uniqueSubjectIds = Array.from(new Set(classSubjects.map((cs: any) => cs.subject_id)));
                 const subjectEnrollments = uniqueSubjectIds.map((subId: any) => ({
                     student_id: profile.id,
                     subject_id: subId,
                     class_id: classDetails.id,
                     school_year_id: classDetails.school_year_id,
                     school_year: classDetails.school_year || '2024/2025',
                     status: 'ACTIVE'
                 }));

                 await supabaseAdmin
                     .from('student_subject_enrollments')
                     .upsert(subjectEnrollments, { onConflict: 'student_id,subject_id,class_id,school_year' });
             }
         }

         results.push({ ...student, success: true, email, password: studentPassword });
      }

      res.json({ success: true, results, message: "Korisnici obrađeni." });
    } catch (err: any) {
      console.error("[ADMIN_BULK_CREATE]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin create user endpoint
  app.post("/api/admin/create-user", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized. Check your environment variables.");

      // Defensive defaults for roles and programs (preventing .includes() crash)
      const roles = Array.isArray(req.body.roles) ? req.body.roles : (Array.isArray(req.body.selectedRoles) ? req.body.selectedRoles : []);
      const globalRole = req.body.globalRole;
      if (globalRole && !roles.includes(globalRole)) roles.push(globalRole);

      const isStaff = roles.includes('TEACHER') || roles.includes('ADMIN') || roles.includes('MAIN_ADMIN') || roles.includes('SCHOOL_ADMIN');
      const isStudent = roles.includes('STUDENT');

      const programs = Array.isArray(req.body.programs) ? req.body.programs : (Array.isArray(req.body.selectedPrograms) ? req.body.selectedPrograms : []);

      let { email, name, surname, address, oib, schoolId, classId, studentData } = req.body;
      
      const { data: existingUserList } = await supabaseAdmin.auth.admin.listUsers();
      
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
      }

      // Determination of password and role requirements
      let finalPassword = req.body.password;
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

      console.log("CREATE USER DEBUG", { 
        email, 
        roles, 
        programs, 
        hasClassId: !!classId,
        finalPassword
      });
      
      const programId = studentData?.programId || req.body.programId;
      const dob = studentData?.dob || req.body.dob;
      const pob = studentData?.pob || req.body.pob;
      const mobile = studentData?.mobile || req.body.mobile;

      // 1. Auth User
      const existingUser = existingUserList?.users?.find((u: any) => u.email === email);
      
      let userId;
      let createdAuthUser;
      if (existingUser) {
        userId = existingUser.id;
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: finalPassword });
        createdAuthUser = existingUser;
      } else {
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          user_metadata: { name, surname }
        });
        if (authError) throw authError;
        userId = authUser.user.id;
        createdAuthUser = authUser.user;
      }

      if (req.body.authOnly) {
        return res.json({
          success: true,
          userId,
          createdAuthUser,
          password: finalPassword,
          email: email,
          message: "Korisnik uspješno kreiran (Auth samo)"
        });
      }
      
      // 2. Profile
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
          is_first_login: true,
          requires_password_change: requiresPasswordChange,
          password_type: passwordType,
          authenticator_secret: authenticatorSecret,
          requires_authenticator_setup: requiresAuthenticatorSetup
        }, { onConflict: 'auth_user_id' })
        .select()
        .maybeSingle();
      
      if (profileError || !profile) throw profileError || new Error("Profile creation failed");

      // Generate QR Code if secret was created
      let qrCodeDataURL = null;
      if (authenticatorSecret) {
        const otpauthUrl = `otpauth://totp/e-Dnevnik:${email}?secret=${authenticatorSecret}&issuer=e-Dnevnik`;
        qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
      }

      // 3. School Roles
      if (schoolId && roles && Array.isArray(roles)) {
        for (const role of roles) {
          await supabaseAdmin
            .from('user_school_roles')
            .upsert({
              user_id: profile.id,
              school_id: schoolId,
              role: role,
              status: 'ACTIVE'
            }, { onConflict: 'user_id,school_id,role' });
        }
      }

      // 4. Student Enrollment
      if (roles.includes('STUDENT') && classId) {
        const { data: clsInfo } = await supabaseAdmin.from('classes').select('school_year, school_year_id').eq('id', classId).maybeSingle();

        await supabaseAdmin.from('student_class_enrollments').upsert({
          student_id: profile.id,
          class_id: classId,
          school_year_id: clsInfo?.school_year_id || null,
          school_year: clsInfo?.school_year || '2024/2025',
          program_id: programId,
          status: 'ACTIVE'
        }, { onConflict: 'student_id,class_id,school_year' });
      }

      res.json({ 
        success: true, 
        userId, 
        profileId: profile.id, 
        password: finalPassword, 
        email: email, 
        message: "Korisnik uspješno kreiran",
        authenticatorSecret: authenticatorSecret,
        qrCode: qrCodeDataURL
      });
    } catch (err: any) {
      console.error("[ADMIN_CREATE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update user endpoint
  app.post("/api/admin/update-user", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId, authUserId, email, name, surname, address, oib, roles, schoolId, status } = req.body;

      console.log(`[ADMIN_UPDATE] Updating user ${email} (Profile ID: ${profileId})`);

      // Update Auth Email if changed
      if (authUserId && email) {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { email });
      }

      // Update Profile
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          email,
          name: `${name} ${surname}`,
          address,
          oib
        })
        .eq('id', profileId);
      
      if (profileError) throw profileError;

      // Update Roles (Replace existing for this school)
      if (schoolId && roles && Array.isArray(roles)) {
        // Delete old roles for this school
        await supabaseAdmin
          .from('user_school_roles')
          .delete()
          .eq('user_id', profileId)
          .eq('school_id', schoolId);
        
        // Insert new ones
        for (const role of roles) {
          await supabaseAdmin
            .from('user_school_roles')
            .insert({
              user_id: profileId,
              school_id: schoolId,
              role: role,
              status: status || 'ACTIVE'
            });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ADMIN_UPDATE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin delete user endpoint
  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId, schoolId, softDelete } = req.body;

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

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ADMIN_DELETE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Seeding endpoint (Server-side only)
  app.post("/api/seed", async (req, res) => {
    const seedTimeout = setTimeout(() => {
       console.error("[SEED] TIMEOUT ERROR: Migration taking too long.");
    }, 25000);

    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      console.log("[SEED] Starting migration/seed...");

      const demoSchoolId = '00000000-0000-0000-0000-000000000001';
      
      // 1. Create School
      await supabaseAdmin.from('schools').upsert({ id: demoSchoolId, name: 'Demo škola', type: 'SECONDARY' });

      // 1.1 Create Programs
      const demoPrograms = [
        { id: 'prog-kuhar', school_id: demoSchoolId, name: 'Kuhar/Kuharica', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-konobar', school_id: demoSchoolId, name: 'Konobar/Konobarica', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-slasticar', school_id: demoSchoolId, name: 'Slastičar/Slastičarka', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-teh-ugost', school_id: demoSchoolId, name: 'Tehničar za ugostiteljstvo', duration_years: 4, type: 'COMMERCIALIST_4Y', status: 'ACTIVE' },
        { id: 'prog-turist-kom', school_id: demoSchoolId, name: 'Turističko-hotelijerski komercijalist', duration_years: 4, type: 'COMMERCIALIST_4Y', status: 'ACTIVE' },
      ];
      for (const prog of demoPrograms) {
        await supabaseAdmin.from('programs').upsert(prog);
      }

      // 2. Create Classes
      const demoClasses = [
        { id: 'class-1a', school_id: demoSchoolId, name: '1.A', grade_level: 1, section: 'A', school_year: '2024/2025' },
        { id: 'class-2b', school_id: demoSchoolId, name: '2.B', grade_level: 2, section: 'B', school_year: '2024/2025' },
        { id: 'class-3c', school_id: demoSchoolId, name: '3.C', grade_level: 3, section: 'C', school_year: '2024/2025' },
      ];
      for (const cls of demoClasses) {
        await supabaseAdmin.from('classes').upsert(cls);
      }

      // 3. Create Subjects
      const demoSubjects = [
        { id: 'subj-mat', school_id: demoSchoolId, name: 'Matematika', code: 'MAT' },
        { id: 'subj-hj', school_id: demoSchoolId, name: 'Hrvatski jezik', code: 'HJ' },
        { id: 'subj-ej', school_id: demoSchoolId, name: 'Engleski jezik', code: 'EJ' },
      ];
      for (const subj of demoSubjects) {
        await supabaseAdmin.from('subjects').upsert(subj);
      }

      const demoUsers = [
        { email: 'nikola.duric@eskole.me', password: '1234', name: 'Nikola', surname: 'Đurić', roles: ['MAIN_ADMIN', 'TEACHER'] },
        { email: 'nikolad4487@gmail.com', password: '1234', name: 'Nikola', surname: 'Dev', roles: ['MAIN_ADMIN', 'TEACHER'] },
        { email: 'marija.majdic@eskole.me', password: '1234', name: 'Marija', surname: 'Majdić', roles: ['TEACHER'] },
        { email: 'ivan.horvat@eskole.me', password: '1234', name: 'Ivan', surname: 'Horvat', roles: ['TEACHER', 'HOMEROOM'], homeroomClassId: 'class-1a' },
        { email: 'ana.kovac@eskole.me', password: '1234', name: 'Ana', surname: 'Kovač', roles: ['TEACHER', 'DEPUTY'], deputyClassId: 'class-1a' },
        { email: 'ivica.malcic@eskole.me', password: 'yupu8Ev4', name: 'Ivica', surname: 'Malčić', roles: ['STUDENT'], studentClassId: 'class-1a' },
        { email: 'matija.malcic@gmail.com', password: 'yupu8Ev4', name: 'Matija', surname: 'Malčić', roles: ['PARENT'] },
      ];

      // Fetch existing users
      const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUsers = userData?.users || [];

      const results = [];

      for (const u of demoUsers) {
        let authUserId;
        const found = existingUsers.find((au: any) => au.email === u.email);

        if (found) {
          authUserId = found.id;
          await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: u.password });
        } else {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { name: u.name, surname: u.surname }
          });
          if (createError) {
             results.push({ email: u.email, status: 'error', error: createError.message });
             continue;
          }
          authUserId = newUser.user.id;
        }

        const isStaff = u.roles.some(r => ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN'].includes(r));
        const isMainAdmin = u.roles.includes('MAIN_ADMIN');
        
        let authenticatorSecret = null;
        let requiresAuthenticatorSetup = false;

        if (isStaff) {
          if (isMainAdmin) {
            authenticatorSecret = '123456';
            requiresAuthenticatorSetup = false;
          } else {
            authenticatorSecret = authenticator.generateSecret();
            requiresAuthenticatorSetup = true;
          }
        }

        // Upsert Profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('user_profiles')
          .upsert({
            auth_user_id: authUserId,
            email: u.email,
            name: `${u.name} ${u.surname}`,
            is_first_login: false,
            requires_password_change: false,
            authenticator_secret: authenticatorSecret,
            requires_authenticator_setup: requiresAuthenticatorSetup
          }, { onConflict: 'auth_user_id' })
          .select()
          .single();

        if (profileError) {
          results.push({ email: u.email, status: 'profile_error', error: profileError.message });
          continue;
        }

        // Upsert Roles
        for (const roleString of u.roles) {
          await supabaseAdmin.from('user_school_roles').upsert({
            user_id: profile.id,
            school_id: demoSchoolId,
            role: roleString,
            status: 'ACTIVE'
          }, { onConflict: 'user_id,school_id,role' });
        }

        // Handle specific role relations
        if (u.homeroomClassId) {
          await supabaseAdmin.from('classes').update({ homeroom_teacher_id: profile.id }).eq('id', u.homeroomClassId);
        }
        if (u.deputyClassId) {
          await supabaseAdmin.from('classes').update({ deputy_teacher_id: profile.id }).eq('id', u.deputyClassId);
        }
        if (u.studentClassId) {
          await supabaseAdmin.from('student_class_enrollments').upsert({
            student_id: profile.id,
            class_id: u.studentClassId,
            school_year: '2024/2025',
            status: 'ACTIVE'
          }, { onConflict: 'student_id,class_id,school_year' });
        }

        results.push({ email: u.email, status: 'success' });
      }

      res.json({ message: "Seeding complete", results });
    } catch (err: any) {
      console.error("[SEED] Error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      clearTimeout(seedTimeout);
    }
  });

  // Unified login endpoint with TOTP verification
  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { email, password, totpCode, loginType } = req.body;

      console.log(`[LOGIN_API] Attempting login for ${email} (${loginType})`);

      if (!supabaseAdmin) {
        console.error("[LOGIN_API] supabaseAdmin is NULL");
        return res.status(500).json({ error: "Server authentication error." });
      }

      // 1. Sign in with Supabase
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error(`[LOGIN_API] Supabase signIn Error for ${email}:`, error.message);
        return res.status(401).json({ error: error.message });
      }

      const authUser = data.user;
      const session = data.session;

      // 2. Get Profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (profileError || !profile) {
        return res.status(401).json({ error: "Profil korisnika nije pronađen." });
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
            // This should not happen for staff if they were created correctly
            // but if they are an old user, we might allow bypass or force setup.
            // For now, if no secret, we might let them in but they should set it up.
            // But per instructions "Nastavnici/zaposlenici koriste: lozinka: 1234 + 6-znamenkasti Microsoft Authenticator kod"
            return res.status(401).json({ error: "Autentifikator nije podešen za vaš račun. Obratite se administratoru." });
          }

          if (!totpCode) {
            return res.status(401).json({ error: "Unesite 6-znamenkasti kod iz autentifikatora." });
          }

          let isValid = false;
          if (profile.authenticator_secret === '123456') {
            isValid = totpCode === '123456';
          } else {
            isValid = authenticator.check(totpCode, profile.authenticator_secret);
          }

          if (!isValid) {
            return res.status(401).json({ error: "Neispravan autentifikator kod." });
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

      res.json({ session, user: profile });
    } catch (err: any) {
      console.error("[LOGIN_API] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reset authenticator endpoint
  app.post("/api/auth/reset-authenticator", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId } = req.body;

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('name, email')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile) throw new Error("Profil nije pronađen.");

      const newSecret = authenticator.generateSecret();
      const otpauthUrl = `otpauth://totp/e-Dnevnik:${profile.email}?secret=${newSecret}&issuer=e-Dnevnik`;
      const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          authenticator_secret: newSecret,
          requires_authenticator_setup: true
        })
        .eq('id', profileId);

      if (updateError) throw updateError;

      res.json({
        success: true,
        authenticatorSecret: newSecret,
        qrCode: qrCodeDataURL
      });
    } catch (err: any) {
      console.error("[RESET_TOTP] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reset student password endpoint
  app.post("/api/admin/reset-student-password", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId, type } = req.body; // type: 'DEFAULT' or 'GENERATE'

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile) throw new Error("Profil nije pronađen.");

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

      if (authError) throw authError;

      // Update profile flags just in case they were set
      await supabaseAdmin.from('user_profiles').update({
        requires_password_change: false,
        password_type: 'student_static'
      }).eq('id', profileId);

      res.json({
        success: true,
        newPassword
      });
    } catch (err: any) {
      console.error("[RESET_STUDENT_PASS] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Only serve static files if not on Vercel
    if (!process.env.VERCEL) {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
  }

  // Export app for Vercel Serverless Functions
  if (process.env.VERCEL) {
      return app;
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  } catch (err) {
    console.error("CRITICAL: Failed to start server:", err);
    process.exit(1);
  }
}

export const appPromise = startServer();
