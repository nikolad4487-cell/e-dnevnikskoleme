import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const testId = 'test-probe-school';
  const testPayload = {
    id: testId,
    name: 'Probe School',
    type: 'SECONDARY',
    address: 'Test Address 123',
    city: 'Test City'
  };

  console.log("Attempting test insertion of school...");
  const { data, error } = await supabase.from('schools').insert([testPayload]).select();
  
  if (error) {
    console.log("❌ Succeeded or failed with error:", error.message);
    if (error.message.includes('column')) {
      console.log("An error identifies missing column! Details:", error);
    }
  } else {
    console.log("✅ WOW! Succeeded inserting all columns!", data);
    // Let's delete the probe school
    await supabase.from('schools').delete().eq('id', testId);
  }
}

run();
