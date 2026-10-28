export function checkBackupConfiguration(env){
 const {DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,BACKUP_ENCRYPTION_KEY}=env;
 if(!DATABASE_URL||!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!BACKUP_ENCRYPTION_KEY)throw Error('Configure the four BACKUP secrets documented in docs/SIGURNOSNE-KOPIJE.md.');
 if(!/^[a-f0-9]{64}$/i.test(BACKUP_ENCRYPTION_KEY))throw Error('Backup encryption key must contain 64 hexadecimal characters.');
 let api,database;try{api=new URL(SUPABASE_URL);database=new URL(DATABASE_URL);}catch{throw Error('Invalid backup URL configuration.');}
 const ref=/^([a-z0-9]+)\.supabase\.co$/.exec(api.hostname)?.[1];
 if(!ref||api.protocol!=='https:'||api.username||api.password||api.port||api.pathname!=='/'||api.search||api.hash)throw Error('Use the native HTTPS Supabase project URL for backup.');
 if(!['postgres:','postgresql:'].includes(database.protocol)||!database.password||database.pathname!=='/postgres'||database.hash)throw Error('Use a password-authenticated PostgreSQL connection to the postgres database.');
 let user;try{user=decodeURIComponent(database.username);}catch{throw Error('Invalid database user encoding.');}
 const direct=database.hostname===`db.${ref}.supabase.co`&&user==='postgres';
 const pooler=database.hostname.endsWith('.pooler.supabase.com')&&user===`postgres.${ref}`;
 if(!direct&&!pooler)throw Error('Database and Storage must belong to the same Supabase project.');
 if(database.port&&database.port!=='5432')throw Error('Use direct or session-pooler port 5432, never transaction pooling.');
 // libpq URL query parameters can override host/user/port; reject overrides.
 const permitted=new Set(['sslmode','connect_timeout','application_name']);
 for(const key of database.searchParams.keys())if(!permitted.has(key)||database.searchParams.getAll(key).length!==1)throw Error('Unsupported or repeated PostgreSQL connection option.');
 if(!['require','verify-ca','verify-full'].includes(database.searchParams.get('sslmode')))throw Error('PostgreSQL backup connection must explicitly require TLS (sslmode=require or verify-full).');
 return {configured:true,sameProject:true,encrypted:true};
}
if(process.argv[1]?.endsWith('/preflight.mjs'))console.log(JSON.stringify(checkBackupConfiguration(process.env)));
