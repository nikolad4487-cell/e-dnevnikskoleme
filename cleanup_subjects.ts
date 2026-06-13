import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function cleanupSubjects() {
  console.log("Cleaning up subjects...");
  
  // 1. Find all subjects with "(izborni)" or "(redovni)" in name
  const { data: subjects, error } = await supabaseAdmin.from('subjects').select('*');
  if (error) {
    console.error("Error fetching subjects:", error);
    return;
  }
  
  for (const subject of subjects) {
    if (/\((izborni|redovni)\)/i.test(subject.name)) {
      const type = subject.name.toLowerCase().includes('izborni') ? 'IZBORNI' : 'REDOVNI';
      const cleanName = subject.name.replace(/\s*\((izborni|redovni)\)\s*$/i, '').trim();
      
      console.log(`Cleaning subject: ${subject.name} -> ${cleanName}, Type: ${type}`);
      
      // Update subject name
      await supabaseAdmin.from('subjects').update({ name: cleanName }).eq('id', subject.id);
      
      // Update class_subjects for this subject
      await supabaseAdmin.from('class_subjects').update({ subject_type: type }).eq('subject_id', subject.id);
    }
  }
  
  console.log("Finished cleaning subjects.");
}

cleanupSubjects();
