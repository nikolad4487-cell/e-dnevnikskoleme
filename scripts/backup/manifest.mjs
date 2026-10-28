import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function hashFile(path){
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink())throw Error('Snapshot entries must be regular files.');
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return {size:info.size,sha256:hash.digest('hex')};
}

// Seal the database and Storage manifest together before encryption. A PGDMP
// header alone cannot detect a truncated or substituted database archive.
export async function sealSnapshot(directory){
 const manifest=JSON.parse(await readFile(join(directory,'storage-manifest.json'),'utf8'));
 if(manifest.version!==1)throw Error('Expected an unsealed Storage snapshot.');
 const integrity={version:1,createdAt:new Date().toISOString(),files:{}};
 for(const name of ['database.dump','storage-manifest.json'])integrity.files[name]=await hashFile(join(directory,name));
 await writeFile(join(directory,'snapshot-integrity.json'),JSON.stringify(integrity),{flag:'wx',mode:0o600});
 return integrity;
}
if(process.argv[1]?.endsWith('/manifest.mjs'))await sealSnapshot(process.argv[2]);
