// Read-only PostgREST schema contract check. limit(0) never downloads pupil rows.
// Uses the actual selects in the application, including nested class/staff joins.
import { readdir, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase environment configuration is required.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path));
    else if (path.endsWith('.tsx')) result.push(path);
  }
  return result;
}
const queries = new Map();
let consumers = 0;
for (const path of await files('src')) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/\.from\(['"]student_class_enrollments['"]\)\s*\.select\((['"`])([\s\S]*?)\1/g)) {
    if (!match[2].includes('user_profiles')) continue;
    queries.set(match[2], path);
    consumers++;
  }
}
if (!consumers) throw new Error('No application enrollment joins found.');
for (const [select, path] of queries) {
  const { error } = await db.from('student_class_enrollments').select(select).limit(0);
  if (error) throw new Error(`${path}: ${error.code}: ${error.message}`);
}
console.log(JSON.stringify({ passed: true, consumers, live_schema_checks: queries.size, pupil_rows_read: 0 }));
