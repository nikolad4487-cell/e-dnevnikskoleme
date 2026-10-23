import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export function activationSql(){const files=['migrations/20261022000000_school_workflows.sql','migrations/20261023000000_school_services.sql'];return '-- Jedna aktivacija: prethodni radni tijekovi + komunikacija i školske usluge.\nBEGIN;\n'+files.map(p=>readFileSync(new URL(p,root),'utf8').replace(/^(BEGIN;|COMMIT;)\s*$/gm,'')).join('\n')+'\nCOMMIT;\n';}
if(process.argv[1]===fileURLToPath(import.meta.url)){const file=new URL('docs/AKTIVACIJA-KOMUNIKACIJA-I-USLUGE.sql',root);if(process.argv.includes('--write'))writeFileSync(file,activationSql());else if(readFileSync(file,'utf8')!==activationSql())throw new Error('Regenerate the activation with --write.');}
