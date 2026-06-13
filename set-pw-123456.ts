import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function setPassword() {
  const userId = "5bddd2eb-9d6c-415d-b7f8-26442c51d883";
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: '123456',
    email_confirm: true
  });
  if (error) console.error(error);
  else console.log("Password set to 123456");
}
setPassword();
