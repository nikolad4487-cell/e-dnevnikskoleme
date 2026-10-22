import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const magic=Buffer.from('SKHRB01');
function keyBytes(key){if(!/^[a-f0-9]{64}$/i.test(key||''))throw new Error('BACKUP_ENCRYPTION_KEY must contain 64 hexadecimal characters.');return Buffer.from(key,'hex');}
export function encryptBackup(data,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);return Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]);}
export function decryptBackup(data,key){if(data.length<35||!data.subarray(0,7).equals(magic))throw new Error('Invalid backup format.');const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),data.subarray(7,19));decipher.setAuthTag(data.subarray(19,35));return Buffer.concat([decipher.update(data.subarray(35)),decipher.final()]);}
