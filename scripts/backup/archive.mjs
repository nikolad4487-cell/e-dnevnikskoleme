import {open,unlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
const magic=Buffer.from('SKHRB01');
export async function transformArchive(mode,input,output,key){
 if(!['encrypt','decrypt'].includes(mode)||!input||!output||input===output)throw new Error('Usage: archive.mjs encrypt|decrypt input output');
 if(!/^[a-f0-9]{64}$/i.test(key||''))throw new Error('BACKUP_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
 const source=await open(input,'r');let destination;
 try{
  const header=Buffer.alloc(35);let cipher,start;
  if(mode==='encrypt'){magic.copy(header);const iv=randomBytes(12);iv.copy(header,7);cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);start=0;}
  else{const {bytesRead}=await source.read(header,0,35,0);if(bytesRead!==35||!header.subarray(0,7).equals(magic))throw new Error('Invalid backup format.');cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),header.subarray(7,19));cipher.setAuthTag(header.subarray(19));start=35;}
  destination=await open(output,'wx',0o600);
  if(mode==='encrypt')await destination.write(header,0,35,0);
  await pipeline(createReadStream(input,{start}),cipher,createWriteStream(output,{flags:'r+',start:mode==='encrypt'?35:0}));
  if(mode==='encrypt')await destination.write(cipher.getAuthTag(),0,16,19);
 }catch(error){if(destination)await unlink(output).catch(()=>{});throw error;}finally{await source.close();await destination?.close();}
}
if(process.argv[1]?.endsWith('/archive.mjs')){await transformArchive(...process.argv.slice(2),process.env.BACKUP_ENCRYPTION_KEY);console.log(JSON.stringify({operation:process.argv[2],complete:true}));}
