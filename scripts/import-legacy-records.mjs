import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
const directory=resolve(process.argv[2]||'data'),apply=process.argv.includes('--apply');
const allowed=new Set(['payments','practicum_placements','practicum_logs','practicum_evaluations','competitions','daily_notes','overall_success_audit_logs','student_registrations','student_transfers']);
const input={};for(const file of (await readdir(directory)).sort()){
 const collection=file.replace(/\.json$/,'');if(!file.endsWith('.json')||!allowed.has(collection))continue;
 const rows=JSON.parse(await readFile(join(directory,file),'utf8'));if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||typeof r.id!=='string'))throw Error(`Invalid records in ${file}`);
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error(`Duplicate IDs in ${file}`);if(rows.length)input[collection]=rows;
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',counts:Object.fromEntries(Object.entries(input).map(([name,rows])=>[name,rows.length]))}));
if(!apply){console.log('Dry run only. Keep the source files and a verified database backup. Import uses an authorized administrator session, validates school scope in the database and rejects conflicting records.');process.exit(0);}
const {SUPABASE_URL,SUPABASE_ANON_KEY,IMPORT_USER_ACCESS_TOKEN}=process.env;
if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!IMPORT_USER_ACCESS_TOKEN)throw Error('Provide the configured URL, anon key and an authorized administrator access token through environment variables. Never use a service-role key as the user token.');
const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${IMPORT_USER_ACCESS_TOKEN}`}},auth:{persistSession:false,autoRefreshToken:false}});
const {data:session,error:authError}=await db.auth.getUser(IMPORT_USER_ACCESS_TOKEN);if(authError||!session.user)throw Error('Invalid administrator session.');
const {data:snapshot,error}=await db.rpc('school_aux_snapshot');if(error)throw Error('Cannot read durable records. Check activation and administrator session.');
const changes=[];for(const [collection,rows]of Object.entries(input)){
 const before=snapshot[collection];if(!Array.isArray(before))throw Error('Unknown collection');const after=[...before];
 for(const row of rows){const prior=before.find(x=>x.id===row.id);if(prior){if(JSON.stringify(canonical(prior))!==JSON.stringify(canonical(row)))throw Error(`Conflict in ${collection}; import cancelled without changes.`);}else after.push(row);}
 if(after.length>before.length)changes.push({collection,before,after});
}
// One database transaction: placements precede their dependent logs and evaluations.
changes.sort((a,b)=>Number(b.collection==='practicum_placements')-Number(a.collection==='practicum_placements'));
if(changes.length){const saved=await db.rpc('school_aux_commit',{_changes:changes});if(saved.error)throw Error('Import rejected; no imported changes were committed. Inspect missing scope, conflicts or permissions before retrying.');}
console.log('Import committed. Source files were preserved. Verify counts and representative records before retiring the old host.');
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
