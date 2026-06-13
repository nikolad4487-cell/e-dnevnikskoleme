
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { hashPin } from './src/pinUtils.js';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function initializePins() {
  console.log("Initializing PINs for teachers/admins...");
  const { data: users, error } = await supabaseAdmin.from('user_profiles').select('id, email, pin_hash');
  if (error) {
    console.error("Error fetching users:", error);
    return;
  }
  
  const hash = await hashPin('1234');
  
  for (const user of users) {
    if (!user.pin_hash) {
      console.log(`Setting PIN for ${user.email}`);
      await supabaseAdmin.from('user_profiles').update({ pin_hash: hash }).eq('id', user.id);
    }
  }
  console.log("Finished initializing PINs.");
}

initializePins();
