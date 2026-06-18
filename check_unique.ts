import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function checkGroups() {
  const { data: groups, error } = await supabase
    .from('chat_groups')
    .select('id, name, class_id, subject_id, type');
  if (error) {
    console.error(error);
  } else {
    console.log(`Total chat groups: ${groups?.length}`);
    const subjectChannels = groups?.filter(g => g.type === 'SUBJECT_CHANNEL') || [];
    console.log(`Total subject channels: ${subjectChannels.length}`);
    
    // Group by class_id and subject_id to find duplicates
    const counts: Record<string, any[]> = {};
    for (const g of subjectChannels) {
      if (!g.class_id || !g.subject_id) continue;
      const key = `${g.class_id}###${g.subject_id}`;
      if (!counts[key]) counts[key] = [];
      counts[key].push(g);
    }
    
    console.log("DUPLICATES DETECTED:");
    let dupCount = 0;
    for (const [key, list] of Object.entries(counts)) {
      if (list.length > 1) {
        dupCount++;
        console.log(`Key ${key} has ${list.length} groups:`, list.map(g => ({ id: g.id, name: g.name })));
      }
    }
    console.log(`Total duplicate keys: ${dupCount}`);
  }
}
checkGroups();

