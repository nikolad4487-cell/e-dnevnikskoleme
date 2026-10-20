export type AppPortal='staff'|'student'|'registrar';
export function resolvePortal(hostname:string,configured?:string):AppPortal{
 const host=hostname.toLowerCase();
 if(host==='referada.skolehr.xyz')return 'registrar';
 if(['ednevnik.skolehr.xyz','e-dnevnik.skolehr.xyz'].includes(host))return 'staff';
 if(['ocjene.skolehr.xyz','e-ocjene.skolehr.xyz'].includes(host))return 'student';
 return configured==='registrar'||configured==='student'?configured:'staff';
}
