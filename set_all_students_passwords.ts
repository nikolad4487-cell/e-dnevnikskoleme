import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function updateAllStudentPasswords() {
  console.log("Fetching all student profiles...");
  const { data: students, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, auth_user_id, email, name')
    .eq('role', 'STUDENT');

  if (error) {
    console.error("Error fetching students:", error);
    return;
  }

  console.log(`Found ${students.length} students. Setting password to 'yupu8Ev4' for all of them...`);

  let successCount = 0;
  let failCount = 0;

  for (const student of students) {
    if (!student.auth_user_id) {
      console.log(`Student ${student.name} (${student.email}) has no auth_user_id. Trying to see if they exist or creating/linking...`);
      // We see if an auth user with this email exists:
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = (listData?.users || []).find((u: any) => u.email === student.email);
      let authId = existingUser?.id;

      if (!authId) {
        // Create user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: student.email,
          password: 'yupu8Ev4',
          email_confirm: true
        });
        if (createError) {
          console.error(`Failed to create auth user for ${student.email}:`, createError.message);
          failCount++;
          continue;
        }
        authId = newUser.user.id;
      }

      // Link in user_profiles
      const { error: linkError } = await supabaseAdmin
        .from('user_profiles')
        .update({ auth_user_id: authId })
        .eq('id', student.id);

      if (linkError) {
        console.error(`Failed to update user_profile auth_user_id link for ${student.email}:`, linkError.message);
        failCount++;
      } else {
        console.log(`Successfully linked and set password for ${student.name} (no auth_user_id previously)`);
        successCount++;
      }
    } else {
      // Has auth_user_id, update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(student.auth_user_id, {
        password: 'yupu8Ev4',
        email_confirm: true
      });

      if (updateError) {
        console.error(`Failed to update password for student ${student.name} (${student.email}):`, updateError.message);
        failCount++;
      } else {
        successCount++;
      }
    }
  }

  console.log(`Password reset complete. Successful: ${successCount}, Failed: ${failCount}`);
}

updateAllStudentPasswords();
