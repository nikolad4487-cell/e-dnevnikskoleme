import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'xxxx'
);

async function checkConstraints() {
  const { data, error } = await supabase.rpc('query_string', { sql: `
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lessons'::regclass AND contype = 'u';
  `});
  if (error) console.error(error);
  else console.log(data);
}
checkConstraints();
