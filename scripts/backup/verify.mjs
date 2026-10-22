import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep,join} from 'node:path';
export async function verifySnapshot(dir){
 const root=resolve(dir),manifest=JSON.parse(await readFile(join(root,'storage-manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.objects))throw new Error('Unsupported storage manifest.');
 const known=new Set();
 for(const o of manifest.objects){const path=resolve(root,o.file);if(!path.startsWith(root+sep)||!/^objects\/[a-f0-9]{64}$/.test(o.file)||known.has(o.bucket+'\0'+o.key))throw new Error('Invalid manifest object.');known.add(o.bucket+'\0'+o.key);
  const bytes=await readFile(path);if(bytes.length!==o.size||createHash('sha256').update(bytes).digest('hex')!==o.sha256)throw new Error('Private object integrity check failed.');
 }
 const handle=await open(join(root,'database.dump'),'r');const header=Buffer.alloc(5);try{const {bytesRead}=await handle.read(header,0,5,0);if(bytesRead!==5||!header.equals(Buffer.from('PGDMP')))throw new Error('PostgreSQL custom dump is missing or invalid.');}finally{await handle.close();}
 return {verified:true,objects:manifest.objects.length};
}
if(process.argv[1]?.endsWith('/verify.mjs'))console.log(JSON.stringify(await verifySnapshot(process.argv[2])));
