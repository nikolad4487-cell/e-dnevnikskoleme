import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifySnapshot} from './verify.mjs';

export function buildRestoreList(toc){
 if(!/^;\s+Archive created at /m.test(toc)||!/^;\s+TOC Entries:\s+\d+\s*$/m.test(toc))throw Error('Unrecognized pg_restore table of contents.');
 let skipped=0;
 const list=toc.split('\n').map(line=>{
  // Storage APIs recreate metadata while uploading actual object bytes. Do
  // not restore buckets/objects/prefixes or pending multipart upload records.
  if(/^\d+;\s+\d+\s+\d+\s+(?:TABLE DATA|MATERIALIZED VIEW DATA|SEQUENCE SET)\s+storage\s+/.test(line)){skipped++;return '; Storage API recreates metadata: '+line;}
  return line;
 }).join('\n');
 if(!skipped)throw Error('No Storage metadata found; review this archive manually.');
 return {list,skipped};
}

if(process.argv[1]?.endsWith('/prepare-restore-list.mjs')){
 const dir=process.argv[2];if(!dir)throw Error('Usage: prepare-restore-list.mjs snapshot-directory');
 const verification=await verifySnapshot(dir,{requireIntegrity:true});
 let toc;try{toc=execFileSync('pg_restore',['--list',join(dir,'database.dump')],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});}catch{throw Error('pg_restore could not inspect the archive. Install matching PostgreSQL client tools.');}
 const {list,skipped}=buildRestoreList(toc);
 await writeFile(join(dir,'restore.list'),list,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({prepared:true,skippedStorageMetadata:skipped,objects:verification.objects,databaseWritten:false}));
}
