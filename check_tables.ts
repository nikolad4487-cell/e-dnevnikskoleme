import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Probing chat_groups columns...');
  const fields = ['id', 'name', 'type', 'members', 'school_id', 'class_id', 'student_id', 'teacher_id'];
  for (const field of fields) {
    const { data, error } = await supabase.from('chat_groups').select(field).limit(1);
    if (error) {
      console.log(`❌ chat_groups column NOT found: ${field}`, error.message);
    } else {
      console.log(`✅ chat_groups column found: ${field}`);
    }
  }

  console.log('Probing messages columns...');
  const msgFields = ['id', 'group_id', 'sender_id', 'text', 'timestamp', 'school_id', 'class_id', 'student_id', 'teacher_id'];
  for (const field of msgFields) {
    const { data, error } = await supabase.from('messages').select(field).limit(1);
    if (error) {
      console.log(`❌ messages column NOT found: ${field}`, error.message);
    } else {
      console.log(`✅ messages column found: ${field}`);
    }
  }
}
run();
