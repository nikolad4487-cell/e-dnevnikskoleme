const {test}=require('node:test'),assert=require('node:assert/strict');
test('Backup configuration binds PostgreSQL and private files to the same project without printing credentials',async()=>{
 const {checkBackupConfiguration:check}=await import('../scripts/backup/preflight.mjs');
 const config={DATABASE_URL:'postgresql://postgres:private-password@db.example.supabase.co:5432/postgres?sslmode=require',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-key',BACKUP_ENCRYPTION_KEY:'a'.repeat(64)};
 assert.deepEqual(check(config),{configured:true,sameProject:true,encrypted:true});
 assert(check({...config,DATABASE_URL:'postgresql://postgres.example:private-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full'}).configured);
 for(const changes of [
  {DATABASE_URL:config.DATABASE_URL.replace('db.example.','db.other.')},
  {DATABASE_URL:config.DATABASE_URL.replace(':5432',':6543')},
  {DATABASE_URL:config.DATABASE_URL.replace('sslmode=require','sslmode=disable')},
  {DATABASE_URL:config.DATABASE_URL+'&host=db.other.supabase.co'},
  {DATABASE_URL:config.DATABASE_URL+'&sslmode=disable'},
  {SUPABASE_URL:'http://example.supabase.co'},
  {BACKUP_ENCRYPTION_KEY:'wrong'}, {SUPABASE_SERVICE_ROLE_KEY:''},
  {DATABASE_URL:'postgresql://postgres.other:private-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'}
 ]){assert.throws(()=>check({...config,...changes}),error=>!error.message.includes('private-password')&&!error.message.includes('private-service-key'));}
});
