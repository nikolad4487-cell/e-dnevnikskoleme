const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomBytes}=require('node:crypto');
test('Encrypted backup restores PostgreSQL fixture and private documents, rejects corruption and incomplete snapshots',async()=>{
 const {encryptBackup,decryptBackup}=await import('../scripts/backup/crypto.mjs'),{snapshotStorage}=await import('../scripts/backup/storage.mjs'),{verifySnapshot}=await import('../scripts/backup/verify.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skolehr-restore-')),key=randomBytes(32).toString('hex'),db=new PGlite();let restored;
 try{
 await db.exec("CREATE TABLE pupils(id int PRIMARY KEY,name text);INSERT INTO pupils VALUES(1,'Ogledna učenica Čić');");
 const dumped=await db.dumpDataDir();const pgBytes=Buffer.from(await dumped.arrayBuffer());const decrypted=decryptBackup(encryptBackup(pgBytes,key),key);
 restored=new PGlite({loadDataDir:new Blob([decrypted])});assert.equal((await restored.query('SELECT name FROM pupils WHERE id=1')).rows[0].name,'Ogledna učenica Čić');
 const bytes=Buffer.from('%PDF-1.4\nOgledna privatna ispričnica'),client={storage:{listBuckets:async()=>({data:[{id:'absence-notes',public:false}],error:null}),from:()=>({list:async()=>({data:[{id:'file',name:'note.pdf',metadata:{mimetype:'application/pdf'}}],error:null}),download:async()=>({data:new Blob([bytes]),error:null})})}};
 const manifest=await snapshotStorage(client,dir,{projectUrl:'https://source.supabase.co'});await fs.writeFile(path.join(dir,'database.dump'),Buffer.from('PGDMPfixture'));
 assert((await verifySnapshot(dir)).verified);
 const {transformArchive}=await import('../scripts/backup/archive.mjs');await fs.writeFile(path.join(dir,'source'),bytes);await transformArchive('encrypt',path.join(dir,'source'),path.join(dir,'encrypted'),key);await transformArchive('decrypt',path.join(dir,'encrypted'),path.join(dir,'recovered'),key);assert.deepEqual(await fs.readFile(path.join(dir,'recovered')),bytes);await assert.rejects(transformArchive('decrypt',path.join(dir,'encrypted'),path.join(dir,'bad-output'),randomBytes(32).toString('hex')));await assert.rejects(fs.access(path.join(dir,'bad-output')));
 const {restoreStorage}=await import('../scripts/backup/restore-storage.mjs');const restoredObjects=new Map();let bucketPrivacy;
 const target={storage:{listBuckets:async()=>({data:[],error:null}),createBucket:async(_id,options)=>{bucketPrivacy=options.public;return {error:null}},from:()=>({upload:async(k,b)=>{restoredObjects.set(k,b);return {error:null}},download:async k=>({data:new Blob([restoredObjects.get(k)]),error:null})})}};
 await restoreStorage(target,dir,{targetUrl:'https://isolated.supabase.co',confirmProject:'isolated.supabase.co'});assert.equal(bucketPrivacy,false);assert.deepEqual(restoredObjects.get('note.pdf'),bytes);
 await assert.rejects(restoreStorage(target,dir,{targetUrl:'https://source.supabase.co',confirmProject:'source.supabase.co'}));
 const occupied={storage:{listBuckets:async()=>({data:[{id:'absence-notes'}],error:null}),from:()=>({list:async()=>({data:[{name:'existing.pdf'}],error:null})})}};await assert.rejects(restoreStorage(occupied,dir,{targetUrl:'https://isolated.supabase.co',confirmProject:'isolated.supabase.co'}));
 const copied=decryptBackup(encryptBackup(await fs.readFile(path.join(dir,manifest.objects[0].file)),key),key);assert.deepEqual(copied,bytes);
 const bad=encryptBackup(bytes,key);bad[bad.length-1]^=1;assert.throws(()=>decryptBackup(bad,key));assert.throws(()=>decryptBackup(encryptBackup(bytes,key),randomBytes(32).toString('hex')));
 await fs.writeFile(path.join(dir,manifest.objects[0].file),'corrupted');await assert.rejects(verifySnapshot(dir));
 await assert.rejects(snapshotStorage({storage:{listBuckets:async()=>({error:{message:'Denied'}})}},dir));
 }finally{await db.close();await restored?.close();await fs.rm(dir,{recursive:true,force:true});}
});
