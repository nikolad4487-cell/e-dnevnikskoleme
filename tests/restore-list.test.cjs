const {test}=require('node:test'),assert=require('node:assert/strict');
test('Restore plan skips all Storage data while preserving schema, school data and access rules',async()=>{
 const {buildRestoreList}=await import('../scripts/backup/prepare-restore-list.mjs');
 const header='; Archive created at 2026-10-28\n;     TOC Entries: 8\n';
 const entries=['1; 1259 100 TABLE storage buckets postgres','2; 0 100 TABLE DATA storage buckets postgres','3; 0 101 TABLE DATA storage objects postgres','4; 0 102 TABLE DATA storage s3_multipart_uploads postgres','5; 0 103 SEQUENCE SET storage counter postgres','6; 0 104 TABLE DATA public pupils postgres','7; 3256 105 POLICY storage objects object_read postgres','8; 0 0 ACL storage TABLE objects postgres'];
 const {list,skipped}=buildRestoreList(header+entries.join('\n'));assert.equal(skipped,4);
 const active=list.split('\n').filter(line=>line&&!line.startsWith(';'));
 assert.deepEqual(active,[entries[0],entries[5],entries[6],entries[7]]);
 await assert.rejects(async()=>buildRestoreList('not a dump'));
 assert.throws(()=>buildRestoreList(header+entries[5]),/No Storage/);
});
