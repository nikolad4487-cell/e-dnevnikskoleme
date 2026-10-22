import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function snapshotStorage(client,destination,{projectUrl}={}){
 await mkdir(join(destination,'objects'),{recursive:true,mode:0o700});
 const {data:buckets,error}=await client.storage.listBuckets();if(error)throw new Error('Storage bucket listing failed.');
 const manifest={version:1,projectUrl,createdAt:new Date().toISOString(),buckets,objects:[]};let total=0;
 for(const bucket of buckets){
  const walk=async(prefix,depth=0)=>{
   if(depth>30)throw new Error('Storage folder depth exceeds supported limit.');
   for(let offset=0;;offset+=100){const {data,error}=await client.storage.from(bucket.id).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw new Error('Storage object listing failed.');
    for(const item of data){if(!item.name||item.name.includes('/')||['.','..'].includes(item.name))throw new Error('Invalid storage object name.');const key=prefix?prefix+'/'+item.name:item.name;
     if(!item.id){await walk(key,depth+1);continue;}
     const {data:file,error:downloadError}=await client.storage.from(bucket.id).download(key);if(downloadError)throw new Error('Storage object download failed.');
     if(file.size>64*1024*1024)throw new Error('Storage object exceeds 64 MiB backup limit; configure a streaming backup before continuing.');total+=file.size;if(total>1024*1024*1024)throw new Error('Storage snapshot exceeds 1 GiB limit; configure a streaming backup.');
     const bytes=Buffer.from(await file.arrayBuffer()),hash=createHash('sha256').update(bytes).digest('hex'),name=createHash('sha256').update(bucket.id+'\0'+key).digest('hex');
     await writeFile(join(destination,'objects',name),bytes,{mode:0o600});manifest.objects.push({bucket:bucket.id,key,file:'objects/'+name,sha256:hash,size:bytes.length,contentType:item.metadata?.mimetype||file.type});
    }if(data.length<100)break;
   }
  };await walk('');
 }
 await writeFile(join(destination,'storage-manifest.json'),JSON.stringify(manifest),{mode:0o600});return manifest;
}
if(process.argv[1]?.endsWith('/storage.mjs')){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.argv[2])throw new Error('Supabase configuration and destination are required.');
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await snapshotStorage(client,process.argv[2],{projectUrl:process.env.SUPABASE_URL});console.log(JSON.stringify({storage_snapshot_complete:true,buckets:result.buckets.length,objects:result.objects.length}));
}
