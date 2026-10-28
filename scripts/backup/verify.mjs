import {readFile,open,realpath} from 'node:fs/promises';
import {resolve,sep,join} from 'node:path';
import {hashFile} from './manifest.mjs';
export async function verifySnapshot(dir,{requireIntegrity=false}={}){
 const root=resolve(dir),manifest=JSON.parse(await readFile(join(root,'storage-manifest.json'),'utf8'));
 const actualRoot=await realpath(root);
 if(manifest.version!==1||!Array.isArray(manifest.objects)||!Array.isArray(manifest.buckets))throw new Error('Unsupported storage manifest.');
 let integrity;
 try{integrity=JSON.parse(await readFile(join(root,'snapshot-integrity.json'),'utf8'));}catch(error){if(error.code!=='ENOENT'||requireIntegrity)throw error;}
 if(integrity){
  if(integrity.version!==1||!integrity.files)throw Error('Invalid snapshot integrity manifest.');
  for(const name of ['database.dump','storage-manifest.json']){
   const expected=integrity.files[name],actual=await hashFile(join(root,name));
   if(!expected||actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('Database or Storage manifest integrity check failed.');
  }
 }
 const buckets=new Set();
 for(const b of manifest.buckets){if(!b||typeof b.id!=='string'||!b.id||buckets.has(b.id)||typeof b.public!=='boolean')throw Error('Invalid bucket manifest.');buckets.add(b.id);}
 const known=new Set();
 for(const o of manifest.objects){
  if(!o||typeof o.file!=='string'||typeof o.key!=='string'||!o.key||o.key.split('/').some(p=>!p||p==='.'||p==='..')||!buckets.has(o.bucket)||!Number.isSafeInteger(o.size)||o.size<0||!/^[a-f0-9]{64}$/.test(o.sha256))throw Error('Invalid manifest object.');
  const path=resolve(root,o.file);if(!path.startsWith(root+sep)||!/^objects\/[a-f0-9]{64}$/.test(o.file)||known.has(o.bucket+'\0'+o.key))throw new Error('Invalid manifest object.');known.add(o.bucket+'\0'+o.key);
  if(!(await realpath(path)).startsWith(actualRoot+sep))throw Error('Snapshot object escapes its directory.');
  const actual=await hashFile(path);if(actual.size!==o.size||actual.sha256!==o.sha256)throw new Error('Private object integrity check failed.');
 }
 const handle=await open(join(root,'database.dump'),'r');const header=Buffer.alloc(5);try{const {bytesRead}=await handle.read(header,0,5,0);if(bytesRead!==5||!header.equals(Buffer.from('PGDMP')))throw new Error('PostgreSQL custom dump is missing or invalid.');}finally{await handle.close();}
 return {verified:true,objects:manifest.objects.length,databaseIntegrity:!!integrity};
}
if(process.argv[1]?.endsWith('/verify.mjs'))console.log(JSON.stringify(await verifySnapshot(process.argv[2],{requireIntegrity:process.argv.includes('--require-integrity')})));
