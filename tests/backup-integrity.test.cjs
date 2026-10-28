const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('Sealed snapshots detect database truncation, changed manifests and missing seals before restore',async()=>{
 const {sealSnapshot}=await import('../scripts/backup/manifest.mjs'),{verifySnapshot}=await import('../scripts/backup/verify.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'school-integrity-'));
 try{
  const manifest=JSON.stringify({version:1,projectUrl:'https://source.supabase.co',buckets:[],objects:[]}),dump=Buffer.from('PGDMPcomplete fixture');
  await fs.writeFile(path.join(dir,'storage-manifest.json'),manifest);await fs.writeFile(path.join(dir,'database.dump'),dump);
  assert.equal((await verifySnapshot(dir)).databaseIntegrity,false);
  await assert.rejects(verifySnapshot(dir,{requireIntegrity:true}));
  await sealSnapshot(dir);assert.equal((await verifySnapshot(dir,{requireIntegrity:true})).databaseIntegrity,true);
  await fs.writeFile(path.join(dir,'database.dump'),dump.subarray(0,8));await assert.rejects(verifySnapshot(dir),/integrity/);
  await fs.writeFile(path.join(dir,'database.dump'),dump);await fs.writeFile(path.join(dir,'storage-manifest.json'),manifest+' ');await assert.rejects(verifySnapshot(dir),/integrity/);
  await fs.writeFile(path.join(dir,'storage-manifest.json'),manifest);assert((await verifySnapshot(dir)).verified);
  await fs.rm(path.join(dir,'snapshot-integrity.json'));await fs.writeFile(path.join(dir,'storage-manifest.json'),JSON.stringify({version:1,buckets:[],objects:[{bucket:'unknown',key:'../escape',file:'objects/'+'a'.repeat(64),size:0,sha256:'a'.repeat(64)}]}));await assert.rejects(verifySnapshot(dir),/Invalid manifest/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
