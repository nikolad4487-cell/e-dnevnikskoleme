import { supabase } from './src/lib/supabase.js';

async function run() {
  const { data: lessons, error } = await supabase.from('lessons').select('id, group_name');
  if (error) {
    console.error(error);
    process.exit(1);
  }
  
  if (!lessons) return;
  
  for (const lesson of lessons) {
    let newGroup = '';
    const raw = (lesson.group_name || '').toLowerCase().trim();
    if (raw === 'grupa a' || raw === 'grupaa' || raw === 'group_a') {
      newGroup = 'GROUP_A';
    } else if (raw === 'grupa b' || raw === 'grupab' || raw === 'group_b') {
      newGroup = 'GROUP_B';
    } else if (raw === 'cijeli razred' || raw === 'full_class') {
      newGroup = 'FULL_CLASS';
    }
    
    if (newGroup && newGroup !== lesson.group_name) {
      console.log(`Updating lesson ${lesson.id} from "${lesson.group_name}" to "${newGroup}"`);
      await supabase.from('lessons').update({ group_name: newGroup }).eq('id', lesson.id);
    }
  }
  console.log("Groups migration completed.");
}

run();
