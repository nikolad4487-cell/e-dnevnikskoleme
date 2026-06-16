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
    const { students, classId, schoolId, schoolYearId, school_year_id, programId } = body;
    const finalYearId = school_year_id || schoolYearId;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Lista učenika je prazna." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
       if (email && typeof email === 'string') {
          email = email.trim().toLowerCase();
          if (!email.includes('@')) {
             email = `${email}@skolehr.xyz`;
          }
       }
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
          results.push({ ...student, success: false, error: profileError?.message || 'Greška pri kreiranju profila' });
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
                   .upsert(subjectEnrollments, { onConflict: 'student_id,subject_id,class_id' });
           }
       }

       results.push({ ...student, success: true, email, password: studentPassword });
    }

    return new Response(JSON.stringify({ success: true, results, message: "Korisnici obrađeni." }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("[ADMIN_BULK_CREATE]", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
