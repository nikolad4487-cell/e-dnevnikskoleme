import {readFileSync,writeFileSync} from 'node:fs';
const files=['20261027000000_document_request_supplements.sql','20261027000001_durable_auxiliary_records.sql','20261027000002_system_readiness.sql','20261027000003_final_thesis_integrity.sql'];
export const activationSql=()=> '-- Aktivacija nakon prethodno aktiviranih školskih usluga.\nBEGIN;\n'+files.map(file=>readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').replace(/^(BEGIN;|COMMIT;)\s*$/gm,'')).join('\n')+'\nCOMMIT;\n';
if(process.argv.includes('--write'))writeFileSync(new URL('../docs/AKTIVACIJA-POUZDANOST-SUSTAVA.sql',import.meta.url),activationSql());
