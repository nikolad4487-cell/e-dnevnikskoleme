import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl as string, supabaseKey as string);

async function main() {
  const userId = "5bddd2eb-9d6c-415d-b7f8-26442c51d883";
  const email = "nikola.duric@eskole.me";
  const newPassword = "1234";

  console.log(`Setting password for ${email} to 1234...`);
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true
  });

  if (authError) {
    console.error("Error setting password:", authError);
    // If Supabase rejects 1234, handle appropriately (e.g., this password requirement
    // needs to be configured in Supabase console).
    process.exit(1);
  }
  console.log("Password updated successfully.");

  console.log(`Resetting authenticator for ${email}...`);
  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .update({ 
      requires_authenticator_setup: true,
      authenticator_secret: null,
      updated_at: new Date().toISOString()
    })
    .eq('email', email);

  if (profileError) {
    console.error("Error resetting authenticator:", profileError);
    process.exit(1);
  }
  console.log("Authenticator reset successfully.");
}

main().catch(console.error);
