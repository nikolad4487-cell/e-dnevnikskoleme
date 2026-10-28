// Real pg_dump/pg_restore rehearsal using synthetic data and a disposable,
// network-isolated PostgreSQL 17 container. Never connects to Supabase.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {snapshotStorage} from '../scripts/backup/storage.mjs';
import {sealSnapshot} from '../scripts/backup/manifest.mjs';
import {verifySnapshot} from '../scripts/backup/verify.mjs';
import {buildRestoreList} from '../scripts/backup/prepare-restore-list.mjs';
import {encryptBackup,decryptBackup} from '../scripts/backup/crypto.mjs';

const env={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
const docker=(args,input)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,input,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe'],timeout:60000});
const dir=await mkdtemp(join(tmpdir(),'school-real-restore-'));let container;
try{
 container=docker(['run','--detach','--rm','--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']).toString().trim();
 const deadline=Date.now()+30000;
 while(true){try{docker(['exec',container,'pg_isready','-U','postgres']);break;}catch(error){if(Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
 const sql=(query,database='postgres')=>docker(['exec','-i',container,'psql','-X','-U','postgres','--dbname',database,'--no-align','--tuples-only','--set','ON_ERROR_STOP=1'],query).toString().trim();
 sql("CREATE TABLE public.pupils(id int PRIMARY KEY,name text); INSERT INTO public.pupils VALUES(1,'Ogledna učenica Čić'); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY); CREATE TABLE storage.objects(id text PRIMARY KEY,bucket_id text,name text); INSERT INTO storage.buckets VALUES('absence-notes'); INSERT INTO storage.objects VALUES('source-object','absence-notes','note.pdf');");
 const dump=docker(['exec',container,'pg_dump','-U','postgres','--format=custom','--no-owner','--dbname=postgres']);
 const key=randomBytes(32).toString('hex'),recovered=decryptBackup(encryptBackup(dump,key),key);assert.deepEqual(recovered,dump);
 await writeFile(join(dir,'database.dump'),recovered);
 const pdf=Buffer.from('%PDF-1.4\nOgledni privatni dokument');
 await snapshotStorage({storage:{listBuckets:async()=>({data:[{id:'absence-notes',public:false}],error:null}),from:()=>({list:async()=>({data:[{id:'source-object',name:'note.pdf',metadata:{mimetype:'application/pdf'}}],error:null}),download:async()=>({data:new Blob([pdf]),error:null})})}},dir,{projectUrl:'https://synthetic.supabase.co'});
 await sealSnapshot(dir);assert.equal((await verifySnapshot(dir,{requireIntegrity:true})).databaseIntegrity,true);
 const toc=docker(['exec','-i',container,'pg_restore','--list'],recovered).toString(),plan=buildRestoreList(toc);
 assert.equal(plan.skipped,2);await writeFile(join(dir,'restore.list'),plan.list);
 docker(['cp',join(dir,'restore.list'),container+':/tmp/restore.list']);
 sql('CREATE DATABASE restored;');
 docker(['exec','-i',container,'pg_restore','-U','postgres','--dbname=restored','--clean','--if-exists','--exit-on-error','--single-transaction','--no-owner','--use-list=/tmp/restore.list'],recovered);
 assert.equal(sql('SELECT name FROM public.pupils WHERE id=1;','restored'),'Ogledna učenica Čić');
 assert.equal(sql('SELECT count(*) FROM storage.buckets;','restored'),'0');
 assert.equal(sql('SELECT count(*) FROM storage.objects;','restored'),'0');
 await writeFile(join(dir,'database.dump'),dump.subarray(0,dump.length-1));await assert.rejects(verifySnapshot(dir,{requireIntegrity:true}),/integrity/);
 console.log('PostgreSQL 17: real custom dump decrypted and restored; Croatian school data preserved; Storage metadata excluded; truncated dump rejected.');
}finally{
 if(container)docker(['rm','--force',container]);
 await rm(dir,{recursive:true,force:true});
}
